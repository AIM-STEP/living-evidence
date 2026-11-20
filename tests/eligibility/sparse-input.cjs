const assert=require('node:assert/strict');
const {test}=require('node:test');
const B=require('../../app/eligibility/background');
const E=require('../../app/eligibility/engine');
const {setup}=require('../../tools/test_eligibility_grounding.cjs');

const population='Adults with coronary heart disease';
const config={frameworkConfig:require('../../config/eligibility-frameworks.json'),profileConfig:require('../../config/eligibility-review-profiles.json'),baseURL:'http://localhost/'};
function eligibilityElement(candidate_id,dimension_id,quote,source){
 return {candidate_id,dimension_id,normalized_text:quote,structured_value:null,source_refs:[{source_id:source.source_id,source_revision:source.revision,quote}],
  semantic_role:'eligibility_condition',information_status:'explicit',scope_status:'restricted',disposition:'include'};
}

test('a registered intervention review offers source-linked protocol advice only on the sparse path',async()=>{
 const page=setup(),calls=[];
 const record={id:'synthetic-grounding',name:'Effects of exercise-based cardiac rehabilitation in coronary heart disease: a meta-analysis',project_type:'systematic',question_type:'effectiveness',area_of_research:'med'};
 page.ctx.window.AIMSTEP={projectController:{state:()=>({projects:[record]})}};
 page.ctx.window.AIMSTEPEligibilityEngine=E;
 page.ctx.window.AIMSTEPEligibilityBackground={...B,create:options=>B.create({...options,...config})};
 page.api.transport(async(url,options)=>{
  const {step,payload}=JSON.parse(JSON.parse(options.body).messages[1].content);
  calls.push(step);
  let answer;
  if(step==='extract_elements'){
   const q=payload.question,source=q.sources[0];
   assert.equal(q.context.registration.title,record.name);
   assert.equal(source.original_text,population);
   answer={questions:[{question_id:q.question_id,review_topic:population,framework_candidates:['pcc'],
    elements:[eligibilityElement('p','population',population,source)],issues:[],logic:{op:'predicate',element_id:'p'}}]};
  }else{
   assert.equal(step,'review_normalization');
   assert.deepEqual(payload.items.map(e=>e.dimension_id),['population']);
   answer={items:payload.items.map(e=>({...e,status:'supported',issue_type:'none',reason:'Source verified.'}))};
  }
  return {ok:true,json:async()=>({message:{content:JSON.stringify(answer)},...(step==='review_normalization'?{provider:'typesafe',review:{policy:'jev-once-v1'}}:{})})};
 },'backend');
 page.el('generation-method').value='machine';page.el('generation-method').handlers.change();page.el('question').value=population;
 await page.el('start-machine').handlers.click();
 assert.equal(page.el('generation-status').textContent,'');
 const refinement=()=>page.api.state().machineRefinement;
 assert.equal(refinement().framework,'PICOS');
 assert.deepEqual(Array.from(refinement().rows,r=>r.dimension),['Population']);
 assert.deepEqual(Array.from(refinement().sourceConfirmations,d=>d.domain),['Intervention','Study design']);
 assert.match(page.el('preview').innerHTML,/Cochrane Handbook/);
 assert.match(page.el('preview').innerHTML,/Exercise-based cardiac rehabilitation/);
 assert.doesNotMatch(Buffer.from(page.api.export()).toString(),/Which study designs|Randomised controlled trials/);
 page.api.denyModelAccess();
 assert(await page.api.confirm(1,0));
 assert.equal(refinement().rows.find(r=>r.dimension==='Study design').include[0],'Randomised controlled trials (RCTs)');
 assert.match(refinement().manuscriptParagraph,/randomised controlled trials/i);
 const design=page.api.state().eligibilityV3Snapshot.questions[0].elements.find(e=>e.dimension_id==='study_design');
 assert.equal(design.decision_status,'confirmed_by_user');
 assert(!design.source_refs.some(ref=>ref.quote===population));
 const button={dataset:{sourceConfirm:'0',sourceOption:'answer'},closest:()=>({querySelector:()=>({value:'Exercise training with or without education'})})};
 assert(await page.el('preview').handlers.click({target:{closest:()=>button}}));
 assert.match(refinement().rows.find(r=>r.dimension==='Intervention').include[0],/^exercise training with or without education$/i);
 assert.match(page.el('preview').innerHTML,/Exercise training with or without education/);
 assert.equal(refinement().sourceConfirmations.length,0);
 assert(calls.length<=2&&calls[0]==='extract_elements');
});

test('the registered purpose controls advice and complete source coverage takes precedence',()=>{
 function generate({type='systematic',question_type='effectiveness',text=population,withSource=false,extra=[]}={}){
  const state=E.save_input(E.create_project('sparse-policy'),{research_question:text,output_language:'en',
   registration:{project_type:type,question_type,title:'A meta-analysis'},...(withSource&&{additional_requirements:['Studies must include a comparison group.']})}).state;
  const q=state.questions[0],source=state.sources.find(s=>s.input_kind==='research_question');
  const elements=[eligibilityElement('p','population',population,source),...extra.map(([dimension,word])=>eligibilityElement(dimension,dimension,word,source))];
  for(const element of elements){
   element.source_refs=[E.ref(source,element.source_refs[0].quote)];
   element.semantic_review={status:'supported'};
  }
  const project=E.ingest_candidates(state,{questions:[{question_id:q.question_id,eligibility_policy:'framework-only-v1',framework_candidates:['pico'],elements,issues:[],logic:null}]}).state;
  return {project,classic:B.projectToClassic(project)};
 }
 let {project,classic}=generate({type:'scoping'});
 assert.equal(classic.framework,'PCC');
 assert.deepEqual(classic.sourceConfirmations.map(d=>d.domain),['Concept','Context']);
 const omitted=E.apply_decisions(project,{request_id:'skip',answers:[{issue_id:classic.sourceConfirmations[0].issue_id,option_id:'omit',answer_text:'Skip suggestion',author_confirmed:true}]}).state;
 assert.deepEqual(B.projectToClassic(omitted).sourceConfirmations.map(d=>d.domain),['Context']);
 assert.equal(omitted.criteria.length,1);
 assert.equal(generate({question_type:'diagnosis'}).classic.framework,'PIRD');
 assert.equal(generate({question_type:'etiology'}).classic.framework,'PEO');
 assert.equal(generate({question_type:'other'}).classic.sourceConfirmations.length,0);
 assert.equal(generate({withSource:true}).classic.sourceConfirmations.length,0);
 assert.equal(generate({text:population+' receiving exercise training.',extra:[['intervention','exercise training']]}).classic.sourceConfirmations.length,0);
 assert.equal(generate({text:population+' receiving exercise training.'}).classic.sourceConfirmations.length,0);
});
