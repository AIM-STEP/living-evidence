/* Regression checks with simulated model replies and the real frontend/engine. */
const assert=require('node:assert/strict'),E=require('../../app/eligibility/engine.js'),B=require('../../app/eligibility/background.js'),{setup}=require('../../tools/test_eligibility_grounding.cjs');
const fixture=require('./fixtures/nutrition-ipd-nma.json'),frameworks=require('../../config/eligibility-frameworks.json'),profiles=require('../../config/eligibility-review-profiles.json');
(async()=>{
 const t=setup();t.ctx.window.AIMSTEPEligibilityEngine=E;t.ctx.window.AIMSTEPEligibilityBackground={...B,create:options=>B.create({...options,baseURL:'http://localhost/',frameworkConfig:frameworks,profileConfig:profiles})};
 t.api.transport(async(url,options)=>{
  const envelope=JSON.parse(JSON.parse(options.body).messages[1].content),payload=envelope.payload;let result;
  if(envelope.step==='extract_elements'){
   const q=payload.question,source=q.sources.find(s=>s.input_kind==='research_question');
   const make=(candidate_id,dimension_id,quote,normalized_text=quote)=>({candidate_id,dimension_id,normalized_text,structured_value:null,source_refs:[{source_id:source.source_id,source_revision:source.revision,quote}],semantic_role:'eligibility_condition',information_status:'explicit',scope_status:'restricted',disposition:'include'});
   result={questions:[{question_id:q.question_id,review_topic:'Nutritional interventions in hospitalised older people.',framework_candidates:[{framework_id:'pico',basis:'Simulated'}],elements:[
    make('p','population','hospitalised older people at risk of or with established malnutrition'),make('i','intervention','various nutritional interventions','nutritional interventions'),
    make('c1','other',fixture.research_question,'standard care or placebo.'),make('c2','comparison_group','each other','nutritional interventions'),{...make('o','outcome','patient-relevant outcomes'),semantic_role:'review_focus',scope_status:'unspecified',disposition:null}],
    issues:[{reason_code:'AMBIGUOUS_MEANING',question_text:'Which assessment defines nutritional risk?',scope_impact:'Defines the intended population.',element_candidate_ids:['p']}],
    logic:{op:'all_of',children:[{op:'predicate',element_id:'p'},{op:'predicate',element_id:'i'},{op:'any_of',children:[{op:'predicate',element_id:'c1'},{op:'predicate',element_id:'c2'}]}]}}]};
  }else if(envelope.step==='review_normalization')result={items:payload.items.map(item=>({id:item.id,status:'supported',reason:'Simulated source review',issue_type:'none',information_status:item.information_status,semantic_role:item.semantic_role,scope_status:item.scope_status,disposition:item.disposition}))};
  else if(envelope.step==='interpret_human_answer')result={answers:[{issue_ids:[payload.issues[0].issue_id],answer_text:payload.answer_text,action:'confirm',updates:[{element_id:payload.issues[0].element_ids[0],structured_value:{operator:'gte',value:65,unit:'year'}}]}]};
  else throw Error('Unexpected step');
  return {ok:true,json:async()=>({message:{content:JSON.stringify(result)},model:'Simulated'})};
 });
 t.el('generation-method').value='machine';t.el('generation-method').handlers.change();t.el('question').value=fixture.research_question;await t.el('start-machine').handlers.click();
 let state=t.api.state();assert(state.machineRun,t.el('generation-status').textContent);const rows=state.machineRefinement.rows;
 assert(!rows.some(r=>r.dimension==='Other'));assert(rows.find(r=>r.dimension==='Comparison').include.join(' ').includes('another nutritional intervention'));
 const checks=state.machineRefinement.sourceConfirmations;assert(checks.some(c=>c.text.includes('Which assessment defines nutritional risk?')),'Actual source questions must reach the user');
 for(const domain of ['Population','Intervention','Comparison','Outcomes','Analysis plan','Data plan'])assert(checks.some(c=>c.domain===domain),'Each broad source element must offer its own author check: '+domain);
 const preview=t.el('preview').innerHTML;assert(preview.includes('Review focus and analysis plan'));assert(preview.includes('patient-relevant outcomes'));assert(preview.includes('individual participant data'));
 const exported=Buffer.from(t.api.export()).toString('utf8');assert(exported.includes('Review focus and analysis plan'));assert(exported.includes('Author checks pending'));assert(exported.includes('patient-relevant outcomes'));
 assert(checks.some(c=>c.text.includes('age boundary')));assert(t.el('preview').innerHTML.includes('data-source-answer='),'Unresolved questions need a working answer field');
 const ageIndex=checks.findIndex(c=>c.text.includes('age boundary'));t.ctx.document.querySelector=()=>({value:'65 years or older',focus(){}});
 assert(await t.api.confirm(ageIndex,'answer'),t.el('generation-status').textContent);state=t.api.state();
 assert(state.machineCriteria.some(r=>r.condition.includes('65')),'A real author answer must update the criteria');
 assert(state.machineRefinement.sourceConfirmations.some(c=>c.text.includes('Which assessment defines nutritional risk?')),'Unanswered questions must remain pending');
 const service=await B.create({projectId:'synthetic-grounding',storage:t.ctx.localStorage,frameworkConfig:frameworks,profileConfig:profiles,baseURL:'http://localhost/'});
 const edited=structuredClone(state);edited.machineCriteria[0].condition+=' Author edit.';assert.equal(service.refreshPresentation(edited),null,'Presentation refresh must preserve author edits');
 const project=service.current(),q=project.questions.find(q=>q.active!==false),find=dimension=>project.elements.filter(e=>e.active!==false&&e.dimension_id===dimension&&e.information_status!=='missing');
 const population=find('population')[0],intervention=find('intervention')[0],comparisons=find('comparator'),leaf=e=>({op:'predicate',element_id:e.element_id});
 q.logic={op:'any_of',children:comparisons.map(c=>({op:'all_of',children:[leaf(population),leaf(intervention),leaf(c)]}))};E.rebuild(project);
 const factored=B.projectToClassic(project);assert(!factored.rows.some(r=>r.dimension==='Other'),'Equivalent comparison branches must stay in PICO domains');assert(factored.rows.find(r=>r.dimension==='Comparison').include.join(' ').includes(' or '));
 console.log('PASS: comparator aliases and source context, unresolved source questions, author answer application and edit-safe presentation refresh');
})().catch(error=>{console.error(error.stack);process.exitCode=1});
