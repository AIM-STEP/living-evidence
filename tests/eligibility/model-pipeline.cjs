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

test('fresh extraction uses the current input order and omits previous model guesses and storage keys', async () => {
  const input = { research_question: 'Earlier population.', additional_requirements: ['Extra source.'], question_framework: 'PICO', output_language: 'en' };
  const initial = E.save_input(E.create_project('stable-source-order'), input).state;
  initial.questions[0].context.review_method_candidates = ['systematic_review'];
  initial.questions[0].context.evidence_unit_candidates = ['study'];
  const state = E.save_input(initial, { ...input, research_question: 'Current population.' }).state;
  const adapter = model();
  await M.extract_elements(state, env, adapter);
  const question = adapter.calls[0].payload.question;
  assert.deepEqual(question.sources.map(s => s.original_text), ['Current population.', 'Extra source.']);
  assert(question.sources.every(s => !Object.hasOwn(s, 'created_at') && !Object.hasOwn(s, 'identity')));
  assert(!Object.hasOwn(question.context, 'review_method_candidates'));
  assert(!Object.hasOwn(question.context, 'evidence_unit_candidates'));
  assert.equal(question.context.framework_requested, 'PICO');
  assert.deepEqual(state.questions[0].context.evidence_unit_candidates, ['study']);
});

test('permuted model records and equivalent same-slot predicates use source order for review and display', async () => {
  const state = fixture([3]), adapter = model();
  const original = adapter.request.bind(adapter);
  adapter.request = async (...args) => {
    const answer = await original(...args);
    if(args[0] === 'extract_elements'){
      const q = answer.questions[0];
      q.elements.reverse();
      q.logic = { op: 'any_of', children: q.elements.map(e => ({ op: 'predicate', element_id: e.candidate_id })) };
    }
    return answer;
  };
  const result = await M.analyze(state, env, adapter);
  const question = result.candidates.questions[0];
  const expected = ['group A alpha', 'group A bravo', 'group A charlie'];
  assert.deepEqual(question.elements.map(e => e.normalized_text), expected);
  assert.deepEqual(reviews(adapter).flatMap(review => review.items.map(e => e.normalized_text)), expected);
  assert.equal(question.logic.op, 'any_of');
  assert.deepEqual(question.logic.children.map(n => n.element_id), question.elements.map(e => e.candidate_id));
});

test('each ready item overlaps the last extraction with unchanged results and monotonic progress', async () => {
  const state = fixture([7, 2]), progress = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const adapter = model((step, payload) => {
    if (step === 'extract_elements' && payload.question.question_id === state.questions[1].question_id) return gate;
  });
  const run = M.analyze(state, env, adapter, { onProgress: (_, event) => progress.push(event) });
  try {
    await tick();
    assert.deepEqual(reviews(adapter).map(p => p.items.length), Array(7).fill(1));
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
  assert.deepEqual(progress.at(-1), { phase: 'review', completed: 9, total: 9, waiting: false });
});

test('an out-of-order ready question is reviewed immediately while output keeps source order', async () => {
  const state = fixture([3, 2]);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const adapter = model((step, payload) => {
    if (step === 'extract_elements' && payload.question.question_id === state.questions[0].question_id) return gate;
  });
  const run = M.analyze(state, env, adapter);
  try {
    await tick();
    assert.deepEqual(reviews(adapter).map(p=>p.items[0].question_id),Array(2).fill(state.questions[1].question_id));
  } finally { release(); }
  const result = await run;
  assert.deepEqual(result.candidates.questions.map(q => q.question_id), state.questions.map(q => q.question_id));
  assert.deepEqual(reviews(adapter).map(p=>p.items.length),Array(5).fill(1));
  assert.deepEqual(reviews(adapter).flatMap(p=>p.items.map(i=>i.question_id)),[
    ...Array(2).fill(state.questions[1].question_id), ...Array(3).fill(state.questions[0].question_id),
  ]);
});

test('a completed source part can be checked before the rest of the same question is extracted', async () => {
  const state=E.save_input(E.create_project('split-source'),{
    research_question:'Adults receiving care.',
    additional_requirements:['This is background material. '.repeat(260)],
    question_framework:'PICO',output_language:'en',
  }).state;
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const calls=[];
  const adapter={async request(step,project,payload){
    calls.push({step,payload});
    if(step==='review_normalization'){
      assert.equal(payload.items.length,1);
      return {items:payload.items.map(item=>({...item,status:'supported',issue_type:'none',reason:'Source confirmed.'}))};
    }
    assert.equal(step,'extract_elements');
    assert(payload.part_count>1);
    if(payload.part_index!==0)await gate;
    const {question:q}=payload,source=q.sources.find(item=>item.input_kind==='research_question');
    const elements=source?[{candidate_id:'adult',dimension_id:'population',normalized_text:'Adults receiving care',
      structured_value:null,semantic_role:'eligibility_condition',information_status:'explicit',scope_status:'restricted',
      disposition:'include',source_refs:[E.ref(source,'Adults receiving care')]}]:[];
    return {questions:[{question_id:q.question_id,framework_candidates:[],elements,issues:[],logic:null}]};
  }};
  const run=M.analyze(state,env,adapter);
  try{
    await tick();
    assert.equal(calls.filter(call=>call.step==='review_normalization').length,1);
  }finally{release();}
  const {candidates}=await run;
  assert.equal(calls.filter(call=>call.step==='review_normalization').length,1,'Final assembly reuses the identical assessment.');
  const project=E.ingest_candidates(state,candidates).state;
  assert.deepEqual(project.criteria.map(rule=>rule.text),['Adults receiving care']);
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
