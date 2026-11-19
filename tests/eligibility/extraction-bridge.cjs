const assert = require('node:assert/strict');
const test = require('node:test');
const B = require('../../app/eligibility/background.js');
const M = require('../../app/eligibility/model.js');
const frameworkConfig = require('../../config/eligibility-frameworks.json');
const profileConfig = require('../../config/eligibility-review-profiles.json');

async function generate(question, reviewType, request) {
  const service = await B.create({
    projectId: 'extraction-bridge', storage: {getItem: () => null},
    frameworkConfig, profileConfig, baseURL: 'http://localhost/'
  });
  return service.generate({question, reviewType, legacy: {}, modelClient: {request}});
}

function extraction(question, source, quote, offsets = {}) {
  return {questions: [{
    question_id: question.question_id, framework_candidates: [], issues: [],
    elements: [{
      candidate_id: 'population', dimension_id: 'population', normalized_text: quote,
      structured_value: null, information_status: 'explicit', semantic_role: 'eligibility_condition',
      scope_status: 'restricted', disposition: 'include',
      source_refs: [{source_id: source.source_id, source_revision: source.revision, quote, ...offsets}]
    }],
    logic: {op: 'predicate', element_id: 'population'}
  }]};
}

function supported(items) {
  return {items: items.map(({id, information_status, semantic_role, scope_status, disposition}) => ({
    id, information_status, semantic_role, scope_status, disposition,
    status: 'supported', reason: 'The source explicitly identifies this population.', issue_type: 'none'
  }))};
}

test('a citation from a different question fails both extraction attempts before semantic review', async () => {
  const feedback = [];
  let reviews = 0;
  const question = 'Q1: Include teachers.\nQ2: Include farmers.';
  async function request(step, state, payload) {
    if (step === 'review_normalization') {
      reviews++;
      return supported(payload.items);
    }
    assert.equal(step, 'extract_elements');
    const source = payload.question.sources.find(s => s.input_kind === 'research_question');
    if (source.original_text.includes('teachers')) {
      const foreign = state.sources.find(s => s.input_kind === 'research_question' && s.original_text.includes('farmers'));
      assert.ok(foreign);
      assert(!payload.question.sources.some(s => s.source_id === foreign.source_id));
      feedback.push(payload.validation_feedback?.code);
      return extraction(payload.question, foreign, 'farmers');
    }
    return extraction(payload.question, source, 'farmers');
  }
  await assert.rejects(generate(question, 'Systematic Review', request), error => error.code === 'QUOTE_NOT_FOUND');
  assert.deepEqual(feedback, [undefined, 'QUOTE_NOT_FOUND']);
  assert.equal(reviews, 0);
});

test('unique quoted text recovers exact Unicode code-point offsets without another model call', async () => {
  const question = '📌 Include adults.', quote = 'adults';
  const utf16Start = question.indexOf(quote);
  const start = Array.from(question.slice(0, utf16Start)).length;
  assert.notEqual(utf16Start, start);
  const calls = [];
  const stage = await generate(question, 'Systematic Review', async (step, state, payload) => {
    calls.push(step);
    if (step === 'review_normalization') return supported(payload.items);
    const source = payload.question.sources.find(s => s.input_kind === 'research_question');
    return extraction(payload.question, source, quote, {start: utf16Start, end: utf16Start + quote.length});
  });
  assert.deepEqual(calls, ['extract_elements', 'review_normalization']);
  const ref = stage.project.elements.find(e => e.normalized_text === quote).source_refs[0];
  assert.deepEqual([ref.quote, ref.start, ref.end], [quote, start, start + quote.length]);
});

test('the selected review method reaches the extraction request for all seven UI options', async () => {
  const methods = {
    'Systematic Review': 'systematic_review', 'Scoping Review': 'scoping_review', 'Rapid Review': 'rapid_review',
    'Umbrella Review': 'umbrella_review', 'Narrative Literature Review': 'narrative_literature_review',
    'Integrative Review': 'integrative_review', 'Other Review': 'other_review'
  };
  for (const [label, method] of Object.entries(methods)) {
    const observed = [];
    await generate('Include adults.', label, async (step, state, payload) => {
      if (step === 'review_normalization') return supported(payload.items);
      assert.equal(step, 'extract_elements');
      observed.push(payload.question.context.review_methods);
      const source = payload.question.sources.find(s => s.input_kind === 'research_question');
      return extraction(payload.question, source, 'adults');
    });
    assert.deepEqual(observed, [[method]], label);
  }
});

test('model HTTP errors preserve their safe category and the stage that failed', () => {
  for (const [status, supplied, expected] of [
    [422, 'MODEL_REVIEW_INCOMPLETE', 'MODEL_REVIEW_INCOMPLETE'],
    [422, 'MODEL_SCHEMA_ERROR', 'MODEL_SCHEMA_ERROR'],
    [503, undefined, 'MODEL_UNAVAILABLE'], [504, undefined, 'MODEL_TIMEOUT']
  ]) {
    const error = M.httpError(status, {code: supplied, error: 'private upstream text'}, 'review_normalization');
    assert.equal(error.code, expected);
    assert.equal(error.status, status);
    assert.equal(error.step, 'review_normalization');
    assert.match(error.message, /Independent source review/);
    assert(error.message.includes('HTTP ' + status));
    assert(!error.message.includes('private upstream text'));
  }
});
