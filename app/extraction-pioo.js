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
  ['arm','Arm name','Record each intervention and comparator arm name exactly as reported, and identify its role. Preserve multi-arm distinctions; do not merge doses or treatment combinations.',[]],
  ['comparator','Comparator','Describe the actual comparator contents: placebo, sham, usual care, waiting list or active treatment as reported. Do not assume usual care or placebo is an inactive intervention.',[]],
  ['components','Components','Record the materials, procedures and components delivered in each arm, sufficient to distinguish the interventions. For combined treatments identify each reported component.',[]],
  ['dose','Dose / intensity','Record dose or intervention intensity with units, titration and session length for each arm, as reported. Distinguish planned from received dose; do not calculate unreported totals.',[]],
  ['delivery','Route / delivery','Record administration route or delivery mode, individual/group format, and equipment or platform where reported, separately by arm.',[]],
  ['frequency','Frequency','Record how often treatment or sessions occurred, with the time unit, separately by arm. Do not infer frequency from a total session count.',[]],
  ['duration','Duration','Record the planned and actual treatment duration with units for each arm when reported. Do not substitute study follow-up length for treatment duration.',[]],
  ['provider','Provider / setting','Record who delivered treatment, relevant training or expertise, and the delivery setting for each arm. Do not infer provider qualifications from author affiliations.',[]],
  ['background','Background therapy','Record allowed, prohibited and actually used concomitant therapies, rescue medication and co-interventions by arm. Distinguish a permitted treatment from one actually administered.',['Background therapy']],
  ['adherence','Adherence / fidelity','Record reported adherence, attendance, intervention fidelity, tailoring and modifications, including how they were measured. Distinguish intended delivery from actual delivery.',[]]
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
function seed(section){return (groups[section]||[]).map(([key,label])=>({id:'pioo-'+section+'-'+key,label,section,piooKey:section+'.'+key}));}
function upgrade(section,list){const remaining=[...list],out=[];for(const [key,label,,aliases] of groups[section]||[]){const pk=section+'.'+key,index=remaining.findIndex(f=>f.piooKey===pk||[label,...aliases].some(x=>x.toLowerCase()===String(f.label).toLowerCase()));const old=index<0?null:remaining.splice(index,1)[0];out.push({...old,id:old?.id||'pioo-'+section+'-'+key,label,section,piooKey:pk});}return [...out,...remaining];}
function migrate(form){
 if(form.piooVersion===1)return;
 for(const section of Object.keys(groups)){
  if(form.sections.includes(section)){const own=form.fields.filter(f=>f.section===section);form.fields=[...form.fields.filter(f=>f.section!==section),...upgrade(section,own)];}
  else if(form.sectionArchives[section]){
   const old=form.sectionArchives[section];
   if(section==='outcome')form.sectionArchives[section]={fields:upgrade(section,Array.isArray(old)?[]:old.fields||[]),outcomes:Array.isArray(old)?old:old.outcomes||[]};
   else form.sectionArchives[section]=upgrade(section,old);
  }
 }
 form.piooVersion=1;
}
function definition(field){if(typeof field.definition==='string')return field.definition;const [section,key]=String(field.piooKey||'').split('.'),entry=groups[section]?.find(e=>e[0]===key);return entry?entry[2]+common:null;}
function roundRobin(lists,limit=40){const result=[],seen=new Set();for(let i=0;i<Math.max(0,...lists.map(l=>l.length))&&result.length<limit;i++)for(const list of lists){const id=list[i];if(id&&!seen.has(id)){seen.add(id);result.push(id);if(result.length===limit)break;}}return result;}
const api={groups,common,seed,upgrade,migrate,definition,roundRobin};if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepExtractionPioo=api;
})(globalThis);
