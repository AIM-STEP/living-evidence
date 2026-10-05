#!/usr/bin/env python3
"""Exercise the real remote HTTP handler without sockets or a running model."""

import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import urllib.error

import remote_model_server as remote

ORIGIN = "https://studio.tail-example.ts.net:8443"
AUTHORITY = "studio.tail-example.ts.net:8443"
SOURCE = "http://127.0.0.1:8765"
PORT = 8766


class Connection:
    def __init__(self, request):
        self.input, self.output = io.BytesIO(request), bytearray()

    def makefile(self, *args):
        return self.input

    def sendall(self, data):
        self.output.extend(data)


class Response(io.BytesIO):
    status = 200
    headers = {"Content-Type": "application/json"}


class RemoteTest(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.TemporaryDirectory()
        self.addCleanup(self.root.cleanup)
        Path(self.root.name, "eligibility.html").write_text("<title>Eligibility</title>")

    def request(self, method="GET", path="/api/eligibility/health", host=AUTHORITY, origin=None,
                body=None, extra_headers=None, upstream=b'{"service":"aimstep-local-eligibility"}', tailnet_ip=None):
        headers = {"Host": host, "Connection": "close"}
        if origin:
            headers["Origin"] = origin
        if body is not None:
            headers["Content-Length"] = str(len(body))
        headers.update(extra_headers or {})
        raw = (method + " " + path + " HTTP/1.1\r\n" +
               "".join(k + ": " + v + "\r\n" for k, v in headers.items()) + "\r\n").encode()
        conn = Connection(raw + (body or b""))
        with patch.object(remote.OPENER, "open") as opened, patch.object(remote.Handler, "log_message"):
            if isinstance(upstream, Exception):
                opened.side_effect = upstream
            else:
                opened.return_value = Response(upstream)
            remote.Handler(conn, ("127.0.0.1", 12345), SimpleNamespace(), directory=self.root.name,
                           origin=ORIGIN if tailnet_ip is None else "http://%s:%d" % (tailnet_ip, PORT),
                           port=PORT, source=SOURCE, tailnet_ip=tailnet_ip)
        head, data = bytes(conn.output).split(b"\r\n\r\n", 1)
        lines = head.decode().split("\r\n")
        status = int(lines[0].split()[1])
        result_headers = dict(line.split(": ", 1) for line in lines[1:])
        return status, result_headers, data, opened

    def test_remote_same_origin_health_reaches_existing_backend(self):
        status, _, data, opened = self.request(origin=ORIGIN)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(data)["service"], remote.local.SERVICE)
        req = opened.call_args.args[0]
        self.assertEqual(req.full_url, SOURCE + remote.local.HEALTH)
        self.assertEqual(req.get_header("Origin"), SOURCE)

    def test_direct_tailnet_model_request_uses_same_origin_and_fixed_backend(self):
        origin = "http://100.114.199.15:8766"
        status, _, _, opened = self.request("POST", remote.local.MODEL,
            host="100.114.199.15:8766", origin=origin, body=b'{"messages":[]}', tailnet_ip="100.114.199.15")
        self.assertEqual(status, 200)
        self.assertEqual(opened.call_args.args[0].full_url, SOURCE + remote.local.MODEL)
        self.assertEqual(opened.call_args.args[0].get_header("Origin"), SOURCE)
        status, _, _, opened = self.request(host="100.114.199.15:8766", origin="http://evil.example",
                                           tailnet_ip="100.114.199.15")
        self.assertEqual(status, 403)
        opened.assert_not_called()

    def test_model_request_preserves_text_and_images_and_uses_loopback_origin(self):
        body = json.dumps({"messages": [{"role": "user", "content": "Test", "images": ["image"]}],
                           "format": {"type": "object"}}).encode()
        status, _, _, opened = self.request("POST", remote.local.MODEL, origin=ORIGIN, body=body)
        self.assertEqual(status, 200)
        req = opened.call_args.args[0]
        self.assertEqual(req.data, body)
        self.assertEqual(req.get_method(), "POST")
        self.assertEqual(req.full_url, SOURCE + remote.local.MODEL)
        self.assertEqual(req.get_header("Origin"), SOURCE)

    def test_embeddings_use_the_existing_embedding_route(self):
        status, _, _, opened = self.request("POST", remote.local.EMBED, origin=ORIGIN, body=b'{"input":["test"]}')
        self.assertEqual(status, 200)
        self.assertEqual(opened.call_args.args[0].full_url, SOURCE + remote.local.EMBED)

    def test_unknown_hosts_cannot_use_proxy(self):
        for host in ["evil.example", AUTHORITY + ".evil.example", "studio.tail-example.ts.net:443"]:
            with self.subTest(host=host):
                status, _, _, opened = self.request(host=host)
                self.assertEqual(status, 421)
                opened.assert_not_called()

    def test_foreign_origins_are_rejected_before_reaching_model(self):
        for origin in ["https://evil.example", ORIGIN + ".evil.example", "null", "http://" + AUTHORITY]:
            with self.subTest(origin=origin):
                status, headers, _, opened = self.request("POST", remote.local.MODEL, origin=origin, body=b"{}")
                self.assertEqual(status, 403)
                self.assertNotIn("Access-Control-Allow-Origin", headers)
                opened.assert_not_called()

    def test_forwarded_host_does_not_override_the_host_guard(self):
        status, _, _, opened = self.request(host="evil.example", extra_headers={"X-Forwarded-Host": AUTHORITY})
        self.assertEqual(status, 421)
        opened.assert_not_called()

    def test_published_site_preflight_is_exact_and_grants_private_network(self):
        status, headers, _, opened = self.request("OPTIONS", remote.local.MODEL, origin="https://aimsetp.com",
                                                extra_headers={"Access-Control-Request-Private-Network": "true"})
        self.assertEqual(status, 204)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "https://aimsetp.com")
        self.assertEqual(headers["Access-Control-Allow-Private-Network"], "true")
        opened.assert_not_called()

    def test_unavailable_model_is_not_reported_as_healthy(self):
        error = urllib.error.HTTPError(SOURCE, 503, "Unavailable", {"Content-Type": "application/json"},
                                       io.BytesIO(b'{"service":"aimstep-local-eligibility-unavailable"}'))
        status, headers, data, _ = self.request(origin=ORIGIN, upstream=error)
        self.assertEqual(status, 503)
        self.assertEqual(headers["Access-Control-Allow-Origin"], ORIGIN)
        self.assertTrue(json.loads(data)["service"].endswith("-unavailable"))

    def test_stopped_local_backend_returns_clear_gateway_error(self):
        status, _, data, _ = self.request(upstream=urllib.error.URLError("connection refused"))
        self.assertEqual(status, 502)
        self.assertIn("local model backend", json.loads(data)["error"])

    def test_only_fixed_model_routes_are_forwarded(self):
        for path in ["/api/other", "/api/eligibility/health/../model", "/api/eligibility/http://evil.example"]:
            with self.subTest(path=path):
                status, _, _, opened = self.request(path=path)
                self.assertEqual(status, 404)
                opened.assert_not_called()

    def test_site_is_served_but_private_files_are_blocked(self):
        status, _, data, opened = self.request(path="/eligibility.html")
        self.assertEqual(status, 200)
        self.assertIn(b"Eligibility", data)
        opened.assert_not_called()
        for path in ["/.git/config", "/%2egit/config", "/fonts/../.git/config"]:
            with self.subTest(path=path):
                self.assertEqual(self.request(path=path)[0], 403)

    def test_large_and_invalid_bodies_are_rejected(self):
        for length, expected in [(str(remote.local.MAX_BODY + 1), 413), ("no", 400), ("0", 400)]:
            status, _, _, opened = self.request("POST", remote.local.MODEL,
                                                extra_headers={"Content-Length": length})
            self.assertEqual(status, expected)
            opened.assert_not_called()


class SetupTest(unittest.TestCase):
    def test_direct_mode_rejects_public_lan_and_wildcard_bind_addresses(self):
        self.assertEqual(remote.tailnet_ipv4("100.114.199.15"), "100.114.199.15")
        for address in ["0.0.0.0", "127.0.0.1", "192.168.1.5", "8.8.8.8", "::", "host.example"]:
            with self.subTest(address=address), self.assertRaises(ValueError):
                remote.tailnet_ipv4(address)

    def test_direct_mode_binds_only_the_given_interface_without_tailscale_cli(self):
        args = SimpleNamespace(tailnet_ip="100.114.199.15", port=PORT, source=SOURCE)
        with patch.object(remote, "read_json", return_value={"service": remote.local.SERVICE}), \
                patch.object(remote, "ThreadingHTTPServer") as server, \
                patch.object(remote.subprocess, "run") as run, patch("builtins.print"):
            remote.serve_tailnet_ip(args)
        self.assertEqual(server.call_args.args[0], ("100.114.199.15", PORT))
        server.return_value.__enter__.return_value.serve_forever.assert_called_once()
        run.assert_not_called()

    def test_remote_origin_requires_exact_private_https_site(self):
        self.assertEqual(remote.remote_origin(ORIGIN + "/"), ORIGIN)
        self.assertEqual(remote.remote_origin("https://studio.tail-example.ts.net:443"),
                         "https://studio.tail-example.ts.net")
        for url in ["http://studio.tail-example.ts.net", "https://evil.example", ORIGIN + "/path",
                    ORIGIN + "?next=evil", ORIGIN + "#x", "https://user@studio.tail-example.ts.net",
                    "https://studio.tail-example.ts.net:0", "https://studio..ts.net"]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                remote.remote_origin(url)

    def test_existing_services_and_public_funnels_are_never_overwritten(self):
        remote.check_serve_port({}, AUTHORITY, "http://127.0.0.1:8766", 8443)
        matching = {"TCP": {"8443": {"HTTPS": True}}, "Web": {AUTHORITY: {
            "Handlers": {"/": {"Proxy": "http://127.0.0.1:8766"}}}}}
        remote.check_serve_port(matching, AUTHORITY, "http://127.0.0.1:8766", 8443)
        for config in [{"AllowFunnel": {AUTHORITY: True}}, {"TCP": {"8443": {"TCPForward": "other"}}},
                       {"TCP": {"8443": {"HTTPS": True}}, "Web": {AUTHORITY: {
                           "Handlers": {"/": {"Proxy": "http://127.0.0.1:9999"}}}}}]:
            with self.subTest(config=config), self.assertRaises(RuntimeError):
                remote.check_serve_port(config, AUTHORITY, "http://127.0.0.1:8766", 8443)

    def test_tailscale_cli_failure_with_zero_exit_code_is_reported(self):
        with patch.object(remote.subprocess, "run", return_value=SimpleNamespace(
                stdout="The Tailscale CLI failed to start: Failed to load preferences.", stderr="", returncode=0)):
            with self.assertRaisesRegex(RuntimeError, "Tailscale 配置无法读取"):
                remote.tailscale_json("tailscale", "status")

    def test_empty_serve_json_is_a_valid_first_start(self):
        with patch.object(remote.subprocess, "run", return_value=SimpleNamespace(
                stdout="null\n", stderr="", returncode=0)):
            self.assertEqual(remote.tailscale_json("tailscale", "serve", "status"), {})
            with self.assertRaises(RuntimeError):
                remote.tailscale_json("tailscale", "status")

    def start(self, existing=False, reply=None):
        args = SimpleNamespace(port=PORT, https_port=8443, source=SOURCE)
        proxy = "http://127.0.0.1:8766"
        active = {"TCP": {"8443": {"HTTPS": True}}, "Web": {AUTHORITY: {
            "Handlers": {"/": {"Proxy": proxy}}}}}
        status = {"BackendState": "Running", "Self": {"DNSName": "studio.tail-example.ts.net."}}
        health = {"service": remote.local.SERVICE}
        running = {"service": remote.PROXY_SERVICE, "origin": ORIGIN, "source": SOURCE}
        replies = [health, running, health, reply or {"message": {"content": '{"ok":true}'}}]
        with patch.object(remote.shutil, "which", return_value="tailscale"), \
                patch.object(remote, "tailscale_json", side_effect=[status, active if existing else {}, active]), \
                patch.object(remote.socket, "create_connection"), \
                patch.object(remote, "read_json", side_effect=replies) as read, \
                patch.object(remote.subprocess, "run") as run, patch("builtins.print"):
            error = None
            try:
                remote.start_remote(args)
            except RuntimeError as e:
                error = e
        return error, read, run

    def test_start_verifies_model_through_the_remote_https_origin(self):
        error, read, run = self.start()
        self.assertIsNone(error)
        self.assertEqual(run.call_args_list[0].args[0],
                         ["tailscale", "serve", "--bg", "--https=8443", "http://127.0.0.1:8766"])
        self.assertEqual(read.call_args_list[2].args[0], ORIGIN + remote.local.HEALTH)
        self.assertEqual(read.call_args_list[3].args[0], ORIGIN + remote.local.MODEL)
        self.assertEqual(read.call_args_list[3].kwargs["origin"], ORIGIN)
        self.assertIn("messages", read.call_args_list[3].kwargs["body"])

    def test_failed_model_check_removes_only_the_new_serve_port(self):
        error, _, run = self.start(reply={"message": {"content": '{"ok":false}'}})
        self.assertIsNotNone(error)
        self.assertEqual(run.call_args_list[-1].args[0],
                         ["tailscale", "serve", "--bg", "--https=8443", "off"])
        self.assertEqual(run.call_count, 2)

    def test_failed_check_does_not_remove_preexisting_serve_config(self):
        error, _, run = self.start(existing=True, reply={"message": {"content": '{"ok":false}'}})
        self.assertIsNotNone(error)
        self.assertEqual(run.call_count, 1)


if __name__ == "__main__":
    unittest.main()
