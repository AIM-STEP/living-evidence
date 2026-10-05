import copy
import json
import unittest
from unittest.mock import patch
import typesafe_model as ts


def answer(selected, choices=('met', 'not_met', 'unclear')):
    return {'type':'choice', 'choice':selected, 'confidence':1,
            'probabilities':{c:float(c==selected) for c in choices}}


class TypeSafeTest(unittest.TestCase):
    def setUp(self):
        self.payload={'apiKey':'synthetic-key','model':'synthetic-model','input':{
            'record':{'title':'A synthetic study','abstract':'Participants were children. Treatment was randomized.'},
            'criteria':[{'dimension':'Population','inclusionRule':'Adults','exclusionRule':'Children'}],
            'question':'Synthetic test only','reviewerExamples':[]}}

    def run_screen(self, first='not_met', evidence='s1'):
        initial={'model':'synthetic-version','answers':{'c0':answer(first)},'usage':{'input_tokens':1}}
        def fake(path,key,body):
            self.assertEqual(path,'/systemone');self.assertEqual(key,'synthetic-key')
            self.assertNotIn('synthetic-key', json.dumps(body))
            if fake.calls==0:
                fake.calls+=1;return initial
            choices=body['questions']['c0']['criteria']
            self.assertEqual(choices['s1'],'Participants were children.')
            return {'answers':{'c0':answer(evidence,choices)}}
        fake.calls=0
        with patch.object(ts,'request',side_effect=fake):
            return ts.screen(self.payload)

    def test_exclusion_uses_exact_source_span(self):
        result=self.run_screen()
        self.assertEqual(result['value']['decision'],'exclude')
        self.assertEqual(result['value']['criteria'][0]['quote'],'Participants were children.')
        self.assertEqual(result['model'],'synthetic-version')
        self.assertNotIn('synthetic-key',json.dumps(result))

    def test_no_supporting_span_retains_record(self):
        result=self.run_screen(evidence='none')
        self.assertEqual(result['value']['decision'],'maybe')
        self.assertEqual(result['value']['criteria'][0]['judgment'],'unclear')

    def test_met_and_unclear(self):
        self.assertEqual(self.run_screen('met')['value']['decision'],'include')
        self.assertEqual(self.run_screen('unclear')['value']['decision'],'maybe')

    def test_explicit_title_evidence_can_exclude_without_abstract(self):
        self.payload['input']['record']['title']='Children only.'
        self.payload['input']['record']['abstract']=''
        replies=[{'answers':{'c0':answer('not_met')}}, {'answers':{'c0':answer('s0',('none','s0'))}}]
        with patch.object(ts,'request',side_effect=replies):
            self.assertEqual(ts.screen(self.payload)['value']['decision'],'exclude')

    def test_bad_choice_or_probability_never_becomes_decision(self):
        for bad in [{},answer('invented'),dict(answer('met'),confidence=float('nan')),
                    dict(answer('met'),probabilities={'met':1}),dict(answer('met'),probabilities={'met':.8,'not_met':.8,'unclear':.8})]:
            with self.subTest(bad=bad),patch.object(ts,'request',return_value={'answers':{'c0':bad}}):
                with self.assertRaises(ValueError):ts.screen(self.payload)

    def test_malformed_input_rejected_before_network(self):
        for change in [{'model':''},{'apiKey':'x\nInjected: y'},{'input':{'record':{},'criteria':[]}}]:
            with patch.object(ts,'request') as request:
                with self.assertRaises(ValueError):ts.screen(dict(self.payload,**change))
                request.assert_not_called()

    def test_model_discovery_deduplicates_and_requires_models(self):
        with patch.object(ts,'request',return_value={'models':[{'name':'one'},{'name':'one'},{'name':'two'}]}) as request:
            self.assertEqual(ts.models('key')['models'],['one','two'])
            request.assert_called_once_with('/models','key')
        with patch.object(ts,'request',return_value={'models':[]}):
            with self.assertRaises(ValueError):ts.models('key')

    def test_calibration_is_sent_to_judgment_and_evidence_requests(self):
        feedback = {'version':'reviewer-calibration-v1','hash':'synthetic-feedback',
                    'rules':[{'criterion':'Population','correction':'Children do not satisfy the adult population criterion.'}],
                    'examples':[]}
        self.payload['input']['reviewerCalibration'] = feedback
        seen = []
        def respond(path, key, body):
            seen.append(body)
            question = body['questions']['c0']
            return {'answers':{'c0':answer('not_met' if len(seen)==1 else 's1',question['criteria'])}}
        with patch.object(ts,'request',side_effect=respond):
            self.assertEqual(ts.screen(self.payload)['value']['decision'],'exclude')
        self.assertEqual(len(seen),2)
        for request in seen:
            self.assertEqual(request['state']['reviewerCalibration'], feedback)
            self.assertIn('reviewerCalibration',request['questions']['c0']['instructions'])
            self.assertNotIn('synthetic-key',json.dumps(request))

    def test_fixed_destination_and_bearer_auth(self):
        from unittest.mock import MagicMock
        response=MagicMock();response.__enter__.return_value.read.return_value=b'{"models":[]}'
        with patch.object(ts.urllib.request,'build_opener') as factory:
            factory.return_value.open.return_value=response
            ts.request('/models','synthetic-key')
            req=factory.return_value.open.call_args.args[0]
            self.assertEqual(req.full_url,'https://api.typesafe.ai/v1/models')
            self.assertEqual(req.get_header('Authorization'),'Bearer synthetic-key')
            self.assertIsNone(req.data)


if __name__=='__main__':unittest.main()
