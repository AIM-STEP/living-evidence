"""Retrieve public OA files from identifier-matched provider metadata.
No caller-supplied download URL, cookies, credentials, or paywall bypass.
"""
import base64
import http.client
import ipaddress
import json
import re
import socket
import ssl
import unicodedata
from urllib.parse import quote, urlencode, urlsplit, urljoin

LIMIT = 24 * 1024 * 1024


class SourceError(ValueError):
    pass


def fetch(url, limit=LIMIT, redirects=4):
    """Validate every redirect and pin TLS connection to a checked public IP."""
    p = urlsplit(url)
    if p.scheme != 'https' or not p.hostname or p.username or p.password or p.port not in (None, 443):
        raise ValueError('Only public HTTPS sources are supported.')
    addresses = socket.getaddrinfo(p.hostname, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('Non-public source blocked.')
    address = addresses[0][4]
    sock = socket.socket(addresses[0][0], socket.SOCK_STREAM)
    sock.settimeout(18)
    conn = http.client.HTTPSConnection(p.hostname, timeout=18)
    try:
        sock.connect(address)
        conn.sock = ssl.create_default_context().wrap_socket(sock, server_hostname=p.hostname)
        conn.request('GET', p.path + ('?' + p.query if p.query else ''), headers={'User-Agent': 'AIM-STEP/1.0 (open-access full-text retrieval)', 'Accept-Encoding': 'identity'})
        response = conn.getresponse()
        if response.status in (301, 302, 303, 307, 308):
            target = response.getheader('Location')
            if not target or redirects <= 0:
                raise ValueError('Too many source redirects.')
            conn.close()
            return fetch(urljoin(url, target), limit, redirects - 1)
        if response.status != 200:
            raise SourceError('Source HTTP %s' % response.status)
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError('Source exceeds download size limit.')
        return data
    finally:
        conn.close()
        sock.close()


def metadata(url):
    return json.loads(fetch(url, 4 * 1024 * 1024))


def retrieve(payload):
    record = payload.get('record', {})
    if not isinstance(record, dict):
        raise ValueError('A report identifier is required.')
    doi = str(record.get('doi') or '').strip()
    pmid = str(record.get('pmid') or '').strip()
    if doi and not re.fullmatch(r'10\.\d{4,9}/[^\s<>"\x00-\x1f]{1,220}', doi, re.I):
        raise ValueError('Invalid DOI.')
    if pmid and not re.fullmatch(r'\d{1,12}', pmid):
        raise ValueError('Invalid PMID.')
    title = str(record.get('title') or '').strip()[:1000]
    if not doi and not pmid and len(title) < 12:
        raise ValueError('A DOI, PMID or descriptive title is required for automatic retrieval.')
    email = str(payload.get('email') or '').strip()
    if email and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        raise ValueError('Enter a valid contact email for Unpaywall.')
    skipped = payload.get('skipUrls', [])
    if not isinstance(skipped, list) or len(skipped) > 24 or any(not isinstance(u, str) or len(u) > 4000 for u in skipped):
        raise ValueError('Invalid skipped source list.')
    attempts, candidates, seen = [], [], set(skipped)

    def add(source, url):
        if isinstance(url, str) and url.startswith('https://') and url not in seen:
            seen.add(url)
            candidates.append((source, url))

    def provider(name, fn):
        try:
            fn()
            attempts.append({'source': name, 'status': 'checked'})
        except Exception as e:
            # Do not echo URLs, response bodies, or the user's email.
            attempts.append({'source': name, 'status': 'unavailable', 'detail': str(e) if isinstance(e, SourceError) else type(e).__name__})

    def epmc():
        q = 'EXT_ID:' + pmid + ' AND SRC:MED' if pmid else 'DOI:"' + doi + '"'
        data = metadata('https://www.ebi.ac.uk/europepmc/webservices/rest/search?' + urlencode({'format': 'json', 'resultType': 'core', 'pageSize': 1, 'query': q}))
        for hit in data.get('resultList', {}).get('result', []):
            pmc = hit.get('pmcid', '')
            if re.fullmatch(r'PMC\d+', pmc) and hit.get('isOpenAccess') == 'Y':
                add('Europe PMC', 'https://www.ebi.ac.uk/europepmc/webservices/rest/' + pmc + '/fullTextXML')
            for link in hit.get('fullTextUrlList', {}).get('fullTextUrl', []):
                if link.get('availabilityCode') == 'OA' and link.get('documentStyle') == 'pdf':
                    add('Europe PMC publisher/repository', link.get('url'))

    def openalex():
        if not doi:
            return
        data = metadata('https://api.openalex.org/works/https://doi.org/' + quote(doi, safe='/'))
        for loc in data.get('locations', []):
            if loc.get('is_oa'):
                add('OpenAlex publisher/repository', loc.get('pdf_url'))

    def semantic():
        ident = 'DOI:' + doi if doi else 'PMID:' + pmid
        data = metadata('https://api.semanticscholar.org/graph/v1/paper/' + quote(ident, safe=':/') + '?fields=title,openAccessPdf')
        add('Semantic Scholar open access', (data.get('openAccessPdf') or {}).get('url'))

    def unpaywall():
        data = metadata('https://api.unpaywall.org/v2/' + quote(doi, safe='') + '?' + urlencode({'email': email}))
        for loc in data.get('oa_locations', []):
            add('Unpaywall publisher/repository', loc.get('url_for_pdf'))

    # Resolve missing identifiers using an exact normalized title, never a fuzzy first hit.
    def title_key(value):
        return re.sub(r'[^\w]+', '', unicodedata.normalize('NFKC', value).casefold())

    if not doi and not pmid:
        def identify_epmc():
            nonlocal doi, pmid
            data = metadata('https://www.ebi.ac.uk/europepmc/webservices/rest/search?' + urlencode({'format':'json','resultType':'core','pageSize':5,'query':'TITLE:"' + title.replace('"','') + '"'}))
            hits = [h for h in data.get('resultList',{}).get('result',[]) if title_key(h.get('title','')) == title_key(title) and (not record.get('year') or str(h.get('pubYear','')) == str(record['year']))]
            if len(hits) != 1:
                return
            hit = hits[0]
            candidate = hit.get('doi','')
            if re.fullmatch(r'10\.\d{4,9}/[^\s<>"\x00-\x1f]{1,220}', candidate, re.I): doi = candidate
            if hit.get('source') == 'MED' and re.fullmatch(r'\d{1,12}',str(hit.get('id',''))): pmid = str(hit['id'])
            pmc = hit.get('pmcid','')
            if re.fullmatch(r'PMC\d+',pmc) and hit.get('isOpenAccess') == 'Y': add('Europe PMC','https://www.ebi.ac.uk/europepmc/webservices/rest/'+pmc+'/fullTextXML')
        provider('Europe PMC title lookup', identify_epmc)
        if not doi and not pmid:
            def identify_openalex():
                nonlocal doi
                data = metadata('https://api.openalex.org/works?' + urlencode({'search':title,'per-page':5}))
                hits = [h for h in data.get('results',[]) if title_key(h.get('title') or '') == title_key(title) and (not record.get('year') or str(h.get('publication_year','')) == str(record['year']))]
                if len(hits) != 1:
                    return
                hit = hits[0]
                candidate = (hit.get('doi') or '').removeprefix('https://doi.org/')
                if re.fullmatch(r'10\.\d{4,9}/[^\s<>"\x00-\x1f]{1,220}',candidate,re.I): doi = candidate
                for loc in hit.get('locations',[]):
                    if loc.get('is_oa'): add('OpenAlex publisher/repository',loc.get('pdf_url'))
            provider('OpenAlex title lookup', identify_openalex)

    # Europe PMC often supplies directly usable XML, avoiding unnecessary calls.
    providers = [('Europe PMC', epmc), ('OpenAlex', openalex), ('Semantic Scholar', semantic)] if doi or pmid else [('Title-matched free sources', lambda: None)]
    arxiv = re.fullmatch(r'10\.48550/arxiv\.(\d{4}\.\d{4,5}(?:v\d+)?)', doi, re.I)
    if arxiv:
        providers.insert(0, ('arXiv', lambda: add('arXiv', 'https://arxiv.org/pdf/' + arxiv.group(1))))
    if doi and email:
        providers.append(('Unpaywall', unpaywall))
    else:
        attempts.append({'source': 'Unpaywall', 'status': 'skipped', 'detail': 'Contact email and DOI required'})
    tried = set()
    for name, fn in providers:
        provider(name, fn)
        for source, url in candidates:
            if url in tried:
                continue
            tried.add(url)
            try:
                raw = fetch(url)
                if raw.lstrip().startswith(b'%PDF-'):
                    return {'kind': 'pdf', 'source': source, 'url': url, 'base64': base64.b64encode(raw).decode(), 'attempts': attempts}
                if source == 'Europe PMC' and b'<article' in raw[:10000] and b'<body' in raw:
                    return {'kind': 'xml', 'source': source, 'url': url, 'xml': raw.decode('utf-8'), 'attempts': attempts}
                attempts.append({'source': source, 'status': 'not-readable', 'detail': 'No PDF or full-text XML'})
            except Exception as e:
                attempts.append({'source': source, 'status': 'download-failed', 'detail': str(e) if isinstance(e, SourceError) else type(e).__name__})
    return {'kind': 'none', 'attempts': attempts}
