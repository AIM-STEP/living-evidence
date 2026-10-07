"""Private durable full-text queue shared by the local HTTP server and worker threads."""
from contextlib import contextmanager
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
import time

import fulltext_retriever

PRIVATE = Path(__file__).resolve().parents[2] / 'private'
CONFIG = PRIVATE / 'fulltext.json'
VERSION = '2026-10-06.1'


def config():
    try:
        value = json.loads(CONFIG.read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


class Queue:
    def __init__(self, directory, retrieve=fulltext_retriever.retrieve, settings=None):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.directory, 0o700)
        self.path = self.directory / 'queue.sqlite3'
        self.lock = threading.RLock()
        self.wake = threading.Event()
        self.retrieve = retrieve
        self.settings = settings or config
        self.started = False
        self.worker_lock = None
        with self.db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, owner TEXT, record TEXT, state TEXT, attempts TEXT, tries INTEGER, due REAL, updated REAL, result TEXT)')
        os.chmod(self.path, 0o600)

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def start(self):
        with self.lock:
            if self.started: return
            handle = open(self.directory / 'worker.lock', 'a')
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                handle.close()
                return
            self.worker_lock = handle
            with self.db() as db:
                db.execute("UPDATE jobs SET state='queued' WHERE state='running'")
            self.started = True
            # Single network worker limits publisher load and leaves models responsive.
            threading.Thread(target=self.run, name='aimstep-fulltext', daemon=True).start()

    def run(self):
        while True:
            try:
                if self.step(): continue
            except Exception:
                # An unexpected job exception must never terminate the persistent worker.
                pass
            self.wake.wait(5); self.wake.clear()

    @staticmethod
    def owner(token):
        if not isinstance(token, str) or not re.fullmatch(r'[a-f0-9]{64}', token):
            raise ValueError('Invalid private queue token.')
        return hashlib.sha256(token.encode()).hexdigest()

    def request(self, payload):
        if not isinstance(payload, dict): raise ValueError('Invalid request.')
        owner = self.owner(payload.get('token'))
        action = payload.get('action')
        if action == 'submit':
            records = payload.get('records')
            if not isinstance(records, list) or not 1 <= len(records) <= 128:
                raise ValueError('Submit between 1 and 128 records.')
            cleaned = []
            for record in records:
                try:
                    cleaned.append(fulltext_retriever.clean_record(record))
                except ValueError:
                    if len(records) == 1: raise
                    cleaned.append(None)
            jobs = []
            with self.lock, self.db() as db:
                count = db.execute('SELECT count(*) FROM jobs').fetchone()[0]
                for r in cleaned:
                    if r is None:
                        jobs.append({'id': '', 'error': 'invalid-record'}); continue
                    encoded = json.dumps(r, sort_keys=True, ensure_ascii=False)
                    ident = hashlib.sha256((owner + encoded).encode()).hexdigest()
                    prior = db.execute('SELECT * FROM jobs WHERE id=? AND owner=?', (ident, owner)).fetchone()
                    if not prior:
                        if count >= 10000: raise ValueError('Local queue capacity reached.')
                        db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?,?)', (ident, owner, encoded, 'queued', '[]', 0, 0, time.time(), '{}'))
                        count += 1
                    elif payload.get('force') and prior['state'] in ('none', 'retry', 'cancelled', 'failed'):
                        db.execute("UPDATE jobs SET state='queued', tries=0, due=0, updated=? WHERE id=?", (time.time(), ident))
                    jobs.append({'uid': r['uid'], 'id': ident})
            self.wake.set()
            return {'jobs': jobs}
        ids = payload.get('ids', [])
        if not isinstance(ids, list) or len(ids) > 128 or any(not isinstance(v, str) or not re.fullmatch('[a-f0-9]{64}', v) for v in ids):
            raise ValueError('Invalid job identifiers.')
        if action not in ('status', 'result', 'cancel'): raise ValueError('Unknown queue action.')
        if action == 'result' and len(ids) != 1: raise ValueError('Request one result at a time.')
        out = []
        with self.lock, self.db() as db:
            for ident in ids:
                row = db.execute('SELECT * FROM jobs WHERE id=? AND owner=?', (ident, owner)).fetchone()
                if not row: continue
                if action == 'cancel' and row['state'] in ('queued', 'running', 'retry'):
                    db.execute("UPDATE jobs SET state='cancelled', updated=? WHERE id=?", (time.time(), ident))
                item = {'id': ident, 'uid': json.loads(row['record'])['uid'], 'state': row['state'], 'retryAt': row['due'], 'attempts': json.loads(row['attempts'])}
                info = json.loads(row['result'])
                if info:
                    item['kind'] = info['kind']
                if action == 'result' and info:
                    file = self.directory / (ident + '.bin')
                    if file.is_file():
                        item['got'] = {**info, 'data': base64.b64encode(file.read_bytes()).decode('ascii')}
                    else:
                        db.execute("UPDATE jobs SET state='queued', result='{}', tries=0, due=0 WHERE id=?", (ident,))
                        item['state'] = 'queued'
                        self.wake.set()
                out.append(item)
        return {'jobs': out}

    def step(self):
        with self.lock, self.db() as db:
            row = db.execute("SELECT * FROM jobs WHERE state IN ('queued','retry') AND due<=? ORDER BY updated LIMIT 1", (time.time(),)).fetchone()
            if row is None: return False
            ident = row['id']
            lease = time.time()
            db.execute("UPDATE jobs SET state='running', updated=? WHERE id=?", (lease, ident))
        def cancelled():
            with self.lock, self.db() as db:
                current = db.execute('SELECT state, updated FROM jobs WHERE id=?', (ident,)).fetchone()
                return current['state'] != 'running' or current['updated'] != lease
        try:
            result = self.retrieve(json.loads(row['record']), self.settings(), cancelled=cancelled)
        except InterruptedError:
            return True
        except Exception as e:
            result = {'got': None, 'attempts': [{'source': 'Local assistant', 'status': type(e).__name__}]}
        with self.lock, self.db() as db:
            if cancelled(): return True
            got = result.get('got'); info = json.loads(row['result'])
            attempts = (json.loads(row['attempts']) + result.get('attempts', []))[-240:]
            tries = row['tries'] + 1
            if got:
                # Keep the original bytes. Nothing is placed in the published site tree.
                raw = got['data']; maximum = int(self.settings().get('cacheBytes', 2 * 1024 ** 3))
                usage = sum(p.stat().st_size for p in self.directory.glob('*.bin'))
                if usage + len(raw) > maximum:
                    attempts.append({'source': 'Local cache', 'status': 'capacity-reached'})
                    got = None
                else:
                    path = self.directory / (ident + '.bin')
                    temp = self.directory / (ident + '.tmp')
                    with open(temp, 'wb') as stream:
                        os.chmod(temp, 0o600); stream.write(raw); stream.flush(); os.fsync(stream.fileno())
                    temp.replace(path)
                    info = {k: v for k, v in got.items() if k != 'data'}
                    info['sha256'] = hashlib.sha256(raw).hexdigest()
            ready = info.get('kind') == 'pdf'
            state = 'ready' if ready else ('retry' if tries < 3 else 'none')
            due = 0 if ready else time.time() + max([900, 21600, 86400][min(tries - 1, 2)], result.get('retryAfter', 0))
            db.execute('UPDATE jobs SET state=?, attempts=?, tries=?, due=?, updated=?, result=? WHERE id=?',
                       (state, json.dumps(attempts), tries, due, time.time(), json.dumps(info), ident))
        return True


_instance = None
_instance_lock = threading.Lock()


def instance():
    global _instance
    with _instance_lock:
        if _instance is None:
            _instance = Queue(PRIVATE / 'fulltext')
            _instance.start()
    return _instance


def health():
    return {'service': 'aimstep-fulltext-assistant', 'version': VERSION, 'modelsRequired': False, 'persistentQueue': True}
