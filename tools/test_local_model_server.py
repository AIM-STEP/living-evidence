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
                                              allowed_origins=("https://aimsetp.com",))
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

    def test_page_cannot_choose_the_model_or_options(self):
        FakeOllama.replies = ['{"ok": 1}']
        body = dict(self.MSG, model="other", options={"temperature": 2}, think=True)
        self.req("POST", "/api/eligibility/model", body)
        sent = FakeOllama.seen[0]
        self.assertEqual(sent["model"], MODEL)
        self.assertIs(sent["think"], False)
        self.assertEqual(sent["options"]["temperature"], 0)

    def test_fenced_json_is_accepted_without_retry(self):
        FakeOllama.replies = ['```json\n{"a": 1}\n```']
        status, body = self.req("POST", "/api/eligibility/model", self.MSG)
        self.assertEqual(status, 200)
        self.assertEqual(len(FakeOllama.seen), 1)

    def test_a_non_json_reply_is_retried_once_with_some_temperature(self):
        FakeOllama.replies = ['{"items": [ "own own own', '{"items": []}']
        status, body = self.req("POST", "/api/eligibility/model", self.MSG)
        self.assertEqual(status, 200)
        self.assertEqual(body["message"]["content"], '{"items": []}')
        self.assertEqual(len(FakeOllama.seen), 2)
        self.assertGreater(FakeOllama.seen[1]["options"]["temperature"], 0)

    def test_only_one_retry(self):
        FakeOllama.replies = ["nope", "still nope", '{"never": 1}']
        status, body = self.req("POST", "/api/eligibility/model", self.MSG)
        self.assertEqual(status, 200)
        self.assertEqual(body["message"]["content"], "still nope")
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

    def test_other_post_paths_are_404(self):
        self.assertEqual(self.req("POST", "/api/other", self.MSG)[0], 404)

    def test_static_pages_are_served(self):
        status, raw = self.req("GET", "/eligibility.html")
        self.assertEqual(status, 200)
        self.assertIn(b"<title>x</title>", raw)

    def test_a_remote_ollama_is_refused_at_start(self):
        with self.assertRaises(SystemExit):
            srv.main(["--ollama", "http://203.0.113.5:11434", "--port", "0"])


if __name__ == "__main__":
    unittest.main(verbosity=1)
