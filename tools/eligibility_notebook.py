"""Append source-free eligibility service failures to the private notebook."""

from datetime import datetime, timezone
import json
import os
from pathlib import Path

from model_service_errors import ERRORS


DIRECTORY = Path(__file__).resolve().parents[2] / 'private' / 'eligibility-criteria' / 'notebook'
STAGES = {'transcription', 'local_model', 'source_review', 'author_answer'}


def record_error(directory, stage, code, count=1):
    if directory is None or stage not in STAGES or code not in ERRORS or type(count) is not int or count < 1:
        return
    now = datetime.now(timezone.utc)
    event = {'time': now.isoformat(timespec='seconds'), 'stage': stage, 'code': code, 'count': count}
    data = (json.dumps(event, separators=(',', ':')) + '\n').encode('utf-8')
    try:
        directory.mkdir(parents=True, mode=0o700, exist_ok=True)
        path = directory / (now.date().isoformat() + '.jsonl')
        with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600), 'ab', buffering=0) as log:
            log.write(data)
    except OSError:
        # Notebook storage is independent of inference and the caller's result.
        pass
