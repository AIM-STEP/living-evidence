const assert = require('node:assert/strict');
const test = require('node:test');
const E = require('../../app/eligibility/engine.js');
const M = require('../../app/eligibility/model.js');

const env = E.environment();
const terms = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(counts) {
  const questions = counts.map((n, i) => ({
    research_question: terms.slice(0, n).map(term => 'group ' + String.fromCharCode(65 + i) + ' ' + term).join(', ') + '.',
    question_framework: 'PICO',
  }));
  return E.save_input(E.create_project('model-pipeline'), { questions, output_language: 'en' }).state;
}

function model(before = async () => {}) {
  const calls = [];
  let active = 0, peak = 0;
  return { calls, get peak() { return peak; }, async request(step, state, payload, schema, instruction, signal) {
    calls.push({ step, payload });
    peak = Math.max(peak, ++active);
    try {
      await before(step, payload, signal);
      if (step === 'review_normalization') {
        return { items: payload.items.map(i => ({
          id: i.id, status: 'supported', reason: 'Direct quotation.', issue_type: 'none',
          information_status: i.information_status, semantic_role: i.semantic_role,
          scope_status: i.scope_status, disposition: i.disposition,
        })) };
      }
      assert.equal(step, 'extract_elements');
      const q = payload.question, source = q.sources[0];
      const elements = source.original_text.slice(0, -1).split(', ').map((quote, i) => ({
        candidate_id: 'c' + i, dimension_id: 'population', normalized_text: quote, structured_value: null,
        semantic_role: 'eligibility_condition', information_status: 'explicit', scope_status: 'restricted', disposition: 'include',
        source_refs: [E.ref(source, quote)],
      }));
      return { questions: [{ question_id: q.question_id, framework_candidates: [], elements, issues: [], logic: null }] };
    } finally { active--; }
  }};
}

const reviews = adapter => adapter.calls.filter(c => c.step === 'review_normalization').map(c => c.payload);

test('a sealed batch overlaps the last extraction with unchanged requests, results and monotonic progress', async () => {
  const state = fixture([7, 2]), progress = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const adapter = model((step, payload) => {
    if (step === 'extract_elements' && payload.question.question_id === state.questions[1].question_id) return gate;
  });
  const run = M.analyze(state, env, adapter, { onProgress: (_, event) => progress.push(event) });
  try {
    await tick();
    assert.deepEqual(reviews(adapter).map(p => p.items.length), [7]);
    assert.deepEqual(reviews(adapter)[0].questions.map(q => q.question_id), [state.questions[0].question_id]);
    assert(progress.every(p => p.phase === 'extract'));
  } finally { release(); }
  const result = await run;
  const reference = model();
  const baseline = await M.extract_elements(state, env, reference);
  await M.review_elements(state, baseline, reference);
  assert.deepEqual(reviews(adapter), reviews(reference));
  assert.deepEqual(result.candidates, baseline);
  assert.equal(adapter.peak, 2);
  const reviewStart = progress.findIndex(p => p.phase === 'review');
  assert(reviewStart > 0 && progress.slice(reviewStart).every(p => p.phase === 'review'));
  assert.deepEqual(progress.at(-1), { phase: 'review', completed: 2, total: 2, waiting: false });
});

test('a partial earlier batch stays open and question order survives out-of-order extraction', async () => {
  const state = fixture([3, 2]);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const adapter = model((step, payload) => {
    if (step === 'extract_elements' && payload.question.question_id === state.questions[0].question_id) return gate;
  });
  const run = M.analyze(state, env, adapter);
  try {
    await tick();
    assert.equal(reviews(adapter).length, 0);
  } finally { release(); }
  const result = await run;
  assert.deepEqual(result.candidates.questions.map(q => q.question_id), state.questions.map(q => q.question_id));
  assert.deepEqual(reviews(adapter).map(p => p.items.length), [5]);
  assert.deepEqual(reviews(adapter)[0].items.map(i => i.question_id), [
    ...Array(3).fill(state.questions[0].question_id), ...Array(2).fill(state.questions[1].question_id),
  ]);
});

test('early review failure cancels the in-flight extraction and discards queued checks', async () => {
  const state = fixture([8, 7]), error = new Error('Independent review failed');
  let cancelled = false;
  const adapter = model((step, payload, signal) => {
    if (step === 'review_normalization') throw error;
    if (payload.question.question_id === state.questions[1].question_id) return new Promise((_, reject) => {
      signal.addEventListener('abort', () => { cancelled = true; reject(signal.reason); }, { once: true });
    });
  });
  await assert.rejects(M.analyze(state, env, adapter), reason => reason === error);
  assert(cancelled);
  assert.equal(reviews(adapter).length, 1);
  assert.equal(state.elements.length, 0);
});

test('clearing before a scheduled request starts prevents dispatch', async () => {
  const state = fixture([7, 2]), controller = new AbortController(), adapter = model();
  const run = M.analyze(state, env, adapter, { signal: controller.signal });
  controller.abort();
  await assert.rejects(run, { name: 'AbortError' });
  assert.equal(adapter.calls.length, 0);
});
