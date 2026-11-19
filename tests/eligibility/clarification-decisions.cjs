const assert=require('node:assert/strict');
const D=require('../../app/eligibility/domain.js');
const E=require('../../app/eligibility/engine.js');
const B=require('../../app/eligibility/background.js');
const Methods=require('../../app/eligibility/methodology.js');
const {setup}=require('../../tools/test_eligibility_grounding.cjs');

const wording='Adults at risk of malnutrition or with established malnutrition';
const state=E.save_input(E.create_project('confirmations'),{research_question:wording+'.',additional_requirements:[wording+'.'],question_framework:'PICO',output_language:'en'}).state;
const q=state.questions[0],source=D.sourceAt(state,q.source_refs[0]),note=D.sourceAt(state,q.additional_source_refs[0]);
const element=(candidate_id,src)=>({candidate_id,dimension_id:'population',normalized_text:wording,source_refs:[E.ref(src,wording)],structured_value:null,scope_status:'restricted',information_status:'explicit',semantic_role:'eligibility_condition',disposition:'include',semantic_review:{status:'supported'}});
const risk='Which assessment defines nutritional risk?',diagnosis='Which criteria establish a diagnosis of malnutrition?';
const options=['Use the assessment specified by each study','Use a validated screening instrument'];
const issue=(question_text,element_candidate_ids,options=[])=>({question_text,element_candidate_ids,options,scope_impact:'Defines the eligible population.',reason_code:'AMBIGUOUS_MEANING'});
const response={questions:[{question_id:q.question_id,framework_candidates:[],elements:[element('first',source),element('second',note)],logic:{op:'any_of',children:[{op:'predicate',element_id:'first'},{op:'predicate',element_id:'second'}]},issues:[
 issue(risk,['first'],[options[0]]),
 issue('What assessment tool should be used to define nutritional risk?',['second'],[options[1]]),
 issue(diagnosis,['first'])
]}]};
const calls={},originals={};let generated;
try{
 for(const name of ['normalizeComparators','topic']){
  calls[name]=0;originals[name]=Methods[name];Methods[name]=(...args)=>{calls[name]++;return originals[name](...args);};
 }
 generated=E.ingest_candidates(state,response).state;
}finally{Object.assign(Methods,originals);}
assert.deepEqual(calls,{normalizeComparators:1,topic:1},'Each question is normalized and titled once on initial ingestion.');
const opened=s=>s.issues.filter(i=>i.status==='open'&&i.blocking);
const clarification=opened(generated).find(i=>i.question_text===risk);
assert.equal(opened(generated).length,2,'Independent decisions about risk and diagnosis survive the shared population binding.');
assert.equal(clarification.element_ids.length,2);
assert.deepEqual(clarification.options.map(o=>o.label),options);
assert(clarification.options.every(o=>o.requires_interpretation));
const displayed=B.projectToClassic(generated).sourceConfirmations.find(c=>c.issue_id===clarification.issue_id);
assert.deepEqual(new Set(displayed.evidence.map(ref=>ref.source_id)),new Set([source.source_id,note.source_id]));
const after=E.apply_decisions(generated,{request_id:'risk',answers:[{issue_id:clarification.issue_id,answer_text:wording,updates:[{element_id:clarification.element_ids[0],normalized_text:wording}]}]}).state;
assert.equal(opened(after).length,1);
assert.equal(opened(after)[0].question_text,diagnosis);
assert(clarification.element_ids.every(id=>after.elements.find(e=>e.element_id===id).decision_status==='confirmed_by_user'));
const copy=structuredClone(after);
const old=copy.issues.find(issue=>issue.issue_id===clarification.issue_id);
copy.questions[0].model_issues=copy.questions[0].model_issues.filter(issue=>issue.question_text===risk||issue.question_text===diagnosis);
old.element_ids=old.element_ids.slice(0,1);old.trigger_rule_id='model_issue:'+D.key(risk);
old.signature=[q.question_id,old.reason_code,old.trigger_rule_id,old.element_ids[0]].join('|');
E.rebuild(copy);
assert.equal(opened(copy).length,1,'Existing author answers stay resolved when upgrading saved issue IDs.');
assert.equal(copy.issues.find(i=>i.issue_id===old.issue_id).resolved_by_decision_id,after.decisions.at(-1).decision_id);

const ageText='Age at least 80 years. Age below 50 years.';
const boundsState=E.save_input(E.create_project('alternative-bounds'),{research_question:ageText,question_framework:'PICO',output_language:'en'}).state;
const boundsQuestion=boundsState.questions[0],boundsSource=D.sourceAt(boundsState,boundsQuestion.source_refs[0]);
const bound=(id,quote,operator,value)=>({...element(id,source),dimension_id:'population.age',normalized_text:quote,structured_value:{operator,value,unit:'year'},source_refs:[E.ref(boundsSource,quote)]});
const boundsResponse={questions:[{question_id:boundsQuestion.question_id,framework_candidates:[],elements:[bound('older','Age at least 80 years','gte',80),bound('younger','Age below 50 years','lt',50)],issues:[],logic:null,unresolved_fragment_logic:{branches:['older','younger'].map(element_id=>({op:'predicate',element_id}))}}]};
const bounds=E.ingest_candidates(boundsState,boundsResponse).state;
const grouping=opened(bounds).find(i=>i.trigger_rule_id.startsWith('fragment_relation:'));
assert(grouping);
assert(!opened(bounds).some(i=>i.reason_code==='CONFLICTING_REQUIREMENTS'),'Alternative ranges from separate passages are not initially presumed inconsistent.');
const draft=B.projectToClassic(bounds);
assert.equal(draft.rows.find(row=>row.dimension==='Population').include.length,2);
assert(!/80|50/.test(draft.manuscriptParagraph),'Pending alternatives are not written as joint eligibility in Description.');
for(const op of ['any_of','all_of']){
 const decided=E.apply_decisions(bounds,{request_id:op,answers:[{issue_id:grouping.issue_id,option_id:op,answer_text:op}]}).state;
 assert.equal(opened(decided).some(i=>i.reason_code==='CONFLICTING_REQUIREMENTS'),op==='all_of');
 const regenerated=E.ingest_candidates(decided,boundsResponse).state;
 assert.equal(regenerated.questions[0].logic.op,op);
 assert(!opened(regenerated).some(i=>i.trigger_rule_id.startsWith('fragment_relation:')));
}

const t=setup(),ui=t.api.state(),steps='aimstep-setup-completed:synthetic-grounding';
ui.question='Adults';ui.activeGenerator=ui.generationMethodChoice='machine';
ui.machineCriteria=[{id:'INC-001',title:'Population',condition:'Adults',uncertain:'',definition:''}];
ui.machineRun={question:'Adults',reviewType:ui.reviewType,sourceRevision:0};
ui.machineRefinement={rows:[{dimension:'Population',include:['Adults'],exclude:[]}],signature:t.api.signature('Adults',ui.reviewType,0,ui.machineCriteria),sourceConfirmations:[{status:'suggested',backgroundIssue:true,text:'Which age?',options:[],domain:'Population',locations:[] }],uncertainties:[]};
t.api.fill();t.storage.set(steps,'[1,4]');
const click={preventDefault(){assert.fail('Draft navigation must remain available.');}};
t.api.navigate(click);
assert.deepEqual(JSON.parse(t.storage.get(steps)),[4],'Open required decisions revoke a stale completion flag without affecting other modules.');
ui.machineRefinement.sourceConfirmations[0].reviewOnly=true;
ui.eligibilityV3Snapshot={issues:[{status:'open',blocking:true}]};
t.api.navigate(click);
assert.deepEqual(JSON.parse(t.storage.get(steps)),[4],'A saved blocking issue also prevents completion.');
ui.eligibilityV3Snapshot.issues[0].status='resolved';t.api.navigate(click);
assert(JSON.parse(t.storage.get(steps)).includes(1),'An optional suggestion does not block completion.');
console.log('PASS: independent decisions, merged option and source bindings, saved answers and navigation completion.');
