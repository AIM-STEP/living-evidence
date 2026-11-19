import hashlib
import json
import unittest
from unittest.mock import patch

import eligibility_legacy_citations as legacy
import eligibility_transport as transport


class LegacyCitationTest(unittest.TestCase):
    def setUp(self):
        self.source = 'source_' + 'a' * 32
        self.question = 'question_' + 'b' * 32
        self.text = '😀 Include adults. Exclude adults with asthma.'
        self.sources = [dict(source_id=self.source, revision=1, start_codepoint=0, original_text=self.text)]
        self.schema = {'properties': {'questions': {'items': {'properties': {}, 'required': [
            'question_id', 'framework_candidates', 'elements', 'issues', 'logic']}}}}
        self.calls = 0
        # Production uses exact SHA-256s of the four prompts from the affected browser builds.
        fingerprint = hashlib.sha256(b'synthetic retired prompt').hexdigest()
        fixture = patch.object(legacy, '_SYSTEM_DIGESTS', {fingerprint})
        fixture.start()
        self.addCleanup(fixture.stop)

    def extract(self, refs, prompt='synthetic retired prompt', *, criteria_workflow=True):
        payload = {'question': {'question_id': self.question, 'sources': self.sources}}
        messages = [{'role': 'system', 'content': prompt},
                    {'role': 'user', 'content': json.dumps({'step': 'extract_elements', 'payload': payload})}]
        def invoke(_):
            self.calls += 1
            result = {'questions': [{'question_id': 'Q1', 'elements': [{'candidate_id': 'c5', 'source_refs': [
                {'source_id': 'S1', 'source_revision': 1, **r} for r in refs]}]}]}
            return {'message': {'content': json.dumps(result)}}
        response = transport.chat(messages, 'test', self.schema, invoke, criteria_workflow=criteria_workflow)
        return json.loads(response['message']['content'])['questions'][0]['elements'][0]['source_refs']

    def test_unique_longer_reference_anchors_only_the_enclosed_occurrence(self):
        cut = self.text.index('asthma')
        self.sources = [dict(self.sources[0], original_text=self.text[:cut]),
                        dict(self.sources[0], start_codepoint=cut, original_text=self.text[cut:])]
        refs = self.extract([{'quote': 'adults'}, {'quote': 'adults with asthma'}])
        position = self.text.rindex('adults')
        self.assertEqual((refs[0]['start'], refs[0]['end'], refs[0]['source_id']),
                         (position, position + len('adults'), self.source))
        self.assertNotIn('start', refs[1])
        self.assertEqual(self.calls, 1)

    def test_already_valid_offsets_and_single_occurrences_pass_unchanged(self):
        refs = self.extract([{'quote': 'adults', 'start': self.text.index('adults')}, {'quote': 'asthma'}])
        self.assertNotIn('end', refs[0])
        self.assertNotIn('start', refs[1])

    def test_unresolved_repeats_stop_without_another_model_request(self):
        with self.assertRaises(legacy.ClientUpdateRequired):
            self.extract([{'quote': 'adults', 'start': 0}])
        self.assertEqual(self.calls, 1)

    def test_repeated_complete_directives_preserve_all_positions(self):
        for quote, punctuation in [('Include adults', '.'), ('排除儿童。', '')]:
            self.sources[0]['original_text'] = '😀. ' + (quote + punctuation + ' ') * 2
            refs = self.extract([{'quote': quote}])
            self.assertEqual([self.sources[0]['original_text'][r['start']:r['end']] for r in refs], [quote, quote])
            self.assertLess(refs[0]['end'], refs[1]['start'])
        self.sources[0]['original_text'] = 'Include adults. Include adults except during treatment.'
        with self.assertRaises(legacy.ClientUpdateRequired):
            self.extract([{'quote': 'Include adults'}])
        self.sources[0]['original_text'] = 'Include adults. Other populations: Include adults.'
        with self.assertRaises(legacy.ClientUpdateRequired):
            self.extract([{'quote': 'Include adults'}])

    def test_other_clients_and_wrong_versions_use_their_own_validators(self):
        self.assertNotIn('start', self.extract([{'quote': 'adults'}], prompt='new prompt')[0])
        self.assertNotIn('start', self.extract([{'quote': 'adults'}], criteria_workflow=False)[0])
        self.assertNotIn('start', self.extract([{'quote': 'adults', 'source_revision': 2}])[0])
        self.schema['properties']['questions']['items']['required'].append('review_topic')
        self.assertNotIn('start', self.extract([{'quote': 'adults'}])[0])
