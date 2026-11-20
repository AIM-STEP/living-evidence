const {test}=require('node:test');
const assert=require('node:assert/strict');
const B=require('../../app/eligibility/background');
const E=require('../../app/eligibility/engine');
const {setup}=require('../../tools/test_eligibility_grounding.cjs');
const config={frameworkConfig:require('../../config/eligibility-frameworks.json'),profileConfig:require('../../config/eligibility-review-profiles.json'),baseURL:'http://localhost/'};
const projectId='synthetic-grounding';
const question='We included trials comparing exercise with education in adults or in a community setting.';

test('Generate reuses only the current verified result, including pending and author-decided items',async()=>{
 function open(storage){
  const page=setup(storage);
  page.ctx.window.AIMSTEPEligibilityEngine=E;
  page.ctx.window.AIMSTEPEligibilityBackground={...B,create:args=>B.create({...args,...config})};
  return page;
 }
 async function repeat(page){
  const before=new Map(page.storage),markup=page.el('preview').innerHTML;
  page.api.denyModelAccess();
  await page.el('start-machine').handlers.click();
  assert.equal(page.el('generation-status').textContent,'');
  assert.deepEqual(page.storage,before);
  assert.equal(page.el('preview').innerHTML,markup);
 }
 const page=open(),calls=[];
 page.api.transport(async(url,options)=>{
  const request=JSON.parse(JSON.parse(options.body).messages[1].content),payload=request.payload;
  calls.push(request.step);
  let answer;
  if(request.step==='extract_elements'){
   const q=payload.question,source=q.sources.find(s=>s.input_kind==='research_question');
   const elements=[['p','population','adults'],['s','context','a community setting'],['i','intervention','exercise'],['c','comparator','education']].map(([id,dimension,quote])=>({
    candidate_id:id,dimension_id:dimension,normalized_text:quote,structured_value:null,source_refs:[{source_id:source.source_id,source_revision:source.revision,quote}],
    semantic_role:'eligibility_condition',information_status:'explicit',scope_status:'restricted',disposition:'include'}));
   answer={questions:[{question_id:q.question_id,framework_candidates:['pico'],elements,issues:[],logic:{op:'any_of',children:['p','s'].map(element_id=>({op:'predicate',element_id}))}}]};
  }else{
   assert.equal(request.step,'review_normalization');
   answer={items:payload.items.map(e=>({...e,status:'supported',issue_type:'none',reason:'Source verified.'}))};
  }
  return {ok:true,json:async()=>({message:{content:JSON.stringify(answer)},...(request.step==='review_normalization'?{provider:'typesafe',review:{policy:'jev-once-v1'}}:{})})};
 },'backend');
 page.el('generation-method').value='machine';page.el('generation-method').handlers.change();page.el('question').value=question;
 const attachment=new File(['Protocol supplement.'],'protocol.txt',{type:'text/plain'});
 page.el('machine-attachments').replaceChildren=()=>{};page.el('machine-attachments').append=()=>{};
 page.ctx.document.createElement=()=>({append(){},setAttribute(){},addEventListener(){}});
 page.el('source-files').handlers.change({target:{files:[attachment]}});
 await page.el('start-machine').handlers.click();
 assert.equal(page.el('generation-status').textContent,'');
 assert.deepEqual(calls,['extract_elements','review_normalization']);
 assert(page.api.state().machineRefinement.sourceConfirmations.length);
 await repeat(page);
 const reloaded=open(page.storage);await repeat(reloaded);
 const detail=reloaded.api.state().machineRefinement.sourceConfirmations[0];
 const choice=detail.options.findIndex(o=>o.option_id==='use_proposed');
 assert(choice>=0);assert(await reloaded.api.confirm(0,choice));
 await repeat(open(page.storage));
 const service=await B.create({projectId,storage:page.ctx.localStorage,...config});
 const legacy=reloaded.api.state(),files=legacy.machineRun.fileDigests;
 assert.equal(files[0][2],require('node:crypto').createHash('sha256').update('Protocol supplement.').digest('hex'));
 const modelSettings=['http://127.0.0.1:8765','ollama','http://127.0.0.1:11434','',''];
 const input={legacy,question,reviewType:legacy.machineRun.reviewType,modelSettings};
 assert(service.publishedGeneration(input,files));
 assert(await service.generate({...input,sources:[{name:attachment.name,text:await attachment.text()}]}).then(result=>result.reused));
 assert.equal(service.publishedGeneration({...input,question:question+' Include children.'},files),null);
 assert.equal(service.publishedGeneration({...input,questionType:'diagnosis'},files),null);
 assert.equal(service.publishedGeneration({...input,modelSettings:['different model']},files),null);
 assert.equal(service.publishedGeneration(input,[['protocol.txt','text/plain','changed contents']]),null);
 const core=service.current();
 page.ctx.localStorage.setItem(service.keys.project,JSON.stringify({...core,status:'validation_error'}));
 assert.equal(service.publishedGeneration(input,files),null);
 delete core.generation_files_key;
 page.ctx.localStorage.setItem(service.keys.project,JSON.stringify(core));
 assert.equal(service.publishedGeneration(input,files),null);
 const epoch=B.resetProject(page.ctx.localStorage,projectId,{question});
 assert.equal(service.publishedGeneration({...input,legacy:{criteria_epoch:epoch}},[]),null);
 assert.throws(()=>service.publishedGeneration(input,[]),{code:'VERSION_CONFLICT'});
});
