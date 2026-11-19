const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../../app/eligibility/engine');
const M=require('../../app/eligibility/model');
const B=require('../../app/eligibility/background');
const {question,objective}=require('./fixtures/neonatal-resuscitation.cjs');

const leaf=element_id=>({op:'predicate',element_id});
async function extract(input,frame,items,logic,original=frame){
 const state=E.save_input(E.create_project('explicit-comparison'),{research_question:input,question_framework:frame,output_language:'en'}).state;
 const source=state.sources.find(s=>s.input_kind==='research_question');
 const elements=items.map(([id,dimension,quote,wording])=>({candidate_id:id,dimension_id:dimension,source_refs:[E.ref(source,quote)],
  normalized_text:wording||quote,structured_value:null,information_status:'explicit',scope_status:dimension==='outcome'?'unspecified':'restricted',
  semantic_role:dimension==='outcome'?'review_focus':'eligibility_condition',disposition:dimension==='outcome'?null:'include'}));
 const adapter={async request(step,project,payload){
  if(step==='extract_elements')return {questions:[{question_id:state.questions[0].question_id,framework_candidates:[original.toLowerCase()],review_topic:'Interventions compared with other interventions',elements,logic,issues:[]}]};
  assert.equal(step,'review_normalization');
  return {items:payload.items.map(({id,semantic_role,scope_status,disposition,information_status})=>({id,semantic_role,scope_status,disposition,information_status,status:'supported',issue_type:'none',reason:'Fixture verification'}))};
 }};
 const result=await M.analyze(state,E.environment(),adapter);
 const project=E.ingest_candidates(state,result.candidates).state;
 return {project,view:B.projectToClassic(project)};
}
const byDomain=(view,d)=>view.rows.find(r=>r.dimension===d)?.include;

test('different malformed inclusion trees and partial arm citations converge on the same explicit study eligibility',async()=>{
 const items=[['p1','population','term and late preterm infants'],['p2','population','received respiratory support at birth','infants who received respiratory support at birth'],
  ['i','intervention','air compared with supplemental oxygen',objective],['c','comparator','supplemental oxygen'],['s','study_design','quasi‐RCTs','quasi-randomised controlled trials'],['o','outcome','mortality']];
 for(const children of [['p1','p2','i','c','s'],['p1','p2','c','s'],['s','p2','c']]){
  const {view,project}=await extract(question,'PICOS',items,{op:'any_of',children:children.map(leaf)});
  assert.deepEqual(byDomain(view,'Population'),['term and late preterm infants who received respiratory support at birth']);
  assert.deepEqual(byDomain(view,'Intervention'),['air']);
  assert.deepEqual(byDomain(view,'Comparison'),['any supplemental oxygen']);
  assert.deepEqual(byDomain(view,'Study design'),['randomised controlled trials (RCTs), quasi‐RCTs or cluster‐RCTs']);
  assert(!view.rows.some(r=>r.dimension==='Other'&&r.include.length));
  const tree=project.logic.questions[project.questions[0].question_id].include;
  assert.equal(tree.op,'all_of');
  for(const e of project.elements.filter(e=>e.disposition==='include'&&e.active!==false)){
   assert(e.source_refs.some(r=>Array.from(question).slice(r.start,r.end).join('')===e.normalized_text));
  }
 }
});

test('source fields are restored in either grammatical order and preserve treatment alternatives',async()=>{
 for(const input of ['We included cohort studies enrolling adults with knee pain comparing exercise or stretching with education.',
                     'We included cohort studies comparing exercise or stretching with education among adults with knee pain.']){
  const {view}=await extract(input,'PICOS',[],null);
  assert.deepEqual(byDomain(view,'Population'),['adults with knee pain']);
  assert.deepEqual(byDomain(view,'Intervention'),['exercise or stretching']);
  assert.deepEqual(byDomain(view,'Comparison'),['education']);
  assert.deepEqual(byDomain(view,'Study design'),['cohort studies']);
 }
});
test('a distinct scope or explicitly alternative cohort is not absorbed into a common comparative rule',async()=>{
 const text='We included randomised trials in adults comparing exercise with education. Alternatively, we included cohort studies in children comparing stretching with education.';
 const items=[['p1','population','adults'],['i1','intervention','exercise'],['p2','population','children'],['i2','intervention','stretching']];
 const logic={op:'any_of',children:[{op:'all_of',children:['p1','i1'].map(leaf)},{op:'all_of',children:['p2','i2'].map(leaf)}]};
 const {project}=await extract(text,'PICO',items,logic);
 assert.equal(project.logic.questions[project.questions[0].question_id].include.op,'any_of');
 const other=await extract('We included clinical trials in adults comparing exercise with education.','PCC',[],null);
 assert(!other.project.elements.some(e=>e.dimension_id==='intervention'));
});

test('separately labelled mandatory fields retain their individual alternatives under another framework',async()=>{
 const fields='Population: adults.\nExposure: dust or smoke.';
 const items=[['p','population','adults'],['a','exposure','dust'],['b','exposure','smoke']];
 for(const [heading,operator] of [['Inclusion criteria:','all_of'],['Either of the following inclusion criteria:','any_of']]){
  const {project}=await extract(heading+'\n'+fields,'PECO',items,{op:'any_of',children:items.map(([id])=>leaf(id))});
  const tree=project.logic.questions[project.questions[0].question_id].include;
  assert.equal(tree.op,operator);
  if(operator==='all_of')assert(tree.children.some(child=>child.op==='any_of'&&child.children.length===2));
 }
});
