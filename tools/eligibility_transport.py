"""Lossless eligibility transport: compact opaque IDs and reuse exact work.

Source text, schemas, prompts, sampling and review rules are unchanged. Cached
work remains scoped to its project, model, full input and source revisions.
Every response is restored to the caller's IDs before downstream validation.
"""
import copy
import hashlib
import json
import re
import threading
import time
from collections import OrderedDict

VERSION = 'eligibility-transport-v2'
TTL = 300
MAX_ENTRIES = 32
_lock = threading.Lock()
_entries = OrderedDict()
_fields = {'source_id': 'S', 'source_ids': 'S', 'question_id': 'Q', 'question_ids': 'Q', 'answer_question_id': 'Q', 'id': 'R'}


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


def chat(messages, model, schema, invoke):
    users = [m for m in messages if m.get('role') == 'user']
    if len(users) != 1 or any(m.get('images') for m in messages):
        return invoke(messages)
    try:
        envelope = json.loads(users[0]['content'])
    except (TypeError, ValueError):
        return invoke(messages)
    if not isinstance(envelope, dict) or envelope.get('step') not in {'extract_elements', 'review_normalization', 'interpret_human_answer'}:
        return invoke(messages)

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
    wire_messages = [{**m, 'content': json.dumps(wire, ensure_ascii=False, separators=(',', ':'))}
                     if m.get('role') == 'user' else m for m in messages]
    # Revision is an optimistic-write guard, not a change to the model's task.
    # Source revisions, confirmed decisions and every payload field stay in key.
    cache_envelope = copy.deepcopy(wire)
    cache_envelope['base_revision'] = 0
    cache_messages = [{**m, 'content': json.dumps(cache_envelope, ensure_ascii=False, separators=(',', ':'))}
                      if m.get('role') == 'user' else m for m in messages]
    key = hashlib.sha256(json.dumps([envelope.get('project_id'), model, schema, cache_messages],
                                   ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    now = time.monotonic()
    with _lock:
        for stale in [k for k, v in _entries.items() if v['event'].is_set() and now - v['at'] > TTL]:
            _entries.pop(stale, None)
        entry = _entries.get(key)
        owner = entry is None
        if owner:
            # Never evict in-flight work: an overlapping caller joins it.
            for stale in list(_entries):
                if len(_entries) < MAX_ENTRIES:
                    break
                if _entries[stale]['event'].is_set():
                    _entries.pop(stale)
            entry = {'event': threading.Event(), 'at': now}
            _entries[key] = entry
        else:
            _entries.move_to_end(key)
        cache_status = 'miss' if owner else 'hit' if entry['event'].is_set() else 'shared'
    if owner:
        try:
            reply = invoke(wire_messages)
            raw = reply.get('message', {}).get('content', '').strip()
            entry['wire_prompt_sha256'] = hashlib.sha256(json.dumps(wire_messages, ensure_ascii=False).encode()).hexdigest()
            entry['wire_response_sha256'] = hashlib.sha256(raw.encode()).hexdigest()
            if raw.startswith('```'):
                raw = raw.strip('`').strip()
                if raw.startswith('json'):
                    raw = raw[4:].strip()
            result = json.loads(raw)
            entry['reply'], entry['result'] = reply, result
            entry['at'] = time.monotonic()
            # Failed/limited generations and structurally incomplete replies
            # are returned for normal validation, but are never reused.
            field = 'questions' if envelope['step'] == 'extract_elements' else 'answers' if envelope['step'] == 'interpret_human_answer' else 'items'
            reusable = isinstance(result, dict) and isinstance(result.get(field), list) and bool(result[field]) and reply.get('done_reason') != 'length'
            if not reusable:
                with _lock:
                    _entries.pop(key, None)
        except BaseException as error:
            entry['error'] = error
            with _lock:
                _entries.pop(key, None)
        finally:
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
    reply = copy.deepcopy(entry['reply'])
    reply['message']['content'] = json.dumps(restored, ensure_ascii=False, separators=(',', ':'))
    reply['transport'] = {'version': VERSION, 'cache': cache_status,
                          'identifiers': {g: dict(v) for g, v in reverse.items()},
                          'wire_prompt_sha256': entry['wire_prompt_sha256'],
                          'wire_response_sha256': entry['wire_response_sha256'],
                          'evaluation_tokens': reply.get('eval_count'),
                          'prompt_tokens': reply.get('prompt_eval_count')}
    return reply
