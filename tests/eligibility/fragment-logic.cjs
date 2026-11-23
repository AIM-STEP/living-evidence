const assert = require('node:assert/strict');
const B = require('../../app/eligibility/background.js');
const D = require('../../app/eligibility/domain.js');
const E = require('../../app/eligibility/engine.js');
const frameworkConfig = require('../../config/eligibility-frameworks.json');
const profileConfig = require('../../config/eligibility-review-profiles.json');

const a = 'independent adults', b = 'supported adults', c = 'rural residents';
const leaf = element_id => ({op: 'predicate', element_id});

async function generate({connector, question = '', separateFiles = false, numbered = false, mixed = false, corrected = false}) {
  const storage = {getItem: () => null};
  const service = await B.create({projectId: 'fragment-test', storage, frameworkConfig, profileConfig, baseURL: 'http://localhost/'});
  const sources = numbered
    ? [{name: 'questions.txt', text: 'Q1: Include independent adults.\nQ2: Include rural residents.'}]
    : [{name: 'Methods.pdf · page 1', page: 1, text: 'Background. '.repeat(450) + a + ' or ' + b + '.'},
       {name: (separateFiles ? 'Other.pdf' : 'Methods.pdf') + ' · page 2', page: 2,
        text: (connector ? connector + ' ' : '') + c + '. ' + 'More detail. '.repeat(500)}];
  if (mixed) {
    sources.splice(0, sources.length,
      {name: 'Methods.pdf · page 1', page: 1, text: 'Background. '.repeat(450) + a + '.'},
      {name: 'Methods.pdf · page 2', page: 2, text: ' '.repeat(300) + 'Alternatively, ' + b + '.' + ' '.repeat(5100) + '.'},
      {name: 'Methods.pdf · page 3', page: 3, text: 'In addition, ' + c + '. ' + 'More detail. '.repeat(500)});
  }
  const requests = [];
  const modelClient = {async request(step, state, payload, schema) {
    if (step === 'review_normalization') return {items: payload.items.map(i => ({
      id: i.id, status: 'supported', reason: 'Direct quotation.', issue_type: 'none', information_status: 'explicit',
      semantic_role: 'eligibility_condition', scope_status: 'restricted', disposition: 'include'
    }))};
    assert.equal(step, 'extract_elements');
    assert(schema.properties.questions.items.required.includes('review_topic'));
    const q = payload.question, elements = [];
    assert(!payload.validation_feedback, 'An omitted or blank title should never retry extraction');
    requests.push(payload);
    for (const source of q.sources) {
      for (const [id, quote] of [[1, a], [2, b], [3, c]]) {
        if (!source.original_text.includes(quote)) continue;
        elements.push({
          candidate_id: String(id), dimension_id: 'population', normalized_text: quote, structured_value: null,
          information_status: 'explicit', semantic_role: corrected && quote === c ? 'review_focus' : 'eligibility_condition',
          scope_status: corrected && quote === c ? 'unspecified' : 'restricted', disposition: corrected && quote === c ? null : 'include',
          source_refs: [{source_id: source.source_id, source_revision: source.revision, quote}]
        });
      }
    }
    const leaves = elements.map(e => leaf(e.candidate_id));
    return {questions: [{question_id: q.question_id, ...(payload.part_index ? {} : {review_topic: ''}),
      framework_candidates: ['pico'], elements, issues: [], logic: leaves.length > 1 ? {op: 'any_of', children: leaves} : leaves[0] || null}]};
  }};
  const stage = await service.generate({legacy: {}, question, reviewType: 'Systematic Review', sources, modelClient});
  return {stage, requests, sources};
}

(async () => {
  for (const [connector, expected] of [['Alternatively,', 'any_of'], ['In addition,', 'all_of'], ['Unless', 'not']]) {
    const {stage, requests, sources} = await generate({connector});
    assert(requests.length > 1);
    const tree = stage.project.questions[0].logic;
    assert.equal(tree.op, expected === 'not' ? 'all_of' : expected);
    assert.equal(tree.children[0].op, 'any_of', 'The within-part alternative survives the merge');
    if (expected === 'not') assert.equal(tree.children[1].op, 'not');
    assert(!stage.project.issues.some(i => i.trigger_rule_id.startsWith('fragment_relation:')));
    for (const source of sources) {
      const submitted = requests.flatMap(r => r.question.sources).filter(s => s.page === source.page).sort((x, y) => x.start_codepoint - y.start_codepoint);
      assert.equal(submitted.map(s => s.original_text).join(''), source.text, 'Each original page is extracted exactly once');
      assert(submitted.every(s => s.name === source.name && s.input_kind === 'original_document'));
    }
    assert(requests.every(r => !r.question.original_text && !r.question.sources.some(s => s.input_kind === 'research_question')));
    assert(stage.project.elements.filter(e => e.information_status === 'explicit').every(e =>
      e.source_refs.every(r => D.sourceAt(stage.project, r).page)), 'Every criterion cites an original page');
    assert(!stage.classic.reviewTopic.includes('Background.'), 'An empty title uses the scope rather than a document index');
  }
  const corrected = await generate({connector: 'Alternatively,', corrected: true});
  assert.equal(D.walkLeaves(corrected.stage.project.questions[0].logic).length, 3,
    'A candidate reclassified as an eligibility condition during review must rejoin its source-defined branch');
  const typed = 'Which participants meet eligibility for the review?';
  const {stage, requests} = await generate({connector: 'Alternatively,', question: typed, separateFiles: true});
  for (const {question} of requests) {
    const copies = Number(question.original_text === typed) + question.sources.filter(s => s.original_text === typed).length;
    assert.equal(copies, 1, 'Every batch receives the actual question once');
  }
  const project = stage.project, q = project.questions[0];
  const pending = project.issues.filter(i => i.status === 'open' && i.trigger_rule_id.startsWith('fragment_relation:'));
  assert.equal(pending.length, 1, 'A connector on an unrelated file cannot decide how two sources combine');
  assert.equal(q.logic, null);
  assert.equal(project.logic.questions[q.question_id].include, null);
  for (const op of ['all_of', 'any_of']) {
    const result = E.apply_decisions(project, {base_revision: project.revision, request_id: op,
      answers: [{issue_id: pending[0].issue_id, option_id: op, answer_text: op}]}).state;
    const decided = result.questions[0].logic;
    assert.equal(decided.op, op);
    assert.equal(decided.children[0].op, 'any_of');
    assert.equal(D.walkLeaves(decided).length, 3);
    assert(!result.issues.some(i => i.status === 'open' && i.trigger_rule_id.startsWith('fragment_relation:')));
  }
  const mixed = (await generate({mixed: true})).stage.project;
  const groupIssue = mixed.issues.find(i => i.status === 'open' && i.trigger_rule_id.startsWith('fragment_relation:'));
  assert(groupIssue, 'A source containing both OR and AND requires a grouping decision');
  assert.equal(groupIssue.options.length, 2);
  const structures = [];
  for (const option of groupIssue.options) {
    const resolved = E.apply_decisions(mixed, {base_revision: mixed.revision, request_id: option.option_id,
      answers: [{issue_id: groupIssue.issue_id, option_id: option.option_id, answer_text: option.label}]}).state.questions[0].logic;
    assert.equal(D.walkLeaves(resolved).length, 3);
    assert(D.treeHas(resolved, 'any_of') && D.treeHas(resolved, 'all_of'));
    structures.push(resolved.op);
  }
  assert.deepEqual(structures.sort(), ['all_of', 'any_of']);
  const numbered = await generate({numbered: true});
  assert.equal(numbered.requests.length, 2);
  for (const {question} of numbered.requests) {
    const [page] = question.sources;
    assert.equal(question.sources.length, 1);
    assert.equal(page.name, 'questions.txt');
    assert(!(page.original_text.includes(a) && page.original_text.includes(c)));
  }
  const rural = numbered.stage.project.elements.find(e => e.normalized_text === c);
  const [ref] = rural.source_refs;
  assert.equal(D.sourceAt(numbered.stage.project, ref).original_text.slice(ref.start, ref.end), c);
  console.log('PASS: cross-part alternatives, conjunctions and exceptions, preserved subtrees, actionable unknown relations, whole-question context, once-only original pages and optional titles');
})().catch(error => {console.error(error); process.exitCode = 1;});
