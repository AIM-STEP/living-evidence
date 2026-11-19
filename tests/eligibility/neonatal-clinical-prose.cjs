const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../../app/eligibility/engine');
const M=require('../../app/eligibility/model');
const B=require('../../app/eligibility/background');
const Methods=require('../../app/eligibility/methodology');

const {objective,outcomes,declaration,question}=require('./fixtures/neonatal-resuscitation.cjs');

test('reproduce the neonatal example through analysis, independent review and preview',async()=>{
 const state=E.save_input(E.create_project('neonatal-question'),{research_question:question,question_framework:'PICOS',output_language:'en'}).state;
 const source=state.sources.find(s=>s.input_kind==='research_question');
 const candidate=(id,dimension,quote,side='include')=>({candidate_id:id,dimension_id:dimension,normalized_text:quote,
  structured_value:null,source_refs:[E.ref(source,quote)],information_status:'explicit',disposition:side,
  semantic_role:side?'eligibility_condition':'review_focus',scope_status:side?'restricted':'unspecified'});
 const elements=[candidate('p','population','term or late preterm infants'),candidate('p2','population','received respiratory support at birth'),
  candidate('i','intervention',objective),candidate('c','comparator',objective),candidate('d','study_design','randomised controlled trials (RCTs), quasi‐RCTs or cluster‐RCTs'),
  candidate('target','study_design','studies of oxygen saturation targeting','exclude'),
  candidate('room','population','delivery room'),candidate('anomaly','population','infants with antenatally diagnosed congenital anomalies','exclude'),
  candidate('o1','outcome','mortality',null),candidate('o2','outcome','long‐term neurodevelopmental impairment (NDI)',null),candidate('o3','outcome',outcomes[0],null)];
 const adapter={async request(step,project,payload){
  if(step==='extract_elements')return {questions:[{question_id:state.questions[0].question_id,review_topic:'Interventions in term or late preterm infants',framework_candidates:['picos'],issues:[],elements,
   logic:{op:'all_of',children:elements.filter(e=>e.disposition==='include').map(e=>({op:'predicate',element_id:e.candidate_id}))}}]};
  assert.equal(step,'review_normalization');
  return {items:payload.items.map(({id,semantic_role,scope_status,disposition,information_status})=>({id,semantic_role,scope_status,disposition,information_status,status:'supported',issue_type:'none',reason:'Fixture source assessment.'}))};
 }};
 const analyzed=await M.analyze(state,E.environment(),adapter);
 const project=E.ingest_candidates(state,analyzed.candidates).state;
 const view=B.projectToClassic(project);
 assert.equal(view.reviewTopic,'Air for resuscitation of term or late preterm infants at birth');
 const included=name=>view.rows.find(r=>r.dimension===name).include;
 assert.deepEqual(included('Population'),['term and late preterm infants who received respiratory support at birth']);
 assert.deepEqual(included('Intervention'),['air']);
 assert.deepEqual(included('Comparison'),['any supplemental oxygen']);
 assert.equal(view.rows.flatMap(r=>r.exclude).length,2);
 assert.deepEqual(view.rows.find(r=>r.dimension==='Intervention').exclude,['studies of oxygen saturation targeting']);
 assert.deepEqual(view.rows.find(r=>r.dimension==='Study design').exclude,[]);
 assert.deepEqual(included('Study design'),['randomised controlled trials (RCTs), quasi‐RCTs or cluster‐RCTs']);
 assert(!project.criteria.some(c=>/titrated to saturation targets/.test(c.text)));
 assert(!view.rows.some(r=>r.dimension==='Outcomes'));
 assert.deepEqual(view.rows.find(r=>r.dimension==='Population').exclude.map(s=>s.includes('antenatally diagnosed congenital anomalies')),[true]);
 assert.doesNotMatch(view.manuscriptParagraph,/delivery room|income of the study country|(?:required|must report)[^.]*mortality/i);
 assert.match(view.manuscriptParagraph,/mortality prior to discharge/i);
 assert(!view.manuscriptParagraph.includes('We will include studies comparing To assess'));
 if(process.argv.includes('--show'))console.log(view.reviewTopic+'\n'+view.manuscriptParagraph);
});

test('an outcome list in the question preserves separate source and author requirements',()=>{
 const primary={source_id:'q',source_revision:1,start:0,end:declaration.length,quote:declaration};
 const extra={source_id:'attachment',source_revision:1,start:0,end:4,quote:'pain'};
 const element={dimension_id:'outcome',information_status:'explicit',normalized_text:'pain',source_refs:[extra]};
 const project={questions:[{question_id:'q',source_refs:[primary]}]};
 const render=(question,focus)=>Methods.descriptionContext({question_id:'q',research_question:question,focus,elements:focus},project).focus_sentence;
 assert.match(render(declaration,[element]),/best available data\. We will assess pain/);
 assert.match(render(declaration,[{...element,decision_status:'confirmed_by_user'}]),/best available data\. We will assess pain/);
 assert.equal(render(declaration,[{...element,source_refs:[primary,extra],decision_status:'confirmed_by_user'}]),'We will assess pain.');
 assert.equal(render('Our outcomes of interest were not reported.',[]),'');
 assert.equal(render('Trials must report mortality.',[]),'');
});

test('only join qualifications with a single unambiguous population antecedent',()=>{
 const unit=text=>({text,node:{op:'predicate'},criteria:[{dimension_id:'population'}]});
 for(const head of ['adults with COPD or infants with bronchopulmonary dysplasia','Children and adolescents']){
  const separate=[unit(head),unit('received respiratory support')];
  assert.deepEqual(Methods.combinePopulationUnits(separate),separate);
 }
 const qualified=[unit('infants'),unit('received oxygen')];
 qualified[1].criteria[0].exceptions=['during transport'];
 assert.deepEqual(Methods.combinePopulationUnits(qualified),qualified);
});
