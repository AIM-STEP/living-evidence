const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../../app/eligibility/engine'), M=require('../../app/eligibility/model');

async function generate(text,wording,verdict='supported',ambiguous=false,options={}){
 const state=E.save_input(E.create_project('explicit-source'),{research_question:text,question_framework:'PICO',output_language:'en'}).state;
 const source=state.sources.find(s=>s.input_kind==='research_question');
 const item={candidate_id:'p',dimension_id:options.dimension||'population',normalized_text:wording,source_refs:[E.ref(source,options.quote||wording)],
  information_status:ambiguous?'ambiguous':'explicit',disposition:options.side||'include',semantic_role:options.role||'eligibility_condition',scope_status:'restricted',structured_value:null};
 let checks=0;
 const instructions=[];
 const adapter={async request(step,project,payload,schema,instruction){
  if(step==='extract_elements')return {questions:[{question_id:state.questions[0].question_id,framework_candidates:['pico'],elements:[item],issues:options.issues||[],logic:null}]};
  assert.equal(step,'review_normalization');checks++;
  instructions.push(instruction);
  const vote=options.votes?.[checks-1]||{verdict:verdict==='ambiguous'?verdict:'low_confidence',original_verdict:verdict};
  return {items:payload.items.map(i=>({...i,status:vote.verdict==='supported'?'supported':'uncertain',
   issue_type:vote.verdict==='supported'?'none':'ambiguous_source',reason:'Fixture vote',
   reviewer:{provider:'typesafe',...vote}}))};
 }};
 const {candidates,incomplete_review}=await M.analyze(state,E.environment(),adapter);
 const project=E.ingest_candidates(state,candidates).state;
 return {e:candidates.questions[0].elements[0],checks,issues:project.issues,criteria:project.criteria,instructions,incomplete_review};
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
 assert.equal(disagrees.e,undefined);
 assert.equal(disagrees.checks,2);
 assert(!disagrees.issues.some(i=>i.status==='open'&&i.blocking));
 const unscoped=await generate('The reported sample included adults with severe asthma.','adults with severe asthma');
 assert.equal(unscoped.e,undefined);
 assert.equal(unscoped.checks,2);
});

test('ordinary eligibility language and equivalent typography carry a source-defined field through Jev',async()=>{
 const statement='To compare A with B in people with heart disease.';
 const population=await generate(statement,'people with heart disease','supported',true);
 assert.equal(population.checks,1);
 assert.equal(population.e.semantic_review.status,'supported');
 const excluded=await generate('Exclude patients with drug‐resistant asthma.','Patients with drug-resistant asthma','supported',true,{
  quote:'patients with drug‐resistant asthma',side:'exclude',
  issues:[{reason_code:'PROPOSED_RESTRICTION',question_text:'Also restrict by age?',scope_impact:'Not stated.',element_candidate_ids:['p'],options:[]}]});
 assert.equal(excluded.e.semantic_review.status,'supported');
 const partial=await generate(statement,'people');
 assert.equal(partial.e,undefined);
 const subgroup=await generate('To compare A with B according to severity in people with heart disease.','people with heart disease');
 assert.equal(subgroup.e,undefined);
 const interest=await generate('Our outcomes of interest were pain.','pain','supported',true,{dimension:'outcome',role:'undecided'});
 assert.equal(interest.checks,0);
 assert.equal(interest.e,undefined);
});

test('a review-induced author check requires both Jev scores to reach 0.98',async()=>{
 const text='Include eligible adults.',wording='eligible adults';
 const ambiguous=(confidence,choice_probability)=>({verdict:'ambiguous',confidence,choice_probability});
 for(const scores of [[.97,.99],[.99,.97]]){
  const below=await generate(text,wording,'ambiguous',false,{votes:[ambiguous(...scores),ambiguous(...scores)]});
  assert.equal(below.checks,2);
  assert.equal(below.criteria.length,0);
  assert(!below.issues.some(i=>i.status==='open'&&i.blocking));
  assert.equal(below.incomplete_review,false);
  assert.match(below.instructions[1],/On this retry/);
 }
 const boundary=await generate(text,wording,'ambiguous',false,{votes:[ambiguous(.98,.98)]});
 assert.equal(boundary.checks,1);
 assert.equal(boundary.criteria.length,0);
 assert(boundary.issues.some(i=>i.status==='open'&&i.blocking&&i.trigger_rule_id==='independent_source_check'));
 const recovered=await generate(text,wording,'ambiguous',false,{votes:[ambiguous(.97,.97),{verdict:'supported'}]});
 assert.equal(recovered.checks,2);
 assert.deepEqual(recovered.criteria.map(c=>c.text),[wording]);
 assert(!recovered.issues.some(i=>i.status==='open'&&i.blocking));
});

test('the original qualitative age group is reviewed once without an invented numerical threshold',async()=>{
 const pass=await generate('Include older adults.','older adults','supported',true);
 assert.equal(pass.checks,1);
 assert.equal(pass.e.semantic_review.status,'supported');
 assert.equal(pass.e.structured_value,null);
 const open=await generate('Include older adults. The age threshold remains to be decided.','older adults','supported',true);
 assert.equal(open.checks,0);assert(open.e.review_pending);
});
