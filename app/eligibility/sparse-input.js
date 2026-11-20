/* Protocol advice for population-only questions. Advice is never source evidence. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AIMSTEPEligibilitySparseInput=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const cochrane='https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-';
const jbi='https://jbi-global.atlassian.net/wiki/spaces/MANUAL/pages/';
const sources={
 interventions:{label:'Cochrane Handbook §3.2.2',url:cochrane+'03'},
 designs:{label:'Cochrane Handbook §3.3',url:cochrane+'03'},
 nonrandomised:{label:'Cochrane Handbook chapter 24',url:cochrane+'24'},
 network:{label:'Cochrane Handbook §11.3',url:cochrane+'11'},
 scoping:{label:'JBI Manual §10.2.4',url:jbi+'355862707'},
 qualitative:{label:'JBI Manual §3.3.8',url:jbi+'863862953'},
 exposure:{label:'JBI Manual §7.3.5',url:jbi+'355598852'},
 umbrella:{label:'JBI Manual §9.2.5',url:jbi+'355829851'},
 prevalence:{label:'JBI Manual §2.4.3',url:jbi+'652279828'},
 diagnosis:{label:'Cochrane Handbook for Diagnostic Test Accuracy',url:'https://www.cochrane.org/authors/handbooks-and-manuals/handbook-systematic-reviews-diagnostic-test-accuracy'}
};
const anchors=new Set(['population','sample','condition']);
const rootDimension=element=>element.dimension_id.split('.')[0];
const scopeCue=/\b(?:versus|vs|compar(?:e[ds]?|ing|ators?|isons?)|(?:intervention|treatment|exposure|outcome|placebo|randomi[sz]ed|follow[ -]up|included|excluded|eligibility|mortality|prevalence|incidence)\s*(?:[:=]|trials?\b)|effects? of|effectiveness of|clinical trials?|rcts?)\b|对照组|纳入标准|排除标准|随机对照|干预措施|结局指标/u;
function isSparse(question,elements){
 const registration=question.context.registration;
 const source=question.source_refs?.[0],text=question.original_text.trim();
 if(!registration||!source||question.document_input_only||question.additional_source_refs?.length||question.imported_source_refs?.length||
    Array.from(text).length>180||(text.match(/[\p{L}\p{N}]+/gu)||[]).length>24||scopeCue.test(text.toLowerCase()))return false;
 const cited=elements.filter(e=>e.information_status!=='missing'&&e.source_refs?.length&&e.semantic_role!=='background_information');
 if(!cited.length||cited.some(e=>!anchors.has(rootDimension(e))||e.disposition==='exclude'))return false;
 const ranges=cited.flatMap(e=>e.source_refs).filter(ref=>ref.source_id===source.source_id&&ref.source_revision===source.source_revision);
 const remainder=Array.from(question.original_text,(char,index)=>ranges.some(ref=>index>=ref.start&&index<ref.end)?' ':char).join('');
 return !!ranges.length&&!remainder.replace(/\b(?:population|participants?|patients?|sample|condition|only|among|in|the|of)\b|研究人群|人群|研究对象|对象|仅|为/giu,'').match(/[\p{L}\p{N}]/u);
}
function projectProfile(registration){
 const {project_type:type,question_type:question,title}=registration;
 const network=/\bnetwork meta[\s‐‑–-]*analysis\b|网状\s*(?:meta\s*[‐‑–-]?\s*分析|荟萃分析|荟萃)|网络\s*(?:meta\s*[‐‑–-]?\s*分析|荟萃分析)/iu.test(type+' '+title);
 if(['scoping','scoping_review','scoping review'].includes(type)||question==='mapping')return 'scoping';
 if(['effectiveness','prevention','intervention_effect'].includes(question)||
    ['cochrane_intervention_review','intervention_review'].includes(type)||
    (network&&(!question||question==='other')))return network?'network':question==='prevention'?'prevention':'intervention';
 return {etiology:'exposure',exposure_outcome:'exposure',qualitative:'qualitative',experience:'qualitative',
  diagnosis:'diagnosis',diagnostic_accuracy:'diagnosis',prevalence:'prevalence'}[question]||null;
}
const frameworkFor={scoping:'pcc',intervention:'picos',prevention:'picos',network:'picos',exposure:'peo',qualitative:'pico_qualitative',diagnosis:'pird',prevalence:'cocopop'};
function registeredFramework(question){return frameworkFor[projectProfile(question.context.registration)];}

function namedIntervention(title){
 const main=title?.split(/[:：]/u)[0]?.trim()||'';
 const value=main.match(/^(?:the\s+)?(?:effects?|effectiveness|efficacy) of (.{2,100}?)(?=\s+(?:in|among|versus|vs\.?)\s)/iu)?.[1]||
  main.match(/^(.{2,100}?)\s+(?:versus|vs\.?)\s/iu)?.[1];
 if(!value||/^(?:various |different )?(?:interventions?|treatments?|therapies|strategies|options)$/iu.test(value)||/\b(?:compared|outcomes?|complications|risks?|benefits|harms)\b/iu.test(value))return undefined;
 return value.replace(/^\p{L}/u,letter=>letter.toUpperCase());
}

function suggestions(question,frame,elements){
 if(!question.sparse_input||!frame)return [];
 const registration=question.context.registration,profile=projectProfile(registration);
 const umbrella=/^umbrella(?:[ _-]review)?$/i.test(registration.project_type);
 const intervention=namedIntervention(registration.title);
 const guide=(dimension,prompt,rationale,references,criterion)=>({dimension,prompt,rationale,references,criterion});
 const slots={
  intervention:guide('intervention',profile==='network'?'Which interventions should be eligible for the network?':'Which '+(profile==='prevention'?'preventive interventions':'interventions')+' should be eligible?',
   profile==='network'?'List the interventions the reviewers can reasonably compare for this population. Define which variants should count as the same intervention.':
    (intervention?'The registered title names a candidate intervention. ':'')+'Specify eligible variants only where they would change study selection.',
   [profile==='network'?sources.network:sources.interventions],profile==='network'?undefined:intervention),
  study_design:umbrella?guide('study_design','Which evidence syntheses should be eligible?',
   'An umbrella review uses completed evidence syntheses as its units of inclusion.',[sources.umbrella],'Systematic reviews with or without meta-analysis'):
   guide('study_design','Which study designs should be eligible?',
    profile==='network'?'Prefer randomised comparisons where feasible. Consider observational evidence separately if needed to supplement a sparse network.':
     'Consider randomised controlled trials when randomisation is feasible and can answer the intervention question. Consider prespecified non-randomised designs when trials cannot address the question, for example for rare harms or long-term effects.',
    [profile==='network'?sources.network:sources.designs,sources.nonrandomised],'Randomised controlled trials (RCTs)'),
  exposure:guide('exposure','Which exposure should be eligible?','Specify the exposure or class and how it must be measured if differences in measurement would change eligibility.',[sources.exposure]),
  concept:guide('concept','Which concept should the review map?','Define the concept and its boundaries so the same definition can be applied to each source.',[sources.scoping]),
  context:guide('context','Which settings should be eligible?','Specify care settings, regions or circumstances if they matter to the question.',
   [profile==='scoping'?sources.scoping:profile==='prevalence'?sources.prevalence:sources.qualitative]),
  phenomenon_of_interest:guide('phenomenon_of_interest','Which experience or phenomenon should be eligible?','Describe what the study must explore from the participants’ perspective.',[sources.qualitative]),
  index_test:guide('index_test','Which diagnostic test should be evaluated?','Specify the test and any variants that would change study eligibility.',[sources.diagnosis]),
  reference_test:guide('reference_test','Which reference standards should be eligible?','Name the methods that can establish whether the target condition is present.',[sources.diagnosis]),
  condition:guide('condition','Which condition should be counted?','Define the case definition. Include diagnostic methods or thresholds if they would change which cases are counted.',[sources.prevalence])
 };
 const dimensions={intervention:['intervention','study_design'],prevention:['intervention','study_design'],network:['intervention','study_design'],
  exposure:['exposure'],scoping:['concept','context'],qualitative:['phenomenon_of_interest','context'],diagnosis:['index_test','reference_test'],prevalence:['condition','context']};
 const present=new Set(elements.filter(e=>e.information_status!=='missing'&&e.semantic_role!=='background_information').map(rootDimension));
 return (dimensions[profile]||[]).filter(id=>!present.has(id)&&frame.slots.some(slot=>slot.slot_id===id)).map(id=>slots[id]);
}
return {isSparse,registeredFramework,suggestions};
});
