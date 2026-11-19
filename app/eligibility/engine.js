/* Eligibility v3: immutable transactions, independently configured frameworks/profiles and two-stage state. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./domain.js'):root.AIMSTEPEligibilityDomain,typeof module==='object'&&module.exports?require('./registries.js'):root.AIMSTEPEligibilityRegistries,typeof module==='object'&&module.exports?require('./methodology.js'):root.AIMSTEPEligibilityMethodology);if(typeof module==='object'&&module.exports)module.exports=api;else root.AIMSTEPEligibilityEngine=api;})(typeof window==='object'?window:globalThis,function(D,R,Methods){
'use strict';
const {clone,array,fail,id,now,key}=D;
const active=e=>e.active!==false;
const accepted=e=>active(e)&&['accepted_from_input','confirmed_by_user','accepted_by_authorized_rule'].includes(e.decision_status);
const CORE=['core_scope','population','sample','intervention','exposure','concept','condition','index_test','target_condition','phenomenon_of_interest'];
const OPTIONAL=['study_design','evidence_source','language','publication_date','report_format','sample_size','quality_score','full_text_access'];
function environment(frameworks,profiles){if(!frameworks&&typeof require==='function'){frameworks=require('../../config/eligibility-frameworks.json');profiles=require('../../config/eligibility-review-profiles.json');}return {frameworks:new R.FrameworkRegistry(frameworks),profiles:new R.ReviewProfileRegistry(profiles)};}
function configFor(state,env){for(const definition of state.custom_frameworks||[])env.frameworks.register(definition);return env;}
function create_project(projectId,options={}){return {schema_version:3,project_id:projectId||id('project'),revision:0,created_at:now(),updated_at:now(),output_language:options.output_language||'zh-CN',review_methods:[],question_relation:null,question_relation_source:null,questions:[],sources:[],elements:[],issues:[],decisions:[],criteria:[],snapshots:[],changes:[],processed_requests:{},custom_frameworks:[],authorized_rules:[],config_versions:{},status:'input_saved',validation:{valid:false,errors:[],blocking_issues:[]},model_calls:[],legacy_archive:null};}
function guard(state,base,request){if(request&&state.processed_requests[request])return {state,status:'duplicate',revision:state.revision};if(base!=null&&base!==state.revision)fail('VERSION_CONFLICT','update','The project changed while this request was running.',{base_revision:base,current_revision:state.revision});return null;}
function start(state,options={}){const duplicate=guard(state,options.base_revision,options.request_id);if(duplicate)return duplicate;const next=clone(state),unique=new Map();for(const element of next.elements){const prior=unique.get(element.element_id);if(!prior){unique.set(element.element_id,element);continue;}if(prior.question_id!==element.question_id||prior.dimension_id!==element.dimension_id)fail('DUPLICATE_ELEMENT_ID','update','The same element ID belongs to different semantic targets.');const score=e=>(active(e)?1000000:0)+(e.decision_status==='confirmed_by_user'?100000:0)+(e.revision||0),chosen=score(element)>=score(prior)?element:prior,discarded=chosen===element?prior:element;unique.set(element.element_id,chosen);next.integrity_repairs=[...(next.integrity_repairs||[]),{kind:'duplicate_element_id',at:now(),kept_revision:chosen.revision,archived_element:clone(discarded)}];}next.elements=[...unique.values()];return {state:next,status:'working'};}
function finish(state,operation,changes,options={}){state.revision++;state.updated_at=now();state.changes.push({change_id:id('change'),revision:state.revision,operation,at:state.updated_at,changes:clone(changes)});if(options.request_id)state.processed_requests[options.request_id]={revision:state.revision,operation};return state;}
function addSource(state,sourceType,text,questionIds=[],identity=null,metadata={}){
 const prior=identity?state.sources.filter(s=>s.identity===identity).sort((a,b)=>b.revision-a.revision)[0]:null;
 if(prior&&prior.original_text===text){
  const sameDocument=metadata.input_kind!=='original_document'||(metadata.name===prior.name&&metadata.page===prior.page&&metadata.verification===prior.verification&&JSON.stringify(questionIds)===JSON.stringify(prior.question_ids));
  if(sameDocument)return prior;
 }
 const source={source_id:prior?.source_id||id('source'),source_type:sourceType,original_text:String(text),revision:(prior?.revision||0)+1,created_at:now(),question_ids:questionIds,identity,...metadata};state.sources.push(source);return source;
}
function ref(source,quote=source.original_text){const pos=D.locate(source.original_text,quote);if(!pos)fail('QUOTE_NOT_FOUND','provenance','Cannot locate source quote.');return {source_id:source.source_id,source_revision:source.revision,quote,...pos};}
function save_input(original,input,options={},env=environment()){
 const tx=start(original,options);if(tx.status==='duplicate')return tx;const state=tx.state;D.object(input,'input');
 let entries=Array.isArray(input.questions)?input.questions:[{research_question:input.research_question,additional_requirements:input.additional_requirements,question_type:input.question_type,question_framework:input.question_framework,evidence_unit:input.evidence_unit}];
 const originalBlock=entries.length===1?entries[0].research_question:null;let manifest=null;if(originalBlock&&!state.decisions.length){const parts=originalBlock.split(/(?=^\s*(?:Q\d+[:.、]|\d+[.)、])\s*)/m).filter(part=>part.trim());if(parts.length>1&&parts.every(part=>/^\s*(?:Q\d+[:.、]|\d+[.)、])/.test(part))){manifest=addSource(state,'user_input',originalBlock,[],'original_input_block',{input_kind:'complete_original_question_block'});entries=parts.map(part=>({...entries[0],question_id:undefined,research_question:part}));state.original_input_refs=[ref(manifest)];}}
 if(!entries.length)fail('EMPTY_INPUT','input','At least one research question is required.');
 state.output_language=input.output_language||state.output_language;state.review_methods=array(input.review_method||state.review_methods);state.authorized_rules=clone(input.authorized_rules||state.authorized_rules||[]);if(input.legacy_archive&&!state.legacy_archive)state.legacy_archive=clone(input.legacy_archive);
 const questionIds=[];
 for(const [index,entry]of entries.entries()){
  const raw=D.text(entry.research_question,'research_question',60000);if(!raw.trim())fail('EMPTY_QUESTION','input','A research question cannot be empty.');
  let q=state.questions.find(q=>q.question_id===entry.question_id)||(!entry.question_id?state.questions[index]:null);
  if(!q){q={question_id:entry.question_id||id('question'),display_number:'RQ'+(state.questions.length+1),source_refs:[],element_ids:[],framework_mapping:null,logic:null,context:{},revision:1};state.questions.push(q);}else q.revision++;
  const prior=state.sources.find(s=>s.source_id===q.source_refs[0]?.source_id&&s.revision===q.source_refs[0]?.source_revision);
  const source=addSource(state,'user_input',raw,[q.question_id],'question:'+q.question_id,{input_kind:'research_question',...(manifest?{derived_from:[ref(manifest,raw)]}:{})});
  if(prior&&prior.revision!==source.revision)for(const e of state.elements.filter(e=>e.question_id===q.question_id&&e.decision_status!=='confirmed_by_user'))e.active=false;
  const previousEvidenceUnits=JSON.stringify(q.context.evidence_units||[]);q.original_text=raw;q.source_refs=[ref(source)];q.context={...q.context,review_methods:array(entry.review_method||input.review_method||state.review_methods),review_method_inherited:!entry.review_method,question_types:array(entry.question_type||input.question_type),evidence_units:array(entry.evidence_unit||input.evidence_unit),framework_requested:entry.question_framework??input.question_framework??null};
  if(previousEvidenceUnits!==JSON.stringify(q.context.evidence_units)){for(const element of state.elements.filter(e=>e.question_id===q.question_id&&e.context_managed))element.active=false;delete q.evidence_unit_source_ref;delete q.evidence_unit_decision_id;}
  const explicitContext=Object.fromEntries(['review_methods','question_types','evidence_units','framework_requested'].map(field=>[field,clone(q.context[field])]));const contextSource=addSource(state,'user_input',JSON.stringify(explicitContext),[q.question_id],'context:'+q.question_id,{input_kind:'explicit_context_fields'});q.context_source_ref=ref(contextSource);
  const extra=[...(Array.isArray(input.questions)?array(input.additional_requirements):[]),...array(entry.additional_requirements)];q.document_input_only=!!input.document_input_only;q.additional_source_refs=[];q.imported_source_refs=[];for(const [n,value]of extra.entries()){const s=addSource(state,'user_input',typeof value==='string'?value:value.text,[q.question_id],'additional:'+q.question_id+':'+n,{input_kind:'additional_requirement'});q.additional_source_refs.push(ref(s));}
  if(state.legacy_archive&&index===0){
   const legacy=state.legacy_archive;for(const [si,doc]of (legacy.machineRefinement?.audit?.sources||[]).entries()){if(!doc.text||doc.name==='Question / voice input')continue;const source=addSource(state,'user_input',doc.text,[q.question_id],'legacy_document:'+q.question_id+':'+(doc.id||si),{input_kind:'legacy_original_document',name:doc.name||'Imported original document',page:doc.page||null,verification:doc.verification||'original-text',legacy_sha256:doc.sha256||null});q.imported_source_refs.push(ref(source));}
   const rows=(legacy.activeGenerator==='machine'?legacy.machineCriteria:legacy.criteria)||[];
   for(const [di,decision]of (legacy.finalCriteria?.decisions||[]).entries()){
    if(!decision.rule)continue;const row=rows.find(row=>row.title===decision.domain),field=decision.side==='exclude'||decision.decision==='fails'?'uncertain':'condition';
    if(!row||!key(row[field]).includes(key(decision.rule)))continue;
    const did='legacy-'+(decision.at||di)+'-'+di,source=addSource(state,'human_answer',decision.rule,[q.question_id],'legacy_author_decision:'+q.question_id+':'+did,{legacy_decision_id:did,legacy_recorded_at:decision.at||null});
    q.additional_source_refs.push(ref(source));
    if(!state.decisions.some(d=>d.decision_id===did))state.decisions.push({decision_id:did,issue_ids:[],source_ref:ref(source),answer_text:decision.rule,action:'import_prior_author_decision',revision:state.revision+1,at:decision.at||now(),changes:[],legacy_provenance:clone(decision)});
   }
  }
  questionIds.push(q.question_id);
 }
 for(const rule of state.authorized_rules){if(!rule.name||typeof rule.content!=='string'||!rule.content.trim()||!rule.version||rule.scope==null)fail('INVALID_AUTHORIZED_RULE','input','Authorized rules need name, content, scope and version.');const scope=rule.scope;if(scope!=='project'&&(typeof scope!=='object'||!['question_ids','review_methods','question_types'].some(field=>Array.isArray(scope[field])&&scope[field].length)))fail('INVALID_RULE_SCOPE','input','Rule scope must explicitly name the project, question IDs, methods or question types.');if(scope.question_ids?.some(qid=>!questionIds.includes(qid)))fail('INVALID_RULE_SCOPE','input','An authorized rule references an unknown question ID.');rule.rule_id=rule.rule_id||id('rule');const qs=scope==='project'?questionIds:array(scope.question_ids||[]);addSource(state,'authorized_rule',rule.content,qs,'authorized:'+rule.rule_id+':'+rule.version,{rule_id:rule.rule_id,rule_version:rule.version,scope:clone(scope)});}
 if(input.question_relation){if(!['all_of','any_of'].includes(input.question_relation))fail('INVALID_ENUM','input','question_relation must be all_of or any_of.');state.question_relation=input.question_relation;state.question_relation_source=ref(addSource(state,'user_input',input.question_relation,questionIds,'project_question_relation'));}
 if(input.custom_frameworks)for(const f of input.custom_frameworks){env.frameworks.register(f);state.custom_frameworks=state.custom_frameworks.filter(old=>old.framework_id!==f.framework_id).concat(clone(f));}
 state.questions.forEach(q=>q.active=questionIds.includes(q.question_id));state.status='input_saved';state.config_versions={frameworks:env.frameworks.version,profiles:env.profiles.version};finish(state,'save_input',[{question_ids:questionIds}],options);return {state,status:state.status};
}
function activeRuleSource(state,source){return state.authorized_rules.some(rule=>rule.rule_id===source.rule_id&&rule.version===source.rule_version&&rule.content===source.original_text)&&!state.sources.some(other=>other.identity===source.identity&&other.revision>source.revision);}
function sourceApplies(source,q){if(source.question_ids?.length&&!source.question_ids.includes(q.question_id))return false;if(source.source_type!=='authorized_rule')return true;const scope=source.scope;if(scope==='project')return true;if(scope.review_methods?.length&&!scope.review_methods.some(m=>q.context.review_methods.includes(m)))return false;if(scope.question_types?.length&&!scope.question_types.some(t=>q.context.question_types.includes(t)))return false;return true;}
function extraction_payload(state,env=environment()){
 configFor(state,env);
 return {project_id:state.project_id,base_revision:state.revision,output_language:state.output_language,frameworks:env.frameworks.list(),review_profiles:env.profiles.list(),questions:state.questions.filter(active).map(q=>{
  // For attachment-only input, the combined question is an index. Cite each
  // original page once, restricted to the applicable numbered subquestion.
  const refs=[...(q.document_input_only?[]:q.source_refs),...q.additional_source_refs,...(q.imported_source_refs||[])];
  const sources=state.sources.flatMap(s=>{
   if(!sourceApplies(s,q))return [];
   const ref=refs.find(r=>r.source_id===s.source_id&&r.source_revision===s.revision);
   if(!ref)return s.source_type==='authorized_rule'&&activeRuleSource(state,s)?[s]:[];
   if(q.document_input_only&&s.input_kind==='original_document'&&ref.quote!==s.original_text){
    return [{...s,original_text:ref.quote,start_codepoint:ref.start}];
   }
   return [s];
  });
  return {question_id:q.question_id,original_text:q.original_text,document_input_only:!!q.document_input_only,context:q.context,sources,confirmed_elements:state.elements.filter(e=>e.question_id===q.question_id&&e.decision_status==='confirmed_by_user'&&active(e))};
 }),question_relation:state.question_relation};
}
function resolve_review_context(q,candidate,env){
 const context=clone(q.context),types=array(candidate.question_types||context.question_types);if(!context.question_types.length)context.question_types=types;
 if(!context.review_methods.length)context.review_method_candidates=array(candidate.review_methods);if(!context.evidence_units.length)context.evidence_unit_candidates=array(candidate.evidence_units);
 let resolved=env.frameworks.resolve(context.framework_requested,{question_types:context.question_types,dimensions:(candidate.elements||[]).map(e=>e.dimension_id.split('.')[0])});
 if(!context.framework_requested){const options=array(candidate.framework_candidates).map(x=>typeof x==='string'?{framework_id:x,basis:'model_mapping_suggestion'}:x).filter(x=>env.frameworks.get(x.framework_id));const selected=options[0]||{framework_id:'pico',basis:'provisional_presentation_only'};resolved={framework:env.frameworks.get(selected.framework_id),candidates:options.map(x=>env.frameworks.get(x.framework_id)),basis:selected.basis||'candidate_mapping',explicit:false};}
 return {context,framework_mapping:{framework_id:resolved.framework?.framework_id||null,display_name:resolved.framework?.display_name||null,version:resolved.framework?.version||null,candidates:resolved.candidates.map(f=>({framework_id:f.framework_id,display_name:f.display_name})),basis:resolved.basis,explicit:resolved.explicit,provisional:!resolved.explicit,source_refs:resolved.explicit&&q.context_source_ref?[clone(q.context_source_ref)]:clone(q.source_refs)}};
}
function explicitOutcomeRequirement(refs){return /必须.{0,12}(?:测量|报告|提供)|仅纳入.{0,18}(?:测量|报告)|\b(?:must|required to|only studies that)\b.{0,35}\b(?:measure|report|provide)\b/i.test(D.quoteText(refs));}
function positiveRestriction(text){return /仅.{0,10}(?:阳性|显著|有效)|\b(?:only|must).{0,25}(?:positive|significant|effective results)/i.test(text);}
function normalizeTopic(value,original,language){
 let text=String(value||original).trim().replace(/[.。\s]+$/,'');
 if(language.startsWith('zh'))return (/^(?:本综述|本研究|该研究)/.test(text)?text:'本综述研究'+text.replace(/^(?:研究|探讨|考察)/,''))+'。';
 return text.replace(/^(?:This review|This study)\s+(?:examines|evaluates|assesses)\s+(?:evidence concerning\s+)?/i,'').replace(/^./,c=>c.toUpperCase());
}
function ensureAnalysisFocus(state,q){
 const source=D.sourceAt(state,q.source_refs[0]),p=Methods.plan(q.original_text);if(!source)return;
 for(const [dimension,quote,text]of [['analysis_method',p.nma,'network meta-analysis (NMA)'],['analysis_data_unit',p.ipd,'individual participant data (IPD)'],['analysis_objective',p.rank,state.elements.some(e=>active(e)&&e.question_id===q.question_id&&e.dimension_id==='intervention')?'rank the effects of the interventions':'perform the planned ranking']]){
  if(!quote||state.elements.some(e=>active(e)&&e.question_id===q.question_id&&e.dimension_id===dimension&&e.semantic_role==='review_focus'&&e.information_status==='explicit'&&e.source_refs?.length&&accepted(e)))continue;
  const eid=D.stableId('element',q.question_id+'|'+dimension+'|'+source.source_id+'|'+source.revision),prior=state.elements.find(e=>e.element_id===eid),element={element_id:eid,question_id:q.question_id,dimension_id:dimension,raw_text:quote,normalized_text:text,structured_value:null,source_refs:[ref(source,quote)],semantic_role:'review_focus',information_status:'explicit',decision_status:'accepted_from_input',scope_status:'unspecified',framework_bindings:[],related_issue_ids:[],source_decision_ids:[],source_rule_ids:[],revision:(prior?.revision||0)+1,active:true,methodology_rule_id:'analysis_plan_is_not_eligibility'};
  if(prior)Object.assign(prior,element);else state.elements.push(element);
 }
}
function elementFromCandidate(state,q,c,env){
 D.validate_candidate_element(c);const refs=D.validate_provenance(state,c.source_refs,q.question_id,{allowEmpty:c.information_status==='missing'||c.scope_status==='not_applicable'&&!!c.applicability_basis});
 const sources=[...new Set(refs.map(r=>D.sourceAt(state,r)))];for(const source of sources)if(!sourceApplies(source,q)||source.source_type==='authorized_rule'&&!activeRuleSource(state,source))fail('RULE_OUTSIDE_SCOPE','provenance','An authorized rule is outside its declared scope.');
 // Equivalent occurrences add evidence locations, not distinct eligibility conditions.
 const citations=refs.map(r=>[r.source_id,r.source_revision,r.quote]);
 const distinct=[...new Map(citations.map(citation=>[JSON.stringify(citation),citation])).values()];
 const candidateKey=links=>JSON.stringify([q.question_id,c.dimension_id,links,c.normalized_text,c.semantic_role,c.disposition,c.scope_conditions||[],c.exceptions||[]]);
 const identity=candidateKey(distinct);
 let old=state.elements.find(e=>e.original_candidate_key===identity);
 if(!old&&distinct.length<citations.length){
  const legacyKey=candidateKey(citations);
  old=state.elements.find(e=>e.original_candidate_key===legacyKey);
 }
 if(old?.decision_status==='confirmed_by_user')return {...clone(old),active:true};
 const e={...clone(c),element_id:old?.element_id||D.stableId('element',identity),original_candidate_key:identity,question_id:q.question_id,raw_text:D.quoteText(refs,'\n'),source_refs:refs,framework_bindings:[],related_issue_ids:[],revision:(old?.revision||0)+1,active:true,scope_conditions:clone(c.scope_conditions||[]),exceptions:clone(c.exceptions||[]),source_rule_ids:sources.filter(s=>s.source_type==='authorized_rule').map(s=>s.rule_id),source_decision_ids:sources.filter(s=>s.legacy_decision_id).map(s=>s.legacy_decision_id)};
 if(c.source_occurrence_alternatives?.length){
  e.source_occurrence_alternatives=c.source_occurrence_alternatives.map(alternative=>{
   const [context]=D.validate_provenance(state,[alternative],q.question_id);
   const match=refs.find(r=>r.source_id===context.source_id&&r.source_revision===context.source_revision&&r.start===alternative.match_start&&r.end===alternative.match_end&&r.quote===alternative.match_quote);
   if(!match||match.start<context.start||match.end>context.end)fail('QUOTE_OFFSET_MISMATCH','provenance','A candidate occurrence must lie within its quoted source context.');
   const [heading]=alternative.heading?D.validate_provenance(state,[alternative.heading],q.question_id):[];
   if(heading&&(heading.source_id!==context.source_id||heading.source_revision!==context.source_revision||heading.end>context.start))fail('QUOTE_OFFSET_MISMATCH','provenance','A passage heading must precede the passage in the same source revision.');
   return {...context,match_start:match.start,match_end:match.end,match_quote:match.quote,reference_index:alternative.reference_index,...(heading&&{heading})};
  });
  e.source_occurrence_pending=true;
  e.source_occurrence_section=e.disposition==='exclude'?'exclude':['review_focus','background_information'].includes(e.semantic_role)?'focus':'include';
  // Only the literal quotation can be stated until the author clarifies its use.
  e.normalized_text=[...new Set(e.source_occurrence_alternatives.map(a=>a.match_quote))].join(' / ');
  e.decision_status='pending';e.information_status='ambiguous';e.semantic_role='background_information';e.scope_status='unspecified';
  e.disposition=null;e.structured_value=null;e.scope_conditions=[];e.exceptions=[];
  return e;
 }
 delete e.confidence;e.decision_status=c.information_status==='explicit'&&c.semantic_review?.status==='supported'?(sources.some(s=>s.legacy_decision_id)?'confirmed_by_user':sources.some(s=>s.source_type==='authorized_rule')?'accepted_by_authorized_rule':'accepted_from_input'):'pending';
 if(e.semantic_role==='eligibility_condition'&&e.scope_status==='unspecified'&&e.information_status!=='missing'&&refs.length){e.initial_scope_status=e.scope_status;e.scope_status='restricted';e.metadata_corrections=[...(e.metadata_corrections||[]),{field:'scope_status',from:'unspecified',to:'restricted',basis:'A present source-backed eligibility condition is a restriction; its unresolved boundaries remain separate.'}];}
 if(c.information_status==='missing'){e.scope_status='unspecified';e.decision_status='proposed';}
 if(e.scope_status==='unrestricted'&&!/不限|不限制|无限制|any language|no .{0,20}restriction|unrestricted|all (?:languages|designs)/i.test(e.raw_text)){
  // Repair an unsupported metadata label from the already verified source, without
  // a model retry or a new author decision. Never infer an explicit waiver.
  const scope=e.semantic_role==='eligibility_condition'&&e.information_status!=='missing'&&refs.length?'restricted':'unspecified';
  e.metadata_corrections=[...(e.metadata_corrections||[]),{field:'scope_status',from:'unrestricted',to:scope,basis:'The source does not explicitly waive this restriction; retain its stated scope.'}];e.scope_status=scope;
  if(/^(?:unrestricted|any (?:language|design)|no .{0,20}restrictions?|不限|不限制|无限制)[.。\s]*$/i.test(e.normalized_text.trim())){e.metadata_corrections.push({field:'normalized_text',from:e.normalized_text,to:e.raw_text,basis:'Restore the source wording instead of an unsupported no-restriction claim.'});e.normalized_text=e.raw_text;}
 }
 if(e.scope_status==='not_applicable'&&!e.applicability_basis&&!/不适用|not applicable/i.test(e.raw_text))fail('MISSING_APPLICABILITY_BASIS','normalization','Not applicable needs a recorded basis.');
 const analysis=Methods.classifyAnalysis(e,sources.map(s=>s.original_text).join(' '));
 if(analysis){if(e.semantic_role!=='review_focus'||e.dimension_id!==analysis.dimension_id||e.scope_status!=='unspecified'||e.disposition!==null)e.metadata_corrections=[...(e.metadata_corrections||[]),{field:'semantic_role',from:e.semantic_role,to:'review_focus',basis:'The source describes the analysis plan/data level, without an independent study eligibility requirement.'}];Object.assign(e,analysis,{semantic_role:'review_focus',scope_status:'unspecified',disposition:null,framework_bindings:[],methodology_rule_id:'analysis_plan_is_not_eligibility'});}
 Methods.restoreAge(e);
 D.check_semantics(e,refs);
 if(e.dimension_id.split('.')[0]==='outcome'){
  e.outcome_use=e.outcome_use||'interest';if(!['interest','measurement_required','reporting_required'].includes(e.outcome_use))fail('INVALID_ENUM','schema','Invalid outcome use.');
  if(e.outcome_use!=='interest'&&!explicitOutcomeRequirement(refs)){e.semantic_role='undecided';e.information_status='ambiguous';e.decision_status='pending';e.role_issue=true;}
  else if(e.outcome_use==='interest'&&!explicitOutcomeRequirement(refs))e.semantic_role='review_focus';
 }
 if(positiveRestriction(e.normalized_text)&&!positiveRestriction(e.raw_text)){e.proposed_restriction=e.normalized_text;e.normalized_text=e.raw_text;e.semantic_role='review_focus';e.information_status='explicit';e.decision_status='accepted_from_input';e.role_issue=true;}
 if(e.semantic_role==='eligibility_condition'&&e.scope_status==='restricted')e.normalized_text=conditionText(e.normalized_text,e.disposition);
 return e;
}
function ingest_candidates(original,response,options={},env=environment()){
 const tx=start(original,options);if(tx.status==='duplicate')return tx;const state=tx.state;configFor(state,env);D.object(response,'extraction');if(!Array.isArray(response.questions))fail('INVALID_STRUCTURE','extraction','questions must be an array.');
 const seen=new Set();for(const candidate of response.questions){
  const q=state.questions.find(q=>q.question_id===candidate.question_id&&active(q));if(!q||seen.has(q.question_id))fail('INVALID_QUESTION_REFERENCE','extraction','A question is missing, duplicated or outside this project.');seen.add(q.question_id);
  if(!Array.isArray(candidate.elements)||!candidate.framework_candidates)fail('INVALID_STRUCTURE','extraction','Each question needs elements and framework_candidates.');
  const resolved=resolve_review_context(q,candidate,env);q.context=resolved.context;q.framework_mapping=resolved.framework_mapping;q.review_topic=normalizeTopic(candidate.review_topic,q.original_text,state.output_language);
  const map=new Map();for(const c of candidate.elements){if(map.has(c.candidate_id))fail('DUPLICATE_ELEMENT_ID','extraction','Candidate IDs must be unique within a question.');const e=elementFromCandidate(state,q,c,env);map.set(c.candidate_id,e.element_id);const old=state.elements.findIndex(x=>x.element_id===e.element_id);if(old<0)state.elements.push(e);else state.elements[old]=e;}
  const incomingIds=new Set(map.values());
  for(const e of currentElements(state,q))if(e.decision_status!=='confirmed_by_user'&&!incomingIds.has(e.element_id))e.active=false;
  ensureAnalysisFocus(state,q);
  q.element_ids=currentElements(state,q).map(e=>e.element_id);
  const candidateIds=new Set(map.keys());
  const mappedTree=tree=>{D.validate_expression(tree,candidateIds);return mapCandidateLogic(tree,map);};
  q.logic=candidate.logic?mappedTree(candidate.logic):null;
  q.unresolved_fragment_logic=null;
  if(!q.logic&&candidate.unresolved_fragment_logic?.branches?.length>1){
   const pending=candidate.unresolved_fragment_logic,branches=pending.branches.map(mappedTree);
   const alternativeIds=new Set(),expectedLeaves=new Set(branches.flatMap(D.walkLeaves));
   const alternatives=array(pending.alternatives).map(item=>{
    const tree=mappedTree(item.tree),leaves=new Set(D.walkLeaves(tree));
    if(!item.option_id||alternativeIds.has(item.option_id)||!item.label||leaves.size!==expectedLeaves.size||[...expectedLeaves].some(id=>!leaves.has(id)))fail('INVALID_LOGIC_OPTION','logic','Each grouping choice must identify a distinct option and cover all its conditions.');
    alternativeIds.add(item.option_id);
    return {option_id:item.option_id,label:item.label,tree};
   });
   const proposed={branches,...(alternatives.length?{alternatives}:{})},previous=q.fragment_logic_decision;
   if(previous&&JSON.stringify(previous.proposed)===JSON.stringify(proposed))q.logic=clone(previous.tree);
   else q.unresolved_fragment_logic=proposed;
  }
  q.model_issues=clone(candidate.issues||[]).map(issue=>({...issue,element_ids:array(issue.element_candidate_ids).map(eid=>map.get(eid)).filter(Boolean)}));
 }
 if(state.questions.filter(active).some(q=>!seen.has(q.question_id)))fail('MISSING_QUESTION','extraction','The model omitted a research question.');
 if(response.question_relation&&!state.question_relation){if(!['all_of','any_of'].includes(response.question_relation))fail('INVALID_ENUM','extraction','Invalid project relationship.');state.question_relation_candidate=response.question_relation;}
 finish(state,'stage_one',[{questions:[...seen]}],options);rebuild(state,env,{recordTopicNormalization:true});return {state,status:state.status};
}
function mapCandidateLogic(node,map){if(node.op==='predicate')return {op:'predicate',element_id:map.get(node.element_id)};const children=node.children.map(child=>mapCandidateLogic(child,map));return children.length===1&&node.op!=='not'?children[0]:{op:node.op,children};}
function createIssue(state,desired,data){
 const signature=[data.question_id||'project',data.reason_code,data.trigger_rule_id,(data.element_ids||[]).slice().sort().join(',')].join('|');let issue=state.issues.find(i=>i.signature===signature);
 if(!issue){issue={issue_id:D.stableId('issue',signature),signature,question_id:data.question_id||null,element_ids:[],options:[],status:'open',created_at_revision:state.revision,resolved_by_decision_id:null,...data};state.issues.push(issue);}else if(issue.status!=='resolved'){if(issue.status==='obsolete')issue.reopened_at_revision=state.revision;Object.assign(issue,data);delete issue.linked_element_ids;delete issue.model_questions;issue.status='open';}
 if(issue.status==='resolved'&&!data.reopen)return issue;
 desired.add(issue.issue_id);for(const eid of issue.element_ids){const e=state.elements.find(e=>e.element_id===eid);if(e&&!e.related_issue_ids.includes(issue.issue_id))e.related_issue_ids.push(issue.issue_id);}return issue;
}
function issueData(question,reason,elements,rule,text,impact,blocking=true,options=[]){return {question_id:question?.question_id||null,element_ids:elements.map(e=>e.element_id),reason_code:reason,trigger_rule_id:rule,question_text:text,scope_impact:impact,blocking,options};}
function sourceOccurrenceIssue(q,e){
 const alternatives=e.source_occurrence_alternatives,groups=new Set(alternatives.map(a=>a.reference_index));
 const text=groups.size===1?'Which passage defines the intended rule, and how should it be applied?':'What rule should apply across these passages? Include any limits or exceptions.';
 const options=groups.size===1?alternatives.map(a=>{
  const clause=D.occurrenceClause(a),characters=Array.from(clause.quote);
  const before=characters.slice(0,a.match_start-clause.start).join(''),after=characters.slice(a.match_end-clause.start).join('');
  return {option_id:D.stableId('passage',JSON.stringify([a.source_id,a.source_revision,a.match_start,a.match_end])),
   label:(a.heading?a.heading.quote+' — ':'')+before+'«'+a.match_quote+'»'+after,source_occurrence_ref:a,requires_interpretation:true};
 }):[];
 return {...issueData(q,'AMBIGUOUS_MEANING',[e],'source_occurrence',text,'The same words occur in different contexts. Clarify the meaning before applying this item.',true,options),author_scope_review:true};
}
// Match the requested decision, its effect on eligibility and its scope. Shared elements alone
// only identify where to present questions; they do not make two decisions interchangeable.
function decisionWording(value){
 return key(value).replace(/^(?:please (?:clarify|specify|confirm)\s+|请(?:确认|说明|明确)\s*)/u,'')
  .replace(/\bwhich\b/g,'what').replace(/\b(?:cut[ -]?off|cutpoint)\b/g,'threshold')
  .replace(/\b(?:assessment instrument|assessment tool)\b/g,'assessment')
  .replace(/\b(?:should be used to|is used to)\s+/g,'').replace(/\bdefines\b/g,'define').trim();
}
function issueTarget(e){
 return JSON.stringify([e.dimension_id,key(e.normalized_text),e.structured_value,e.disposition,e.scope_conditions||[],e.exceptions||[]]);
}
function authorTargetGroups(state,issue){
 if(!issue.trigger_rule_id?.startsWith('model_issue:')||issue.element_ids.length<2)return [];
 const groups=new Map();
 for(const id of issue.element_ids){
  const e=state.elements.find(item=>item.element_id===id&&active(item));
  if(!e)continue;
  const signature=e.source_decision_target?.key||issueTarget(e);
  if(!groups.has(signature))groups.set(signature,[]);
  groups.get(signature).push(id);
 }
 return [...groups.values()];
}
function confirmedNonScreeningFocus(e){
 if(!accepted(e)||e.information_status!=='explicit'||e.role_issue||e.semantic_role!=='review_focus')return false;
 return e.methodology_rule_id==='analysis_plan_is_not_eligibility'||(e.dimension_id.split('.')[0]==='outcome'&&e.outcome_use==='interest'&&!explicitOutcomeRequirement(e.source_refs));
}
const optionalLimitQuestions=[
 {dimension:'language',subject:/\b(?:(?:publication|report|study) )?languages?\b|语种|(?:发表|出版)?语言/u,source:/\blanguages?\b|\b(?:translated?|translation|english|chinese|french|spanish|german|japanese)\b|\b(?:available|written|published|reported) in\b|语种|(?:英|中|法|德|日|韩|西班牙)文|语言/iu},
 {dimension:'publication_date',subject:/\bpublication (?:dates?|years?)\b|(?:发表|出版)(?:时间|日期|年份)/u,source:/\b(?:publish\w*|publication|dates?)\b|\b(?:18|19|20)\d{2}\b|发表|出版|日期|年份/iu}
];
function asksForUnmentionedLimit(issue,q,known,state){
 if(issue.reason_code!=='MISSING_REQUIRED_DECISION')return false;
 const wording=key(issue.question_text),limit=optionalLimitQuestions.find(item=>item.subject.test(wording));
 if(!limit||known.some(e=>e.dimension_id.split('.')[0]===limit.dimension))return false;
 const request=wording.replace(limit.subject,'@');
 if(!/^(?:(?:should (?:there be|we (?:apply|impose|add)) (?:any |a )?|are there (?:any )?|what |which )@ (?:limits?|restrictions?)(?: (?:apply|are needed|should apply))?|(?:是否|需要|要不要)(?:对|限定|限制)?@(?:作出|进行|有)?(?:限制|限定)?)$/u.test(request))return false;
 const refs=[...(q.source_refs||[]),...(q.additional_source_refs||[]),...(q.imported_source_refs||[])];
 return !refs.some(ref=>limit.source.test(ref.quote))&&!state.sources.some(s=>s.source_type==='authorized_rule'&&activeRuleSource(state,s)&&sourceApplies(s,q)&&limit.source.test(s.original_text));
}
function modelIssueGroups(q,known,state){
 const byId=new Map(known.map(e=>[e.element_id,e])),groups=new Map();
 for(const issue of q.model_issues||[]){
  if(!D.ENUMS.reason_code.includes(issue.reason_code))fail('INVALID_ENUM','clarification','Unknown issue reason.');
  if(asksForUnmentionedLimit(issue,q,known,state))continue;
  const elements=array(issue.element_ids).map(id=>byId.get(id)).filter(Boolean);
  if((issue.element_candidate_ids?.length||issue.element_ids?.length)&&!elements.length)continue;
  if(elements.length&&elements.every(confirmedNonScreeningFocus)&&issue.reason_code!=='PROPOSED_RESTRICTION')continue;
  // Equivalent targets in separate source passages can have different element IDs.
  const scope=[...new Set(elements.map(e=>{
   if(e.source_decision_target?.dimension!==e.dimension_id)e.source_decision_target={dimension:e.dimension_id,key:issueTarget(e)};
   return e.source_decision_target.key;
  }))].sort();
  const wording=decisionWording(issue.question_text),impact=decisionWording(issue.scope_impact),advice=issue.reason_code==='PROPOSED_RESTRICTION';
  // A specific question already names its decision. For generic or unbound
  // questions the impact may be the only detail identifying what is being decided.
  const namesSubject=/\b(?:of|for|define|about) (?!(?:eligibility|inclusion|this|that|these|those)\b|the (?:following|study|review|scope|criteria)\b)\S+|(?:定义|界定|判断|诊断|评估).{2,}/u.test(wording);
  const identity=JSON.stringify([wording,scope.length&&namesSubject?'':impact,scope,advice]);
  const group=groups.get(identity)||{identity,issue,scope,wording,namesSubject,elements:new Map(),options:new Map(),aliases:[]};
  for(const e of elements)group.elements.set(e.element_id,e);
  for(const option of array(issue.options)){
   const value=typeof option==='string'?option:option?.label||option?.text;
   if(typeof value!=='string'||!value.trim())continue;
   const side=option?.side||option?.disposition;
   const label=['include','exclude'].includes(side)&&!option?.label?side+' '+value:value;
   const wording=key(label);group.options.set(wording,{option_id:D.stableId('answer',wording),label:label.trim(),requires_interpretation:true});
  }
  group.aliases.push({reason_code:issue.reason_code,question_text:issue.question_text,scope_impact:issue.scope_impact,element_ids:elements.map(e=>e.element_id),options:clone(array(issue.options))});
  groups.set(identity,group);
 }
 return [...groups.values()].map(group=>({...group,elements:[...group.elements.values()],options:[...group.options.values()]}));
}
function previousModelIssue(saved,group,data,advice){
 if(saved.question_id!==data.question_id||!saved.element_ids.every(id=>data.element_ids.includes(id)))return false;
 const prefix=advice?'model_advice:':'model_issue:';
 if(!saved.trigger_rule_id?.startsWith(prefix))return false;
 const wording=decisionWording(saved.question_text),impact=decisionWording(saved.scope_impact);
 if(wording===group.wording&&(group.scope.length&&group.namesSubject||impact===decisionWording(group.issue.scope_impact))){
  const previous=JSON.stringify([wording,impact,group.scope,advice]);
  if(saved.trigger_rule_id===prefix+D.stableId('decision',previous))return true;
 }
 return group.aliases.some(alias=>saved.reason_code===alias.reason_code&&saved.trigger_rule_id===prefix+key(alias.question_text)&&saved.element_ids.length===alias.element_ids.length&&saved.element_ids.every(id=>alias.element_ids.includes(id)));
}
function isOlderAgeDecision(group){
 if(!group.elements.some(e=>e.dimension_id==='population.age'||e.age_boundary_element_id))return false;
 const text=key(group.issue.question_text);
 if(/\b(?:maximum|upper|mean|median|average|subgroup|analysis|follow.up|onset|diagnos\w*)\b|最高|最大|平均|中位|亚组|随访|诊断/u.test(text))return false;
 return /\b(?:age (?:threshold|boundary|cut[ -]?off|limit)|minimum age|how old|at what age)\b|\b(?:define|defined|definition of)\b.{0,24}\b(?:older (?:people|adults?|patients?)|elderly)\b|年龄(?:界限|阈值|下限)|多少岁/u.test(text);
}
function sourceDefinesMinimumAge(group,known){
 if(!['AMBIGUOUS_BOUNDARY','AMBIGUOUS_MEANING','MISSING_REQUIRED_DECISION'].includes(group.issue.reason_code))return false;
 const text=decisionWording(group.issue.question_text);
 if(!/^(?:what (?:is )?(?:the )?(?:minimum age|age threshold)(?: (?:for (?:eligibility|inclusion)|defines? older (?:people|adults|patients)))?|最低(?:纳入)?年龄(?:是)?多少岁?)$/u.test(text))return false;
 const bounds=new Set();
 const defined=group.elements.every(e=>{
  const age=e.age_boundary_element_id?known.find(item=>item.element_id===e.age_boundary_element_id):e;
  if(age?.dimension_id!=='population.age'||!accepted(age)||age.information_status!=='explicit'||age.exceptions?.length||age.scope_conditions?.length)return false;
  const lower=D.structuredConstraints(age.structured_value,age.dimension_id).filter(c=>['>','>='].includes(c.operator));
  for(const c of lower)bounds.add(JSON.stringify(D.canonical(c)));
  return lower.length===1;
 });
 return defined&&bounds.size===1;
}
function unrepresentedSourceOr(elements){
 return elements.some(e=>{
  const predicate=key(e.normalized_text);
  return e.source_refs.some(ref=>{
   const quote=key(ref.quote);
   if(!D.hasOr(quote))return false;
   // Alternatives retained inside one criterion cannot imply that all of
   // the question's population, intervention and comparison are alternatives.
   if(!predicate||!D.hasOr(predicate))return true;
   return !predicate.includes(quote)&&D.hasOr(quote.replace(predicate,' '));
  });
 });
}
function matchingRuleIssue(state,q,group,desired){
 const ids=group.elements.map(e=>e.element_id),text=key(group.issue.question_text);
 if(!ids.length)return null;
 return state.issues.find(issue=>{
  if(issue.question_id!==q.question_id||issue.reason_code!==group.issue.reason_code||(!desired.has(issue.issue_id)&&issue.status!=='resolved')||ids.length!==issue.element_ids.length||!ids.every(id=>issue.element_ids.includes(id)))return false;
  if(issue.trigger_rule_id==='same_scope_conflict')return /\b(?:conflict|which requirement|which limit|which threshold|take precedence)\b|冲突|以哪|采用哪/u.test(text);
  if(['semantic_role','source_scope_role'].includes(issue.trigger_rule_id))return /\bfocus\b/.test(text)&&/\beligib(?:le|ility)\b/.test(text)||text.includes('研究关注')&&text.includes('资格');
  return (issue.trigger_rule_id==='source_or_relation'||issue.trigger_rule_id.startsWith('fragment_relation:'))&&/\b(?:together|alternatives|all or any|any or all)\b|共同满足|任一满足/u.test(text);
 });
}
function attachModelIssue(issue,group){
 if(issue.status!=='open')return;
 issue.model_questions=[...(issue.model_questions||[]),...group.aliases];
 const ids=group.elements.map(e=>e.element_id);
 issue.linked_element_ids=[...new Set([...issue.element_ids,...(issue.linked_element_ids||[]),...ids])];
 for(const e of group.elements)if(!e.related_issue_ids.includes(issue.issue_id))e.related_issue_ids.push(issue.issue_id);
 const labels=new Set(issue.options.map(o=>key(o.label)));
 for(const option of group.options)if(!labels.has(key(option.label))){issue.options.push(option);labels.add(key(option.label));}
}
function makeMissing(state,q,dimension,env){let e=state.elements.find(e=>e.question_id===q.question_id&&e.dimension_id===dimension&&e.information_status==='missing'&&active(e))||state.elements.find(e=>e.question_id===q.question_id&&e.dimension_id===dimension&&e.information_status==='missing');if(e)e.active=true;if(!e){e={element_id:D.stableId('element',q.question_id+'|missing|'+dimension),question_id:q.question_id,dimension_id:dimension,raw_text:'',normalized_text:'',structured_value:null,source_refs:[],semantic_role:'background_information',information_status:'missing',decision_status:'proposed',scope_status:'unspecified',framework_bindings:env.frameworks.map(dimension,env.frameworks.get(q.framework_mapping?.framework_id)),related_issue_ids:[],revision:1,active:true,source_decision_ids:[],source_rule_ids:[],information_basis:{kind:'unmentioned_dimension',rule_id:'optional_unspecified',framework_version:env.frameworks.version}};state.elements.push(e);}if(!q.element_ids.includes(e.element_id))q.element_ids.push(e.element_id);return e;}
function currentElements(state,q){return state.elements.filter(e=>e.question_id===q.question_id&&active(e));}
// Incompatible bounds in alternative inclusion branches can both be legitimate.
function separateInclusionBranches(tree,a,b){
 if(!tree||a.disposition!=='include'||b.disposition!=='include')return false;
 function membership(node){
  if(node.op==='predicate')return {a:node.element_id===a.element_id,b:node.element_id===b.element_id,together:false};
  const children=node.children.map(membership);
  const hasA=children.some(child=>child.a),hasB=children.some(child=>child.b);
  const together=children.some(child=>child.together)||node.op!=='any_of'&&children.some((child,i)=>child.a&&children.some((other,j)=>i!==j&&other.b));
  return {a:hasA,b:hasB,together};
 }
 const found=membership(tree);
 return found.a&&found.b&&!found.together;
}
function comparisonConflict(elements){const result=[];for(let i=0;i<elements.length;i++)for(let j=i+1;j<elements.length;j++){
 const a=elements[i],b=elements[j];if(a.dimension_id!==b.dimension_id||JSON.stringify(a.scope_conditions||[])!==JSON.stringify(b.scope_conditions||[]))continue;
 if((a.scope_status==='unrestricted'&&b.scope_status==='restricted')||(b.scope_status==='unrestricted'&&a.scope_status==='restricted')){result.push([a,b]);continue;}
 if(key(a.normalized_text)===key(b.normalized_text)&&a.disposition!==b.disposition){result.push([a,b]);continue;}
 if(a.disposition==='include'&&b.disposition==='include'){
  const ac=D.structuredConstraints(a.structured_value,a.dimension_id).map(D.canonical),bc=D.structuredConstraints(b.structured_value,b.dimension_id).map(D.canonical);
  for(const x of ac)for(const y of bc){if(x.unit!==y.unit)continue;const lower=['>','>='].includes(x.operator)?x:['>','>='].includes(y.operator)?y:null,upper=['<','<='].includes(x.operator)?x:['<','<='].includes(y.operator)?y:null;if(lower&&upper&&(lower.value>upper.value||lower.value===upper.value&&(lower.operator==='>'||upper.operator==='<')))result.push([a,b]);}
 }
 }return result;}
function detect_clarification_issues(state,env=environment()){
 configFor(state,env);const desired=new Set(state.issues.filter(i=>i.status==='open'&&i.persistent).map(i=>i.issue_id));for(const e of state.elements)e.related_issue_ids=[];
 for(const q of state.questions.filter(active)){
  const frame=env.frameworks.get(q.framework_mapping?.framework_id),elements=currentElements(state,q),profiles=env.profiles.resolve(q.context.review_methods);
  if(q.context.evidence_units.length&&!elements.some(e=>e.dimension_id==='evidence_source'&&e.information_status!=='missing')){
   const labels=state.output_language.startsWith('zh')?{primary_study:'原始研究',systematic_review:'系统评价',review:'综述',policy_document:'政策文件',other:'其他证据来源'}:{primary_study:'primary studies',systematic_review:'systematic reviews',review:'other reviews',policy_document:'policy documents',other:'other evidence sources'},e={element_id:D.stableId('element',q.question_id+'|evidence_source|'+JSON.stringify(q.context.evidence_units)+'|'+JSON.stringify(q.evidence_unit_source_ref||q.context_source_ref)),question_id:q.question_id,dimension_id:'evidence_source',context_managed:true,raw_text:q.context.evidence_units.join(', '),normalized_text:(state.output_language.startsWith('zh')?'证据单位：':'Evidence unit: ')+q.context.evidence_units.map(unit=>labels[unit]||unit).join(state.output_language.startsWith('zh')?'、':', '),structured_value:{values:clone(q.context.evidence_units)},source_refs:[clone(q.evidence_unit_source_ref||q.context_source_ref)],semantic_role:'eligibility_condition',information_status:'explicit',decision_status:q.evidence_unit_source_ref?'confirmed_by_user':'accepted_from_input',scope_status:'restricted',disposition:'include',framework_bindings:[],related_issue_ids:[],revision:1,source_decision_ids:q.evidence_unit_decision_id?[q.evidence_unit_decision_id]:[],source_rule_ids:[],active:true};state.elements.push(e);elements.push(e);q.element_ids.push(e.element_id);
  }
  if(!q.framework_mapping?.framework_id)createIssue(state,desired,issueData(q,'FRAMEWORK_AMBIGUITY',[],'case_sensitive_framework','请确认此问题使用的框架及字段含义。','影响问题字段的含义和必要决定。',true,(q.framework_mapping?.candidates||[]).map(f=>({option_id:f.framework_id,label:f.display_name,context_updates:{framework_id:f.framework_id}}))));
  for(const slot of frame?.slots||[])if(!slot.definition)createIssue(state,desired,issueData(q,'FRAMEWORK_AMBIGUITY',[],'custom_definition:'+slot.slot_id,'请定义自定义字段“'+(slot.display_label||slot.slot_id)+'”的含义。','决定该字段如何组织研究范围。',true,[]));
  const known=elements.filter(e=>e.information_status!=='missing');
  for(const dimension of [...(frame?.slots||[]).map(s=>s.slot_id),...OPTIONAL])if(!known.some(e=>e.dimension_id===dimension||e.dimension_id.startsWith(dimension+'.')))makeMissing(state,q,dimension,env);
  const modelGroups=modelIssueGroups(q,known,state);
  for(let e of known){
   if(e.source_occurrence_pending){createIssue(state,desired,sourceOccurrenceIssue(q,e));continue;}
   const hasAge=D.structuredConstraints(e.structured_value,e.dimension_id).some(c=>c.unit==='year'||c.unit==='岁')||/\d+\s*(?:岁|years?|year.old)/i.test(e.normalized_text);
   const older=/老年|elderly|older (?:adults?|patients?|people)/i.test(e.raw_text+' '+e.normalized_text);
   if(e.dimension_id.split('.')[0]==='population'&&older&&!hasAge&&e.scope_status==='restricted'&&!e.age_factored&&!e.qualitative_definition_confirmed){
    if(e.dimension_id!=='population.age'&&e.dimension_id.split('.')[0]==='population'){
     let age=state.elements.find(other=>other.question_id===q.question_id&&other.dimension_id==='population.age'&&active(other)&&other.information_status!=='missing');
     if(!age){age={...clone(e),element_id:D.stableId('element',e.element_id+'|age_boundary'),dimension_id:'population.age',normalized_text:state.output_language.startsWith('zh')?'年龄':'Age',base_normalized_text:state.output_language.startsWith('zh')?'年龄':'Age',structured_value:null,information_status:'ambiguous',decision_status:'pending',related_issue_ids:[],revision:1};const existing=state.elements.find(item=>item.element_id===age.element_id);if(existing){age.revision=existing.revision+1;Object.assign(existing,age);age=existing;}else state.elements.push(age);known.push(age);q.element_ids.push(age.element_id);}
     if(age.decision_status==='confirmed_by_user'&&age.scope_status==='unrestricted'){e.normalized_text=e.normalized_text.replace(/老年/g,'').replace(/\b(?:elderly|older)\s+(adults?|patients?|people)/gi,'$1');e.age_factored=true;e.age_boundary_element_id=age.element_id;e.explicit_revision=true;e.decision_status='confirmed_by_user';e.source_refs=[...e.source_refs,...age.source_refs];e.source_decision_ids=[...new Set([...(e.source_decision_ids||[]),...(age.source_decision_ids||[])])];continue;}
     if(age.qualitative_definition_confirmed){e.age_factored=true;e.age_boundary_element_id=age.element_id;e.qualitative_definition_confirmed=true;e.source_decision_ids=[...new Set([...(e.source_decision_ids||[]),...(age.source_decision_ids||[])])];continue;}
     if(age.decision_status!=='confirmed_by_user'){age.semantic_role='eligibility_condition';age.scope_status='restricted';if(!D.structuredConstraints(age.structured_value,age.dimension_id).length){age.information_status='ambiguous';age.decision_status='pending';}}
     e.age_factored=true;e.age_boundary_element_id=age.element_id;e.normalization_operations=[...(e.normalization_operations||[]),'age_boundary_tracked_separately_in_'+age.element_id];e=age;if(D.structuredConstraints(age.structured_value,age.dimension_id).length||/\d+\s*(?:岁|years?)/i.test(age.normalized_text))continue;
    }
    createIssue(state,desired,issueData(q,'AMBIGUOUS_BOUNDARY',[e],'population_age_boundary','本研究将老年人定义为多少岁及以上？','决定允许纳入的人群年龄范围。',true,[{option_id:'retain_original',label:'Retain older people as stated; do not add a numeric age threshold.',action:'retain_original'},{option_id:'unrestricted',label:'Remove the older-people restriction.',action:'unrestricted'}]));
   }
   else if(e.proposed_restriction)createIssue(state,desired,issueData(q,'PROPOSED_RESTRICTION',[e],'unsupported_positive_results_proposal','模型提出了额外的结果限制，是否明确授权？','仅限阳性或显著结果会改变资格范围；原研究目的本身并不授权这种限制。',false,[{option_id:'ignore',label:'不添加该限制，仅保留原研究关注内容',keep_existing:true},{option_id:'authorize',label:'明确授权：'+e.proposed_restriction,updates:[{element_id:e.element_id,normalized_text:e.proposed_restriction,semantic_role:'eligibility_condition',disposition:'include'}]}]));
   else if(e.role_issue||e.semantic_role==='undecided')createIssue(state,desired,issueData(q,'UNRESOLVED_ROLE',[e],'semantic_role','“'+e.normalized_text+'”是研究关注内容，还是纳入资格要求？','资格要求会排除不满足该条件的证据；关注内容用于提取或综合。',e.decision_status!=='proposed',[{option_id:'focus',label:'仅作为研究关注内容',updates:[{element_id:e.element_id,semantic_role:'review_focus'}]},{option_id:'eligibility',label:'作为纳入资格条件',updates:[{element_id:e.element_id,semantic_role:'eligibility_condition',disposition:'include'}]}]));
   else if(e.semantic_role==='eligibility_condition'&&(['ambiguous','conflicting'].includes(e.information_status)||e.decision_status==='pending')&&!modelGroups.some(group=>group.issue.reason_code===(e.information_status==='conflicting'?'CONFLICTING_REQUIREMENTS':'AMBIGUOUS_MEANING')&&group.elements.includes(e)))createIssue(state,desired,issueData(q,e.information_status==='conflicting'?'CONFLICTING_REQUIREMENTS':'AMBIGUOUS_MEANING',[e],'source_scope_ambiguity','请明确“'+e.normalized_text+'”应如何限定研究范围。','不同解释会改变可纳入的证据范围。',true,array(e.options)));
  }
  for(const e of known.filter(e=>['population','intervention','comparator'].includes(e.dimension_id)&&e.semantic_role==='review_focus'&&e.decision_status!=='confirmed_by_user'))createIssue(state,desired,issueData(q,'UNRESOLVED_ROLE',[e],'source_scope_role','Confirm whether this source-defined population, intervention or comparison defines study eligibility or is only a review focus.','The element remains visible and is not silently discarded.',true,[{option_id:'focus',label:'Review focus only',keep_existing:true},{option_id:'eligibility',label:'Eligibility condition',updates:[{element_id:e.element_id,semantic_role:'eligibility_condition',scope_status:'restricted',disposition:'include'}]}]));
  const configuredRules=[...profiles.flatMap(profile=>profile.required_decisions||[]),...(frame?.check_rules||[])];for(const rule of configuredRules){
   const when=rule.when||{};if(when.review_methods?.length&&!when.review_methods.some(value=>q.context.review_methods.includes(value))||when.question_types?.length&&!when.question_types.some(value=>q.context.question_types.includes(value))||when.present_dimensions?.some(dimension=>!known.some(e=>e.dimension_id===dimension))||when.absent_dimensions?.some(dimension=>known.some(e=>e.dimension_id===dimension)))continue;
   if(rule.kind==='advice')createIssue(state,desired,issueData(q,'PROPOSED_RESTRICTION',[],rule.rule_id,rule.description,rule.scope_impact||'可选方法学建议；尚未接受时不改变资格范围。',false,[]));
   if(rule.kind==='core_scope'&&!known.some(e=>(CORE.includes(e.dimension_id.split('.')[0])||e.framework_bindings.length&&!['comparator','outcome','design','research_type','evaluation'].includes(e.dimension_id.split('.')[0]))&&e.scope_status!=='not_applicable'))createIssue(state,desired,issueData(q,'MISSING_REQUIRED_DECISION',[makeMissing(state,q,'core_scope',env)],'core_research_scope','本问题拟研究的对象或核心概念是什么？','未明确核心对象或概念时无法形成可用资格范围。',true,[]));
   if(rule.kind==='dimension'&&!known.some(e=>e.dimension_id===rule.dimension_id&&e.scope_status!=='unspecified'))createIssue(state,desired,issueData(q,'MISSING_REQUIRED_DECISION',[makeMissing(state,q,rule.dimension_id,env)],rule.rule_id,rule.description,'此方法或框架配置要求明确该决定；可回答不限。',rule.blocking!==false,[]));
   if(rule.kind==='evidence_unit'&&!q.context.evidence_units.length&&!known.some(e=>e.dimension_id==='evidence_source'&&e.scope_status!=='unspecified'))createIssue(state,desired,issueData(q,'MISSING_REQUIRED_DECISION',[makeMissing(state,q,'evidence_source',env)],rule.rule_id,'本次伞状综述拟纳入哪些证据单位？','决定纳入系统评价、其他综述或其他证据来源。',true,[{option_id:'systematic_review',label:'系统评价',context_updates:{evidence_units:['systematic_review']}},{option_id:'review',label:'系统评价和其他综述',context_updates:{evidence_units:['systematic_review','review']}}]));
  }
  for(const type of q.context.question_types)for(const dimension of env.profiles.questionTypes[type]||[])if(!known.some(e=>e.dimension_id===dimension||e.dimension_id.startsWith(dimension+'.')))createIssue(state,desired,issueData(q,'MISSING_REQUIRED_DECISION',[makeMissing(state,q,dimension,env)],'question_type:'+type+':'+dimension,'请明确本问题中的 '+dimension+' 范围。','该要素用于确定本问题的核心研究范围。',true,[]));
  const eligible=known.filter(e=>accepted(e)&&e.semantic_role==='eligibility_condition'&&e.scope_status==='restricted');
  const branches=q.logic||(q.unresolved_fragment_logic?{op:'any_of',children:q.unresolved_fragment_logic.branches}:null);
  for(const pair of comparisonConflict(known.filter(e=>accepted(e)&&e.semantic_role==='eligibility_condition'&&['restricted','unrestricted'].includes(e.scope_status)))){
   if(separateInclusionBranches(branches,...pair))continue;
   createIssue(state,desired,issueData(q,'CONFLICTING_REQUIREMENTS',pair,'same_scope_conflict','这些条件在同一适用范围内相互冲突，应采用哪一项？','不能在最终标准中同时采用互相排斥的要求。',true,pair.map(e=>({option_id:e.element_id,label:e.normalized_text,keep_element_id:e.element_id,retire_element_ids:pair.filter(other=>other!==e).map(other=>other.element_id)}))));
  }
  if(q.logic)D.validate_expression(q.logic,new Set(known.map(e=>e.element_id)));
  if(q.unresolved_fragment_logic){
   const elementIds=new Set(q.unresolved_fragment_logic.branches.flatMap(D.walkLeaves));
   const pending=q.unresolved_fragment_logic,branchKey=D.stableId('branches',JSON.stringify(pending));
   const alternatives=pending.alternatives?.map(item=>({option_id:item.option_id,label:item.label,logic_tree:item.tree}));
   const prompt=alternatives?'How should these eligibility conditions be grouped?':'Should studies satisfy all of these groups of conditions or any one of them?';
   const choices=alternatives||[{option_id:'any_of',label:'Any one group',logic_op:'any_of'},{option_id:'all_of',label:'All groups',logic_op:'all_of'}];
   createIssue(state,desired,issueData(q,'UNCLEAR_LOGIC',known.filter(e=>elementIds.has(e.element_id)),'fragment_relation:'+branchKey,prompt,'This determines how the requirements from different source passages combine.',true,choices));
  }else if(eligible.length>1&&(!q.fragment_logic_decision||JSON.stringify(q.logic)!==JSON.stringify(q.fragment_logic_decision.tree))&&!D.treeHas(q.logic,'any_of')&&!eligible.some(e=>e.exceptions?.length)&&unrepresentedSourceOr(eligible))createIssue(state,desired,issueData(q,'UNCLEAR_LOGIC',eligible,'source_or_relation','这些条件是任一满足还是共同满足？','任一满足与共同满足会产生不同资格范围。',true,[{option_id:'any_of',label:'任一满足',logic_op:'any_of'},{option_id:'all_of',label:'共同满足',logic_op:'all_of'}]));
  for(const group of modelGroups){
   const {issue:modelIssue,elements:es}=group;
   if(modelIssue.reason_code==='MISSING_REQUIRED_DECISION'&&!es.length)continue;
   if(isOlderAgeDecision(group)){
    const ageIds=new Set(es.map(e=>e.age_boundary_element_id||e.element_id));
    const ageIssue=state.issues.find(issue=>issue.question_id===q.question_id&&issue.trigger_rule_id==='population_age_boundary'&&issue.element_ids.some(id=>ageIds.has(id))&&(desired.has(issue.issue_id)||issue.status==='resolved'));
    if(ageIssue){attachModelIssue(ageIssue,group);continue;}
    if(sourceDefinesMinimumAge(group,known))continue;
   }
   const ruleIssue=matchingRuleIssue(state,q,group,desired);
   if(ruleIssue){attachModelIssue(ruleIssue,group);continue;}
   const advice=modelIssue.reason_code==='PROPOSED_RESTRICTION';
   const data=issueData(q,modelIssue.reason_code,es,(advice?'model_advice:':'model_issue:')+D.stableId('decision',group.identity),modelIssue.question_text,modelIssue.scope_impact||'Clarify the original eligibility scope before applying this condition.',!advice,[]);
   // Reuse saved author decisions and open IDs from before semantic grouping was introduced.
   const signature=[q.question_id,data.reason_code,data.trigger_rule_id,data.element_ids.slice().sort().join(',')].join('|');
   if(!state.issues.some(i=>i.signature===signature)){
    const priorIssues=state.issues.filter(i=>previousModelIssue(i,group,data,advice));
    const prior=priorIssues.find(i=>i.status==='resolved')||priorIssues[0];
    if(prior)prior.signature=signature;
   }
   const issue=createIssue(state,desired,data);attachModelIssue(issue,group);
  }
 }
 if(state.questions.filter(active).length>1&&!state.question_relation)createIssue(state,desired,issueData(null,'UNCLEAR_LOGIC',[],'between_question_relation','多个子问题的资格范围采用任一满足还是共同满足？','决定多个子问题之间的逻辑分支关系。',true,[{option_id:'any_of',label:'任一满足',project_relation:'any_of'},{option_id:'all_of',label:'共同满足',project_relation:'all_of'}]));
 for(const issue of state.issues)if(issue.status==='open'&&!desired.has(issue.issue_id)){issue.status='obsolete';issue.obsolete_at_revision=state.revision;issue.obsolete_reason='The triggering condition no longer applies.';}
 return state.issues.filter(i=>i.status==='open');
}
function conditionText(value,disposition){const text=String(value||'').trim();return disposition==='exclude'?text.replace(/^(?:exclude|excluding|do not include)\s+|^排除[:：]?\s*/i,''):text.replace(/^(?:include|including)\s+|^(?:仅纳入|纳入)[:：]?\s*/i,'');}
function build_criteria(state){
 const old=new Map(state.criteria.map(c=>[c.source_element_ids.join('|')+'|'+c.disposition,c]));const criteria=[];
 const byMeaning=new Map();
 for(const e of state.elements.filter(e=>accepted(e)&&e.semantic_role==='eligibility_condition'&&e.scope_status==='restricted')){
  const signature=e.element_id+'|'+e.disposition,prior=old.get(signature);
  const c={criterion_id:prior?.criterion_id||D.stableId('criterion',signature),question_ids:[e.question_id],disposition:e.disposition,dimension_id:e.dimension_id,text:e.normalized_text,expression:null,structured_value:clone(e.structured_value),scope_conditions:clone(e.scope_conditions||[]),exceptions:clone(e.exceptions||[]),source_element_ids:[e.element_id],source_decision_ids:clone(e.source_decision_ids||[]),source_rule_ids:clone(e.source_rule_ids||[]),revision:prior?(prior.text===e.normalized_text?prior.revision:prior.revision+1):1};
  c.expression={op:'predicate',criterion_id:c.criterion_id};if(c.exceptions.length||c.scope_conditions.length)c.expression.qualifiers={exceptions:clone(c.exceptions),applies_to:clone(c.scope_conditions)};
  // An identical phrase may describe two different roles or numeric bounds.
  const meaning=JSON.stringify([e.question_id,c.dimension_id,c.disposition,key(c.text),c.structured_value,c.scope_conditions,c.exceptions]);
  const duplicate=byMeaning.get(meaning);
  if(duplicate){
   duplicate.source_element_ids.push(e.element_id);
   duplicate.source_decision_ids=[...new Set([...duplicate.source_decision_ids,...c.source_decision_ids])];
   duplicate.source_rule_ids=[...new Set([...duplicate.source_rule_ids,...c.source_rule_ids])];
  }else{
   byMeaning.set(meaning,c);
   criteria.push(c);
  }
 }
 state.criteria=criteria;state.logic={questions:{},relation:state.question_relation};
 for(const q of state.questions.filter(active)){
  const cs=criteria.filter(c=>c.question_ids.includes(q.question_id)),inc=cs.filter(c=>c.disposition==='include'),exc=cs.filter(c=>c.disposition==='exclude');const map=new Map(inc.flatMap(c=>c.source_element_ids.map(e=>[e,c.criterion_id])));
  let inclusion=q.logic?D.mapExpression(q.logic,map):null;const covered=new Set(D.walkLeaves(q.logic));const extra=inc.filter(c=>!c.source_element_ids.some(e=>covered.has(e))).map(c=>({op:'predicate',criterion_id:c.criterion_id}));
  const exclusion=exc.length?{op:'any_of',children:exc.map(c=>({op:'predicate',criterion_id:c.criterion_id}))}:null;
  if(q.unresolved_fragment_logic){
   const branches=q.unresolved_fragment_logic.branches,known=new Set(branches.flatMap(D.walkLeaves));
   const unbound=inc.filter(c=>!c.source_element_ids.some(e=>known.has(e))).map(c=>({op:'predicate',criterion_id:c.criterion_id}));
   state.logic.questions[q.question_id]={include:null,exclude:exclusion,eligibility:null,pending_inclusion_branches:[...branches.map(branch=>D.mapExpression(branch,map)).filter(Boolean),...unbound]};
   continue;
  }
  if(!inclusion)inclusion=extra.length?{op:'all_of',children:extra}:null;else if(extra.length)inclusion={op:'all_of',children:[inclusion,...extra]};
  state.logic.questions[q.question_id]={include:inclusion,exclude:exclusion,eligibility:inclusion&&exclusion?{op:'all_of',children:[inclusion,{op:'not',children:[exclusion]}]}:inclusion|| (exclusion?{op:'not',children:[exclusion]}:null)};
 }
 return criteria;
}
function validate_criteria(state){
 const errors=[];for(const c of state.criteria){const es=c.source_element_ids.map(eid=>state.elements.find(e=>e.element_id===eid));if(es.some(e=>!e||!accepted(e)||!c.question_ids.includes(e.question_id)))errors.push({code:'INVALID_CRITERION_SOURCE',criterion_id:c.criterion_id});
  for(const e of es.filter(Boolean))try{D.validate_provenance(state,e.source_refs,e.question_id);D.check_semantics(e,e.source_refs,{human:e.decision_status==='confirmed_by_user'});}catch(error){errors.push({code:error.code,criterion_id:c.criterion_id,message:error.message});}
  if(es[0]&&c.text!==es[0].normalized_text)errors.push({code:'TEXT_STRUCTURE_MISMATCH',criterion_id:c.criterion_id});
 }
 for(const [qid,logic]of Object.entries(state.logic?.questions||{}))for(const expr of [logic.include,logic.exclude,logic.eligibility].filter(Boolean))try{D.validate_expression(expr,new Set(state.criteria.filter(c=>c.question_ids.includes(qid)).map(c=>c.criterion_id)),'criterion_id');}catch(error){errors.push({code:error.code,message:error.message});}
 const blocking=state.issues.filter(i=>i.status==='open'&&i.blocking).map(i=>i.issue_id);for(const q of state.questions.filter(active))if(!state.criteria.some(c=>c.question_ids.includes(q.question_id))&&!blocking.length)errors.push({code:'NO_ELIGIBILITY_CRITERIA',question_id:q.question_id,message:'No usable eligibility clause was extracted; review scope roles against the original input.'});
 const unchecked=state.elements.filter(e=>active(e)&&e.information_status==='explicit'&&e.semantic_role==='eligibility_condition'&&e.scope_status==='restricted'&&!accepted(e));
 for(const e of unchecked)if(!state.issues.some(i=>i.status==='open'&&i.element_ids.includes(e.element_id)))errors.push({code:'UNACCOUNTED_REQUIREMENT',element_id:e.element_id});
 const completeness={framework:state.questions.filter(active).map(q=>({question_id:q.question_id,mapped:!!q.framework_mapping?.framework_id,missing_slots:state.elements.filter(e=>active(e)&&e.question_id===q.question_id&&e.information_status==='missing'&&e.framework_bindings.length).map(e=>e.dimension_id)})),eligibility:{blocking_issues:blocking,all_scope_information_accounted_for:!unchecked.length||unchecked.every(e=>e.related_issue_ids.length)}};
 return {valid:!errors.length&&!blocking.length,errors,blocking_issues:blocking,completeness,semantic_accuracy:'Program checks plus a separate model review; not a formal equivalence proof or expert validation.'};
}
function rebuild(state,env=environment(),{recordTopicNormalization=false}={}){for(const q of state.questions.filter(active)){const elements=currentElements(state,q);Methods.normalizeComparators(elements.filter(e=>!e.source_occurrence_pending));const frame=env.frameworks.get(q.framework_mapping?.framework_id);for(const e of elements)e.framework_bindings=env.frameworks.map(e.dimension_id,frame);}detect_clarification_issues(state,env);for(const q of state.questions.filter(active)){const objective=Methods.topic(q,currentElements(state,q));if(objective){if(recordTopicNormalization)q.topic_normalization={previous:q.review_topic,basis:'Source-defined scope and analysis objectives',rule_id:'source_grounded_analysis_topic'};q.review_topic=objective;}}build_criteria(state);state.validation=validate_criteria(state);state.status=state.validation.errors.length?'validation_error':state.validation.blocking_issues.length?'needs_clarification':'final';const snapshot={snapshot_id:id('snapshot'),revision:state.revision,output_language:state.output_language,review_methods:clone(state.review_methods),created_at:now(),status:state.status,config_versions:clone(state.config_versions),question_relation:state.question_relation,questions:clone(state.questions.filter(active)),criteria:clone(state.criteria),elements:clone(state.elements.filter(active)),logic:clone(state.logic),issue_ids:state.issues.filter(i=>i.status==='open').map(i=>i.issue_id),issues:clone(state.issues),decision_ids:state.decisions.map(d=>d.decision_id),validation:clone(state.validation)};state.snapshots.push(snapshot);return state;}
function valueText(value,language){if(!value)return '';const ops={gt:'>',gte:'≥',lt:'<',lte:'≤',eq:'='};if(value.operator==='between')return (value.lower_inclusive===false?'(':'[')+value.lower+', '+value.upper+(value.upper_inclusive===false?')':']')+' '+(value.unit||'');return (ops[value.operator]||value.operator||'')+String(value.value??'')+(language.startsWith('zh')&&['year','years'].includes(value.unit)?'岁':value.unit?' '+value.unit:'');}
function directedWording(wording,heading){
 const text=wording.trim();
 const directive=text.match(/^(?:we\s+)?(?:(?:will|must|should)\s+)?(do not include|exclude|include|inclusion criteria|exclusion criteria|纳入标准|排除标准|不纳入|排除|纳入)(?=\s|[:：]|[\u3400-\u9fff])/i);
 const governing=directive?.[1]||(/^(?:(?:inclusion|exclusion)(?: criteria)?|纳入(?:条件|标准)?|排除(?:条件|标准)?)$/i.test(heading)?heading:null);
 const direction=governing&&(/^(?:do not include|exclude|exclusion|不纳入|排除)/i.test(governing)?'exclude':'include');
 return {direction,content:directive?text.slice(directive[0].length).replace(/^\s*[:：]\s*/,'').trim():text};
}
function passageWording(passage){
 return directedWording(D.occurrenceClause(passage).quote,passage.heading?.quote.trim().replace(/^#+\s*|[:：]$/g,'').trim());
}
function checkSelectedPassage(passage,update){
 const clause=D.occurrenceClause(passage),chars=Array.from(clause.quote);
 const before=chars.slice(0,passage.match_start-clause.start).join(''),after=chars.slice(passage.match_end-clause.start).join('');
 const {direction,content}=passageWording(passage);
 const issues=D.sourceDifferences(update.normalized_text,[content],true);
 const qualifiers=/\b(?:with|without|who|whose|receiving|during|after|before|only|if|unless|except|among|aged|at risk)\b|仅|如果|除非|除外|伴有|合并|接受|期间|之后|之前/iu;
 const reducedToMatch=key(update.normalized_text)===key(passage.match_quote)&&qualifiers.test(before+' '+after+' '+(passage.heading?.quote||''));
 if((direction&&(update.semantic_role!=='eligibility_condition'||update.disposition!==direction||update.scope_status!=='restricted'))||issues.length||reducedToMatch){
  fail('SOURCE_DECISION_INCOMPLETE','update','Please state the full intended rule, including its inclusion or exclusion direction and any limits or exceptions.');
 }
}
// A structured age bound may replace the display wording only when it describes
// the entire answer. Keep conditions, mixed populations and exceptions verbatim.
function authorAgeBound(wording){
 const simple=/^(?:(?:define (?:older|elderly) (?:people|adults|patients|participants) as |(?:participants? |patients? |adults? )?(?:age[d]? )?)?(?:at least |at most |(?:no )?more than |(?:no )?less than |older than |younger than |under |over |up to |[<>]=?\s*|[≥≤]\s*)?\d+(?:\.\d+)?\s*(?:years?|months?)(?: (?:of age|old))?(?: or (?:older|younger|more|less|above|below))?|(?:年龄)?(?:至少|至多|不少于|不超过|大于|小于|超过|[≥≤])?\s*\d+(?:\.\d+)?\s*岁(?:及?以上|及?以下)?)$/iu;
 if(!simple.test(wording.trim().replace(/[.。]+$/u,'').trim()))return null;
 const [bound]=D.sourceConstraints(wording);
 if(!bound?.unit)return null;
 return {operator:({'>':'gt','>=':'gte','<':'lt','<=':'lte','=':'eq'})[bound.operator],value:Number(bound.value),unit:bound.unit};
}
// Unbound model questions may elicit a new rule. Only the author's wording, or
// the direction of an explicit screening question, can establish its disposition.
function unboundAuthorAnswer(state,issue,answer){
 const text=answer.answer_text.trim(),question=issue.question_text||'',stated=directedWording(text);
 const subject=question.split(/\b(?:should|must|will|can)\b/iu)[0]||question;
 const dimensions=[
  ['study_design',/\bstudy designs?\b|\bstudies by design\b|研究设计/iu],
  ['population',/\b(?:populations?|participants?|patients?)\b|研究人群|研究对象/iu],
  ['intervention',/\binterventions?\b|干预措施/iu],['comparator',/\b(?:comparators?|comparison groups?)\b|对照组/iu],
  ['exposure',/\bexposures?\b|暴露因素/iu],['outcome',/\boutcomes?\b|结局指标/iu],
  ['language',/\blanguages?\b|语种|语言/iu],['publication_date',/\bpublication (?:years?|dates?)\b|发表(?:年份|日期)/iu]
 ].filter(([,pattern])=>pattern.test(subject));
 const scope=/\b(?:eligib\w*|screening|as (?:an? )?(?:inclusion|exclusion) criteri\w*)\b|筛选|资格标准|纳排标准/iu;
 const reporting=/\b(?:for|in|into|from) (?:the |our |a |an )?(?:(?:narrative|subgroup|sensitivity|primary|main|pooled) )?(?:analys(?:is|es)|synthesis|summary|discussion|appendix|tables?|figures?|data extraction)\b|(?:用于|写入|列入|在).{0,10}(?:分析|汇总|讨论|附录|图表)/iu;
 const reportingQuestion=/\b(?:summari[sz]e[ds]?|presented|tabulated|extract(?:ed|ion) (?:fields?|forms?)|statistical methods?|analysis plan)\b|如何(?:汇总|呈现|分析|报告)/iu.test(question);
 const directionInQuestion=question.match(/^\s*(?:which|what)\b[^?!.;]{1,90}?\s+(?:(?:should|must|can|will) be|are) (included|excluded)\b/iu)||
  question.match(/^\s*(?:应当?|需要)?(纳入|排除)哪些|^\s*哪些[^？。；]{1,24}?(?:应当?|需要)(纳入|排除)/u);
 const requested=directionInQuestion?.slice(1).find(Boolean);
 const questionDirection=requested&&!/\b(?:not|except|unless|or)\b|不应|除外|或者/iu.test(question)?(/excluded|排除/iu.test(requested)?'exclude':'include'):null;
 const note=/^(?:no|none|neither|nothing|yes|not applicable|no (?:additional |further )?(?:limits?|restrictions?|exclusions?|inclusions?)|无|没有|不适用)[.!。]?$/iu.test(text);
 const direction=stated.direction||(!note&&questionDirection);
 if(!direction||note||!scope.test(text)&&(reporting.test(text+' '+question)||reportingQuestion&&!scope.test(question))){
  answer.issue_note=true;return;
 }
 if(!stated.content.trim()||/^(?:it|them|these|those|this|that|这些|上述)[.!。]?$/iu.test(stated.content)){
  fail('SOURCE_DECISION_INCOMPLETE','update','Enter the full condition to include or exclude.');
 }
 const q=state.questions.find(item=>item.question_id===issue.question_id&&active(item));
 if(!q)fail('QUESTION_NOT_FOUND','update','A new eligibility condition needs an active research question.');
 const dimension=dimensions.length===1?dimensions[0][0]:'other',element_id=id('element');
 // The regular answer update attaches the exact human source, validates its
 // numeric semantics, records its decision and makes this predicate operative.
 state.elements.push({element_id,question_id:q.question_id,dimension_id:dimension,raw_text:text,normalized_text:'',
  structured_value:null,source_refs:[],scope_conditions:[],exceptions:[],framework_bindings:[],related_issue_ids:[],
  source_decision_ids:[],source_rule_ids:[],semantic_role:'undecided',information_status:'missing',
  scope_status:'unspecified',decision_status:'proposed',revision:0,active:true});
 q.element_ids.push(element_id);
 answer.updates=[{element_id,normalized_text:stated.content,semantic_role:'eligibility_condition',scope_status:'restricted',disposition:direction}];
}
function authorAnswer(state,issue,answer,option,env){
 const text=answer.answer_text.trim(),word=key(text);
 if(!option&&/^(?:defer|defer for now|keep pending|decide later|暂不决定|暂缓|稍后决定)$/.test(word)){answer.action='defer';return option;}
 if(!option&&['source_scope_role','semantic_role'].includes(issue.trigger_rule_id)){
  const id=/^(?:(?:make|use|treat) (?:this|it) (?:as )?(?:an? )?)?(?:eligibility (?:requirement|condition|criterion)|inclusion criterion|纳入条件|纳入标准)$/.test(word)?'eligibility':
   /^(?:review focus(?: only)?|focus only|仅作为研究关注内容|仅作研究关注)$/.test(word)?'focus':null;
  if(id)option=issue.options.find(choice=>choice.option_id===id);
 }
 if(option&&!option.requires_interpretation)return option;
 if(!option&&(['source_or_relation','between_question_relation'].includes(issue.trigger_rule_id)||issue.trigger_rule_id.startsWith('fragment_relation:'))){
  const op=/^(?:all|all groups|all conditions|all of them|together|and|全部|共同满足)$/.test(word)?'all_of':/^(?:any|any group|any condition|any one group|any of them|alternatives|or|任一|任一满足)$/.test(word)?'any_of':null;
  const choice=issue.options.find(o=>op&&(o.logic_op===op||o.project_relation===op));
  if(!choice)fail('UNRESOLVED_LOGIC','update','Choose the grouping that matches your decision.');
  return choice;
 }
 if(issue.trigger_rule_id.startsWith('custom_definition:'))return option;
 if(!option&&issue.trigger_rule_id==='case_sensitive_framework'){
  const frame=env.frameworks.resolve(text).framework;
  if(!frame)fail('FRAMEWORK_NOT_FOUND','update','Choose or enter the registered framework name, preserving its capitalisation.');
  answer.context_updates={framework_id:frame.framework_id};return option;
 }
 if(!issue.element_ids.length&&issue.question_id&&/^model_(?:issue|advice):/.test(issue.trigger_rule_id)){
  unboundAuthorAnswer(state,issue,answer);return option;
 }
 if(!issue.element_ids.length||issue.trigger_rule_id==='same_scope_conflict'||issue.trigger_rule_id.startsWith('ambiguous_answer_revision:')){
  if(issue.options.length)fail('OPTION_REQUIRED','update','Select the option that matches your decision.');
  // A project-level clarification has no eligibility predicate to rewrite.
  answer.issue_note=true;return option;
 }
 const e=state.elements.find(item=>item.element_id===issue.element_ids[0]&&active(item));
 if(!e)fail('ELEMENT_NOT_FOUND','update','This author check has changed.');
 if(!option&&/^(?:unrestricted|no (?:age )?(?:limit|restriction)s?|any age|不限|不限制|不限年龄|年龄不限|无年龄限制|无限制|不设限制)$/.test(word)){
  const stored=issue.options.find(o=>o.action==='unrestricted');
  if(stored)return stored;
  // A generic "unrestricted" applies to a dimension only when the check asks for its scope.
  if(issue.reason_code==='MISSING_REQUIRED_DECISION'||issue.trigger_rule_id==='population_age_boundary'){
   answer.action='unrestricted';return option;
  }
 }
 const passage=option?.source_occurrence_ref;
 const stated=passage?passageWording(passage):directedWording(text);
 const focus=!passage&&text.match(/^(?:review focus(?: only)?|关注内容|研究关注)[:：]\s*(.+)$/isu);
 const section=stated.direction||answer.passage_role||(focus?'focus':null);
 const update={element_id:e.element_id};
 // A direction answers a role or passage question. In an ordinary definition
 // check, an instruction such as ‘Include people diagnosed by…’ adds detail
 // to the existing rule and cannot silently replace its population or limits.
 const setsRole=e.information_status==='missing'||issue.reason_code==='UNRESOLVED_ROLE'||
  ['source_scope_role','semantic_role','population_age_boundary'].includes(issue.trigger_rule_id);
 if(e.source_occurrence_pending||section&&setsRole){
  if(!section)fail('SOURCE_DECISION_INCOMPLETE','update','Choose how to use this passage, or enter the full rule starting with Include or Exclude.');
  if(section==='focus'){update.semantic_role='review_focus';update.scope_status='unspecified';}
  else{update.semantic_role='eligibility_condition';update.scope_status='restricted';update.disposition=section;}
  update.normalized_text=focus?focus[1]:stated.content;
  update.structured_value=null;
 }else if(issue.trigger_rule_id==='population_age_boundary'){
  update.normalized_text=text;update.structured_value=authorAgeBound(text);
 }else{
  // A clarification of a definition supplements the original condition. Other
  // restrictions and previous answers on the same element remain in the rule.
  const previous=e.normalized_text?.trim();
  const supplement=previous&&e.information_status!=='missing'&&(e.scope_status==='restricted'||e.semantic_role==='review_focus')&&
   !word.includes(key(previous));
  update.normalized_text=supplement?previous.replace(/[.。]+$/u,'')+(/[。！？，；\u3400-\u9fff]$/u.test(previous)?'。':'. ')+text:text;
  if(e.structured_value&&D.sourceConstraints(text).length)update.structured_value=null;
  if(e.semantic_role==='undecided'||e.role_issue||issue.trigger_rule_id==='source_scope_role'){
   fail('OPTION_REQUIRED','update','Choose the role for this item, or enter an explicit inclusion or exclusion rule.');
  }
 }
 answer.updates=[update];answer.explicit_revision=true;
 return option;
}
function answerUpdate(state,q,e,update,answer,source,issue){
 const old=clone(e),value=update.structured_value===undefined?e.structured_value:clone(update.structured_value),newRef=ref(source),support=D.validate_provenance(state,answer.supporting_refs||[],q.question_id,{allowEmpty:true});
 if(e.source_occurrence_pending){
  if(!update.normalized_text?.trim()||!['eligibility_condition','review_focus','background_information'].includes(update.semantic_role)||!update.scope_status||
   (update.semantic_role==='eligibility_condition'&&update.scope_status==='restricted'&&!['include','exclude'].includes(update.disposition))){
   fail('SOURCE_DECISION_INCOMPLETE','update','Please state the intended rule and whether it is an inclusion, exclusion or review focus.');
  }
  if(answer.selected_passage)checkSelectedPassage(answer.selected_passage,update);
  const choices=e.source_occurrence_alternatives;
  e.source_refs=e.source_refs.filter(r=>!choices.some(a=>r.source_id===a.source_id&&r.source_revision===a.source_revision&&r.quote===a.match_quote));
  delete e.source_occurrence_pending;delete e.source_occurrence_alternatives;delete e.source_occurrence_section;
 }
 if(update.structured_value!==undefined&&value){const probe={dimension_id:e.dimension_id,normalized_text:'',structured_value:value,semantic_review:{status:'supported'}};D.check_semantics(probe,[newRef,...support],{human:true});}
 if(update.normalized_text!==undefined)D.text(update.normalized_text,'normalized_text',2000);
 const numericChange=JSON.stringify(value)!==JSON.stringify(e.structured_value),explicitChange=(answer.action==='modify'||answer.explicit_revision===true||!!answer.modifies_decision_id)&&(!answer.from_model||/修改|改为|替换|修订|instead|replace|change .{0,20}to|revise/i.test(answer.answer_text));
 if((e.decision_status==='confirmed_by_user'||e.decision_status==='accepted_from_input'&&e.structured_value!=null)&&(numericChange||update.normalized_text&&update.normalized_text!==e.normalized_text)&&!explicitChange){
  const conflict={...issueData(q,'CONFLICTING_REQUIREMENTS',[e],'ambiguous_answer_revision:'+source.source_id,'新回答是否要替代之前已经确认的条件？','不明确修改意图时保留原决定，避免静默改写。',true,[]),signature:'answer_conflict|'+source.source_id,issue_id:id('issue'),status:'open',created_at_revision:state.revision+1,resolved_by_decision_id:null,persistent:true,proposed_update:clone(update),proposed_source_ref:newRef};
  conflict.options=[{option_id:'keep',label:'保留原决定',keep_existing:true},{option_id:'replace',label:'采用新回答并修改原决定',updates:[clone(update)],explicit_revision:true}];state.issues.push(conflict);return {applied:false,old,new:clone(e)};
 }
 if(update.scope_status)D.enumValue('scope_status',update.scope_status);
 if(update.semantic_role)D.enumValue('semantic_role',update.semantic_role);
 if(update.disposition)D.enumValue('disposition',update.disposition);
 const beforeText=e.base_normalized_text||(e.dimension_id==='population.age'?(state.output_language.startsWith('zh')?'年龄':'Age'):e.normalized_text);e.base_normalized_text=beforeText;
 e.structured_value=value;e.scope_status=update.scope_status||(e.information_status==='missing'?'restricted':e.scope_status);e.semantic_role=update.semantic_role|| (e.information_status==='missing'?'eligibility_condition':e.semantic_role);e.disposition=update.disposition||e.disposition||'include';
 if(old.source_occurrence_pending&&e.semantic_role!=='eligibility_condition'&&!update.disposition)e.disposition=null;
 e.normalized_text=update.normalized_text??(numericChange&&value?beforeText.replace(/（[^）]*）$|\s*\([^)]*\)$/,'')+(state.output_language.startsWith('zh')?'（':' (')+valueText(value,state.output_language)+(state.output_language.startsWith('zh')?'）':')'):e.normalized_text||answer.answer_text);
 if(e.scope_status==='unrestricted'||e.scope_status==='not_applicable')e.normalized_text=update.normalized_text||answer.answer_text;
 if(update.exceptions!==undefined)e.exceptions=clone(update.exceptions);if(update.scope_conditions!==undefined)e.scope_conditions=clone(update.scope_conditions);e.explicit_revision=explicitChange;e.source_refs=[...e.source_refs,...support,newRef];e.information_status='explicit';e.decision_status='confirmed_by_user';e.role_issue=false;e.revision++;e.active=true;
 if(e.semantic_role==='eligibility_condition'&&e.scope_status==='restricted')e.normalized_text=conditionText(e.normalized_text,e.disposition);D.check_semantics(e,e.source_refs,{human:true});return {applied:true,old,new:clone(e)};
}
function apply_decisions(original,request,env=environment()){
 const options={base_revision:request.base_revision,request_id:request.request_id},tx=start(original,options);if(tx.status==='duplicate')return tx;const state=tx.state;configFor(state,env);if(!request.request_id)fail('MISSING_REQUEST_ID','update','Answers require an idempotency request_id.');if(!Array.isArray(request.answers)||!request.answers.length)fail('EMPTY_ANSWER','update','No answers were supplied.');
 const changes=[];for(const incoming of request.answers){
  const answer=clone(incoming);D.text(answer.answer_text,'answer_text');if(!answer.answer_text.trim())fail('EMPTY_ANSWER','update','Save the actual answer text.');
  const issueIds=array(answer.issue_ids||answer.issue_id),issues=issueIds.map(iid=>state.issues.find(i=>i.issue_id===iid));if(issues.some(i=>!i))fail('ISSUE_NOT_FOUND','update','An answer references an unknown issue.');
  if(issues.some(i=>i.status==='obsolete'))fail('OBSOLETE_ISSUE','update','The issue is no longer applicable.');
  const qids=[...new Set([...issues.map(i=>i.question_id).filter(Boolean),...array(answer.question_ids)])],source=addSource(state,'human_answer',answer.answer_text,qids,null,{request_id:request.request_id,issue_ids:issueIds});
  const decision={decision_id:id('decision'),issue_ids:issueIds,source_ref:ref(source),answer_text:answer.answer_text,action:answer.action||'confirm',at:now(),revision:state.revision+1,changes:[],status:'applied'};
  const primary=issues[0];let option=null;if(answer.option_id){option=primary?.options?.find(o=>o.option_id===answer.option_id);if(!option)fail('OPTION_NOT_FOUND','update','The chosen answer option does not exist.');}
  if(answer.author_confirmed&&!answer.from_model&&issues.length===1){
   const groups=authorTargetGroups(state,primary);
   if(groups.length>1&&(!option||option.requires_interpretation)){
    const pending=groups.filter(group=>!group.every(id=>primary.answered_element_ids?.includes(id)));
    const selected=answer.target_id==='*'?pending:answer.target_id?pending.filter(group=>group.includes(answer.target_id)):pending.length===1?pending:[];
    if(!selected.length)fail('ANSWER_TARGET_REQUIRED','update','Choose which listed criteria this answer applies to.');
    const updates=[];
    for(const group of selected){
     const part={...answer};
     authorAnswer(state,{...primary,element_ids:group},part,option,env);
     for(const update of part.updates||[])for(const id of group)updates.push({...update,element_id:id});
     if(part.action)answer.action=part.action;
     if(part.explicit_revision)answer.explicit_revision=true;
    }
    answer.updates=updates;
    decision.target_element_ids=selected.flat();
   }else option=authorAnswer(state,primary,answer,option,env);
   decision.action=answer.action||option?.action||'confirm';
   if(option)decision.selected_option_id=option.option_id;
   if(answer.passage_role)decision.passage_role=answer.passage_role;
   if(answer.issue_note)decision.changes.push({question_id:primary.question_id,clarification:answer.answer_text});
  }
  if(primary?.trigger_rule_id?.startsWith('fragment_relation:')&&!option&&answer.action!=='defer'){
   const text=key(answer.answer_text);
   const op=['all','all groups','all conditions','all of them','together','全部','共同满足'].includes(text)?'all_of':['any','any group','any one group','any of them','alternatives','任一','任一满足'].includes(text)?'any_of':null;
   option=primary.options.find(item=>key(item.label)===text||op&&item.logic_op===op);
   if(!option)fail('UNRESOLVED_LOGIC','update','Select the grouping that should apply to these conditions.');
  }
  if(option?.requires_interpretation&&!(option.source_occurrence_ref&&answer.from_model)&&!(answer.author_confirmed&&!answer.from_model&&(answer.updates?.length||answer.issue_note)))fail('ANSWER_NEEDS_INTERPRETATION','update','Apply this choice to its source element before saving it.');
  if(answer.action==='defer'||option?.action==='defer'){decision.status='deferred';state.decisions.push(decision);changes.push(decision);continue;}
  if(option?.project_relation){state.question_relation=option.project_relation;state.question_relation_source=ref(source);}
  const targets=answer.updates||option?.updates||[];const rawContext=answer.context_updates||option?.context_updates,context=rawContext&&Object.keys(rawContext).length?rawContext:null;
  if(primary?.trigger_rule_id==='source_occurrence'&&(targets.length!==1||targets[0].element_id!==primary.element_ids[0])){
   fail('SOURCE_DECISION_INCOMPLETE','update','Please state the intended rule and whether it is an inclusion, exclusion or review focus.');
  }
  if(context){const q=state.questions.find(q=>q.question_id===(primary?.question_id||context.answer_question_id));if(!q)fail('QUESTION_NOT_FOUND','update','A context answer needs a specific question.');
   if(context.answer_question_id){state.issues.push({issue_id:id('issue'),signature:'mapped-answer|'+source.source_id,question_id:q.question_id,element_ids:[],reason_code:'UNRESOLVED_ROLE',question_text:'对应关系已确定，请明确这条回答如何更新本问题的具体条件。',scope_impact:'在语义更新尚不明确时，保留已有标准。',blocking:true,trigger_rule_id:'mapped_answer_requires_application',status:'open',persistent:true,created_at_revision:state.revision+1,source_refs:clone(primary.source_refs||[]),options:[]});decision.changes.push({original_answer_refs:clone(primary.source_refs||[]),mapped_question_id:q.question_id});}
   const previous=clone(q.context);if(context.framework_id){const frame=env.frameworks.get(context.framework_id);if(!frame)fail('FRAMEWORK_NOT_FOUND','update','Unknown framework.');q.context.framework_requested=frame.display_name;q.framework_mapping={framework_id:frame.framework_id,display_name:frame.display_name,version:frame.version,basis:'human_selection',explicit:true,provisional:false,candidates:[],source_refs:[ref(source)]};for(const e of currentElements(state,q))e.framework_bindings=env.frameworks.map(e.dimension_id,frame);}
   for(const field of ['review_methods','question_types','evidence_units'])if(context[field])q.context[field]=array(context[field]);if(context.evidence_units){q.evidence_unit_source_ref=ref(source);q.evidence_unit_decision_id=decision.decision_id;for(const e of currentElements(state,q))if(e.context_managed&&e.dimension_id==='evidence_source')e.active=false;}decision.changes.push({question_id:q.question_id,old:previous,new:clone(q.context),framework:clone(q.framework_mapping)});
  }
  if(primary?.trigger_rule_id?.startsWith('custom_definition:')){const q=state.questions.find(q=>q.question_id===primary.question_id),frame=clone(env.frameworks.get(q.framework_mapping.framework_id)),slot=frame.slots.find(s=>s.slot_id===primary.trigger_rule_id.split(':')[1]);slot.definition=answer.answer_text;frame.version=frame.version+'+decision';q.framework_mapping.version=frame.version;env.frameworks.register(frame);state.custom_frameworks=state.custom_frameworks.filter(f=>f.framework_id!==frame.framework_id).concat(frame);decision.changes.push({framework_id:frame.framework_id,slot_id:slot.slot_id,definition:slot.definition});}
  if(option?.logic_op||option?.logic_tree){
   const q=state.questions.find(q=>q.question_id===primary.question_id);
   const pending=primary.trigger_rule_id.startsWith('fragment_relation:')&&q.unresolved_fragment_logic;
   q.logic=option.logic_tree?clone(option.logic_tree):{op:option.logic_op,children:pending?clone(pending.branches):primary.element_ids.map(element_id=>({op:'predicate',element_id}))};
   if(pending){q.fragment_logic_decision={tree:clone(q.logic),proposed:clone(pending),decision_id:decision.decision_id};q.unresolved_fragment_logic=null;}
   decision.changes.push({question_id:q.question_id,logic:clone(q.logic)});
  }
  if(option?.retire_element_ids){for(const eid of option.retire_element_ids){const e=state.elements.find(e=>e.element_id===eid);e.active=false;e.revision++;decision.changes.push({element_id:eid,old:clone(e),new:{active:false}});}}
  const action=answer.action||option?.action;
  if(action==='retain_original'&&primary?.trigger_rule_id==='population_age_boundary')for(const eid of primary.element_ids){const age=state.elements.find(e=>e.element_id===eid&&active(e));const related=[age,...state.elements.filter(e=>active(e)&&e.age_boundary_element_id===eid)];for(const e of related){const old=clone(e);e.qualitative_definition_confirmed=true;e.decision_status='confirmed_by_user';e.source_refs.push(ref(source));e.source_decision_ids=[...(e.source_decision_ids||[]),decision.decision_id];e.revision++;if(e===age){e.semantic_role='background_information';e.boundary_resolution='original_wording_accepted';}decision.changes.push({element_id:e.element_id,old,new:clone(e),applied:true});}}

  if(['unrestricted','not_applicable'].includes(action))for(const eid of decision.target_element_ids||primary?.element_ids||[])targets.push({element_id:eid,scope_status:action,normalized_text:answer.answer_text,structured_value:null});
  if(!targets.length&&!option&&!context&&!decision.changes.length&&primary?.element_ids.length===1&&!answer.from_model)targets.push({element_id:primary.element_ids[0],normalized_text:answer.answer_text});
  if(!targets.length&&!option&&!context&&!decision.changes.length){
   state.issues.push({issue_id:id('issue'),signature:'unmatched|'+source.source_id,reason_code:'UNRESOLVED_ROLE',question_id:null,element_ids:[],question_text:'这条回答对应哪个问题或要素？',scope_impact:'先确认回答适用范围，再更新标准。',blocking:true,trigger_rule_id:'unmatched_human_answer',status:'open',persistent:true,created_at_revision:state.revision+1,source_refs:[ref(source)],options:state.questions.filter(active).map(q=>({option_id:q.question_id,label:q.display_number,context_updates:{answer_question_id:q.question_id}}))});decision.status='needs_mapping';
  }
  // Equivalent source records kept separate for provenance share the same confirmed answer.
  if(primary?.model_questions?.length&&primary.element_ids.length>1&&targets.length){
   const linked=state.elements.filter(e=>active(e)&&primary.element_ids.includes(e.element_id));
   const supplied=new Set(targets.map(update=>update.element_id));
   for(const update of targets.slice()){
    const original=linked.find(e=>e.element_id===update.element_id);
    if(!original)continue;
    for(const equivalent of linked)if(!supplied.has(equivalent.element_id)&&issueTarget(equivalent)===issueTarget(original)){
     targets.push({...clone(update),element_id:equivalent.element_id});supplied.add(equivalent.element_id);
    }
   }
  }
  let allApplied=true;for(const update of targets){
   const e=state.elements.find(e=>e.element_id===update.element_id&&active(e));if(!e)fail('ELEMENT_NOT_FOUND','update','The update target does not exist or is obsolete.');if(qids.length&&!qids.includes(e.question_id))fail('CROSS_QUESTION_UPDATE','update','This answer was not linked to the target question.');
   if(issues.length&&issues.some(i=>i.element_ids.length)&&!issues.some(i=>i.element_ids.includes(e.element_id))&&!option?.updates?.some(u=>u.element_id===e.element_id))fail('ISSUE_TARGET_MISMATCH','update','The proposed update targets a different Element than the answered issue.');
   const q=state.questions.find(q=>q.question_id===e.question_id),passage=option?.source_occurrence_ref;
   const adjusted={...answer,explicit_revision:answer.explicit_revision||option?.explicit_revision,selected_passage:passage,supporting_refs:passage?[passage.heading,D.occurrenceClause(passage)].filter(Boolean):option?.explicit_revision&&primary?.proposed_source_ref?[primary.proposed_source_ref]:answer.supporting_refs};
   const change=answerUpdate(state,q,e,update,adjusted,source,primary);allApplied=allApplied&&change.applied;decision.changes.push({element_id:e.element_id,old:change.old,new:change.new,applied:change.applied});if(change.applied){e.source_decision_ids=[...(e.source_decision_ids||[]),decision.decision_id];if(e.dimension_id==='population.age'&&e.scope_status==='unrestricted')for(const parent of state.elements.filter(p=>active(p)&&p.age_boundary_element_id===e.element_id)){const old=clone(parent);parent.normalized_text=parent.normalized_text.replace(/老年/g,'').replace(/\b(?:elderly|older)\s+(adults?|patients?|people)/gi,'$1');parent.source_refs.push(ref(source));parent.source_decision_ids=[...(parent.source_decision_ids||[]),decision.decision_id];parent.decision_status='confirmed_by_user';parent.explicit_revision=true;parent.revision++;decision.changes.push({element_id:parent.element_id,old,new:clone(parent),applied:true});}}
  }
  if(allApplied&&decision.status==='applied')for(const issue of issues){
   if(decision.target_element_ids){
    issue.answered_element_ids=[...new Set([...(issue.answered_element_ids||[]),...decision.target_element_ids])];
    if(issue.element_ids.some(id=>!issue.answered_element_ids.includes(id)))continue;
   }
   issue.status='resolved';issue.resolved_by_decision_id=decision.decision_id;issue.resolved_at_revision=state.revision+1;
  }
  else if(!allApplied)decision.status='needs_confirmation';
  state.decisions.push(decision);changes.push(decision);
 }
 state.model_calls.push(...(request.model_calls||[]));finish(state,'apply_decisions',changes,options);rebuild(state,env);return {state,status:state.status};
}
function edit_context(original,questionId,context,options={},env=environment()){
 const tx=start(original,options);if(tx.status==='duplicate')return tx;const state=tx.state;configFor(state,env);const q=state.questions.find(q=>q.question_id===questionId);if(!q)fail('QUESTION_NOT_FOUND','context','Unknown research question.');const before=clone(q.context);
 if(context.framework_id){const frame=env.frameworks.get(context.framework_id);if(!frame)fail('FRAMEWORK_NOT_FOUND','context','Unknown framework.');q.context.framework_requested=frame.display_name;q.framework_mapping={framework_id:frame.framework_id,display_name:frame.display_name,version:frame.version,explicit:true,provisional:false,basis:'human_selection',candidates:[]};for(const e of currentElements(state,q))e.framework_bindings=env.frameworks.map(e.dimension_id,frame);}
 for(const field of ['review_methods','question_types','evidence_units'])if(context[field])q.context[field]=array(context[field]);const source=addSource(state,'human_answer',JSON.stringify(context),[q.question_id]),decisionId=id('decision');if(context.framework_id)q.framework_mapping.source_refs=[ref(source)];if(context.evidence_units){q.evidence_unit_source_ref=ref(source);q.evidence_unit_decision_id=decisionId;for(const e of currentElements(state,q))if(e.context_managed)e.active=false;}state.decisions.push({decision_id:decisionId,issue_ids:[],source_ref:ref(source),answer_text:source.original_text,action:'modify_context',revision:state.revision+1,changes:[{old:before,new:clone(q.context)}]});finish(state,'edit_context',[{question_id:questionId,old:before,new:context}],options);rebuild(state,env);return {state,status:state.status};
}
function register_framework(original,definition,options={},env=environment()){const tx=start(original,options);if(tx.status==='duplicate')return tx;const state=tx.state;env.frameworks.register(definition);state.custom_frameworks=state.custom_frameworks.filter(f=>f.framework_id!==definition.framework_id).concat(clone(definition));addSource(state,'user_input',JSON.stringify(definition),[],'framework:'+definition.framework_id,{input_kind:'custom_framework'});if(state.questions.some(q=>q.active!==false&&q.framework_mapping?.framework_id===definition.framework_id))state.status='input_saved';finish(state,'register_framework',[definition],options);return {state,status:state.status};}
function expression_text(node,criteria,language='zh-CN'){if(!node)return '';if(node.op==='predicate')return criteria.find(c=>c.criterion_id===node.criterion_id)?.text||'';const children=node.children.map(n=>expression_text(n,criteria,language));if(node.op==='not')return (language.startsWith('zh')?'不满足':'Not ')+ '('+children[0]+')';return '('+children.join(language.startsWith('zh')?(node.op==='any_of'?' 或 ':' 且 '):(node.op==='any_of'?' OR ':' AND '))+')';}
function render_output(state,{snapshot_revision=null}={}){
 const snap=snapshot_revision==null?null:state.snapshots.find(s=>s.revision===snapshot_revision);if(snapshot_revision!=null&&!snap)fail('SNAPSHOT_NOT_FOUND','output','The requested version was not found.');const view=snap||state,es=view.elements.filter(active);
 return {project_id:state.project_id,status:view.status,revision:view.revision,output_language:view.output_language||state.output_language,review_methods:view.review_methods||state.review_methods,question_relation:view.question_relation,questions:view.questions.filter(active).map(q=>({question_id:q.question_id,display_number:q.display_number,research_question:q.original_text,objective:q.review_topic||q.original_text,context:q.context,framework_mapping:q.framework_mapping,elements:es.filter(e=>e.question_id===q.question_id),include:view.criteria.filter(c=>c.question_ids.includes(q.question_id)&&c.disposition==='include'),exclude:view.criteria.filter(c=>c.question_ids.includes(q.question_id)&&c.disposition==='exclude'),logic:view.logic?.questions[q.question_id],logic_text:expression_text(view.logic?.questions[q.question_id]?.eligibility,view.criteria,view.output_language||state.output_language),focus:es.filter(e=>e.question_id===q.question_id&&e.semantic_role==='review_focus'),unrestricted:es.filter(e=>e.question_id===q.question_id&&e.scope_status==='unrestricted'),unspecified:es.filter(e=>e.question_id===q.question_id&&e.scope_status==='unspecified'),no_independent_exclusions:!view.criteria.some(c=>c.question_ids.includes(q.question_id)&&c.disposition==='exclude')})),issues:snap?(snap.issues||[]).filter(i=>i.status==='open'):state.issues.filter(i=>i.status==='open'),decisions:state.decisions.filter(d=>!snap||snap.decision_ids.includes(d.decision_id)),sources:state.sources,validation:view.validation,changes:state.changes.filter(c=>c.revision<=view.revision),config_versions:view.config_versions};
}
function render_text(state,options={}){const out=render_output(state,options),zh=out.output_language.startsWith('zh'),lines=[(zh?'纳入与排除标准':'Eligibility criteria')+' — v'+out.revision+' — '+out.status];for(const q of out.questions){lines.push('\n'+q.display_number+' '+q.objective,(zh?'框架：':'Framework: ')+(q.framework_mapping?.display_name||'待确定'),zh?'纳入标准':'Inclusion');q.include.forEach(c=>lines.push('- '+c.text));lines.push(zh?'排除标准':'Exclusion');q.exclude.forEach(c=>lines.push('- '+c.text));if(q.no_independent_exclusions)lines.push(zh?'无独立排除条款；资格范围由现有纳入条件确定。':'No independent exclusion clauses; eligibility is determined by the inclusion conditions.');if(q.logic_text)lines.push((zh?'逻辑关系：':'Logic: ')+q.logic_text);if(q.focus.length)lines.push((zh?'研究关注内容：':'Review focus: ')+q.focus.map(e=>e.normalized_text).join('；'));if(q.unrestricted.length)lines.push((zh?'明确不限：':'Explicitly unrestricted: ')+q.unrestricted.map(e=>e.dimension_id).join(', '));lines.push((zh?'未设定的非必要限制：':'Unspecified optional limits: ')+q.unspecified.filter(e=>OPTIONAL.includes(e.dimension_id)).map(e=>e.dimension_id).join(', '));}if(out.issues.some(i=>i.blocking))lines.push(zh?'此版本为草案，仍有必要事项待确认。':'Draft: required decisions remain unresolved.');return lines.join('\n');}
return {VERSION:'eligibility-v3.2.0',environment,create_project,save_input,addSource,ref,extraction_payload,resolve_review_context,ingest_candidates,detect_clarification_issues,authorTargetGroups,passageWording,apply_decisions,edit_context,register_framework,build_criteria,validate_criteria,render_output,render_text,expression_text,rebuild,accepted,guard,SourceStore:{add:addSource,get:D.sourceAt,locate:D.locate},ProvenanceValidator:{validate:D.validate_provenance},ElementNormalizer:{validate:D.check_semantics},CriteriaBuilder:{build:build_criteria},CriteriaValidator:{validate:validate_criteria},DecisionApplier:{apply:apply_decisions}};
});
