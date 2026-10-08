(function(root){
'use strict';
const fields=[
 ['systemId','ID',['system id','fixed id','record id']],
 ['doi','DOI',['doi','doi number']],
 ['journal','Journal',['journal']],
 ['firstName','Author',['first author first name']],
 ['year','Year',['publication year','year']],
 ['country','Country',['country']],
 ['studyType','Study type',['study type','study design']],
 ['registration','Registration',['study registration number','trial registration number']],
 ['funding','Funding',['funding']]
];
const definitions={
 systemId:'Use the fixed ID assigned by AIM-STEP to this record. Copy it exactly; never infer an ID from the paper, DOI or registration number, and never renumber it.',
 doi:'Extract the DOI of this exact report from its bibliographic metadata or full text. Return the identifier beginning with 10., without a DOI URL or doi: prefix. Do not use DOIs from cited references. If absent, return NR.',
 journal:'Extract the journal in which this exact report was published, using its name as reported. Do not substitute the publisher, database or a journal from the reference list. If not reported, return NR.',
 firstName:'Extract the given name (first name) of the first listed author of this report. For surname-first names, use the given-name component. If only initials are reported, retain those initials; never invent an expanded name. For a group author with no personal name, return NR.',
 year:'Extract the publication year of this exact report as four digits. Prefer the year of its final journal citation; use the online publication year only when no final citation year is available. Do not use recruitment dates, registration dates or PDF creation dates. If uncertain, return NR.',
 country:'Extract the country or countries where participants were recruited or the study was conducted. List all explicitly reported countries for a multinational study. Do not infer study location from author affiliations, the journal or the funding organization. If not reported, return NR.',
 studyType:'Extract the study design explicitly described in the methods (for example, randomized controlled trial, cohort or case-control study), including parallel, crossover or cluster design when reported. Do not infer randomization from the word trial alone. If design cannot be established from the report, return NR.',
 registration:'Extract the registry name and study registration identifier for the study reported in this paper (for example, ClinicalTrials.gov and an NCT identifier). Include multiple identifiers if explicitly linked to this study. Do not use an ethics approval number, DOI or registration of a cited study. If no registration is reported, return NR.',
 funding:'Extract explicitly reported financial support, funder names and grant numbers for this study. Record an explicit statement of no funding when present. Distinguish funding from author affiliations, conflicts of interest and the role of the sponsor. If no funding statement is reported, return NR.'
};
function definition(field){return typeof field.definition==='string'?field.definition:definitions[field.baselineKey]||('Extract '+field.label+' as explicitly reported for this study. Use the supplied report as evidence; do not infer missing values. Return NR if not reported.');}
function upgrade(list){
 const remaining=[...list],baseline=[];
 for(const [key,label,aliases] of fields){const index=remaining.findIndex(f=>f.baselineKey===key||aliases.includes(String(f.label).trim().toLowerCase()));const old=index<0?null:remaining.splice(index,1)[0];baseline.push({...old,id:old?.id||'baseline-'+key,label,section:'baseline',baselineKey:key});}
 // Retain custom fields and their IDs; the former default Setting belongs to Other information.
 return [...baseline,...remaining.map(f=>String(f.label).toLowerCase()==='setting'?{...f,section:'other'}:f)];
}
function migrate(form){
 if(form.baselineVersion===3)return;
 if(!form.baselineVersion){
  if(form.sections.includes('baseline')){const selected=form.fields.filter(f=>f.section==='baseline'),other=form.fields.filter(f=>f.section!=='baseline');form.fields=[...upgrade(selected),...other];}
  else if(form.sectionArchives.baseline)form.sectionArchives.baseline=upgrade(form.sectionArchives.baseline);
 }
 const rank=field=>{const index=fields.findIndex(([key])=>key===field.baselineKey);return index<0?fields.length:index;};
 const reorder=list=>{const ordered=list.filter(f=>f.section==='baseline').sort((a,b)=>rank(a)-rank(b));let index=0;return list.map(f=>f.section==='baseline'?ordered[index++]:f);};
 form.fields=reorder(form.fields);
 if(form.sectionArchives.baseline)form.sectionArchives.baseline=reorder(form.sectionArchives.baseline);
 const rename=list=>list.map(field=>{const match=fields.find(([key])=>key===field.baselineKey);return match?{...field,label:match[1]}:field;});
 form.fields=rename(form.fields);
 if(form.sectionArchives.baseline)form.sectionArchives.baseline=rename(form.sectionArchives.baseline);
 form.baselineVersion=3;
}
function values(record,firstName){
 const plain=value=>typeof value==='string'||typeof value==='number'?String(value):'';
 return {systemId:Number.isSafeInteger(record.sourceNumber)?'#'+(record.extractionOrigin==='local'?'L':'')+record.sourceNumber:'',firstName:firstName(record),year:plain(record.year),country:plain(record.country),doi:plain(record.doi),journal:plain(record.journal),studyType:plain(record.studyType||record.studyDesign),registration:plain(record.registrationNumber||record.trialRegistrationNumber),funding:plain(record.funding)};
}
function prefill(study,record,form,firstName){
 if(!record)return;const data=values(record,firstName);
 for(const field of form.fields){const key=field.baselineKey;if(!key)continue;
  // A custom extraction meaning must not be replaced by a metadata shortcut.
  if(key!=='systemId'&&typeof field.definition==='string'&&field.definition.trim()&&field.definition.trim()!==definitions[key])continue;
  const value=data[key],old=study.fields[field.id];
  if(value&&(key==='systemId'||(!old||old.src==='record')))study.fields[field.id]={v:value,src:'record',ok:true};
 }
}
const api={fields,definitions,definition,upgrade,migrate,values,prefill};if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepExtractionBaseline=api;
})(globalThis);
