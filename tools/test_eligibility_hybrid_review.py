import copy
import json
import unittest
from unittest.mock import patch

import eligibility_hybrid_review as hybrid


class HybridReviewTest(unittest.TestCase):
    def setUp(self):
        hybrid._jev_cache.clear()
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

    def run_review(self, response=None):
        with patch.object(hybrid.ts, 'server_config', return_value=dict(model='jev-test')), \
             patch.object(hybrid.ts, 'resolve_key', return_value='synthetic-key'), \
             patch.object(hybrid.ts, 'request', side_effect=response or self.response):
            result = hybrid.review(self.messages(), self.local, 'local-test')
        return json.loads(result['message']['content'])['items'], result['review']

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
            self.assertEqual(schema['properties']['items']['items']['required'], ['id', 'reason'])
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

    def test_unchanged_input_reuses_jev_decisions_and_partial_local_work(self):
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
        self.assertEqual(request.call_count, 1)
        self.assertEqual(len(local_calls), 1)
        self.assertEqual(first['message']['content'], second['message']['content'])
        self.assertEqual(second['review']['typesafe_cache'], 'hit')
        self.assertEqual(second['review']['local_transport']['cache'], 'hit')


if __name__ == '__main__':
    unittest.main()
