/* PICDO outcome extraction specification. See docs/EXTRACTION_OUTCOME_METHODS.md. */
(function(root){
'use strict';
const shared=[
 ['name','Outcome','Identify the review-selected outcome and study terminology. Keep each instrument, analysis population and measurement occasion identifiable; do not select results by statistical significance.'],
 ['timing','Time point','Record the measurement time and reference event, target window and actual observation time. Keep repeated measurements separate.'],
 ['analysis','Analysis population','Identify each arm, analysis set (ITT, modified ITT, per-protocol or other), eligibility for that analysis and missing-data handling. Distinguish participants with observed data from the analyzed sample after imputation.'],
 ['design','Design / dependence','Record cluster, crossover, paired or multi-arm structure and whether estimates account for dependence. Keep arm identities and shared controls separate; never treat dependent observations as independent.']
];
const groups={
 continuous:[...shared,
 ['instrument','Instrument / scale','Record the instrument/version, units, scale bounds and favorable direction as stated. Keep different instruments separate. Do not infer ranges or reverse scores.'],
 ['metric','Endpoint / change','Identify endpoint, baseline or change-from-baseline values and the subtraction direction. Never place baseline or endpoint dispersion into a change-score SD cell.'],
 ['mean','Mean','Extract each reported arm mean for the specified metric and time, retaining units. Do not substitute a median, geometric mean or adjusted between-group contrast for an arithmetic arm mean.'],
 ['sd','SD','Extract the explicitly reported standard deviation belonging to the same arm, metric and time as the mean. Never label SE, confidence limits, IQR or range as SD. Missing SD stays blank.'],
 ['n','N analysed','Extract the sample size used for that arm summary at that time. Do not substitute randomized N, overall trial N, repeated observations or number of clusters.'],
 ['alternative','Alternative summaries','Retain median, quartiles, range, SE, confidence limits and their levels, geometric summaries and relevant sample sizes exactly labeled. Do not automatically estimate means or convert/impute SDs; any later derivation requires an explicit method, inputs and review.'],
 ['effect','Effect / precision','Extract a reported between-group contrast with effect measure (such as MD or SMD), estimate, CI level/limits or SE, reference group, units, adjustment and covariates. Keep arm summaries and comparative estimates distinct.'],
 ['missing','Missing data / discrepancies','Record outcome-specific missingness, imputation, conflicting reports and unavailable statistics with source locations. Do not silently choose or calculate replacement values.']
 ],
 dichotomous:[...shared,
 ['event','Event definition / threshold','Define the event, diagnostic or responder threshold, ascertainment method and whether the event is favorable or harmful. Keep different cutoffs and composite outcomes distinct.'],
 ['events','Participants with event','Extract the number of unique participants meeting the event definition in each arm within the specified observation period. Do not use recurrent-event totals, visits, person-time or percentages as participant counts.'],
 ['denominator','N analysed / at risk','Extract the denominator for the same event, arm, time and analysis set, including its eligibility or at-risk definition. Do not assume that allocated N equals the denominator or mix safety and efficacy populations.'],
 ['zero','Zero / not reported','Record zero only when the report explicitly establishes no events in the relevant arm and period. Silence is missing. Keep raw zero counts; do not add continuity corrections during extraction.'],
 ['percent','Reported percentage','Retain reported proportions or percentages with their stated denominators and rounding. Do not back-calculate integer event counts from rounded percentages.'],
 ['effect','Effect / precision','Extract reported RR, OR or RD with confidence level/limits or SE, reference group, adjustment and covariates. Distinguish relative and absolute effects. Preserve HRs or rates as separately labeled information; never treat them as binary risks.'],
 ['harms','Harms / ascertainment','Distinguish participants with any, serious or treatment-related harm and withdrawals due to harms. Retain collection method, observation period, severity and analysis denominator; do not merge recurrent counts with persons affected.'],
 ['missing','Missing data / discrepancies','Record missing outcome status, exclusions, imputation and conflicting counts. Do not assume missing participants had no event or derive unreported counts by subtraction.']
 ]};
const common=' Use only supplied sources. Separate every arm, outcome and time point. Provide the exact quotation and source passage for each value. Leave missing information blank. Numerical extraction is a draft requiring human verification.';
function seed(section){return (groups[section]||[]).map(([key,label])=>({id:'picdo-'+section+'-'+key,label,section,outcomeKey:section+'.'+key}));}
function definition(f){if(!f.outcomeKey)return null;if(typeof f.definition==='string')return f.definition;const [s,k]=f.outcomeKey.split('.');return (groups[s]?.find(x=>x[0]===k)?.[2]||'Extract this item exactly as reported.')+common;}
const typeFor={continuous:'continuous',dichotomous:'binary'};
function migrate(form){
 if(form.picdoVersion===1)return;
 form.outcomes??=[];form.sectionArchives??={};
 const active=form.sections.includes('outcome');
 if(active)form.sections.splice(form.sections.indexOf('outcome'),1,'continuous','dichotomous');
 // Unclassified old descriptive fields remain visible in Other, never guessed into a data type.
 const legacy=form.fields.filter(f=>f.section==='outcome');
 if(legacy.length){for(const f of legacy){f.section=f.piooKey==='outcome.continuous'?'continuous':f.piooKey==='outcome.binary'?'dichotomous':'other';f.label='Previous outcome · '+f.label;}
 if(legacy.some(f=>f.section==='other')&&!form.sections.includes('other'))form.sections.push('other');}
 for(const section of Object.keys(groups))if(form.sections.includes(section))form.fields.push(...seed(section));
 const archived=form.sectionArchives.outcome;
 if(archived){const outcomes=Array.isArray(archived)?archived:archived.outcomes||[],fields=Array.isArray(archived)?[]:archived.fields||[];
  for(const section of Object.keys(groups))if(!form.sections.includes(section))form.sectionArchives[section]={fields:seed(section),outcomes:outcomes.filter(o=>o.type===typeFor[section])};
  // Keep ambiguous legacy targets and shared definitions in a recoverable archive.
  form.legacyOutcomeArchive={fields,outcomes:outcomes.filter(o=>!Object.values(typeFor).includes(o.type))};
 }
 form.picdoVersion=1;form.framework='PICDO';
}
const api={groups,seed,definition,typeFor,migrate};if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepExtractionOutcomes=api;
})(globalThis);
