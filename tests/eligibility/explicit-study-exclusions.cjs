const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../../app/eligibility/engine');
const M=require('../../app/eligibility/model');
const B=require('../../app/eligibility/background');
const Methods=require('../../app/eligibility/methodology');

async function run(exclusionText,grouped=false,{language='en',extractOnly=false,translatedCandidate=null,misclassified=null,excludedIntervention=null,settings=[]}={}){
 const question='👶 Eligible infants received respiratory support at birth. We examined whether oxygen was titrated to saturation targets. '+exclusionText;
 const state=E.save_input(E.create_project('neonatal-exclusions'),{research_question:question,question_framework:'PICOS',output_language:language}).state;
 const lessons=[],options={onLesson:id=>lessons.push(id)};
 let requests=0;
 const reviewed=[];
 const adapter={request:async(step,s,payload)=>{
  if(step==='review_normalization'){
   requests++;
   reviewed.push(...payload.items);
   return {items:payload.items.map(({id,semantic_role,scope_status,disposition,information_status})=>({
    id,semantic_role,scope_status,disposition,information_status,status:'supported',issue_type:'none',reason:'Simulated source assessment.'
   }))};
  }
  assert.equal(step,'extract_elements');
  const q=payload.question,source=q.sources.find(s=>s.input_kind==='research_question');
  const el=(id,dimension,quote,side)=>({candidate_id:id,dimension_id:dimension,normalized_text:quote,structured_value:null,
   information_status:'explicit',semantic_role:side?'eligibility_condition':'review_focus',scope_status:side?'restricted':'unspecified',disposition:side,source_refs:[E.ref(source,quote)]});
  const elements=[el('p','population','infants received respiratory support at birth','include'),el('a','analysis_objective','whether oxygen was titrated to saturation targets',null)];
  if(translatedCandidate)elements.push({...el('t','study_design',exclusionText,'exclude'),normalized_text:translatedCandidate});
  if(misclassified)elements.push(el('wrong','study_design',misclassified,'exclude'));
  if(excludedIntervention)elements.push(el('target','intervention',excludedIntervention,'exclude'));
  for(const [index,[quote,text]] of settings.entries()){
   elements.push({...el('setting'+index,'context',quote,'exclude'),normalized_text:text});
  }
  if(grouped)elements.push(el('all','other',exclusionText,'exclude'));
  else{
   if(question.includes('delivery room'))elements.push(el('room','population','delivery room','include'));
   if(question.includes('antenatally'))elements.push(el('g','population','infants with antenatally diagnosed congenital anomalies','exclude'));
  }
  return {questions:[{question_id:q.question_id,framework_candidates:['picos'],elements,issues:[],logic:null}]};
 }};
 if(extractOnly)return M.extract_elements(state,E.environment(),adapter,options);
 const result=await M.analyze(state,E.environment(),adapter,options);
 const project=E.ingest_candidates(state,result.candidates).state;
 return {view:B.projectToClassic(project),project,requests,lessons,reviewed};
}

test('mixed explicit exclusions retain their direction, independent domains, study subjects and exact offsets',async()=>{
 const text='We excluded studies of oxygen saturation targeting, studies not taking place in the delivery room and studies of infants with antenatally diagnosed congenital anomalies.';
 const {view,project,requests}=await run(text);
 assert.equal(requests,1);
 assert.equal(project.criteria.filter(c=>c.disposition==='exclude').length,3);
 const row=name=>view.rows.find(r=>r.dimension===name);
 assert.deepEqual(row('Population').exclude,['studies of infants with antenatally diagnosed congenital anomalies']);
 assert(!row('Population').include.some(rule=>rule.includes('room')));
 assert.deepEqual(row('Context').exclude,['studies not taking place in the delivery room']);
 assert.deepEqual(row('Intervention').exclude,['studies of oxygen saturation targeting']);
 assert(!view.frameworkSlots.includes('Other')&&!view.frameworkSlots.includes('Context'));
 for(const row of view.rows)for(const rule of row.exclude)assert(view.manuscriptParagraph.includes(rule));
 assert(!project.criteria.some(c=>c.text.includes('titrated')));
 assert(view.manuscriptParagraph.includes('titrated to saturation targets'));
 const source=Array.from(project.sources.find(s=>s.input_kind==='research_question').original_text);
 for(const e of project.elements.filter(e=>e.disposition==='exclude')){
  const ref=e.source_refs[0];assert.equal(source.slice(ref.start,ref.end).join(''),ref.quote);
 }
});

test('equivalent setting exclusions at one source occurrence are reviewed and shown once',async()=>{
 const excluded='studies not taking place in the delivery room',outside='outside the delivery room';
 for(const text of ['We excluded '+excluded+'.','We excluded studies of twins, '+excluded+' and case reports.']){
  const settings=[[excluded,excluded],['delivery room',outside],[text,'studies conducted outside the delivery room']];
  const {view,reviewed,project}=await run(text,false,{settings});
  assert.deepEqual(view.rows.find(r=>r.dimension==='Context').exclude,[excluded]);
  assert.equal(reviewed.filter(e=>e.dimension_id==='context'&&e.disposition==='exclude').length,1);
  assert.equal(project.criteria.filter(c=>c.disposition==='exclude'&&c.dimension_id==='context').length,1);
  assert.equal(view.manuscriptParagraph.match(/delivery room/gi).length,1);
 }
});

test('a separate exclusion in another setting keeps its own scope',async()=>{
 const a='studies not taking place in the delivery room',b='studies outside neonatal wards';
 const {view}=await run('We excluded '+a+'. We excluded '+b+'.',false,{
  settings:[['delivery room','outside the delivery room'],[b,'outside neonatal wards']]
 });
 assert.deepEqual(view.rows.find(r=>r.dimension==='Context').exclude.sort(),[a,b].sort());
});

test('a therapeutic strategy misfiled as study design reaches independent review in Intervention',async()=>{
 const target='studies of oxygen saturation targeting';
 const {project,view,lessons,requests,reviewed}=await run('We excluded '+target+' and case reports.',false,{misclassified:target});
 assert.equal(requests,reviewed.length);
 assert(reviewed.some(e=>e.dimension_id==='intervention'&&e.normalized_text===target&&e.disposition==='exclude'));
 assert.deepEqual(view.rows.find(r=>r.dimension==='Intervention').exclude,[target]);
 assert.deepEqual(view.rows.find(r=>r.dimension==='Study design').exclude,['case reports']);
 const rule=project.elements.find(e=>e.normalized_text===target);
 assert(rule.metadata_corrections.some(f=>f.field==='dimension_id'&&f.from==='study_design'&&f.to==='intervention'));
 assert(lessons.includes('excluded_intervention'));
 assert.equal(Methods.interventionReference([rule]),null);
 const included={dimension_id:'intervention',disposition:'include',scope_status:'restricted',normalized_text:'Nutritional interventions'};
 assert.equal(Methods.interventionReference([rule,included]),'nutritional intervention');
});

test('study-design, measurement and subgroup wordings do not identify excluded treatments',()=>{
 for(const wording of ['randomised trials of oxygen saturation targeting','studies of oxygen saturation measurement',
  'studies of infants receiving oxygen saturation targeting','whether oxygen was titrated to saturation targets',
  'studies of oxygen saturation targeting from the sensitivity analysis']){
  assert.equal(Methods.isInterventionStudyExclusion(wording),false,wording);
 }
 assert(Methods.isInterventionStudyExclusion('studies of blood pressure targeting'));
 assert(Methods.isInterventionStudyExclusion('trials testing exercise as the assigned intervention'));
});

test('a study excluded for comparing two treatment strategies keeps its whole comparison',async()=>{
 const target='studies comparing high versus low oxygen saturation targets';
 const {view,requests}=await run('We excluded '+target+'.',false,{excludedIntervention:target});
 assert.deepEqual(view.rows.find(r=>r.dimension==='Intervention').exclude,[target]);
 assert.equal(requests,2);
});

test('an exclusion from a sensitivity analysis or with a shared exception remains with the original extractor',async()=>{
 for(const text of [
  'We excluded studies of twins and studies of singletons from the sensitivity analysis.',
  'We excluded studies of twins and studies of singletons unless individual participant data were available.'
 ]){
  const {project}=await run(text);
  assert.equal(project.criteria.filter(c=>c.disposition==='exclude').length,0);
 }
});

test('a single verbatim exclusion list projects its independent conditions without duplicating the list',async()=>{
 const {view,project}=await run('We exclude studies of twins and studies outside the trial network.',true);
 assert.equal(project.criteria.filter(c=>c.disposition==='exclude').length,2);
 assert.deepEqual(view.rows.find(row=>row.dimension==='Context').exclude,['studies outside the trial network']);
 assert(!view.manuscriptParagraph.includes('We exclude studies'));
});

test('recover a single explicit study exclusion that the extractor missed',async()=>{
 for(const lead of ['We excluded','Exclude','Exclusion criteria:']){
  const {project}=await run(lead+' studies conducted outside maternity hospitals.');
  assert.deepEqual(project.criteria.filter(c=>c.disposition==='exclude').map(c=>c.text),['studies conducted outside maternity hospitals']);
 }
 const {view,lessons}=await run('We excluded case reports.');
 assert.deepEqual(view.rows.find(r=>r.dimension==='Study design').exclude,['case reports']);
 assert(lessons.includes('exclusion_list'));
});

test('a marked list retains its exclusion heading as evidence and stops at a change of section',async()=>{
 const text='\nExclusion criteria:\n- studies outside clinics\n- Case reports\nInclusion criteria:\n- studies of twins.';
 const {view,project}=await run(text);
 const elements=project.elements.filter(e=>e.disposition==='exclude'&&e.active!==false);
 assert.deepEqual(elements.map(e=>e.normalized_text),['studies outside clinics','Case reports']);
 for(const e of elements)assert(e.source_refs.some(r=>r.quote==='Exclusion criteria:'));
 assert(view.rows.find(row=>row.dimension==='Study design').exclude.includes('Case reports'));
});

test('wrapped exceptions and analytic exclusions are not turned into study-level exclusions',async()=>{
 for(const text of [
  'We excluded studies of twins\nfrom the sensitivity analysis.',
  'We excluded studies of twins for the quantitative synthesis.',
  '\nExclusion criteria:\n- studies of twins\n  only if both infants received ventilation.'
 ]){
  const {project}=await run(text);
  assert.equal(project.criteria.filter(c=>c.disposition==='exclude').length,0);
 }
});

test('Chinese directives and titled items recover missing exclusions with their original meaning',async()=>{
 for(const [source,expected] of [
  ['排除病例报告和动物研究。',['病例报告','动物研究']],
  ['\n排除标准：\n- 病例报告\n- 动物研究\n纳入标准：\n- 随机试验',['病例报告','动物研究']],
  ['排除病例报告，但有完整随访的病例报告除外。',[]],
  ['仅在敏感性分析中排除病例报告。',[]],
  ['排除了该患者存在并发症的可能性。',[]]
 ]){
  const {project}=await run(source,false,{language:'zh-CN'});
  assert.deepEqual(project.criteria.filter(c=>c.disposition==='exclude').map(c=>c.text).sort(),expected.sort());
 }
});

test('only a missing translation requires targeted normalization',async()=>{
 const input='排除病例报告。';
 const inspect=async translatedCandidate=>(await run(input,false,{extractOnly:true,translatedCandidate})).questions[0].elements.filter(e=>e.disposition==='exclude');
 const missing=await inspect();
 assert.equal(missing.length,1);assert.equal(missing[0].source_wording_needs_translation,true);
 const translated=await inspect('Case reports');
 assert.equal(translated.length,1);assert.equal(translated[0].normalized_text,'Case reports');assert(!translated[0].source_wording_needs_translation);
});
