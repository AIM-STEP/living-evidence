import io
import json
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import urllib.error

from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
import jwt
import online_model_gateway as g

class Connection:
    def __init__(self, raw): self.input, self.output = io.BytesIO(raw), bytearray()
    def makefile(self, *args): return self.input
    def sendall(self, data): self.output.extend(data)
    def settimeout(self, value): pass

class Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.public = cls.key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        config=Path(self.tmp.name)/'config.json';config.write_text(json.dumps({'allowedEmails':['synthetic@example.test']}))
        self.identity=g.Identity(config)
        self.identity.certificates=lambda *a, **kw: SimpleNamespace(status=200,data=json.dumps({'test':self.public}).encode())
        self.claims={'iss':'https://securetoken.google.com/aim-step','aud':'aim-step','sub':'synthetic-owner','email':'synthetic@example.test','email_verified':True,'iat':int(time.time())-1,'exp':int(time.time())+3600}
        self.jobs=g.Jobs(worker=lambda path,body:(200, {'message':{'content':'synthetic'}}));self.addCleanup(self.jobs.pool.shutdown)
    def token(self, **changes):
        return jwt.encode({**self.claims,**changes},self.key,algorithm='RS256',headers={'kid':'test'})
    def request(self,path=g.PREFIX+'/health',method='GET',body=None,token=None,origin='https://aimsetp.com',host='api.aimsetp.com'):
        headers={'Host':host,'Origin':origin,'Connection':'close'}
        if token is not None: headers['Authorization']='Bearer '+token
        if body is not None: headers['Content-Length']=str(len(body))
        raw=(method+' '+path+' HTTP/1.1\r\n'+''.join(k+': '+v+'\r\n' for k,v in headers.items())+'\r\n').encode()+(body or b'')
        connection=Connection(raw)
        with patch.object(g,'upstream',return_value=(200,{'service':'aimstep-local-eligibility','ollama':'private','api':{'secret':'private'}})):
            g.Handler(connection,('127.0.0.1',12345),SimpleNamespace(),identity=self.identity,jobs=self.jobs)
        head,data=bytes(connection.output).split(b'\r\n\r\n',1)
        return int(head.split()[1]),head.decode(),json.loads(data)
    def test_valid_signed_identity(self): self.assertEqual(self.identity('Bearer '+self.token()),'synthetic-owner')
    def test_model_error_codes_are_allowlisted_and_raw_error_bodies_stay_private(self):
        for status, supplied, expected in [(422, 'MODEL_REVIEW_INCOMPLETE', 'MODEL_REVIEW_INCOMPLETE'),
                                           (409, 'MODEL_CLIENT_UPDATE_REQUIRED', 'MODEL_CLIENT_UPDATE_REQUIRED'),
                                           (409, 'untrusted', None),
                                           (422, 'MODEL_SCHEMA_ERROR', 'MODEL_SCHEMA_ERROR'),
                                           (502, 'MODEL_SCHEMA_ERROR', 'MODEL_UPSTREAM_ERROR'),
                                           (422, 'unknown', None), (503, None, 'MODEL_UNAVAILABLE')]:
            body = json.dumps({'code': supplied, 'error': 'private-provider-text'}).encode()
            error = urllib.error.HTTPError(g.UPSTREAM, status, '', {}, io.BytesIO(body))
            with self.subTest(status=status, code=supplied), patch.object(g.OPENER, 'open', side_effect=error) as opener:
                observed, result = g.upstream(g.PREFIX + '/model', {'messages': []})
                self.assertEqual(observed, status)
                self.assertEqual(result.get('code'), expected)
                self.assertNotIn('private-provider-text', json.dumps(result))
                opener.assert_called_once()

    def test_retry_only_when_connection_was_never_established(self):
        response = io.BytesIO(b'{"ok":true}')
        response.status = 200
        refused = urllib.error.URLError(ConnectionRefusedError())
        with patch.object(g.OPENER, 'open', side_effect=[refused, response]) as opener, patch.object(g.time, 'sleep'):
            self.assertEqual(g.upstream(g.PREFIX + '/model', {}), (200, {'ok': True}))
            self.assertEqual(opener.call_count, 2)
        for cause, expected in [(TimeoutError(), 'MODEL_TIMEOUT'), (ConnectionResetError(), 'MODEL_UNAVAILABLE')]:
            with self.subTest(cause=cause), patch.object(g.OPENER, 'open', side_effect=urllib.error.URLError(cause)) as opener:
                self.assertEqual(g.upstream(g.PREFIX + '/model', {}), g.public_error(expected))
                opener.assert_called_once()

    def test_identity_rejections(self):
        for change in [{'aud':'other'},{'iss':'wrong'},{'exp':1},{'email_verified':False},{'email':'other@example.test'},{'sub':''}]:
            with self.subTest(change=change),self.assertRaises(g.AccessError): self.identity('Bearer '+self.token(**change))
        token=self.token();parts=token.split('.');parts[1]=parts[1][:-3]+'aaa'
        with self.assertRaises(g.AccessError):self.identity('Bearer '+'.'.join(parts))
    def test_unconfigured_access_fails_closed(self):
        self.identity.config.unlink()
        with self.assertRaises(g.AccessError) as e:self.identity('Bearer '+self.token())
        self.assertEqual(e.exception.status,503)
    def test_health_requires_auth_and_sanitizes(self):
        self.assertEqual(self.request()[0],401)
        status,headers,body=self.request(token=self.token())
        self.assertEqual(status,200);self.assertNotIn('ollama',body);self.assertNotIn('api',body)
        self.assertIn('Access-Control-Allow-Origin: https://aimsetp.com',headers)
    def test_preflight_without_auth(self):
        self.assertEqual(self.request(method='OPTIONS')[0],200)
        self.assertIn('Authorization',self.request(method='OPTIONS')[1])
    def test_host_and_origin(self):
        self.assertEqual(self.request(host='evil.test')[0],421)
        self.assertEqual(self.request(origin='https://evil.test')[0],403)
    def test_no_static_files_or_fulltext_queue(self):
        for path in ['/','/private/typesafe.json','/../tools/local_model_server.py',g.PREFIX+'/fulltext']:
            self.assertEqual(self.request(path=path,token=self.token())[0],404)
    def test_no_client_keys_or_arbitrary_provider(self):
        for body in [{'provider':'api'},{'apiKey':'synthetic'},{'provider':'fulltext'}]:
            self.assertEqual(self.request(g.PREFIX+'/model','POST',json.dumps(body).encode(),self.token())[0],400)
    def test_owner_scoped_jobs(self):
        status,_,data=self.request(g.PREFIX+'/model','POST',b'{"messages":[]}',self.token())
        self.assertEqual(status,202);key=data['jobId'];path=g.PREFIX+'/jobs/'+key
        self.assertEqual(self.request(path,token=self.token(sub='other'))[0],404)
        self.jobs.jobs[key]['future'].result()
        self.assertEqual(self.request(path,token=self.token())[2]['result']['message']['content'],'synthetic')
        self.assertEqual(self.request(path,'DELETE',token=self.token())[0],200)
        self.assertEqual(self.request(path,token=self.token())[0],404)
    def test_cleanup_permits_many_completed_requests(self):
        for i in range(100):
            key=self.jobs.submit('u','/model',{});self.jobs.jobs[key]['future'].result();self.jobs.get('u',key,True)
        self.assertFalse(self.jobs.jobs)
    def test_concurrency_limit_and_cancel(self):
        import threading
        event=threading.Event();jobs=g.Jobs(worker=lambda *_: (event.wait(2),{}));keys=[]
        try:
            for _ in range(8):keys.append(jobs.submit('u','/model',{}))
            with self.assertRaises(g.AccessError):jobs.submit('u','/model',{})
            jobs.get('u',keys[0],True)
            with self.assertRaises(g.AccessError):jobs.get('u',keys[0])
        finally:event.set();jobs.pool.shutdown()
        self.assertNotIn(keys[0], jobs.jobs, 'Discard cancelled work immediately at completion')

    def test_lost_poll_can_be_retried_then_expires_without_another_submission(self):
        expired = []
        class Timer:
            def __init__(self, delay, callback, args): expired.append(lambda: callback(*args))
            def start(self): pass
            def cancel(self): pass
        with patch.object(g.threading, 'Timer', Timer):
            key = self.jobs.submit('owner', '/model', {})
            self.jobs.pool.shutdown()
        self.assertEqual(self.jobs.get('owner', key), self.jobs.get('owner', key))
        self.assertEqual(len(expired), 1)
        expired[0]()
        with self.assertRaises(g.AccessError): self.jobs.get('owner', key)

if __name__=='__main__': unittest.main()
