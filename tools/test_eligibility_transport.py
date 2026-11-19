import concurrent.futures
import copy
import json
import threading
import time
import unittest

import eligibility_transport as transport


class TransportTest(unittest.TestCase):
    def setUp(self):
        transport._entries.clear()
        self.calls = 0

    def messages(self, suffix='a', revision=1, text='Adults'):
        question = 'question_' + suffix * 32
        source = 'source_' + suffix * 32
        return [dict(role='system', content='Original rules'), dict(role='user', content=json.dumps(dict(
            step='extract_elements', project_id='same-project', base_revision=revision,
            payload=dict(question=dict(question_id=question, sources=[dict(source_id=source,
                question_ids=[question], revision=1, original_text=text)]))))) ]

    def invoke(self, messages):
        self.calls += 1
        envelope = json.loads(messages[-1]['content'])
        question = envelope['payload']['question']
        self.assertEqual(question['question_id'], 'Q1')
        self.assertEqual(question['sources'][0]['source_id'], 'S1')
        return dict(model='same-model', done_reason='stop', message=dict(content=json.dumps(dict(questions=[dict(
            question_id='Q1', elements=[dict(candidate_id='S1', source_refs=[dict(source_id='S1', quote='S1 is literal text')])],
            logic=dict(op='predicate', element_id='S1'))]))))

    def test_short_ids_are_restored_without_touching_text_or_candidate_ids(self):
        result = transport.chat(self.messages(), 'same-model', {}, self.invoke)
        question = json.loads(result['message']['content'])['questions'][0]
        self.assertEqual(question['question_id'], 'question_' + 'a' * 32)
        element = question['elements'][0]
        self.assertEqual(element['source_refs'][0]['source_id'], 'source_' + 'a' * 32)
        self.assertEqual(element['source_refs'][0]['quote'], 'S1 is literal text')
        self.assertEqual(element['candidate_id'], 'S1')
        self.assertEqual(question['logic']['element_id'], 'S1')

    def test_identical_project_work_does_not_retain_completed_replies(self):
        transport.chat(self.messages(), 'same-model', {}, self.invoke)
        result = transport.chat(self.messages('b', 9), 'same-model', {}, self.invoke)
        self.assertEqual(self.calls, 2)
        self.assertFalse(transport._entries)
        self.assertEqual(result['transport']['cache'], 'miss')
        self.assertEqual(json.loads(result['message']['content'])['questions'][0]['question_id'], 'question_' + 'b' * 32)
        transport.chat(self.messages('b', 9, 'Children'), 'same-model', {}, self.invoke)
        self.assertEqual(self.calls, 3, 'Changed sources must trigger fresh inference')

    def test_overlapping_identical_requests_share_inference(self):
        def invoke(messages):
            time.sleep(.02)
            return self.invoke(messages)
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            results = list(pool.map(lambda _: transport.chat(self.messages(), 'same-model', {}, invoke), range(3)))
        self.assertEqual(self.calls, 1)
        self.assertTrue(all('questions' in json.loads(r['message']['content']) for r in results))
        self.assertFalse(transport._entries)

    def test_failure_does_not_poison_retry(self):
        with self.assertRaises(ValueError):
            transport.chat(self.messages(), 'same-model', {}, lambda messages: dict(message=dict(content='bad JSON')))
        transport.chat(self.messages(), 'same-model', {}, self.invoke)
        self.assertEqual(self.calls, 1)

    def test_after_clear_identical_input_cannot_join_the_old_inflight_request(self):
        old_started, release_old = threading.Event(), threading.Event()
        def old_model(messages):
            old_started.set()
            release_old.wait(3)
            return self.invoke(messages)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            prior = pool.submit(transport.chat, self.messages(), 'same-model', {}, old_model)
            try:
                self.assertTrue(old_started.wait(1))
                after = self.messages()
                envelope = json.loads(after[-1]['content'])
                envelope['project_id'] = json.dumps(['eligibility', envelope['project_id'], 'new-epoch'])
                after[-1]['content'] = json.dumps(envelope)
                fresh = pool.submit(transport.chat, after, 'same-model', {}, self.invoke).result(1)
                self.assertEqual(fresh['transport']['cache'], 'miss')
            finally:
                release_old.set()
            prior.result(1)
        self.assertEqual(self.calls, 2)
        self.assertFalse(transport._entries)

    def test_projects_and_schemas_do_not_share_cached_work(self):
        transport.chat(self.messages(), 'same-model', {}, self.invoke)
        changed = copy.deepcopy(self.messages())
        body = json.loads(changed[-1]['content'])
        body['project_id'] = 'different-project'
        changed[-1]['content'] = json.dumps(body)
        transport.chat(changed, 'same-model', {}, self.invoke)
        transport.chat(self.messages(), 'same-model', {'type': 'object'}, self.invoke)
        self.assertEqual(self.calls, 3)

    def test_partial_review_field_keys_follow_the_shortened_candidate_id(self):
        identity = 'question_' + 'a' * 32 + '/c1'
        messages = [dict(role='system', content='Keep the same review rules'), dict(role='user', content=json.dumps(dict(
            step='review_normalization', project_id='p', payload=dict(items=[dict(id=identity)], review_fields={identity: ['scope_status']}))))]
        def invoke(wire):
            payload = json.loads(wire[-1]['content'])['payload']
            self.assertEqual(payload['items'][0]['id'], 'Q1/c1')
            self.assertEqual(payload['review_fields'], {'Q1/c1': ['scope_status']})
            return dict(message=dict(content='{"items":[{"id":"Q1/c1","scope_status":"restricted"}]}'))
        result = transport.chat(messages, 'same-model', {}, invoke)
        self.assertEqual(json.loads(result['message']['content'])['items'][0]['id'], identity)

    def test_question_constraint_is_compacted_with_the_payload_and_schema_is_not_mutated(self):
        canonical = 'question_' + 'a' * 32
        schema = {'type': 'object', 'properties': {'questions': {'type': 'array', 'items': {
            'type': 'object', 'properties': {'question_id': {'type': 'string', 'enum': [canonical]}}}}}}
        original = copy.deepcopy(schema)
        def generate(messages, wire_schema):
            questions = wire_schema['properties']['questions']
            self.assertEqual(questions['minItems'], 1)
            self.assertEqual(questions['maxItems'], 1)
            self.assertEqual(questions['items']['properties']['question_id']['enum'], ['Q1'])
            return self.invoke(messages)
        result = transport.chat(self.messages(), 'same-model', schema,
                                lambda messages: self.fail('The constrained schema must reach the model'),
                                invoke_with_schema=generate)
        self.assertEqual(schema, original)
        self.assertEqual(json.loads(result['message']['content'])['questions'][0]['question_id'], canonical)

    def test_unknown_missing_or_extra_question_ids_are_never_cached(self):
        for questions in [[{'question_id': 'Q2'}], [{}], [], [{'question_id': 'Q1'}, {'question_id': 'Q2'}]]:
            with self.subTest(questions=questions):
                transport._entries.clear()
                with self.assertRaises(transport.IdentityError):
                    transport.chat(self.messages(), 'same-model', {},
                                   lambda messages: dict(message=dict(content=json.dumps({'questions': questions}))))
                self.assertEqual(len(transport._entries), 0)
                result = transport.chat(self.messages(), 'same-model', {}, self.invoke)
                self.assertEqual(result['transport']['cache'], 'miss')


class ElementEncodingTest(unittest.TestCase):
    def setUp(self):
        self.source = 'source_' + 'a' * 32
        self.question = 'question_' + 'a' * 32
        self.sources = [{'source_id': self.source, 'revision': 3, 'original_text': 'Teachers or nurses.'}]
        required = ['candidate_id', 'dimension_id', 'normalized_text', 'structured_value', 'source_refs',
                    'semantic_role', 'information_status', 'scope_status', 'disposition']
        props = {name: {} for name in required}
        props['scope_conditions'] = {'type': 'array'}
        self.elements_schema = {'type': 'object', 'properties': props, 'required': required}
        self.schema = {'properties': {'questions': {'items': {'properties': {'question_id': {'type': 'string'},
                        'elements': {'items': self.elements_schema}}}}}}
        self.element = {'id': 'c1', 'dimension': 'population', 'text': 'Teachers', 'citations': [True], 'kind': 'include'}

    def call(self, elements, opt_in=True, encoding='compact-elements-v1', groups=None):
        payload = {'question': {'question_id': self.question, 'sources': self.sources}}
        if opt_in:
            payload['extraction_encoding'] = encoding
        if groups is not None:
            payload['source_passages'] = groups
        messages = [{'role': 'system', 'content': 'Preserve all original scope and source evidence.'}, {'role': 'user',
                    'content': json.dumps({'project_id': 'test', 'payload': payload, 'step': 'extract_elements'})}]
        def model(wire, schema):
            self.wire_fields = schema['properties']['questions']['items']['properties']['elements']['items']
            self.system = wire[0]['content']
            return {'message': {'content': json.dumps({'questions': [{'question_id': 'Q1', 'elements': elements}]})}}
        reply = transport.chat(messages, 'stub', self.schema, None, model, criteria_workflow=True)
        self.assertFalse(transport._entries)
        return json.loads(reply['message']['content'])['questions'][0]['elements']

    def test_single_source_elements_restore_values_classifications_and_exact_citations(self):
        exceptions = ['except during leave']
        row = dict(self.element, text='nurses', citations=[{'quote': 'nurses', 'start': 12, 'end': 18}],
                   kind={'info': 'ambiguous', 'role': 'undecided', 'scope': 'unspecified', 'side': None},
                   value={'operator': 'gte', 'value': 18, 'unit': 'year'}, scope_conditions=exceptions)
        first, second, focus, excluded = self.call([self.element, row, dict(self.element, kind='focus', citations=['Teachers']),
                                                    dict(self.element, kind='exclude')])
        self.assertEqual(first, {'candidate_id': 'c1', 'dimension_id': 'population', 'normalized_text': 'Teachers',
                                 'source_refs': [{'source_id': self.source, 'source_revision': 3, 'quote': 'Teachers'}],
                                 'semantic_role': 'eligibility_condition', 'information_status': 'explicit',
                                 'scope_status': 'restricted', 'disposition': 'include', 'structured_value': None})
        self.assertEqual(second['source_refs'], [{'source_id': self.source, 'source_revision': 3,
                                                  'quote': 'nurses', 'start': 12, 'end': 18}])
        self.assertEqual(second['structured_value'], row['value'])
        self.assertEqual((second['information_status'], second['semantic_role'], second['scope_conditions']),
                         ('ambiguous', 'undecided', exceptions))
        self.assertEqual((focus['semantic_role'], focus['disposition'], excluded['disposition']), ('review_focus', None, 'exclude'))
        self.assertIn('compact element format', self.system)
        self.assertIn('candidate_id', self.elements_schema['properties'], 'Caller schema is immutable.')

    def test_multi_source_and_multi_revision_require_original_reference_identity(self):
        for source, alias in [(self.source, 'S1'), ('source_' + 'b' * 32, 'S2')]:
            self.sources = self.sources[:1] + [{'source_id': source, 'revision': 4, 'original_text': 'Teachers or nurses.'}]
            canonical_ref = {'source_id': alias, 'source_revision': 4, 'quote': 'Teachers'}
            element, = self.call([dict(self.element, citations=[canonical_ref])])
            self.assertEqual(element['source_refs'], [dict(canonical_ref, source_id=source)])
            self.assertEqual(self.wire_fields['properties']['citations'], self.elements_schema['properties']['source_refs'])

    def test_old_clients_keep_the_original_schema_and_response(self):
        row = {'candidate_id': 'c1', 'normalized_text': 'Teachers'}
        self.assertEqual(self.call([row], opt_in=False), [row])
        self.assertEqual(self.wire_fields, self.elements_schema)
        self.assertNotIn('compact element format', self.system)

    def test_passages_are_resolved_before_normalization_from_only_current_unicode_excerpts(self):
        self.sources = [dict(source_id=self.source, revision=3, start_codepoint=10, original_text='👶 Include '),
                        dict(source_id=self.source, revision=3, start_codepoint=20, original_text='infants.')]
        group = dict(source_id=self.source, source_revision=3, spans=[[1, 12, 28, 'include'], [2, 5, 19, 'include']])
        row = dict(self.element, text='Eligible newborns', citations=[1])
        result, = self.call([row], encoding='compact-elements-v2', groups=[group])
        self.assertEqual(result['source_refs'], [dict(source_id=self.source, source_revision=3,
                                                      quote='Include infants.', start=12, end=28)])
        order = list(self.wire_fields['properties'])
        self.assertLess(order.index('citations'), order.index('text'))
        for citation in [True, 2, 3]:
            with self.subTest(citation=citation), self.assertRaises(transport.OutputSyntaxError):
                self.call([dict(row, citations=[citation])], encoding='compact-elements-v2', groups=[group])

    def test_wrong_revision_duplicate_passage_and_unquoted_legacy_paraphrase(self):
        with self.assertRaises(transport.OutputSyntaxError):
            self.call([dict(self.element, text='Other participants')])
        group = dict(source_id=self.source, source_revision=3, spans=[[1, 0, 8, 'population']])
        for groups in [[dict(group, source_revision=1)], [group, group]]:
            with self.subTest(groups=groups), self.assertRaises(transport.OutputSyntaxError):
                self.call([dict(self.element, citations=[1])], encoding='compact-elements-v2', groups=groups)

    def test_multi_source_passage_retains_source_identity_and_short_literal_citations(self):
        other = 'source_' + 'b' * 32
        self.sources.append(dict(source_id=other, revision=4, start_codepoint=0, original_text='Exclude infants.'))
        group = dict(source_id=other, source_revision=4, spans=[[1, 0, 16, 'exclude']])
        short = dict(source_id='S2', source_revision=4, quote='infants')
        row, = self.call([dict(self.element, citations=[1, short])], encoding='compact-elements-v2', groups=[group])
        self.assertEqual(row['source_refs'][0], dict(source_id=other, source_revision=4, start=0, end=16, quote='Exclude infants.'))
        self.assertEqual(row['source_refs'][1], dict(short, source_id=other))

    def test_malformed_classification_or_citation_cannot_supply_a_different_source(self):
        for invalid in [dict(kind='pending'), dict(kind={'scope': 'restricted'}), dict(semantic_role='review_focus'),
                        dict(citations=[False]), dict(citations=[{'source_id': 'invented', 'quote': 'Teachers'}])]:
            with self.subTest(invalid=invalid), self.assertRaises(transport.OutputSyntaxError):
                self.call([dict(self.element, **invalid)])
            self.assertFalse(transport._entries)


if __name__ == '__main__':
    unittest.main()
