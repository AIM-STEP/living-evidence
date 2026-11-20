const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../../app/eligibility/engine');
const M=require('../../app/eligibility/model');
const B=require('../../app/eligibility/background');
const {setup}=require('../../tools/test_eligibility_grounding.cjs');

const aim='To assess the long‐term effects of prolonged use (at least one year) of hormone therapy on mortality, cardiovascular outcomes, cancer, gallbladder disease, fractures and cognition in perimenopausal and postmenopausal women.';
const trial='We included randomised, double‐blind trials in which peri‐ or postmenopausal women took hormone therapy or placebo for at least one year.';
const formulations='We included various oestrogen formulations, with or without progestogens.';
const focus="We focused on studies assessing hormone therapy's effects on long‐term clinical outcomes, including death, coronary events and cancer.";
const boundary="Hormone therapy's efficacy in managing menopausal symptoms was beyond the scope of this review, and is assessed in other Cochrane reviews.";
const population='perimenopausal and postmenopausal women';
const outcomes=['mortality','cardiovascular outcomes','cancer','gallbladder disease','fractures','cognition'];
const text=[aim,trial,formulations,focus,boundary].join(' ');

async function generate(question,additional=[]){
 const input=E.save_input(E.create_project('hormone-therapy'),{research_question:question,question_type:'intervention_effect',output_language:'en'}).state;
 const source=input.sources.find(s=>s.input_kind==='research_question');
 const records=[
  ['population',population],['intervention',aim],['intervention','oestrogen formulations, with or without progestogens'],
  ['intervention','prolonged use (at least one year)'],['comparator','placebo'],['study_design','randomised, double‐blind trials'],
  ['outcome','efficacy in managing menopausal symptoms','exclude'],...additional
 ];
 const elements=records.map(([dimension_id,normalized_text,disposition='include',quote=normalized_text],i)=>({
  candidate_id:'c'+i,dimension_id,normalized_text,disposition,source_refs:[E.ref(source,quote)],
  information_status:'explicit',semantic_role:'eligibility_condition',scope_status:'restricted',structured_value:null
 }));
 const adapter={async request(step,project,payload){
  if(step==='extract_elements')return {questions:[{question_id:input.questions[0].question_id,review_topic:aim,framework_candidates:['picos'],
   elements,issues:[],logic:{op:'all_of',children:elements.filter(e=>e.disposition==='include').map(e=>({op:'predicate',element_id:e.candidate_id}))}}]};
  assert.equal(step,'review_normalization');
  return {items:payload.items.map(e=>({...e,status:'supported',issue_type:'none',reason:'Simulated reviewer acceptance.'}))};
 }};
 const {candidates}=await M.analyze(input,E.environment(),adapter,{retries:0});
 const project=E.ingest_candidates(input,candidates).state;
 return {project,view:B.projectToClassic(project)};
}

test('separate the treatment, its qualifiers, clinical outcomes and review scope',async()=>{
 const {project,view}=await generate(text);
 if(process.argv.includes('--show'))console.log(view.reviewTopic+'\n'+JSON.stringify(view.rows)+'\n'+JSON.stringify(view.descriptionContext.outcome_groups)+'\n'+view.manuscriptParagraph);
 assert.match(view.reviewTopic,/hormone therapy/i);
 assert.match(view.reviewTopic,/menopausal women/i);
 assert(view.reviewTopic.split(/\s+/u).length<=15,view.reviewTopic);
 assert.doesNotMatch(view.reviewTopic,/assess|mortality|placebo|formulations|\//i);
 const include=dimension=>view.rows.find(row=>row.dimension===dimension)?.include.join(' ')||'';
 const intervention=include('Intervention');
 assert.match(intervention,/hormone therapy/i);
 assert.match(intervention,/oestrogen formulations/i);
 assert.match(intervention,/with or without progestogens/i);
 assert.doesNotMatch(intervention,/to assess|mortality|cognition|menopausal women/i);
 assert.match(include('Population'),/menopausal women/i);
 assert.match(include('Comparison'),/^placebo(?: for at least (?:one|1) year)?$/i);
 assert.match(include('Study design'),/randomised,? double[‐‑– -]blind trials/i);
 assert.deepEqual(view.rows.flatMap(row=>row.exclude),[]);
 assert(!project.criteria.some(c=>c.disposition==='exclude'||c.dimension_id==='outcome'));
 assert.deepEqual(view.sourceConfirmations,[]);
 assert.deepEqual(view.pendingLogicRows,[]);
 const items=view.descriptionContext.outcome_groups.flatMap(group=>group.items);
 for(const outcome of outcomes){
  assert.equal(items.filter(item=>item.toLowerCase().includes(outcome)).length,1,outcome);
  assert.match(view.manuscriptParagraph,new RegExp(outcome,'i'));
 }
 assert(!items.some(item=>/menopausal symptoms|^death$|^coronary events$/i.test(item)));
 for(const re of [/hormone therapy/i,/oestrogen/i,/with or without progestogens/i,/placebo/i,/at least (?:one|1) year/i,/long[‐‑– -]term/i,/menopausal women/i,/menopausal symptoms/i]){
  assert.match(view.manuscriptParagraph,re);
 }
 assert.doesNotMatch(view.manuscriptParagraph,/to assess the long|we (?:will )?excluded? (?:the )?efficacy/i);
 const page=setup(),state=page.api.state();
 const machineCriteria=view.rows.map(row=>({title:row.dimension,condition:row.include.join('\n'),uncertain:row.exclude.join('\n')}));
 Object.assign(state,{question:text,framework:view.framework,generationMethodChoice:'machine',activeGenerator:'machine',machineCriteria,
  machineRun:{question:text,reviewType:state.reviewType},machineRefinement:{...view,signature:page.api.signature(text,state.reviewType,0,machineCriteria)}});
 page.api.fill();
 const html=page.el('preview').innerHTML;
 assert.match(html,/>Not reporting\.<\//);
 assert.doesNotMatch(html,/Pending relationship/);
 const outcomeSection=html.slice(html.indexOf('Outcomes:'),html.indexOf('Study design:'));
 outcomes.forEach(outcome=>assert(outcomeSection.toLowerCase().includes(outcome),outcome));
});

test('retain an explicit study exclusion in a question with an outcome scope boundary',async()=>{
 const extra='We excluded trials in women with a history of breast cancer.';
 const {project}=await generate(text+' '+extra,[['population','women with a history of breast cancer','exclude',extra]]);
 const exclusions=project.criteria.filter(c=>c.disposition==='exclude');
 assert(exclusions.some(c=>c.dimension_id==='population'&&/history of breast cancer/i.test(c.text)));
 assert(!exclusions.some(c=>/menopausal symptoms/i.test(c.text)));
});

test('opening a saved v7 machine draft repairs its original citations without generating again',async()=>{
 const state=E.save_input(E.create_project('stored-treatment'),{research_question:text,question_framework:'PICOS',output_language:'en'}).state;
 const q=state.questions[0],source=state.sources.find(s=>s.input_kind==='research_question');
 const records=[['population',population],['intervention',aim],['intervention','oestrogen formulations, with or without progestogens'],
  ['comparator','placebo'],['study_design','randomised, double‐blind trials'],['outcome','efficacy in managing menopausal symptoms']];
 const elements=records.map(([dimension_id,quote],i)=>({candidate_id:'c'+i,dimension_id,normalized_text:quote,
  source_refs:[E.ref(source,quote)],information_status:'explicit',semantic_role:'eligibility_condition',scope_status:'restricted',
  disposition:dimension_id==='outcome'?'exclude':'include',structured_value:null,semantic_review:{status:'supported'}}));
 const project=E.ingest_candidates(state,{questions:[{question_id:q.question_id,review_topic:aim,framework_candidates:['picos'],
  elements,issues:[],eligibility_policy:'framework-only-v1',logic:{op:'all_of',children:elements.map(e=>({op:'predicate',element_id:e.candidate_id}))}}]}).state;
 project.elements.find(e=>e.dimension_id==='outcome').semantic_role='eligibility_condition';
 E.build_criteria(project);
 project.questions[0].review_topic=aim;
 project.presentation_version='framework-display-v7';
 const legacy={activeGenerator:'machine',question:text,framework:'PICOS',machineCriteria:B.projectToClassic(project).rows};
 project.last_published_legacy_signature=B.signature(legacy);
 const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
 const service=await B.create({projectId:project.project_id,storage,frameworkConfig:require('../../config/eligibility-frameworks.json'),
  profileConfig:require('../../config/eligibility-review-profiles.json'),baseURL:'http://localhost/'});
 const store=()=>{storage.setItem(service.keys.project,JSON.stringify(project));storage.setItem(service.keys.legacy,JSON.stringify(legacy));};
 store();
 const stage=service.refreshPresentation(legacy);
 assert.equal(stage.classic.reviewTopic,'Long-term effects of hormone therapy in perimenopausal and postmenopausal women');
 const arm=stage.classic.rows.find(row=>row.dimension==='Intervention').include;
 assert.equal(arm.length,1);assert.match(arm[0],/^hormone therapy.*oestrogen formulations.*at least one year/i);
 assert.deepEqual(stage.classic.rows.flatMap(row=>row.exclude),[]);
 assert.deepEqual(stage.classic.pendingLogicRows,[]);
 assert.deepEqual(stage.classic.sourceConfirmations,[]);
 assert.deepEqual(stage.project.model_calls,project.model_calls);
 service.transaction(stage,()=>{});
 assert.equal(service.refreshPresentation(legacy),null);
 // An affirmative author decision remains authoritative, including its exact wording.
 project.elements.find(e=>e.dimension_id==='intervention').decision_status='confirmed_by_user';
 store();
 assert(service.refreshPresentation(legacy).classic.rows.find(row=>row.dimension==='Intervention').include.some(line=>line.includes('To assess')));
});
