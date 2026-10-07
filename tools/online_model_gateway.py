#!/usr/bin/env python3
"""Authenticated API-only gateway. Bind loopback; expose ONLY this port via Tunnel.
No static files, caller-selected URLs, credentials, or unauthenticated model routes.
Long model requests run as owner-scoped jobs so public proxy timeouts do not
interrupt inference. Config belongs outside the site: private/online-model.json.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import threading
import time
from types import SimpleNamespace
import urllib.error
import urllib.request
from urllib.parse import urlsplit

from google.auth.transport.requests import Request
from google.oauth2.id_token import verify_firebase_token

CONFIG = Path(__file__).resolve().parents[2] / 'private' / 'online-model.json'
PREFIX = '/api/eligibility'
MAX_BODY = 40 * 1024 * 1024
ORIGINS = {'https://aimsetp.com', 'https://www.aimsetp.com'}
UPSTREAM = 'http://127.0.0.1:8765'
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

class AccessError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message

class Certificates:
    """Short-lived cache of Google's public signing certificates, never tokens."""
    def __init__(self):
        self.lock = threading.Lock()
        self.expires = 0
        self.response = None
    def __call__(self, url, method='GET', **kwargs):
        with self.lock:
            if time.monotonic() < self.expires and self.response is not None:
                return self.response
            r = Request()(url, method=method, timeout=10, **kwargs)
            if r.status == 200:
                self.response = SimpleNamespace(status=r.status, data=r.data, headers=r.headers)
                self.expires = time.monotonic() + 300
            return r

class Identity:
    def __init__(self, config=CONFIG):
        self.config, self.certificates = Path(config), Certificates()
    def __call__(self, authorization):
        if not authorization.startswith('Bearer ') or len(authorization) > 16384:
            raise AccessError(401, 'Sign in to AIM-STEP to use AI tools.')
        try:
            claims = verify_firebase_token(authorization[7:], self.certificates, audience='aim-step')
        except ValueError:
            raise AccessError(401, 'Your session is invalid or expired. Sign in again.') from None
        except Exception:
            raise AccessError(503, 'Account verification is temporarily unavailable.') from None
        if (claims.get('iss') != 'https://securetoken.google.com/aim-step'
                or claims.get('email_verified') is not True
                or not isinstance(claims.get('sub'), str) or not 0 < len(claims['sub']) <= 128):
            raise AccessError(403, 'A verified account is required.')
        try:
            emails = json.loads(self.config.read_text())['allowedEmails']
            if not isinstance(emails, list) or not all(isinstance(x, str) for x in emails):
                raise ValueError()
        except (OSError, ValueError, KeyError, TypeError):
            raise AccessError(503, 'Online AI access is not configured.') from None
        if str(claims.get('email', '')).lower() not in {x.lower() for x in emails}:
            raise AccessError(403, 'This account is not authorized to use online AI tools.')
        return claims['sub']

def upstream(route, payload=None):
    request = urllib.request.Request(UPSTREAM + route,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json', 'Origin': UPSTREAM})
    try:
        with OPENER.open(request, timeout=650 if payload is not None else 20) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        # Keep provider keys, paths and upstream response bodies out of public errors.
        messages = {429: 'The model service is busy. Try again shortly.',
                    503: 'The model service is not configured or is unavailable.'}
        return e.code, {'error': messages.get(e.code, 'The model service could not complete this request.')}
    except Exception:
        return 502, {'error': 'The AIM-STEP model service is unavailable. Contact the administrator.'}

class Jobs:
    def __init__(self, worker=upstream):
        self.worker, self.lock, self.jobs = worker, threading.Lock(), {}
        self.pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix='aimstep-model')
    def submit(self, uid, route, body):
        with self.lock:
            now = time.monotonic()
            self.jobs = {k: v for k, v in self.jobs.items() if not v['future'].done() or (not v['cancelled'] and now - v['at'] < 1200)}
            own = [v for v in self.jobs.values() if v['uid'] == uid]
            if len(self.jobs) >= 64 or len(own) >= 32 or sum(not v['future'].done() for v in own) >= 8:
                raise AccessError(429, 'Too many pending requests. Wait for existing requests to finish.')
            key = secrets.token_urlsafe(24)
            self.jobs[key] = {'uid': uid, 'at': now, 'cancelled': False,
                              'future': self.pool.submit(self.worker, route, body)}
            return key
    def get(self, uid, key, cancel=False):
        with self.lock:
            job = self.jobs.get(key)
            if not job or job['uid'] != uid or job['cancelled']:
                raise AccessError(404, 'Request not found or expired.')
            future = job['future']
            if cancel:
                job['cancelled'] = True
                if future.cancel() or future.done():
                    self.jobs.pop(key, None)
                # Running upstream calls finish within their timeout. They still
                # count toward concurrency limits until they finish.
                return 200, {'cancelled': True}
            if not future.done():
                return 202, {'jobId': key, 'status': 'running'}
            status, result = future.result()
            # Poll result is retained briefly to permit retry after a lost response.
            return 200, {'status': 'complete', 'httpStatus': status, 'result': result}

class Handler(BaseHTTPRequestHandler):
    server_version = 'AIMSTEP-Online/1'
    def __init__(self, *args, identity, jobs, port=8767, **kwargs):
        self.identity, self.jobs, self.port = identity, jobs, port
        super().__init__(*args, **kwargs)
    def log_message(self, *args):
        pass  # Never log request URLs, auth headers, prompts or model output.
    def reply(self, status, value):
        data = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if self.headers.get('Origin') in ORIGINS:
            self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
            self.send_header('Vary', 'Origin')
        if self.command == 'OPTIONS':
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
            self.send_header('Access-Control-Max-Age', '600')
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass
    def guard(self):
        if self.headers.get('Host', '').lower() not in {'api.aimsetp.com', '127.0.0.1:%d' % self.port}:
            raise AccessError(421, 'Unknown API host.')
        origin = self.headers.get('Origin')
        if origin and origin not in ORIGINS:
            raise AccessError(403, 'Origin not allowed.')
        if self.path not in {PREFIX + '/health', PREFIX + '/model', PREFIX + '/embed'} and not self.path.startswith(PREFIX + '/jobs/'):
            raise AccessError(404, 'Not found.')
    def do_OPTIONS(self):
        try:
            self.guard()
            if self.headers.get('Origin') not in ORIGINS:
                raise AccessError(403, 'Origin required.')
            self.reply(200, {})
        except AccessError as e:
            self.reply(e.status, {'error': e.message})
    def dispatch(self):
        self.connection.settimeout(30)
        try:
            self.guard()
            uid = self.identity(self.headers.get('Authorization', ''))
            if self.path == PREFIX + '/health' and self.command == 'GET':
                status, data = upstream(self.path)
                return self.reply(status, {k: data[k] for k in ('service', 'model', 'status', 'embedModel', 'typesafe', 'error') if k in data})
            if self.path.startswith(PREFIX + '/jobs/') and self.command in {'GET', 'DELETE'}:
                status, data = self.jobs.get(uid, self.path[len(PREFIX + '/jobs/'):], self.command == 'DELETE')
                return self.reply(status, data)
            if self.command != 'POST' or self.path not in {PREFIX + '/model', PREFIX + '/embed'}:
                raise AccessError(405, 'Method not allowed.')
            try:
                length = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                length = 0
            if self.headers.get('Transfer-Encoding') or not 0 < length <= MAX_BODY:
                raise AccessError(413, 'Invalid request size.')
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise AccessError(400, 'Expected a JSON object.')
            if 'apiKey' in body or body.get('provider', 'local') not in {'local', 'typesafe'}:
                raise AccessError(400, 'Only server-configured AI models are available online.')
            key = self.jobs.submit(uid, self.path, body)
            self.reply(202, {'jobId': key, 'status': 'running'})
        except AccessError as e:
            self.reply(e.status, {'error': e.message})
        except (ValueError, UnicodeError):
            self.reply(400, {'error': 'Invalid JSON request.'})
        except Exception:
            self.reply(500, {'error': 'The online model request could not be processed.'})
    do_GET = dispatch
    do_POST = dispatch
    do_DELETE = dispatch
    do_HEAD = dispatch

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8767)
    parser.add_argument('--config', type=Path, default=CONFIG)
    args = parser.parse_args()
    identity, jobs = Identity(args.config), Jobs()
    handler = partial(Handler, identity=identity, jobs=jobs, port=args.port)
    with ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
        print('AIM-STEP authenticated API on 127.0.0.1:%d' % args.port, flush=True)
        server.serve_forever()

if __name__ == '__main__':
    main()
