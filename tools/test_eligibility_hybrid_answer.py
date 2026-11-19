import copy
import json
import unittest
from unittest.mock import Mock, patch

import eligibility_hybrid_answer as hybrid


class HumanAnswerTest(unittest.TestCase):
    def setUp(self):
        self.issue = {'issue_id': 'current', 'status': 'open', 'reason_code': 'UNCLEAR_LOGIC',
                      'question_text': 'How should the two groups be combined?', 'element_ids': ['e'],
                      'options': [{'option_id': 'any', 'label': 'Any one group', 'logic_op': 'any_of'},
                                  {'option_id': 'all', 'label': 'All groups', 'logic_op': 'all_of'}]}
        self.payload = {'answer_text': '  Either group is sufficient.  ', 'issues': [self.issue],
                        'elements': [{'element_id': 'e', 'dimension_id': 'population', 'normalized_text': 'Participants'},
                                     {'element_id': 'other', 'normalized_text': 'Never send unrelated text'}],
                        'prior_decisions': ['Private prior answer']}
        self.local = Mock(return_value={'model': 'local'})
        self.choice, self.scope, self.score = 'option_0', 'complete', .995
        self.request = self.enterContext(patch.object(hybrid.ts, 'request', side_effect=self.reply))
        self.enterContext(patch.object(hybrid.ts, 'server_config', return_value={'model': 'jev'}))
        self.enterContext(patch.object(hybrid.ts, 'resolve_key', return_value='test-key'))

    def reply(self, path, key, body, timeout):
        self.assertEqual((path, key, timeout), ('/systemone', 'test-key', hybrid.TIMEOUT))
        self.assertNotIn('Never send unrelated text', json.dumps(body))
        self.assertNotIn('Private prior answer', json.dumps(body))
        self.assertNotIn(self.issue['options'][0]['label'], json.dumps(body['questions']))

        def answer(field, choice):
            keys = body['questions'][field]['criteria']
            probs = {k: self.score if k == choice else (1 - self.score) / (len(keys) - 1) for k in keys}
            return {'type': 'choice', 'choice': choice, 'confidence': .998, 'probabilities': probs}

        return {'answers': {'selection': answer('selection', self.choice), 'scope': answer('scope', self.scope)}, 'model': 'jev'}

    def interpret(self, payload=None):
        messages = [{'role': 'system', 'content': 'Interpret according to the existing rules.'},
                    {'role': 'user', 'content': json.dumps({'step': 'interpret_human_answer', 'payload': payload or self.payload})}]
        result = hybrid.interpret(messages, self.local)
        if result == self.local.return_value:
            self.local.assert_called_with(messages)
        return result

    def test_stored_option_retains_original_and_never_starts_local_model(self):
        result = self.interpret()
        self.assertEqual(json.loads(result['message']['content']), {'answers': [
            {'issue_ids': ['current'], 'answer_text': self.payload['answer_text'], 'option_id': 'any'}]})
        self.assertEqual(result['review']['route'], 'stored_option')
        self.assertEqual(result['provider'], 'typesafe')
        self.request.assert_called_once()
        self.local.assert_not_called()

    def test_low_probability_uncertain_extra_scope_or_other_fall_back(self):
        for selection, scope, score in [('option_1', 'complete', .92), ('option_0', 'unresolved', .999), ('other', 'complete', .999)]:
            with self.subTest(selection=selection, scope=scope, score=score):
                self.choice, self.scope, self.score = selection, scope, score
                self.assertEqual(self.interpret(), self.local.return_value)
        self.assertEqual(self.local.call_count, 3)

    def test_click_on_interpretive_option_and_non_executable_actions(self):
        option = {'option_id': 'new', 'label': 'Use study definitions', 'requires_interpretation': True}
        self.issue['options'].append(option)
        self.payload['answer_text'] = option['label']
        self.assertEqual(self.interpret(), self.local.return_value)
        self.request.assert_not_called()
        self.payload['answer_text'] = 'Study definitions are sufficient'
        self.choice = 'option_2'
        self.assertEqual(self.interpret(), self.local.return_value)
        self.request.assert_called_once()

    def test_complex_or_unmatched_requests_immediately_use_local(self):
        for text in ['≥65 years', '至少六十五岁', 'Use either, except in intensive care', 'Both if malnourished',
                     'Only one group and exclude outpatients', 'Not together', '暂缓这个决定', 'Yes', 'Change the earlier decision']:
            self.payload['answer_text'] = text
            self.assertEqual(self.interpret(), self.local.return_value)
        self.payload['answer_text'] = 'Either group'
        for variant in [dict(validation_feedback={'code': 'prior failure'}), dict(selected_option_id='any'), dict(issues=[]),
                        dict(issues=[self.issue, self.issue]),
                        dict(issues=[{**self.issue, 'reason_code': 'CONFLICTING_REQUIREMENTS'}]),
                        dict(issues=[{**self.issue, 'options': [{'option_id': 'replace', 'label': 'Replace a choice', 'explicit_revision': True}]}]),
                        dict(issues=[{**self.issue, 'options': [{**o, 'label': 'Same choice'} for o in self.issue['options']]}])]:
            self.assertEqual(self.interpret({**self.payload, **variant}), self.local.return_value)
        self.request.assert_not_called()

    def test_provider_failure_or_malformed_reply_falls_back_once(self):
        for failure in (TimeoutError(), ValueError(), {'answers': {}}, {'answers': {'selection': [], 'scope': []}}):
            with self.subTest(failure=repr(failure)):
                self.request.side_effect = failure if isinstance(failure, Exception) else None
                self.request.return_value = failure
                self.assertEqual(self.interpret(), self.local.return_value)
        self.assertEqual(self.local.call_count, 4)

    def test_valid_role_effect_must_target_the_selected_issue(self):
        option = {'option_id': 'focus', 'label': 'Record only as an outcome of interest',
                  'updates': [{'element_id': 'e', 'semantic_role': 'review_focus'}]}
        self.issue['options'] = [option]
        self.assertEqual(self.interpret()['provider'], 'typesafe')
        invalid = copy.deepcopy(option)
        invalid['updates'][0]['element_id'] = 'other'
        self.issue['options'] = [invalid]
        self.assertEqual(self.interpret(), self.local.return_value)
        self.assertEqual(self.request.call_count, 1)


if __name__ == '__main__':
    unittest.main()
