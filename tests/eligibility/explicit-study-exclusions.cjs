const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../../app/eligibility/engine');
const M=require('../../app/eligibility/model');
const B=require('../../app/eligibility/background');

async function run(exclusionText,grouped=false){
 const question='👶 Eligible infants received respiratory support at birth. We examined whether oxygen was titrated to saturation targets. '+exclusionText;
 const state=E.save_input(E.create_project('neonatal-exclusions'),{research_question:question,question_framework:'PICOS',output_language:'en'}).state;
 let requests=0;
 const adapter={request:async(step,s,payload)=>{
  if(step==='review_normalization'){
   requests++;
   return {items:payload.items.map(({id,semantic_role,scope_status,disposition,information_status})=>({
    id,semantic_role,scope_status,disposition,information_status,status:'supported',issue_type:'none',reason:'Simulated source assessment.'
   }))};
  }
  assert.equal(step,'extract_elements');
  const q=payload.question,source=q.sources.find(s=>s.input_kind==='research_question');
  const el=(id,dimension,quote,side)=>({candidate_id:id,dimension_id:dimension,normalized_text:quote,structured_value:null,
   information_status:'explicit',semantic_role:side?'eligibility_condition':'review_focus',scope_status:side?'restricted':'unspecified',disposition:side,source_refs:[E.ref(source,quote)]});
  const elements=[el('p','population','infants received respiratory support at birth','include'),el('a','analysis_objective','whether oxygen was titrated to saturation targets',null)];
  if(grouped)elements.push(el('all','other',exclusionText,'exclude'));
  else{
   if(question.includes('delivery room'))elements.push(el('room','population','delivery room','include'));
   if(question.includes('antenatally'))elements.push(el('g','population','infants with antenatally diagnosed congenital anomalies','exclude'));
  }
  return {questions:[{question_id:q.question_id,framework_candidates:['picos'],elements,issues:[],logic:null}]};
 }};
 const result=await M.analyze(state,E.environment(),adapter);
 const project=E.ingest_candidates(state,result.candidates).state;
 return {view:B.projectToClassic(project),project,requests};
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
 assert.deepEqual(row('Other').exclude,['studies of oxygen saturation targeting']);
 assert(!view.frameworkSlots.includes('Other')&&!view.frameworkSlots.includes('Context'));
 for(const row of view.rows)for(const rule of row.exclude)assert(view.manuscriptParagraph.includes(rule));
 assert(!project.criteria.some(c=>c.text.includes('titrated')));
 assert(view.manuscriptParagraph.includes('titrated to saturation targets'));
 const source=Array.from(project.sources.find(s=>s.input_kind==='research_question').original_text);
 for(const e of project.elements.filter(e=>e.disposition==='exclude')){
  const ref=e.source_refs[0];assert.equal(source.slice(ref.start,ref.end).join(''),ref.quote);
 }
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
