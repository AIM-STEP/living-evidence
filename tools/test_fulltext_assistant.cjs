const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const api=require('../app/fulltext-assistant.js');
const record={uid:'r1',doi:'10.1234/test',title:'Original full text for persistent queue'};
const token='a'.repeat(64),id='b'.repeat(64),raw=Buffer.from('%PDF-1.7 original bytes');
const response=obj=>new Response(JSON.stringify(obj),{headers:{'content-type':'application/json'}});
(async()=>{
 let state='queued',posts=[],health=0;
 const transport=async(url,options)=>{
  assert(!url.includes('/model'));assert.equal(options.credentials,'omit');assert.equal(options.targetAddressSpace,'loopback');
  if(url.endsWith('/health')){health++;return response({service:'aimstep-fulltext-assistant'});}
  const body=JSON.parse(options.body);assert.equal(body.token,token);posts.push(body);
  if(body.action==='submit')return response({jobs:body.records.map(r=>({uid:r.uid,id}))});
  if(body.action==='cancel')return response({jobs:[]});
  const job={id,state,attempts:[{source:'PMC cloud',status:state}]};
  if(state==='ready')job.got={kind:'pdf',source:'PMC cloud',filename:'Original PDF name.pdf',url:'https://example.org/file.pdf',data:raw.toString('base64')};
  if(state==='retry')job.got={kind:'xml',source:'Europe PMC',data:Buffer.from('<article/>').toString('base64')};
  return response({jobs:[job]});
 };
 const helper=api.create({token,fetchImpl:transport});
 assert.equal(await helper.submit([record]),true);
 let result=await helper.retrieve(record,{});assert.equal(result.pending,true);assert.equal(result.got,null);
 state='ready';result=await helper.retrieve(record,{readPdf:async blob=>{assert.deepEqual(Buffer.from(await blob.arrayBuffer()),raw);return [{text:'Original report content'}];}});
 assert.equal(result.got.filename,'Original PDF name.pdf');assert.equal(result.got.kind,'pdf');assert.equal(result.pending,false);assert.equal(health,1);
 // A fresh page reuses its private token and discovers the server's cached result.
 const reloaded=api.create({token,fetchImpl:transport});
 result=await reloaded.retrieve(record,{readPdf:async()=>[{text:'Restored'}]});assert.equal(result.got.kind,'pdf');
 state='retry';result=await helper.retrieve(record,{readXml:xml=>{assert.equal(xml,'<article/>');return [{text:'XML full text'}];}});assert.equal(result.got.kind,'xml');assert.equal(result.pending,true);
 result=await helper.retrieve(record,{pdfOnly:true});assert.equal(result.got,null);assert.equal(result.pending,true);
 state='ready';result=await helper.retrieve(record,{readPdf:()=>{throw Error('Mismatched document');}});assert.equal(result.got,null);assert.equal(result.attempts.at(-1).status,'not-readable');
 await helper.cancel([record]);assert(posts.some(p=>p.action==='cancel'&&p.ids[0]===id));
 const ctl=new AbortController();ctl.abort();await assert.rejects(helper.retrieve(record,{signal:ctl.signal}),{name:'AbortError'});
 const absent=api.create({token,fetchImpl:async()=>{throw new TypeError('Not running');}});assert.equal(await absent.submit([record]),false);assert.equal(await absent.retrieve(record),null);
 const checksum=api.create({token,fetchImpl:async(url,options)=>{
  if(url.endsWith('/health'))return response({service:'aimstep-fulltext-assistant'});
  if(JSON.parse(options.body).action==='submit')return response({jobs:[{id,uid:record.uid}]});
  return response({jobs:[{id,state:'ready',got:{kind:'pdf',data:raw.toString('base64'),sha256:'0'.repeat(64)}}]});
 }});
 globalThis.crypto=webcrypto;
 result=await checksum.retrieve(record,{readPdf:()=>{throw Error('Must reject checksum before parsing');}});assert.match(result.attempts.at(-1).detail,/checksum/);
 console.log('PASS: durable queue submit/poll/reload, original PDF bytes, XML distinction, cancellation, unavailable helper fallback, no model calls and checksum verification');
})().catch(e=>{console.error(e);process.exitCode=1});
