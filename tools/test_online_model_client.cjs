const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app/online-model.js','utf8').replace("import(sdk+'firebase-app.js')",'Promise.resolve(testApps)').replace("import(sdk+'firebase-auth.js')",'Promise.resolve(testAuth)');
function setup({signed=true,host='aimsetp.com',network}={}){
 const calls=[],account={getIdToken:async()=> 'synthetic-id-token'};
 const auth={currentUser:signed?account:null,authStateReady:async()=>{}};
 const ctx={URL,Headers,Response,AbortSignal,DOMException,Error,Object,Promise,location:{hostname:host,href:'https://'+host+'/eligibility.html',origin:'https://'+host},window:{},parent:{location:{origin:'https://'+host}},testApps:{getApps:()=>[],initializeApp:()=>({})},testAuth:{getAuth:()=>auth},setTimeout:(cb)=>setTimeout(cb,1),clearTimeout,fetch:async(u,o)=>{calls.push([u,o]);return network?network(u,o):new Response('{}')}};
 vm.runInNewContext(source,ctx);return {api:ctx.window.AIMSTEPOnlineModel,calls,auth};
}
(async()=>{
 let t=setup({signed:false});await assert.rejects(t.api.request(t.api.base+'/health'),/Sign in/);assert.equal(t.calls.length,0);
 t=setup();await t.api.request(t.api.base+'/health');assert.equal(t.calls[0][1].headers.get('Authorization'),'Bearer synthetic-id-token');assert.equal(t.calls[0][1].redirect,'error');
 await t.api.request('https://example.test/search');assert.equal(t.calls[1][1]?.headers,undefined,'Never send tokens to external sources');
 t=setup({host:'127.0.0.1'});assert(!t.api.online);await t.api.request('http://127.0.0.1:8765/api/eligibility/health');assert.equal(t.calls[0][1].headers,undefined);
 t=setup({network:()=>{throw TypeError('network')}});await assert.rejects(t.api.request(t.api.base+'/health'),/online AI service is unavailable/);assert.equal(t.calls.length,1);
 const key='synthetic-job-1234567890';let deleted=false;
 t=setup({network:(u,o)=>{if(o.method==='DELETE'){deleted=true;return new Response('{}');}if(u.endsWith('/model'))return new Response(JSON.stringify({jobId:key}),{status:202});return new Response(JSON.stringify({status:'complete',httpStatus:200,result:{message:{content:'synthetic'}}}));}});
 const r=await t.api.request(t.api.base+'/model',{method:'POST',body:'{}'});assert.equal((await r.json()).message.content,'synthetic');await new Promise(r=>setTimeout(r,10));assert(deleted);
 let polls=0,posts=0;deleted=false;
 t=setup({network:(u,o)=>{if(o.method==='DELETE'){deleted=true;return new Response('{}');}if(u.endsWith('/model')){posts++;return new Response(JSON.stringify({jobId:key}),{status:202});}polls++;assert(!deleted,'A transient poll failure must not cancel the running inference');if(polls===1)throw TypeError('Temporary network loss');if(polls===2)return new Response('{}',{status:503});if(polls===3)return new Response(JSON.stringify({status:'running'}),{status:202});return new Response(JSON.stringify({status:'complete',httpStatus:200,result:{message:{content:'recovered'}}}));}});
 const recovered=await t.api.request(t.api.base+'/model',{method:'POST',body:'{}'});assert.equal((await recovered.json()).message.content,'recovered');assert.equal(posts,1,'Never duplicate inference when retrying a poll');assert.equal(polls,4);
 polls=0;t=setup({network:(u,o)=>{if(o.method==='DELETE')return new Response('{}');if(u.endsWith('/model'))return new Response(JSON.stringify({jobId:key}),{status:202});polls++;return new Response(JSON.stringify({error:'Access revoked'}),{status:403});}});
 await assert.rejects(t.api.request(t.api.base+'/model',{method:'POST'}),/Access revoked/);assert.equal(polls,1,'Do not retry authorization failures');
 const controller=new AbortController();deleted=false;
 t=setup({network:(u,o)=>{if(o.method==='DELETE'){deleted=true;return new Response('{}');}controller.abort();return new Response(JSON.stringify({jobId:key}),{status:202});}});
 await assert.rejects(t.api.request(t.api.base+'/model',{signal:controller.signal}),e=>e.name==='AbortError');await new Promise(r=>setTimeout(r,10));assert(deleted);
 for(const page of ['eligibility','search-strategy','title-abstract-screening','full-text-screening']){
  const html=fs.readFileSync(page+'.html','utf8');assert(html.includes('app/online-model.js?v=online-auth-v3'));
  if(page==='eligibility')assert.match(html,/const online=window\.AIMSTEPOnlineModel;[\s\S]{0,250}\bbase:online\.base/);
  else assert(html.includes('window.AIMSTEPOnlineModel.base'));
 }
 console.log('PASS: authenticated fixed-origin requests, local-mode compatibility, unauthenticated/offline errors, asynchronous results and cancellation');
})().catch(e=>{console.error(e);process.exitCode=1});
