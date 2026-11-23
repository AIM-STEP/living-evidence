const {test}=require('node:test');
const assert=require('node:assert/strict');
const Engine=require('../app/eligibility/engine.js');
const Background=require('../app/eligibility/background.js');
const Library=require('../app/eligibility-library.js');
const {setup}=require('./test_eligibility_grounding.cjs');

const project='synthetic-grounding',key='aimstep-eligibility:'+project;
const question='Exercise in adults with fibromyalgia. Whether cluster randomised trials are eligible is to be decided.';
const design='cluster randomised trials';
const config={frameworkConfig:require('../config/eligibility-frameworks.json'),
 profileConfig:require('../config/eligibility-review-profiles.json'),baseURL:'http://localhost/'};
function open(storage){
 const page=setup(storage);
 Object.assign(page.ctx.window,{AIMSTEPEligibilityEngine:Engine,
  AIMSTEPEligibilityBackground:{...Background,create:args=>Background.create({...args,...config})},AimstepEligibilityLibrary:Library});
 page.api.fill();
 return page;
}

async function generate(){
 const page=open();
 page.api.transport((url,options)=>{
  const {step,payload}=JSON.parse(JSON.parse(options.body).messages[1].content);
  let reply;
  if(step==='extract_elements'){
   const q=payload.question,source=q.sources[0];
   const element=(candidate_id,dimension_id,quote,certainty='explicit')=>({candidate_id,dimension_id,normalized_text:quote,structured_value:null,
    source_refs:[{source_id:source.source_id,source_revision:source.revision,quote}],
    semantic_role:'eligibility_condition',scope_status:'restricted',information_status:certainty,disposition:'include'});
   const elements=[element('p','population','adults with fibromyalgia'),element('i','intervention','Exercise'),element('s','study_design',design,'ambiguous')];
   reply={questions:[{question_id:q.question_id,review_topic:'Exercise in adults with fibromyalgia',framework_candidates:['picos'],elements,issues:[],logic:null}]};
  }else {
   assert.equal(step,'review_normalization');
   reply={items:payload.items.map(item=>({...item,status:'supported',issue_type:'none',reason:'Supported by the source.'}))};
  }
  return Promise.resolve({ok:true,json:async()=>({message:{content:JSON.stringify(reply)},
   ...(step==='review_normalization'?{provider:'typesafe',review:{policy:'jev-once-v1'}}:{})})});
 },'backend');
 page.el('generation-method').value='machine';page.el('generation-method').handlers.change();
 page.el('question').value=question;
 await page.el('start-machine').handlers.click();
 assert.equal(page.el('generation-status').textContent,'');
 return page;
}

test('a genuine open design decision survives reload and remains outside shared rules',async()=>{
 const page=await generate();
 const before=JSON.parse(page.storage.get(key));
 const check=before.machineRefinement.sourceConfirmations.find(item=>item.domain==='Study design');
 assert(check);
 assert.equal(before.eligibilityV3Snapshot.questions[0].include.some(rule=>rule.dimension_id==='study_design'),false);
 const reopened=open(page.storage);
 assert.match(reopened.el('preview').innerHTML,/cluster randomised trials/i);
 assert.match(Library.criteriaHandoffBlock(before),/unresolved author checks/);
 assert(!page.storage.has('aimstep-eligibility-summary:'+project));
 const details=reopened.api.state().machineRefinement.sourceConfirmations;
 const index=details.findIndex(item=>item.domain==='Study design');
 const choice=details[index].options.findIndex(option=>option.option_id==='use_proposed');
 assert(choice>=0);
 const write=reopened.ctx.localStorage.setItem;
 reopened.ctx.localStorage.setItem=()=>{throw Error('Synthetic quota failure')};
 assert.equal(await reopened.api.confirm(index,choice),false);
 assert.deepEqual(JSON.parse(page.storage.get(key)),before);
 reopened.ctx.localStorage.setItem=write;
 reopened.api.denyModelAccess();
 assert(await reopened.api.confirm(index,choice));
 const updated=JSON.parse(page.storage.get(key));
 assert(updated.eligibilityV3Snapshot.questions[0].include.some(rule=>rule.text.includes(design)));
 assert.match(Buffer.from(reopened.api.export()).toString(),/cluster randomised trials/);
 assert.equal(Library.criteriaHandoffBlock(updated),'');
});
