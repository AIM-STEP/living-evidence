const assert=require('node:assert/strict');
const B=require('../../app/eligibility/background.js');
const E=require('../../app/eligibility/engine.js');
const M=require('../../app/eligibility/model.js');
const {setup}=require('../../tools/test_eligibility_grounding.cjs');

(async()=>{
 const id='answer-routing',wording='Exercise for adults.';
 const initial=E.save_input(E.create_project(id),{research_question:wording,question_framework:'PICO',output_language:'en'}).state;
 const q=initial.questions[0],source=initial.sources.find(s=>s.source_id===q.source_refs[0].source_id);
 const elements=[['p','population','adults','eligibility_condition'],['i','intervention','Exercise','review_focus']].map(([candidate_id,dimension_id,quote,semantic_role])=>({
  candidate_id,dimension_id,semantic_role,normalized_text:quote,structured_value:null,source_refs:[E.ref(source,quote)],information_status:'explicit',
  scope_status:semantic_role==='review_focus'?'unspecified':'restricted',disposition:semantic_role==='review_focus'?null:'include',semantic_review:{status:'supported'}
 }));
 const project=E.ingest_candidates(initial,{questions:[{question_id:q.question_id,elements,framework_candidates:[],issues:[],logic:null}]}).state;
 const issue=project.issues.find(i=>i.status==='open'&&i.trigger_rule_id==='source_scope_role');
 const option=issue.options.find(o=>o.option_id==='eligibility');
 const values=new Map(),storage={getItem:key=>values.get(key)||null};
 const service=await B.create({projectId:id,storage,frameworkConfig:require('../../config/eligibility-frameworks.json'),profileConfig:require('../../config/eligibility-review-profiles.json'),baseURL:'http://localhost/'});
 values.set(service.keys.project,JSON.stringify(project));
 const decide=(text,modelClient,option_id)=>service.decide({issue_id:issue.issue_id,answer_text:text,option_id,modelClient});
 const assertApplied=(stage,text)=>{
  assert.equal(stage.project.elements.find(e=>e.element_id===issue.element_ids[0]).semantic_role,'eligibility_condition');
  const decision=stage.project.decisions.at(-1);
  assert.equal(decision.answer_text,text);
  assert.deepEqual(decision.issue_ids,[issue.issue_id]);
 };
 const exact='  '+option.label+'  ';
 assertApplied(await decide(exact,null),exact);
 assertApplied(await decide(option.label,null,option.option_id),option.label);

 const unused={async request(){assert.fail('An author confirmation must not call a model.');}};
 const written='Include supervised exercise for adults.';
 const direct=(await decide(written,unused)).project;
 const decision=direct.decisions.at(-1);
 assert.deepEqual(decision.issue_ids,[issue.issue_id]);
 assert.equal(decision.answer_text,written);
 assert(direct.sources.some(s=>s.source_id===decision.source_ref.source_id&&s.source_type==='human_answer'&&s.original_text===written));
 assert.equal(direct.issues.find(i=>i.issue_id===issue.issue_id).status,'resolved');
 await assert.rejects(decide(written,unused,'unavailable'),{code:'OPTION_NOT_FOUND'});

 // The separately callable interpretation API still validates stored-option replies.
 const input='Make this an eligibility requirement.';
 const choice={issue_ids:[issue.issue_id],option_id:option.option_id,answer_text:input};
 const metadata={provider:'typesafe',review:{version:'eligibility-answer-v1',route:'stored_option'}};
 const reply=(answer,serviceMetadata=metadata)=>({ok:true,json:async()=>({...serviceMetadata,message:{content:JSON.stringify({answers:[answer]})}})});
 const calls=[];
 async function respond(url,options){
  const body=JSON.parse(options.body),envelope=JSON.parse(body.messages[1].content);
  assert.equal(body.task,'eligibility-answer-v1');
  assert.equal(envelope.payload.answer_text,input);
  calls.push(url);return reply(choice);
 }
 const base='http://localhost/api/eligibility';
 const headless=M.client({base,fetch:respond});
 const interpret=async client=>({project:E.apply_decisions(project,await M.parse_answers(project,input,[issue.issue_id],client)).state});
 assertApplied(await interpret(headless),input);
 assert.deepEqual(calls,[base+'/model']);
 assert.equal(headless.exchanges[0].hybrid_review.route,'stored_option');
 const page=setup();page.api.transport(respond);
 const browser=page.api.progressClient({provider:'backend',base,auditTrail:[]});
 assertApplied(await interpret(browser),input);
 assert.equal(browser.exchanges[0].hybridReview.route,'stored_option');
 assert.equal(calls.length,2);

 const attempt=(answer,meta)=>M.parse_answers(project,input,[issue.issue_id],M.client({base,fetch:async()=>reply(answer,meta)}),{retries:0});
 for(const [answer,meta] of [
  [choice,{...metadata,provider:'local'}],
  [choice,{provider:'typesafe'}],
  [{...choice,answer_text:'Not an eligibility requirement.'},metadata],
  [{...choice,issue_ids:['unrelated']},metadata],
  [{...choice,option_id:'unavailable'},metadata],
  [{...choice,updates:[]},metadata]
 ])await assert.rejects(attempt(answer,meta),e=>e.code==='MODEL_SCHEMA_ERROR');

 console.log('PASS: direct author confirmations preserve their source, and the standalone interpretation API validates authenticated option choices in both clients.');
})().catch(error=>{console.error(error);process.exitCode=1;});
