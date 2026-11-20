/* Protocol advice for questions that supply a single framework field. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AIMSTEPEligibilitySparseInput=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const cochrane='https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-';
const jbi='https://jbi-global.atlassian.net/wiki/spaces/MANUAL/pages/';
const sources={
 population:{label:'Cochrane Handbook §3.2.1',url:cochrane+'03'},
 interventions:{label:'Cochrane Handbook §3.2.2',url:cochrane+'03'},
 comparisons:{label:'Cochrane Handbook §3.2.3',url:cochrane+'03'},
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
const rootDimension=element=>element.dimension_id.split('.')[0];
const labels={population:'population|participants?|patients?|研究人群|人群|研究对象',sample:'sample|样本',condition:'condition|疾病|病症',
 intervention:'interventions?|treatments?|干预(?:措施)?',comparator:'comparators?|comparisons?|controls?|对照(?:组)?',
 outcome:'(?:(?:primary|secondary|critical) )?outcomes?(?: of interest)?|(?:主要|次要)?结局(?:指标)?',
 study_design:'(?:study )?designs?|study types?|研究设计|研究类型',design:'designs?|study designs?|设计|研究设计',
 exposure:'exposures?|暴露(?:因素)?',concept:'concepts?|概念',context:'context|settings?|情境|场景|环境',
 phenomenon_of_interest:'phenomen(?:on|a)(?: of interest)?|关注现象|研究现象',index_test:'index tests?|待评价(?:的)?检测|待评价试验',
 reference_test:'reference (?:tests?|standards?)|参考标准|金标准',target_condition:'target conditions?|目标(?:疾病|病症)',
 evaluation:'evaluation|评价',research_type:'research types?|type of (?:study|research)|研究类型'};
const fieldHeadings=new RegExp('(?:^|[;；\\n])\\s*(?:'+Object.values(labels).join('|')+')\\s*[:：=]','giu');
const comparisonCue=/\b(?:versus|vs\.?\s|compar(?:e[ds]?|ing) (?:with|to))\b|与.{1,25}(?:比较|相比)/iu;
const objectiveCue=/\b(?:to (?:assess|evaluate|determine|examine)|(?:benefits?|effects?|effectiveness|efficacy) of)\b|旨在(?:评估|评价)/iu;
const comparisonLead=/^\s*(?:compar(?:ed|ing) (?:with|to)\b|对照(?:为|是))/iu;
const participantScope=/\b(?:among|in|for)\s+(?:(?:older|young|hospitali[sz]ed|pregnant)\s+)?(?:adults?|children|patients?|people|infants?|participants?)\b/iu;
function suppliedDimension(question,elements){
 const registration=question.context.registration;
 const source=question.source_refs?.[0],text=question.original_text.trim();
 if(!registration||!source||question.document_input_only||question.additional_source_refs?.length||question.imported_source_refs?.length||
    Array.from(text).length>180||(text.match(/[\p{L}\p{N}]+/gu)||[]).length>24)return null;
 const cited=elements.filter(e=>e.information_status!=='missing'&&e.source_refs?.length&&e.semantic_role!=='background_information');
 const [dimension,...other]=new Set(cited.map(rootDimension));
 if(!dimension||other.length||!Object.hasOwn(labels,dimension))return null;
 const fieldLabel=new RegExp('^\\s*(?:'+labels[dimension]+')\\s*[:：=]','iu');
 const comparisonText=dimension==='comparator'?text.replace(fieldLabel,'').replace(comparisonLead,''):text;
 if((text.match(fieldHeadings)||[]).length>1||comparisonCue.test(comparisonText)||!fieldLabel.test(text)&&objectiveCue.test(text))return null;
 if(['population','sample'].includes(dimension)&&/\b(?:receiving|received|assigned to|treated with|randomi[sz]ed to)\b|接受.{1,15}(?:治疗|干预)/iu.test(text))return null;
 if(['intervention','comparator','exposure','outcome'].includes(dimension)&&!fieldLabel.test(text)&&participantScope.test(text))return null;
 const ranges=cited.flatMap(e=>e.source_refs).filter(ref=>ref.source_id===source.source_id&&ref.source_revision===source.source_revision);
 const remainder=Array.from(question.original_text,(char,index)=>ranges.some(ref=>index>=ref.start&&index<ref.end)?' ':char).join('');
 const valueOnly=remainder.replace(fieldLabel,'');
 const rest=(dimension==='comparator'?valueOnly.replace(comparisonLead,''):valueOnly).replace(/^(?:\s*(?:we\s+(?:will\s+)?)?(?:only\s+)?(?:includ(?:e|ed)|exclud(?:e|ed))\b|\s*(?:仅纳入|不纳入|纳入|排除))/iu,'')
  .replace(/\b(?:and|or|only|among|in|the|of)\b|以及|或者|仅|和|或/giu,'');
 return ranges.length&&!/[\p{L}\p{N}]/u.test(rest)?dimension:null;
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
function registeredFramework(question,dimension){
 const profile=projectProfile(question.context.registration);
 if(profile==='exposure'&&dimension==='comparator')return 'peco';
 if(profile==='exposure'&&['design','study_design'].includes(dimension))return 'pecos';
 if(profile==='qualitative'&&['sample','design','study_design','evaluation','research_type'].includes(dimension))return 'spider';
 return frameworkFor[profile];
}

function namedIntervention(title){
 const main=title?.split(/[:：]/u)[0]?.trim()||'';
 const value=main.match(/^(?:the\s+)?(?:effects?|effectiveness|efficacy) of (.{2,100}?)(?=\s+(?:in|among|versus|vs\.?)\s)/iu)?.[1]||
  main.match(/^(.{2,100}?)\s+(?:versus|vs\.?)\s/iu)?.[1];
 if(!value||/^(?:various |different )?(?:interventions?|treatments?|therapies|strategies|options)$/iu.test(value)||/\b(?:compared|outcomes?|complications|risks?|benefits|harms)\b/iu.test(value))return undefined;
 return value.replace(/^\p{L}/u,letter=>letter.toUpperCase());
}
function namedPopulation(title){
 const main=title?.split(/[:：]/u)[0]?.replace(/\s*[—,–]\s*(?:a\s+)?(?:systematic review|scoping review|meta[- ]analysis)\b.*$/iu,'')||'';
 const group=main.match(/\b(?:in|among)\s+((?:(?:older|young|hospitali[sz]ed|pregnant)\s+)?(?:adults?|children|patients?|people|infants?|participants?)\b[^;.!?]{0,80})$/iu)?.[1]?.trim();
 if(!group||/\b(?:compared|receiving|treated|outcomes?|versus|with and without)\b/iu.test(group))return undefined;
 return group.replace(/^\p{L}/u,letter=>letter.toUpperCase());
}

function suggestions(question,frame,elements){
 const supplied=question.sparse_dimension||(question.sparse_input?'population':null);
 const registration=question.context.registration;
 if(!supplied||!frame||!registration)return [];
 const registered=projectProfile(registration);
 if(!registered&&['population','sample'].includes(supplied))return [];
 const profilesByFrame={pico:'intervention',picos:'intervention',peo:'exposure',peco:'exposure',pecos:'exposure',
  pcc:'scoping',pico_qualitative:'qualitative',spider:'qualitative',pird:'diagnosis',cocopop:'prevalence'};
 const family=profilesByFrame[frame.framework_id];
 const profile=family==='intervention'&&['network','prevention'].includes(registered)?registered:family;
 if(!profile)return [];
 const umbrella=/^umbrella(?:[ _-]review)?$/i.test(registration.project_type);
 const intervention=namedIntervention(registration.title);
 const guide=(dimension,prompt,rationale,references,criterion)=>({dimension,prompt,rationale,references,criterion});
 const populationReference=({scoping:sources.scoping,qualitative:sources.qualitative,exposure:sources.exposure,diagnosis:sources.diagnosis,prevalence:sources.prevalence})[profile]||sources.population;
 const population=namedPopulation(registration.title);
 const forPopulation=dimension=>guide(dimension,'Which participants should be eligible?',
  (population?'The registered title names a candidate population. ':'Define who the review is about. ')+
  'Specify age, diagnosis or other characteristics only where they affect eligibility.',[populationReference],population);
 const slots={
  population:forPopulation('population'),sample:forPopulation('sample'),
  intervention:guide('intervention',profile==='network'?'Which interventions should be eligible for the network?':'Which '+(profile==='prevention'?'preventive interventions':'interventions')+' should be eligible?',
   profile==='network'?'List the interventions the reviewers can reasonably compare for this population. Define which variants should count as the same intervention.':
    (intervention?'The registered title names a candidate intervention. ':'')+'Specify eligible variants only where they would change study selection.',
   [profile==='network'?sources.network:sources.interventions],profile==='network'?undefined:intervention),
  comparator:profile==='network'?guide('comparator','Which comparisons should enter the network?',
   'Identify eligible active comparisons and whether a common reference such as usual care can link them.',[sources.network]):
   profile==='exposure'?guide('comparator','What should define the reference group?',
    'Use a reference group that matches the exposure question. Options include no exposure or a prespecified lower exposure level.',[sources.exposure],'No exposure'):
    guide('comparator','Which comparators should be eligible?',
     'Choose the comparison that answers the review question. Usual care or no intervention may help estimate added benefit. An active alternative may be more relevant when established treatment exists.',
     [sources.comparisons],['Usual care','No intervention']),
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
  target_condition:guide('target_condition','Which condition should the test detect?','Identify the condition and any clinically relevant stages that the review will assess.',[sources.diagnosis]),
  condition:guide('condition','Which condition should be counted?','Define the case definition. Include diagnostic methods or thresholds if they would change which cases are counted.',[sources.prevalence])
 };
 const order={pico:['population','intervention','comparator','study_design'],picos:['population','intervention','comparator','study_design'],
  peo:['population','exposure'],peco:['population','exposure','comparator'],pecos:['population','exposure','comparator'],
  pcc:['population','concept','context'],pico_qualitative:['population','phenomenon_of_interest','context'],spider:['sample','phenomenon_of_interest'],
  pird:['population','index_test','reference_test','target_condition'],cocopop:['population','condition','context']};
 const interventionReview=['intervention','prevention','network'].includes(profile);
 const priorities=interventionReview&&supplied==='population'?['intervention','study_design','comparator']:
  frame.framework_id==='pird'&&supplied==='index_test'?['target_condition','reference_test']:order[frame.framework_id]||[];
 const initial=priorities.filter(id=>id!==supplied&&frame.slots.some(slot=>slot.slot_id===id)).slice(0,2);
 const present=new Set(elements.filter(e=>e.information_status!=='missing'&&e.semantic_role!=='background_information').map(rootDimension));
 return initial.filter(id=>!present.has(id)).map(id=>slots[id]);
}
return {suppliedDimension,registeredFramework,suggestions};
});
