const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../../app/eligibility/engine');
const M=require('../../app/eligibility/model');
const B=require('../../app/eligibility/background');
const D=require('../../app/eligibility/domain');
const {setup}=require('../../tools/test_eligibility_grounding.cjs');

const high='high-dose phototherapy, defined as the use of high levels of measured spectral irradiance greater than 30 μW/cmL/nm over the same bandwidth';
const low='low-dose phototherapy, defined as measured levels of spectral irradiance below 30 μW/cmL/nm';
const objective='To assess the eﬀects of high-dose versus low-dose phototherapy on bilirubin level and associated clinical outcomes that constitute the major conditions in kernicterus spectrum disorder (KSD), such as acute bilirubin encephalopathy and kernicterus, as well as cerebral palsy and neurodevelopmental disabilities in infants with hyperbilirubinaemia; and to assess the eﬀects of '+high+', as well as '+low;
const design='randomised controlled trials (RCTs), quasi-RCTs and clustered RCTs';
const population="term (≥ 37 weeks' gestation) and preterm (˂ 37 weeks' gestation) infants with hyperbilirubinaemia, and requiring any type of phototherapy";
const outcomes='Our critical outcomes were incidence of acute bilirubin encephalopathy and kernicterus, the proportion of infants with moderate or severe cerebral palsy, all-cause mortality before discharge and serum bilirubin levels at the latest periods of measurements, which included 24, 48 and 72 hours aOer treatment commencement.';
const question=objective+'. We included '+design+' of '+population+'. We compared high- to low-dose phototherapy. Highand low-dose phototherapy are achieved in various ways: by the use of multiple devices; diﬀerent levels of light intensity (irradiance); or positioning of the devices closer to the skin. We compared these diﬀerent methods of delivering phototherapy to each other. We specified no exclusion criteria for the infants. We excluded cross-over studies. '+outcomes;

test('separate the copied objective from the enrolled population and critical outcomes',async()=>{
 const state=E.save_input(E.create_project('phototherapy'),{research_question:question,question_framework:'PICOS',output_language:'en'}).state;
 const q=state.questions[0],source=state.sources.find(s=>s.input_kind==='research_question');
 const element=(candidate_id,dimension_id,quote,normalized_text=quote)=>({candidate_id,dimension_id,normalized_text,
  source_refs:[E.ref(source,quote)],information_status:'explicit',semantic_role:'eligibility_condition',
  disposition:'include',scope_status:'restricted',structured_value:null});
 const elements=[element('p','population',objective),element('i','intervention',high,'high-dose phototherapy (spectral irradiance >30 μW/cmL/nm)'),
  element('c','comparator',low,'low-dose phototherapy (spectral irradiance <30 μW/cmL/nm)'),element('d','study_design',design),
  element('outcome','outcome',objective),element('o1','outcome','acute bilirubin encephalopathy and kernicterus','incidence of acute bilirubin encephalopathy and kernicterus'),
  element('o2','outcome','cerebral palsy and neurodevelopmental disabilities','incidence of cerebral palsy and neurodevelopmental disabilities')];
 const logic={op:'all_of',children:[...elements.slice(0,4).map(e=>({op:'predicate',element_id:e.candidate_id})),
  {op:'any_of',children:elements.slice(4).map(e=>({op:'predicate',element_id:e.candidate_id}))}]};
 const steps=[];
 const adapter={async request(step,project,payload){
  steps.push(step);
  if(step==='extract_elements')return {questions:[{question_id:q.question_id,review_topic:'The effects of high-dose versus low-dose phototherapy on bilirubin and related outcomes',
   framework_candidates:['picos'],issues:[],elements:structuredClone(elements),logic:structuredClone(logic)}]};
  assert.equal(step,'review_normalization');
  assert(payload.items.every(e=>e.dimension_id!=='outcome'&&!e.normalized_text.startsWith('To assess')));
  return {items:payload.items.map(e=>({...e,status:'supported',issue_type:'none',reason:'Fixture source assessment.'}))};
 }};
 const {candidates}=await M.analyze(state,E.environment(),adapter,{retries:0});
 const project=E.ingest_candidates(state,candidates).state,view=B.projectToClassic(project);
 if(process.argv.includes('--show'))console.log(view.reviewTopic,view.rows,view.descriptionContext.outcome_groups,view.manuscriptParagraph);
 assert.deepEqual(steps,['extract_elements','review_normalization']);
 assert.equal(view.reviewTopic,'High-dose phototherapy in infants with hyperbilirubinaemia');
 const row=dimension=>view.rows.find(r=>r.dimension===dimension);
 assert.deepEqual(row('Population').include,["term (≥37 weeks' gestation) and preterm (<37 weeks' gestation) infants with hyperbilirubinaemia who required any type of phototherapy"]);
 assert.match(row('Intervention').include[0],/>30 μW\/cmL\/nm over the same bandwidth/);
 assert.match(row('Comparison').include[0],/<30 μW\/cmL\/nm/);
 assert.match(row('Study design').include[0],/cluster-randomised controlled trials/);
 assert.deepEqual(row('Study design').exclude,['cross-over studies']);
 assert.deepEqual(project.criteria.filter(c=>c.dimension_id==='outcome'),[]);
 assert.deepEqual(view.sourceConfirmations,[]);
 const [critical]=view.descriptionContext.outcome_groups;
 assert.equal(critical.label,'Critical');
 assert.equal(critical.items.length,4);
 assert.match(critical.items.at(-1),/24, 48 and 72 hours after treatment began/);
 assert.match(view.manuscriptParagraph,/compared methods of delivering phototherapy directly/i);
 assert.match(view.manuscriptParagraph,/no additional participant-level exclusions/i);
 assert.doesNotMatch(view.manuscriptParagraph,/required outcome|To assess/);
 const page=setup(),workspace=page.api.state();
 const machineCriteria=view.rows.map(row=>({title:row.dimension,condition:row.include.join('\n'),uncertain:row.exclude.join('\n')}));
 Object.assign(workspace,{question,framework:view.framework,generationMethodChoice:'machine',activeGenerator:'machine',machineCriteria,
  machineRun:{question,reviewType:workspace.reviewType},machineRefinement:{...view,signature:page.api.signature(question,workspace.reviewType,0,machineCriteria)}});
 page.api.fill();
 const markup=page.el('preview').innerHTML;
 assert.match(markup,/Outcomes:<\/strong> 1\.incidence of acute bilirubin encephalopathy and kernicterus/);
 assert(markup.includes('；4.serum bilirubin levels'));
 assert(!markup.includes('To assess'));

 const accepted=elements.map(e=>({...e,semantic_review:{status:'supported'}}));
 const prior=E.ingest_candidates(state,{questions:[{question_id:q.question_id,review_topic:objective,framework_candidates:['picos'],
  elements:accepted,logic,issues:[],eligibility_policy:'framework-only-v1'}]}).state;
 assert.equal(M.repairSavedExtraction(prior,prior.questions[0]),true);
 E.rebuild(prior);
 const repaired=B.projectToClassic(prior);
 assert.equal(repaired.reviewTopic,view.reviewTopic);
 assert.deepEqual(repaired.rows.find(r=>r.dimension==='Population').include,row('Population').include);
 assert(!prior.criteria.some(c=>c.dimension_id==='outcome'));

 assert.throws(()=>D.check_semantics({normalized_text:'irradiance >30 μW/cm²/nm',dimension_id:'intervention'},
  [{quote:high}]),{code:'NUMERIC_SCOPE_CHANGE'});
 assert.throws(()=>D.check_semantics({normalized_text:'preterm (≤37 weeks)',dimension_id:'population'},
  [{quote:population}]),{code:'NUMERIC_SCOPE_CHANGE'});
});
