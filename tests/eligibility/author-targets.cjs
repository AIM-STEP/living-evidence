const assert=require('node:assert/strict');
const test=require('node:test');
const B=require('../../app/eligibility/background.js');
const D=require('../../app/eligibility/domain.js');
const E=require('../../app/eligibility/engine.js');

test('author answers can bind to one eligibility condition, its equivalent citations, or every listed condition',async()=>{
 const population='Adults with COPD',intervention='supervised exercise';
 const saved=E.save_input(E.create_project('author-targets'),{
  research_question:population+' receiving '+intervention+'.',additional_requirements:[population],
  question_framework:'PICO',output_language:'en'
 }).state;
 const q=saved.questions[0],source=D.sourceAt(saved,q.source_refs[0]),note=D.sourceAt(saved,q.additional_source_refs[0]);
 const candidate=(candidate_id,dimension_id,quote,document)=>({candidate_id,dimension_id,normalized_text:quote,
  source_refs:[E.ref(document,quote)],structured_value:null,scope_status:'restricted',information_status:'explicit',
  semantic_role:'eligibility_condition',disposition:'include',semantic_review:{status:'supported'}});
 const response={questions:[{question_id:q.question_id,framework_candidates:[],logic:null,elements:[
  candidate('p','population',population,source),candidate('duplicate','population',population,note),
  candidate('i','intervention',intervention,source)
 ],issues:[{reason_code:'AMBIGUOUS_MEANING',question_text:'Which records establish these eligibility conditions?',
  scope_impact:'Determines whether a study can be screened in.',element_candidate_ids:['p','duplicate','i']}]}]};
 const project=E.ingest_candidates(saved,response).state;
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const service=await B.create({projectId:project.project_id,storage,baseURL:'http://localhost/',
  frameworkConfig:require('../../config/eligibility-frameworks.json'),profileConfig:require('../../config/eligibility-review-profiles.json')});
 const install=state=>storage.setItem(service.keys.project,JSON.stringify(state));
 install(project);
 const [detail]=B.projectToClassic(project).sourceConfirmations;
 const byLabel=new Map(detail.answerTargets.map(target=>[target.label,target.id]));
 assert.deepEqual([...byLabel.keys()].sort(),[population,intervention].sort());
 assert.deepEqual(new Map(detail.locations.map(where=>[where.domain,where.targetId])),
  new Map([['Population',byLabel.get(population)],['Intervention',byLabel.get(intervention)]]));
 const answer=(answer_text,target_id)=>service.decide({issue_id:detail.issue_id,answer_text,target_id});
 const pulmonary='Verify the diagnosis by spirometry.',exercise='Verify supervision in the treatment log.';
 await assert.rejects(answer(pulmonary),{code:'ANSWER_TARGET_REQUIRED'});
 await assert.rejects(answer(pulmonary,'other-criterion'),{code:'ANSWER_TARGET_REQUIRED'});
 assert.deepEqual(service.current(),project);

 const byDimension=(state,dimension)=>state.elements.filter(e=>e.active!==false&&e.information_status!=='missing'&&e.dimension_id===dimension);
 const first=await answer(pulmonary,byLabel.get(population));
 assert.equal(byDimension(first.project,'population').length,2);
 assert(byDimension(first.project,'population').every(e=>e.normalized_text.includes(population)&&e.normalized_text.includes(pulmonary)));
 assert.deepEqual(byDimension(first.project,'intervention').map(e=>e.normalized_text),[intervention]);
 assert.deepEqual(first.classic.sourceConfirmations.flatMap(c=>c.locations.map(where=>where.domain)),['Intervention']);
 service.transaction(first,()=>{});
 const reloaded=E.ingest_candidates(service.current(),response).state;
 assert.deepEqual(B.projectToClassic(reloaded).sourceConfirmations.flatMap(c=>c.locations.map(where=>where.domain)),['Intervention']);
 assert(byDimension(reloaded,'population').every(e=>e.normalized_text.includes(pulmonary)));
 install(reloaded);
 await assert.rejects(answer(exercise,byLabel.get(population)),{code:'ANSWER_TARGET_REQUIRED'});
 const finished=await answer(exercise);
 assert.equal(finished.classic.sourceConfirmations.length,0);
 assert(byDimension(finished.project,'population').every(e=>e.normalized_text.includes(pulmonary)&&!e.normalized_text.includes(exercise)));
 assert(byDimension(finished.project,'intervention').every(e=>e.normalized_text.includes(intervention)&&e.normalized_text.includes(exercise)&&!e.normalized_text.includes(pulmonary)));

 install(project);
 const common='Use the baseline trial record.',all=await answer(common,'*');
 assert.equal(all.classic.sourceConfirmations.length,0);
 for(const [dimension,own,other] of [['population',population,intervention],['intervention',intervention,population]]){
  const records=byDimension(all.project,dimension);
  assert(records.every(e=>e.normalized_text.includes(own)&&e.normalized_text.includes(common)&&!e.normalized_text.includes(other)));
  assert(records.every(e=>e.source_refs.some(ref=>D.sourceAt(all.project,ref).original_text===common)));
 }
});
