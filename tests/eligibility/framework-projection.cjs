const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../../app/eligibility/engine');
const B=require('../../app/eligibility/background');

const entries=[
 ['population','Adults with asthma'],
 ['intervention','supervised exercise'],
 ['study_design','randomised trials'],
 ['context','primary care clinics'],
 ['other','baseline spirometry'],
 ['other','animal studies','exclude'],
 ['language','Any language','unrestricted'],
 ['other','Home visits were recorded separately','background_information'],
 ['outcome','physical function','review_focus']
];
const evidence=entries.map(([,quote])=>quote+'.').join(' ');
function build(frames){
 const s=E.save_input(E.create_project('framework-display'),{output_language:'en',
  questions:frames.map((frame,i)=>({research_question:'Study '+(i+1)+'. '+evidence,question_framework:frame}))}).state;
 const questions=s.questions.map(q=>{
  const source=s.sources.find(s=>s.source_id===q.source_refs[0].source_id);
  const elements=entries.map(([dimension_id,quote,kind],i)=>({
   candidate_id:'c'+i,dimension_id,normalized_text:quote,structured_value:null,source_refs:[E.ref(source,quote)],
   semantic_role:['review_focus','background_information'].includes(kind)?kind:'eligibility_condition',
   information_status:'explicit',scope_status:kind==='unrestricted'?'unrestricted':'restricted',
   disposition:kind==='exclude'?'exclude':kind==='background_information'||kind==='review_focus'?null:'include',
   semantic_review:{status:'supported'}
  }));
  return {question_id:q.question_id,framework_candidates:[{framework_id:'pico'}],elements,issues:[],logic:null};
 });
 return B.projectToClassic(E.ingest_candidates(s,{questions}).state);
}

test('an explicitly selected framework retains its exact slots and every sourced extra in Description',()=>{
 const picos=build(['PICOs']);
 assert.equal(picos.framework,'PICOS');
 assert.deepEqual(picos.frameworkSlots,['Population','Intervention','Comparison','Outcomes','Study design']);
 for(const text of ['primary care clinics','baseline spirometry','animal studies','any language','Home visits were recorded separately','physical function']){
  assert(picos.manuscriptParagraph.includes(text),text);
 }
 assert.match(picos.manuscriptParagraph,/exclude animal studies/i);
 assert(!/eligibility requires home visits/i.test(picos.manuscriptParagraph));
 assert(picos.rows.some(row=>row.dimension==='Other'),'The downstream screening snapshot keeps explicit extra criteria.');
 assert.deepEqual(build(['PICO']).frameworkSlots,picos.frameworkSlots.slice(0,4));
 assert.deepEqual(build(['PCC']).frameworkSlots,['Population','Concept','Context']);
 assert.equal(build([null]).framework,'PICOS','An inferred PICO with a design still displays as PICOS.');
});

test('each question in a mixed-framework review keeps its own slots, rules and description',()=>{
 const multi=build(['PECOS','PICo']);
 assert.deepEqual(multi.frameworkQuestions.map(q=>q.framework),['PECOS','PICo']);
 assert(!multi.frameworkQuestions[0].frameworkSlots.includes('Context'));
 assert(multi.frameworkQuestions[1].frameworkSlots.includes('Context'));
 assert(multi.descriptionContext.question_contexts.every(q=>q.rows.some(r=>r.dimension==='Context')));
 assert.match(multi.manuscriptParagraph,/For question 1,/);
 assert.match(multi.manuscriptParagraph,/For question 2,/);
});
