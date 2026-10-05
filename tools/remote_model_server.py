#!/usr/bin/env python3
"""Share the AIM-STEP site and its model through private Tailscale HTTPS.

Run on the model server: python3 tools/remote_model_server.py
Then open the printed HTTPS URL on a computer in the same tailnet.
The existing local_model_server.py on 127.0.0.1:8765 must be running.

If Serve is unavailable, --tailnet-ip <assigned IPv4> serves HTTP directly
on that Tailscale interface in the foreground, without invoking its CLI.

Tailscale Serve terminates HTTPS and applies the tailnet's access rules.
A small loopback proxy serves the site and forwards only the three model
routes to the existing backend. It validates the external Host and Origin,
then rewrites them for the loopback backend. Neither Ollama nor that backend
needs to listen on a network interface in HTTPS mode. Standard library only.
"""

from __future__ import annotations

import argparse
import ipaddress
import json
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

import local_model_server as local

PROXY_SERVICE = "aimstep-tailscale-proxy"
PROXY_HEALTH = "/api/remote-model/health"
ROUTES = {local.HEALTH, local.MODEL, local.EMBED}
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def tailnet_ipv4(value):
    address = ipaddress.IPv4Address(value)
    if address not in ipaddress.IPv4Network("100.64.0.0/10"):
        raise ValueError("--tailnet-ip must be the server's assigned Tailscale IPv4 address")
    return str(address)


def remote_origin(value):
    """An exact Tailscale HTTPS origin, never a wildcard or a public tunnel."""
    p = urlsplit(value)
    if (p.scheme != "https" or p.username or p.password or p.query or p.fragment
            or p.path not in ("", "/")
            or not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\."
                                r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.ts\.net", p.hostname or "")):
        raise ValueError("expected https://device.tailnet.ts.net[:port]")
    port = p.port if p.port is not None else 443
    if not 1 <= port <= 65535:
        raise ValueError("invalid HTTPS port")
    return "https://" + p.hostname + (":" + str(port) if port != 443 else "")


class Handler(SimpleHTTPRequestHandler):
    server_version = "AIMSTEP-remote/1"

    def __init__(self, *args, origin, port, source, tailnet_ip=None, **kwargs):
        if tailnet_ip is not None:
            expected = "http://%s:%d" % (tailnet_ipv4(tailnet_ip), port)
            if origin != expected:
                raise ValueError("direct origin must match the assigned Tailscale address and port")
        else:
            origin = remote_origin(origin)
        self.origin, self.port, self.source = origin, port, source
        self.remote_authority = urlsplit(self.origin).netloc
        self.allowed_origins = {self.origin, *local.DEFAULT_ALLOWED_ORIGINS}
        super().__init__(*args, **kwargs)

    def _host_ok(self):
        return (self.headers.get("Host") or "").lower() in {
            self.remote_authority, "127.0.0.1:%d" % self.port, "localhost:%d" % self.port}

    def _origin_ok(self):
        origin = self.headers.get("Origin")
        return not origin or origin in self.allowed_origins or origin in {
            "http://127.0.0.1:%d" % self.port, "http://localhost:%d" % self.port}

    def _cors(self):
        origin = self.headers.get("Origin")
        if origin in self.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def _json(self, status, value):
        self._reply(status, json.dumps(value).encode(), "application/json; charset=utf-8")

    def _reply(self, status, body, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _guard(self):
        if not self._host_ok():
            self._json(421, {"error": "unrecognised site address"})
            return False
        if not self._origin_ok():
            self._json(403, {"error": "origin not allowed"})
            return False
        return True

    def _proxy(self, body=None):
        route = urlsplit(self.path).path
        # A fixed loopback destination and fixed routes: no caller-controlled URL.
        req = urllib.request.Request(self.source + route, data=body,
                                     headers={"Content-Type": "application/json", "Origin": self.source},
                                     method=self.command)
        try:
            with OPENER.open(req, timeout=650 if body is not None else 15) as res:
                self._reply(res.status, res.read(), res.headers.get("Content-Type", "application/json"))
        except urllib.error.HTTPError as e:
            with e:
                self._reply(e.code, e.read(), e.headers.get("Content-Type", "application/json"))
        except (urllib.error.URLError, OSError) as e:
            self._json(502, {"error": "local model backend is unavailable: %s" % e})

    def do_GET(self):
        if not self._guard():
            return
        path = urlsplit(self.path).path
        if path == PROXY_HEALTH:
            return self._json(200, {"service": PROXY_SERVICE, "origin": self.origin, "source": self.source})
        if path == local.HEALTH:
            return self._proxy()
        if path.startswith("/api/"):
            return self._json(404, {"error": "not found"})
        if any(part.startswith(".") for part in unquote(path).split("/") if part):
            return self._json(403, {"error": "private files are not served"})
        return super().do_GET()

    def do_HEAD(self):
        if not self._guard():
            return
        path = urlsplit(self.path).path
        if path.startswith("/api/") or any(part.startswith(".") for part in unquote(path).split("/") if part):
            return self.send_error(404)
        return super().do_HEAD()

    def do_POST(self):
        if not self._guard():
            return
        if urlsplit(self.path).path not in (local.MODEL, local.EMBED):
            return self._json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = -1
        if not 0 < length <= local.MAX_BODY or self.headers.get("Transfer-Encoding"):
            return self._json(413 if length > local.MAX_BODY else 400, {"error": "invalid request length"})
        return self._proxy(self.rfile.read(length))

    def do_OPTIONS(self):
        if not self._guard():
            return
        if urlsplit(self.path).path not in ROUTES:
            return self._json(404, {"error": "not found"})
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        if self.headers.get("Access-Control-Request-Private-Network"):
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def end_headers(self):
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))


def read_json(url, body=None, origin=None, timeout=15):
    headers = {"Content-Type": "application/json"}
    if origin:
        headers["Origin"] = origin
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), headers=headers)
    with OPENER.open(req, timeout=timeout) as res:
        return json.loads(res.read())


def tailscale_json(binary, *args):
    res = subprocess.run([binary, *args, "--json"], capture_output=True, text=True, timeout=20)
    try:
        value = json.loads(res.stdout)
    except ValueError:
        raise RuntimeError("Tailscale 配置无法读取。请在服务器的普通终端运行本脚本。\n" +
                           (res.stderr or res.stdout).strip()) from None
    # No Serve configuration yet can be represented as JSON null.
    if value is None and args == ("serve", "status"):
        value = {}
    if res.returncode or not isinstance(value, dict):
        raise RuntimeError("Tailscale 命令失败：" + (res.stderr or res.stdout).strip())
    return value


def check_serve_port(config, authority, source, port):
    """Leave every other Serve port alone; refuse to replace an existing app."""
    if config.get("AllowFunnel", {}).get(authority):
        raise RuntimeError("所选端口已有公网 Funnel；请通过 --https-port 使用另一个端口。")
    tcp = config.get("TCP", {}).get(str(port))
    handlers = config.get("Web", {}).get(authority, {}).get("Handlers", {})
    if ((tcp is not None and (not tcp.get("HTTPS") or handlers != {"/": {"Proxy": source}}))
            or (tcp is None and handlers)):
        raise RuntimeError("所选 HTTPS 端口已有其他服务；请通过 --https-port 使用另一个端口。")


def start_remote(args):
    binary = shutil.which("tailscale")
    if not binary:
        raise RuntimeError("请先在服务器安装并登录 Tailscale。")
    status = tailscale_json(binary, "status")
    if status.get("BackendState") != "Running":
        raise RuntimeError("请先在服务器登录并连接 Tailscale。")
    dns = (status.get("Self", {}).get("DNSName") or "").rstrip(".")
    origin = remote_origin("https://" + dns + (":" + str(args.https_port) if args.https_port != 443 else ""))
    proxy = "http://127.0.0.1:%d" % args.port
    # Serve status uses host:port even when HTTPS runs on the default 443.
    serve_authority = dns + ":" + str(args.https_port)
    serve_config = tailscale_json(binary, "serve", "status")
    check_serve_port(serve_config, serve_authority, proxy, args.https_port)
    new_serve = str(args.https_port) not in serve_config.get("TCP", {})
    health = read_json(args.source + local.HEALTH)
    if health.get("service") != local.SERVICE:
        raise RuntimeError("本地模型尚未就绪：" + str(health.get("status", health)))

    child = None
    try:
        with socket.create_connection(("127.0.0.1", args.port), timeout=2):
            try:
                running = read_json(proxy + PROXY_HEALTH)
            except (ValueError, urllib.error.URLError, OSError) as e:
                raise RuntimeError("本机 %d 端口已有其他服务；请用 --port 选择另一个端口。" % args.port) from e
            if running != {"service": PROXY_SERVICE, "origin": origin, "source": args.source}:
                raise RuntimeError("本机 %d 端口已有其他服务；请用 --port 选择另一个端口。" % args.port)
    except ConnectionRefusedError:
        log_dir = Path(__file__).resolve().parents[1] / "logs"
        log_dir.mkdir(exist_ok=True)
        with (log_dir / "remote-model-server.log").open("ab") as log:
            child = subprocess.Popen([sys.executable, "-u", str(Path(__file__).resolve()), "--worker",
                                      "--origin", origin, "--port", str(args.port), "--source", args.source],
                                     stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
        try:
            for _ in range(50):
                if child.poll() is not None:
                    raise RuntimeError("远程入口启动失败；请查看 logs/remote-model-server.log。")
                try:
                    ready = read_json(proxy + PROXY_HEALTH, timeout=1)
                    if ready == {"service": PROXY_SERVICE, "origin": origin, "source": args.source}:
                        break
                except (urllib.error.URLError, OSError):
                    time.sleep(.1)
            else:
                raise RuntimeError("远程入口启动超时。")
        except BaseException:
            child.terminate()
            raise

    print("正在启用 Tailscale HTTPS；若提示开启 HTTPS，请按 Tailscale 给出的链接完成。", flush=True)
    served = False
    try:
        subprocess.run([binary, "serve", "--bg", "--https=%d" % args.https_port, proxy], check=True)
        served = True
        check_serve_port(tailscale_json(binary, "serve", "status"), serve_authority, proxy, args.https_port)
        remote_health = read_json(origin + local.HEALTH, origin=origin, timeout=30)
        if remote_health.get("service") != local.SERVICE:
            raise RuntimeError("远程模型健康检查未通过。")
        reply = read_json(origin + local.MODEL, origin=origin, timeout=650, body={"messages": [
            {"role": "system", "content": "Return JSON only."},
            {"role": "user", "content": 'Return exactly {"ok":true}.'}]})
        content = (reply.get("message") or {}).get("content", "")
        result = json.loads(local._unfence(content))
        if not isinstance(result, dict) or result.get("ok") is not True:
            raise RuntimeError("远程模型调用没有返回预期结果。")
    except BaseException:
        if served and new_serve:
            try:
                subprocess.run([binary, "serve", "--bg", "--https=%d" % args.https_port, "off"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
            except (OSError, subprocess.SubprocessError):
                pass
        if child is not None:
            child.terminate()
        raise
    print("远程健康检查和模型调用均通过。")
    print("在另一台已连接同一 Tailscale 网络的电脑打开：\n" + origin + "/eligibility.html")
    print("后台运行；日志：" + str(Path(__file__).resolve().parents[1] / "logs/remote-model-server.log"))


def serve_tailnet_ip(args):
    """Explicit fallback when Serve is unavailable; bind only the tailnet interface."""
    address = tailnet_ipv4(args.tailnet_ip)
    origin = "http://%s:%d" % (address, args.port)
    health = read_json(args.source + local.HEALTH)
    if health.get("service") != local.SERVICE:
        raise RuntimeError("本地模型尚未就绪：" + str(health))
    handler = partial(Handler, origin=origin, port=args.port, source=args.source,
                      tailnet_ip=address, directory=str(Path(__file__).resolve().parents[1]))
    # Binding an unassigned IP fails. Never fall back to 0.0.0.0.
    with ThreadingHTTPServer((address, args.port), handler) as httpd:
        print("本地模型健康检查通过。远程入口已监听服务器的 Tailscale 地址。", flush=True)
        print("在另一台已连接同一 Tailscale 网络的电脑打开：\n" + origin + "/eligibility.html", flush=True)
        print("请保持此终端运行；Ctrl+C 停止。远程浏览器连接尚待验证。", flush=True)
        httpd.serve_forever()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--port", type=int, default=8766, help="proxy port (default: 8766)")
    ap.add_argument("--tailnet-ip", help="serve HTTP directly on this assigned Tailscale IPv4, in foreground")
    ap.add_argument("--https-port", type=int, default=8443, help="private Tailscale HTTPS port (default: 8443)")
    ap.add_argument("--source", default="http://127.0.0.1:8765", help="existing local model server")
    ap.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    ap.add_argument("--origin", help=argparse.SUPPRESS)
    args = ap.parse_args(argv)
    if args.tailnet_ip and args.worker:
        ap.error("--tailnet-ip cannot be combined with --worker")
    if not all(1 <= p <= 65535 for p in (args.port, args.https_port)):
        ap.error("ports must be between 1 and 65535")
    p = urlsplit(args.source)
    if (p.scheme != "http" or p.hostname != "127.0.0.1" or p.username or p.password
            or p.path not in ("", "/") or p.query or p.fragment):
        ap.error("--source must be an HTTP origin on 127.0.0.1")
    try:
        source_port = p.port if p.port is not None else 80
        if not 1 <= source_port <= 65535:
            raise ValueError("invalid source port")
    except ValueError as e:
        ap.error(str(e))
    args.source = "http://127.0.0.1:%d" % source_port
    if args.port == source_port:
        ap.error("--port must differ from the existing model server port")
    try:
        if args.tailnet_ip:
            serve_tailnet_ip(args)
        elif not args.worker:
            start_remote(args)
        else:
            if not args.origin:
                ap.error("worker needs --origin")
            handler = partial(Handler, origin=remote_origin(args.origin), port=args.port, source=args.source,
                              directory=str(Path(__file__).resolve().parents[1]))
            with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as httpd:
                httpd.serve_forever()
    except (ValueError, OSError, RuntimeError, urllib.error.URLError, subprocess.SubprocessError) as e:
        print("启动失败：" + str(e), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
