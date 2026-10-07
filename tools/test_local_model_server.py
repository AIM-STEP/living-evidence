#!/usr/bin/env python3
"""Tests for tools/local_model_server.py.

    python3 tools/test_local_model_server.py

A fake Ollama runs on a loopback port, so no model is needed and every reply
is known. Covers the guards (Host, Origin, body), the request shape sent to
Ollama, the one retry on a non-JSON reply, health, static files and the log.
"""

from __future__ import annotations

import http.client
import json
import os
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch, MagicMock
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import local_model_server as srv  # noqa: E402

MODEL = "fake:1"


class FakeOllama(BaseHTTPRequestHandler):
    replies = []        # contents to return, in order
    seen = []           # request bodies received

    def do_GET(self):
        if self.path == "/api/tags":
            self._json({"models": [{"name": MODEL}]})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        FakeOllama.seen.append(body)
        if self.path == "/api/embed":
            return self._json({"embeddings": [[float(len(t)), 1.0] for t in body["input"]]})
        content = FakeOllama.replies.pop(0) if FakeOllama.replies else "{}"
        self._json({"message": {"role": "assistant", "content": content}})

    def _json(self, obj):
        data = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


def start(server):
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fake = start(ThreadingHTTPServer(("127.0.0.1", 0), FakeOllama))
        cls.ollama = "http://127.0.0.1:%d" % cls.fake.server_port
        cls.root = tempfile.mkdtemp()
        with open(os.path.join(cls.root, "eligibility.html"), "w") as fh:
            fh.write("<!doctype html><title>x</title>")
        cls.logs = tempfile.mkdtemp()
        # Bind first to learn the port, then hand it to the handler for the Origin check.
        cls.app = ThreadingHTTPServer(("127.0.0.1", 0), None)
        cls.port = cls.app.server_port
        cls.app.RequestHandlerClass = partial(srv.Handler, directory=cls.root, model=MODEL,
                                              ollama=cls.ollama, port=cls.port, log_dir=cls.logs,
                                              allowed_origins=("https://aimsetp.com",), embed_model=MODEL)
        start(cls.app)

    @classmethod
    def tearDownClass(cls):
        cls.app.shutdown()
        cls.fake.shutdown()

    def setUp(self):
        FakeOllama.replies = []
        FakeOllama.seen = []

    def req(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        h = {"Host": "127.0.0.1:%d" % self.port}
        h.update(headers or {})
        data = json.dumps(body).encode() if isinstance(body, (dict, list)) else body
        if data is not None:
            h.setdefault("Content-Type", "application/json")
        conn.request(method, path, body=data, headers=h)
        res = conn.getresponse()
        raw = res.read()
        conn.close()
        try:
            return res.status, json.loads(raw)
        except ValueError:
            return res.status, raw

    MSG = {"messages": [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}]}

    # ------------------------------------------------------------- health

    def test_download_health_independent_of_models(self):
        with patch.object(srv, 'check_model', side_effect=AssertionError('No model required')):
            status, body = self.req('GET', '/api/eligibility/fulltext/health')
        self.assertEqual(status, 200)
        self.assertEqual(body['service'], 'aimstep-fulltext-assistant')
        self.assertFalse(body['modelsRequired'])

    def test_download_origin_and_payload_guards(self):
        path = '/api/eligibility/fulltext'
        with patch.object(srv.fulltext_assistant, 'instance') as instance:
            status, _ = self.req('POST', path, {'token': 'a'*64}, {'Origin': 'https://untrusted.example'})
            self.assertEqual(status, 403); instance.assert_not_called()
            instance.return_value.request.return_value = {'jobs': []}
            status, body = self.req('POST', path, {'token': 'a'*64, 'action': 'status', 'ids': []}, {'Origin': 'https://aimsetp.com'})
            self.assertEqual(status, 200); self.assertEqual(body, {'jobs': []})
            instance.return_value.request.side_effect = ValueError('Invalid private queue token.')
            self.assertEqual(self.req('POST', path, {'token':'invalid'})[0], 400)

    def test_health_names_the_service_the_page_looks_for(self):
        status, body = self.req("GET", "/api/eligibility/health")
        self.assertEqual(status, 200)
        self.assertEqual(body["service"], "aimstep-local-eligibility")
        self.assertEqual(body["model"], MODEL)

    def test_health_reports_a_missing_model_as_unavailable(self):
        ok, msg = srv.check_model(self.ollama, "absent:9")
        self.assertFalse(ok)
        self.assertIn("not installed", msg)

    def test_health_reports_unreachable_ollama(self):
        ok, msg = srv.check_model("http://127.0.0.1:9", MODEL)
        self.assertFalse(ok)
        self.assertIn("not reachable", msg)

    # ------------------------------------------------------------- model

    def test_model_call_forwards_with_fixed_settings(self):
        FakeOllama.replies = ['{"ok": 1}']
        status, body = self.req("POST", "/api/eligibility/model", self.MSG,
                                {"Origin": "http://127.0.0.1:%d" % self.port})
        self.assertEqual(status, 200)
        self.assertEqual(body["message"]["content"], '{"ok": 1}')
        sent = FakeOllama.seen[0]
        self.assertEqual(sent["model"], MODEL)
        self.assertIs(sent["think"], False)
        self.assertIs(sent["stream"], False)
        self.assertEqual(sent["format"], "json")
        self.assertEqual(sent["options"]["temperature"], 0)
        self.assertEqual(sent["messages"], self.MSG["messages"])

    def test_a_schema_from_the_page_is_passed_to_ollama(self):
        FakeOllama.replies = ['{"words": []}']
        schema = {"type": "object", "properties": {"words": {"type": "array"}}, "required": ["words"]}
        self.req("POST", "/api/eligibility/model", dict(self.MSG, format=schema))
        self.assertEqual(FakeOllama.seen[0]["format"], schema)

    def test_an_oversized_or_odd_format_falls_back_to_json(self):
        for fmt in ["xml", ["a"], {"x": "y" * (srv.MAX_SCHEMA + 10)}]:
            FakeOllama.replies = ['{}']; FakeOllama.seen = []
            self.req("POST", "/api/eligibility/model", dict(self.MSG, format=fmt))
            self.assertEqual(FakeOllama.seen[0]["format"], "json")

    def test_page_cannot_choose_the_model_or_options(self):
        FakeOllama.replies = ['{"ok": 1}']
        body = dict(self.MSG, model="other", options={"temperature": 2}, think=True)
        self.req("POST", "/api/eligibility/model", body)
        sent = FakeOllama.seen[0]
        self.assertEqual(sent["model"], MODEL)
        self.assertIs(sent["think"], False)
        self.assertEqual(sent["options"]["temperature"], 0)

    def test_a_json_list_is_accepted_without_repair(self):
        FakeOllama.replies = ['```json\n[{"criterionKey": "0:INC-01", "words": ["fibromyalgia"]}]\n```']
        status, body = self.req("POST", "/api/eligibility/model", self.MSG)
        self.assertEqual(status, 200)
        self.assertEqual(len(FakeOllama.seen), 1)

    def test_fenced_json_is_accepted_without_retry(self):
        FakeOllama.replies = ['```json\n{"a": 1}\n```']
        status, body = self.req("POST", "/api/eligibility/model", self.MSG)
        self.assertEqual(status, 200)
        self.assertEqual(len(FakeOllama.seen), 1)

    def test_the_swallowed_colon_glitch_goes_to_the_model_not_a_guess(self):
        # Verbatim shape from a real gemma4 reply on "sample size greater than 20".
        # ">> 20" or "> 20"? Only the model, seeing the source, can say.
        broken = '{"items":[{"attribute":"sample size","value">> 20","logic":"required"}]}'
        FakeOllama.replies = [broken, '{"items":[{"attribute":"sample size","value":"> 20","logic":"required"}]}']
        status, body = self.req("POST", "/api/eligibility/model", self.MSG)
        self.assertEqual(json.loads(body["message"]["content"])["items"][0]["value"], "> 20")
        self.assertEqual(FakeOllama.seen[1]["messages"][1]["content"], broken)

    def test_a_broken_reply_is_repaired_by_the_model_before_regenerating(self):
        FakeOllama.replies = ['{"items": [ {"a" "b"} ]}', '{"items": [{"a": "b"}]}']
        status, body = self.req("POST", "/api/eligibility/model", self.MSG)
        self.assertEqual(body["message"]["content"], '{"items": [{"a": "b"}]}')
        self.assertEqual(len(FakeOllama.seen), 2)
        repair = FakeOllama.seen[1]["messages"]
        self.assertIn("repair malformed JSON", repair[0]["content"])
        self.assertEqual(repair[1]["content"], '{"items": [ {"a" "b"} ]}')
        self.assertEqual(FakeOllama.seen[1]["options"]["temperature"], 0)

    def test_regenerates_once_when_repair_fails(self):
        FakeOllama.replies = ['{"items": [ "own own own', "still broken", '{"items": []}', '{"never": 1}']
        status, body = self.req("POST", "/api/eligibility/model", self.MSG)
        self.assertEqual(status, 200)
        self.assertEqual(body["message"]["content"], '{"items": []}')
        self.assertEqual(len(FakeOllama.seen), 3)
        self.assertGreater(FakeOllama.seen[2]["options"]["temperature"], 0)
        self.assertEqual(FakeOllama.seen[2]["messages"], self.MSG["messages"])

    def test_an_empty_reply_skips_repair(self):
        FakeOllama.replies = ["", '{"ok": 1}']
        status, body = self.req("POST", "/api/eligibility/model", self.MSG)
        self.assertEqual(body["message"]["content"], '{"ok": 1}')
        self.assertEqual(len(FakeOllama.seen), 2)

    def test_images_pass_through(self):
        FakeOllama.replies = ['{}']
        msg = {"messages": [{"role": "user", "content": "u", "images": ["aGk="]}]}
        self.assertEqual(self.req("POST", "/api/eligibility/model", msg)[0], 200)
        self.assertEqual(FakeOllama.seen[0]["messages"][0]["images"], ["aGk="])

    def test_exchanges_are_logged_when_asked(self):
        FakeOllama.replies = ['{"logged": true}']
        self.req("POST", "/api/eligibility/model", self.MSG)
        files = os.listdir(self.logs)
        self.assertTrue(files)
        lines = open(os.path.join(self.logs, files[0]), encoding="utf-8").read().splitlines()
        rec = json.loads(lines[-1])
        self.assertEqual(rec["reply"], '{"logged": true}')
        self.assertEqual(rec["model"], MODEL)
        self.assertEqual(rec["messages"][1]["content"], "u")
        self.assertEqual(rec["attempts"], ["ok"])

    # ------------------------------------------------------------- guards

    def test_malformed_bodies_are_refused_not_repaired(self):
        for bad in [{}, {"messages": []}, {"messages": "x"},
                    {"messages": [{"role": "tool", "content": "x"}]},
                    {"messages": [{"role": "user", "content": 1}]},
                    {"messages": [{"role": "user", "content": "x", "images": ["a"] * 7}]}]:
            self.assertEqual(self.req("POST", "/api/eligibility/model", bad)[0], 400, bad)
        self.assertEqual(self.req("POST", "/api/eligibility/model", b"not json")[0], 400)
        self.assertEqual(FakeOllama.seen, [])

    # ------------------------------------------------------------- published site

    def test_the_published_site_may_call_the_model(self):
        FakeOllama.replies = ['{"ok": 1}']
        origin = {"Origin": "https://aimsetp.com"}
        status, body = self.req("POST", "/api/eligibility/model", self.MSG, origin)
        self.assertEqual(status, 200)
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        conn.request("GET", "/api/eligibility/health", headers=dict(origin, Host="127.0.0.1:%d" % self.port))
        res = conn.getresponse(); res.read(); conn.close()
        self.assertEqual(res.getheader("Access-Control-Allow-Origin"), "https://aimsetp.com")

    def test_preflight_is_answered_only_for_the_published_site(self):
        def preflight(origin, extra=None):
            conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
            h = {"Host": "127.0.0.1:%d" % self.port, "Origin": origin,
                 "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"}
            h.update(extra or {})
            conn.request("OPTIONS", "/api/eligibility/model", headers=h)
            res = conn.getresponse(); res.read(); conn.close()
            return res
        ok = preflight("https://aimsetp.com", {"Access-Control-Request-Private-Network": "true"})
        self.assertEqual(ok.status, 204)
        self.assertEqual(ok.getheader("Access-Control-Allow-Origin"), "https://aimsetp.com")
        self.assertIn("POST", ok.getheader("Access-Control-Allow-Methods"))
        self.assertEqual(ok.getheader("Access-Control-Allow-Private-Network"), "true")
        bad = preflight("https://evil.example")
        self.assertEqual(bad.status, 403)
        self.assertIsNone(bad.getheader("Access-Control-Allow-Origin"))

    def test_another_site_cannot_read_health(self):
        self.assertEqual(self.req("GET", "/api/eligibility/health", headers={"Origin": "https://evil.example"})[0], 403)

    def test_another_site_cannot_use_the_model(self):
        for origin in ["https://evil.example", "http://127.0.0.1:1", "null",
                       "https://aimsetp.com.evil.example", "http://aimsetp.com"]:
            status, _ = self.req("POST", "/api/eligibility/model", self.MSG, {"Origin": origin})
            self.assertEqual(status, 403, origin)
        self.assertEqual(FakeOllama.seen, [])

    def test_dns_rebinding_host_is_refused(self):
        self.assertEqual(self.req("GET", "/api/eligibility/health", headers={"Host": "evil.example"})[0], 421)
        self.assertEqual(self.req("GET", "/eligibility.html", headers={"Host": "evil.example:80"})[0], 421)
        self.assertEqual(self.req("POST", "/api/eligibility/model", self.MSG, {"Host": "evil.example"})[0], 403)

    def test_localhost_names_are_accepted(self):
        for host in ["localhost:%d" % self.port, "127.0.0.1"]:
            self.assertEqual(self.req("GET", "/api/eligibility/health", headers={"Host": host})[0], 200, host)

    # ------------------------------------------------------------- embeddings

    def test_embed_forwards_texts_to_the_embedding_model(self):
        status, body = self.req("POST", srv.EMBED, {"input": ["ab", "abcd"]})
        self.assertEqual(status, 200)
        self.assertEqual(body["embeddings"], [[2.0, 1.0], [4.0, 1.0]])
        sent = FakeOllama.seen[-1]
        self.assertEqual(sent["model"], MODEL)
        self.assertEqual(sent["input"], ["ab", "abcd"])

    def test_embed_refuses_bad_input_and_truncates_long_texts(self):
        self.assertEqual(self.req("POST", srv.EMBED, {"input": "text"})[0], 400)
        self.assertEqual(self.req("POST", srv.EMBED, {"input": []})[0], 400)
        self.assertEqual(self.req("POST", srv.EMBED, {"input": ["x"] * (srv.MAX_EMBED_INPUTS + 1)})[0], 400)
        self.req("POST", srv.EMBED, {"input": ["y" * (srv.MAX_EMBED_CHARS + 50)]})
        self.assertEqual(len(FakeOllama.seen[-1]["input"][0]), srv.MAX_EMBED_CHARS)

    def test_embed_is_guarded_like_the_model(self):
        status, _ = self.req("POST", srv.EMBED, {"input": ["a"]}, {"Origin": "https://evil.example"})
        self.assertEqual(status, 403)

    def test_embeddings_can_use_a_second_ollama(self):
        h = srv.Handler.__init__.__code__.co_varnames
        self.assertIn("embed_ollama", h)

    def test_health_names_the_embedding_model_when_installed(self):
        status, body = self.req("GET", srv.HEALTH)
        self.assertEqual(body["embedModel"], MODEL)

    def test_other_post_paths_are_404(self):
        self.assertEqual(self.req("POST", "/api/other", self.MSG)[0], 404)

    def test_api_routes_without_calling_ollama(self):
        with patch.object(srv.api_model, 'chat', return_value={'message': {'content': '{"ok":true}'}}) as api:
            status, body = self.req('POST', srv.MODEL, dict(self.MSG, provider='api'))
        self.assertEqual(status, 200)
        api.assert_called_once_with(self.MSG['messages'])
        self.assertEqual(body['provider'], 'api')
        self.assertEqual(FakeOllama.seen, [])

    def test_missing_api_does_not_fall_back(self):
        with patch.dict(os.environ, {}, clear=True):
            status, body = self.req('POST', srv.MODEL, dict(self.MSG, provider='api'))
        self.assertEqual(status, 502)
        self.assertIn('not configured', body['error'])
        self.assertEqual(FakeOllama.seen, [])

    def test_typesafe_generation_is_blocked(self):
        with patch.dict(os.environ, {'AIMSTEP_API_URL': 'https://api.typesafe.ai/v1/systemone'}, clear=True):
            ready, reason = srv.api_model.status()
        self.assertFalse(ready)
        self.assertIn('TypeSafe', reason)

    def test_api_key_only_in_upstream_authorization(self):
        env = {'AIMSTEP_API_URL': 'https://example.test/v1/chat/completions',
               'AIMSTEP_API_MODEL': 'test', 'AIMSTEP_API_KEY': 'synthetic-secret'}
        response = MagicMock()
        response.__enter__.return_value.read.return_value = b'{"choices":[{"message":{"content":"{}"}}]}'
        with patch.dict(os.environ, env, clear=True), patch.object(srv.api_model.urllib.request, 'build_opener') as factory:
            factory.return_value.open.return_value = response
            result = srv.api_model.chat(self.MSG['messages'])
            req = factory.return_value.open.call_args.args[0]
            self.assertEqual(req.get_header('Authorization'), 'Bearer synthetic-secret')
            self.assertNotIn(b'synthetic-secret', req.data)
            self.assertNotIn('synthetic-secret', json.dumps(result))
            status, health = self.req('GET', srv.HEALTH)
            self.assertNotIn('synthetic-secret', json.dumps(health))
            self.assertTrue(health['api']['ready'])

    def test_pasted_key_is_request_scoped_and_not_logged(self):
        key = 'synthetic-browser-key'
        with patch.object(srv.api_model, 'chat', return_value={'message': {'content': '{}'}}) as api:
            status, body = self.req('POST', srv.MODEL, dict(self.MSG, provider='api', apiKey=key))
            self.assertEqual(status, 200)
            api.assert_called_once_with(self.MSG['messages'], key=key)
            self.assertNotIn(key, json.dumps(body))
        for name in os.listdir(self.logs):
            with open(os.path.join(self.logs, name)) as f:
                self.assertNotIn(key, f.read())
        with patch.dict(os.environ, {}, clear=True):
            status, _ = self.req('POST', srv.MODEL, dict(self.MSG, provider='api'))
            self.assertEqual(status, 502)

    def test_key_confirmation_requires_endpoint_and_model(self):
        with patch.dict(os.environ, {'AIMSTEP_API_URL':'https://example.test/v1/chat/completions',
                                     'AIMSTEP_API_MODEL':'test'}, clear=True):
            _, body = self.req('GET', srv.HEALTH)
            self.assertTrue(body['api']['acceptsKey'])
            self.assertFalse(body['api']['ready'])
            self.assertTrue(srv.api_model.status('test-key')[0])

    def test_pasted_key_rejects_header_injection(self):
        with patch.object(srv.api_model, 'chat') as api:
            status, body = self.req('POST', srv.MODEL, dict(self.MSG, provider='api', apiKey='secret\nInjected: yes'))
            self.assertEqual(status, 400)
            api.assert_not_called()
            self.assertNotIn('secret', json.dumps(body))

    def test_fulltext_retrieval_route(self):
        with patch.object(srv.fulltext_sources, 'retrieve', return_value={'kind':'none','attempts':[]}) as retrieve, patch.object(srv.api_model, 'chat') as chat:
            status, data = self.req('POST', srv.MODEL, {'provider':'fulltext','record':{'pmid':'123'}})
        self.assertEqual(status, 200)
        self.assertEqual(data['kind'], 'none')
        retrieve.assert_called_once()
        chat.assert_not_called()

    def test_fulltext_origin_guard(self):
        with patch.object(srv.fulltext_sources, 'retrieve') as retrieve:
            status, _ = self.req('POST', srv.MODEL, {'provider':'fulltext','record':{'pmid':'123'}}, {'Origin':'https://untrusted.example'})
        self.assertEqual(status, 403)
        retrieve.assert_not_called()

    def test_fulltext_invalid_identifier(self):
        status, _ = self.req('POST', srv.MODEL, {'provider':'fulltext','record':{'doi':'https://127.0.0.1'}})
        self.assertEqual(status, 400)

    def test_typesafe_discovery_bypasses_text_generation(self):
        with patch.object(srv.typesafe_model, 'models', return_value={'models':['test-model']}) as models, patch.object(srv.api_model, 'chat') as chat:
            status, body = self.req('POST', srv.MODEL, {'provider':'typesafe','action':'models','apiKey':'synthetic-key'})
            self.assertEqual(status, 200)
            self.assertEqual(body['models'], ['test-model'])
            models.assert_called_once_with('synthetic-key')
            chat.assert_not_called()
            self.assertEqual(FakeOllama.seen, [])

    def test_typesafe_http_errors_do_not_expose_provider_body(self):
        import io
        failure = srv.urllib.error.HTTPError('https://api.typesafe.ai',401,'Unauthorized',{},io.BytesIO(b'synthetic-secret'))
        with patch.object(srv.typesafe_model, 'models', side_effect=failure):
            status, body = self.req('POST', srv.MODEL, {'provider':'typesafe','action':'models','apiKey':'synthetic-key'})
            self.assertEqual(status, 502)
            self.assertIn('Invalid TypeSafe API key', body['error'])
            self.assertNotIn('synthetic-secret', json.dumps(body))

    def test_typesafe_health_is_available_without_ollama(self):
        with patch.object(srv, 'check_model', return_value=(False,'offline')):
            status, body = self.req('GET',srv.HEALTH)
            self.assertEqual(status, 503)
            self.assertTrue(body['typesafe']['available'])

    def test_typesafe_origin_guard_applies(self):
        with patch.object(srv.typesafe_model,'models') as models:
            status, _ = self.req('POST',srv.MODEL,{'provider':'typesafe','action':'models','apiKey':'test'}, {'Origin':'https://untrusted.example'})
            self.assertEqual(status,403)
            models.assert_not_called()

    def test_unknown_provider_rejected(self):
        status, _ = self.req('POST', srv.MODEL, dict(self.MSG, provider='other'))
        self.assertEqual(status, 400)
        self.assertEqual(FakeOllama.seen, [])

    def test_static_pages_are_served(self):
        status, raw = self.req("GET", "/eligibility.html")
        self.assertEqual(status, 200)
        self.assertIn(b"<title>x</title>", raw)

    def test_a_remote_ollama_is_refused_at_start(self):
        with self.assertRaises(SystemExit):
            srv.main(["--ollama", "http://203.0.113.5:11434", "--port", "0"])


if __name__ == "__main__":
    unittest.main(verbosity=1)
