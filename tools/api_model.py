"""Server-only configuration for a compatible text-generation API."""
import json
import os
import urllib.request
from urllib.parse import urlsplit


def config():
    return {k: os.environ.get('AIMSTEP_API_' + k.upper(), '').strip()
            for k in ('url', 'model', 'key')}


def status():
    c = config()
    host = (urlsplit(c['url']).hostname or '').lower()
    if host == 'typesafe.ai' or host.endswith('.typesafe.ai'):
        return False, 'TypeSafe supports structured decisions, not criteria text generation. Choose a text-generation API or the local model.'
    if not all(c.values()):
        return False, 'API is not configured on the server. Set AIMSTEP_API_URL, AIMSTEP_API_MODEL and AIMSTEP_API_KEY.'
    p = urlsplit(c['url'])
    if p.scheme != 'https' or not p.hostname or p.username or p.password or p.query or p.fragment:
        return False, 'AIMSTEP_API_URL must be an HTTPS chat/completions endpoint without credentials or query parameters.'
    return True, 'configured'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def chat(messages, timeout=600):
    ready, reason = status()
    if not ready:
        raise ValueError(reason)
    c = config()
    converted = []
    for message in messages:
        item = {'role': message['role'], 'content': message['content']}
        if message.get('images'):
            raise ValueError('API mode currently accepts text documents only. Use the local model for images or scanned PDFs.')
        converted.append(item)
    body = {'model': c['model'], 'messages': converted, 'stream': False,
            'response_format': {'type': 'json_object'}}
    req = urllib.request.Request(c['url'], data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c['key']})
    # Never forward the API key to a redirect destination.
    with urllib.request.build_opener(NoRedirect()).open(req, timeout=timeout) as response:
        reply = json.loads(response.read())
    try:
        content = reply['choices'][0]['message']['content']
        if not isinstance(content, str) or not content.strip():
            raise ValueError()
    except (KeyError, IndexError, TypeError, ValueError):
        raise ValueError('API returned no text in choices[0].message.content.') from None
    return {'message': {'role': 'assistant', 'content': content}}
