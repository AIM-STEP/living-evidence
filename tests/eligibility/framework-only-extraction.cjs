const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../../app/eligibility/engine');
const M=require('../../app/eligibility/model');

test('check only determinate eligibility in the selected framework and preserve a qualified OR for author review',async()=>{
 const source='We included trials comparing exercise with education in adults or in a community setting. Our outcomes of interest were pain.';
 const state=E.save_input(E.create_project('framework-source'),{research_question:source,question_framework:'PICO',output_language:'en'}).state;
 const original=state.sources.find(s=>s.input_kind==='research_question'),reviewed=[];
 const candidate=(id,dimension,word,role='eligibility_condition')=>({candidate_id:id,dimension_id:dimension,normalized_text:word,source_refs:[E.ref(original,word)],structured_value:null,
  information_status:'explicit',scope_status:role==='review_focus'?'unspecified':'restricted',semantic_role:role,disposition:role==='review_focus'?null:'include'});
 const items=[candidate('p','population','adults'),candidate('s','context','a community setting'),candidate('i','intervention','exercise'),candidate('c','comparator','education'),candidate('o','outcome','pain','review_focus')];
 const adapter={async request(step,project,payload){
  if(step==='extract_elements')return {questions:[{question_id:state.questions[0].question_id,framework_candidates:['pico'],review_topic:'Exercise versus education',elements:items,issues:[],
   logic:{op:'any_of',children:['p','s'].map(element_id=>({op:'predicate',element_id}))}}]};
  assert.equal(step,'review_normalization');
  reviewed.push(...payload.items.map(e=>e.dimension_id));
  return {items:payload.items.map(e=>({...e,status:'supported',issue_type:'none',reason:'Verified.'}))};
 }};
 const {candidates}=await M.analyze(state,E.environment(),adapter),q=candidates.questions[0];
 assert.equal(q.eligibility_policy,'framework-only-v1');
 assert.deepEqual(q.elements.map(e=>e.dimension_id).sort(),['comparator','intervention','population']);
 assert(q.elements.find(e=>e.dimension_id==='population').review_pending);
 assert.deepEqual(reviewed.sort(),['comparator','intervention']);
});
