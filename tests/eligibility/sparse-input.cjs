const assert=require('node:assert/strict');
const {test}=require('node:test');
const B=require('../../app/eligibility/background');
const E=require('../../app/eligibility/engine');
const M=require('../../app/eligibility/model');
const {setup}=require('../../tools/test_eligibility_grounding.cjs');

const population='Adults with coronary heart disease';
const config={frameworkConfig:require('../../config/eligibility-frameworks.json'),profileConfig:require('../../config/eligibility-review-profiles.json'),baseURL:'http://localhost/'};
function eligibilityElement(candidate_id,dimension_id,quote,source){
 return {candidate_id,dimension_id,normalized_text:quote,structured_value:null,source_refs:[{source_id:source.source_id,source_revision:source.revision,quote}],
  semantic_role:'eligibility_condition',information_status:'explicit',scope_status:'restricted',disposition:'include'};
}

for(const method of ['machine','manual'])test(`a registered intervention review offers optional advice for sparse ${method} input`,async()=>{
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
   assert.equal(source.original_text,method==='manual'?'Inclusion criteria:\nPopulation: '+population:population);
   answer={questions:[{question_id:q.question_id,review_topic:population,framework_candidates:['pcc'],
    elements:[eligibilityElement('p','population',population,source)],issues:[],logic:{op:'predicate',element_id:'p'}}]};
  }else{
   assert.equal(step,'review_normalization');
   assert.deepEqual(payload.items.map(e=>e.dimension_id),['population']);
   answer={items:payload.items.map(e=>({...e,status:'supported',issue_type:'none',reason:'Source verified.'}))};
  }
  return {ok:true,json:async()=>({message:{content:JSON.stringify(answer)},...(step==='review_normalization'?{provider:'typesafe',review:{policy:'jev-once-v1'}}:{})})};
 },'backend');
 page.el('generation-method').value=method;page.el('generation-method').handlers.change();
 if(method==='manual'){
  page.api.state().manualFramework='PICOS';
  page.api.state().criteria=[{title:'Population',condition:population}];
  page.api.fill();
 }else page.el('question').value=population;
 await page.el(method==='manual'?'refine-manual':'start-machine').handlers.click();
 assert.equal(page.el(method==='manual'?'manual-refine-status':'generation-status').textContent,'');
 const refinement=()=>page.api.state().machineRefinement;
 assert.equal(refinement().framework,'PICOS');
 assert.deepEqual(Array.from(refinement().rows,r=>r.dimension),['Population']);
 assert.deepEqual(Array.from(refinement().sourceConfirmations,d=>d.domain),['Intervention','Study design']);
 assert(refinement().sourceConfirmations.every(d=>d.reviewOnly&&d.methodAdvice));
 assert.match(page.el('preview').innerHTML,/Cochrane Handbook/);
 assert.match(page.el('preview').innerHTML,/Exercise-based cardiac rehabilitation/);
 assert.doesNotMatch(Buffer.from(page.api.export()).toString(),/Which study designs|Randomised controlled trials/);
 const completionKey='aimstep-setup-completed:'+record.id;
 page.api.navigate({preventDefault:()=>assert.fail('Optional advice must not stop navigation')});
 assert.deepEqual(JSON.parse(page.storage.get(completionKey)),[1]);
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
 assert.equal(generate({text:'Population: '+population+'; Intervention: Exercise training'}).classic.sourceConfirmations.length,0);
 assert.equal(generate({text:'Inclusion criteria:\nPopulation: '+population+'\nIntervention: Exercise training'}).classic.sourceConfirmations.length,0);
 assert.equal(generate({text:'Inclusion criteria:\nPopulation: '+population+'\n\nAdditional limits:\nLanguage: English'}).classic.sourceConfirmations.length,0);
});

test('suggest the missing fields for any supported single-field input',async()=>{
 const cases=[
  ['effectiveness','Intervention: Exercise training','Exercise training','intervention','PICOS',['Population','Comparison']],
  ['effectiveness','Comparison: No exercise','No exercise','comparator','PICOS',['Population','Intervention']],
  ['effectiveness','Randomised controlled trials','Randomised controlled trials','study_design','PICOS',['Population','Intervention']],
  ['effectiveness','Outcome: All-cause mortality','All-cause mortality','outcome','PICOS',['Population','Intervention']],
  ['etiology','Exposure: Fine particulate air pollution','Fine particulate air pollution','exposure','PEO',['Population']],
  ['etiology','No exposure','No exposure','comparator','PECO',['Population','Exposure']],
  ['diagnosis','Index test: Rapid antigen testing','Rapid antigen testing','index_test','PIRD',['Target condition','Reference test']],
  ['qualitative','Context: Community clinics','Community clinics','context','PICo',['Population','Phenomenon of Interest']],
  ['qualitative','Study design: Ethnography','Ethnography','design','SPIDER',['Sample','Phenomenon of Interest']],
  ['mapping','Concept: Access to telemedicine','Access to telemedicine','concept','PCC',['Population','Context']]
 ];
 for(const [question_type,text,quote,dimension,framework,domains] of cases){
  const env=E.environment(),state=E.save_input(E.create_project('single-field'),{research_question:text,output_language:'en',
   registration:{project_type:'systematic',question_type,title:dimension==='intervention'?'Exercise in adults with coronary heart disease: a meta-analysis':'Registered review title'}}).state;
  const steps=[];
  const adapter={async request(step,project,payload){
   steps.push(step);
   if(step==='extract_elements'){
    const q=payload.question,field=eligibilityElement('field',dimension,quote,q.sources[0]);
    if(dimension==='outcome')Object.assign(field,{semantic_role:'review_focus',scope_status:'unspecified',disposition:null});
    return {questions:[{question_id:q.question_id,review_topic:quote,framework_candidates:['pcc'],elements:[field],issues:[],logic:null}]};
   }
   assert.equal(step,'review_normalization');
   return {items:payload.items.map(e=>({...e,status:'supported',issue_type:'none',reason:'Source verified.'}))};
  }};
  const {candidates}=await M.analyze(state,env,adapter);
  const project=E.ingest_candidates(state,candidates,{},env).state,classic=B.projectToClassic(project,env.frameworks);
  assert.equal(classic.framework,framework,text);
  assert.deepEqual(classic.sourceConfirmations.filter(d=>d.methodAdvice).map(d=>d.domain),domains,text);
  assert(steps.length<=2,text);
  if(dimension==='outcome'){
   assert.equal(project.criteria.length,0);
   assert.match(classic.manuscriptParagraph,/review outcome is all-cause mortality/i);
  }else assert.equal(project.criteria.length,1,text);
  if(dimension==='intervention'){
   assert.equal(classic.sourceConfirmations.find(d=>d.domain==='Population').options[0].label,population);
   const comparison=classic.sourceConfirmations.find(d=>d.domain==='Comparison');
   assert.deepEqual(comparison.options.map(o=>o.label),['Usual care','No intervention','Skip suggestion']);
   const revised=E.apply_decisions(project,{request_id:'choose',answers:[{issue_id:comparison.issue_id,option_id:'adopt_1',answer_text:'No intervention',author_confirmed:true}]},env).state;
   assert.equal(revised.criteria.find(c=>c.dimension_id==='comparator').text.toLowerCase(),'no intervention');
   assert.deepEqual(B.projectToClassic(revised,env.frameworks).sourceConfirmations.filter(d=>d.methodAdvice).map(d=>d.domain),['Population']);
  }
 }
});
