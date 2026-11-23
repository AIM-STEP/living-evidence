const {test}=require('node:test');
const assert=require('node:assert/strict');
const B=require('../../app/eligibility/background');
const E=require('../../app/eligibility/engine');
const {setup}=require('../../tools/test_eligibility_grounding.cjs');
const config={frameworkConfig:require('../../config/eligibility-frameworks.json'),profileConfig:require('../../config/eligibility-review-profiles.json'),baseURL:'http://localhost/'};
const projectId='synthetic-grounding';
const question='We included trials comparing exercise with education in adults or in a community setting.';

test('the same attachments require a fresh extraction and review after reattachment',async()=>{
 function open(storage){
  const page=setup(storage);
  page.ctx.window.AIMSTEPEligibilityEngine=E;
  page.ctx.window.AIMSTEPEligibilityBackground={...B,create:args=>B.create({...args,...config})};
  return page;
 }
 const page=open(),calls=[];
 let clock=Date.now();
 page.ctx.Date=class extends Date{static now(){return clock;}};
 async function reply(url,options){
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
   assert.equal(payload.items.length,1);
   if(calls.length===2)clock+=12000;
   answer={items:payload.items.map(e=>({...e,status:'supported',issue_type:'none',reason:'Source verified.'}))};
  }
  return {ok:true,json:async()=>({message:{content:JSON.stringify(answer)},...(request.step==='review_normalization'?{provider:'typesafe',review:{policy:'jev-once-v1'}}:{})})};
 }
 page.api.transport(reply,'backend');
 page.el('generation-method').value='machine';page.el('generation-method').handlers.change();page.el('question').value=question;
 const attachment=new File(['Protocol supplement.'],'protocol.txt',{type:'text/plain'});
 function attach(target){
  target.el('machine-attachments').replaceChildren=()=>{};
  target.el('machine-attachments').append=()=>{};
  target.ctx.document.createElement=()=>({append(){},setAttribute(){},addEventListener(){}});
  target.el('source-files').handlers.change({target:{files:[attachment]}});
 }
 attach(page);
 await page.el('start-machine').handlers.click();
 assert.equal(page.el('generation-status').textContent,'');
 assert.deepEqual(calls,['extract_elements','review_normalization','review_normalization']);
 assert.equal(page.api.state().machineRun.elapsedMs,12000);
 assert.equal(page.el('criteria-elapsed').textContent,'0:12');
 assert(page.api.state().machineRefinement.sourceConfirmations.length);
 const reloaded=open(page.storage);
 assert.equal(reloaded.el('criteria-elapsed').textContent,'0:12');
 reloaded.api.denyModelAccess();
 await reloaded.el('start-machine').handlers.click();
 assert.match(reloaded.el('generation-status').textContent,/Reattach the original files/);
 assert.equal(calls.length,3);
 attach(reloaded);
 reloaded.api.transport(reply,'backend');
 await reloaded.el('start-machine').handlers.click();
 assert.equal(reloaded.el('generation-status').textContent,'');
 assert.deepEqual(calls,['extract_elements','review_normalization','review_normalization',
  'extract_elements','review_normalization','review_normalization']);
 const files=reloaded.api.state().machineRun.fileDigests;
 assert.equal(files[0][2],require('node:crypto').createHash('sha256').update('Protocol supplement.').digest('hex'));
});
