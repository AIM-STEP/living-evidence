const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../../app/eligibility/engine'),M=require('../../app/eligibility/model');

function setup(text,extra=[],lang='en'){
 return E.save_input(E.create_project('source-first'),{research_question:text,additional_requirements:extra,question_framework:'PCC',output_language:lang}).state;
}
const support=items=>({items:items.map(({id,semantic_role,scope_status,disposition,information_status})=>({
 id,semantic_role,scope_status,disposition,information_status,status:'supported',issue_type:'none',reason:'Fixture independent review.'
}))});
function extraction(q,elements){return {questions:[{question_id:q.question_id,framework_candidates:[],elements,issues:[],logic:null}]};}
function item(source,quote){
 return {candidate_id:'p1',dimension_id:'population',normalized_text:quote,structured_value:null,source_refs:[E.ref(source,quote)],semantic_role:'eligibility_condition',scope_status:'restricted',information_status:'explicit',disposition:'include'};
}

test('explicit fields are located in the original before normalization and recovered on the same review',async()=>{
 const question='📋 Which participants are eligible?\nPopulation: adults.\nComparator: standard care.\nOutcomes: quality of life.';
 const state=setup(question),steps=[],lessons=[];
 const {candidates}=await M.analyze(state,E.environment(),{async request(step,state,payload){
  steps.push(step);
  if(step==='extract_elements'){
   const source=payload.question.sources.find(s=>s.input_kind==='research_question');
   const group=payload.source_passages.find(g=>g.source_id===source.source_id);
   assert.equal(payload.extraction_encoding,'compact-elements-v2');
   assert.deepEqual(group.spans.map(([id,start,end,kind])=>[id,Array.from(question).slice(start,end).join(''),kind]),[
    [1,'Population: adults.','population'],[2,'Comparator: standard care.','comparator'],[3,'Outcomes: quality of life.','outcome']
   ]);
   return extraction(payload.question,[item(source,'adults')]);
  }
  const q=payload.items.find(i=>i.dimension_id==='outcome');
  assert.deepEqual([q.normalized_text,q.semantic_role,q.disposition],['quality of life','review_focus',null]);
  return support(payload.items);
 }},{onLesson:lesson=>lessons.push(lesson)});
 assert.deepEqual(steps,['extract_elements','review_normalization']);
 assert(lessons.includes('source_coverage'));
 const project=E.ingest_candidates(state,candidates).state;
 const c=project.elements.find(e=>e.dimension_id==='comparator');
 const m=c.source_mentions[0];
 assert.equal(Array.from(question).slice(m.context_start,m.context_end).join(''),'Comparator: standard care.');
 assert(project.criteria.some(c=>c.dimension_id==='comparator'&&c.text==='standard care'));
 assert(!project.criteria.some(c=>c.dimension_id==='outcome'));
});

test('a unique brief mention keeps the governing negative and heading from an additional source',async()=>{
 const extra='Eligibility exceptions:\nDo not include patients receiving dialysis unless follow-up is complete.';
 const state=setup('Study selection.',[extra]);
 const {candidates}=await M.analyze(state,E.environment(),{async request(step,state,payload){
  if(step==='extract_elements'){
   const source=payload.question.sources.find(s=>s.input_kind==='additional_requirement');
   return extraction(payload.question,[item(source,'patients receiving dialysis')]);
  }
  const [r]=payload.items[0].source_quotes;
  assert.equal(r.context,extra.split('\n')[1]);
  assert.equal(r.heading.quote,'Eligibility exceptions:');
  return support(payload.items.map(i=>({...i,disposition:'exclude'})));
 }});
 assert.equal(candidates.questions[0].elements[0].disposition,'exclude');
});

test('only omitted, untranslated mentions need a wording call before independent review',async()=>{
 const state=setup('What is the population?\n人群：新生儿。'),steps=[];
 const {candidates}=await M.analyze(state,E.environment(),{async request(step,state,payload){
  steps.push(step);
  if(step==='extract_elements')return extraction(payload.question,[]);
  if(step==='repair_candidate_wording'){
   assert.deepEqual(payload.items.map(i=>i.normalized_text),['新生儿']);
   return {items:payload.items.map(({id})=>({id,normalized_text:'newborn infants',structured_value:null}))};
  }
  assert.equal(payload.items[0].normalized_text,'newborn infants');
  assert.equal(payload.items[0].source_quotes[0].quote,'人群：新生儿。');
  return support(payload.items);
 }});
 assert.deepEqual(steps,['extract_elements','repair_candidate_wording','review_normalization']);
 assert.equal(candidates.questions[0].elements[0].semantic_review.status,'supported');
});

test('reported study counts and Results headings never supply fallback inclusion rules',async()=>{
 const text='We included 12 randomised controlled trials involving 430 participants. 纳入了12项研究。\nResults:\nPopulation: adults with pneumonia.';
 const state=setup(text);
 const result=await M.analyze(state,E.environment(),{async request(step,state,payload){
  assert.equal(step,'extract_elements');
  assert(payload.source_passages[0].spans.every(s=>s[3]==='reported_information'));
  return extraction(payload.question,[]);
 }});
 assert.deepEqual(result.candidates.questions[0].elements,[]);
});

test('recover a partially quoted named field without swallowing an adjacent field',async()=>{
 const text='Population: adults with a confirmed diagnosis; Comparator: usual care.';
 const state=setup(text);
 const result=await M.analyze(state,E.environment(),{async request(step,state,payload){
  if(step==='extract_elements'){
   const source=payload.question.sources.find(s=>s.input_kind==='research_question');
   assert.deepEqual(payload.source_passages[0].spans.map(s=>text.slice(s[1],s[2])),['Population: adults with a confirmed diagnosis','Comparator: usual care.']);
   return extraction(payload.question,[item(source,'adults')]);
  }
  return support(payload.items);
 }});
 assert.deepEqual(result.candidates.questions[0].elements.map(e=>[e.dimension_id,e.normalized_text]),[['population','adults with a confirmed diagnosis'],['comparator','usual care']]);
});
