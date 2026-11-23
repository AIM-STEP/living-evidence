const assert = require('node:assert/strict');
const test = require('node:test');
const E = require('../../app/eligibility/engine.js');
const D = require('../../app/eligibility/domain.js');
const B = require('../../app/eligibility/background.js');
const {setup} = require('../../tools/test_eligibility_grounding.cjs');

async function scenario(clarification, options = []) {
  const input = E.save_input(E.create_project('author-new-rule'), {
    questions: ['Adults undergoing dialysis.', 'Children in hospital.'].map(research_question => ({
      research_question, question_framework:'PICO',
    })), output_language:'en',
  }).state;
  const extracted = {questions:input.questions.map((q,i) => {
    const source = D.sourceAt(input,q.source_refs[0]);
    return {question_id:q.question_id,framework_candidates:[],logic:null,
      elements:[{candidate_id:'p',dimension_id:'population',normalized_text:source.original_text,source_refs:[E.ref(source)],
        scope_status:'restricted',semantic_role:'eligibility_condition',information_status:'explicit',disposition:'include',
        structured_value:null,semantic_review:{status:'supported'}}],
      issues:i ? [] : [{question_text:clarification,scope_impact:'Clarifies the review protocol.',reason_code:'AMBIGUOUS_MEANING',
        element_candidate_ids:[],options}],
    };
  })};
  const project = E.ingest_candidates(input,extracted).state;
  const issue = project.issues.find(i=>i.question_text===clarification);
  assert(issue && !issue.element_ids.length);
  const service = await B.create({projectId:'author-new-rule',frameworkConfig:require('../../config/eligibility-frameworks.json'),
    profileConfig:require('../../config/eligibility-review-profiles.json'),baseURL:'http://localhost/',
    storage:{getItem:key=>key===service.keys.project?JSON.stringify(project):null}});
  return {project,extracted,issue,decide:fields=>service.decide({issue_id:issue.issue_id,...fields})};
}

test('an unbound screening answer becomes a separate operative rule with its exact author source', async () => {
  const {project,extracted,issue,decide} = await scenario('Which study designs should be excluded?', ['Case reports']);
  for (const fields of [{answer_text:'Exclude case reports unless they provide individual data.'},{option_id:issue.options[0].option_id}]) {
    const stage = await decide(fields), updated = stage.project, decision = updated.decisions.at(-1);
    const criterion = updated.criteria.find(c=>c.disposition==='exclude');
    assert.equal(criterion.dimension_id,'study_design');
    assert.deepEqual(criterion.question_ids,[project.questions[0].question_id]);
    assert.deepEqual(criterion.source_decision_ids,[decision.decision_id]);
    const created = updated.elements.find(e=>e.element_id===criterion.source_element_ids[0]);
    assert.equal(created.decision_status,'confirmed_by_user');
    assert.deepEqual(created.source_refs.map(r=>D.sourceAt(updated,r).source_type),['human_answer']);
    assert.equal(created.source_refs[0].quote,fields.answer_text||'Case reports');
    assert.equal(criterion.text,fields.answer_text?'case reports unless they provide individual data.':'Case reports');
    assert.equal(updated.logic.questions[project.questions[0].question_id].exclude.children[0].criterion_id,criterion.criterion_id);
    assert.equal(updated.logic.questions[project.questions[1].question_id].exclude,null);
    assert.equal(updated.validation.errors.length,0);
    assert(!stage.classic.sourceConfirmations.some(c=>c.issue_id===issue.issue_id));
    const refreshed = E.ingest_candidates(updated,extracted).state;
    assert.deepEqual(refreshed.criteria.filter(c=>c.disposition==='exclude').map(c=>c.criterion_id),[criterion.criterion_id]);
    assert.equal(refreshed.issues.find(i=>i.issue_id===issue.issue_id).status,'resolved');
  }
});

test('an explicit rule with no named dimension uses Other and leaves existing predicates intact', async () => {
  const {project,decide} = await scenario('What additional criterion applies?');
  const stage = await decide({answer_text:'Include records with at least 12 weeks of follow-up.'});
  const created = stage.project.criteria.find(c=>c.dimension_id==='other');
  assert.equal(created.disposition,'include');
  assert.equal(created.text,'records with at least 12 weeks of follow-up.');
  assert.deepEqual(stage.project.criteria.filter(c=>c.dimension_id==='population'),project.criteria);
  const display=stage.classic.frameworkQuestions[0];
  assert(!display.frameworkSlots.includes('Other'));
  assert.deepEqual(display.additionalSlots,['Other']);
  assert.deepEqual(display.rows.find(r=>r.dimension==='Other').include,[created.text.replace(/\.$/u,'')]);

  const page=setup(),workspace=page.api.state(),question=project.questions[0].original_text;
  const rows=stage.classic.rows.map(row=>({title:row.dimension,condition:row.include.join('\n'),uncertain:row.exclude.join('\n')}));
  const run={question,reviewType:workspace.reviewType,sourceRevision:0};
  const {snapshot,...refinement}=stage.classic;
  Object.assign(workspace,{question,framework:stage.classic.framework,activeGenerator:'machine',generationMethodChoice:'machine',
   machineRun:run,machineCriteria:rows,eligibilityV3Snapshot:snapshot,
   machineRefinement:{...refinement,signature:page.api.signature(question,run.reviewType,0,rows)}});
  page.api.fill();
  const restriction=/records with at least 12 weeks of follow-up/i;
  assert.match(page.el('preview').innerHTML,restriction);
  assert.match(Buffer.from(page.api.export()).toString(),restriction);
  const summary=JSON.parse(page.storage.get('aimstep-eligibility-summary:synthetic-grounding'));
  assert(summary.includes.some(rule=>restriction.test(rule.text)));
});

test('reporting choices and ordinary project notes never create eligibility predicates', async () => {
  for (const [question,answer] of [
    ['What should appear in the narrative synthesis?', 'Include follow-up details in the narrative synthesis.'],
    ['How will findings be summarised?', 'Use a narrative description.'],
    ['How will the results be presented?', 'Include a table of patient outcomes.'],
    ['Which information should be included in data extraction?', 'Follow-up details'],
  ]) {
    const {project,decide} = await scenario(question);
    const {project:updated} = await decide({answer_text:answer});
    assert.deepEqual(updated.criteria,project.criteria);
    assert.equal(updated.decisions.at(-1).answer_text,answer);
  }
});
