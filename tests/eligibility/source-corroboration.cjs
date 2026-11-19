const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../../app/eligibility/engine'), M=require('../../app/eligibility/model');

async function generate(text,wording,verdict='supported',ambiguous=false){
 const state=E.save_input(E.create_project('explicit-source'),{research_question:text,question_framework:'PICO',output_language:'en'}).state;
 const source=state.sources.find(s=>s.input_kind==='research_question');
 const item={candidate_id:'p',dimension_id:'population',normalized_text:wording,source_refs:[E.ref(source,wording)],
  information_status:ambiguous?'ambiguous':'explicit',disposition:'include',semantic_role:'eligibility_condition',scope_status:'restricted',structured_value:null};
 let checks=0;
 const adapter={async request(step,project,payload){
  if(step==='extract_elements')return {questions:[{question_id:state.questions[0].question_id,framework_candidates:['pico'],elements:[item],issues:[],logic:null}]};
  assert.equal(step,'review_normalization');checks++;
  return {items:payload.items.map(i=>({...i,status:'uncertain',issue_type:'ambiguous_source',reason:'Fixture vote',
   reviewer:{provider:'typesafe',verdict:verdict==='ambiguous'?verdict:'low_confidence',original_verdict:verdict}}))};
 }};
 const {candidates}=await M.analyze(state,E.environment(),adapter);
 return {e:candidates.questions[0].elements[0],checks};
}

test('a lower-confidence Jev agreement can be corroborated only by a complete source-defined field',async()=>{
 const pass=await generate('Population: adults with severe asthma.','adults with severe asthma');
 assert.equal(pass.e.semantic_review.status,'supported');
 assert.equal(pass.e.semantic_review.reviewer.verdict,'low_confidence');
 assert.equal(pass.e.semantic_review.reviewer.corroboration,'exact_source_field');
 const lowExtraction=await generate('Population: adults with severe asthma.','adults with severe asthma','supported',true);
 assert.equal(lowExtraction.checks,1);assert.equal(lowExtraction.e.semantic_review.status,'supported');
 const undecided=await generate('Population: adults with severe asthma. The severity definition is to be decided.','adults with severe asthma','supported',true);
 assert(undecided.e.review_pending);
 const disagrees=await generate('Population: adults with severe asthma.','adults with severe asthma','wrong_field');
 assert(disagrees.e.review_pending);
 const unscoped=await generate('The reported sample included adults with severe asthma.','adults with severe asthma');
 assert(unscoped.e.review_pending);
});

test('the original qualitative age group is reviewed once without an invented numerical threshold',async()=>{
 const pass=await generate('Include older adults.','older adults','supported',true);
 assert.equal(pass.checks,1);
 assert.equal(pass.e.semantic_review.status,'supported');
 assert.equal(pass.e.structured_value,null);
 const open=await generate('Include older adults. The age threshold remains to be decided.','older adults','supported',true);
 assert.equal(open.checks,0);assert(open.e.review_pending);
});
