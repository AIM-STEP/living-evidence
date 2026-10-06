const assert=require('node:assert/strict'),api=require('../app/fulltext-browser.js');
const record={title:'Synthetic exact title for testing',doi:'10.1234/example',year:'2024'};
const json=v=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json'}});
(async()=>{
 const calls=[],original='%PDF-1.7 Synthetic original bytes';
 const result=await api.retrieve(record,{fetchImpl:async(url,options)=>{
   calls.push({url,...options});assert.equal(options.mode,'cors');assert(!url.includes('127.0.0.1'));assert(!url.includes('/model'));
   if(url.includes('/europepmc/webservices/rest/search'))return json({resultList:{result:[{doi:record.doi,fullTextUrlList:{fullTextUrl:[{url:'https://publisher.example/bad.pdf'},{url:'https://publisher.example/page'}]}}]}});
   if(url.includes('api.openalex'))throw new TypeError('Synthetic network error');
   if(url.includes('api.semanticscholar'))return json({openAccessPdf:{url:'https://publisher.example/good.pdf'}});
   if(url.includes('api.crossref'))return json({message:{link:[]}});
   if(url.endsWith('/bad.pdf'))return new Response('%PDF-1.7 Wrong report');
   if(url.endsWith('/page')){if(options.credentials==='include')throw new TypeError('Synthetic credentials CORS restriction');return new Response('<html>publisher page</html>');}
   if(url.endsWith('/good.pdf'))return new Response(original,{headers:{'content-disposition':'attachment; filename="Original full name.pdf"'}});
   return new Response('',{status:404});
 },extractLinks:()=>['https://publisher.example/good.pdf'],readPdf:async blob=>{assert.equal(await blob.text(),original,'Reject mismatched PDF before accepting the correct original');return [{text:'Synthetic text',page:1}];}});
 assert.equal(result.got.kind,'pdf');assert.equal(result.got.filename,'Original full name.pdf');assert.equal(await result.got.file.text(),original);assert(result.attempts.some(x=>x.status==='not-readable'));
 assert(calls.some(x=>x.url.endsWith('/page')&&x.credentials==='include'));assert(calls.some(x=>x.url.endsWith('/page')&&x.credentials==='omit'));
 assert(!calls.some(x=>x.url.includes('unpaywall')),'No fabricated contact email');
 const ctl=new AbortController();ctl.abort();await assert.rejects(api.retrieve(record,{signal:ctl.signal,fetchImpl:()=>{throw Error('Must not fetch after cancellation')}}),{name:'AbortError'});
 let read=false;
 const oversized=await api.retrieve(record,{fetchImpl:async url=>url.includes('europepmc/webservices')?json({resultList:{result:[]}}):url.includes('api.openalex')?json({locations:[]}):url.includes('api.semanticscholar')?json({}):url.includes('api.crossref')?json({message:{link:[]}}):new Response('%PDF',{headers:{'content-length':String(41*1024*1024)}}),readPdf:()=>{read=true}});
 assert.equal(oversized.got,null);assert.equal(read,false);
 // OA landing pages must be searched when providers have no direct PDF URL.
 const landing=await api.retrieve({...record,doi:'doi: '+record.doi},{fetchImpl:async url=>{
   if(url.includes('europepmc/webservices'))return json({resultList:{result:[]}});
   if(url.includes('api.openalex'))return json({locations:[{is_oa:true,landing_page_url:'https://repository.example/article'}]});
   if(url.includes('api.semanticscholar'))return json({});
   if(url.includes('api.crossref'))return json({message:{link:[]}});
   if(url==='https://repository.example/article')return new Response('<html>Repository</html>');
   if(url==='https://repository.example/paper.pdf')return new Response(original);
   return new Response('',{status:403});
 },extractLinks:()=>['https://repository.example/paper.pdf'],readPdf:async()=>[{text:'Synthetic text'}]});
 assert.equal(landing.got.url,'https://repository.example/paper.pdf');assert(landing.attempts.some(x=>x.status==='skipped'&&x.source==='Unpaywall'));
 const blocked=await api.retrieve(record,{fetchImpl:async url=>{
   if(url.includes('europepmc/webservices'))return json({resultList:{result:[]}});
   if(url.includes('api.openalex'))return json({locations:[{pdf_url:'https://repository.example/verify.pdf'}]});
   if(url.includes('api.semanticscholar'))return json({});
   if(url.includes('api.crossref'))return json({message:{link:[]}});
   if(url.includes('verify.pdf'))return new Response('<title>Checking your browser - reCAPTCHA</title>');
   return new Response('',{status:403});
 },readPdf:()=>{throw Error('Verification HTML must not be parsed as PDF')}});
 assert.equal(blocked.got,null);assert(blocked.attempts.some(x=>x.status==='verification-required'));assert(blocked.attempts.some(x=>x.detail?.includes('HTTP 403')));
 assert.equal(api.safeUrl('javascript:alert(1)'),'');assert.equal(api.safeUrl('https://user:secret@example.org'),'');
 console.log('PASS: direct browser requests, provider fallback, credential retry, PDF matching/original bytes, filenames, size cap and cancellation; no model/backend routes');
})().catch(e=>{console.error(e);process.exitCode=1});
