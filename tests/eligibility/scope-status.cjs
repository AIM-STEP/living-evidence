const assert=require('node:assert/strict'),E=require('../../app/eligibility/engine.js');
function project(text){return E.save_input(E.create_project('scope-label-regression'),{research_question:text,question_framework:'PICO',output_language:'en'}).state;}
function run(text,dimension,quote,extra={}){
 const s=project(text),q=s.questions[0],source=s.sources.find(s=>s.source_id===q.source_refs[0].source_id);
 const candidate={candidate_id:'scope',dimension_id:dimension,normalized_text:quote,structured_value:null,source_refs:quote?[E.ref(source,quote)]:[],semantic_role:'eligibility_condition',information_status:quote?'explicit':'missing',scope_status:'unrestricted',disposition:'include',semantic_review:{status:'supported'},...extra};
 const state=E.ingest_candidates(s,{questions:[{question_id:q.question_id,framework_candidates:[{framework_id:'pico'}],elements:[candidate],issues:[]}]}).state;
 return {state,element:state.elements.find(e=>e.original_candidate_key)};
}
let r=run('Adults with diabetes.','population','Adults with diabetes');
assert.equal(r.element.scope_status,'restricted');assert.equal(r.element.decision_status,'accepted_from_input');assert(r.state.criteria.some(c=>c.text==='Adults with diabetes'));assert(!r.state.issues.some(i=>i.status==='open'));
assert(r.element.metadata_corrections.some(c=>c.from==='unrestricted'&&c.to==='restricted'));
r=run('Adults with diabetes.','population','Adults with diabetes',{normalized_text:'No restrictions'});assert.equal(r.element.normalized_text,'Adults with diabetes');assert.equal(r.element.scope_status,'restricted');
r=run('Adults with diabetes.','language','');assert.equal(r.element.scope_status,'unspecified');assert(!r.state.criteria.some(c=>c.dimension_id==='language'));
r=run('Any language.','language','Any language');assert.equal(r.element.scope_status,'unrestricted');assert(!r.state.criteria.some(c=>c.dimension_id==='language'));
r=run('Assess pain.','outcome','pain',{semantic_role:'review_focus',disposition:null});assert.equal(r.element.scope_status,'unspecified');assert(!r.state.criteria.some(c=>c.dimension_id==='outcome'));
console.log('PASS: unsupported unrestricted metadata repaired without inference; absent scope, explicit waivers and review focus remain distinct');
