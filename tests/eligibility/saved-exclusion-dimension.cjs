const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../../app/eligibility/engine');
const B=require('../../app/eligibility/background');
const frameworks=require('../../config/eligibility-frameworks.json');
const profiles=require('../../config/eligibility-review-profiles.json');

const rule='studies of oxygen saturation targeting';
const input='Include newborn infants. We excluded '+rule+'.';

function priorResult(dimension,authorConfirmed=false){
 const state=E.save_input(E.create_project('saved-neonatal'),{research_question:input,question_framework:'PICOS',output_language:'en'}).state;
 const question=state.questions[0],source=state.sources.find(s=>s.input_kind==='research_question');
 const candidate=(id,dim,quote,disposition)=>({candidate_id:id,dimension_id:dim,normalized_text:quote,
  source_refs:[E.ref(source,quote)],structured_value:null,semantic_role:'eligibility_condition',information_status:'explicit',scope_status:'restricted',disposition,
  semantic_review:{status:'supported',reason:'Simulated source verification'}});
 const response={questions:[{question_id:question.question_id,framework_candidates:['picos'],issues:[],logic:null,
  elements:[candidate('p','population','newborn infants','include'),candidate('x',dimension,rule,'exclude')]}]};
 const project=E.ingest_candidates(state,response).state;
 const exclusion=project.elements.find(e=>e.candidate_id==='x');
 // Recreate the stored data from the preceding release, before refresh.
 exclusion.dimension_id=dimension;
 exclusion.metadata_corrections=[];
 if(authorConfirmed){
  const answer=E.addSource(project,'human_answer','Keep this rule in its current field.',[question.question_id]);
  exclusion.decision_status='confirmed_by_user';
  exclusion.source_refs.push(E.ref(answer));
 }
 E.build_criteria(project);
 const snapshot=project.snapshots.at(-1);
 snapshot.elements=structuredClone(project.elements);
 snapshot.criteria=structuredClone(project.criteria);
 project.presentation_version='20261119-source-exclusions-1';
 return {project,response,exclusion};
}

async function stored(project){
 const legacy={activeGenerator:'machine',framework:'PICOS',question:input,machineCriteria:B.projectToClassic(project).rows};
 project.last_published_legacy_signature=B.signature(legacy);
 const memory=new Map();
 const storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
 const service=await B.create({projectId:project.project_id,storage,frameworkConfig:frameworks,profileConfig:profiles,baseURL:'http://localhost/'});
 storage.setItem(service.keys.project,JSON.stringify(project));
 storage.setItem(service.keys.legacy,JSON.stringify(legacy));
 return {legacy,service};
}

test('refresh a saved design or Other exclusion from its original intervention citation',async()=>{
 for(const dimension of ['study_design','other']){
  const {project,exclusion}=priorResult(dimension),{service,legacy}=await stored(project);
  const original=project.criteria.find(c=>c.disposition==='exclude');
  const stage=service.refreshPresentation(legacy),current=stage.project.criteria.find(c=>c.disposition==='exclude');
  assert.equal(current.dimension_id,'intervention');
  assert.equal(current.criterion_id,original.criterion_id);
  assert.deepEqual(current.source_element_ids,[exclusion.element_id]);
  assert.equal(current.revision,original.revision+1);
  assert.deepEqual(stage.classic.rows.find(row=>row.dimension==='Intervention').exclude,[rule]);
  assert.deepEqual(stage.project.model_calls,project.model_calls);
  const old=E.render_output(stage.project,{snapshot_revision:project.revision});
  assert.equal(old.questions[0].exclude[0].dimension_id,dimension);
  service.transaction(stage,()=>{});
  assert.equal(service.refreshPresentation(legacy),null);
 }
});

test('keep author-confirmed assignment on refresh and re-extraction of the same citation',async()=>{
 const {project,response,exclusion}=priorResult('study_design',true),{service,legacy}=await stored(project);
 const stage=service.refreshPresentation(legacy);
 assert.equal(stage.project.criteria.find(c=>c.disposition==='exclude').dimension_id,'study_design');
 response.questions[0].elements.find(e=>e.candidate_id==='x').dimension_id='intervention';
 const next=E.ingest_candidates(stage.project,response).state;
 const exclusions=next.criteria.filter(c=>c.disposition==='exclude');
 assert.equal(exclusions.length,1);
 assert.equal(exclusions[0].dimension_id,'study_design');
 assert.deepEqual(exclusions[0].source_element_ids,[exclusion.element_id]);
});

test('a saved quote at the wrong source position cannot trigger reclassification',async()=>{
 const {project,exclusion}=priorResult('other');
 exclusion.source_refs[0].start--;
 exclusion.source_refs[0].end--;
 const {service,legacy}=await stored(project);
 const stage=service.refreshPresentation(legacy);
 assert.equal(stage.project.criteria.find(c=>c.disposition==='exclude').dimension_id,'other');
 assert(stage.project.validation.errors.some(e=>e.code==='QUOTE_OFFSET_MISMATCH'));
});
