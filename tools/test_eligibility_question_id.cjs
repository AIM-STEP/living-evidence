const assert=require('node:assert/strict'),E=require('../app/eligibility/engine.js'),M=require('../app/eligibility/model.js');
(async()=>{
 const scoped={project_id:'registered-project',criteria_epoch:'new-run'};
 assert.equal(M.modelProjectId({project_id:'registered-project'}),'registered-project');
 assert.notEqual(M.modelProjectId(scoped),M.modelProjectId({...scoped,criteria_epoch:'previous-run'}));
 assert.notEqual(M.modelProjectId(scoped),M.modelProjectId({...scoped,project_id:'other-project'}));
 assert.equal(M.requestEnvelope('review_normalization',scoped,{},{}).project_id,M.modelProjectId(scoped));
 const state=E.save_input(E.create_project('question-identity-regression'),{research_question:'Include adults.',question_framework:'PICO',output_language:'en'}).state;
 let calls=0;
 const adapter={request:async(step,project,payload,schema)=>{
  calls++;const q=payload.question,ids=schema.properties.questions.items.properties.question_id.enum;
  assert.deepEqual(ids,[q.question_id]);assert.equal(schema.properties.questions.minItems,1);assert.equal(schema.properties.questions.maxItems,1);
  if(calls===2)assert.equal(payload.validation_feedback.code,'MODEL_SCHEMA_ERROR');
  return {questions:[{question_id:calls===1?'foreign-question':q.question_id,review_topic:'Adults',framework_candidates:[],elements:[],issues:[],logic:null}]};
 }};
 const result=await M.extract_elements(state,E.environment(),adapter,{retries:1});
 assert.equal(calls,2,'A foreign ID must trigger a fresh constrained request');
 assert.equal(result.questions[0].question_id,state.questions[0].question_id);
 assert(!M.extractionSchema.properties.questions.items.properties.question_id.enum,'A batch must not mutate the shared schema');
 console.log('PASS: exact question identity is constrained per request; foreign IDs are rejected before retry; the shared schema stays unchanged');
})().catch(error=>{console.error(error.stack);process.exitCode=1});
