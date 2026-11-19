#!/usr/bin/env python3
"""Authenticated API-only gateway. Bind loopback; expose ONLY this port via Tunnel.
No static files, caller-selected URLs, credentials, or unauthenticated model routes.
Long model requests run as owner-scoped jobs so public proxy timeouts do not
interrupt inference. Config belongs outside the site: private/online-model.json.
"""
import argparse
import errno
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from http.client import HTTPException
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
from model_service_errors import ERRORS, public_error

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

def safe_http_error(error):
    # Provider text can contain private inputs, keys or paths. Only reconstruct
    # a locally known code when its HTTP status also matches the contract.
    try:
        with error:
            raw = error.read(4097)
        data = json.loads(raw) if len(raw) <= 4096 else None
    except (OSError, ValueError, HTTPException):
        data = None
    code = data.get('code') if isinstance(data, dict) else None
    if isinstance(code, str) and code in ERRORS and ERRORS[code][0] == error.code:
        return public_error(code)
    fallback = {400: 'MODEL_REQUEST_INVALID', 429: 'MODEL_BUSY', 502: 'MODEL_UPSTREAM_ERROR',
                503: 'MODEL_UNAVAILABLE', 504: 'MODEL_TIMEOUT'}.get(error.code)
    if fallback:
        return public_error(fallback)
    return error.code, {'error': 'The model service could not complete this request.'}


def upstream(route, payload=None):
    request = urllib.request.Request(UPSTREAM + route,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json', 'Origin': UPSTREAM})
    for attempt in range(2):
        try:
            with OPENER.open(request, timeout=650 if payload is not None else 20) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as error:
            return safe_http_error(error)
        except (urllib.error.URLError, OSError) as error:
            cause = getattr(error, 'reason', error)
            if isinstance(cause, TimeoutError):
                return public_error('MODEL_TIMEOUT')
            if attempt == 0 and (isinstance(cause, ConnectionRefusedError) or getattr(cause, 'errno', None) == errno.ECONNREFUSED):
                # No connection was established, so the service never accepted
                # this submission. Retrying a timeout or reset could duplicate work.
                time.sleep(0.25)
                continue
            return public_error('MODEL_UNAVAILABLE')
        except (ValueError, HTTPException):
            return public_error('MODEL_UPSTREAM_ERROR')

class Jobs:
    delivery_ttl = 1200

    def __init__(self, worker=upstream):
        self.worker, self.lock, self.jobs = worker, threading.Lock(), {}
        self.pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix='aimstep-model')
    def submit(self, uid, route, body):
        with self.lock:
            now = time.monotonic()
            own = [v for v in self.jobs.values() if v['uid'] == uid]
            if len(self.jobs) >= 64 or len(own) >= 32 or sum(not v['future'].done() for v in own) >= 8:
                raise AccessError(429, 'Too many pending requests. Wait for existing requests to finish.')
            key = secrets.token_urlsafe(24)
            future = self.pool.submit(self.worker, route, body)
            self.jobs[key] = {'uid': uid, 'at': now, 'cancelled': False, 'future': future}
        # add_done_callback may run synchronously for a completed job. Register
        # it outside the lock, and never capture body or future in the closure.
        future.add_done_callback(lambda _: self.finish(key))
        return key

    def finish(self, key):
        with self.lock:
            job = self.jobs.get(key)
            if not job:
                return
            if job['cancelled']:
                self.jobs.pop(key, None)
                return
            # A lost submission/poll can leave a completed job undelivered.
            # Expire it even if there are no subsequent requests to the gateway.
            timer = threading.Timer(max(0, job['at'] + self.delivery_ttl - time.monotonic()), self.expire, (key,))
            timer.daemon = True
            job['timer'] = timer
            timer.start()

    def expire(self, key):
        with self.lock:
            self.jobs.pop(key, None)
    def get(self, uid, key, cancel=False):
        with self.lock:
            job = self.jobs.get(key)
            if not job or job['uid'] != uid or job['cancelled']:
                raise AccessError(404, 'Request not found or expired.')
            future = job['future']
            if cancel:
                job['cancelled'] = True
                if future.done():
                    self.jobs.pop(key, None)
                    if 'timer' in job:
                        job['timer'].cancel()
            elif not future.done():
                return 202, {'jobId': key, 'status': 'running'}
            else:
                status, result = future.result()
                # Retain pending delivery to permit retry after a lost response.
                return 200, {'status': 'complete', 'httpStatus': status, 'result': result}
        # A queued future may immediately run callbacks inside cancel(). Active
        # jobs remain counted until completion, when their reply is discarded.
        future.cancel()
        return 200, {'cancelled': True}

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
        if self.headers.get('Host', '').lower() not in {'ai.aimsetp.com', 'api.aimsetp.com', '127.0.0.1:%d' % self.port}:
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
