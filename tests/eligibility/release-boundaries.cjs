const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Engine=require('../../app/eligibility/engine.js');
const Model=require('../../app/eligibility/model.js');
const Library=require('../../app/eligibility-library.js');

const population='adults recovering from stroke';
const comparator='usual rehabilitation or an education booklet';
const intervention='supervised home balance training';
const outcome='falls within 12 weeks';
const question='In '+population+', compared with '+comparator+', does '+intervention+' reduce '+outcome+'? Include only randomised controlled trials.';

async function extract(input,attachment,review){
 const env=Engine.environment();
 const original=Engine.save_input(Engine.create_project('release-audit'),{research_question:input,output_language:'en'}).state;
 const q=original.questions[0];
 if(attachment){
  const source=Engine.addSource(original,'user_input',attachment,[q.question_id],'auditAttachment',{input_kind:'original_document'});
  q.imported_source_refs.push(Engine.ref(source));
 }
 const calls=[];
 const result=await Model.analyze(original,env,{request:async(step,state,payload)=>{
  calls.push({step,payload});
  if(step==='extract_elements')return {source_language:'en',questions:[{question_id:q.question_id,
   review_topic:'Home balance training after stroke',framework_candidates:['picos'],elements:[],issues:[],logic:null}]};
  assert.equal(step,'review_normalization');
  return {items:payload.items.map(item=>({...item,status:'supported',issue_type:'none',reason:'Matches the source.',...review?.(item)}))};
 }},{languageSample:input,retries:1});
 return {project:Engine.ingest_candidates(original,result.candidates,{},env).state,calls,inputLanguage:result.inputLanguage};
}

test('unseen English wording yields four criteria and a measured outcome even after a blank extraction',async()=>{
 const {project,calls,inputLanguage}=await extract(question);
 assert.equal(project.status,'final');
 assert.equal(inputLanguage,'en');
 assert.deepEqual(project.criteria.map(rule=>rule.dimension_id).sort(),['comparator','intervention','population','study_design']);
 assert.equal(project.criteria.find(rule=>rule.dimension_id==='comparator').text,comparator);
 assert.equal(project.elements.find(element=>element.semantic_role==='review_focus').normalized_text,outcome);
 assert.equal(project.validation.completeness.eligibility.source_coverage.filter(item=>item.status==='covered').length,5);
 assert.equal(calls.filter(call=>call.step==='review_normalization').length,5);
});

test('an unverified attachment criterion blocks handoff while independent question fields survive',async()=>{
 const attachment='Inclusion criteria:\nPopulation: Adults in community settings.\nResults:\nPopulation: Twenty adults reported dizziness.';
 const {project,calls}=await extract(question,attachment);
 assert.equal(project.status,'incomplete');
 assert.deepEqual(project.criteria.map(rule=>rule.dimension_id).sort(),['comparator','intervention','population','study_design']);
 const unresolved=project.validation.completeness.eligibility.source_coverage.filter(item=>item.status==='unresolved');
 assert.deepEqual(unresolved.map(item=>item.source_refs[0].quote),['Adults in community settings']);
 assert(calls.some(call=>call.step==='extract_elements'&&call.payload.validation_feedback?.code==='SOURCE_COVERAGE'));
});

test('explicit natural-language inclusions remain in the audit even when Jev rejects their wording',async()=>{
 const {project}=await extract('Include adults older than 40 years with asthma.',null,
  ()=>({status:'contradicted',issue_type:'unsupported_rewrite'}));
 assert.equal(project.status,'incomplete');
 assert.equal(project.validation.completeness.eligibility.source_coverage[0].source_refs[0].quote,'adults older than 40 years with asthma');
 assert.equal(project.criteria.length,0);
});

const projectId='release-audit',key='aimstep-eligibility:'+projectId;
const ready={activeGenerator:'machine',generationMethodChoice:'machine',question,
 machineRun:{question,inputMode:'machine',sourceRevision:0},eligibilityV3Snapshot:{status:'final',validation:{blocking_issues:[]}}};
const pending={...ready,eligibilityV3Snapshot:{status:'needs_clarification',issues:[{blocking:true,status:'open'}]}};
const optional={...ready,machineRefinement:{sourceConfirmations:[{status:'suggested',methodAdvice:true}]}};
const storageFor=value=>({getItem:requested=>requested===key?JSON.stringify(value):null});
test('unresolved scope, invalid snapshots and stale input block direct handoff',()=>{
 for(const [draft,message] of [
  [pending,/author checks/],
  [{...ready,question:'A changed research question'},/input has changed/],
  [{...ready,machineSourceRevision:2},/input has changed/],
  [{...ready,reviewType:'Scoping Review',machineRun:{...ready.machineRun,reviewType:'Systematic Review'}},/input has changed/],
  [{...ready,eligibilityV3Snapshot:{status:'validation_error'}},/could not be validated/],
  [{...ready,generationMethodChoice:'manual',machineRun:{inputMode:'manual',manualSignature:'old'},criteria:[]},/input has changed/]
 ]){
  assert.match(Library.criteriaHandoffBlock(draft),message);
  assert.match(Library.savedCriteriaHandoffBlock(storageFor(draft),projectId),message);
  assert.equal(Library.savedCriteriaHandoffBlock(storageFor(draft),projectId,'upload'),'');
 }
 assert.equal(Library.criteriaHandoffBlock(optional),'');
});

test('title/abstract does not overwrite a valid full-text handoff when newer criteria are blocked',async()=>{
 const html=fs.readFileSync('title-abstract-screening.html','utf8');
 const code=html.slice(html.indexOf('function publishForFullText(){'),html.indexOf('function publishSummary(){'));
 let timer,opened=0;
 const context={AimstepEligibilityLibrary:Library,localStorage:storageFor(ready),scope:projectId,
  handoffTimer:null,workspace:{},source:{records:[],criteria:{rows:[{}]}},criteriaOrigin:null,
  setTimeout(fn){timer=fn;return 1;},clearTimeout(){},
  openDB:async()=>{opened++;return {close(){}};},summary:()=>({}),putProject:async()=>{},now:()=>'',console};
 vm.createContext(context);
 vm.runInContext(code+'\npublishForFullText();',context);
 context.localStorage=storageFor(pending);
 await timer();
 assert.equal(opened,0);
 context.localStorage=storageFor(ready);
 vm.runInContext('publishForFullText();',context);
 await timer();
 assert.equal(opened,1);
});

test('full-text leaves prior documents and screening intact while reading a blocked handoff',async()=>{
 const html=fs.readFileSync('full-text-screening.html','utf8');
 const code=html.slice(html.indexOf('async function importFromScreening(){'),html.indexOf('async function clearSource(){'));
 const workspace={records:[{uid:'saved'}],criteria:{label:'last accepted'},pilot:{rounds:[]}};
 let finish;
 const context={AimstepEligibilityLibrary:Library,localStorage:storageFor(ready),scope:projectId,
  workspace,busy:'',syncingSource:false,window:{},readHandoff:()=>new Promise(resolve=>{finish=resolve;}),scheduleRetrieval(){}};
 vm.createContext(context);
 const job=vm.runInContext(code+'\nimportFromScreening();',context);
 context.localStorage=storageFor(pending);
 finish({records:[],criteria:null});
 await job;
 assert.deepEqual(workspace.records,[{uid:'saved'}]);
 assert.deepEqual(workspace.criteria,{label:'last accepted'});
});


test('proposal reads the same gate before it displays linked eligibility rules',()=>{
 const source=fs.readFileSync('app/protocol-workspace.js','utf8');
 const code=source.slice(source.indexOf('function savedManualCriteria(){'),source.indexOf('function renderManualCriteria(){'));
 const rows=[{title:'Population',condition:'Adults',uncertain:''}];
 const context={URL,AimstepEligibilityLibrary:Library,projectDeleted:()=>false,
  manualCriteriaLink:()=>('http://localhost/eligibility.html?projectId='+projectId)};
 const rules=state=>vm.runInNewContext(code+';savedManualCriteria()',{
  ...context,localStorage:storageFor({...state,machineCriteria:rows})
 });
 assert.equal(rules(pending).includes.length,0);
 assert.equal(rules(ready).includes[0].text,'Adults');
});
