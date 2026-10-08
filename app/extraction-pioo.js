/* PIOO extraction specification, reviewed 2026-10-08. See docs/EXTRACTION_PIOO_METHODS.md. */
(function(root){
'use strict';
const groups={
 participant:[
  ['population','Population','Extract the studied population, condition and diagnostic criteria as reported. Separate the enrolled population from eligibility rules; identify distinct subgroups without combining them.',['Population (key characteristics)']],
  ['eligibility','Eligibility','Record the study participant inclusion and exclusion criteria, including age and diagnostic thresholds. These are the study rules, not the systematic review criteria.',[]],
  ['randomised','Number randomised','Record the number randomized or allocated to each named arm and the total if reported. For nonrandomized studies label enrolled numbers explicitly; never substitute analyzed numbers.',['Number randomised']],
  ['analysed','Number analysed','Record the analyzed sample for each arm, outcome and time point, and the reported analysis population. Do not assume this equals the randomized sample.',[]],
  ['age','Age','Record baseline age separately by arm, with units and statistic type: mean with SD, or median with IQR/range as reported. Never turn a median into a mean.',['Mean age (years)']],
  ['sex','Sex / gender','Record reported sex or gender categories and counts or percentages by arm, retaining denominators and the authors terminology. Do not infer sex/gender from names or infer missing categories.',['Female (%)']],
  ['diseaseDuration','Disease duration','Record baseline duration of the condition by arm, with units and the reported summary statistic and dispersion. Do not confuse this with treatment duration or follow-up.',['Disease duration']],
  ['severity','Baseline severity','Record baseline disease severity or relevant outcome scores by arm, including instrument, scale range, statistic and dispersion. Keep baseline scores separate from follow-up and change scores.',[]],
  ['comorbidities','Comorbidities','Record relevant comorbidities and prior treatments explicitly described for participants, with group/subgroup identifiers where available. Do not treat an exclusion criterion as an observed prevalence.',[]],
  ['attrition','Attrition','Record withdrawals, loss to follow-up and post-allocation exclusions by arm and time point, with reported reasons. Do not infer missing counts by subtraction or equate missing outcomes with treatment discontinuation.',[]]
 ],
 intervention:[
  ['armCount','Number of arm','Extract the total number of distinct study arms, including every intervention and control arm. Use an explicit reported count or a fully enumerated allocation description as evidence. Do not count intervention components, treatment periods or study sites as separate arms. If the complete arm count cannot be established, leave it blank.',[]],
  ['arm','Brief name','Identify each treatment and control arm by its reported name and role. Preserve distinct doses and combinations.',['Arm name','Brief name']],
  ['why','Why','Extract the stated mechanism, rationale or intended goal of essential treatment components. Do not invent a biological or behavioral explanation.',[]],
  ['materials','What materials','Inventory drugs, devices, handouts, digital resources and training resources. Include reported specifications and locations of manuals or supplementary resources; a cited resource is not evidence that its contents were supplied.',[]],
  ['components','What procedures','Describe the sequence of treatment activities and supporting processes, including relevant co-interventions. Separate what was done from the equipment or resources used.',['Components','What — procedures']],
  ['who','Who provided','Identify the practitioners delivering each component, their reported qualifications, experience and intervention-specific preparation. Do not infer competence from affiliations.',[]],
  ['delivery','How','Record the delivery channel and format, including individual or group delivery and relevant group size. Keep route of administration distinct from place of delivery.',['Route / delivery','How']],
  ['where','Where','Identify intervention locations and the facilities or infrastructure needed to deliver it. Do not substitute author addresses or general recruitment settings.',[]],
  ['schedule','When and how much','Capture start timing, session count, frequency, session length, total treatment period and dose or intensity, with units and any schedule rules. Separate intended exposure from observed exposure; never calculate unreported totals.',[]],
  ['tailoring','Tailoring','Extract prospectively allowed personalization, titration or adaptation: triggers, decision rules, reasons and timing. Distinguish individual adjustments allowed by the plan from changes to the study intervention itself.',[]],
  ['modifications','Modifications','Identify study-level changes made after the intervention began, with reasons, timing and differences from the original plan. Do not confuse these with prespecified individual tailoring. A protocol alone cannot establish later changes.',[]],
  ['fidelityPlanned','How well planned','Record intended adherence or fidelity monitoring, assessment methods, assessors and strategies to support delivery as designed. Monitoring plans are not evidence of successful implementation.',[]],
  ['fidelityActual','How well actual','Extract observed adherence and fidelity, assessment timing, denominators and deviations from intended delivery. Preserve arm-specific measurements; a protocol alone cannot establish actual delivery.',[]]
 ],
 outcome:[
  ['name','Outcome','For each review-selected outcome record the study terminology and whether it was designated primary or secondary. Do not invent an outcome or select it because of statistical significance.',[]],
  ['instrument','Definition / instrument','Record the operational definition, instrument/version, measurement method and responder threshold for each outcome. Preserve differences between instruments and thresholds.',[]],
  ['unit','Unit / direction','Record measurement units, scale limits and whether higher or lower scores are favorable, only when reported. Do not reverse scores or infer a scale range.',[]],
  ['timing','Time point','Record each eligible measurement time and its reference point, such as weeks from randomization or end of treatment. Follow the review-specified target/window; do not choose the most favorable result.',[]],
  ['analysis','Analysis population','Record ITT, modified ITT, per-protocol or other analysis populations as reported, and endpoint versus change-from-baseline metric. Keep estimates from different populations and metrics separate.',[]],
  ['binary','Binary data','For each named arm, outcome and time point record participants with the event and the corresponding analyzed denominator. Distinguish participant counts from recurrent event counts; missing is not zero.',[]],
  ['continuous','Continuous data','For each named arm, outcome and time point record mean, SD and analyzed N when explicitly reported. Keep endpoint and change scores separate. Never label SE, CI, IQR or range as SD; retain alternative statistics with their correct labels without conversion.',[]],
  ['effect','Effect estimate / precision','Record reported between-group effect measures and precision, including measure type, estimate, CI level/bounds or SE, direction/reference group, adjustment and covariates. Do not calculate an unreported effect or select among analyses by significance.',[]],
  ['harms','Harms','Record adverse-event definitions, ascertainment, time period and per-arm event counts/denominators. Distinguish any, serious and treatment-related events and withdrawals due to harms. No mention of harms is not evidence of zero events.',[]]
 ],
 other:[
  ['setting','Setting','Record the recruitment and study setting, number/type of centers and relevant context as reported. Do not infer study setting from the journal or affiliations.',['Setting']],
  ['recruitment','Recruitment dates','Record the start and end dates of participant recruitment and the recruitment method if reported. Do not use publication or registration dates as recruitment dates.',[]],
  ['followup','Follow-up','Record scheduled and actual follow-up duration and completeness, with units and arm/subgroup distinctions. Do not confuse follow-up with intervention duration.',[]],
  ['methods','Randomisation / masking','Record allocation sequence generation, concealment, masking and unit of allocation as described. Extract factual methods only; do not assign a risk-of-bias rating or assume adequate methods from the word randomized.',[]],
  ['missing','Missing data','Record how missing data were handled, including imputation, exclusions and sensitivity analyses, and which outcomes or populations were affected. Do not perform imputation or infer a method that is not reported.',[]],
  ['reports','Protocol / related reports','Record explicit links to protocols, analysis plans, supplements, corrections and companion reports, with identifiers where given. Flag possible overlapping populations for human review rather than counting them as independent studies.',[]],
  ['conflicts','Conflicts of interest','Record declared author conflicts, sponsor involvement and data/analysis control separately from the Funding field. Distinguish an explicit declaration of no conflicts from an absent declaration.',[]],
  ['notes','Notes / discrepancies','Record unresolved discrepancies across supplied passages, unclear arm/time-point labels and author clarifications that affect extraction. Identify the conflicting sources; do not silently choose a preferred number or invent an explanation.',[]]
 ]};
const common=' Use only the supplied report as evidence. Identify the arm, outcome and time point wherever relevant. Preserve reported units and statistic labels. Leave unreported values blank; never interpret silence as zero or no. Provide the exact supporting quotation and passage ID for any extracted value.';
function seed(section){return (section==='other'?[]:groups[section]||[]).map(([key,label])=>({id:'pioo-'+section+'-'+key,label,section,piooKey:section+'.'+key}));}
function upgrade(section,list){if(section==='other')return [...list];const remaining=[...list],out=[];for(const [key,label,,aliases] of groups[section]||[]){const pk=section+'.'+key,index=remaining.findIndex(f=>f.piooKey===pk||[label,...aliases].some(x=>x.toLowerCase()===String(f.label).toLowerCase()));const old=index<0?null:remaining.splice(index,1)[0];out.push({...old,id:old?.id||'pioo-'+section+'-'+key,label,section,piooKey:pk});}return [...out,...remaining];}
function migrate(form){
 if(form.piooVersion===1){migrateTidier(form);return;}
 for(const section of Object.keys(groups)){
  if(form.sections.includes(section)){const own=form.fields.filter(f=>f.section===section);form.fields=[...form.fields.filter(f=>f.section!==section),...upgrade(section,own)];}
  else if(form.sectionArchives[section]){
   const old=form.sectionArchives[section];
   if(section==='outcome')form.sectionArchives[section]={fields:upgrade(section,Array.isArray(old)?[]:old.fields||[]),outcomes:Array.isArray(old)?old:old.outcomes||[]};
   else form.sectionArchives[section]=upgrade(section,old);
  }
 }
 form.piooVersion=1;migrateTidier(form);
}
function migrateTidier(form){
 if(form.tidierVersion===2)return;
 const clean=list=>{const all=upgrade('intervention',list),valid=new Set(groups.intervention.map(x=>'intervention.'+x[0]));
  const keep=[],removed=[];for(const f of all)(valid.has(f.piooKey)&&!keep.some(x=>x.piooKey===f.piooKey)?keep:removed).push(f);
  form.removedInterventionFields=[...(form.removedInterventionFields||[]),...removed];return keep;
 };
 if(form.sections.includes('intervention'))form.fields=[...form.fields.filter(f=>f.section!=='intervention'),...clean(form.fields.filter(f=>f.section==='intervention'))];
 else if(Array.isArray(form.sectionArchives.intervention))form.sectionArchives.intervention=clean(form.sectionArchives.intervention);
 form.tidierVersion=2;
}
function isArmItem(f){return f.section==='intervention'&&f.piooKey!=='intervention.armCount';}
function validateArmItems(value,fields){
 const expected=fields.filter(isArmItem).map(f=>f.id);if(!expected.length)return;
 if(!Array.isArray(value?.arms)||!value.arms.length)throw Error('No study arms were returned. Check the report and retry.');
 const labels=new Set();
 for(const arm of value.arms){const name=String(arm.label||'').trim().toLowerCase();if(!name||labels.has(name))throw Error('Study arm names are missing or duplicated.');labels.add(name);
  for(const id of expected)if(!Array.isArray(arm.items)||arm.items.filter(f=>f.id===id).length!==1)throw Error('The intervention extraction is incomplete: each arm needs every selected TIDieR item, including blank entries for unreported items.');
 }
 const countField=fields.find(f=>f.piooKey==='intervention.armCount'),count=value.fields?.find(f=>f.id===countField?.id)?.value;
 if(/^\d+$/.test(String(count??'').trim())&&Number(count)!==value.arms.length)throw Error('The reported arm count does not match the extracted arms. Check the report and retry.');
}
function definition(field){if(typeof field.definition==='string')return field.definition;const [section,key]=String(field.piooKey||'').split('.'),entry=groups[section]?.find(e=>e[0]===key);return entry?entry[2]+(section==='intervention'&&key!=='armCount'?' In the arms array, return this item once for each arm in report order, including control arms and unreported items with empty values. Apply this item separately to every intervention and comparator, including usual care and background care. Record explicit non-applicability only when supported; absent or insufficient reporting stays blank. Retain source locations and distinguish protocol plans from completed-study observations.':'')+common:null;}
function roundRobin(lists,limit=40){const result=[],seen=new Set();for(let i=0;i<Math.max(0,...lists.map(l=>l.length))&&result.length<limit;i++)for(const list of lists){const id=list[i];if(id&&!seen.has(id)){seen.add(id);result.push(id);if(result.length===limit)break;}}return result;}
const api={groups,common,seed,upgrade,migrate,definition,roundRobin,isArmItem,validateArmItems};if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepExtractionPioo=api;
})(globalThis);
