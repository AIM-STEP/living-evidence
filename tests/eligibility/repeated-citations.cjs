const assert = require('node:assert/strict');
const test = require('node:test');
const B = require('../../app/eligibility/background.js');
const frameworkConfig = require('../../config/eligibility-frameworks.json');
const profileConfig = require('../../config/eligibility-review-profiles.json');

const target = 'patients receiving dialysis';
const design = 'cohort studies';

function positions(text, quote) {
  const starts = [];
  for (let offset = text.indexOf(quote); offset !== -1; offset = text.indexOf(quote, offset + 1)) {
    starts.push(Array.from(text.slice(0, offset)).length);
  }
  return starts;
}

function candidate(id, dimension, quote, source, overrides = {}) {
  return {
    candidate_id: id, dimension_id: dimension, normalized_text: quote, structured_value: null,
    semantic_role: 'eligibility_condition', information_status: 'explicit', scope_status: 'restricted', disposition: 'include',
    source_refs: [{ source_id: source.source_id, source_revision: source.revision, quote, ...overrides }],
  };
}

async function generate(text, { reference = {}, calls = [], onReview, disposition = 'include' } = {}) {
  const service = await B.create({
    projectId: 'repeated-citations', frameworkConfig, profileConfig,
    baseURL: 'http://localhost/', storage: { getItem: () => null },
  });
  const modelClient = { async request(step, state, payload) {
    calls.push(step);
    if (step === 'extract_elements') {
      const doc = payload.question.sources.find(s => s.input_kind === 'original_document');
      const elements = [{ ...candidate('c4', 'population', target, doc, reference), disposition }];
      if (text.includes(design)) elements.push(candidate('c5', 'study_design', design, doc));
      return { questions: [{
        question_id: payload.question.question_id, framework_candidates: [], elements, logic: null, issues: [],
      }] };
    }
    assert.equal(step, 'review_normalization');
    if (onReview) onReview(payload);
    return { items: payload.items.map(item => ({
      id: item.id, status: 'supported', issue_type: 'none', reason: 'Simulated approval.', information_status: 'explicit',
      semantic_role: item.semantic_role, scope_status: item.scope_status, disposition: item.disposition,
    })) };
  } };
  return service.generate({
    question: 'Which studies are eligible?', reviewType: 'Systematic Review', legacy: {}, modelClient,
    sources: [{ name: 'Eligibility note', text }],
  });
}

function exactReferences(element, text) {
  const points = Array.from(text);
  for (const ref of element.source_refs) {
    assert.equal(points.slice(ref.start, ref.end).join(''), ref.quote, 'saved offsets must reproduce the exact original text');
  }
  return element.source_refs;
}

test('identical eligibility statements preserve their occurrences without another extraction', async () => {
  const text = 'Include ' + target + '. Include ' + target + '.';
  const calls = [];
  const { project } = await generate(text, { calls });
  assert.deepEqual(calls, ['extract_elements', 'review_normalization']);
  const element = project.elements.find(e => e.dimension_id === 'population');
  const refs = exactReferences(element, text);
  for (const start of positions(text, target)) {
    assert(refs.some(ref => ref.start <= start && ref.end >= start + target.length));
  }
  assert.equal(element.decision_status, 'accepted_from_input');
  assert.equal(project.criteria.filter(c => c.source_element_ids.includes(element.element_id)).length, 1);
});

test('a repeated standalone direction keeps both locations across an independent sibling rule', async () => {
  for (const verb of ['Include', 'Exclude']) {
    const disposition = verb.toLowerCase();
    const direction = verb + ' ' + target + '.';
    const text = direction + ' Include ' + design + '. ' + direction;
    const calls = [];
    const { project } = await generate(text, { disposition, calls });
    const element = project.elements.find(e => e.dimension_id === 'population');
    const refs = exactReferences(element, text);
    assert.deepEqual(refs.map(r => r.start), positions(text, target));
    assert.equal(element.decision_status, 'accepted_from_input');
    assert(project.criteria.some(c => c.disposition === disposition && c.source_element_ids.includes(element.element_id)));
    assert(!project.issues.some(i => i.status === 'open' && i.element_ids.includes(element.element_id)));
    assert.deepEqual(calls, ['extract_elements', 'review_normalization']);
  }
});

test('Unicode code-point and UTF-16 offsets bind a repeated phrase to the intended later occurrence', async () => {
  const text = '📋 Exclude ' + target + '. Include ' + target + '.';
  const [first, second] = positions(text, target);
  assert.notEqual(second, text.lastIndexOf(target));
  for (const start of [second, text.lastIndexOf(target)]) {
    const calls = [];
    const { project } = await generate(text, { reference: { start, end: start + target.length }, calls, onReview: payload => {
      assert.match(JSON.stringify(payload.items), /Include patients receiving dialysis/);
    } });
    assert.deepEqual(calls, ['extract_elements', 'review_normalization']);
    const element = project.elements.find(e => e.dimension_id === 'population');
    const refs = exactReferences(element, text);
    assert(refs.some(ref => ref.start <= second && ref.end >= second + target.length));
    assert(!refs.some(ref => ref.start <= first && ref.end >= first + target.length));
    assert.equal(element.decision_status, 'accepted_from_input');
  }
});

test('opposing contexts survive as one open check while an unrelated supported rule is saved', async () => {
  const text = '📋 Include ' + target + '. Exclude ' + target + '. Include ' + design + '.';
  const calls = [];
  // Neither value denotes any occurrence in code points or UTF-16.
  const { project, classic } = await generate(text, { reference: { start: 2, end: 2 + target.length }, calls, onReview: payload => {
    // Only an attachment includes the opposing instructions. Both must reach the independent reviewer.
    assert.match(JSON.stringify(payload.items), /Include patients receiving dialysis/);
    assert.match(JSON.stringify(payload.items), /Exclude patients receiving dialysis/);
  } });
  assert.deepEqual(calls, ['extract_elements', 'review_normalization']);
  const element = project.elements.find(e => e.dimension_id === 'population');
  exactReferences(element, text);
  assert.equal(element.decision_status, 'pending');
  assert(!project.criteria.some(c => c.source_element_ids.includes(element.element_id)));
  assert(project.criteria.some(c => c.text === design));
  const open = project.issues.filter(i => i.status === 'open' && i.element_ids.includes(element.element_id));
  assert.equal(open.length, 1);
  assert(classic.sourceConfirmations.some(c => c.issue_id === open[0].issue_id));
});

test('a missing quotation, a different source or a different revision still fails before review', async () => {
  const text = 'Include ' + target + '. Include ' + target + '.';
  for (const reference of [{ quote: 'patients receiving radiotherapy' }, { source_revision: 99 }, { source_id: 'different-source' }]) {
    const calls = [];
    await assert.rejects(generate(text, { calls, reference }), error => error.code === 'QUOTE_NOT_FOUND');
    assert.deepEqual(calls, ['extract_elements', 'extract_elements']);
  }
});

test('opposing clauses, section headings and a scope change keep separate meanings', async () => {
  for (const text of [
    'Include ' + target + ' during admission, but exclude ' + target + ' during follow-up. Include ' + design + '.',
    'Inclusion criteria:\n' + target + '.\nExclusion criteria:\n' + target + '.',
    'Include ' + target + '.\nFor paediatric cohorts only:\nInclude ' + target + '.',
  ]) {
    const calls = [];
    const { project } = await generate(text, { calls });
    const element = project.elements.find(e => e.dimension_id === 'population');
    assert.equal(element.decision_status, 'pending');
    assert(!project.criteria.some(c => c.source_element_ids.includes(element.element_id)));
    assert.equal(calls.filter(step => step === 'extract_elements').length, 1);
  }
});
