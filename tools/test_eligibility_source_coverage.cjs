const assert=require('node:assert/strict'),E=require('../app/eligibility/engine.js'),M=require('../app/eligibility/model.js'),fixture=require('../tests/eligibility/fixtures/nutrition-ipd-nma.json');
(async()=>{
 const state=E.save_input(E.create_project('scope-coverage-contract'),{research_question:fixture.research_question,question_framework:'PICO',output_language:'en'}).state;let calls=0;
 const adapter={request:async(step,project,payload)=>{
  calls++;const q=payload.question,source=q.sources.find(s=>s.input_kind==='research_question'),make=(id,dimension,quote)=>({candidate_id:id,dimension_id:dimension,normalized_text:quote,structured_value:null,source_refs:[{source_id:source.source_id,source_revision:source.revision,quote}],semantic_role:dimension==='outcome'?'review_focus':'eligibility_condition',information_status:'explicit',scope_status:dimension==='outcome'?'unspecified':'restricted',disposition:dimension==='outcome'?null:'include'});
  const elements=[make('p','population','hospitalised older people at risk of or with established malnutrition'),make('i','intervention','various nutritional interventions')];
  if(calls===2){assert(payload.validation_feedback.message.includes('comparison, outcomes'));elements.push(make('c','comparator','a control group (standard care or placebo)'),make('o','outcome','patient-relevant outcomes'));}
  return {questions:[{question_id:q.question_id,review_topic:'Nutritional interventions in older inpatients',framework_candidates:[{framework_id:'pico',basis:'Simulated'}],elements,issues:[],logic:null}]};
 }};
 const result=await M.extract_elements(state,E.environment(),adapter,{retries:1});assert.equal(calls,2);assert(result.questions[0].elements.some(e=>e.dimension_id==='comparator'));assert(result.questions[0].elements.some(e=>e.dimension_id==='outcome'&&e.semantic_role==='review_focus'));
 console.log('PASS: omitted explicit comparisons and outcomes are rejected together; correction preserves review-focus roles');
})().catch(error=>{console.error(error.stack);process.exitCode=1});
