import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import fulltext_assistant as assistant
import fulltext_retriever as retrieval

RECORD = {'uid': 'r1', 'doi': '10.1234/test', 'title': 'A precise study of persistent original documents', 'pmid': '', 'year': '2025', 'url': ''}
TOKEN = 'a' * 64


def pdf(text=None):
    import pymupdf
    doc = pymupdf.open(); page = doc.new_page()
    page.insert_text((40, 60), text or RECORD['title'] + '\n' + RECORD['doi'])
    raw = doc.tobytes(); doc.close(); return raw


class RetrieverTests(unittest.TestCase):
    def test_identity(self):
        self.assertTrue(retrieval.pdf_identity(pdf(), RECORD))
        with self.assertRaisesRegex(ValueError, 'identity-mismatch'):
            retrieval.pdf_identity(pdf('A completely different article ' * 12), RECORD)
        with self.assertRaisesRegex(ValueError, 'not-pdf'):
            retrieval.pdf_identity(b'<html>Download PDF</html>', RECORD)

    def test_cloud_pdf_before_xml_and_publisher(self):
        raw = pdf(); calls = []
        def fetch(url, *args, **kwargs):
            calls.append(url)
            if 'europepmc/webservices/rest/search' in url:
                data = json.dumps({'resultList': {'result': [{'doi': RECORD['doi'], 'pmcid': 'PMC123', 'isOpenAccess': 'Y', 'fullTextUrlList': {'fullTextUrl': [{'availability': 'Free', 'url': 'https://publisher.example/article'}]}}]}}).encode()
            elif 'list-type=2' in url:
                data = b'<ListBucketResult><CommonPrefixes><Prefix>PMC123.2/</Prefix></CommonPrefixes></ListBucketResult>'
            elif '.json' in url:
                data = json.dumps({'doi': RECORD['doi'], 'pdf_url': 's3://pmc-oa-opendata/PMC123.2/PMC123.2.pdf?md5=' + hashlib.md5(raw).hexdigest(), 'xml_url': 's3://pmc-oa-opendata/PMC123.2/a.xml'}).encode()
            elif '.pdf' in url: data = raw
            else: raise AssertionError('Unexpected request ' + url)
            return data, url, {}
        with patch.object(retrieval, 'zotero', return_value=None), patch.object(retrieval.fulltext_sources, 'fetch', side_effect=fetch):
            out = retrieval.retrieve(RECORD)
        self.assertEqual(out['got']['data'], raw)
        self.assertEqual(out['got']['source'], 'PMC cloud')
        self.assertFalse(any('publisher.example' in u or '/model' in u or '.xml' in u for u in calls))

    def test_rate_limit_and_xml_fallback(self):
        def fetch(url, *args, **kwargs):
            if '/search?' in url:
                data = json.dumps({'resultList': {'result': [{'doi': RECORD['doi'], 'pmcid': 'PMC123', 'isOpenAccess': 'Y'}]}}).encode()
            elif 'fullTextXML' in url:
                data = ('<article><front><article-meta><article-id pub-id-type="doi">'+RECORD['doi']+'</article-id><title-group><article-title>'+RECORD['title']+'</article-title></title-group></article-meta></front><body><p>Readable text</p></body></article>').encode()
            else:
                e = retrieval.fulltext_sources.SourceError('Source HTTP 429'); e.status=429; e.retry_after='1200'; raise e
            return data, url, {}
        with patch.object(retrieval, 'zotero', return_value=None), patch.object(retrieval.fulltext_sources, 'fetch', side_effect=fetch):
            out = retrieval.retrieve(RECORD, {'contactEmail': 'test@example.org'})
        self.assertEqual(out['got']['kind'], 'xml')
        self.assertEqual(out['retryAfter'], 1200)
        self.assertTrue(any(a['status']=='rate-limited' for a in out['attempts']))

    def test_landing_links(self):
        parser = retrieval.Links(); parser.feed('<meta name="citation_pdf_url" content="/file.pdf"><a href="../download/report">PDF</a><a href="/unrelated">Other</a>')
        self.assertEqual(parser.urls, ['/file.pdf', '../download/report'])

    def test_cancelled_before_public_request(self):
        with patch.object(retrieval, 'zotero', return_value=None), patch.object(retrieval.fulltext_sources, 'fetch') as fetch:
            with self.assertRaises(InterruptedError): retrieval.retrieve(RECORD, cancelled=lambda: True)
            fetch.assert_not_called()


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.raw = pdf()
        self.calls = []
        def retrieve(r, config, cancelled):
            self.calls.append(r)
            return {'got': {'kind':'pdf','data':self.raw,'filename':'original.pdf','source':'Mock repository','url':'https://example.org/original.pdf'}, 'attempts':[{'source':'Mock repository','status':'pdf-verified'}]}
        self.queue = assistant.Queue(self.temp.name, retrieve, lambda: {})

    def submit(self, **kwargs):
        return self.queue.request({'token':TOKEN,'action':'submit','records':[RECORD],**kwargs})['jobs'][0]['id']

    def result(self, ident, token=TOKEN):
        return self.queue.request({'token':token,'action':'result','ids':[ident]})['jobs']

    def test_persistence_ownership_and_original_bytes(self):
        ident = self.submit(); self.assertEqual(ident, self.submit())
        self.assertTrue(self.queue.step()); self.assertFalse(self.queue.step())
        self.assertEqual(len(self.calls),1)
        self.assertEqual(self.result(ident, 'b'*64), [])
        self.queue = assistant.Queue(self.temp.name)
        got=self.result(ident)[0]['got']
        import base64
        self.assertEqual(base64.b64decode(got['data']),self.raw)
        self.assertEqual(got['sha256'],hashlib.sha256(self.raw).hexdigest())
        self.assertNotIn(self.temp.name,json.dumps(got))
        self.assertEqual((Path(self.temp.name)/(ident+'.bin')).stat().st_mode & 0o777,0o600)

    def test_retry_and_force(self):
        self.queue.retrieve=lambda *args,**kwargs: {'got':None,'attempts':[], 'retryAfter':3600}
        ident=self.submit(); self.queue.step()
        row=self.result(ident)[0]
        self.assertEqual(row['state'],'retry'); self.assertFalse(self.queue.step())
        self.submit(force=True); self.assertTrue(self.queue.step())

    def test_cancel_and_restart_running_job(self):
        ident=self.submit()
        self.queue.request({'token':TOKEN,'action':'cancel','ids':[ident]})
        self.assertFalse(self.queue.step())
        self.submit(force=True)
        with self.queue.db() as db: db.execute("UPDATE jobs SET state='running' WHERE id=?",(ident,))
        self.queue=assistant.Queue(self.temp.name,self.queue.retrieve)
        with patch('threading.Thread.start'):
            self.queue.start()
        self.addCleanup(self.queue.worker_lock.close)
        self.assertTrue(self.queue.step())
        self.assertEqual(self.result(ident)[0]['state'],'ready')

    def test_capacity_preserves_existing_data(self):
        self.queue.settings=lambda: {'cacheBytes':10}
        ident=self.submit(); self.queue.step()
        self.assertNotIn('got',self.result(ident)[0])
        self.assertTrue(any(a['status']=='capacity-reached' for a in self.result(ident)[0]['attempts']))

    def test_bad_record_does_not_block_batch(self):
        result = self.queue.request({'token':TOKEN,'action':'submit','records':[{'uid':'bad','doi':'bad'}, RECORD]})
        self.assertEqual(result['jobs'][0]['error'],'invalid-record')
        self.assertEqual(len(result['jobs'][1]['id']),64)
        self.assertTrue(self.queue.step())

    def test_cancel_then_force_does_not_commit_stale_result(self):
        ident=self.submit()
        def interrupted(r, config, cancelled):
            self.queue.request({'token':TOKEN,'action':'cancel','ids':[ident]})
            self.submit(force=True)
            self.assertTrue(cancelled())
            return {'got':None,'attempts':[]}
        self.queue.retrieve=interrupted
        self.queue.step()
        self.assertEqual(self.result(ident)[0]['state'],'queued')

    def test_unsafe_requests(self):
        with self.assertRaises(ValueError): self.queue.request({'action':'submit','token':'bad','records':[RECORD]})
        with self.assertRaises(ValueError): self.queue.request({'action':'result','token':TOKEN,'ids':['../../private']})
        with self.assertRaises(ValueError): self.queue.request({'action':'submit','token':TOKEN,'records':[{'doi':'javascript:alert(1)'}]})

if __name__=='__main__': unittest.main()
