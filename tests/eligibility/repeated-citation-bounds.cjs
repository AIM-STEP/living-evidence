const assert = require('node:assert/strict');
const test = require('node:test');
const B = require('../../app/eligibility/background.js');
const frameworkConfig = require('../../config/eligibility-frameworks.json');
const profileConfig = require('../../config/eligibility-review-profiles.json');

const included = 'Include adults aged at least 65 years.';
const excluded = 'Exclude adults aged under 18 years.';
const text = included + ' ' + excluded;

async function generate({ value = 65, operator = 'gte', repair = false, sourceText = text,
  shortQuote = 'adults', starts = [sourceText.indexOf(shortQuote)], inspectContext = ref => assert.equal(ref.context, included) } = {}) {
  const service = await B.create({ projectId: 'repeated-bound', storage: { getItem: () => null },
    baseURL: 'http://localhost/', frameworkConfig, profileConfig });
  const calls = [];
  const wording = (n, op) => 'Adults aged ' + (op === 'gte' ? 'at least ' : 'under ') + n + ' years';
  const modelClient = { async request(step, project, payload) {
    calls.push(step);
    if (step === 'extract_elements') {
      const q = payload.question;
      const source = q.sources.find(s => s.input_kind === 'original_document');
      return { questions: [{ question_id: q.question_id, framework_candidates: ['pico'], issues: [], logic: null,
        elements: [{ candidate_id: 'c5', dimension_id: 'population.age', normalized_text: wording(value, operator),
          structured_value: { operator, value, unit: 'year' }, semantic_role: 'eligibility_condition',
          information_status: 'explicit', scope_status: 'restricted', disposition: 'include',
          source_refs: starts.map(start => ({ source_id: source.source_id, source_revision: source.revision, quote: shortQuote,
            start, end: start + Array.from(shortQuote).length })),
        }],
      }] };
    }
    const item = payload.items[0];
    // Verify only against the selected occurrence.
    inspectContext(item.source_quotes[0]);
    assert.equal(step, 'review_normalization');
    const wrong = repair && item.structured_value.value !== 65;
    return { items: [{ id: item.id, reason: 'Simulated source check', status: wrong ? 'contradicted' : 'supported',
      issue_type: wrong ? 'unsupported_rewrite' : 'none', information_status: 'explicit',
      semantic_role: item.semantic_role, scope_status: item.scope_status, disposition: item.disposition }] };
  } };
  const stage = await service.generate({ question: 'Which studies are eligible?', reviewType: 'Systematic Review',
    legacy: {}, sources: [{ name: 'Original eligibility note', text: sourceText }], modelClient });
  return { project: stage.project, calls };
}

test('a supported threshold in the located passage survives final source validation', async () => {
  const { project, calls } = await generate();
  const [criterion] = project.criteria;
  assert.equal(criterion.text, 'Adults aged at least 65 years');
  const sourceQuotes = project.elements.find(e => e.element_id === criterion.source_element_ids[0]).source_refs;
  assert(sourceQuotes.some(r => r.quote === 'adults' && r.start === text.indexOf('adults')));
  assert(sourceQuotes.some(r => r.quote === included && text.slice(r.start, r.end) === included));
  assert(!sourceQuotes.some(r => r.quote.includes('18')));
  assert.deepEqual(calls, ['extract_elements', 'review_normalization']);
});

test('a different occurrence cannot supply a threshold even when a simulated reviewer approves it', async () => {
  const {project}=await generate({ value: 18, operator: 'lt' });
  assert.equal(project.criteria.length,0);
  assert(!project.elements.some(e=>e.dimension_id==='population.age'));
  assert.equal(project.validation.errors.length,0);
});

test('a clearly contradicted Jev check skips the threshold without creating a blocking issue', async () => {
  const { project, calls } = await generate({ value: 70, repair: true });
  assert.equal(project.criteria.length,0);
  assert(!project.issues.some(i=>i.status==='open'&&i.blocking));
  assert.equal(project.validation.errors.length,0);
  assert.deepEqual(calls, ['extract_elements','review_normalization']);
});

test('English and Chinese opposing clauses in one sentence cannot supply each other’s cutoff', async () => {
  for (const [sourceText, shortQuote] of [
    ['Include adults aged at least 65 years, but exclude adults aged at least 18 years.', 'adults'],
    ['纳入年龄至少65岁的成年人，但排除年龄至少18岁的成年人。', '成年人'],
  ]) {
    const inspectContext = ref => {
      assert.match(ref.context, /65/);
      assert.doesNotMatch(ref.context, /18/);
    };
    const options = { sourceText, shortQuote, inspectContext };
    const { project } = await generate(options);
    assert.match(project.criteria[0].text, /65/);
    const {project:rejected}=await generate({ ...options, value: 18 });
    assert.equal(rejected.criteria.length,0);
    assert(!rejected.elements.some(e=>e.dimension_id==='population.age'));
    assert.equal(rejected.validation.errors.length,0);
  }
});

test('many explicit locations share one eligible clause in the review request and retain each original match', async () => {
  const sourceText = 'Include adults aged at least 65 years, but exclude adults aged at least 18 years. '.repeat(48).trim();
  const starts = [...sourceText.matchAll(/Include (?=adults)/g)].map(m => m.index + m[0].length);
  const { project, calls } = await generate({ sourceText, starts, inspectContext(ref) {
    assert.match(ref.quote, /65/);
    assert.doesNotMatch(ref.quote, /18/);
  } });
  const locations = project.elements.find(e => e.dimension_id === 'population.age').source_refs;
  assert.deepEqual(locations.filter(r => r.quote === 'adults').map(r => r.start), starts);
  assert.deepEqual(calls, ['extract_elements', 'review_normalization']);
});
