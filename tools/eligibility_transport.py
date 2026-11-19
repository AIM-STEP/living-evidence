"""Lossless eligibility transport: compact opaque IDs and share identical in-flight work.

Source text, schemas, prompts, sampling and review rules are unchanged. In-flight
work remains scoped to its project, model, full input and source revisions.
Every response is restored to the caller's IDs before downstream validation.
"""
import copy
import hashlib
import json
import re
import threading
import eligibility_legacy_citations as legacy_citations

VERSION = 'eligibility-transport-v4'
_lock = threading.Lock()
_entries = {}
_fields = {'source_id': 'S', 'source_ids': 'S', 'question_id': 'Q', 'question_ids': 'Q', 'answer_question_id': 'Q', 'id': 'R'}


class IdentityError(ValueError):
    """An invalid routing identifier must never be accepted or reused."""


class OutputSyntaxError(ValueError):
    """An upstream chat reply contained unreadable model output."""


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
    if envelope['step'] == 'extract_elements' and isinstance(wire_schema, dict):
        questions = wire_schema.get('properties', {}).get('questions')
        expected = wire.get('payload', {}).get('question', {}).get('question_id')
        if isinstance(questions, dict) and expected:
            questions['minItems'] = questions['maxItems'] = 1
            questions['items']['properties']['question_id'] = {'type': 'string', 'enum': [expected]}
    wire_messages = [{**m, 'content': json.dumps(wire, ensure_ascii=False, separators=(',', ':'))}
                     if m.get('role') == 'user' else m for m in messages]
    # Revision is an optimistic-write guard, not a change to the model's task.
    # Source revisions, confirmed decisions and every payload field stay in key.
    cache_envelope = copy.deepcopy(wire)
    cache_envelope['base_revision'] = 0
    cache_messages = [{**m, 'content': json.dumps(cache_envelope, ensure_ascii=False, separators=(',', ':'))}
                      if m.get('role') == 'user' else m for m in messages]
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
