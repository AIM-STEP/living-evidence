"""Compatibility for the source checker shipped from 56c2b2f through d25c921."""
import hashlib
import re


class ClientUpdateRequired(Exception):
    """An older tab cannot represent the unresolved citation safely."""


# Complete system messages from those releases, with the original single-part,
# multiple-part and correction instructions. The preceding release shared the
# base prompt but had a different required-field list in its response schema.
_SYSTEM_DIGESTS = {
    'e84ce40f8f255b91b7e80e430b6735f31150ae3156ce0b78d82742a18bb08bb0',
    '030725de61d4981cd0057f01c49c95412887d9aecea4be0b9b2672bcc752f013',
    '02f241c2d644d73b593b663a7ba12844d28827f734f4499a29049ef0e5bc313d',
    '0e255b97a008ba6593035f9c52746490d3beaa4619441aaf53cf42d7959a7a88',
}
_OLD_ERROR_END = (' has multiple matching passages. Supply the correct original offsets or quote '
                  'enough surrounding text to identify the intended occurrence.')


def applies(messages, schema, envelope):
    if envelope.get('step') != 'extract_elements' or not isinstance(envelope.get('payload'), dict):
        return False
    feedback = envelope['payload'].get('validation_feedback')
    if isinstance(feedback, dict) and feedback.get('code') == 'QUOTE_OFFSET_MISMATCH':
        message = feedback.get('message')
        if isinstance(message, str) and message.startswith('Candidate ') and message.endswith(_OLD_ERROR_END):
            raise ClientUpdateRequired()
    try:
        required = schema['properties']['questions']['items']['required']
    except (KeyError, TypeError):
        return False
    if required != ['question_id', 'framework_candidates', 'elements', 'issues', 'logic']:
        return False
    return any(hashlib.sha256(m['content'].encode()).hexdigest() in _SYSTEM_DIGESTS
               for m in messages if m['role'] == 'system')


def _ranges(sources):
    # Reconstruct only adjacent excerpts of the same revision shown to the model.
    spans = []
    for source in sources:
        key = source['source_id'], source['revision']
        start, text = source['start_codepoint'], source['original_text']
        if spans and spans[-1][0] == key and spans[-1][1] + len(spans[-1][2]) == start:
            spans[-1][2] += text
        else:
            spans.append([key, start, text])
    return spans


def _hits(ref, spans):
    quote = ref.get('quote')
    if not isinstance(quote, str) or not quote or type(ref.get('source_revision')) is not int:
        return []
    hits = []
    for key, start, text in spans:
        if key != (ref.get('source_id'), ref.get('source_revision')):
            continue
        at = text.find(quote)
        while at >= 0:
            hits.append((start + at, start + at + len(quote)))
            at = text.find(quote, at + 1)
    return hits


def _consecutive_directives(ref, hits, spans):
    quote = ref['quote']
    if not re.match(r'^(?:(?:include|exclude)\s+|纳入|排除)\S', quote, re.I) or '?' in quote or '？' in quote:
        return False
    key = ref['source_id'], ref['source_revision']
    for source, offset, text in spans:
        if source != key or hits[0][0] < offset or hits[-1][1] > offset + len(text):
            continue
        before, after = text[:hits[0][0] - offset], text[hits[-1][1] - offset:]
        if before.strip() and not re.search(r'[.。\r\n][ \t]*$', before):
            continue
        if not (quote.endswith(('.', '。')) or re.match(r'^[ \t]*[.。\r\n]', after)):
            continue
        # Each copy must be a whole directive, with only the sentence boundary
        # between it and the next. A later condition or heading breaks the sequence.
        gaps = (text[b - offset:a - offset] for (_, b), (a, _) in zip(hits, hits[1:]))
        if all(re.fullmatch(r'[.。\s]*', gap) and
               (quote.endswith(('.', '。')) or re.search(r'[.。\r\n]', gap)) for gap in gaps):
            return True
    return False


def locate_legacy_repeats(envelope, result):
    """Keep valid references. Add offsets only when an exact longer citation anchors them."""
    question = envelope['payload'].get('question')
    if not isinstance(question, dict) or not isinstance(question.get('sources'), list):
        return
    sources = question['sources']
    if not all(isinstance(s, dict) and isinstance(s.get('source_id'), str) and
               type(s.get('revision')) is int and type(s.get('start_codepoint')) is int and
               isinstance(s.get('original_text'), str) for s in sources):
        return
    spans = _ranges(sources)
    for q in result['questions']:
        elements = q.get('elements')
        if not isinstance(elements, list):
            continue
        for candidate in elements:
            refs = candidate.get('source_refs') if isinstance(candidate, dict) else None
            if not isinstance(refs, list) or not all(isinstance(r, dict) for r in refs):
                continue
            matches = [(r, _hits(r, spans)) for r in refs]
            prepared = []
            for ref, hits in matches:
                prepared.append(ref)
                if len(hits) < 2:
                    continue
                start, end = ref.get('start'), ref.get('end')
                valid_types = all(v is None or type(v) in (int, float) for v in (start, end))
                if valid_types and (start is not None or end is not None) and any(
                        (start is None or start == a) and (end is None or end == b) for a, b in hits):
                    continue
                anchors = [p[0] for r, p in matches if len(p) == 1 and r['source_id'] == ref['source_id']
                           and r['source_revision'] == ref['source_revision'] and len(r['quote']) > len(ref['quote'])]
                located = [(a, b) for a, b in hits if any(left <= a and b <= right for left, right in anchors)]
                if len(located) == 1:
                    ref['start'], ref['end'] = located[0]
                elif not located and _consecutive_directives(ref, hits, spans):
                    prepared[-1:] = [dict(ref, start=a, end=b) for a, b in hits]
                else:
                    raise ClientUpdateRequired()
            candidate['source_refs'] = prepared
