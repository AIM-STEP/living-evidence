#!/usr/bin/env python3
"""Serve the AIM-STEP site locally, with the eligibility page's model backend.

    python3 tools/local_model_server.py
    # then open http://127.0.0.1:8765/eligibility.html

eligibility.html looks for a same-origin backend before anything else:

    GET  api/eligibility/health  -> {"service": "aimstep-local-eligibility", ...}
    POST api/eligibility/model   <- {"messages": [...]}
                                 -> an Ollama /api/chat reply, {"message": {"content": "..."}}

Until now nothing answered those two paths, so the page fell back to calling
Ollama straight from the browser. That works from localhost, but it runs the
model with thinking on, which on gemma4:31b made one "Machine generate" take
336 s (four calls). This server answers them, and in doing so it fixes the
request the browser cannot be trusted to shape:

  * the model is chosen here, not by the page (--model);
  * thinking is off (think: false) - measured 5x faster, same content;
  * temperature 0, JSON output, a context and reply length that fit the
    page's prompts;
  * a reply that is not a JSON object is repaired rather than thrown away:
    the model fixes its own syntax, and only if that fails is it regenerated
    once (see chat()).

LOCAL ONLY. It binds 127.0.0.1, refuses a Host header that is not this
machine (DNS rebinding), and refuses a request whose Origin is another site, so
a web page elsewhere cannot use it to reach the model. The one exception is the
project's own published site (--allow-origin, default aimsetp.com): opened
there, eligibility.html finds no backend on GitHub Pages and falls back to
this server at http://127.0.0.1:8765, so that origin gets CORS headers and
preflight answers. Any other origin is still refused. Local mode sends research text only to Ollama on this machine. Explicit API
mode sends it to the server-configured HTTPS provider; keys stay server-side.

AUDIT. --log-dir DIR appends every exchange (messages in, reply out, model,
timing) to DIR/eligibility-YYYY-MM-DD.jsonl, so a draft can be traced back to
exactly what the model was asked and answered. Off by default: the log holds
the research text.

Model routes use the standard library. The optional full-text assistant uses
PyMuPDF for PDF identity checks; Python 3.10+.
"""

from __future__ import annotations

import argparse
import api_model
import typesafe_model
import fulltext_sources
import fulltext_assistant
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

SERVICE = "aimstep-local-eligibility"
HEALTH = "/api/eligibility/health"
MODEL = "/api/eligibility/model"
EMBED = "/api/eligibility/embed"

DEFAULT_MODEL = "gemma4:31b-it-q8_0"
DEFAULT_EMBED_MODEL = "embeddinggemma"   # full-text screening: semantic highlighting
MAX_EMBED_INPUTS = 512
MAX_EMBED_CHARS = 4000              # per text; embeddinggemma reads about 2,000 tokens
EMBED_TIMEOUT = 180
DEFAULT_OLLAMA = "http://127.0.0.1:11434"

MAX_BODY = 40 * 1024 * 1024        # six page images as base64 fit with room to spare
MAX_MESSAGES = 20
ROLES = {"system", "user", "assistant"}
NUM_CTX = 16384                     # the page caps sources at 24,000 characters
NUM_PREDICT = 4096                  # synthesis returns criteria plus a Methods paragraph
TIMEOUT = 600                       # the page itself gives up after 10 minutes

LOCAL_HOSTS = {"127.0.0.1", "localhost", "[::1]", "::1"}
DEFAULT_ALLOWED_ORIGINS = ("https://aimsetp.com", "http://aimsetp.com",
                           "https://www.aimsetp.com", "http://www.aimsetp.com")


class BadRequest(ValueError):
    pass


def clean_messages(payload):
    """The page's {"messages": [...]}, checked. Anything else is refused, not repaired."""
    if not isinstance(payload, dict) or not isinstance(payload.get("messages"), list):
        raise BadRequest("expected {\"messages\": [...]}")
    messages = payload["messages"]
    if not 1 <= len(messages) <= MAX_MESSAGES:
        raise BadRequest("between 1 and %d messages" % MAX_MESSAGES)
    out = []
    for m in messages:
        if not isinstance(m, dict) or m.get("role") not in ROLES or not isinstance(m.get("content"), str):
            raise BadRequest("each message needs a role and a string content")
        item = {"role": m["role"], "content": m["content"]}
        images = m.get("images")
        if images is not None:
            if not isinstance(images, list) or not all(isinstance(i, str) for i in images) or len(images) > 6:
                raise BadRequest("images must be at most six base64 strings")
            item["images"] = images
        out.append(item)
    return out


MAX_SCHEMA = 20000                  # characters of JSON schema a page may pass


def clean_format(payload):
    """An optional JSON schema from the page (search-strategy.html passes one).

    Anything that is not a small JSON object falls back to plain "json"; the
    page validates the reply either way.
    """
    fmt = payload.get("format") if isinstance(payload, dict) else None
    if isinstance(fmt, dict) and len(json.dumps(fmt)) <= MAX_SCHEMA:
        return fmt
    return "json"


def ollama_body(model, messages, temperature=0, fmt="json"):
    return {
        "model": model,
        "messages": messages,
        "stream": False,
        "think": False,
        "format": fmt,
        "options": {"temperature": temperature, "num_ctx": NUM_CTX, "num_predict": NUM_PREDICT},
    }


def _unfence(text):
    s = (text or "").strip()
    if s.startswith("```"):
        s = s.strip("`")
        s = s[4:] if s.lower().startswith("json") else s
    return s.strip()


def is_json_object(text):
    """Valid JSON whose top level is an object or a list.

    Pages validate the shape themselves. A list is accepted because local
    models often return the list a schema wraps ({"wordsByCriterion": [...]}
    comes back as [...]), and repairing or regenerating a valid reply only
    costs time and returns the same list.
    """
    try:
        return isinstance(json.loads(_unfence(text)), (dict, list))
    except ValueError:
        return False


# A deterministic rewrite was tried and dropped. Seen from gemma4:31b on
# "sample size greater than 20": {"value">> 20"} where {"value":"> 20"} was
# meant. Whether the ">" replaced the colon or is part of the value cannot be
# told from the text, and guessing wrong turns ">=5" into "=5" - a changed
# eligibility threshold. The model, which can see "greater than 20" in the
# source sentence, repairs it instead.
REPAIR_PROMPT = ("You repair malformed JSON. The user message is a JSON document with syntax errors "
                 "(for example a missing colon or quote). Return the same document as valid JSON: same keys, "
                 "same values, same order, same wording. Fix only the syntax. Return JSON only.")


def post_json(url, body, timeout=TIMEOUT):
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8"))


def _content(reply):
    return ((reply or {}).get("message") or {}).get("content", "")


def chat(ollama, model, messages, post=post_json, attempts=None, fmt="json"):
    """Return a reply whose content is a JSON object, trying in order:

      1. the reply as generated;
      2. the model repairing its own reply's syntax - keeps what was extracted,
         which regenerating would not (measured on a real failure: 8 of 8
         items kept verbatim, "> 20" restored, 54 s);
      3. one regeneration with a little temperature, for a reply too broken to
         repair (e.g. a repetition loop).

    `attempts`, if given, is filled with what happened, for the log.
    """
    log = attempts if attempts is not None else []
    reply = post(ollama + "/api/chat", ollama_body(model, messages, fmt=fmt))
    content = _content(reply)
    if is_json_object(content):
        log.append("ok")
        return reply
    log.append("invalid")
    if content.strip():
        repaired = post(ollama + "/api/chat", ollama_body(model, [
            {"role": "system", "content": REPAIR_PROMPT}, {"role": "user", "content": content}]))
        if is_json_object(_content(repaired)):
            log.append("model-repair")
            return repaired
        log.append("model-repair-failed")
    # Temperature 0 repeats a degenerate path exactly; a little noise leaves it.
    log.append("regenerate")
    return post(ollama + "/api/chat", ollama_body(model, messages, temperature=0.3, fmt=fmt))


def clean_embed(payload):
    """{"input": [texts]} from the page, checked."""
    texts = payload.get("input") if isinstance(payload, dict) else None
    if not isinstance(texts, list) or not 1 <= len(texts) <= MAX_EMBED_INPUTS or not all(isinstance(t, str) for t in texts):
        raise BadRequest("expected {\"input\": [1 to %d strings]}" % MAX_EMBED_INPUTS)
    return [t[:MAX_EMBED_CHARS] for t in texts]


def embed(ollama, model, texts):
    """Sentence vectors from Ollama /api/embed (normalised by Ollama)."""
    body = json.dumps({"model": model, "input": texts, "keep_alive": "30m"}).encode("utf-8")
    req = urllib.request.Request(ollama + "/api/embed", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=EMBED_TIMEOUT) as res:
        return json.loads(res.read()).get("embeddings") or []


def check_model(ollama, model):
    """(ok, message). Used by health and at start-up."""
    try:
        with urllib.request.urlopen(ollama + "/api/tags", timeout=5) as res:
            names = [m.get("name") or m.get("model") for m in json.loads(res.read()).get("models", [])]
    except (urllib.error.URLError, OSError, ValueError) as e:
        return False, "Ollama is not reachable at %s (%s)" % (ollama, e)
    if model not in names and model + ":latest" not in names:
        return False, "model %s is not installed; installed: %s" % (model, ", ".join(names) or "none")
    return True, "ok"


_log_lock = threading.Lock()


def write_log(log_dir, record):
    if not log_dir:
        return
    os.makedirs(log_dir, exist_ok=True)
    path = os.path.join(log_dir, "eligibility-%s.jsonl" % time.strftime("%Y-%m-%d"))
    with _log_lock, open(path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")


class Handler(SimpleHTTPRequestHandler):
    server_version = "AIMSTEP-local/1"

    def __init__(self, *args, model, ollama, port, log_dir=None, allowed_origins=(), embed_model=DEFAULT_EMBED_MODEL,
                 embed_ollama=None, **kwargs):
        self.model, self.ollama, self.port, self.log_dir, self.embed_model = model, ollama, port, log_dir, embed_model
        # Embeddings may come from a second Ollama: while the chat model is busy
        # with parallel requests, Ollama does not schedule a second model.
        self.embed_ollama = embed_ollama or ollama
        self.allowed_origins = {o.rstrip("/").lower() for o in allowed_origins}
        super().__init__(*args, **kwargs)

    # ------------------------------------------------------------ guards

    def _host_ok(self):
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0].lower()
        return host in LOCAL_HOSTS

    def _cross_origin(self):
        """The Origin header when it is an allowed other site, else None."""
        origin = (self.headers.get("Origin") or "").rstrip("/").lower()
        return origin if origin in self.allowed_origins else None

    def _origin_ok(self):
        origin = self.headers.get("Origin")
        if not origin:
            return True            # same-origin fetches of GET, curl, tests
        if self._cross_origin():
            return True
        parts = urlsplit(origin)
        return parts.hostname in LOCAL_HOSTS and (parts.port or 80) == self.port

    def _cors_headers(self):
        origin = self._cross_origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin"))
            self.send_header("Vary", "Origin")

    def _send_json(self, status, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        # CORS preflight from the published site; anything else gets nothing.
        if not self._host_ok() or not urlsplit(self.path).path.startswith("/api/eligibility/") \
                or not self._cross_origin():
            return self._send_json(403, {"error": "local requests only"})
        self.send_response(204)
        self._cors_headers()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        if self.headers.get("Access-Control-Request-Private-Network"):
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Length", "0")
        self.end_headers()

    # ------------------------------------------------------------ routes

    def do_GET(self):
        if not self._host_ok():
            return self._send_json(421, {"error": "local requests only"})
        if urlsplit(self.path).path == '/api/eligibility/fulltext/health':
            if not self._origin_ok():
                return self._send_json(403, {"error": "local requests only"})
            return self._send_json(200, fulltext_assistant.health())
        if urlsplit(self.path).path == HEALTH:
            if not self._origin_ok():
                return self._send_json(403, {"error": "local requests only"})
            ok, msg = check_model(self.ollama, self.model)
            # The page tests only `service`; the rest is for a person reading it.
            embed_ok, _ = check_model(self.embed_ollama, self.embed_model)
            return self._send_json(200 if ok else 503, {
                "service": SERVICE if ok else SERVICE + "-unavailable",
                "model": self.model, "ollama": self.ollama, "status": msg,
                "embedModel": self.embed_model if embed_ok else "",
                "typesafe": {"available": True, "configured": typesafe_model.configured(), "version": typesafe_model.VERSION},
                "api": {"acceptsKey": api_model.status("configuration-check")[0],
                        "ready": api_model.status()[0], "status": api_model.status()[1],
                        "model": api_model.config()["model"]}})
        return super().do_GET()

    def do_HEAD(self):
        if not self._host_ok():
            return self._send_json(421, {"error": "local requests only"})
        return super().do_HEAD()

    def do_POST(self):
        if not self._host_ok() or not self._origin_ok():
            return self._send_json(403, {"error": "local requests only"})
        route = urlsplit(self.path).path
        if route not in (MODEL, EMBED, '/api/eligibility/fulltext'):
            return self._send_json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = -1
        if length <= 0 or length > MAX_BODY:
            return self._send_json(413 if length > MAX_BODY else 400, {"error": "request body missing or too large"})
        if route == '/api/eligibility/fulltext':
            try:
                result = fulltext_assistant.instance().request(json.loads(self.rfile.read(length).decode('utf-8')))
                return self._send_json(200, result)
            except (ValueError, UnicodeError) as e:
                return self._send_json(400, {"error": str(e)})
        if route == EMBED:
            try:
                texts = clean_embed(json.loads(self.rfile.read(length).decode("utf-8")))
            except (ValueError, BadRequest) as e:
                return self._send_json(400, {"error": str(e)})
            try:
                vectors = embed(self.embed_ollama, self.embed_model, texts)
            except urllib.error.HTTPError as e:
                return self._send_json(502, {"error": "Ollama HTTP %d: %s" % (e.code, e.read().decode("utf-8", "replace")[:300])})
            except (urllib.error.URLError, OSError) as e:
                return self._send_json(504 if isinstance(e, TimeoutError) or "timed out" in str(e) else 502,
                                       {"error": "embedding model not available: %s" % e})
            return self._send_json(200, {"embeddings": vectors, "model": self.embed_model})
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if isinstance(payload, dict) and payload.get("provider") == "typesafe":
                return self._typesafe(payload)
            if isinstance(payload, dict) and payload.get("provider") == "fulltext":
                return self._send_json(200, fulltext_sources.retrieve(payload))
            messages = clean_messages(payload)
            fmt = clean_format(payload)
            provider = payload.get("provider", "local")
            api_key = api_model.clean_key(payload["apiKey"]) if provider == "api" and "apiKey" in payload else None
            if provider not in ("local", "api"):
                raise BadRequest("Unknown model provider")
        except (ValueError, BadRequest) as e:
            return self._send_json(400, {"error": str(e)})
        started = time.time()
        attempts = []
        try:
            reply = (api_model.chat(messages, key=api_key) if api_key is not None else api_model.chat(messages)) if provider == "api" else chat(self.ollama, self.model, messages, attempts=attempts, fmt=fmt)
        except (ValueError, KeyError, TypeError) as e:
            return self._send_json(502, {"error": str(e) if provider == "local" else "API request failed: " + str(e)})
        except urllib.error.HTTPError as e:
            if provider == "api":
                return self._send_json(502, {"error": "API provider returned HTTP %d. Check server credentials, quota and model compatibility." % e.code})
            detail = e.read().decode("utf-8", "replace")[:300]
            try:
                detail = json.loads(detail).get("error", detail)
            except ValueError:
                pass
            return self._send_json(502, {"error": "Ollama HTTP %d: %s" % (e.code, detail)})
        except (urllib.error.URLError, OSError) as e:
            return self._send_json(502, {"error": "API provider is unreachable or timed out." if provider == "api" else "Ollama is not reachable: %s" % e})
        used_model = api_model.config()["model"] if provider == "api" else self.model
        content = reply.get("message", {}).get("content", "")
        write_log(self.log_dir, {
            "time": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "seconds": round(time.time() - started, 1),
            "model": used_model, "provider": provider, "options": {} if provider == "api" else ollama_body(self.model, [])["options"], "attempts": attempts,
            "messages": [{k: (v if k != "images" else ["<%d base64 chars>" % len(i) for i in v])
                          for k, v in m.items()} for m in messages],
            "reply": content})
        return self._send_json(200, {"message": {"role": "assistant", "content": content},
                                     "model": used_model, "provider": provider})

    def _typesafe(self, payload):
        try:
            action = payload.get('action', 'screen')
            if action == 'models':
                result = typesafe_model.models(payload.get('apiKey'))
            elif action == 'screen':
                result = typesafe_model.screen(payload)
            else:
                raise ValueError('Unknown TypeSafe action.')
            return self._send_json(200, result)
        except typesafe_model.ConfigurationError as e:
            return self._send_json(503, {'error': str(e), 'fatal': True})
        except urllib.error.HTTPError as e:
            messages = {401: 'Invalid TypeSafe API key.', 403: 'This TypeSafe key is not permitted to access the requested model.',
                        402: 'TypeSafe credits are insufficient.', 429: 'TypeSafe rate limit or quota reached. Wait before resuming.',
                        422: 'TypeSafe rejected this request. Check the selected model and screening input.'}
            return self._send_json(502, {'error': messages.get(e.code, 'TypeSafe returned HTTP %d. Try again later.' % e.code), 'fatal': e.code in (401, 402, 403, 429)})
        except (urllib.error.URLError, OSError):
            return self._send_json(502, {'error': 'Cannot reach TypeSafe or the request timed out.'})
        except (ValueError, TypeError, KeyError, AttributeError):
            return self._send_json(400, {'error': 'Invalid TypeSafe input or response. Check your key, model and criteria; no screening decision was saved.'})

    def end_headers(self):
        # Static pages change while you work on them; never serve a stale copy.
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        if self.path.startswith("/api/"):
            sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))


def main(argv=None):
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--model", default=os.environ.get("AIMSTEP_MODEL", DEFAULT_MODEL))
    ap.add_argument("--ollama", default=os.environ.get("OLLAMA_HOST_URL", DEFAULT_OLLAMA))
    ap.add_argument("--embed-model", default=os.environ.get("AIMSTEP_EMBED_MODEL", DEFAULT_EMBED_MODEL),
                    help="Ollama embedding model for full-text highlighting (default: embeddinggemma)")
    ap.add_argument("--embed-ollama", default=os.environ.get("AIMSTEP_EMBED_OLLAMA"),
                    help="a second local Ollama for embeddings (default: the --ollama one); see tools/README.md")
    ap.add_argument("--root", default=here, help="site directory to serve (default: the repository)")
    ap.add_argument("--allow-origin", action="append", default=None, metavar="ORIGIN",
                    help="another site allowed to call the model (repeatable); default: aimsetp.com. "
                         "Pass --allow-origin none to allow no other site")
    ap.add_argument("--log-dir", default=None,
                    help="append every model exchange to DIR/eligibility-<date>.jsonl (holds research text)")
    args = ap.parse_args(argv)

    ollama = args.ollama.rstrip("/")
    if urlsplit(ollama).hostname not in LOCAL_HOSTS:
        ap.error("--ollama must be on this machine; this server exists to keep research text local")
    embed_ollama = (args.embed_ollama or ollama).rstrip("/")
    if urlsplit(embed_ollama).hostname not in LOCAL_HOSTS:
        ap.error("--embed-ollama must be on this machine")
    ok, msg = check_model(ollama, args.model)
    print(("模型就绪" if ok else "警告") + "：%s  (%s)" % (args.model, msg))

    allowed = DEFAULT_ALLOWED_ORIGINS if args.allow_origin is None else \
        tuple(o for o in args.allow_origin if o.lower() != "none")
    handler = partial(Handler, directory=args.root, model=args.model, ollama=ollama, port=args.port,
                      log_dir=args.log_dir, allowed_origins=allowed, embed_model=args.embed_model,
                      embed_ollama=embed_ollama)
    httpd = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    fulltext_assistant.instance()
    print("AIM-STEP 本地站点：http://127.0.0.1:%d/eligibility.html   (Ctrl+C 停止)" % args.port)
    if allowed:
        print("另允许以下线上站点调用本机模型：%s" % ", ".join(allowed))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
