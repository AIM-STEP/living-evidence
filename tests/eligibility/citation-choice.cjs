const assert = require('node:assert/strict');
const D = require('../../app/eligibility/domain.js');
const E = require('../../app/eligibility/engine.js');
const B = require('../../app/eligibility/background.js');

const original = 'Include adults with asthma. Exclude adults without asthma unless referred for assessment.';
const initial = E.save_input(E.create_project('passage-choice'), {
  research_question: original, question_framework: 'PICO', output_language: 'en',
}).state;
const q = initial.questions[0], source = D.sourceAt(initial, q.source_refs[0]);
const alternatives = ['Include adults with asthma.', 'Exclude adults without asthma unless referred for assessment.'].map(sentence => {
  const context = E.ref(source, sentence), start = context.start + sentence.indexOf('adults');
  return { ...context, match_quote: 'adults', match_start: start, match_end: start + 6, reference_index: 0 };
});
const candidate = {
  candidate_id: 'c4', dimension_id: 'population', normalized_text: 'all adults', structured_value: null,
  source_refs: alternatives.map(a => ({...E.ref(source, 'adults'), start: a.match_start, end: a.match_end})),
  source_occurrence_alternatives: alternatives, semantic_role: 'eligibility_condition',
  scope_status: 'restricted', disposition: 'include', information_status: 'ambiguous',
  semantic_review: { status: 'uncertain', issue_type: 'ambiguous_source' },
};
const state = E.ingest_candidates(initial, { questions: [{
  question_id: q.question_id, framework_candidates: [], elements: [candidate], issues: [], logic: null,
}] }).state;
const issue = state.issues.find(i => i.trigger_rule_id === 'source_occurrence');
assert.equal(issue.options.length, 2);
assert.equal(state.criteria.length, 0);
const element_id = issue.element_ids[0];

(async () => {
  const storage = {getItem: key => key === service.keys.project ? JSON.stringify(state) : null};
  const service = await B.create({projectId:'passage-choice',storage,baseURL:'http://localhost/',
    frameworkConfig:require('../../config/eligibility-frameworks.json'),profileConfig:require('../../config/eligibility-review-profiles.json')});
  const decide = (normalized_text, disposition, selected = issue.options[1]) => service.decide({
    issue_id: issue.issue_id, option_id: selected.option_id,
    modelClient: { async request(step, project, payload) {
      assert.equal(step, 'interpret_human_answer');
      assert.equal(payload.selected_option_id, selected.option_id);
      return {answers:[{issue_ids:[issue.issue_id],action:'confirm',updates:[{
        element_id, normalized_text, disposition, scope_status:'restricted', semantic_role:'eligibility_condition',
      }]}]};
    }},
  });
  const intended = 'adults without asthma unless referred for assessment';
  await assert.rejects(decide('adults', 'include', issue.options[0]), {code:'SOURCE_DECISION_INCOMPLETE'});
  await assert.rejects(decide(intended, 'include'), {code:'SOURCE_DECISION_INCOMPLETE'});
  await assert.rejects(decide('adults without asthma', 'exclude'), {code:'SOURCE_DECISION_INCOMPLETE'});
  const resolved = (await decide(intended, 'exclude')).project;
  assert.equal(resolved.criteria[0].disposition, 'exclude');
  assert.equal(resolved.criteria[0].text, intended);
  assert.equal(resolved.issues.find(i=>i.issue_id===issue.issue_id).status, 'resolved');
  const chosen = resolved.elements.find(e=>e.element_id===element_id);
  assert(!chosen.source_occurrence_pending);
  assert.deepEqual(chosen.source_refs.filter(r=>r.source_id===source.source_id).map(r=>r.quote), [alternatives[1].quote]);
  console.log('PASS: selected passage binds the clarified criterion, direction, exception and exact evidence.');
})().catch(error=>{console.error(error);process.exitCode=1});
