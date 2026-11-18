const assert=require('node:assert/strict'),E=require('../../app/eligibility/engine.js'),B=require('../../app/eligibility/background.js'),fixture=require('./fixtures/nutrition-ipd-nma.json');
let state=E.save_input(E.create_project('source-scope-completeness'),{research_question:fixture.research_question,question_framework:'PICO',review_method:'systematic_review',output_language:'en'}).state;
const q=state.questions[0],source=state.sources.find(s=>s.source_id===q.source_refs[0].source_id);
const element=(candidate_id,dimension_id,quote,normalized_text=quote,focus=false)=>({candidate_id,dimension_id,normalized_text,structured_value:null,source_refs:[E.ref(source,quote)],semantic_role:focus?'review_focus':'eligibility_condition',information_status:'explicit',scope_status:focus?'unspecified':'restricted',disposition:focus?null:'include',semantic_review:{status:'supported',reason:'Simulated independent review'}});
const candidates={questions:[{question_id:q.question_id,review_topic:'Nutritional interventions in hospitalised older people',framework_candidates:[{framework_id:'pico',basis:'Simulated'}],elements:[
 element('p','population','hospitalised older people at risk of or with established malnutrition'),element('i','intervention','various nutritional interventions','nutritional interventions'),element('c1','comparator','a control group (standard care or placebo)','standard care or placebo'),element('c2','comparator','each other'),element('o','outcome','patient-relevant outcomes','patient-relevant outcomes',true),
 element('nma','study_design','network meta-analysis (NMA) based on individual participant data (IPD)','network meta-analysis (NMA) based on individual participant data (IPD)')],
 logic:{op:'all_of',children:[{op:'predicate',element_id:'p'},{op:'predicate',element_id:'i'},{op:'any_of',children:[{op:'predicate',element_id:'c1'},{op:'predicate',element_id:'c2'}]}]},issues:[]}]};
const originalState=state;
state=E.ingest_candidates(state,candidates).state;
let output=B.projectToClassic(state);
assert(output.rows.find(r=>r.dimension==='Intervention').include.join(' ').includes('nutritional interventions'));
assert(output.rows.find(r=>r.dimension==='Comparison').include.join(' ').includes('standard care, placebo, or another nutritional intervention'));
assert(!output.rows.some(r=>['Other','Outcomes','Study design','Analysis plan','Data plan'].includes(r.dimension)),'Focus and analysis must not become invented eligibility criteria');
for(const dimension of ['Outcomes','Analysis plan','Data plan','Analysis objectives'])assert(output.focusRows.some(r=>r.dimension===dimension&&r.values.length),dimension+' must remain visible');
assert(output.sourceConfirmations.some(c=>c.domain==='Population'&&c.text.includes('age boundary')));
assert(!output.sourceConfirmations.some(c=>['Intervention','Comparison','Outcomes','Analysis plan','Data plan'].includes(c.domain)),'Clearly stated scope needs no checklist confirmation');
assert(output.manuscriptParagraph.includes('that compare nutritional interventions with standard care, placebo, or another nutritional intervention'));
assert(output.manuscriptParagraph.includes('assess patient-relevant outcomes and use individual participant data in a network meta-analysis to compare and rank'));
assert(!/Additional eligibility requirements|Eligible populations were defined|RCT|65 years|oral nutrition/i.test(output.manuscriptParagraph),'Prose must be natural and source-grounded');
const old=structuredClone(state);old.issues.push({issue_id:'old-generic-check',status:'open',author_scope_review:true,blocking:false,trigger_rule_id:'scope_review:intervention_scope',element_ids:[],options:[]});
assert(!B.projectToClassic(old).sourceConfirmations.some(c=>c.issue_id==='old-generic-check'),'Saved blanket checks must not reappear');
E.rebuild(old);assert.equal(old.issues.find(i=>i.issue_id==='old-generic-check').status,'obsolete');
const focusCandidates=structuredClone(candidates);for(const e of focusCandidates.questions[0].elements.filter(e=>['intervention','comparator'].includes(e.dimension_id))){e.semantic_role='review_focus';e.scope_status='unspecified';e.disposition=null;}
const focusProject=E.ingest_candidates(originalState,focusCandidates).state,focusOutput=B.projectToClassic(focusProject);
for(const dimension of ['Intervention','Comparison']){assert(focusOutput.focusRows.some(r=>r.dimension===dimension),'A review-focus classification must not hide '+dimension);assert(focusOutput.sourceConfirmations.some(c=>c.domain===dimension&&!c.reviewOnly),'The eligibility role needs author confirmation');}
assert(focusOutput.manuscriptParagraph.includes('nutritional interventions with standard care, placebo, or another nutritional intervention'),'The summary must retain the source-defined interventions and comparison even when their eligibility role is pending');
console.log('PASS: complete PICO and analysis content, only unresolved source checks, concise active prose, and scope-preserving confirmation');
