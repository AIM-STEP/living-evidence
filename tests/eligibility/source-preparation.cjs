const assert=require('node:assert/strict');
const {setup}=require('../../tools/test_eligibility_grounding.cjs');

function deferred(){
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}
const names=['one','two','three'];
const freshSignal=()=>new AbortController().signal;
const modelReply=(answer,model,provider='local')=>({ok:true,json:async()=>({model,provider,message:{content:JSON.stringify(answer)}})});

(async()=>{
  const page=setup(),{api}=page;
  const started=[],reads=names.map(deferred),thirdRead=deferred();
  const files=names.map((name,i)=>({file:{name:name+'.txt',text(){
    started.push(name);
    if(i===2)thirdRead.resolve();
    return reads[i].promise;
  }}}));
  const prepared=api.readSources('Question',files,freshSignal());
  assert.deepEqual(started,['one','two']);
  reads[1].resolve('B');
  await thirdRead.promise;
  reads[2].resolve('C');reads[0].resolve('A');
  const {texts}=await prepared;
  assert.deepEqual(Array.from(texts,t=>t.text),['Question','A','B','C']);
  await assert.rejects(api.readSources('x'.repeat(23999),[{file:{name:'t.txt',text:async()=>'ab'}}],freshSignal()),/24,000/);

  const cancel=new AbortController(),pending=deferred(),opened=[];
  const slowFiles=names.map(name=>({file:{name:name+'.txt',text(){opened.push(name);return pending.promise;}}}));
  const cancelled=api.readSources('',slowFiles,cancel.signal);
  cancel.abort();
  await assert.rejects(cancelled,{name:'AbortError'});
  pending.resolve('done');
  assert.deepEqual(opened,['one','two']);

  const base='https://hosted.example/api/eligibility',requests=[],ocr=names.map(deferred),thirdImage=deferred();
  page.ctx.window.AIMSTEPOnlineModel={online:true,base,request:async(url,options)=>{
    requests.push(url);
    assert.equal(url,base+'/model');
    const body=JSON.parse(options.body),payload=JSON.parse(body.messages[1].content);
    if(payload.images){
      const i=names.indexOf(payload.images[0]);
      if(i===2)thirdImage.resolve();
      await ocr[i].promise;
      return modelReply({text:names[i],uncertain:false},'vision-'+names[i]);
    }
    return payload.step==='extract_elements'?modelReply({},'local-extractor'):modelReply({},'Jev','typesafe');
  }};
  const model=await api.resolveModel(true,freshSignal());
  assert.equal(requests.length,0);
  model.auditTrail=[];
  const images=names.map(name=>({name,dataUrl:'data:image/png;base64,AA=='}));
  const scanning=api.sourceImages(model,{texts,images},'Systematic Review',freshSignal());
  assert.equal(requests.length,2);
  ocr[1].resolve();await thirdImage.promise;
  ocr[2].resolve();ocr[0].resolve();
  const sources=await scanning;
  assert.deepEqual(Array.from(sources,s=>s.id+' '+s.text),['D001 Question','D002 A','D003 B','D004 C','D005 one','D006 two','D007 three']);
  assert.deepEqual(Array.from(model.auditTrail,r=>r.model),['vision-one','vision-two','vision-three']);
  const client=api.progressClient(model);
  for(const step of ['extract_elements','review_normalization'])await client.request(step,{}, {},null,'Test',freshSignal());
  assert.equal(model.name,'local-extractor');
  assert.equal(model.auditTrail.at(-1).model,'Jev');
  await assert.rejects(api.sourceImages(model,{texts:[],images:[...images,...images,...images]},'',freshSignal()),/six images/);
  assert.equal(requests.length,5);

  const failed=setup(),issued=[],siblingStopped=deferred();
  failed.api.transport(async(url,{signal,body})=>{
    const name=JSON.parse(JSON.parse(body).messages[1].content).images[0];
    issued.push(name);
    if(name==='one')return modelReply({text:'?',uncertain:true},'vision');
    await new Promise((_,reject)=>signal.addEventListener('abort',()=>{siblingStopped.resolve();reject(signal.reason);},{once:true}));
  });
  await assert.rejects(failed.api.sourceImages(model,{texts:[],images},'',freshSignal()),/one: image text is incomplete/);
  await siblingStopped.promise;
  assert.deepEqual(issued,['one','two']);

  const local=setup(),probes=[];
  local.ctx.fetch=async(url,options)=>{
    probes.push(url);
    if(url.endsWith('/api/tags'))return {ok:true,json:async()=>({models:[{name:'text'},{name:'vision'}]})};
    if(url.endsWith('/api/show'))return {ok:true,json:async()=>({capabilities:JSON.parse(options.body).model==='vision'?['completion','vision']:['completion']})};
    return {ok:false,json:async()=>({})};
  };
  assert.equal((await local.api.resolveModel(true,freshSignal())).name,'vision');
  assert(probes.some(url=>url.endsWith('/health')));
  console.log('PASS hosted generation skips health, local vision selection and model provenance, bounded file reads and OCR, ordered results, input limits and cancellation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
