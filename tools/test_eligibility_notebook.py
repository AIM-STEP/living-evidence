import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import local_model_server as server


class Connection:
    def __init__(self, raw):
        self.input = io.BytesIO(raw)
        self.output = bytearray()

    def makefile(self, *_args):
        return self.input

    def sendall(self, data):
        self.output.extend(data)


class NotebookTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.notebook = Path(temp.name) / 'notebook'

    def request(self, **fields):
        body = json.dumps({'provider': 'local', 'workflow': 'eligibility-criteria',
                           'messages': [{'role': 'user', 'content': 'synthetic private question'}],
                           **fields}).encode()
        raw = (f'POST {server.MODEL} HTTP/1.1\r\nHost: localhost\r\n'
               f'Connection: close\r\nContent-Length: {len(body)}\r\n\r\n').encode() + body
        connection = Connection(raw)
        with patch.object(server.Handler, 'log_message'):
            server.Handler(connection, ('127.0.0.1', 12345), SimpleNamespace(),
                           model='synthetic-model', ollama='http://127.0.0.1:11434',
                           port=8765, notebook_dir=self.notebook)
        head, content = bytes(connection.output).split(b'\r\n\r\n', 1)
        return int(head.split()[1]), json.loads(content)

    def events(self):
        files = list(self.notebook.glob('*.jsonl'))
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0].stat().st_mode & 0o777, 0o600)
        return [json.loads(line) for line in files[0].read_text().splitlines()]

    def test_local_failure_records_only_fixed_metadata(self):
        with patch.object(server.eligibility_transport, 'chat',
                          side_effect=TimeoutError('synthetic private provider text')):
            status, response = self.request()
        self.assertEqual((status, response['code']), (504, 'MODEL_TIMEOUT'))
        (event,) = self.events()
        self.assertEqual(set(event), {'time', 'stage', 'code', 'count'})
        self.assertEqual((event['stage'], event['code'], event['count']),
                         ('local_model', 'MODEL_TIMEOUT', 1))

    def test_missing_independent_verdict_is_logged_without_changing_response(self):
        reply = {'message': {'content': 'synthetic result'}, 'provider': 'typesafe',
                 'review': {'typesafe_unavailable': 0}}
        with patch.object(server.eligibility_hybrid_review, 'review', return_value=reply):
            self.assertEqual(self.request(task=server.eligibility_hybrid_review.TASK)[0], 200)
            self.assertFalse(self.notebook.exists())
            reply['review']['typesafe_unavailable'] = 1
            status, response = self.request(task=server.eligibility_hybrid_review.TASK)
        self.assertEqual(status, 200)
        self.assertEqual(response['message']['content'], 'synthetic result')
        (event,) = self.events()
        self.assertEqual((event['stage'], event['code'], event['count']),
                         ('source_review', 'MODEL_REVIEW_INCOMPLETE', 1))

    def test_unwritable_notebook_keeps_the_model_error(self):
        self.notebook.touch()
        with patch.object(server.eligibility_transport, 'chat', side_effect=TimeoutError()):
            status, response = self.request()
        self.assertEqual((status, response['code']), (504, 'MODEL_TIMEOUT'))
