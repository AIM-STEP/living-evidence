/* Eligibility extraction notebook. Only fixed guidance can enter a model instruction. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;else root.AIMSTEPEligibilityLessons=api;
})(globalThis,function(){
'use strict';
const version=1;
// Entries without a trigger describe interface or transport faults; they are
// documented and may be counted, but do not consume extraction prompt space.
const entries={
 exclusion_list:{trigger:/\b(?:exclud(?:e|es|ed|ing)|exclusion|ineligible)\b|排除/i,
  tip:'Locate every explicitly excluded unit. Carry its governing verb and negation across enumerated items; keep exclusions from an analysis separate from study exclusions.'},
 comparison_arms:{trigger:/\b(?:compar(?:ed|ing) (?:with|to)|comparing\b|versus|vs\.?\s|placebo|control group|each other)\b|安慰剂|对照/i,
  tip:'Locate what each group receives. Record each named arm, including active alternatives and doses; cite the phrase that assigns it to that group.'},
 outcome_role:{trigger:/\b(?:outcomes? of interest|outcomes?|endpoints?|mortality|follow[- ]up)\b|结局/i,
  tip:'Retain each stated endpoint, time point and definition. Assign a reporting requirement only when the source explicitly makes it a condition of inclusion.'},
 analysis_role:{trigger:/\b(?:subgroup|differ according to|effect modif|network meta[- ]analysis|NMA|individual participant data|IPD|rank the)\b|亚组|网状/i,
  tip:'Record subgroup factors, synthesis methods and data plans separately from eligibility. Check whether the source actually requires a study or participant characteristic.'},
 scope_status:{trigger:/\b(?:no restrictions?|unrestricted|any language|language|publication date|no age limit)\b|不限|语言/i,
  tip:'Assign unrestricted only to a stated waiver. An unmentioned limit is unspecified; no optional confirmation is needed.'},
 age_bound:{trigger:/[<>≤≥]|\b(?:older|elderly|aged|at least|younger than|older than|months? of age)\b|年龄|老年/i,
  tip:'Preserve the stated age wording, operator and unit. Keep qualitative age groups as stated and ask only when eligibility depends on an unresolved boundary.'},
 logical_scope:{trigger:/\b(?:either|both|unless|except|only if|provided that|one another)\b|除非|或者|例外/i,
  tip:'Keep alternatives, shared conditions and exceptions attached to their original participants or studies. Preserve conjunctions and disjunctions.'},
 source_coverage:{trigger:/\b(?:we included|eligible studies|inclusion criteria|population|participants)\b|纳入标准|研究对象/i,
  tip:'Account for each explicit inclusion statement and labelled element. Attach the actual passage or leave the source gap visible.'},
 source_fidelity:{tip:'Rebuild the wording from the current cited passage. Preserve its subject, direction, qualifications and numerical values.'},
 repeated_passage:{tip:'Choose the occurrence whose heading, negation and surrounding clause support this candidate. Use its source revision and Unicode offsets.'},
 question_identity:{tip:'Return the exact supplied question ID for this part. Keep element references within the same question.'},
 topic_wording:{trigger:/\b(?:resuscitation|benefits and harms|to assess the effects)\b/i,
  tip:'Use the named clinical subject, defining comparison and population for the title. Describe the purpose once and retain the enrolment details in their fields.'},
 residual_validation:{}, service_availability:{}, progress_display:{}, clear_project:{}, author_decision:{}, framework_display:{}
};
function errorLesson(error){
 const code=error?.code||'',message=String(error?.message||'');
 if(/QUESTION_REFERENCE|MISSING_QUESTION/.test(code)||code==='MODEL_SCHEMA_ERROR'&&/question ID/i.test(message))return 'question_identity';
 if(/MULTIPLE_MATCH|AMBIGUOUS_(?:QUOTE|PASSAGE)|OCCURRENCE|QUOTE_OFFSET_MISMATCH/.test(code))return 'repeated_passage';
 if(code==='MODEL_SCHEMA_ERROR'&&/omitted|no source-linked element/i.test(message)){
  if(/exclu/i.test(message))return 'exclusion_list';
  if(/comparison|comparator/i.test(message))return 'comparison_arms';
  if(/outcome/i.test(message))return 'outcome_role';
  return 'source_coverage';
 }
 if(/^(?:SEMANTIC_REVIEW_FAILED|QUOTE_.*|SOURCE_MISMATCH|UNSUPPORTED_.*)$/.test(code))return 'source_fidelity';
 if(/^(?:MODEL_UPSTREAM_ERROR|MODEL_UNAVAILABLE|MODEL_BUSY|MODEL_TIMEOUT)$/.test(code))return 'service_availability';
 if(['MODEL_SCHEMA_ERROR','MODEL_INVALID_JSON','INVALID_STRUCTURE','INVALID_ENUM'].includes(code)||
  error?.name==='EligibilityError'&&['schema','normalization','provenance','extract_elements','review_normalization','repair_candidate_wording','logic'].includes(error.step))return 'residual_validation';
 return null;
}
function correctedLessons(elements){
 const found=new Set();
 for(const e of elements||[]){
  if(e.active===false||e.decision_status==='confirmed_by_user'||e.explicit_revision)continue;
  if(e.wording_repair)found.add('source_fidelity');
  for(const fix of e.metadata_corrections||[]){
   if(fix.field==='disposition'&&fix.to==='exclude')found.add('exclusion_list');
   else if((fix.field==='dimension_id'&&fix.to==='comparator')||(fix.field==='normalized_text'&&fix.basis==='Separate the two arms of the explicit comparison in the original source.'))found.add('comparison_arms');
   else if(fix.field==='scope_status'&&fix.from==='unrestricted')found.add('scope_status');
   else if(fix.field==='semantic_role'&&fix.to==='review_focus'&&e.dimension_id==='outcome')found.add('outcome_role');
   else if(fix.field==='semantic_role'&&fix.to==='review_focus'&&e.dimension_id.startsWith('analysis_'))found.add('analysis_role');
   else if(fix.field==='normalized_text'&&e.dimension_id.startsWith('population')&&fix.basis?.startsWith('Restore the age qualification'))found.add('age_bound');
  }
 }
 return found;
}
function prompt(step,payload,counts={}){
 if(!['extract_elements','review_normalization','repair_candidate_wording'].includes(step))return '';
 const prior=errorLesson(payload.validation_feedback);
 const passages=step==='extract_elements'?(payload.question?.sources||[]).map(s=>s.original_text||''):
  (payload.items||[]).flatMap(i=>(i.source_quotes||[]).map(r=>r.context||r.quote||''));
 const ranked=Object.entries(entries).map(([id,record],index)=>{
  if(!record.tip)return null;
  let score=id===prior&&id!=='residual_validation'?100:0;
  if(step==='repair_candidate_wording'&&id==='source_fidelity')score+=50;
  if(step==='extract_elements'&&id==='question_identity'&&counts[id]>0&&payload.question?.question_id)score+=1;
  if(step==='review_normalization'&&id==='source_fidelity'&&counts[id]>0&&passages.length)score+=1;
  if(step==='extract_elements'&&id==='repeated_passage'&&counts[id]>0&&passages.some(s=>/\b(?:inclusion|exclusion) criteria\b|纳入标准|排除标准/i.test(s)))score+=12;
  if(record.trigger&&passages.some(text=>record.trigger.test(text)))score+=1;
  if(!score)return null;
  return {tip:record.tip,score:score+Math.min(8,Number.isInteger(counts[id])?Math.max(0,counts[id]):0),index};
 }).filter(Boolean).sort((a,b)=>b.score-a.score||a.index-b.index);
 return ranked.length?'\nExtraction notebook — '+ranked.slice(0,2).map(item=>item.tip).join(' '):'';
}
function readCounts(storage,key){
 if(!key)return {};
 try{
  const data=JSON.parse(storage.getItem(key)||'null'),counts={};
  if(data?.version!==version)return counts;
  for(const id of Object.keys(entries))if(Number.isSafeInteger(data.counts?.[id])&&data.counts[id]>0)counts[id]=data.counts[id];
  return counts;
 }catch{return {};}
}
function recordRun(storage,key,labels){
 if(!key)return;
 const counts=readCounts(storage,key);
 let changed=false;
 for(const id of new Set(labels))if(Object.hasOwn(entries,id)){
  counts[id]=Math.min((counts[id]||0)+1,Number.MAX_SAFE_INTEGER);changed=true;
 }
 if(changed)try{storage.setItem(key,JSON.stringify({version,counts}));}catch{/* Optional feedback cannot block criteria. */}
}
return {version,entries,errorLesson,correctedLessons,prompt,readCounts,recordRun};
});
