const assert = require('node:assert/strict');
const B = require('../../app/eligibility/background.js');
const E = require('../../app/eligibility/engine.js');
const frameworkConfig = require('../../config/eligibility-frameworks.json');
const profileConfig = require('../../config/eligibility-review-profiles.json');

async function run() {
  const values = new Map(), storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
  const id = 'clear-regression', key = prefix => prefix + ':' + id;
  const open = () => B.create({projectId: id, storage, frameworkConfig, profileConfig, baseURL: 'http://localhost/'});
  const service = await open(), secondTab = await open();
  const clean = {question: 'Include adults.', activeGenerator: 'machine', generationMethodChoice: 'machine', reviewType: 'Systematic Review'};
  const oldDraft = {...clean, framework: 'PICO', machineCriteria: [{title: 'Population', condition: 'Obsolete rule.'}],
    machineRefinement: {audit: {sources: [{name: 'Historical attachment', text: 'Obsolete document.'}]}},
    finalCriteria: {decisions: [{domain: 'Population', rule: 'Obsolete rule.'}]}, criteriaClearHistory: ['obsolete']};
  const oldProject = E.create_project(id);
  for (const field of ['snapshots', 'decisions', 'elements', 'issues', 'model_calls']) oldProject[field] = [{old: true}];
  oldProject.sources = [{original_text: 'Obsolete document.'}];
  storage.setItem(service.keys.project, JSON.stringify(oldProject));
  storage.setItem(service.keys.legacy, JSON.stringify(oldDraft));
  storage.setItem(service.keys.summary, JSON.stringify({old: true}));
  storage.setItem(service.keys.library, JSON.stringify({entries: [oldDraft]}));
  const backupKey = key('aimstep-protocol-backups'), doneKey = key('aimstep-setup-completed');
  storage.setItem(backupKey, JSON.stringify([{eligibility: oldDraft, notes: 'keep'}]));
  storage.setItem(doneKey, '[1,3]');
  const otherKey = 'aimstep-eligibility-v3:another-project';
  storage.setItem(otherKey, 'unchanged');
  const oldStage = {project: oldProject, expectedRevision: 0, expectedSignature: B.signature(oldDraft)};
  const extras = [[backupKey, '[{"notes":"keep"}]'], [doneKey, '[3]']];
  const before = new Map(values);
  assert.throws(() => B.resetProject(storage, id, clean, [[otherKey, null]]), {code: 'INVALID_RESET_TARGET'});
  const write = storage.setItem;
  storage.setItem = (key, value) => {if (key === doneKey) throw Error('quota'); return write(key, value);};
  assert.throws(() => B.resetProject(storage, id, clean, extras), /quota/);
  assert.deepEqual(values, before, 'failed Clear restores all prior project content');
  storage.setItem = write;

  const epoch = B.resetProject(storage, id, {...oldDraft,attachments:['previous.txt'],materials:['old citation']}, extras);
  assert.equal(storage.getItem(otherKey), 'unchanged');
  assert.equal(storage.getItem(service.keys.project), null);
  assert.equal(storage.getItem(service.keys.summary), null);
  assert.deepEqual(JSON.parse(storage.getItem(service.keys.library)), {version: 1, entries: [], activeId: null});
  assert.deepEqual(JSON.parse(storage.getItem(backupKey)), [{notes: 'keep'}]);
  assert.equal(B.currentEpoch(storage, id), epoch);
  const fresh = JSON.parse(storage.getItem(service.keys.legacy));
  assert.equal(fresh.criteria_epoch, epoch);
  assert.equal(fresh.question, clean.question);
  for(const oldField of ['framework','attachments','materials','machineSourceRevision','machineRefinement'])assert(!Object.hasOwn(fresh,oldField));
  const empty = service.current();
  assert.equal(empty.project_id, id); assert.equal(empty.revision, 0);
  for (const field of ['sources', 'criteria', 'issues', 'decisions', 'questions', 'model_calls', 'snapshots']) assert.deepEqual(empty[field], []);

  const modelClient = {async request(step, project, payload) {
    assert.equal(project.project_id, id); assert.equal(project.criteria_epoch, epoch);
    if (step === 'extract_elements') {
      const q = payload.question, source = q.sources.find(item => item.input_kind === 'research_question');
      assert.deepEqual(q.confirmed_elements, []);
      assert(!q.sources.some(s => s.original_text.includes('Obsolete')));
      return {questions: [{question_id: q.question_id, review_topic: 'Adults', framework_candidates: ['pico'], issues: [], logic: null,
        elements: [{candidate_id: 'p', dimension_id: 'population', normalized_text: 'adults', structured_value: null,
          source_refs: [E.ref(source, 'adults')], information_status: 'explicit', semantic_role: 'eligibility_condition', scope_status: 'restricted', disposition: 'include'}]}]};
    }
    assert.equal(step, 'review_normalization');
    return {items: payload.items.map(i => ({id: i.id, reason: 'Directly stated.', status: 'supported', issue_type: 'none',
      semantic_role: i.semantic_role, information_status: i.information_status, scope_status: i.scope_status, disposition: i.disposition}))};
  }};
  const generate = (legacy, client = modelClient) => secondTab.generate({legacy, question: clean.question, reviewType: clean.reviewType, modelClient: client});
  const conflict = {code: 'VERSION_CONFLICT'};
  assert.throws(() => secondTab.transaction(oldStage, () => assert.fail('stale commit wrote')), conflict);
  assert.throws(() => secondTab.recordEdit(fresh, oldDraft), conflict);
  assert.throws(() => secondTab.refreshPresentation(oldDraft), conflict);
  await assert.rejects(generate(oldDraft), conflict);
  await assert.rejects(secondTab.decide({issue_id: 'old'}), conflict);
  const stage = await generate({...oldDraft, criteria_epoch: epoch});
  assert.equal(stage.project.legacy_archive, null, 'post-Clear generation cannot import old rules through legacy history');
  assert.equal(stage.project.criteria.length, 1);
  assert(!JSON.stringify(stage.project).includes('Obsolete'));

  let release, started;
  const begin = new Promise(resolve => {started = resolve;});
  const gate = new Promise(resolve => {release = resolve;});
  const inFlight = generate(fresh, {async request(...args) {if (args[0] === 'extract_elements') {started(); await gate;} return modelClient.request(...args);}});
  await begin;
  const nextEpoch = B.resetProject(storage, id, fresh);
  assert.notEqual(nextEpoch, epoch);
  release();
  await assert.rejects(inFlight, conflict);
  assert.throws(() => service.transaction(stage, () => assert.fail('stale commit wrote')), conflict);
  assert.equal(storage.getItem(service.keys.project), null);
  assert.throws(() => B.resetProject(storage, id, fresh), conflict);
  console.log('PASS: Clear removes project history, preserves unrelated data, rolls back failed writes and blocks stale generations across tabs');
}
run().catch(error => {console.error(error); process.exitCode = 1;});
