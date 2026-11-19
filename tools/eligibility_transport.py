"""Compact the model's wire representation and restore canonical eligibility records.

In-flight work is scoped to its project, model, input and source revisions.
Restored records receive the same provenance checks and independent review.
"""
import copy
import hashlib
import json
import re
import threading
import eligibility_legacy_citations as legacy_citations

VERSION = 'eligibility-transport-v7'
_lock = threading.Lock()
_entries = {}
_fields = {'source_id': 'S', 'source_ids': 'S', 'question_id': 'Q', 'question_ids': 'Q', 'answer_question_id': 'Q', 'id': 'R'}


class IdentityError(ValueError):
    """An invalid routing identifier must never be accepted or reused."""


class OutputSyntaxError(ValueError):
    """An upstream chat reply contained unreadable model output."""


_element_names = {'candidate_id': 'id', 'dimension_id': 'dimension', 'normalized_text': 'text',
                  'structured_value': 'value', 'source_refs': 'citations'}
_classification = ('semantic_role', 'information_status', 'scope_status', 'disposition')
_kind_names = dict(zip(_classification, ('role', 'info', 'scope', 'side')))
_kinds = {'include': ('eligibility_condition', 'explicit', 'restricted', 'include'),
          'exclude': ('eligibility_condition', 'explicit', 'restricted', 'exclude'),
          'focus': ('review_focus', 'explicit', 'unspecified', None)}


def _citation_index(sources, groups):
    """Resolve batch-local passage numbers only inside the supplied revision and excerpts."""
    ranges = {}
    for source in sources:
        text = source.get('original_text')
        start = source.get('start_codepoint', 0)
        if type(start) is not int or start < 0 or not isinstance(text, str):
            continue
        identity = (source['source_id'], source['revision'])
        spans = ranges.setdefault(identity, [])
        if spans and spans[-1][0] + len(spans[-1][1]) == start:
            offset, previous = spans[-1]
            spans[-1] = (offset, previous + text)
        else:
            spans.append((start, text))
    passages, seen = {}, set()
    for group in groups if isinstance(groups, list) else []:
        if not isinstance(group, dict) or not isinstance(group.get('spans'), list):
            continue
        source_id, revision = group.get('source_id'), group.get('source_revision')
        if not isinstance(source_id, str) or type(revision) is not int:
            continue
        for span in group['spans']:
            if not isinstance(span, list) or len(span) != 4:
                continue
            number, start, end, _kind = span
            if any(type(value) is not int for value in (number, start, end)) or number < 1 or end <= start:
                continue
            if number in seen:
                passages.pop(number, None)
                continue
            seen.add(number)
            for offset, text in ranges.get((source_id, revision), []):
                if offset <= start < end <= offset + len(text):
                    passages[number] = dict(source_id=source_id, source_revision=revision, start=start, end=end,
                                            quote=text[start-offset:end-offset])
                    break
    return ranges, passages


def _compact_elements(schema, sources, source_first=False, groups=None, copy_language=None):
    """Only compact the known extraction schema, leaving other client contracts intact."""
    try:
        elements = schema['properties']['questions']['items']['properties']['elements']
        item = elements['items']
        properties = item['properties']
        required = _element_names.keys() | set(_classification)
        if set(item['required']) != required or not required <= properties.keys():
            return None
        source_keys = {(s['source_id'], s['revision']) for s in sources}
        if not source_keys or not all(isinstance(s, str) and type(v) is int for s, v in source_keys):
            return None
    except (KeyError, TypeError):
        return None
    single = next(iter(source_keys)) if len(source_keys) == 1 else None
    # Source citations precede the normalized wording in the generation schema.
    order = ('candidate_id', 'source_refs', 'dimension_id', 'normalized_text')
    fields = {_element_names[name]: properties[name] for name in order}
    fields['kind'] = {'anyOf': [{'type': 'string', 'enum': list(_kinds)},
                                {'type': 'object', 'properties': {short: properties[name] for name, short in _kind_names.items()},
                                 'required': list(_kind_names.values()), 'additionalProperties': False}]}
    fields['value'] = properties['structured_value']
    fields.update({name: spec for name, spec in properties.items() if name not in required})
    instruction = (
        ' For the compact element format use id=candidate_id, dimension=dimension_id, text=normalized_text, '
        'citations=source_refs, value=structured_value (omit only if null). Omit empty optional fields. '
        'kind "include"/"exclude" designates an explicit, restricted eligibility_condition with that disposition. '
        'kind "focus" designates explicit review_focus, unspecified scope and null disposition. '
        'For every other combination, including ambiguous or missing elements, give all four original fields '
        'in the kind object as role=semantic_role, info=information_status, scope=scope_status, side=disposition.'
    )
    if single:
        ref = {'type': 'object', 'properties': {'quote': {'type': 'string'}, 'start': {'type': 'integer'},
                                                'end': {'type': 'integer'}},
               'required': ['quote', 'start', 'end'], 'additionalProperties': False}
        alternatives = [{'type': 'string'}, ref]
        if not source_first:
            alternatives.append({'enum': [True]})
        fields['citations'] = {'type': 'array', 'items': {'anyOf': alternatives}}
        instruction += (' This part has one source and revision. Each citation is an exact quote string. '
                        'To supply exact Unicode offsets use {quote,start,end}.')
    ranges, passages = _citation_index(sources, groups if source_first else [])
    if source_first:
        instruction += ' Select original citations first. Then write text as their standardized wording.'
        if passages:
            citations = fields['citations']
            fields['citations'] = dict(citations, items={'anyOf': [
                {'type': 'integer', 'enum': sorted(passages)}, citations.get('items', {'type': 'object'})]})
            instruction += (' A citation may be an integer passage number from source_passages, identifying the '
                            'entire original passage. Use an exact shorter quote for one arm, list item or qualifier.')
    elif single:
        instruction += ' The literal true copies text as a quote only for verbatim source wording.'
    if copy_language:
        fields['text'] = {'anyOf': [fields['text'], {'type': 'boolean', 'enum': [True]}]}
        instruction += (' For a single short exact field phrase already in the output language, use text:true '
                        'to reuse the cited words. Write text explicitly for translations, changes, comparisons, '
                        'full sentences, eligibility verbs, and/or lists, multiple citations, exceptions, and structured limits. '
                        'Copy a named arm only, without a with/against clause. Keep the exact source typography.')
    elements['items'] = {'type': 'object', 'properties': fields,
                         'required': ['id', 'citations', 'dimension', 'text', 'kind'], 'additionalProperties': False}
    return instruction, single, ranges, passages, source_first, copy_language


_wording_clause = re.compile(
    r'[;:!?。！？；：\n]|\.(?:\s|$)|\b(?:compar(?:e[ds]?|ing)|versus|vs|assess|evaluate|determine|'
    r'includ(?:e|ed)|exclud(?:e|ed)|whereas|unless|except|provided that|either|and|or)\b|'
    r'纳入|排除|比较|评估|除非|或者', re.I)
_arm_assignment = re.compile(r'\b(?:receiv(?:e|ed|ing)|assign(?:ed|ment)?|randomi[sz]ed|'
                             r'administer(?:ed|ing)|eligible|participants?|studies|trials?|with|against)\b|给予|分配|研究对象', re.I)


def _verbatim_wording(element, ranges, language):
    refs = element['source_refs']
    if len(refs) != 1 or not isinstance(refs[0], dict):
        raise OutputSyntaxError('Verbatim wording requires a single original citation.')
    ref = refs[0]
    quote = ref.get('quote')
    if (not isinstance(quote, str) or not quote.strip() or len(quote) > 160 or _wording_clause.search(quote)
            or element['structured_value'] is not None or element.get('scope_conditions') or element.get('exceptions')
            or element['information_status'] != 'explicit' or element['semantic_role'] != 'eligibility_condition'):
        raise OutputSyntaxError('Write the standardized wording explicitly for this condition.')
    if element['dimension_id'] in ('intervention', 'comparator') and _arm_assignment.search(quote):
        raise OutputSyntaxError('Write only the name of the assigned arm.')
    han = bool(re.search(r'[\u3400-\u9fff]', quote))
    if (language == 'en' and han) or (language == 'zh' and not han and re.search(r'[a-z]{2,}', quote)):
        raise OutputSyntaxError('Write the translated wording explicitly.')
    if not isinstance(ref.get('source_id'), str) or type(ref.get('source_revision')) is not int:
        raise OutputSyntaxError('Verbatim wording needs an identified source and revision.')
    spans = ranges.get((ref['source_id'], ref['source_revision']), [])
    start, end = ref.get('start'), ref.get('end')
    if start is None and end is None:
        # Keep existing provenance resolution for repetitions. No occurrence is chosen here.
        if any(quote in text for _, text in spans):
            return quote
    elif type(start) is int and type(end) is int:
        for offset, text in spans:
            if offset <= start < end <= offset + len(text) and text[start-offset:end-offset] == quote:
                return quote
    raise OutputSyntaxError('Verbatim wording did not match the cited original excerpt.')


def _restore_elements(result, single, ranges, passages, source_first, copy_language=None):
    aliases = {short: original for original, short in _element_names.items()}
    for q in result['questions']:
        for e in q['elements']:
            if not isinstance(e, dict) or not {'id', 'dimension', 'text', 'citations', 'kind'} <= e.keys():
                raise OutputSyntaxError('An extraction record is incomplete.')
            if (_element_names.keys() | set(_classification)) & e.keys():
                raise OutputSyntaxError('An extraction record has conflicting representations.')
            for short, name in aliases.items():
                if short in e:
                    e[name] = e.pop(short)
            e.setdefault('structured_value', None)
            kind = e.pop('kind')
            if isinstance(kind, str) and kind in _kinds:
                e.update(zip(_classification, _kinds[kind]))
            elif isinstance(kind, dict) and kind.keys() == set(_kind_names.values()):
                e.update({name: kind[short] for name, short in _kind_names.items()})
            else:
                raise OutputSyntaxError('The model omitted the eligibility classification.')
            if not isinstance(e['source_refs'], list):
                raise OutputSyntaxError('Invalid citation list.')
            for index, citation in enumerate(e['source_refs']):
                if source_first and type(citation) is int:
                    if citation not in passages:
                        raise OutputSyntaxError('Unknown passage in this source batch.')
                    e['source_refs'][index] = dict(passages[citation])
                    continue
                if citation is True:
                    text = e['normalized_text']
                    if source_first or not single or not isinstance(text, str) or not text or not any(
                            text in original for _, original in ranges.get(single, [])):
                        raise OutputSyntaxError('A citation must identify original source wording.')
                    citation = text
                if single:
                    if isinstance(citation, str):
                        citation = {'quote': citation}
                    elif not isinstance(citation, dict) or citation.keys() != {'quote', 'start', 'end'}:
                        raise OutputSyntaxError('Invalid single-source citation.')
                    e['source_refs'][index] = dict(citation, source_id=single[0], source_revision=single[1])
            if e['normalized_text'] is True and copy_language:
                e['normalized_text'] = _verbatim_wording(e, ranges, copy_language)
            elif not isinstance(e['normalized_text'], str):
                raise OutputSyntaxError('An extraction requires standardized wording.')


def _group(key, value):
    group = _fields.get(key)
    if not isinstance(value, str) or not group:
        return None
    if group == 'R':
        return group if value.startswith('question_') and '/' in value else None
    return group if re.match(r'^(?:source|question)_[A-Za-z0-9_-]{20,}$', value) else None


def _walk(value, transform, key=None):
    if isinstance(value, dict):
        return {(transform('id', k) if key == 'review_fields' else k): _walk(v, transform, k)
                for k, v in value.items()}
    if isinstance(value, list):
        return [_walk(v, transform, key) for v in value]
    return transform(key, value)


def chat(messages, model, schema, invoke, invoke_with_schema=None, *, criteria_workflow=False):
    users = [m for m in messages if m.get('role') == 'user']
    if len(users) != 1 or any(m.get('images') for m in messages):
        return invoke(messages)
    try:
        envelope = json.loads(users[0]['content'])
    except (TypeError, ValueError):
        return invoke(messages)
    if not isinstance(envelope, dict) or envelope.get('step') not in {'extract_elements', 'review_normalization', 'interpret_human_answer'}:
        return invoke(messages)
    legacy_checker = criteria_workflow and legacy_citations.applies(messages, schema, envelope)

    tables = {g: {} for g in ('S', 'Q', 'R')}
    reverse = {g: {} for g in tables}
    reserved = set()
    _walk(envelope, lambda key, value: reserved.add(value) if key in _fields and isinstance(value, str) else value)

    def compact(key, value):
        group = _group(key, value)
        if not group:
            return value
        if value not in tables[group]:
            if group == 'R':
                question, _, candidate = value.partition('/')
                # Preserve the visible link to the question's logic leaves.
                alias = compact('question_id', question) + '/' + candidate
            else:
                serial = len(tables[group]) + 1
                alias = group + str(serial)
                while alias in reserved or alias in reverse[group]:
                    serial += 1
                    alias = group + str(serial)
            tables[group][value] = alias
            reverse[group][alias] = value
        return tables[group][value]

    wire = _walk(envelope, compact)
    wire_schema = copy.deepcopy(schema)

    def compact_schema(node):
        if not isinstance(node, dict):
            return
        for field, child in node.get('properties', {}).items():
            if isinstance(child, dict) and field in _fields:
                if isinstance(child.get('enum'), list):
                    child['enum'] = [compact(field, value) for value in child['enum']]
                if 'const' in child:
                    child['const'] = compact(field, child['const'])
            compact_schema(child)
        for field in ('items', 'additionalProperties'):
            compact_schema(node.get(field))
        for field in ('anyOf', 'oneOf', 'allOf'):
            for child in node.get(field, []):
                compact_schema(child)

    compact_schema(wire_schema)
    element_format = None
    if envelope['step'] == 'extract_elements' and isinstance(wire_schema, dict):
        questions = wire_schema.get('properties', {}).get('questions')
        expected = wire.get('payload', {}).get('question', {}).get('question_id')
        if isinstance(questions, dict) and expected:
            questions['minItems'] = questions['maxItems'] = 1
            questions['items']['properties']['question_id'] = {'type': 'string', 'enum': [expected]}
        if (criteria_workflow and invoke_with_schema and expected and any(m.get('role') == 'system' for m in messages) and
                wire['payload'].get('extraction_encoding') in ('compact-elements-v1', 'compact-elements-v2', 'compact-elements-v3')):
            payload = wire['payload']
            encoding = payload['extraction_encoding']
            language = str(wire.get('output_language', '')).lower().split('-')[0]
            copy_language = language if encoding == 'compact-elements-v3' and language in ('en', 'zh') else None
            element_format = _compact_elements(wire_schema, payload['question'].get('sources', []),
                                               encoding != 'compact-elements-v1', payload.get('source_passages'), copy_language)
    wire_messages = [{**m, 'content': json.dumps(wire, ensure_ascii=False, separators=(',', ':'))}
                     if m.get('role') == 'user' else m for m in messages]
    if element_format:
        wire_messages = [dict(m, content=m['content'] + element_format[0]) if m.get('role') == 'system' else m
                         for m in wire_messages]
    # Revision is an optimistic-write guard, not a change to the model's task.
    # Source revisions, confirmed decisions and every payload field stay in key.
    cache_envelope = copy.deepcopy(wire)
    cache_envelope['base_revision'] = 0
    cache_messages = [{**m, 'content': json.dumps(cache_envelope, ensure_ascii=False, separators=(',', ':'))}
                      if m.get('role') == 'user' else m for m in wire_messages]
    key = hashlib.sha256(json.dumps([VERSION, envelope.get('project_id'), model, wire_schema, cache_messages],
                                   ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    with _lock:
        entry = _entries.get(key)
        owner = entry is None
        if owner:
            entry = {'event': threading.Event()}
            _entries[key] = entry
        cache_status = 'miss' if owner else 'shared'
    if owner:
        try:
            reply = invoke_with_schema(wire_messages, wire_schema) if invoke_with_schema else invoke(wire_messages)
            raw = reply.get('message', {}).get('content', '').strip()
            entry['wire_prompt_sha256'] = hashlib.sha256(json.dumps(wire_messages, ensure_ascii=False).encode()).hexdigest()
            entry['wire_response_sha256'] = hashlib.sha256(raw.encode()).hexdigest()
            if raw.startswith('```'):
                raw = raw.strip('`').strip()
                if raw.startswith('json'):
                    raw = raw[4:].strip()
            try:
                result = json.loads(raw)
            except json.JSONDecodeError as error:
                raise OutputSyntaxError('The model output could not be read.') from error
            if envelope['step'] == 'extract_elements':
                expected = wire.get('payload', {}).get('question', {}).get('question_id')
                questions = result.get('questions') if isinstance(result, dict) else None
                if expected and (not isinstance(questions, list) or len(questions) != 1
                                 or not isinstance(questions[0], dict) or questions[0].get('question_id') != expected):
                    raise IdentityError('The model response did not preserve the requested question identifier. No result was saved or cached.')
                if element_format:
                    if not isinstance(questions[0].get('elements'), list):
                        raise OutputSyntaxError('The model omitted the element list.')
                    _restore_elements(result, *element_format[1:])
            entry['reply'], entry['result'] = reply, result
        except BaseException as error:
            entry['error'] = error
        finally:
            # Existing waiters hold their own reference. Drop the service's
            # reference before waking them; the next request starts fresh.
            with _lock:
                _entries.pop(key, None)
                entry['event'].set()
    elif not entry['event'].wait(600):
        raise TimeoutError('The existing eligibility request did not finish in time.')
    if 'error' in entry:
        raise entry['error']

    def restore(key, value):
        group = _fields.get(key)
        if group and isinstance(value, str):
            return reverse[group].get(value, value)
        return value

    restored = _walk(entry['result'], restore)
    if legacy_checker:
        legacy_citations.locate_legacy_repeats(envelope, restored)
    reply = copy.deepcopy(entry['reply'])
    reply['message']['content'] = json.dumps(restored, ensure_ascii=False, separators=(',', ':'))
    reply['transport'] = {'version': VERSION, 'cache': cache_status,
                          'identifiers': {g: dict(v) for g, v in reverse.items()},
                          'wire_prompt_sha256': entry['wire_prompt_sha256'],
                          'wire_response_sha256': entry['wire_response_sha256'],
                          'evaluation_tokens': reply.get('eval_count'),
                          'prompt_tokens': reply.get('prompt_eval_count')}
    return reply
