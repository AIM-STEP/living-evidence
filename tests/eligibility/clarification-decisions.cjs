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
 {...issue('What assessment tool should be used to define nutritional risk?',['second'],[options[1]]),scope_impact:'Changes which patients can enter the review.'},
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
const after=E.apply_decisions(generated,{request_id:'risk',answers:[{issue_id:clarification.issue_id,answer_text:wording+' as assessed by each study',updates:[{element_id:clarification.element_ids[0],normalized_text:wording+' as assessed by each study'}]}]}).state;
assert.equal(opened(after).length,1);
assert.equal(opened(after)[0].question_text,diagnosis);
assert(clarification.element_ids.every(id=>after.elements.find(e=>e.element_id===id).decision_status==='confirmed_by_user'));
const repeated=E.ingest_candidates(after,response).state;
assert.deepEqual(opened(repeated).map(issue=>issue.question_text),[diagnosis],'New wording confirmed by the author does not revive the same decision on regeneration.');
const copy=structuredClone(after);
const old=copy.issues.find(issue=>issue.issue_id===clarification.issue_id);
copy.questions[0].model_issues=copy.questions[0].model_issues.filter(issue=>issue.question_text===risk||issue.question_text===diagnosis);
old.element_ids=old.element_ids.slice(0,1);old.trigger_rule_id='model_issue:'+D.key(risk);
old.signature=[q.question_id,old.reason_code,old.trigger_rule_id,old.element_ids[0]].join('|');
E.rebuild(copy);
assert.equal(opened(copy).length,1,'Existing author answers stay resolved when upgrading saved issue IDs.');
assert.equal(copy.issues.find(i=>i.issue_id===old.issue_id).resolved_by_decision_id,after.decisions.at(-1).decision_id);
const previous=structuredClone(after),answered=previous.issues.find(i=>i.issue_id===clarification.issue_id);
const previousScope=[...new Set(answered.element_ids.map(id=>previous.elements.find(e=>e.element_id===id).source_decision_target.key))].sort();
answered.scope_impact='Older description of how inclusion changes.';
const oldIdentity=JSON.stringify(['what assessment define nutritional risk',D.key(answered.scope_impact),previousScope,false]);
answered.trigger_rule_id='model_issue:'+D.stableId('decision',oldIdentity);
answered.signature=[q.question_id,answered.reason_code,answered.trigger_rule_id,answered.element_ids.slice().sort().join(',')].join('|');
E.rebuild(previous);
assert.deepEqual(opened(previous).map(i=>i.question_text),[diagnosis],'A saved hashed ID stays resolved when a later extraction paraphrases its impact.');

const explicitText='Adults with COPD or asthma aged at least 65 years receive exercise. Outcomes: pneumonia. We will use network meta-analysis.';
const explicit=E.save_input(E.create_project('stated-criteria'),{research_question:explicitText,question_framework:'PICO',output_language:'en'}).state;
const explicitQ=explicit.questions[0],explicitSource=D.sourceAt(explicit,explicitQ.source_refs[0]);
const stated=(candidate_id,dimension_id,quote,extra={})=>({...response.questions[0].elements[0],candidate_id,dimension_id,normalized_text:quote,source_refs:[E.ref(explicitSource,quote)],...extra});
const focus={semantic_role:'review_focus',scope_status:'unspecified',disposition:null};
const noise=[
 issue('What minimum age defines older adults?',['age']),
 issue('What tool should measure pneumonia?',['outcome']),
 issue('Which model should be used for network meta-analysis?',['plan']),
 {...issue('Should there be a language restriction?',['population']),reason_code:'MISSING_REQUIRED_DECISION'},
 {...issue('Are there any publication date restrictions?',['population']),reason_code:'MISSING_REQUIRED_DECISION'},
];
const direct={question_id:explicitQ.question_id,framework_candidates:[],elements:[
 stated('population','population','Adults with COPD or asthma'),stated('age','population.age','aged at least 65 years',{structured_value:{operator:'gte',value:65,unit:'year'}}),
 stated('intervention','intervention','exercise'),stated('outcome','outcome','pneumonia',focus),stated('plan','analysis_method','network meta-analysis',focus)
],issues:noise,logic:{op:'all_of',children:['population','age','intervention'].map(element_id=>({op:'predicate',element_id}))}};
const clearResult=E.ingest_candidates(explicit,{questions:[direct]}).state;
assert.deepEqual(opened(clearResult).map(i=>i.question_text),[],'A stated minimum age, internal population alternatives and analysis details need no author decision.');
assert(clearResult.criteria.some(c=>c.text==='Adults with COPD or asthma'));
assert.equal(clearResult.elements.find(e=>e.dimension_id==='language').scope_status,'unspecified');
const mixed=structuredClone(direct);
mixed.elements[0].normalized_text='Adults with COPD';
mixed.issues.push(issue('Should a mixed-age sample qualify?',['age']));
const retained=opened(E.ingest_candidates(explicit,{questions:[mixed]}).state);
assert(retained.some(i=>i.trigger_rule_id==='source_or_relation'),'An alternative lost from the predicate still requires clarification.');
assert(retained.some(i=>i.question_text==='Should a mixed-age sample qualify?'),'An explicit threshold cannot decide the scope for a mixed-age sample.');
const arm='exercise‐based CR (exercise training alone or combined with psychosocial/educational interventions)';
const objective="To assess the clinical and cost‐effectiveness of "+arm+" compared with 'no exercise' control, on mortality in people with CHD.";
const rehab=E.save_input(E.create_project('rehabilitation'),{research_question:objective,question_framework:'PICO',output_language:'en'}).state;
const rq=rehab.questions[0],rs=D.sourceAt(rehab,rq.source_refs[0]);
const clinicalArm=(id,dimension,text)=>({...direct.elements[0],candidate_id:id,dimension_id:dimension,normalized_text:text,source_refs:[E.ref(rs,objective)]});
const rehabQuestion={question_id:rq.question_id,framework_candidates:[],eligibility_policy:'framework-only-v1',elements:[
 clinicalArm('exercise','intervention',arm.replace('exercise‐based','Exercise-based')),
 clinicalArm('control','comparator',"'no exercise' control")
],issues:[],logic:{op:'all_of',children:['exercise','control'].map(element_id=>({op:'predicate',element_id}))}};
assert(!opened(E.ingest_candidates(rehab,{questions:[rehabQuestion]}).state).some(i=>i.trigger_rule_id==='source_or_relation'),'The variants within exercise-based CR are already preserved in the intervention.');
rehabQuestion.elements[0].normalized_text='Exercise-based CR (exercise training alone)';
assert(opened(E.ingest_candidates(rehab,{questions:[rehabQuestion]}).state).some(i=>i.trigger_rule_id==='source_or_relation'),'Losing the combined intervention still requires review.');
const withNote=structuredClone(explicit);
const separated='We included adults with asthma who received exercise. We excluded case reports or animal studies. Our outcomes of interest were cough or wheezing.';
const separate=E.save_input(E.create_project('separate-eligibility'),{research_question:separated,question_framework:'PICO',output_language:'en'}).state;
const sq=separate.questions[0],ss=D.sourceAt(separate,sq.source_refs[0]);
const separateCriteria={...rehabQuestion,question_id:sq.question_id,elements:[
 {...clinicalArm('exercise','intervention','exercise'),source_refs:[E.ref(ss,separated)]},
 {...clinicalArm('control','population','adults with asthma'),source_refs:[E.ref(ss,separated)]}
]};
assert(!opened(E.ingest_candidates(separate,{questions:[separateCriteria]}).state).some(i=>i.trigger_rule_id==='source_or_relation'),
 'Alternatives in a separate exclusion or outcome list cannot make inclusion conditions alternatives.');
// Source conditions in additional notes must also protect a genuine language decision.
const noteSource={...explicitSource,source_id:'language-note',source_type:'additional_requirement',original_text:'Languages of publication will depend on translation availability.'};
withNote.sources.push(noteSource);
withNote.questions[0].additional_source_refs.push(E.ref(noteSource));
assert(opened(E.ingest_candidates(withNote,{questions:[direct]}).state).some(i=>i.question_text==='Should there be a language restriction?'));

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
(async()=>{
 const values=new Map(),storage={getItem:key=>values.get(key)||null};
 const service=await B.create({projectId:'confirmations',storage,baseURL:'http://localhost/',frameworkConfig:require('../../config/eligibility-frameworks.json'),profileConfig:require('../../config/eligibility-review-profiles.json')});
 values.set(service.keys.project,JSON.stringify(generated));
 const option=clarification.options[0];
 const modelClient={async request(){assert.fail('A suggested choice must save without a model call.');}};
 const chosen=await service.decide({issue_id:clarification.issue_id,option_id:option.option_id,modelClient});
 assert.deepEqual(opened(chosen.project).map(issue=>issue.question_text),[diagnosis]);
 const decision=chosen.project.decisions.at(-1);
 assert.deepEqual(decision.issue_ids,[clarification.issue_id]);
 assert.equal(decision.answer_text,option.label);
 assert.equal(D.sourceAt(chosen.project,decision.source_ref).original_text,option.label);
 values.set(service.keys.project,JSON.stringify(chosen.project));
 const diagnosisIssue=opened(chosen.project)[0];
 const diagnosisAnswer='Include people diagnosed using the Global Leadership Initiative on Malnutrition criteria.';
 const completed=(await service.decide({issue_id:diagnosisIssue.issue_id,answer_text:diagnosisAnswer,modelClient})).project;
 assert.deepEqual(opened(completed),[]);
 const population=completed.elements.find(e=>e.element_id===diagnosisIssue.element_ids[0]);
 assert(population.normalized_text.includes(wording));
 assert(population.normalized_text.includes(option.label),'The earlier risk definition survives the subsequent diagnosis answer.');
 assert(population.normalized_text.includes(diagnosisAnswer));
 const sources=population.source_refs.map(ref=>D.sourceAt(completed,ref)).filter(s=>s.source_type==='human_answer');
 assert(sources.some(s=>s.original_text===option.label)&&sources.some(s=>s.original_text===diagnosisAnswer));
 const regenerated=E.ingest_candidates(completed,response).state;
 assert(!B.projectToClassic(regenerated).sourceConfirmations.some(c=>[risk,diagnosis].includes(c.text)));
 assert(regenerated.elements.some(e=>e.active!==false&&e.normalized_text?.includes(option.label)&&e.normalized_text.includes(diagnosisAnswer)));
 const exception='Exclude people without a confirmed clinical diagnosis.';
 const excepted=(await service.decide({issue_id:diagnosisIssue.issue_id,answer_text:exception,modelClient})).project;
 const retained=excepted.elements.find(e=>e.element_id===diagnosisIssue.element_ids[0]);
 assert.equal(retained.disposition,'include','A narrower exception must not reverse the entire population rule.');
 assert(retained.normalized_text.includes(wording)&&retained.normalized_text.includes(option.label)&&retained.normalized_text.includes(exception));
 console.log('PASS: distinct and merged human decisions, source bindings, selected answer application, pending navigation and cross-branch bounds.');
})().catch(error=>{console.error(error);process.exitCode=1;});
