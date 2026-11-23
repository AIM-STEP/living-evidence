const assert = require('node:assert/strict');
const test = require('node:test');
const E = require('../../app/eligibility/engine');
const M = require('../../app/eligibility/model');
const L = require('../../app/eligibility-library');
const env = E.environment();

function rule(id, source, dimension_id, quote, normalized_text, extra = {}) {
  return {candidate_id:id, dimension_id, normalized_text, source_refs:[E.ref(source, quote)],
    structured_value:null, semantic_role:'eligibility_condition', information_status:'explicit',
    scope_status:'restricted', disposition:'include', ...extra};
}

async function run({question, framework, attachment, extract, repair, reviews = [], retries = 1}) {
  const original = E.save_input(E.create_project('source-completeness'), {
    research_question:question, question_framework:framework, output_language:'en'
  }, {}, env).state;
  const q = original.questions[0];
  if (attachment) {
    const source = E.addSource(original, 'user_input', attachment, [q.question_id], 'protocol',
      {input_kind:'original_document',name:'Protocol.txt'});
    q.imported_source_refs.push(E.ref(source));
  }
  const requests = [];
  const result = await M.analyze(original, env, {async request(step, state, payload) {
    requests.push({step,payload:structuredClone(payload)});
    if (step === 'extract_elements') {
      return {questions:[{question_id:q.question_id, framework_candidates:[framework.toLowerCase()],
        elements:extract(payload), review_topic:'Source coverage test', issues:[], logic:null}]};
    }
    if (step === 'repair_candidate_wording') return {items:payload.items.map(item=>({
      id:item.id, normalized_text:repair?.(item)||item.normalized_text, structured_value:null
    }))};
    assert.equal(step, 'review_normalization');
    reviews.push(...payload.items);
    return {items:payload.items.map(item=>({...item, status:'supported', issue_type:'none', reason:'Simulated source approval.'}))};
  }}, {retries, languageSample:question});
  return {project:E.ingest_candidates(original,result.candidates,{},env).state,requests};
}

function unresolved(project) {
  return project.validation.completeness.eligibility.source_coverage.filter(item=>item.status==='unresolved');
}

test('an unlabelled reporting requirement in a protocol gets a targeted extraction even when the question uses PECO', async () => {
  const reporting = 'Eligible studies must report stroke within 90 days after discharge';
  const {project,requests} = await run({
    question:'Population: Adults with hypertension. Exposure: Ambient air pollution.',
    framework:'PECO',
    attachment:'## Methods\n'+reporting+'.\n\n## Results\nThe median follow-up was 60 days.',
    extract(payload) {
      if (!payload.validation_feedback) return [];
      assert(payload.source_requirements.some(item=>item.dimension==='outcome'&&item.source_refs[0].quote===reporting));
      const doc = payload.question.sources.find(item=>item.input_kind==='original_document');
      return [rule('o',doc,'outcome',reporting,'Studies must report stroke within 90 days after discharge',{outcome_use:'reporting_required'})];
    }
  });
  assert.equal(project.status,'final');
  assert(project.criteria.some(item=>item.dimension_id==='outcome'&&item.text.includes('90 days after discharge')));
  assert.equal(requests.filter(call=>call.step==='extract_elements').length,2);
  assert(!project.criteria.some(item=>item.text.includes('60 days')));
});

test('a focused repair can supply only the missing rule without removing earlier rules', async () => {
  const reporting = 'Eligible studies must report fatigue within 6 months';
  const {project,requests} = await run({
    question:'Population: Adults receiving chemotherapy. Intervention: Exercise. '+reporting+'.',
    framework:'PICOS',
    extract(payload) {
      const source = payload.question.sources[0];
      if (payload.validation_feedback) {
        assert.equal(payload.source_requirements.length,1);
        return [rule('condition',source,'outcome',reporting,'Studies must report fatigue within 6 months',{outcome_use:'reporting_required'})];
      }
      return [rule('condition',source,'population','Adults receiving chemotherapy','Adults receiving chemotherapy'),
        rule('other',source,'intervention','Exercise','Exercise')];
    }
  });
  assert.equal(project.status,'final');
  assert.deepEqual(project.criteria.map(item=>item.dimension_id).sort(),['intervention','outcome','population']);
  assert(requests.findIndex(call=>call.step==='review_normalization')<requests.findIndex(call=>call.payload.validation_feedback?.code==='SOURCE_COVERAGE'));
});

test('a full quote cannot hide a dropped dialysis time window, even when the simulated reviewer would approve it', async () => {
  const directive = 'Participants must be assessed within 2 days after discharge';
  const reviews=[];
  const {project,requests} = await run({
    question:'Population: Adults receiving dialysis. '+directive+'.',framework:'PICO',reviews,
    extract(payload) {
      const source=payload.question.sources[0];
      return [rule('p',source,'population','Adults receiving dialysis','Adults receiving dialysis'),
        rule('time',source,'population',directive,'Participants assessed after discharge')];
    }
  });
  assert.equal(project.status,'incomplete');
  assert.equal(requests.filter(call=>call.payload.validation_feedback?.code==='SOURCE_COVERAGE').length,1);
  assert(requests.some(call=>call.step==='repair_candidate_wording'),JSON.stringify(requests.map(c=>[c.step,c.payload.source_requirements,c.payload.items?.map(i=>[i.dimension_id,i.normalized_text,i.required_source_clauses])])));
  assert(!reviews.some(item=>item.normalized_text.includes('assessed after discharge')));
  assert.deepEqual(project.criteria.map(item=>item.text),['Adults receiving dialysis']);
  assert(unresolved(project).some(item=>item.source_refs[0].quote===directive));
  assert.match(L.criteriaHandoffBlock({activeGenerator:'machine',machineRun:{},eligibilityV3Snapshot:project}),/incomplete/i);
});

test('an explicit waiver can be repaired and still does not create a separate screening restriction', async () => {
  const waiver='Regardless of prior antibiotic use, patients are eligible';
  const {project} = await run({
    question:'Population: Adults with a urinary tract infection. '+waiver+'.',framework:'PICO',
    extract(payload) {
      const source=payload.question.sources[0];
      const item=rule('pop',source,'population','Adults with a urinary tract infection','Adults with a urinary tract infection');
      item.source_refs.push(E.ref(source,waiver));
      return [item];
    },
    repair(item) {
      assert(item.required_source_clauses.some(ref=>ref.quote===waiver));
      return 'Adults with a urinary tract infection, regardless of prior antibiotic use';
    }
  });
  assert.equal(project.status,'final');
  assert.equal(project.criteria.length,1);
  assert.match(project.criteria[0].text,/regardless of prior antibiotic use/);
});

test('a study reporting an analysis outcome does not make reporting it mandatory', async () => {
  const {project,requests} = await run({
    question:'Population: Adults receiving physical rehabilitation. Our outcomes of interest were pain. Studies must report pain for the subgroup analysis.',
    framework:'PICO',extract:()=>[]
  });
  assert.equal(project.status,'final');
  assert(!requests.some(call=>call.payload.source_requirements?.some(item=>item.source_refs.some(ref=>/subgroup analysis/.test(ref.quote)))));
  assert(!project.criteria.some(item=>item.dimension_id==='outcome'));
});

test('equivalent units pass the two-way check and a dropped end of a range fails', () => {
  const source = {source_id:'s',revision:1,original_text:'follow-up within 2 days after discharge; aged 18 to 65 years'};
  const [time,age] = source.original_text.split('; ');
  for (const [quote,correct,omitted] of [[time,'follow-up within 48 hours after discharge','follow-up after discharge'],
    [age,'aged at least 18 years and at most 65 years','aged at least 18 years']]) {
    const required={side:'include',source_refs:[E.ref(source,quote)]};
    assert(E.sourceRequirementCovered(required,[rule('r',source,'population',quote,correct)]),correct);
    assert(!E.sourceRequirementCovered(required,[rule('r',source,'population',quote,omitted)]),omitted);
  }
});

test('an omitted Chinese source clause goes through targeted repair in manual-format input', async()=>{
  const reporting='研究必须报告出院后 90 天内的再入院情况';
  const {project,requests}=await run({
    question:'人群：出院的成人。干预：电话随访。'+reporting+'。',framework:'PICOS',
    extract(payload){
      const source=payload.question.sources[0];
      if(payload.validation_feedback)return [rule('reporting',source,'outcome',reporting,
        'Studies must report readmission within 90 days after discharge',{outcome_use:'reporting_required'})];
      return [rule('p',source,'population','出院的成人','Adults discharged from hospital'),
        rule('i',source,'intervention','电话随访','Telephone follow-up')];
    }
  });
  assert.equal(project.status,'final',JSON.stringify({validation:project.validation,criteria:project.criteria,steps:requests.map(e=>[e.step,e.payload.items?.map(i=>i.normalized_text)])}));
  assert(project.criteria.some(item=>item.dimension_id==='outcome'&&item.text.includes('90 days after discharge')));
  assert(requests.some(call=>call.payload.validation_feedback?.code==='SOURCE_COVERAGE'));
});

test('an allowed choice in a new design cannot be reduced to just the first alternative', async () => {
  const alternatives='Randomisation by household or clinic is acceptable';
  const {project,requests}=await run({
    question:'Population: Adults at high cardiovascular risk. '+alternatives+'.',framework:'PICOS',
    extract(payload){
      const source=payload.question.sources[0];
      return [rule('p',source,'population','Adults at high cardiovascular risk','Adults at high cardiovascular risk'),
        rule('random',source,'study_design',alternatives,'Trials randomised by household')];
    },
    repair:()=> 'Trials randomised by household or clinic'
  });
  assert.equal(project.status,'final',JSON.stringify({steps:requests.map(c=>[c.step,c.payload.validation_feedback,c.payload.items?.map(i=>[i.dimension_id,i.normalized_text,i.required_source_clauses])]),issues:project.issues.map(i=>i.reason_code),coverage:unresolved(project)}));
  assert(project.criteria.some(item=>item.dimension_id==='study_design'&&/household or clinic/.test(item.text)));
  assert(requests.some(call=>call.step==='repair_candidate_wording'));
  assert(!requests.some(call=>call.step==='review_normalization'&&call.payload.items.some(item=>item.normalized_text==='Trials randomised by household')));
});

test('literal labelled fields and reporting directives correct a contradictory scope label before Jev', async () => {
  const reporting='Trials must report stroke within 6 months';
  const reviews=[];
  const {project}=await run({
    question:'Population: Urban adults. Comparison: Low exposure. '+reporting+'.',framework:'PECO',reviews,
    extract(payload){
      const source=payload.question.sources[0];
      return [rule('c',source,'comparator','Low exposure','Low exposure',{scope_status:'unrestricted'}),
        rule('o',source,'outcome','stroke within 6 months','Stroke within 6 months',{scope_status:'unrestricted'})];
    }
  });
  assert.equal(project.status,'final');
  assert(reviews.some(item=>item.dimension_id==='comparator'&&item.scope_status==='restricted'));
  assert(reviews.some(item=>item.dimension_id==='outcome'&&item.outcome_use==='reporting_required'&&item.scope_status==='restricted'));
  assert(project.criteria.some(item=>item.dimension_id==='outcome'&&item.text.includes('must report stroke')));
});
