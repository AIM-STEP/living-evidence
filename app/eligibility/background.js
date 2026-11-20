/* Headless adapter: use the versioned eligibility engine behind the established UI. */
(function(root,factory){const api=factory(root,typeof module==='object'&&module.exports?require('./domain.js'):root.AIMSTEPEligibilityDomain,typeof module==='object'&&module.exports?require('./engine.js'):root.AIMSTEPEligibilityEngine,typeof module==='object'&&module.exports?require('./model.js'):root.AIMSTEPEligibilityModel,typeof module==='object'&&module.exports?require('./methodology.js'):root.AIMSTEPEligibilityMethodology,typeof module==='object'&&module.exports?require('../eligibility-reset.js'):root.AimstepEligibilityReset,typeof module==='object'&&module.exports?require('./lessons.js'):root.AIMSTEPEligibilityLessons);if(typeof module==='object'&&module.exports)module.exports=api;else root.AIMSTEPEligibilityBackground=api;})(typeof window==='object'?window:globalThis,function(root,D,E,M,Methods,Reset,Lessons){
'use strict';
const clone=D.clone;
const {currentEpoch,requireEpoch,projectKeys,resetProject}=Reset;
const eligibilityPolicy='framework-only-v1';
const presentationVersion='framework-display-v12';
// Bump when eligibility semantics change. Presentation updates can use the saved evidence.
const generationVersion='20261120-criteria-release-33';
const labels={population:'Population',sample:'Sample',intervention:'Intervention',exposure:'Exposure',comparator:'Comparison',outcome:'Outcomes',concept:'Concept',context:'Context',phenomenon_of_interest:'Phenomenon of Interest',condition:'Condition',index_test:'Index test',reference_test:'Reference test',target_condition:'Target condition',design:'Study design',study_design:'Study design',research_type:'Research type',evaluation:'Evaluation',language:'Language',publication_date:'Publication date',evidence_source:'Evidence source',core_scope:'Review scope',analysis_method:'Analysis plan',analysis_data_unit:'Data plan',analysis_objective:'Analysis objectives'};
const label=dimension=>labels[String(dimension||'').split('.')[0]]||String(dimension||'Other').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
function signature(value){return D.stableId('legacy',JSON.stringify(value?{question:value.question,framework:value.framework,rows:value.activeGenerator==='machine'?value.machineCriteria:value.criteria,refinement:value.activeGenerator==='machine'?value.machineRefinement:value.manualRefinement}:null));}
function optionLabel(option){
 if(!option)return 'Confirm';
 if(option.source_occurrence_ref)return option.label;
 if(option.label&&!/[\u3400-\u9fff]/u.test(option.label))return option.label;
 const names={unrestricted:'No age restriction',defer:'Keep pending',ignore:'Keep the existing scope',keep:'Keep the previous decision',replace:'Use the revised decision',focus:'Review focus only',eligibility:'Eligibility requirement',any_of:'Any condition',all_of:'All conditions',systematic_review:'Systematic reviews',review:'Systematic reviews and other reviews',pico:'PICO',pico_qualitative:'PICo'};
 return names[option.option_id]||option.updates?.[0]?.normalized_text||option.option_id;
}
function authorChoices(issue){
 return issue.options.flatMap(option=>{
  const label=optionLabel(option);
  if(option.source_occurrence_ref&&!E.passageWording(option.source_occurrence_ref).direction){
   const roles=[['include','Include'],['exclude','Exclude']];
   if(issue.eligibility_policy!=='framework-only-v1')roles.push(['focus','Review focus']);
   return roles.map(([role,name])=>({
    option_id:option.option_id+'/'+role,stored_id:option.option_id,passage_role:role,label:name+' — '+label
   }));
  }
  return [{option_id:option.option_id,stored_id:option.option_id,label}];
 });
}
function issueText(issue,project,elements=issue.element_ids.map(id=>project.elements.find(e=>e.element_id===id)).filter(Boolean),field){
 const names=elements.map(e=>e.normalized_text).filter(Boolean).join('; '),domain=label(elements[0]?.dimension_id);
 if(issue.trigger_rule_id==='source_occurrence'&&names)return 'The phrase “'+names+'” occurs in more than one passage. Which passage should define the rule for '+(field||domain)+'?';
 if(issue.trigger_rule_id==='independent_source_check'&&elements.length===1){
  const [element]=elements,review=element.semantic_review;
  const wording='“'+element.normalized_text+'”';
  const fieldName=field||domain;
  const role=element.disposition==='exclude'?'an exclusion criterion':'an inclusion criterion';
  if(review?.validation_code)return 'Should '+wording+' be used as '+role+'? '+issue.question_text;
  if(review?.reviewer?.verdict==='wrong_field'||element.review_pending?.routed_by)
   return 'Does '+wording+' belong under '+fieldName+' as '+role+'? Use the cited passage to check the field and the direction of the rule.';
  if(!element.disposition)return 'Does the cited passage make '+wording+' an eligibility criterion? Choose Include or Exclude if it does.';
  const reason=issue.question_text;
  const specific=reason&&!/^(?:The proposed wording or scope does not match|The cited passage leaves|The source check could not|Confirm how this criterion)/u.test(reason);
  return 'Should '+wording+' be used as '+role+' for '+fieldName+'? '+(specific?reason:'Check that the cited passage supports the proposed rule, including any limits or exceptions.');
 }
 if(issue.author_scope_review||elements.some(e=>e.review_pending))return issue.question_text;
 if(issue.trigger_rule_id==='population_age_boundary')return 'The source specifies older people without a numeric age threshold. Define the age boundary below, or confirm whether to retain the original wording.';
 if(issue.trigger_rule_id?.startsWith('model_issue:')&&issue.question_text&&!/[\u3400-\u9fff]/u.test(issue.question_text))return issue.question_text;
 if(issue.trigger_rule_id?.startsWith('fragment_relation:'))return issue.question_text;
 if(issue.trigger_rule_id==='between_question_relation')return 'Should studies satisfy any subquestion or all subquestions?';
 if(issue.reason_code==='CONFLICTING_REQUIREMENTS')return 'Which requirement should apply to '+domain.toLowerCase()+'?';
 if(issue.reason_code==='FRAMEWORK_AMBIGUITY')return issue.trigger_rule_id.startsWith('custom_definition:')?'What does this custom framework field mean?':'Which question framework should be used?';
 if(issue.reason_code==='UNCLEAR_LOGIC')return 'Must a study meet all the listed conditions to be eligible, or is any one sufficient?';
 if(issue.reason_code==='MISSING_REQUIRED_DECISION')return elements.length?'What '+domain.toLowerCase()+' scope should apply to this review?':'What population or core concept should this review cover?';
 if(issue.reason_code==='UNRESOLVED_ROLE')return 'Should this information define eligibility or only the review focus?';
 return 'How should this requirement define eligibility'+(names?': '+names:'')+'?';
}
function projectToClassic(project,registry){
 if(!registry&&typeof require==='function')registry=E.environment().frameworks;
 const output=E.render_output(project),rows=[];
 const displayedByElement=new Map();
 const elementsById=new Map(project.elements.map(element=>[element.element_id,element]));
 function add(target,dimension,side,text,criteria,bind=true){
  if(!text)return;
  let row=target.find(row=>row.dimension===dimension);
  if(!row){row={dimension,include:[],exclude:[]};target.push(row);}
  if(!row[side].includes(text))row[side].push(text);
  if(!bind)return;
  for(const criterion of criteria)for(const id of criterion.source_element_ids){
   const location={domain:dimension,section:side,rule:text};
   displayedByElement.set(id,location);
   const age=elementsById.get(id)?.age_boundary_element_id;
   if(age&&!displayedByElement.has(age))displayedByElement.set(age,location);
  }
 }
 const multiple=output.questions.length>1;
 const frameworkQuestions=[],pendingLogicRows=[],bindings=new Map();
 const contexts=output.questions.map(q=>{
  const target=multiple?[]:rows;
  const mapping=q.framework_mapping;
  const custom=project.custom_frameworks?.find(item=>item.framework_id===mapping?.framework_id);
  const frame=custom||registry?.get(mapping?.framework_id);
  const fields=new Map((frame?.slots||[]).map(slot=>[slot.slot_id,(custom&&slot.display_label)||labels[slot.slot_id]||slot.display_label||label(slot.slot_id)]));
  const domain=id=>fields.get(id)||fields.get(id.split('.')[0]);
  bindings.set(q.question_id,domain);
  const pending=q.logic?.pending_inclusion_branches,linked=[];
  const duration=fields.has('intervention')&&fields.has('comparator')?
   Methods.sharedTreatmentDuration(q.include,q.logic?.include,elementsById):null;
  const awaiting=new Set(q.logic?.pending_logic_element_ids||[]);
  for(const e of q.elements.filter(e=>awaiting.has(e.element_id)&&domain(e.dimension_id)&&e.disposition!=='exclude'&&!['review_focus','background_information'].includes(e.semantic_role))){
   pendingLogicRows.push({domain:domain(e.dimension_id),subject:e.normalized_text,questionNumber:multiple?q.display_number:null,side:'include'});
  }
  for(const side of ['include','exclude']){
   const criteria=q[side].filter(c=>domain(c.dimension_id));
   const expression=q.logic?.[side];
   const branches=side==='exclude'&&expression?.op==='any_of'?expression.children:side==='include'&&pending?pending:[expression];
   for(const branch of branches){
    const units=Methods.frameworkUnits(branch,criteria,domain,linked);
    for(const unit of side==='include'?Methods.combinePopulationUnits(units):units){
     let wording=unit.linked?unit.text:Methods.ageClause(unit.criteria)||unit.text;
     if(duration&&side==='include'&&unit.node.op==='predicate'&&duration.ids.has(unit.node.criterion_id)&&wording.endsWith(duration.suffix))
      wording=wording.slice(0,-duration.suffix.length);
     if(unit.criteria.every(c=>['study_design','design'].includes(c.dimension_id)&&c.source_element_ids.every(id=>elementsById.get(id)?.decision_status==='accepted_from_input')))
      wording=Methods.studyDesignWording(wording);
     add(target,unit.dimension,side,wording,unit.criteria);
    }
   }
  }
  const slots=[...fields.values()];
  target.sort((a,b)=>slots.indexOf(a.dimension)-slots.indexOf(b.dimension));
  frameworkQuestions.push({display_number:q.display_number,framework:frame?.display_name||mapping?.display_name||'Pending',frameworkSlots:slots,rows:target});
  if(multiple)for(const row of target)for(const side of ['include','exclude'])for(const rule of row[side]){
   add(rows,row.dimension,side,q.display_number+' · '+rule,[],false);
  }
  const outcomes=fields.has('outcome')?Methods.outcomeGroups(q.research_question):[];
  return {display_number:q.display_number,manuscript:Methods.manuscriptContext(q.research_question||''),...(outcomes.length?{outcome_groups:outcomes}:{}),...(multiple?{rows:target}:{}),...(pending&&!awaiting.size?{pending_inclusion_relation:true}:{}),...(linked.length?{linked_conditions:linked}:{}),...(duration&&{shared_treatment_duration:{suffix:duration.suffix,intervention:duration.intervention,comparison:duration.comparison}})};
 });
 const frameNames=[...new Set(frameworkQuestions.map(q=>q.framework))],framework=frameNames.length===1?frameNames[0]:'Other';
 const frameworkSlots=frameNames.length===1?frameworkQuestions[0].frameworkSlots:[];
 const descriptionContext=contexts.length===1?contexts[0]:{question_contexts:contexts,question_relation:project.question_relation,combined_rows:clone(rows)};
 const confirmations=project.issues.filter(issue=>issue.status==='open'&&(issue.blocking||issue.method_advice)).flatMap(issue=>{
  const field=bindings.get(issue.question_id);
  if(issue.method_advice){
   const domain=field?.(issue.method_advice.dimension);
   if(!domain)return [];
   return {item:issue.question_text,text:issue.question_text,kind:'proposal',domain,side:'include',status:'suggested',backgroundIssue:true,
    locations:[{section:'include',domain}],issue_id:issue.issue_id,methodAdvice:{rationale:issue.scope_impact,references:issue.method_advice.references},
    questionNumber:multiple?output.questions.find(q=>q.question_id===issue.question_id)?.display_number:null,
    options:authorChoices(issue).map(({label,option_id})=>({label,option_id}))};
  }
  const linkedIds=issue.linked_element_ids||issue.element_ids;
  const elements=linkedIds.filter(id=>!issue.answered_element_ids?.includes(id)).map(id=>elementsById.get(id)).filter(e=>
   e&&field?.(e.dimension_id)&&e.information_status!=='missing'&&e.source_refs?.length&&
   (e.semantic_role==='eligibility_condition'||e.semantic_role==='undecided'||e.role_issue||e.source_occurrence_pending));
  if(!elements.length&&issue.reason_code!=='FRAMEWORK_AMBIGUITY'&&!(multiple&&issue.trigger_rule_id==='between_question_relation'))return [];
  const visible=new Set(elements.map(e=>e.element_id));
  const pendingGroups=E.authorTargetGroups(project,issue).map(group=>group.filter(id=>visible.has(id))).filter(group=>group.length);
  const answerTargets=pendingGroups.length>1?pendingGroups.map(([id])=>({id,label:elementsById.get(id).normalized_text})):[];
  const locations=[];
  for(const element of elements){
   let section=element.source_occurrence_section;
   if(!section&&element.review_pending)section=element.disposition;
   if(section!=='exclude'&&section!=='include')section=element.disposition==='exclude'?'exclude':'include';
   const location=displayedByElement.get(element.element_id)||{
    domain:field(element.dimension_id),
    section,
    ...(element.review_pending&&{pendingReview:true}),
    subject:element.information_status==='missing'?'':element.normalized_text
   };
   const target=answerTargets.length?pendingGroups.find(group=>group.includes(element.element_id))?.[0]:null;
   const prior=locations.find(prior=>prior.domain===location.domain&&prior.section===location.section&&prior.rule===location.rule&&prior.subject===location.subject);
   if(!prior)locations.push({...location,...(target&&{targetId:target})});
   else if(prior.targetId!==target)delete prior.targetId;
  }
  if(!locations.length)locations.push(issue.reason_code==='FRAMEWORK_AMBIGUITY'?{section:'framework',domain:'Framework'}:{section:'topic',domain:'Review topic'});
  const primary=locations[0],text=issueText(issue,project,elements,primary.domain);
  return {item:text,text,kind:'proposal',type:'source-ambiguity',domain:primary.domain,
   side:primary.section==='exclude'?'exclude':'include',status:'suggested',backgroundIssue:true,
   reviewOnly:false,focusOnly:primary.section==='focus',locations,issue_id:issue.issue_id,...(answerTargets.length&&{answerTargets}),
   questionNumber:output.questions.length>1?output.questions.find(q=>q.question_id===issue.question_id)?.display_number:null,
   options:authorChoices(issue).map(({label,option_id})=>({label,option_id})),
   evidence:[...new Map(elements.flatMap(element=>issue.trigger_rule_id==='source_occurrence'?(element.source_occurrence_alternatives||[]).flatMap(a=>[a.heading,a].filter(Boolean)):element.source_refs||[]).map(ref=>[JSON.stringify([ref.source_id,ref.source_revision,ref.start,ref.end,ref.quote]),ref])).values()].map(({quote,source_id,source_revision,start,end})=>({quote,source_id,source_revision,start,end}))};
 });
 return {eligibilityPolicy,manuscriptParagraph:Methods.description(rows,descriptionContext),descriptionContext,focusRows:[],pendingLogicRows,framework,frameworkSlots,...(multiple?{frameworkQuestions}:{}),rows,reviewTopic:Methods.projectTopic(output.questions),topicStyle:'concise-v4',sourceConfirmations:confirmations,scopeSuggestions:[],uncertainties:[],clarifications:[],trace:[],audit:{version:E.VERSION,methodology:'two-stage-eligibility',status:project.status,project_revision:project.revision,config_versions:clone(project.config_versions),calls:clone(project.model_calls),sources:project.sources.filter(s=>s.source_type==='user_input'&&s.input_kind!=='explicit_context_fields'&&project.questions.filter(q=>q.active!==false).some(q=>[...q.source_refs,...q.additional_source_refs,...(q.imported_source_refs||[])].some(r=>r.source_id===s.source_id&&r.source_revision===s.revision))).map(s=>({id:s.source_id,revision:s.revision,name:s.input_kind==='research_question'?'Question / voice input':s.name||'Author requirements',text:s.original_text,verification:s.verification||'original-text'})),checks:clone(project.validation)},snapshot:output};
}
async function create({projectId,storage=root.localStorage,frameworkConfig,profileConfig,baseURL}={}){
 if(!projectId)D.fail('PROJECT_REQUIRED','background','Open a registered project first.');
 const base=baseURL||new URL('.',root.location.href).href,version='20261119-framework-description-1';
 const configs=await Promise.all([frameworkConfig||root.fetch(new URL('config/eligibility-frameworks.json?v='+version,base)).then(r=>{if(!r.ok)throw Error('Could not load framework definitions.');return r.json();}),profileConfig||root.fetch(new URL('config/eligibility-review-profiles.json?v='+version,base)).then(r=>{if(!r.ok)throw Error('Could not load review profiles.');return r.json();})]);
 const registry=E.environment(...configs).frameworks;
 const configKey=D.stableId('config',JSON.stringify(configs));
 const projectView=project=>projectToClassic(project,registry);
 const keys=projectKeys(projectId);
 const read=key=>JSON.parse(storage.getItem(key)||'null');
 function current(){
  const saved=read(keys.project),epoch=currentEpoch(storage,projectId);
  if(saved&&(saved.schema_version!==3||saved.project_id!==projectId))D.fail('INVALID_PROJECT','background','The saved methodology record is invalid; it has been preserved.');
  if(saved&&(saved.criteria_epoch??null)===epoch)return saved;
  const project=E.create_project(projectId);
  if(epoch)project.criteria_epoch=epoch;
  return project;
 }
 function staged(project,expectedRevision,expectedSignature,classic=projectView(project)){return {project,expectedRevision,expectedSignature,classic};}
 function inputKey({question,reviewType,questionType,registration,modelSettings},material){
  return D.stableId('input',JSON.stringify([generationVersion,configKey,question||'',reviewType||'',questionType||'',registration||null,modelSettings||null,material]));
 }
 function sourceKey(input,sources){
  const passages=sources.filter(s=>s.name!=='Question / voice input'||s.text!==input.question)
   .map(s=>[s.name,s.page??null,s.text,s.verification||'original-text']);
  return inputKey(input,passages);
 }
 function requireCurrentView(legacy){
  const stored=read(keys.legacy);
  if(stored?.eligibility_v3_revision!=null&&legacy?.eligibility_v3_revision!==stored.eligibility_v3_revision)
   D.fail('VERSION_CONFLICT','background','The criteria changed in another session. Reload the current criteria before generating.');
 }
 function matchesPublished(input,project,key,field){
  if(!key||project[field]!==key)return false;
  const legacy=input.legacy,stored=read(keys.legacy),expected=signature(stored);
  if(!stored||project.last_published_legacy_signature!==expected||signature(legacy)!==expected)return false;
  if(legacy.activeGenerator!=='machine'||!legacy.machineRefinement||legacy.eligibility_v3_revision!==project.revision)return false;
  if(['final','needs_clarification'].includes(project.status))return project.validation?.errors?.length===0;
  const edit=project.decisions.at(-1)?.changes?.[0];
  return project.status==='input_saved'&&project.decisions.at(-1)?.action==='classic_author_revision'&&
   edit?.old?.question===edit?.new?.question&&JSON.stringify(edit?.old?.rows)!==JSON.stringify(edit?.new?.rows);
 }
 // Only the currently published result is eligible. Clear removes both keys with the project.
 function publishedGeneration(input,fileDigests){
  requireEpoch(storage,projectId,input.legacy?.criteria_epoch);
  requireCurrentView(input.legacy);
  if(!Array.isArray(fileDigests))return null;
  const saved=current();
  return matchesPublished(input,saved,inputKey(input,fileDigests),'generation_files_key')?
   publishedStage(saved,input.legacy):null;
 }
 function publishedStage(saved,legacy){
  return {...staged(saved,saved.revision,signature(legacy),{...legacy.machineRefinement,snapshot:legacy.eligibilityV3Snapshot}),reused:true};
 }
 function validate(stage){requireEpoch(storage,projectId,stage.project.criteria_epoch);const saved=read(keys.project);if((saved?.revision??0)!==stage.expectedRevision||signature(read(keys.legacy))!==stage.expectedSignature)D.fail('VERSION_CONFLICT','background','The criteria changed while this request was running. Your newer edits have been kept.');}
 function transaction(stage,writeLegacy){
  validate(stage);
  const names=Object.values(keys),before=names.map(key=>storage.getItem(key));
  try{
   const result=writeLegacy();
   requireEpoch(storage,projectId,stage.project.criteria_epoch);
   stage.project.last_published_legacy_signature=signature(read(keys.legacy));
   storage.setItem(keys.project,JSON.stringify(stage.project));return result;
  }catch(error){
   // A reset that superseded this stage must never be undone by an old rollback.
   if(currentEpoch(storage,projectId)===(stage.project.criteria_epoch??null)){
    names.forEach((key,i)=>{try{before[i]==null?storage.removeItem(key):storage.setItem(key,before[i]);}catch(_){}});
   }
   throw error;
  }
 }
 function refreshPresentation(legacy){
  requireEpoch(storage,projectId,legacy.criteria_epoch);
  const saved=read(keys.project);if(!saved||(saved.criteria_epoch??null)!==(legacy.criteria_epoch??null)||saved.presentation_version===presentationVersion||saved.last_published_legacy_signature!==signature(legacy))return null;
  const project=clone(saved);
  if(!project.elements.some(e=>e.active!==false)){
   // Earlier versions retired the whole projection even for a title-only or prose-only edit.
   const run=legacy.machineRun,editHistory=legacy.previewEditHistory?.at(-1);
   if(legacy.activeGenerator!=='machine'||!run||run.question!==legacy.question||
    run.reviewType!==legacy.reviewType||(run.sourceRevision??0)!==(legacy.machineSourceRevision??0)||
    editHistory?.changes?.length!==0||
    !(legacy.machineRefinement?.descriptionEditedByAuthor||legacy.machineRefinement?.topicEditedByAuthor))return null;
   const snapshot=project.snapshots.at(-1);
   const revisions=snapshot&&project.changes.filter(change=>change.revision>snapshot.revision);
   const displayOnly=revisions?.length&&revisions.every(change=>{
    const decision=project.decisions.find(item=>item.revision===change.revision&&item.action==='classic_author_revision');
    const edit=decision?.changes?.[0];
    return change.operation==='classic_author_revision'&&edit?.old&&edit.new&&
     edit.old.question===edit.new.question&&edit.old.framework===edit.new.framework&&
     JSON.stringify(edit.old.rows)===JSON.stringify(edit.new.rows)&&
     (edit.old.topic!==edit.new.topic||edit.old.paragraph!==edit.new.paragraph);
   });
   if(!displayOnly||!snapshot.elements?.length||!Array.isArray(snapshot.issues))return null;
   const activeById=new Map(snapshot.elements.map(element=>[element.element_id,element]));
   project.elements=project.elements.map(element=>activeById.get(element.element_id)||element);
   project.issues=clone(snapshot.issues);
  }
  project.revision++;project.updated_at=D.now();
  let corrected=M.applySavedReviewThreshold(project);
  if(!['framework-display-v9','framework-display-v10'].includes(saved.presentation_version)&&legacy.activeGenerator==='machine'&&!legacy.confirmed&&!legacy.finalCriteria){
   for(const question of project.questions.filter(q=>q.active!==false)){
    if(M.repairSavedExtraction(project,question))corrected=true;
   }
  }
  if(!corrected&&/^framework-display-v(?:[2-9]|1[01])$/.test(saved.presentation_version)&&saved.elements.some(e=>e.active!==false)){
   const visible=E.render_output(project).questions;
   for(const question of project.questions.filter(q=>q.active!==false)){
    const elements=visible.find(q=>q.question_id===question.question_id).elements;
    question.review_topic=Methods.topic(question,elements);
   }
  }else E.rebuild(project,E.environment(...configs));
  project.presentation_version=presentationVersion;
  project.changes.push({change_id:D.id('change'),revision:project.revision,operation:'refresh_criteria_presentation',at:project.updated_at,changes:[]});
  return staged(project,saved.revision,signature(read(keys.legacy)));
 }
 async function generate({legacy,question,reviewType,questionType,registration,sources=[],fileDigests,modelSettings,modelClient,signal,onProgress}){
  requireEpoch(storage,projectId,legacy?.criteria_epoch);
  requireCurrentView(legacy);
  const saved=current(),revision=saved.revision,expected=signature(read(keys.legacy)),env=E.environment(...configs);
  const input={legacy,question,reviewType,questionType,registration,modelSettings},key=sourceKey(input,sources);
  if((!Array.isArray(fileDigests)||saved.generation_files_key===inputKey(input,fileDigests))&&matchesPublished(input,saved,key,'generation_source_key')){
   return publishedStage(saved,legacy);
  }
  const methods={'Systematic Review':'systematic_review','Scoping Review':'scoping_review','Rapid Review':'rapid_review',
   'Umbrella Review':'umbrella_review','Narrative Literature Review':'narrative_literature_review',
   'Integrative Review':'integrative_review','Other Review':'other_review'};
  const raw=question||sources.map(source=>source.text).join('\n\n');
  const questionTypes={effectiveness:'intervention_effect',prevention:'intervention_effect',etiology:'exposure_outcome',qualitative:'experience',diagnosis:'diagnostic_accuracy'};
  const registeredScope=registration?{...registration,question_type:registration.question_type||questionType||''}:null;
  let project=E.save_input(saved,{research_question:raw,document_input_only:!question&&sources.length>0,review_method:methods[reviewType]||reviewType||null,question_type:questionTypes[questionType]||questionType||null,registration:registeredScope,output_language:'en',legacy_archive:saved.criteria_epoch?null:legacy},{base_revision:revision},env).state;
  const activeQuestions=project.questions.filter(q=>q.active!==false);
  let questionOffset=0,documentOffset=0;
  const ranges=activeQuestions.map(q=>{
   const start=question?0:raw.indexOf(q.original_text,questionOffset),end=start+q.original_text.length;
   questionOffset=end;
   return {q,start,end};
  });
  for(const [index,source]of sources.entries()){
   if(source.name==='Question / voice input'&&source.text===question)continue;
   const start=documentOffset,end=start+source.text.length;
   documentOffset=end+2; // raw separates consecutive originals with two newlines.
   const owners=question?ranges:ranges.filter(range=>range.start<end&&range.end>start);
   if(!owners.length)continue;
   const stored=E.addSource(project,'user_input',source.text,owners.map(({q})=>q.question_id),'classic_document:'+index,{input_kind:'original_document',name:source.name,page:source.page||null,verification:source.verification||'original-text'});
   for(const range of owners){
    const {q}=range;
    q.imported_source_refs=q.imported_source_refs.filter(ref=>{
     const previous=D.sourceAt(project,ref);
     return !(previous?.input_kind==='legacy_original_document'&&previous.name===stored.name&&previous.page===stored.page&&previous.original_text===stored.original_text);
    });
    if(question||range.start<=start&&range.end>=end){q.imported_source_refs.push(E.ref(stored));continue;}
    const from=Math.max(0,range.start-start),to=Math.min(source.text.length,range.end-start);
    const quote=source.text.slice(from,to),offset=Array.from(source.text.slice(0,from)).length;
    q.imported_source_refs.push({...E.ref(stored,quote),start:offset,end:offset+Array.from(quote).length});
   }
  }
  if(saved.classic_author_source_ref){const ref=saved.classic_author_source_ref;for(const q of project.questions.filter(q=>q.active!==false))if(!q.additional_source_refs.some(r=>r.source_id===ref.source_id&&r.source_revision===ref.source_revision))q.additional_source_refs.push(clone(ref));}
  const observed=new Set(),lessonCounts=Lessons?.readCounts(storage,keys.lessons)||{};
  try{
   const result=await M.analyze(project,env,modelClient,{signal,retries:1,onProgress,lessonCounts,onLesson:code=>observed.add(code)});
   requireEpoch(storage,projectId,saved.criteria_epoch);
   onProgress?.('Validating eligibility criteria…',{phase:'validate'});
   project=E.ingest_candidates(project,result.candidates,{base_revision:result.base_revision},env).state;
   for(const code of Lessons?.correctedLessons(project.elements)||[])observed.add(code);
   project.model_calls.push(...result.model_calls);
   project.presentation_version=presentationVersion;
   const visible=projectView(project);
   if(/[\u3400-\u9fff]/u.test(visible.reviewTopic+' '+visible.rows.flatMap(row=>[...row.include,...row.exclude]).join(' ')))D.fail('MODEL_LANGUAGE_MISMATCH','output','The model did not return the requested English criteria. The previous version has been kept.');
   const verified=['final','needs_clarification'].includes(project.status)&&project.validation?.errors?.length===0;
   project.generation_source_key=verified?key:null;
   project.generation_files_key=verified&&Array.isArray(fileDigests)?inputKey(input,fileDigests):null;
   onProgress?.('Saving eligibility criteria…',{phase:'ready'});
   return staged(project,revision,expected,visible);
  }catch(error){
   const code=Lessons?.errorLesson(error);if(code)observed.add(code);
   throw error;
  }finally{
   if(!signal?.aborted&&observed.size&&currentEpoch(storage,projectId)===(saved.criteria_epoch??null))Lessons?.recordRun(storage,keys.lessons,observed);
  }
 }
 async function decide({issue_id,option_id,answer_text,target_id,signal,criteriaEpoch}){
  requireEpoch(storage,projectId,criteriaEpoch);
  if(signal?.aborted)throw new DOMException('Confirmation stopped.','AbortError');
  const project=current(),issue=project.issues.find(issue=>issue.issue_id===issue_id&&issue.status==='open');if(!issue)D.fail('ISSUE_NOT_FOUND','background','This clarification has already changed. Reload the saved criteria.');
  const expected=signature(read(keys.legacy)),choices=authorChoices(issue);
  let choice=choices.find(item=>item.option_id===option_id);
  if(option_id&&!choice)D.fail('OPTION_NOT_FOUND','background','The selected answer is no longer available for this author check.');
  if(!choice&&typeof answer_text==='string'){
   const matches=choices.filter(item=>[item.label,issue.options.find(o=>o.option_id===item.stored_id)?.label].some(label=>label?.trim().normalize('NFC')===answer_text.trim().normalize('NFC')));
   if(matches.length===1)choice=matches[0];
  }
  const answer={issue_id,author_confirmed:true,answer_text:choice&&issue.method_advice?choice.label:answer_text??choice?.label,...(target_id&&{target_id})};
  if(choice){answer.option_id=choice.stored_id;if(choice.passage_role)answer.passage_role=choice.passage_role;}
  const request={base_revision:project.revision,request_id:D.id('answer'),answers:[answer]};
  return staged(E.apply_decisions(project,request,E.environment(...configs)).state,project.revision,expected);
 }
 function recordEdit(previous,next){
  requireEpoch(storage,projectId,next.criteria_epoch);
  requireEpoch(storage,projectId,previous.criteria_epoch);
  const saved=read(keys.project);if(!saved||(saved.criteria_epoch??null)!==(next.criteria_epoch??null)||signature(previous)===signature(next))return null;
  const before=previous.machineRefinement,after=next.machineRefinement;
  const displayEdit=before&&after?.editedAt&&
   (after.reviewTopic!==before.reviewTopic||after.manuscriptParagraph!==before.manuscriptParagraph)&&
   (after.topicEditedByAuthor||after.descriptionEditedByAuthor)&&next.previewEditHistory?.at(-1)?.changes?.length===0;
  if(displayEdit&&previous.activeGenerator==='machine'&&next.activeGenerator==='machine'&&
   previous.question===next.question&&previous.reviewType===next.reviewType&&previous.framework===next.framework&&
   previous.machineSourceRevision===next.machineSourceRevision&&JSON.stringify(previous.machineCriteria)===JSON.stringify(next.machineCriteria)){
   // Editing the manuscript or its title cannot invalidate pending source questions.
   saved.revision++;saved.updated_at=D.now();
   saved.changes.push({change_id:D.id('change'),revision:saved.revision,operation:'edit_presentation',at:saved.updated_at,
    changes:[{previous_topic:before.reviewTopic,topic:after.reviewTopic,previous_paragraph:before.manuscriptParagraph,paragraph:after.manuscriptParagraph}]});
   next.eligibility_v3_revision=saved.revision;
   if(next.eligibilityV3Snapshot)next.eligibilityV3Snapshot={...next.eligibilityV3Snapshot,revision:saved.revision};
   return {project:saved,expectedRevision:saved.revision-1,expectedSignature:signature(previous)};
  }
  const scope=value=>({question:value.question,framework:value.framework,rows:clone((value.activeGenerator==='machine'?value.machineCriteria:value.criteria)||[]),topic:(value.activeGenerator==='machine'?value.machineRefinement:value.manualRefinement)?.reviewTopic,paragraph:(value.activeGenerator==='machine'?value.machineRefinement:value.manualRefinement)?.manuscriptParagraph});
  const rowsChanged=JSON.stringify(previous.activeGenerator==='machine'?previous.machineCriteria:previous.criteria)!==JSON.stringify(next.activeGenerator==='machine'?next.machineCriteria:next.criteria),decisionId=D.id('decision');
  const project=clone(saved),source=E.addSource(project,'human_answer',JSON.stringify({question:next.question,framework:next.framework,rows:next.activeGenerator==='machine'?next.machineCriteria:next.criteria,topic:(next.activeGenerator==='machine'?next.machineRefinement:next.manualRefinement)?.reviewTopic}),project.questions.filter(q=>q.active!==false).map(q=>q.question_id),null,{input_kind:'classic_author_revision',...(rowsChanged?{legacy_decision_id:decisionId}:{})});if(rowsChanged)project.classic_author_source_ref=E.ref(source);
  project.revision++;project.updated_at=D.now();project.status='input_saved';project.validation={valid:false,errors:[],blocking_issues:[],reason:'Author revised the established editor. The prior structured snapshot is retained for traceability; reanalysis must not overwrite these edits.'};
  project.decisions.push({decision_id:decisionId,source_ref:E.ref(source),issue_ids:[],answer_text:source.original_text,action:'classic_author_revision',revision:project.revision,at:project.updated_at,changes:[{old:scope(previous),new:scope(next)}]});project.changes.push({change_id:D.id('change'),revision:project.revision,operation:'classic_author_revision',at:project.updated_at,changes:[{source_ref:E.ref(source)}]});
  project.criteria=[];project.logic={questions:{},relation:project.question_relation};project.issues=[];project.elements.forEach(e=>e.active=false);next.eligibility_v3_revision=project.revision;next.eligibilityV3Snapshot={...next.eligibilityV3Snapshot,status:'input_saved',revision:project.revision,validation:clone(project.validation)};
  return {project,expectedRevision:saved.revision,expectedSignature:signature(previous)};
 }
 return {generate,publishedGeneration,decide,validate,transaction,recordEdit,refreshPresentation,current,projectToClassic:projectView,keys};
}
return {create,resetProject,currentEpoch,projectToClassic,signature,issueText,optionLabel,renderDescription:Methods.description};
});
