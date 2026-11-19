const assert = require('node:assert/strict');
const { test } = require('node:test');
const E = require('../../app/eligibility/engine.js');
const M = require('../../app/eligibility/model.js');

function fixture() {
  const state = E.create_project('answer-context');
  state.questions = ['q1', 'q2'].map(question_id => ({ question_id, context: {}, framework_mapping: null }));
  state.elements = state.questions.map(q => ({
    question_id: q.question_id, element_id: 'el-' + q.question_id, normalized_text: 'An existing criterion',
    source_decision_ids: [], scope_conditions: ['throughout follow-up'], original_candidate_key: 'internal matching key',
  }));
  state.issues = [
    { issue_id: 'i1', question_id: 'q1', status: 'open' },
    { issue_id: 'i2', question_id: 'q2', status: 'open' },
    { issue_id: 'relation', question_id: null, status: 'open' },
  ];
  state.sources = state.questions.map(q => ({
    source_id: 's-' + q.question_id, revision: 1, question_ids: [q.question_id],
  }));
  state.decisions = state.sources.map((s, i) => ({
    decision_id: 'd' + i, answer_text: 'Prior answer ' + i, source_ref: { source_id: s.source_id, source_revision: 1 },
    changes: [{ old: state.elements[i], new: { ...state.elements[i], normalized_text: 'Revised criterion' } }],
  }));
  state.decisions.push({ decision_id: 'legacy-unscoped', issue_ids: [], changes: [] });
  return state;
}

async function submitted(state, issue) {
  let received;
  await M.parse_answers(state, 'Defer until later', [issue], {
    request: async (step, project, payload) => {
      received = payload;
      return { answers: [{ issue_ids: [issue], action: 'defer', updates: [] }] };
    },
  });
  return received;
}

test('one clarification sends its own question, original decision history and current restrictions', async () => {
  const state = fixture();
  const previous = JSON.stringify(state);
  const payload = await submitted(state, 'i1');
  assert.deepEqual(payload.elements.map(e => e.element_id), ['el-q1']);
  assert.deepEqual(payload.questions.map(q => q.question_id), ['q1']);
  assert.deepEqual(payload.prior_decisions.map(d => d.decision_id), ['d0', 'legacy-unscoped']);
  assert.equal(payload.prior_decisions[0].changes[0].new.normalized_text, 'Revised criterion');
  assert.deepEqual(payload.prior_decisions[0].changes[0].old.scope_conditions, ['throughout follow-up']);
  assert(!JSON.stringify(payload).includes('internal matching key'));
  assert.equal(JSON.stringify(state), previous);
});

test('project-wide clarifications keep both questions and shared or carried decisions are preserved', async () => {
  const state = fixture();
  const payload = await submitted(state, 'relation');
  assert.equal(payload.questions.length, 2);
  assert.equal(payload.elements.length, 2);
  assert.equal(payload.prior_decisions.length, 3);
  state.elements[0].source_decision_ids.push('d1');
  assert((await submitted(state, 'i1')).prior_decisions.some(d => d.decision_id === 'd1'));
});
