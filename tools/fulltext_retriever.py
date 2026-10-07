"""Bounded public full-text discovery. No model, login automation or cookie access."""
import base64
import hashlib
import http.client
import json
import re
import socket
import ssl
import time
import unicodedata
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, urlencode, urljoin, urlsplit, unquote

import fulltext_sources

CLOUD = 'https://pmc-oa-opendata.s3.amazonaws.com/'
LIMIT = 40 * 1024 * 1024


def key(s):
    return re.sub(r'[^\w]', '', unicodedata.normalize('NFKC', str(s)).casefold())


def clean_record(record):
    if not isinstance(record, dict):
        raise ValueError('A record is required.')
    r = {k: str(record.get(k) or '').strip()[:n] for k, n in
         [('uid', 200), ('title', 1200), ('doi', 250), ('pmid', 12), ('year', 8), ('url', 2000)]}
    r['doi'] = re.sub(r'^(?:doi:\s*|https?://(?:dx\.)?doi.org/)', '', r['doi'], flags=re.I)
    if r['doi'] and not re.fullmatch(r'10\.\d{4,9}/[^\s<>"\x00-\x1f]{1,220}', r['doi'], re.I):
        raise ValueError('Invalid DOI.')
    if r['pmid'] and not r['pmid'].isdigit():
        raise ValueError('Invalid PMID.')
    if not (r['doi'] or r['pmid'] or len(r['title']) >= 12):
        raise ValueError('A DOI, PMID or descriptive title is required.')
    return r


def matches(record, hit):
    doi = str(hit.get('doi') or '').removeprefix('https://doi.org/').lower()
    if record['doi'] and doi:
        return record['doi'].lower() == doi
    if record['pmid'] and str(hit.get('pmid') or '') == record['pmid']:
        return True
    return bool(record['title'] and key(record['title']) == key(hit.get('title', '')) and
                (not record['year'] or not hit.get('year') or record['year'] == str(hit['year'])))


def pdf_identity(data, record):
    if not data[:1024].lstrip().startswith(b'%PDF-'):
        raise ValueError('not-pdf')
    import pymupdf
    with pymupdf.open(stream=data, filetype='pdf') as doc:
        if doc.needs_pass:
            raise ValueError('encrypted-pdf')
        # References at the end of an unrelated article must not identify it.
        text = '\n'.join(doc[i].get_text() for i in range(min(2, len(doc))))[:24000]
        compact = key(text)
        title = key(record['title'])
        doi_ok = bool(record['doi'] and record['doi'].lower() in re.sub(r'\s+', '', text).lower())
        title_ok = bool(len(title) >= 12 and title in compact)
        if not (doi_ok or title_ok):
            raise ValueError('ocr-needed' if len(compact) < 100 else 'identity-mismatch')
    return True


class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.urls = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'meta' and a.get('name', '').lower() in ('citation_pdf_url', 'wkhealth_pdf_url', 'dc.identifier'):
            self.urls.append(a.get('content', ''))
        if tag in ('a', 'link'):
            href = a.get('href', '')
            if re.search(r'\.pdf(?:$|[?#])|/(?:pdf|download)(?:/|$|[?#])', href, re.I) or a.get('type') == 'application/pdf':
                self.urls.append(href)


def zotero(record):
    """Only the installed local read-only API can nominate a filesystem path."""
    def get(path, raw=False):
        c = http.client.HTTPConnection('127.0.0.1', 23119, timeout=2)
        try:
            c.request('GET', '/api/' + path)
            r = c.getresponse(); data = r.read(2 * 1024 * 1024 + 1)
            if r.status != 200 or len(data) > 2 * 1024 * 1024:
                raise ValueError('Zotero local API unavailable')
            return data.decode('utf-8') if raw else json.loads(data)
        finally:
            c.close()
    query = urlencode({'q': record['doi'] or record['title'], 'itemType': '-attachment', 'limit': 25})
    for item in get('users/0/items?' + query):
        d = item.get('data', {})
        if not matches(record, {'doi': d.get('DOI'), 'title': d.get('title')}):
            continue
        parent = item.get('key', '')
        if not re.fullmatch(r'[A-Z0-9]{8}', parent):
            continue
        for child in get('users/0/items/' + parent + '/children'):
            data = child.get('data', {}); child_key = child.get('key', '')
            if data.get('contentType') != 'application/pdf' or not re.fullmatch(r'[A-Z0-9]{8}', child_key):
                continue
            uri = urlsplit(get('users/0/items/' + child_key + '/file/view/url', True).strip())
            if uri.scheme != 'file' or uri.netloc not in ('', 'localhost'):
                continue
            path = Path(unquote(uri.path))
            if path.suffix.lower() != '.pdf' or not path.is_file() or path.stat().st_size > LIMIT:
                continue
            raw = path.read_bytes(); pdf_identity(raw, record)
            return {'kind': 'pdf', 'data': raw, 'filename': path.name, 'source': 'Zotero local library', 'url': ''}
    return None


def retrieve(record, config=None, cancelled=lambda: False):
    record = clean_record(record); config = config or {}
    attempts, candidates, seen, xml_candidates = [], [], set(), []
    started = time.monotonic(); retry_after = 0

    def active():
        if cancelled():
            raise InterruptedError('cancelled')
        if time.monotonic() - started > 240:
            raise TimeoutError('retrieval-budget-exhausted')

    def request(url, limit=LIMIT):
        active()
        return fulltext_sources.fetch(url, limit, response_info=True, timeout=10)

    def metadata(url):
        return json.loads(request(url, 4 * 1024 * 1024)[0])

    def attempt(source, status, **extra):
        attempts.append({'source': source, 'status': status, **extra})

    def failure(source, e):
        nonlocal retry_after
        if isinstance(e, InterruptedError):
            raise e
        code = getattr(e, 'status', 0)
        status = {401: 'login-required', 403: 'access-denied', 404: 'not-found', 429: 'rate-limited', 503: 'temporarily-unavailable'}.get(code)
        if code in (429, 503):
            from email.utils import parsedate_to_datetime
            hint = getattr(e, 'retry_after', '')
            try:
                wait = int(hint) if str(hint).isdigit() else int(parsedate_to_datetime(hint).timestamp() - time.time())
            except (ValueError, TypeError):
                wait = 900
            retry_after = max(retry_after, min(7 * 86400, max(60, wait)))
        detail = str(e) if isinstance(e, ValueError) and str(e) in ('not-pdf', 'encrypted-pdf', 'ocr-needed', 'identity-mismatch', 'checksum-mismatch') else type(e).__name__
        network = ('dns-failure' if isinstance(e, socket.gaierror) else 'tls-failure' if isinstance(e, ssl.SSLError) else 'timeout' if isinstance(e, TimeoutError) else 'network-unavailable' if isinstance(e, OSError) else detail)
        attempt(source, status or network)

    def provider(source, fn):
        try:
            active(); fn(); attempt(source, 'checked')
        except Exception as e:
            failure(source, e)

    def add(source, url, checksum=''):
        if isinstance(url, str) and url.startswith('s3://pmc-oa-opendata/'):
            url = CLOUD + url.split('s3://pmc-oa-opendata/', 1)[1]
        if isinstance(url, str) and url.startswith('http://'):
            url = 'https://' + url[7:]
        if not isinstance(url, str) or not url.startswith('https://') or len(url) > 4000 or url in seen:
            return
        seen.add(url)
        if len(candidates) < 40:
            candidates.append((source, url, checksum))

    def finish(got=None):
        return {'got': got, 'attempts': attempts, 'retryAfter': retry_after}

    try:
        got = zotero(record)
        attempt('Zotero', 'found' if got else 'no-matching-attachment')
        if got:
            return finish(got)
    except Exception:
        attempt('Zotero', 'not-available')

    pmcids = []
    def epmc():
        q = 'DOI:"' + record['doi'] + '"' if record['doi'] else ('EXT_ID:' + record['pmid'] + ' AND SRC:MED' if record['pmid'] else 'TITLE:"' + record['title'].replace('"', '') + '"')
        hits = metadata('https://www.ebi.ac.uk/europepmc/webservices/rest/search?' + urlencode({'query': q, 'format': 'json', 'resultType': 'core', 'pageSize': 5})).get('resultList', {}).get('result', [])
        for h in hits:
            if not matches(record, {**h, 'year': h.get('pubYear')}):
                continue
            pmc = h.get('pmcid', '')
            if re.fullmatch(r'PMC\d+', pmc):
                pmcids.append(pmc)
                if h.get('isOpenAccess') == 'Y':
                    xml_candidates.append(('Europe PMC', 'https://www.ebi.ac.uk/europepmc/webservices/rest/' + pmc + '/fullTextXML'))
            for link in h.get('fullTextUrlList', {}).get('fullTextUrl', []):
                if link.get('availability') in ('Open access', 'Free'):
                    add('Europe PMC', link.get('url'))
    provider('Europe PMC', epmc)

    def pmc_cloud():
        for pmc in pmcids[:2]:
            raw = request(CLOUD + '?' + urlencode({'list-type': 2, 'prefix': pmc + '.', 'delimiter': '/', 'max-keys': 30}), 1024 * 1024)[0]
            root = ET.fromstring(raw)
            folders = [el.text for el in root.iter() if el.tag.rsplit('}', 1)[-1] == 'Prefix' and re.fullmatch(pmc + r'\.\d+/', el.text or '')]
            versions = []
            for folder in sorted(set(folders), key=lambda f: int(f.rstrip('/').split('.')[-1]), reverse=True)[:4]:
                meta = metadata(CLOUD + folder + folder.rstrip('/') + '.json')
                if not matches(record, meta):
                    continue
                versions.append(meta)
            for meta in sorted(versions, key=lambda m: bool(m.get('is_manuscript'))):
                source = 'PMC cloud (author manuscript)' if meta.get('is_manuscript') else 'PMC cloud'
                pdf = meta.get('pdf_url')
                if pdf:
                    from urllib.parse import parse_qs
                    add(source, pdf, parse_qs(urlsplit(pdf).query).get('md5', [''])[0])
                if meta.get('xml_url'):
                    xml_candidates.append((source, str(meta['xml_url']).replace('s3://pmc-oa-opendata/', CLOUD)))
    # Cloud PDFs must precede publisher pages, including versions without a PDF.
    prior = candidates[:]; candidates.clear()
    provider('PMC cloud', pmc_cloud)
    candidates.extend(prior)

    def try_candidates():
        index = 0
        while index < len(candidates) and index < 40:
            source, url, checksum = candidates[index]; index += 1
            try:
                data, final, headers = request(url)
                if data[:1024].lstrip().startswith(b'%PDF-'):
                    if checksum and hashlib.md5(data).hexdigest() != checksum:
                        raise ValueError('checksum-mismatch')
                    pdf_identity(data, record)
                    filename = unquote(urlsplit(final).path.rsplit('/', 1)[-1])
                    cd = next((v for k, v in headers.items() if k.lower() == 'content-disposition'), '')
                    m = re.search(r'filename="([^"/\\]+)"', cd)
                    if m: filename = m[1]
                    if not filename.lower().endswith('.pdf'): filename = (record['doi'] or record['pmid'] or 'Full text').replace('/', '_') + '.pdf'
                    attempt(source, 'pdf-verified')
                    return {'kind': 'pdf', 'data': data, 'filename': filename[:240], 'source': source, 'url': final}
                page = data[:2 * 1024 * 1024].decode('utf-8', 'replace')
                if re.search(r'cf-chl-|captcha|verify you are human|just a moment', page, re.I):
                    attempt(source, 'verification-required'); continue
                parser = Links(); parser.feed(page)
                for link in parser.urls[:12]:
                    add(source, urljoin(final, link))
                attempt(source, 'landing-page' if parser.urls else 'no-pdf-link')
            except Exception as e:
                failure(source, e)
        candidates.clear()
        return None

    # Prefer the sanctioned PMC distribution endpoint; avoid HTML crawling PMC.
    candidates[:] = [c for c in candidates if urlsplit(c[1]).hostname not in ('pmc.ncbi.nlm.nih.gov', 'www.ncbi.nlm.nih.gov')]
    got = try_candidates()
    if got: return finish(got)

    doi = record['doi']
    def unpaywall():
        email = config.get('contactEmail', '')
        if not doi or not email:
            attempt('Unpaywall', 'contact-or-doi-missing'); return
        obj = metadata('https://api.unpaywall.org/v2/' + quote(doi, safe='') + '?' + urlencode({'email': email}))
        for loc in obj.get('oa_locations') or []:
            add('Unpaywall', loc.get('url_for_pdf'))
            add('Unpaywall', loc.get('url_for_landing_page'))
    provider('Unpaywall', unpaywall)
    def openalex():
        endpoint = 'https://api.openalex.org/works/' + quote('https://doi.org/' + doi, safe='') if doi else 'https://api.openalex.org/works?' + urlencode({'search': record['title'], 'per-page': 5})
        if config.get('openalexKey'):
            endpoint += ('&' if '?' in endpoint else '?') + urlencode({'api_key': config['openalexKey']})
        obj = metadata(endpoint)
        for hit in ([obj] if doi else obj.get('results', [])):
            if not doi and not matches(record, {**hit, 'title': hit.get('display_name'), 'year': hit.get('publication_year')}): continue
            for loc in hit.get('locations') or []:
                add('OpenAlex', loc.get('pdf_url'))
                if loc.get('is_oa'): add('OpenAlex', loc.get('landing_page_url'))
    provider('OpenAlex', openalex)
    if doi:
        def crossref():
            obj = metadata('https://api.crossref.org/works/' + quote(doi, safe='')).get('message', {})
            for loc in obj.get('link') or []:
                if loc.get('content-type') == 'application/pdf': add('Crossref', loc.get('URL'))
        provider('Crossref', crossref)
        def semantic():
            obj = metadata('https://api.semanticscholar.org/graph/v1/paper/DOI:' + quote(doi, safe='') + '?fields=title,openAccessPdf')
            add('Semantic Scholar', (obj.get('openAccessPdf') or {}).get('url'))
        provider('Semantic Scholar', semantic)
        arxiv = re.fullmatch(r'10\.48550/arxiv\.(\d{4}\.\d{4,5}(?:v\d+)?)', doi, re.I)
        if arxiv: add('arXiv', 'https://arxiv.org/pdf/' + arxiv[1])
        add('Publisher DOI landing page', 'https://doi.org/' + quote(doi, safe='/'))
    add('Record link', record['url'])
    candidates[:] = [c for c in candidates if urlsplit(c[1]).hostname not in ('pmc.ncbi.nlm.nih.gov', 'www.ncbi.nlm.nih.gov')]
    got = try_candidates()
    if got: return finish(got)
    for source, url in xml_candidates[:4]:
        try:
            raw = request(url, 24 * 1024 * 1024)[0]
            if b'<!ENTITY' in raw.upper(): raise ValueError('Unsafe XML')
            root = ET.fromstring(raw)
            title = ''.join(root.findtext('.//article-title', default=''))
            title_el = root.find('.//article-title')
            if title_el is not None: title = ''.join(title_el.itertext())
            ids = {el.get('pub-id-type'): el.text for el in root.findall('.//article-id')}
            if not matches(record, {'doi': ids.get('doi'), 'pmid': ids.get('pmid'), 'title': title}) or root.find('.//body') is None:
                raise ValueError('identity-mismatch')
            attempt(source, 'xml-verified')
            return finish({'kind': 'xml', 'data': raw, 'filename': '', 'source': source, 'url': url})
        except Exception as e:
            failure(source, e)
    return finish()
