const assert = require('node:assert/strict');
const engine = require('../../app/eligibility/engine.js');
const model = require('../../app/eligibility/model.js');
const domain = require('../../app/eligibility/domain.js');
const background = require('../../app/eligibility/background.js');

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
  if (['contradicted','field'].includes(mode)) question.elements[1].normalized_text = 'unsupervised exercise';
  const steps = [];
  let affectedAttempts=0;

  const adapter = {async request(step, ignored, payload, schema, instruction) {
    steps.push(step);
    if (step === 'extract_elements' || step === 'review_normalization') {
      assert.doesNotMatch(instruction, /malnutrition|nutritional (?:risk|interventions)|hospitali[sz]ation|air pollution/i,
        'An unrelated question must not receive clinical facts or a title from an example case.');
    }
    if (step === 'extract_elements') return {questions: [structuredClone(question)]};
    assert.equal(step, 'review_normalization');
    assert.equal(payload.review_policy, 'jev-once-v1');
    assert.equal(payload.items.length, 1);
    const affected=payload.items[0].id.endsWith('_i1');
    if(affected)affectedAttempts++;
    if (mode === 'outage') throw Object.assign(new Error('Synthetic gateway outage'), {code: 'MODEL_UPSTREAM_ERROR'});
    return {items: payload.items.map(item => {
      const assessment = {id: item.id, status: 'supported', reason: 'Directly supported.',
        issue_type: 'none', information_status: 'explicit', semantic_role: item.semantic_role,
        scope_status: item.scope_status, disposition: item.disposition};
      if (!affected || mode === 'supported') return assessment;
      if (mode === 'recover') return affectedAttempts===1?
        {...assessment,status:'uncertain',issue_type:'ambiguous_source',reviewer:{provider:'typesafe',verdict:'unavailable'}}:assessment;
      return {...assessment, status: mode === 'contradicted' ? 'contradicted' : 'uncertain',
        issue_type: ambiguous ? 'ambiguous_source' : 'unsupported_rewrite', reason: rejection,
        reviewer:{provider:'typesafe',verdict:mode === 'field'?'wrong_field':ambiguous?'ambiguous':'wording_or_scope'}};
    })};
  }};
  if (mode === 'field') question.elements[1].dimension_id='comparator';
  return {project, steps, adapter, exercise};
}
async function check(mode){
  const run=scenario(mode), before=structuredClone(run.project);
  const {candidates,incomplete_review}=await model.analyze(run.project,engine.environment(),run.adapter,{retries:0});
  const project=engine.ingest_candidates(run.project,candidates).state;
  const checks=project.issues.filter(i=>i.status==='open'&&i.trigger_rule_id==='independent_source_check');
  const count=mode==='outage'?6:mode==='recover'?4:3;
  const expected=['extract_elements',...Array(count).fill('review_normalization')];
  assert.deepEqual(run.steps,expected);
  assert.deepEqual(run.project,before);
  assert.equal(incomplete_review,mode==='outage');
  if(mode==='outage'){assert.equal(project.criteria.length,0);return;}
  if(['supported','recover'].includes(mode)){assert.equal(checks.length,0);assert.equal(project.criteria.length,3);return;}
  if(['contradicted','field'].includes(mode)){
    assert(project.criteria.some(rule=>rule.text==='adults'));
    assert(!project.criteria.some(rule=>rule.text==='unsupervised exercise'));
    assert(!candidates.questions[0].elements.some(e=>e.normalized_text==='unsupervised exercise'));
    assert(!project.criteria.some(rule=>rule.text==='education'),'A linked OR rule should not be narrowed automatically.');
    return;
  }
  assert.equal(checks.length,1);
  assert.equal(project.criteria.length,2);
  const issue=checks.find(i=>project.elements.some(e=>i.element_ids.includes(e.element_id)&&e.dimension_id==='intervention'&&e.normalized_text.includes('exercise')));
  assert(issue?.blocking);
  const prompt=background.projectToClassic(project).sourceConfirmations.find(detail=>detail.issue_id===issue.issue_id);
  assert(prompt.text.includes('Intervention')&&prompt.text.includes('exercise')&&prompt.text.includes('inclusion criterion'));
  assert(prompt.evidence.some(ref=>ref.quote.includes('exercise')));
  const proposal=project.elements.find(e=>issue.element_ids.includes(e.element_id));
  assert.equal(proposal.decision_status,'pending');
  assert(proposal.review_pending);
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
  assert(domain.treeHas(confirmed.logic.questions[proposal.question_id].include,'any_of'));
  const omitted=answer('Omit this item','omit');
  assert(!omitted.criteria.some(c=>c.source_element_ids.includes(proposal.element_id)));
  assert(!omitted.validation.errors.length);
  assert.deepEqual(run.steps,expected,'the author decision took no further model calls');
}
async function checkThreshold(){
  const question='Population: adults with asthma.\nIntervention: supervised exercise.';
  const state=engine.save_input(engine.create_project('decision-threshold'),{
    research_question:question,question_framework:'PICO',output_language:'en'
  }).state;
  const source=state.sources.find(s=>s.input_kind==='research_question');
  const element=(dimension_id,wording,information_status='explicit')=>({
    candidate_id:dimension_id,dimension_id,normalized_text:wording,source_refs:[engine.ref(source,wording)],
    information_status,semantic_role:'eligibility_condition',disposition:'include',scope_status:'restricted',structured_value:null
  });
  const input={question_id:state.questions[0].question_id,review_topic:'Exercise in adults with asthma',framework_candidates:['pico'],
    logic:null,issues:[{reason_code:'AMBIGUOUS_MEANING',question_text:'Should this intervention be included?',element_candidate_ids:['intervention']}],
    elements:[element('population','adults with asthma'),element('intervention','supervised exercise','ambiguous')]};
  const steps=[];
  const adapter={async request(step,project,payload){
    steps.push(step);
    if(step==='extract_elements')return {questions:[structuredClone(input)]};
    assert.equal(step,'review_normalization');
    assert.equal(payload.items.length,1);
    return {items:payload.items.map(item=>({...item,...(item.dimension_id==='intervention'?
      {status:'uncertain',issue_type:'ambiguous_source',reason:'Weak objection.',
       reviewer:{provider:'typesafe',verdict:'low_confidence',original_verdict:'supported',confidence:.75,choice_probability:.68}}:
      {status:'supported',issue_type:'none',reason:'Agrees with source.'})}))};
  }};
  const {candidates}=await model.analyze(state,engine.environment(),adapter,{retries:0});
  const project=engine.ingest_candidates(state,candidates).state;
  assert.deepEqual(steps,['extract_elements','review_normalization','review_normalization']);
  assert.equal(project.status,'final');
  assert.equal(project.elements.find(e=>e.dimension_id==='intervention').semantic_review.reviewer.corroboration,'exact_source_field');
  assert.deepEqual(background.projectToClassic(project).sourceConfirmations,[]);

  const intervention=project.elements.find(e=>e.dimension_id==='intervention');
  const legacy=structuredClone(project);
  const saved=legacy.elements.find(e=>e.element_id===intervention.element_id);
  saved.information_status='ambiguous';saved.decision_status='pending';saved.initial_information_status='explicit';
  saved.review_pending={original_dimension:'intervention',original_disposition:'include',original_role:'eligibility_condition'};
  saved.semantic_review={status:'uncertain',issue_type:'ambiguous_source',
    reviewer:{provider:'typesafe',verdict:'low_confidence',original_verdict:'supported',confidence:.90,choice_probability:.89}};
  assert.equal(model.applySavedReviewThreshold(legacy),true);
  assert.equal(saved.decision_status,'accepted_from_input');
  assert.equal(model.applySavedReviewThreshold(legacy),false);
}
(async()=>{
  for(const mode of ['supported','contradicted','ambiguous','field','recover','outage'])await check(mode);
  await checkThreshold();
  console.log('PASS single-candidate review, rejection, retry, and author handling of true ambiguity.');
})().catch(error=>{console.error(error);process.exitCode=1;});
