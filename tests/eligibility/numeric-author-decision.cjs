const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../../app/eligibility/engine'),M=require('../../app/eligibility/model');

test('the verified age wording governs machine metadata before Jev, and the author can accept an isolated conflicting item',async()=>{
 const text='adults aged over 18 years';
 const input=E.save_input(E.create_project('age-source'),{research_question:text,question_framework:'PICO',output_language:'en'}).state;
 const q=input.questions[0],source=input.sources.find(s=>s.input_kind==='research_question');
 const entry={candidate_id:'age',dimension_id:'population.age',normalized_text:text,structured_value:{operator:'gte',value:18,unit:'year'},source_refs:[E.ref(source,text)],semantic_role:'eligibility_condition',scope_status:'restricted',information_status:'explicit',disposition:'include'};
 const proposal={question_id:q.question_id,framework_candidates:['pico'],elements:[entry],issues:[],logic:null};
 const supported={status:'supported',issue_type:'none',reason:'Source checked.'};
 const result=await M.analyze(input,E.environment(),{request:async(step,_project,payload)=>{
  if(step==='extract_elements')return {questions:[structuredClone(proposal)]};
  assert.equal(step,'review_normalization');
  assert.equal(payload.items[0].structured_value.operator,'gt');
  return {items:payload.items.map(item=>({...item,...supported}))};
 }});
 const verified=E.ingest_candidates(input,result.candidates).state;
 assert.equal(verified.status,'final');
 assert.equal(verified.criteria[0].structured_value.operator,'gt');

 const pending=E.ingest_candidates(input,{questions:[{...proposal,eligibility_policy:'framework-only-v1',elements:[{...entry,semantic_review:supported}]}]}).state;
 assert.equal(pending.status,'needs_clarification');
 const issue=pending.issues.find(i=>i.status==='open'&&i.blocking);
 const option=issue.options.find(o=>o.option_id==='use_proposed');
 const saved=E.apply_decisions(pending,{base_revision:pending.revision,request_id:'accept-age',answers:[{issue_id:issue.issue_id,option_id:option.option_id,answer_text:option.label,author_confirmed:true}]}).state;
 assert.equal(saved.status,'final');assert.equal(saved.criteria[0].text,text);
 assert.notEqual(saved.criteria[0].structured_value?.operator,'gte');
});
