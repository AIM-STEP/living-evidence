const {test}=require('node:test');
const assert=require('node:assert/strict');
const B=require('../../app/eligibility/background');
const E=require('../../app/eligibility/engine');
const {setup}=require('../../tools/test_eligibility_grounding.cjs');

const config={frameworkConfig:require('../../config/eligibility-frameworks.json'),profileConfig:require('../../config/eligibility-review-profiles.json'),baseURL:'http://localhost/'};
const projectId='synthetic-grounding',question='Adults with coronary heart disease';
function open(storage){
 const page=setup(storage);
 page.ctx.window.AIMSTEP={projectController:{state:()=>({projects:[{id:projectId,project_type:'systematic',question_type:'effectiveness'}]})}};
 page.ctx.window.AIMSTEPEligibilityEngine=E;
 page.ctx.window.AIMSTEPEligibilityBackground={...B,create:args=>B.create({...args,...config})};
 return page;
}
function edit(page,body){
 const editor={childNodes:[{nodeType:1,tagName:'P',hasAttribute:()=>true,childNodes:[{nodeType:3,nodeValue:'This author check stays outside the edited text.'}]},{nodeType:3,nodeValue:body}]};
 page.el('preview').querySelector=()=>editor;
 const target={closest:selector=>selector==='[data-criteria-document]'?editor:null};
 page.el('preview').handlers.input({target});
 return page.el('save-criteria').handlers.click();
}

test('one editable body saves multiple fields and prose while keeping the review heading and pending choices',async()=>{
 const page=open(),preview=page.el('preview');
 page.api.transport(async(url,options)=>{
  const {step,payload}=JSON.parse(JSON.parse(options.body).messages[1].content);
  let reply;
  if(step==='extract_elements'){
   const q=payload.question,source=q.sources[0];
   reply={questions:[{question_id:q.question_id,review_topic:question,framework_candidates:['picos'],issues:[],logic:{op:'predicate',element_id:'p'},elements:[{candidate_id:'p',dimension_id:'population',normalized_text:question,source_refs:[{source_id:source.source_id,source_revision:source.revision,quote:question}],structured_value:null,semantic_role:'eligibility_condition',scope_status:'restricted',information_status:'explicit',disposition:'include'}]}]};
  }else reply={items:payload.items.map(item=>({...item,status:'supported',issue_type:'none',reason:'Verified.'}))};
  return {ok:true,json:async()=>({message:{content:JSON.stringify(reply)},...(step==='review_normalization'?{provider:'typesafe',review:{policy:'jev-once-v1'}}:{})})};
 },'backend');
 page.el('generation-method').value='machine';page.el('generation-method').handlers.change();page.el('question').value=question;
 await page.el('start-machine').handlers.click();
 assert.equal(page.el('generation-status').textContent,'');
 assert.equal((preview.innerHTML.match(/contenteditable="plaintext-only"/g)||[]).length,1);
 assert(preview.innerHTML.indexOf('Framework:')<preview.innerHTML.indexOf('data-criteria-document'));
 assert(preview.innerHTML.indexOf('Review topic:')<preview.innerHTML.indexOf('data-criteria-document'));
 assert.equal(page.api.state().machineRefinement.sourceConfirmations.length,2);
 page.api.denyModelAccess();
 edit(page,'Inclusion\nPopulation: Adults with coronary heart disease aged 50 years or older.\nOutcomes: All-cause mortality.\n\nExclusion\nPopulation: Patients with prior cardiac transplantation.\n\nDescription\nThe author’s description.\n\nIts second paragraph.');
 const saved=JSON.parse(page.storage.get('aimstep-eligibility:'+projectId));
 const rules=saved.machineCriteria.find(row=>row.title==='Population');
 assert.match(rules.condition,/aged 50 years/);assert.match(rules.uncertain,/prior cardiac transplantation/);
 assert.equal(saved.machineRefinement.reviewTopic,question);
 assert.equal(saved.machineRefinement.manuscriptParagraph,'The author’s description.\n\nIts second paragraph.');
 const core=await B.create({projectId,storage:page.ctx.localStorage,...config});
 assert.equal(core.current().criteria.filter(row=>row.dimension_id==='population').length,2);
 assert(!core.current().criteria.some(row=>row.dimension_id==='outcome'));
 assert.equal(core.current().questions[0].author_outcome_groups[0].items[0],'All-cause mortality.');
 assert.equal(saved.machineRefinement.sourceConfirmations.length,2);
 const design=saved.machineRefinement.sourceConfirmations.findIndex(issue=>issue.domain==='Study design');
 assert(await page.api.confirm(design,0));
 const updated=page.api.state().machineRefinement;
 assert.match(updated.rows.find(row=>row.dimension==='Population').include[0],/aged 50 years/);
 assert.match(updated.rows.find(row=>row.dimension==='Study design').include[0],/randomised controlled trials/i);
 assert.match(updated.manuscriptParagraph,/Its second paragraph/);
 const word=Buffer.from(page.api.export()).toString('utf8');
 assert.match(word,/aged 50 years/);assert.match(word,/All-cause mortality\.<\/w:t>/);
 assert.match(word,/description\.<\/w:t><\/w:r><\/w:p><w:p>/u);
 const reopened=open(page.storage);
 assert.match(reopened.el('preview').innerHTML,/Its second paragraph/);
 assert.match(reopened.el('preview').innerHTML,/aged 50 years/);
});
