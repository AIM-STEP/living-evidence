/* Browser-side full-text retrieval. No model, proxy or local-server calls. */
(function(root){
'use strict';
const titleKey=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const doiKey=s=>String(s||'').trim().replace(/^doi:\s*/i,'').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').trim();
function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
async function retrieve(record,{signal,email='',fetchImpl=globalThis.fetch,readPdf,extractLinks=()=>[],extraUrl=''}={}){
  const attempts=[],candidates=[],seen=new Set();let doi=doiKey(record.doi),pmid=String(record.pmid||'');
  const add=(source,value)=>{const url=safeUrl(typeof value==='string'?value.replace(/^http:\/\//,'https://'):value);if(url&&!['pmc.ncbi.nlm.nih.gov','www.ncbi.nlm.nih.gov'].includes(new URL(url).hostname)&&!seen.has(url)){seen.add(url);candidates.push({source,url});}};
  async function request(url,credentials='omit',limit=4*1024*1024){
    if(signal?.aborted)throw new DOMException('Stopped','AbortError');
    const ctl=new AbortController(),abort=()=>ctl.abort();signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,15000);
    try{
      const response=await fetchImpl(url,{signal:ctl.signal,mode:'cors',credentials,redirect:'follow',referrerPolicy:'no-referrer'});
      if(!response.ok)throw Error('HTTP '+response.status+(response.status===403?' — access denied or website verification required':response.status===429?' — rate limited':''));
      if(Number(response.headers.get('content-length'))>limit)throw Error('File exceeds size limit');
      const reader=response.body?.getReader();let bytes;
      if(reader){const chunks=[];let size=0;try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>limit){await reader.cancel();throw Error('File exceeds size limit');}chunks.push(next.value);}}finally{reader.releaseLock();}bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}}
      else{bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>limit)throw Error('File exceeds size limit');}
      return {bytes,url:response.url||url,headers:response.headers};
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  const json=async url=>JSON.parse(new TextDecoder().decode((await request(url)).bytes));
  const provider=async(name,fn)=>{try{await fn();attempts.push({source:name,status:'checked'});}catch(e){if(signal?.aborted)throw e;attempts.push({source:name,status:'unavailable',detail:e instanceof TypeError?'Browser cross-origin policy or network error':String(e.message).slice(0,160)});}};
  await provider('Europe PMC',async()=>{
    const query=pmid?'EXT_ID:'+pmid+' AND SRC:MED':doi?'DOI:"'+doi+'"':'TITLE:"'+String(record.title||'').replace(/"/g,'')+'"';
    const data=await json('https://www.ebi.ac.uk/europepmc/webservices/rest/search?'+new URLSearchParams({format:'json',resultType:'core',pageSize:'5',query}));
    let hits=data.resultList?.result||[];
    if(!doi&&!pmid){hits=hits.filter(h=>titleKey(h.title)===titleKey(record.title)&&(!record.year||String(h.pubYear)===String(record.year)));if(hits.length!==1)return;}
    for(const h of hits){doi=doi||doiKey(h.doi);if(h.source==='MED')pmid=pmid||String(h.id||'');for(const link of h.fullTextUrlList?.fullTextUrl||[])add('Europe PMC '+(link.site||'full text'),link.url);
      if(/^PMC\d+$/.test(h.pmcid||''))await provider('PMC cloud',async()=>{
        const cloud='https://pmc-oa-opendata.s3.amazonaws.com/';
        const listing=new TextDecoder().decode((await request(cloud+'?'+new URLSearchParams({'list-type':'2',prefix:h.pmcid+'.',delimiter:'/', 'max-keys':'30'}))).bytes);
        const folders=[...listing.matchAll(/<Prefix>(PMC\d+\.\d+\/)<\/Prefix>/g)].map(m=>m[1]).filter(f=>f.startsWith(h.pmcid+'.')).sort((a,b)=>Number(b.split('.')[1].replace('/',''))-Number(a.split('.')[1].replace('/','')));
        for(const folder of [...new Set(folders)].slice(0,4)){const meta=await json(cloud+folder+folder.slice(0,-1)+'.json');if(doi&&doiKey(meta.doi).toLowerCase()!==doi.toLowerCase())continue;add('PMC cloud',String(meta.pdf_url||'').replace('s3://pmc-oa-opendata/',cloud));}
      });}

  });
  await provider('OpenAlex',async()=>{const data=await json(doi?'https://api.openalex.org/works/https://doi.org/'+encodeURIComponent(doi):'https://api.openalex.org/works?'+new URLSearchParams({search:record.title||'','per-page':'5'}));let hits=doi?[data]:(data.results||[]).filter(h=>titleKey(h.title)===titleKey(record.title)&&(!record.year||String(h.publication_year)===String(record.year)));if(!doi&&hits.length!==1)return;for(const h of hits){doi=doi||doiKey(h.doi);for(const l of [h.best_oa_location,...(h.locations||[])].filter(Boolean))add('OpenAlex repository/publisher',l.pdf_url);for(const l of [h.best_oa_location,...(h.locations||[])].filter(l=>l?.is_oa))add('OpenAlex repository/publisher',l.landing_page_url);add('OpenAlex open access',h.open_access?.oa_url);}});
  await Promise.all([
    provider('Semantic Scholar',async()=>{if(!doi&&!pmid)return;const data=await json('https://api.semanticscholar.org/graph/v1/paper/'+encodeURIComponent(doi?'DOI:'+doi:'PMID:'+pmid)+'?fields=title,openAccessPdf');add('Semantic Scholar',data.openAccessPdf?.url);}),
    provider('Crossref publisher links',async()=>{if(!doi)return;const data=await json('https://api.crossref.org/works/'+encodeURIComponent(doi));for(const l of data.message?.link||[])if(l['content-type']==='application/pdf'||/\.pdf(?:$|\?)/i.test(l.URL||''))add('Publisher full text',l.URL);}),
    provider('Unpaywall',async()=>{if(!doi)return;if(!email){attempts.push({source:'Unpaywall',status:'skipped',detail:'Contact email is not configured'});return;}const data=await json('https://api.unpaywall.org/v2/'+encodeURIComponent(doi)+'?'+new URLSearchParams({email}));for(const l of data.oa_locations||[])add('Unpaywall',l.url_for_pdf);for(const l of data.oa_locations||[])add('Unpaywall',l.url_for_landing_page||l.url);})
  ]);
  const arxiv=doi.match(/^10\.48550\/arxiv\.(\d{4}\.\d{4,5}(?:v\d+)?)$/i);if(arxiv)add('arXiv','https://arxiv.org/pdf/'+arxiv[1]);
  add('Saved full-text link',extraUrl);add('Record source',record.url);if(doi)add('DOI publisher','https://doi.org/'+doi);
  for(let i=0;i<candidates.length&&i<32;i++){
    const candidate=candidates[i];let result;
    for(const credentials of ['include','omit']){
      try{result=await request(candidate.url,credentials,40*1024*1024);break;}
      catch(e){if(signal?.aborted)throw e;if(credentials==='omit')attempts.push({...candidate,status:'unavailable',detail:e instanceof TypeError?'Browser cross-origin policy or network error':e.name==='AbortError'?'Request timed out':String(e.message).slice(0,180)});}
    }
    if(!result)continue;
    const prefix=new TextDecoder().decode(result.bytes.subarray(0,1024));
    if(!prefix.includes('%PDF-')){const html=new TextDecoder().decode(result.bytes.subarray(0,2*1024*1024));if(/<title[^>]*>\s*(?:Just a moment|Checking your browser)|cf-chl-|id=["']challenge-form["']/i.test(html)){attempts.push({...candidate,status:'verification-required',detail:'The website returned a browser verification page instead of a PDF'});continue;}for(const url of extractLinks(new TextDecoder().decode(result.bytes.subarray(0,2*1024*1024)),result.url).slice(0,12))add(candidate.source,url);attempts.push({...candidate,status:'not-pdf'});continue;}
    const file=new Blob([result.bytes],{type:'application/pdf'});
    try{
      const paras=await readPdf(file,record);
      let filename='';const disposition=result.headers.get('content-disposition')||'';
      const utf=disposition.match(/filename\*=UTF-8''([^;]+)/i),plain=disposition.match(/filename="?([^";]+)"?/i);
      try{filename=utf?decodeURIComponent(utf[1]):plain?plain[1]:decodeURIComponent(new URL(result.url).pathname.split('/').pop()||'');}catch{}
      if(!/\.pdf$/i.test(filename))filename='';
      attempts.push({...candidate,status:'downloaded'});
      return {got:{kind:'pdf',source:candidate.source,url:result.url,file,filename,paras},attempts,candidates};
    }catch(e){if(signal?.aborted)throw e;attempts.push({...candidate,status:'not-readable',detail:String(e.message).slice(0,180)});}
  }
  return {got:null,attempts,candidates};
}
const api={retrieve,safeUrl};if(typeof module==='object'&&module.exports)module.exports=api;root.AimstepFulltextBrowser=api;
})(globalThis);
