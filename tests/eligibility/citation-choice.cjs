const assert = require('node:assert/strict');
const D = require('../../app/eligibility/domain.js');
const E = require('../../app/eligibility/engine.js');
const B = require('../../app/eligibility/background.js');

const original = 'Include adults with asthma. Exclude adults without asthma unless referred for assessment.';
const initial = E.save_input(E.create_project('passage-choice'), {
  research_question: original, question_framework: 'PICO', output_language: 'en',
}).state;
const q = initial.questions[0], source = D.sourceAt(initial, q.source_refs[0]);
const alternatives = ['Include adults with asthma.', 'Exclude adults without asthma unless referred for assessment.'].map(sentence => {
  const context = E.ref(source, sentence), start = context.start + sentence.indexOf('adults');
  return { ...context, match_quote: 'adults', match_start: start, match_end: start + 6, reference_index: 0 };
});
const candidate = {
  candidate_id: 'c4', dimension_id: 'population', normalized_text: 'all adults', structured_value: null,
  source_refs: alternatives.map(a => ({...E.ref(source, 'adults'), start: a.match_start, end: a.match_end})),
  source_occurrence_alternatives: alternatives, semantic_role: 'eligibility_condition',
  scope_status: 'restricted', disposition: 'include', information_status: 'ambiguous',
  semantic_review: { status: 'uncertain', issue_type: 'ambiguous_source' },
};
const state = E.ingest_candidates(initial, { questions: [{
  question_id: q.question_id, framework_candidates: [], elements: [candidate], issues: [], logic: null,
}] }).state;
const issue = state.issues.find(i => i.trigger_rule_id === 'source_occurrence');
assert.equal(issue.options.length, 2);
assert.equal(state.criteria.length, 0);
const element_id = issue.element_ids[0];

(async () => {
  const storage = {getItem: key => key === service.keys.project ? JSON.stringify(state) : null};
  const service = await B.create({projectId:'passage-choice',storage,baseURL:'http://localhost/',
    frameworkConfig:require('../../config/eligibility-frameworks.json'),profileConfig:require('../../config/eligibility-review-profiles.json')});
  const modelClient = { async request() { assert.fail('A selected source passage must be applied without a model request.'); } };
  const select = option => service.decide({issue_id: issue.issue_id, option_id: option.option_id, modelClient});
  const intended = 'adults without asthma unless referred for assessment';
  // Previously stored structured requests still cannot discard direction or exceptions.
  function structured(normalized_text, disposition, selected = issue.options[1]) {
    return E.apply_decisions(state, {base_revision:state.revision,request_id:'invalid-choice',answers:[{
      issue_ids:[issue.issue_id],option_id:selected.option_id,answer_text:selected.label,from_model:true,action:'confirm',
      updates:[{element_id, normalized_text, disposition, scope_status:'restricted', semantic_role:'eligibility_condition'}],
    }]});
  }
  assert.throws(() => structured('adults', 'include', issue.options[0]), {code:'SOURCE_DECISION_INCOMPLETE'});
  assert.throws(() => structured(intended, 'include'), {code:'SOURCE_DECISION_INCOMPLETE'});
  assert.throws(() => structured('adults without asthma', 'exclude'), {code:'SOURCE_DECISION_INCOMPLETE'});

  const included = (await select(issue.options[0])).project;
  assert.equal(included.criteria[0].disposition, 'include');
  assert.match(included.criteria[0].text, /adults with asthma/i);
  const resolved = (await select(issue.options[1])).project;
  assert.equal(resolved.criteria[0].disposition, 'exclude');
  assert(resolved.criteria[0].text.toLowerCase().includes(intended));
  assert.equal(D.sourceAt(resolved,resolved.decisions.at(-1).source_ref).source_type,'human_answer');
  assert.equal(resolved.issues.find(i=>i.issue_id===issue.issue_id).status, 'resolved');
  const chosen = resolved.elements.find(e=>e.element_id===element_id);
  assert(!chosen.source_occurrence_pending);
  assert.deepEqual(chosen.source_refs.filter(r=>r.source_id===source.source_id).map(r=>r.quote), [alternatives[1].quote]);
  // An older draft may have stored the full compound sentence in both options.
  // Applying either must still bind the evidence to that occurrence's instruction.
  const compound = 'Include adults during admission, but exclude adults during follow-up.';
  const input = E.save_input(E.create_project('compound-passage'), {
    research_question: compound, question_framework: 'PICO', output_language: 'en',
  }).state;
  const question = input.questions[0], originalSource = D.sourceAt(input, question.source_refs[0]);
  const passages = [compound.indexOf('adults'), compound.lastIndexOf('adults')].map(start => ({
    ...E.ref(originalSource), match_start:start, match_end:start+6, match_quote:'adults', reference_index:0,
  }));
  const draft = E.ingest_candidates(input, {questions:[{
    question_id:question.question_id, framework_candidates:[], issues:[], logic:null,
    elements:[{...candidate, source_refs:passages.map(p=>({...E.ref(originalSource,'adults'),start:p.match_start,end:p.match_end})),source_occurrence_alternatives:passages}],
  }]}).state;
  const check = draft.issues.find(i=>i.trigger_rule_id==='source_occurrence');
  const option = check.options[1];
  assert.equal(option.label, 'exclude «adults» during follow-up.');
  const updated = E.apply_decisions(draft, {base_revision:draft.revision,request_id:'choose-follow-up',answers:[{
    issue_ids:[check.issue_id],option_id:option.option_id,answer_text:option.label,from_model:true,action:'confirm',
    updates:[{element_id:check.element_ids[0],semantic_role:'eligibility_condition',scope_status:'restricted',disposition:'exclude',normalized_text:'adults during follow-up'}],
  }]}).state;
  assert.deepEqual(updated.criteria.map(c=>c.disposition), ['exclude']);
  const refs=updated.elements.find(e=>e.element_id===check.element_ids[0]).source_refs;
  assert.deepEqual(refs.filter(r=>r.source_id===originalSource.source_id).map(r=>r.quote), ['exclude adults during follow-up.']);
  // A passage can define scope without stating whether to include, exclude or report it.
  const neutralText = 'Group: adults during admission. Group: adults during follow-up.';
  const neutralInput = E.save_input(E.create_project('neutral-passages'), {
    research_question:neutralText, question_framework:'PICO', output_language:'en',
  }).state;
  const neutralQ = neutralInput.questions[0], neutralSource = D.sourceAt(neutralInput,neutralQ.source_refs[0]);
  const neutralPassages = ['Group: adults during admission.', 'Group: adults during follow-up.'].map(sentence => {
    const ref = E.ref(neutralSource,sentence), start = ref.start + sentence.indexOf('adults');
    return {...ref,match_quote:'adults',match_start:start,match_end:start+6,reference_index:0};
  });
  const neutral = E.ingest_candidates(neutralInput,{questions:[{
    question_id:neutralQ.question_id, framework_candidates:[], issues:[], logic:null, elements:[{
      ...candidate,source_refs:neutralPassages.map(p=>({...E.ref(neutralSource,'adults'),start:p.match_start,end:p.match_end})),
      source_occurrence_alternatives:neutralPassages,
    }],
  }]}).state;
  const neutralService = await B.create({projectId:'neutral-passages',storage:{getItem:key=>key===neutralService.keys.project?JSON.stringify(neutral):null},
    baseURL:'http://localhost/',frameworkConfig:require('../../config/eligibility-frameworks.json'),profileConfig:require('../../config/eligibility-review-profiles.json')});
  const visible = B.projectToClassic(neutral).sourceConfirmations.find(c=>c.issue_id===neutral.issues.find(i=>i.trigger_rule_id==='source_occurrence').issue_id);
  assert.equal(visible.options.length,6);
  for(const [index,passage] of neutralPassages.entries()){
    const options = visible.options.filter(o=>o.label.includes(index?'during follow-up':'during admission'));
    assert.deepEqual(options.map(o=>o.label.split(' — ')[0]),['Include','Exclude','Review focus']);
    for(const [role,option] of ['include','exclude','focus'].map((role,i)=>[role,options[i]])){
      const applied = (await neutralService.decide({issue_id:visible.issue_id,option_id:option.option_id,modelClient})).project;
      const target = applied.elements.find(e=>e.dimension_id==='population'&&e.active!==false);
      assert.equal(applied.issues.find(i=>i.issue_id===visible.issue_id).status,'resolved');
      assert.equal(target.semantic_role,role==='focus'?'review_focus':'eligibility_condition');
      assert.equal(target.disposition,role==='focus'?null:role);
      assert(!applied.issues.some(i=>i.status==='open'&&i.element_ids.includes(target.element_id)&&['source_occurrence','source_scope_role','semantic_role'].includes(i.trigger_rule_id)),
        'Choosing a passage and role resolves both choices in one click.');
      assert.deepEqual(target.source_refs.filter(r=>r.source_id===neutralSource.source_id).map(r=>r.quote),[passage.quote]);
      assert.equal(applied.decisions.at(-1).answer_text,option.label);
    }
  }
  const chinese='😀纳入入院时的成人，但排除随访期的成人；以末次访视为准。';
  const start=Array.from(chinese.slice(0,chinese.lastIndexOf('成人'))).length;
  const clause=D.occurrenceClause({source_id:'source',source_revision:1,quote:chinese,start:0,end:Array.from(chinese).length,match_start:start,match_end:start+2});
  assert.equal(clause.quote,'排除随访期的成人；以末次访视为准。');
  assert.equal(Array.from(chinese).slice(clause.start,clause.end).join(''),clause.quote);
  console.log('PASS: selected passage binds the clarified criterion, direction, exception and exact evidence.');
})().catch(error=>{console.error(error);process.exitCode=1});
