import json
import socket
import unittest
from unittest.mock import patch
import fulltext_sources as ft
import typesafe_model as tm


class RetrievalTests(unittest.TestCase):
    def test_identifiers_validated(self):
        for record in ({}, {'doi': 'https://127.0.0.1'}, {'pmid': '1 OR x'}):
            with self.assertRaises(ValueError): ft.retrieve({'record': record})

    def test_public_https_only(self):
        for url in ('http://example.com', 'https://u:p@example.com', 'https://example.com:8080'):
            with self.assertRaises(ValueError): ft.fetch(url)

    def test_private_and_mixed_dns_rejected_before_connect(self):
        for ips in (['127.0.0.1'], ['169.254.169.254'], ['100.114.199.15'], ['::1'], ['93.184.216.34', '10.0.0.1']):
            with patch.object(socket, 'getaddrinfo', return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, '', (ip,443)) for ip in ips]), patch.object(socket, 'socket') as connect:
                with self.assertRaises(ValueError): ft.fetch('https://example.org/p.pdf')
                connect.assert_not_called()

    def test_skip_rejected_pdf_and_continue_other_provider(self):
        def data(url):
            if 'openalex' in url:return {'locations':[{'is_oa':True,'pdf_url':'https://repo.example/rejected.pdf'}]}
            if 'semanticscholar' in url:return {'openAccessPdf':{'url':'https://repo.example/good.pdf'}}
            return {}
        with patch.object(ft,'metadata',side_effect=data), patch.object(ft,'fetch',return_value=b'%PDF-1.7') as fetch:
            result=ft.retrieve({'record':{'doi':'10.1234/example'},'skipUrls':['https://repo.example/rejected.pdf']})
        self.assertIn('Semantic Scholar',result['source'])
        fetch.assert_called_once_with('https://repo.example/good.pdf')

    def test_skip_urls_are_not_download_targets(self):
        with patch.object(ft,'metadata',return_value={}),patch.object(ft,'fetch') as fetch:
            ft.retrieve({'record':{'pmid':'123'},'skipUrls':['https://127.0.0.1/private']})
        fetch.assert_not_called()

    def test_title_only_exact_match_can_download(self):
        def data(url):
            if 'openalex' in url:return {'results':[{'title':'A uniquely named report','publication_year':2024,'locations':[{'is_oa':True,'pdf_url':'https://repo.example/report.pdf'}]}]}
            return {}
        with patch.object(ft,'metadata',side_effect=data),patch.object(ft,'fetch',return_value=b'%PDF-1.7'):
            result=ft.retrieve({'record':{'title':'A uniquely named report','year':'2024'}})
        self.assertEqual(result['kind'],'pdf')

    def test_title_similarity_or_wrong_year_cannot_download(self):
        for title,year in [('A different report',2024),('A uniquely named report',2023)]:
            with patch.object(ft,'metadata',return_value={'results':[{'title':title,'publication_year':year,'locations':[{'is_oa':True,'pdf_url':'https://repo.example/wrong.pdf'}]}]}),patch.object(ft,'fetch') as fetch:
                result=ft.retrieve({'record':{'title':'A uniquely named report','year':'2024'}})
            self.assertEqual(result['kind'],'none')
            fetch.assert_not_called()

    def test_arxiv_doi_direct_pdf(self):
        with patch.object(ft, 'metadata') as meta, patch.object(ft, 'fetch', return_value=b'%PDF-1.7 content') as fetch:
            result=ft.retrieve({'record':{'doi':'10.48550/arXiv.1706.03762'}})
        self.assertEqual(result['source'], 'arXiv')
        self.assertEqual(fetch.call_args.args[0], 'https://arxiv.org/pdf/1706.03762')
        meta.assert_not_called()

    def test_epmc_xml_short_circuits(self):
        with patch.object(ft, 'metadata', return_value={'resultList': {'result': [{'pmcid': 'PMC123', 'isOpenAccess': 'Y'}]}}), patch.object(ft, 'fetch', return_value=b'<article><body>Full text</body></article>'):
            result=ft.retrieve({'record': {'pmid':'123'}})
        self.assertEqual(result['kind'],'xml'); self.assertEqual(result['source'],'Europe PMC')

    def test_fallback_to_openalex_oa_only(self):
        def data(url):
            if 'europepmc' in url: raise ValueError('rate limited')
            return {'locations':[{'is_oa': False,'pdf_url':'https://blocked.example/a.pdf'}, {'is_oa':True,'pdf_url':'https://repo.example/a.pdf'}]}
        with patch.object(ft,'metadata',side_effect=data),patch.object(ft,'fetch',return_value=b'%PDF-1.7 contents') as fetch:
            result=ft.retrieve({'record':{'doi':'10.1234/example'}})
        self.assertEqual(result['kind'],'pdf'); self.assertIn('OpenAlex',result['source'])
        self.assertEqual(fetch.call_args.args[0],'https://repo.example/a.pdf')

    def test_all_sources_unavailable_is_not_not_retrievable(self):
        with patch.object(ft,'metadata',side_effect=ValueError('503')):
            result=ft.retrieve({'record':{'doi':'10.1234/example'},'email':'reviewer@example.org'})
        self.assertEqual(result['kind'],'none')
        self.assertEqual(len(result['attempts']),4)
        self.assertTrue(all(a['status']=='unavailable' for a in result['attempts']))

    def test_unpaywall_optional_and_reached_after_others(self):
        def data(url):
            if 'unpaywall' in url:return {'oa_locations':[{'url_for_pdf':'https://repo.example/a.pdf'}]}
            return {}
        with patch.object(ft,'metadata',side_effect=data),patch.object(ft,'fetch',return_value=b'%PDF-1.7 contents'):
            result=ft.retrieve({'record':{'doi':'10.1234/example'},'email':'reviewer@example.org'})
        self.assertIn('Unpaywall',result['source'])

    def test_html_paywall_not_accepted_as_pdf(self):
        def data(url):
            return {'openAccessPdf':{'url':'https://publisher.example/a.pdf'}} if 'semanticscholar' in url else {}
        with patch.object(ft,'metadata',side_effect=data),patch.object(ft,'fetch',return_value=b'<html>Login</html>'):
            result=ft.retrieve({'record':{'pmid':'123'}})
        self.assertEqual(result['kind'],'none')


class FulltextTypeSafeTests(unittest.TestCase):
    def test_uses_passages_not_abstract_for_quotes(self):
        payload={'apiKey':'test','model':'model','input':{'stage':'fulltext','record':{'title':'Title','abstract':'Misleading abstract.'},'criteria':[{'dimension':'Population','inclusionRule':'Adults'}], 'passages':[{'id':'C8','text':'All participants were children.'}], 'reviewerCalibration':{'rules':[{'correction':'Check age'}]}}}
        requests=[]
        def request(path,key,body):
            requests.append(body)
            if len(requests)==1:return {'answers':{'c0':{'type':'choice','choice':'not_met','probabilities':{'met':0,'not_met':1,'unclear':0},'confidence':1}}}
            return {'answers':{'c0':{'type':'choice','choice':'s0','probabilities':{'none':0,'s0':1},'confidence':1}}}
        with patch.object(tm,'request',side_effect=request):result=tm.screen(payload)
        self.assertEqual(result['value']['criteria'][0]['quote'],'All participants were children.')
        self.assertEqual(result['value']['criteria'][0]['passage'],'C8')
        self.assertEqual(result['value']['decision'],'exclude')
        for r in requests:self.assertEqual(r['state']['reviewerCalibration'],payload['input']['reviewerCalibration'])
        self.assertNotIn('Misleading abstract.',requests[1]['questions']['c0']['criteria'].values())

    def test_fulltext_requires_passages(self):
        with self.assertRaises(ValueError):tm.screen({'apiKey':'test','model':'test','input':{'stage':'fulltext','record':{},'criteria':[{'dimension':'Population'}]}})

if __name__=='__main__':unittest.main()
