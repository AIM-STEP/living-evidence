const assert = require('node:assert/strict');
const engine = require('../../app/eligibility/engine.js');
const model = require('../../app/eligibility/model.js');
const domain = require('../../app/eligibility/domain.js');

const rejection = 'The wording reverses the supervision requirement.';

function scenario(mode) {
  const ambiguous = mode === 'ambiguous';
  const exercise = ambiguous ? 'exercise where appropriate' : 'supervised exercise';
  const state = engine.save_input(engine.create_project('semantic-repair'), {
    research_question: 'Include adults receiving ' + exercise + ' or education.',
    question_framework: 'PICO', output_language: 'en'
  }).state;
  const source = state.sources.find(item => item.input_kind === 'research_question');
  function element(id, dimension, quote, wording = quote) {
    return {
      candidate_id: id, dimension_id: dimension, normalized_text: wording, structured_value: null,
      source_refs: [engine.ref(source, quote)], information_status: 'explicit',
      semantic_role: 'eligibility_condition', scope_status: 'restricted', disposition: 'include'
    };
  }
  const leaf = id => ({op: 'predicate', element_id: id});
  const question = {
    question_id: state.questions[0].question_id, review_topic: 'Exercise or education in adults',
    framework_candidates: [{framework_id: 'pico', basis: 'Test fixture'}], issues: [],
    elements: [element('p', 'population', 'adults'), element('i1', 'intervention', exercise),
      element('i2', 'intervention', 'education')],
    logic: {op: 'all_of', children: [leaf('p'), {op: 'any_of', children: [leaf('i1'), leaf('i2')]}]}
  };

  // Make failure meaningful: regeneration must preserve a previously accepted draft.
  const previous = structuredClone(question);
  for (const item of previous.elements) item.semantic_review = {status: 'supported', reason: 'Prior review.'};
  const project = engine.ingest_candidates(state, {questions: [previous]}).state;
  if (!ambiguous && mode !== 'supported') question.elements[1].normalized_text = 'unsupervised exercise';
  const steps = [];
  let affectedId;

  const adapter = {async request(step, ignored, payload, schema, instruction) {
    steps.push(step);
    if (step === 'extract_elements' || step === 'review_normalization') {
      assert.doesNotMatch(instruction, /malnutrition|nutritional (?:risk|interventions)|hospitali[sz]ation|air pollution/i,
        'An unrelated question must not receive clinical facts or a title from an example case.');
    }
    if (step === 'extract_elements') return {questions: [structuredClone(question)]};
    if (step === 'route_author_checks') {
      assert.equal(mode, 'field');
      assert.equal(payload.items.length, 1);
      assert(payload.items[0].available_fields.includes('intervention'));
      return {items: [{id: affectedId, dimension_id: 'intervention', section: 'include'}]};
    }
    assert.equal(step, 'review_normalization');
    assert.equal(payload.review_policy, 'jev-once-v1');
    assert.equal(payload.items.length, 3);
    affectedId = payload.items.find(item => item.normalized_text.includes('exercise')).id;
    if (mode === 'outage') throw Object.assign(new Error('Synthetic gateway outage'), {code: 'MODEL_UPSTREAM_ERROR'});
    return {items: payload.items.map(item => {
      const assessment = {id: item.id, status: 'supported', reason: 'Directly supported.',
        issue_type: 'none', information_status: 'explicit', semantic_role: item.semantic_role,
        scope_status: item.scope_status, disposition: item.disposition};
      if (item.id !== affectedId || mode === 'supported') return assessment;
      return {...assessment, status: mode === 'contradicted' ? 'contradicted' : 'uncertain',
        issue_type: ambiguous ? 'ambiguous_source' : 'unsupported_rewrite', reason: rejection,
        reviewer:{provider:'typesafe',verdict:mode === 'field' ? 'wrong_field' : 'wording_or_scope'}};
    })};
  }};
  if (mode === 'field') question.elements[1].dimension_id='study_design';
  return {project, steps, adapter, exercise};
}
async function check(mode){
  const run=scenario(mode), before=structuredClone(run.project);
  const {candidates}=await model.analyze(run.project,engine.environment(),run.adapter,{retries:0});
  const project=engine.ingest_candidates(run.project,candidates).state;
  const checks=project.issues.filter(i=>i.status==='open'&&i.trigger_rule_id==='independent_source_check');
  const expected=['extract_elements','review_normalization'];
  if(mode==='field')expected.push('route_author_checks');
  assert.deepEqual(run.steps,expected);
  assert.deepEqual(run.project,before);
  if(mode==='supported'){assert.equal(checks.length,0);assert.equal(project.criteria.length,3);return;}
  assert.equal(checks.length,mode==='outage'?3:1);
  assert.equal(project.criteria.length,mode==='outage'?0:2);
  if(mode==='outage')assert(checks.every(i=>i.question_text.includes('unavailable')));
  const issue=checks.find(i=>project.elements.some(e=>i.element_ids.includes(e.element_id)&&e.dimension_id==='intervention'&&e.normalized_text.includes('exercise')));
  assert(issue?.blocking);
  const proposal=project.elements.find(e=>issue.element_ids.includes(e.element_id));
  assert.equal(proposal.decision_status,'pending');
  assert.equal(proposal.review_pending.routed_by,mode==='field'?'local':undefined);
  assert(!project.criteria.some(c=>c.source_element_ids.includes(proposal.element_id)));
  function answer(text,option_id){
    return engine.apply_decisions(project,{base_revision:project.revision,request_id:'author-'+mode,
     answers:[{issue_id:issue.issue_id,answer_text:text,author_confirmed:true,option_id}]}).state;
  }
  const confirmed=answer('Include supervised exercise');
  const amended=confirmed.elements.find(e=>e.element_id===proposal.element_id);
  assert.equal(amended.decision_status,'confirmed_by_user');
  assert.equal(amended.normalized_text,'supervised exercise');
  assert.equal(amended.review_pending,undefined);
  assert(confirmed.criteria.some(c=>c.text==='supervised exercise'));
  assert(!confirmed.issues.some(i=>i.issue_id===issue.issue_id&&i.status==='open'));
  if(mode!=='outage')assert(domain.treeHas(confirmed.logic.questions[proposal.question_id].include,'any_of'));
  const omitted=answer('Omit this item','omit');
  assert(!omitted.criteria.some(c=>c.source_element_ids.includes(proposal.element_id)));
  assert(!omitted.validation.errors.length);
  assert.deepEqual(run.steps,expected,'the author decision took no further model calls');
}
(async()=>{
  for(const mode of ['supported','contradicted','ambiguous','field','outage'])await check(mode);
  console.log('PASS single-pass independent source checks, scoped author routing, direct correction and omission.');
})().catch(error=>{console.error(error);process.exitCode=1;});
