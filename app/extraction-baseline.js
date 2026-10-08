(function(root){
'use strict';
const fields=[
 ['systemId','System ID',['system id','fixed id','record id']],
 ['doi','DOI',['doi','doi number']],
 ['journal','Journal',['journal']],
 ['firstName','First author first name',['first author first name']],
 ['year','Publication year',['publication year','year']],
 ['country','Country',['country']],
 ['studyType','Study type',['study type','study design']],
 ['registration','Study registration number',['study registration number','trial registration number']],
 ['funding','Funding',['funding']]
];
function upgrade(list){
 const remaining=[...list],baseline=[];
 for(const [key,label,aliases] of fields){const index=remaining.findIndex(f=>f.baselineKey===key||aliases.includes(String(f.label).trim().toLowerCase()));const old=index<0?null:remaining.splice(index,1)[0];baseline.push({...old,id:old?.id||'baseline-'+key,label,section:'baseline',baselineKey:key});}
 // Retain custom fields and their IDs; the former default Setting belongs to Other information.
 return [...baseline,...remaining.map(f=>String(f.label).toLowerCase()==='setting'?{...f,section:'other'}:f)];
}
function migrate(form){
 if(form.baselineVersion===2)return;
 if(!form.baselineVersion){
  if(form.sections.includes('baseline')){const selected=form.fields.filter(f=>f.section==='baseline'),other=form.fields.filter(f=>f.section!=='baseline');form.fields=[...upgrade(selected),...other];}
  else if(form.sectionArchives.baseline)form.sectionArchives.baseline=upgrade(form.sectionArchives.baseline);
 }
 const rank=field=>{const index=fields.findIndex(([key])=>key===field.baselineKey);return index<0?fields.length:index;};
 const reorder=list=>{const ordered=list.filter(f=>f.section==='baseline').sort((a,b)=>rank(a)-rank(b));let index=0;return list.map(f=>f.section==='baseline'?ordered[index++]:f);};
 form.fields=reorder(form.fields);
 if(form.sectionArchives.baseline)form.sectionArchives.baseline=reorder(form.sectionArchives.baseline);
 form.baselineVersion=2;
}
function values(record,firstName){
 const plain=value=>typeof value==='string'||typeof value==='number'?String(value):'';
 return {systemId:Number.isSafeInteger(record.sourceNumber)?'#'+(record.extractionOrigin==='local'?'L':'')+record.sourceNumber:'',firstName:firstName(record),year:plain(record.year),country:plain(record.country),doi:plain(record.doi),journal:plain(record.journal),studyType:plain(record.studyType||record.studyDesign),registration:plain(record.registrationNumber||record.trialRegistrationNumber),funding:plain(record.funding)};
}
function prefill(study,record,form,firstName){
 if(!record)return;const data=values(record,firstName);
 for(const field of form.fields){const key=field.baselineKey;if(!key)continue;const value=data[key],old=study.fields[field.id];
  if(value&&(key==='systemId'||(!old||old.src==='record')))study.fields[field.id]={v:value,src:'record',ok:true};
 }
}
const api={fields,upgrade,migrate,values,prefill};if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepExtractionBaseline=api;
})(globalThis);
