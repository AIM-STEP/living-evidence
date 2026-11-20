import copy
import json
import unittest
from unittest.mock import patch

import eligibility_hybrid_review as hybrid


class HybridReviewTest(unittest.TestCase):
    def setUp(self):
        self.items = [dict(id='c%d' % i, question_id='q1', dimension_id='population',
                           normalized_text='Adults', structured_value=None,
                           information_status='explicit', semantic_role='eligibility_condition',
                           scope_status='restricted', disposition='include',
                           source_quotes=[dict(source_id='s1', source_revision=1, quote='Adults')])
                      for i in range(2)]
        self.local_ids = []

    def messages(self):
        return [dict(role='system', content='Preserve the original eligibility scope.'),
                dict(role='user', content=json.dumps(dict(step='review_normalization', payload=dict(
                    items=self.items, questions=[dict(question_id='q1', original_question='Adults', logic=None)]))))]

    def local(self, messages):
        items = json.loads(messages[-1]['content'])['payload']['items']
        self.local_ids.append([i['id'] for i in items])
        result = [dict(id=i['id'], status='supported', issue_type='none', reason='Local assessment',
                       **{k: i[k] for k in ('information_status', 'semantic_role', 'scope_status', 'disposition')})
                  for i in items]
        return dict(model='local-test', message=dict(content=json.dumps(dict(items=result))))

    def response(self, path, key, body, timeout):
        self.assertEqual(path, '/systemone')
        self.assertEqual(key, 'synthetic-key')
        self.assertEqual(timeout, 20)
        self.assertNotIn(key, json.dumps(body))
        answers = {}
        for name, question in body['questions'].items():
            index, field = name.split('_', 1)
            item = body['state']['items'][int(index[1:])]
            selected = 'supported' if field == 'status' else 'none' if field == 'issue_type' else item[field]
            selected = selected or 'none'
            answers[name] = dict(type='choice', choice=selected, confidence=1,
                                 probabilities={v: float(v == selected) for v in question['criteria']})
        return dict(model='jev-test', answers=answers, usage=dict(input_tokens=1))

    def run_review(self, response=None, partial_review=None):
        with patch.object(hybrid.ts, 'server_config', return_value=dict(model='jev-test')), \
             patch.object(hybrid.ts, 'resolve_key', return_value='synthetic-key'), \
             patch.object(hybrid.ts, 'request', side_effect=response or self.response):
            result = hybrid.review(self.messages(), self.local, 'local-test', partial_review=partial_review)
        return json.loads(result['message']['content'])['items'], result['review']

    def single_review(self, selections=None, outage=False):
        messages = self.messages()
        envelope = json.loads(messages[-1]['content'])
        envelope['payload']['review_policy'] = 'jev-once-v1'
        messages[-1]['content'] = json.dumps(envelope)

        def decide(path, key, body, timeout):
            self.assertEqual(path, '/systemone')
            if outage:
                raise TimeoutError('Synthetic unavailable Jev')
            self.assertEqual(list(body['questions']), list(selections))
            answers = {}
            for name, (choice, confidence) in selections.items():
                if choice is not None:
                    answers[name] = dict(type='choice', choice=choice, confidence=confidence, probabilities={
                        verdict: float(choice == verdict) for verdict in body['questions'][name]['criteria']})
            return dict(model='jev-test', answers=answers)
        with patch.object(hybrid.ts, 'server_config', return_value=dict(model='jev-test')), \
             patch.object(hybrid.ts, 'resolve_key', return_value='synthetic-key'), \
             patch.object(hybrid.ts, 'request', side_effect=decide) as remote:
            result = hybrid.review(messages, self.local, 'local-test')
        self.assertLessEqual(remote.call_count, 1)
        self.assertEqual(self.local_ids, [])
        self.assertEqual(result['review']['policy'], 'jev-once-v1')
        return json.loads(result['message']['content'])['items'], result['review']

    def test_one_jev_verdict_per_explicit_item_does_not_repeat_review(self):
        rows, audit = self.single_review(dict(c0=('supported', 1), c1=('wrong_field', 1)))
        self.assertEqual(audit['typesafe_checked'], 2)
        self.assertEqual([row['status'] for row in rows], ['supported', 'uncertain'])
        self.assertEqual(rows[1]['reviewer']['verdict'], 'wrong_field')

    def test_fresh_runs_send_identical_jev_context_and_return_current_ids(self):
        requests = []
        for suffix in ('first', 'second'):
            qid, source, candidate = ('question_' + suffix, 'source_' + suffix, 'candidate_' + suffix)
            identity = qid + '/' + candidate
            item = dict(self.items[0], id=identity, question_id=qid, source_quotes=[{
                'source_id': source, 'source_revision': 3, 'start': 12, 'end': 18, 'quote': 'Adults',
                'heading': {'source_id': source, 'quote': 'Eligibility'}}])
            question = dict(question_id=qid, original_question='Eligibility: Adults',
                            logic={'op': 'predicate', 'element_id': candidate})
            messages = self.messages()
            messages[-1]['content'] = json.dumps(dict(step='review_normalization', payload=dict(
                questions=[question], items=[item], review_policy='jev-once-v1')))
            with patch.object(hybrid.ts, 'server_config', return_value={'model': 'test'}), \
                 patch.object(hybrid.ts, 'resolve_key', return_value='test'), \
                 patch.object(hybrid.ts, 'request', return_value={'answers': {}}) as remote:
                reply = hybrid.review(messages, self.local, 'local-test')
            requests.append(remote.call_args.args[2])
            self.assertEqual(json.loads(reply['message']['content'])['items'][0]['id'], identity)
        self.assertEqual(requests[0], requests[1])
        state = requests[0]['state']
        question, item = state['questions'][0], state['items'][0]
        self.assertEqual(item['id'], question['question_id'] + '/' + question['logic']['element_id'])
        quote = item['source_quotes'][0]
        self.assertEqual(quote, {'source_id': 'S1', 'source_revision': 3, 'start': 12, 'end': 18,
                                 'quote': 'Adults', 'heading': {'source_id': 'S1', 'quote': 'Eligibility'}})

    def test_single_review_never_accepts_unchecked_or_low_confidence_items(self):
        rows, _ = self.single_review(dict(c0=('supported', .7), c1=(None, 0)))
        self.assertEqual([row['reviewer']['verdict'] for row in rows], ['low_confidence', 'unavailable'])
        rows, _ = self.single_review(dict(c0=('wrong_field', .7), c1=('wrong_field', .99)))
        self.assertEqual([row['reviewer']['verdict'] for row in rows], ['low_confidence', 'wrong_field'])
        self.assertEqual(rows[0]['reviewer']['original_verdict'], 'wrong_field')
        self.assertEqual(rows[0]['reviewer']['choice_probability'], 1)
        rows, _ = self.single_review(outage=True)
        self.assertTrue(all(row['status'] == 'uncertain' and row['reviewer']['verdict'] == 'unavailable' for row in rows))
        self.items[1]['source_occurrence_pending'] = True
        rows, _ = self.single_review(dict(c0=('supported', 1)))
        self.assertEqual(rows[1]['reviewer']['verdict'], 'ambiguous')

    def test_confident_agreement_avoids_local_review_and_keeps_metadata(self):
        before = copy.deepcopy(self.items)
        items, audit = self.run_review()
        self.assertEqual(self.local_ids, [])
        self.assertEqual([i['id'] for i in items], ['c0', 'c1'])
        self.assertEqual(audit['typesafe_accepted'], 2)
        for original, reviewed in zip(before, items):
            for field in ('information_status', 'semantic_role', 'scope_status', 'disposition'):
                self.assertEqual(original[field], reviewed[field])
            self.assertEqual(reviewed['reviewer']['provider'], 'typesafe')
        self.assertEqual(self.items, before)

    def test_only_disagreements_return_to_local_and_order_is_retained(self):
        def disagree(*args, **kwargs):
            result = self.response(*args, **kwargs)
            answer = result['answers']['c0_status']
            answer['choice'] = 'contradicted'
            answer['probabilities'] = {v: float(v == 'contradicted') for v in hybrid.CHOICES['status']}
            return result
        items, audit = self.run_review(disagree)
        self.assertEqual(self.local_ids, [['c0']])
        self.assertEqual([i['id'] for i in items], ['c0', 'c1'])
        self.assertEqual(items[0]['reason'], 'Local assessment')
        self.assertEqual(audit['local_reviewed'], 1)

    def test_low_confidence_is_not_accepted(self):
        def low(*args, **kwargs):
            result = self.response(*args, **kwargs)
            result['answers']['c1_semantic_role']['confidence'] = .94
            return result
        _, audit = self.run_review(low)
        self.assertEqual(self.local_ids, [['c1']])
        self.assertEqual(audit['typesafe_accepted'], 1)

    def test_network_and_malformed_answers_keep_the_local_review(self):
        for result in [TimeoutError('Synthetic network failure'), dict(answers={}), dict(answers='invalid')]:
            with self.subTest(result=type(result).__name__):
                self.local_ids = []
                def broken(*args, **kwargs):
                    if isinstance(result, Exception):
                        raise result
                    return result
                _, audit = self.run_review(broken)
                self.assertEqual(self.local_ids, [['c0', 'c1']])
                self.assertEqual(audit['typesafe_accepted'], 0)

    def test_missing_or_malformed_known_answers_only_require_their_own_fields(self):
        for damage in ('missing', 'invalid_choice', 'invalid_probabilities'):
            with self.subTest(damage=damage):
                self.local_ids = []
                def damaged(*args, **kwargs):
                    result = self.response(*args, **kwargs)
                    answers = result['answers']
                    if damage == 'missing':
                        del answers['c1_status']
                    elif damage == 'invalid_choice':
                        answers['c1_status']['choice'] = ['supported']
                    else:
                        answers['c1_status']['probabilities'] = {}
                    return result

                def partial(messages, schema):
                    payload = json.loads(messages[-1]['content'])['payload']
                    self.local_ids.append([item['id'] for item in payload['items']])
                    self.assertEqual(payload['review_fields'], {'c1': ['status']})
                    self.assertEqual(schema['properties']['items']['items']['required'], ['id', 'reason', 'status'])
                    row = dict(id='c1', reason='Source checked locally.', status='supported')
                    return dict(message=dict(content=json.dumps({'items': [row]})))

                rows, audit = self.run_review(damaged, partial)
                self.assertEqual(self.local_ids, [['c1']])
                self.assertEqual([row['id'] for row in rows], ['c0', 'c1'])
                self.assertEqual(audit['typesafe_accepted'], 1)
                self.assertEqual(audit['typesafe_fields_used'], 11)
                self.assertEqual(rows[1]['reviewer']['field_providers']['status'], 'local')

    def test_all_answers_missing_for_one_item_or_foreign_id_in_response(self):
        for foreign in (False, True):
            with self.subTest(foreign=foreign):
                self.local_ids = []
                def damaged(*args, **kwargs):
                    result = self.response(*args, **kwargs)
                    result['answers'] = {k:v for k,v in result['answers'].items() if k.startswith('c0_')}
                    if foreign:
                        result['answers']['foreign_status'] = result['answers']['c0_status']
                    return result

                _, audit = self.run_review(damaged)
                self.assertEqual(self.local_ids, [['c0', 'c1'] if foreign else ['c1']])
                self.assertEqual(audit['typesafe_accepted'], 0 if foreign else 1)

    def test_ambiguous_sources_always_receive_local_review(self):
        for item in self.items:
            item['information_status'] = 'ambiguous'
        with patch.object(hybrid.ts, 'request') as request:
            result = hybrid.review(self.messages(), self.local, 'local-test')
        request.assert_not_called()
        self.assertEqual(self.local_ids, [['c0', 'c1']])
        self.assertEqual(result['review']['local_reviewed'], 2)

    def test_missing_local_assessment_cannot_silently_pass(self):
        self.items[0]['information_status'] = 'ambiguous'
        self.local = lambda messages: dict(message=dict(content='{"items":[]}'))
        with self.assertRaises(ValueError):
            self.run_review()

    def test_local_only_generates_fields_not_already_verified_by_jev(self):
        def uncertain_field(*args, **kwargs):
            result = self.response(*args, **kwargs)
            result['answers']['c1_information_status']['confidence'] = .6
            return result

        requested = []
        def partial(messages, schema):
            payload = json.loads(messages[-1]['content'])['payload']
            requested.append(payload['review_fields'])
            array = schema['properties']['items']
            self.assertEqual(array['items']['required'], ['id', 'reason', 'information_status'])
            self.assertEqual(array['items']['properties']['id']['enum'], ['c1'])
            self.assertEqual((array['minItems'], array['maxItems']), (1, 1))
            return dict(model='local-test', message=dict(content=json.dumps(dict(items=[
                dict(id='c1', information_status='explicit', reason='Original wording explicitly states the condition.')]))))

        with patch.object(hybrid.ts, 'server_config', return_value=dict(model='jev-test')), \
             patch.object(hybrid.ts, 'resolve_key', return_value='synthetic-key'), \
             patch.object(hybrid.ts, 'request', side_effect=uncertain_field):
            result = hybrid.review(self.messages(), self.local, 'local-test', partial_review=partial)
        self.assertEqual(requested, [{'c1': ['information_status']}])
        items = json.loads(result['message']['content'])['items']
        self.assertEqual(items[1]['semantic_role'], 'eligibility_condition')
        self.assertEqual(items[1]['reviewer']['field_providers']['information_status'], 'local')
        self.assertEqual(items[1]['reviewer']['field_providers']['status'], 'typesafe')
        self.assertEqual(result['review']['typesafe_fields_used'], 11)
        self.assertEqual(self.local_ids, [])

    def test_incomplete_row_retries_only_its_id_and_keeps_other_local_and_jev_assessments(self):
        self.items.append({**self.items[1], 'id': 'c2'})
        self.items[1]['information_status'] = self.items[2]['information_status'] = 'ambiguous'
        attempts = []

        def partial(messages, schema):
            response = self.local(messages)
            rows = json.loads(response['message']['content'])['items']
            attempts.append(schema['properties']['items']['items']['properties']['id']['enum'])
            if len(attempts) == 1:
                del rows[1]['scope_status']
            response['message']['content'] = json.dumps({'items': rows})
            return response

        with patch.object(hybrid.ts, 'server_config', return_value={'model': 'jev-test'}), \
             patch.object(hybrid.ts, 'resolve_key', return_value='synthetic-key'), \
             patch.object(hybrid.ts, 'request', side_effect=self.response) as jev:
            result = hybrid.review(self.messages(), self.local, 'local-test', partial_review=partial)
        jev.assert_called_once()
        self.assertEqual(self.local_ids, [['c1', 'c2'], ['c2']])
        self.assertEqual(attempts, self.local_ids)
        self.assertEqual(result['review']['local_retried_items'], 1)
        rows = json.loads(result['message']['content'])['items']
        self.assertEqual([row['id'] for row in rows], ['c0', 'c1', 'c2'])
        self.assertEqual([row['reviewer']['provider'] for row in rows], ['typesafe', 'local', 'local'])

    def test_duplicate_wrong_id_or_invalid_fields_fail_after_one_targeted_retry(self):
        for item in self.items:
            item['information_status'] = 'ambiguous'
        for invalid in ['duplicate', 'other_id', 'invalid_value', 'invalid_null']:
            with self.subTest(invalid=invalid):
                self.local_ids = []

                def broken(messages):
                    response = self.local(messages)
                    rows = json.loads(response['message']['content'])['items']
                    if invalid == 'duplicate':
                        rows.append(rows[-1])
                    elif invalid == 'other_id':
                        rows[-1]['id'] = 'unknown'
                    elif invalid == 'invalid_value':
                        rows[-1]['status'] = []
                    else:
                        rows[-1]['disposition'] = 'none'
                    response['message']['content'] = json.dumps({'items': rows})
                    return response

                with self.assertRaises(hybrid.ReviewOutputError):
                    hybrid.review(self.messages(), broken, 'local-test')
                self.assertEqual(self.local_ids, [['c0', 'c1'], ['c1']])

    def test_local_transport_failure_does_not_replay_generation(self):
        for item in self.items:
            item['information_status'] = 'ambiguous'
        with patch.object(self, 'local', side_effect=TimeoutError) as local:
            with self.assertRaises(TimeoutError):
                hybrid.review(self.messages(), local, 'local-test')
            local.assert_called_once()

    def test_unchanged_input_starts_fresh_after_a_completed_review(self):
        import eligibility_transport as transport
        transport._entries.clear()
        local_calls = []

        def uncertain_field(*args, **kwargs):
            result = self.response(*args, **kwargs)
            result['answers']['c1_information_status']['confidence'] = .6
            return result

        def generate(messages):
            local_calls.append(1)
            return dict(message=dict(content='{"items":[{"id":"c1","information_status":"explicit","reason":"Source-supported condition."}]}'))

        def partial(messages, schema):
            return transport.chat(messages, 'local-test', schema, generate)

        with patch.object(hybrid.ts, 'server_config', return_value=dict(model='jev-test')), \
             patch.object(hybrid.ts, 'resolve_key', return_value='synthetic-key'), \
             patch.object(hybrid.ts, 'request', side_effect=uncertain_field) as request:
            first = hybrid.review(self.messages(), self.local, 'local-test', partial_review=partial)
            second = hybrid.review(self.messages(), self.local, 'local-test', partial_review=partial)
        self.assertEqual(request.call_count, 2)
        self.assertEqual(len(local_calls), 2)
        self.assertEqual(first['message']['content'], second['message']['content'])
        self.assertEqual(second['review']['typesafe_cache'], 'disabled')
        self.assertEqual(second['review']['local_transport']['cache'], 'miss')
        self.assertFalse(transport._entries)


if __name__ == '__main__':
    unittest.main()
