const assert=require('node:assert/strict'),E=require('../app/eligibility/engine.js'),M=require('../app/eligibility/model.js'),fixture=require('../tests/eligibility/fixtures/nutrition-ipd-nma.json');
(async()=>{
 const state=E.save_input(E.create_project('scope-coverage-contract'),{research_question:fixture.research_question,question_framework:'PICO',output_language:'en'}).state;let calls=0;
 const adapter={request:async(step,project,payload)=>{
  calls++;const q=payload.question,source=q.sources.find(s=>s.input_kind==='research_question'),make=(id,dimension,quote)=>({candidate_id:id,dimension_id:dimension,normalized_text:quote,structured_value:null,source_refs:[{source_id:source.source_id,source_revision:source.revision,quote}],semantic_role:dimension==='outcome'?'review_focus':'eligibility_condition',information_status:'explicit',scope_status:dimension==='outcome'?'unspecified':'restricted',disposition:dimension==='outcome'?null:'include'});
  const elements=[make('p','population','hospitalised older people at risk of or with established malnutrition'),make('i','intervention','various nutritional interventions')];
  if(calls===2){assert(payload.validation_feedback.message.includes('comparison, outcomes'));elements.push(make('c','comparator','a control group (standard care or placebo)'),make('h','comparator','each other'),make('o','outcome','patient-relevant outcomes'));}
  return {questions:[{question_id:q.question_id,review_topic:'Nutritional interventions in older inpatients',framework_candidates:[{framework_id:'pico',basis:'Simulated'}],elements,issues:[],logic:null}]};
 }};
 const result=await M.extract_elements(state,E.environment(),adapter,{retries:1});assert.equal(calls,2);assert(result.questions[0].elements.some(e=>e.dimension_id==='comparator'));assert(result.questions[0].elements.some(e=>e.dimension_id==='outcome'&&e.semantic_role==='review_focus'));
 // A comparison can already be present and source-backed under the wrong label.
 // Use the same remapping as ingest to avoid another extraction. Keep the model's
 // actual classifications intact for the subsequent independent semantic review.
 const env=E.environment(),profiles=env.profiles.resolve(['systematic_review']);
 const saved=E.save_input(E.create_project('scope-coverage-contract'),{research_question:fixture.research_question,review_method:'systematic_review',question_framework:'PICO',output_language:'en'}, {},env).state;
 let requests=0,profileBytes,compactBytes;
 await M.extract_elements(saved,env,{request:async(step,project,payload)=>{
  requests++;const profileContext=payload.review_profiles;
  assert.deepEqual(profileContext.profiles.map(p=>({...profileContext.fields_shared_by_all_profiles,...p})),profiles);
  profileBytes=Buffer.byteLength(JSON.stringify(profiles));compactBytes=Buffer.byteLength(JSON.stringify(profileContext));
  assert(compactBytes<profileBytes);
  const source=payload.question.sources[0];assert(!('created_at' in source));assert(!('identity' in source));assert.equal(source.original_text,fixture.research_question);
  const elements=result.questions[0].elements.map(e=>({...e,dimension_id:e.dimension_id==='comparator'?'other':e.dimension_id,source_refs:e.source_refs.map(ref=>({...ref,source_id:source.source_id,source_revision:source.revision}))}));
  return {questions:[{question_id:payload.question.question_id,review_topic:'Nutritional interventions in older inpatients',framework_candidates:[{framework_id:'pico',basis:'Simulated'}],elements,issues:[],logic:null}]};
 }},{retries:1});
 assert.equal(requests,1,'Source-linked comparison stored under Other should need only one extraction');
 let coverageAttempts=0;
 await M.extract_elements(saved,env,{request:async(step,project,payload)=>{
  coverageAttempts++;
  const question={question_id:payload.question.question_id,framework_candidates:[{framework_id:'pico',basis:'Simulated'}],issues:[],logic:null};
  const source=payload.question.sources[0];
  const full=result.questions[0].elements.map(e=>({...e,source_refs:e.source_refs.map(ref=>({...ref,source_id:source.source_id,source_revision:source.revision}))}));
  if(coverageAttempts===1){
   question.elements=full.filter(e=>e.source_refs[0].quote!=='each other').map(e=>e.dimension_id==='comparator'?{...e,normalized_text:'standard care'}:e);
  }else{
   assert.match(payload.validation_feedback.message,/placebo, head-to-head comparison/);
   question.elements=full;
  }
  return {questions:[question]};
 }},{retries:1});
 assert.equal(coverageAttempts,2);
 console.log(`PASS: incomplete source coverage still retries; a source-backed comparator under Other needs one extraction. Identical review profile fields compressed losslessly from ${profileBytes} to ${compactBytes} bytes.`);
})().catch(error=>{console.error(error.stack);process.exitCode=1});
