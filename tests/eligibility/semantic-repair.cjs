const assert = require('node:assert/strict');
const engine = require('../../app/eligibility/engine.js');
const model = require('../../app/eligibility/model.js');
const domain = require('../../app/eligibility/domain.js');

const rejection = 'The wording reverses the supervision requirement.';
const repeatedRejection = 'The activity still differs from the original requirement.';

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
  if (!ambiguous) question.elements[1].normalized_text = 'unsupervised exercise';
  const steps = [];
  let affectedId, reviewPass = 0;

  const adapter = {async request(step, ignored, payload) {
    steps.push(step);
    if (step === 'extract_elements') return {questions: [structuredClone(question)]};
    if (step === 'repair_candidate_wording') {
      assert.deepEqual(payload.items.map(item => item.id), [affectedId]);
      return {items: [{id: affectedId, normalized_text: exercise, structured_value: null}]};
    }
    assert.equal(step, 'review_normalization');
    reviewPass++;
    if (reviewPass === 1) {
      assert.equal(payload.items.length, 3);
      affectedId = payload.items.find(item => item.normalized_text.includes('exercise')).id;
    } else {
      assert.deepEqual(payload.items.map(item => item.id), [affectedId]);
      assert.equal(payload.items[0].normalized_text, exercise);
    }
    return {items: payload.items.map(item => {
      const assessment = {id: item.id, status: 'supported', reason: 'Directly supported.',
        issue_type: 'none', information_status: 'explicit', semantic_role: item.semantic_role,
        scope_status: item.scope_status, disposition: item.disposition};
      if (item.id !== affectedId) return assessment;
      if (ambiguous) return {...assessment, status: 'uncertain', issue_type: 'ambiguous_source', reason: 'The source leaves appropriate undefined.'};
      if (reviewPass === 1) return {...assessment, status: mode === 'uncertain' ? 'uncertain' : 'contradicted',
        issue_type: mode === 'uncertain' ? 'none' : 'unsupported_rewrite', reason: rejection};
      if (mode === 'rejectAgain') return {...assessment, status: 'contradicted', issue_type: 'unsupported_rewrite', reason: repeatedRejection};
      return assessment;
    })};
  }};
  return {project, steps, adapter, exercise, get affectedId() { return affectedId; }};
}

async function check(mode) {
  const run = scenario(mode), before = structuredClone(run.project);
  const options = mode === 'noRetry' ? {retries: 0} : {};
  const analysis = model.analyze(run.project, engine.environment(), run.adapter, options);
  if (mode === 'rejectAgain' || mode === 'noRetry') {
    await assert.rejects(analysis, error => {
      assert.equal(error.code, 'SEMANTIC_REVIEW_FAILED');
      assert.equal(error.details.dimension_id, 'intervention');
      assert.equal(error.details.reason, mode === 'noRetry' ? rejection : repeatedRejection);
      return true;
    });
  } else {
    const result = await analysis;
    const question = result.candidates.questions[0];
    assert.deepEqual(question.logic.children[1].children.map(node => node.element_id), question.elements.slice(1).map(item => item.candidate_id));
    assert.equal(question.question_id + '/' + question.elements[1].candidate_id, run.affectedId);
    assert.deepEqual(question.elements.map(item => item.normalized_text), ['adults', run.exercise, 'education']);
    const updated = engine.ingest_candidates(run.project, result.candidates).state;
    if (mode === 'ambiguous') {
      assert(updated.issues.some(item => item.blocking && item.status === 'open'));
      assert(!updated.criteria.some(item => item.text === run.exercise));
    } else {
      assert.equal(updated.criteria.length, 3);
      assert(updated.criteria.some(item => item.text === run.exercise));
      assert(!updated.issues.some(item => item.status === 'open' && item.blocking));
      assert(domain.treeHas(updated.logic.questions[question.question_id].include, 'any_of'));
    }
  }
  assert.deepEqual(run.steps, ['ambiguous', 'noRetry'].includes(mode) ? ['extract_elements', 'review_normalization'] :
    ['extract_elements', 'review_normalization', 'repair_candidate_wording', 'review_normalization']);
  assert.deepEqual(run.project, before);
}

(async () => {
  for (const mode of ['uncertain', 'contradicted', 'rejectAgain', 'ambiguous', 'noRetry']) await check(mode);
  console.log('PASS: localized wording repair, independent re-review, stable alternatives and IDs, genuine ambiguity and transactional failure');
})().catch(error => {console.error(error); process.exitCode = 1;});
