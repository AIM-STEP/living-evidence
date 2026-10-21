/* PROSPERO-style draft fields, organised from the registry's record headings.
 * Reference: https://www.crd.york.ac.uk/PROSPERO/
 * This prepares a draft, not a registry submission.
 */
(function(root){
'use strict';
const fields=[
 ['reviewTitle','REVIEW TITLE AND BASIC DETAILS','Review title'],
 ['rationale','REVIEW TITLE AND BASIC DETAILS','Rationale for the review'],
 ['reviewObjectives','REVIEW TITLE AND BASIC DETAILS','Review objectives'],
 ['keywords','REVIEW TITLE AND BASIC DETAILS','Keywords'],
 ['reviewType','REVIEW TITLE AND BASIC DETAILS','Review type'],
 ['conditionDomain','ELIGIBILITY CRITERIA','Condition or domain being studied'],
 ['population','ELIGIBILITY CRITERIA','Population'],
 ['interventions','ELIGIBILITY CRITERIA','Intervention(s) or exposure(s)'],
 ['comparators','ELIGIBILITY CRITERIA','Comparator(s) or control(s)'],
 ['studyDesign','ELIGIBILITY CRITERIA','Study design'],
 ['context','ELIGIBILITY CRITERIA','Context'],
 ['otherEligibility','ELIGIBILITY CRITERIA','Other inclusion and exclusion criteria'],
 ['searchSources','SEARCHING AND SCREENING','Information sources'],
 ['searchLimits','SEARCHING AND SCREENING','Search restrictions'],
 ['searchStrategy','SEARCHING AND SCREENING','Search strategy'],
 ['otherSearchMethods','SEARCHING AND SCREENING','Other methods of identifying studies'],
 ['selection','SEARCHING AND SCREENING','Selection process'],
 ['outcomeEligibility','OUTCOMES TO BE ANALYSED','Outcome eligibility criteria'],
 ['mainOutcomes','OUTCOMES TO BE ANALYSED','Main outcomes'],
 ['additionalOutcomes','OUTCOMES TO BE ANALYSED','Additional outcomes'],
 ['effectMeasures','OUTCOMES TO BE ANALYSED','Measures of effect'],
 ['extraction','DATA COLLECTION PROCESS','Data extraction'],
 ['riskOfBias','DATA COLLECTION PROCESS','Study risk of bias assessment'],
 ['reportingBias','DATA COLLECTION PROCESS','Reporting bias assessment'],
 ['certainty','DATA COLLECTION PROCESS','Certainty assessment'],
 ['synthesis','PLANNED DATA SYNTHESIS','Strategy for data synthesis'],
 ['subgroups','PLANNED DATA SYNTHESIS','Subgroup analysis'],
 ['sensitivity','PLANNED DATA SYNTHESIS','Sensitivity analysis'],
 ['team','REVIEW AFFILIATION, FUNDING AND PEER REVIEW','Review team'],
 ['contact','REVIEW AFFILIATION, FUNDING AND PEER REVIEW','Named contact'],
 ['affiliation','REVIEW AFFILIATION, FUNDING AND PEER REVIEW','Organisational affiliation'],
 ['funding','REVIEW AFFILIATION, FUNDING AND PEER REVIEW','Funding sources'],
 ['conflicts','REVIEW AFFILIATION, FUNDING AND PEER REVIEW','Conflicts of interest'],
 ['peerReview','REVIEW AFFILIATION, FUNDING AND PEER REVIEW','Peer review'],
 ['startDate','TIMELINE OF THE REVIEW','Review start date'],
 ['endDate','TIMELINE OF THE REVIEW','Review end date'],
 ['stage','TIMELINE OF THE REVIEW','Review stage'],
 ['protocolAvailability','ADDITIONAL INFORMATION','Availability of full protocol'],
 ['dissemination','ADDITIONAL INFORMATION','Dissemination plans'],
 ['registration','ADDITIONAL INFORMATION','Registration details'],
 ['amendments','ADDITIONAL INFORMATION','Protocol amendments']
];
const norm=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
function supplied(value){
 const text=String(value||'').trim();
 return /^(?:not specified(?:\s*[—–-]\s*to confirm)?|to be (?:defined|confirmed)|n\/?a|unknown|待补充|待确认|未提供|未指定)[.!。]?$/i.test(text)||[
  'Adults with the condition or population of interest','Eligible study designs',
  'Define age threshold, diagnosis and how mixed populations are handled.',
  'Specify design features; distinguish design from report format.'
 ].includes(text)?'':text;
}
function targets(title){
 const value=norm(title).toLowerCase();
 if(/population|participant|人群|研究对象/.test(value))return ['population','conditionDomain'];
 if(/intervention|exposure|concept|phenomenon|干预|暴露|概念|现象/.test(value))return ['interventions'];
 if(/comparison|comparator|control|对照/.test(value))return ['comparators'];
 if(/study design|study type|研究设计|研究类型/.test(value))return ['studyDesign'];
 if(/context|setting|场景|环境/.test(value))return ['context'];
 if(/primary outcome|main outcome|主要结局/.test(value))return ['mainOutcomes','outcomeEligibility'];
 if(/secondary outcome|additional outcome|次要结局/.test(value))return ['additionalOutcomes','outcomeEligibility'];
 if(/outcome|结局/.test(value))return ['outcomeEligibility'];
 if(/language|publication date|report type|语言|发表日期|报告类型/.test(value))return ['searchLimits'];
 const exact=fields.find(([, ,label])=>label.toLowerCase()===value);
 return exact?[exact[0]]:['otherEligibility'];
}
function source(raw){
 if(!raw||typeof raw!=='object')return {question:'',reviewType:'',framework:'',rows:[],evidence:[]};
 const machine=raw.activeGenerator==='machine'||!raw.activeGenerator&&raw.generationMode==='machine';
 const blank=Object.hasOwn(raw,'generationMethodChoice')&&!raw.generationMethodChoice;
 const rows=blank?[]:machine?(raw.machineCriteria||raw.criteria||[]):(raw.criteria||[]);
 if(!Array.isArray(rows))throw Error('The saved eligibility criteria could not be read.');
 const result={question:supplied(raw.question),reviewType:supplied(raw.reviewType),framework:supplied(raw.framework),rows:[],evidence:[]};
 const add=(id,text,allowed,kind='')=>{if(text)result.evidence.push({id,text,allowed,kind});};
 add('question',result.question,['reviewTitle','reviewObjectives']);
 add('review-type',result.reviewType,['reviewType']);
 for(const [index,row]of rows.entries()){
  if(!row||typeof row!=='object')continue;
  const value={title:supplied(row.title),inclusion:supplied(row.condition),exclusion:supplied(row.uncertain),other:supplied(row.definition)};
  if(!value.inclusion&&!value.exclusion&&!value.other)continue;
  result.rows.push(value);
  for(const kind of ['inclusion','exclusion','other'])add('row-'+index+'-'+kind,value[kind],[...targets(value.title),'reviewTitle','reviewObjectives'],kind);
 }
 if(!machine){
  add('language',supplied(raw.language),['searchLimits']);
  add('other-limits',supplied(raw.limitsOther),['searchLimits']);
  for(const side of ['start','end']){
   const date=raw.dateRange?.[side];
   const value=typeof date==='string'?date:date?.year?[date.year,date.month,date.day].filter(Boolean).join('-'):'';
   add('publication-date-'+side,value,['searchLimits'],'publication date '+side);
  }
 }
 return result;
}
const schema={type:'object',properties:{fields:{type:'array',items:{type:'object',properties:{id:{type:'string',enum:fields.map(([id])=>id)},text:{type:'string'},evidence:{type:'array',items:{type:'object',properties:{sourceId:{type:'string'},quote:{type:'string'}},required:['sourceId','quote']}}},required:['id','text','evidence']}},issues:{type:'array',items:{type:'string'}}},required:['fields','issues']};
function validate(value,input){
 if(!Array.isArray(value?.fields)||!Array.isArray(value.issues))throw Error('The AI returned an incomplete PROSPERO draft. Try again.');
 const available=new Map(input.evidence.map(item=>[item.id,item]));
 const result=fields.map(([id,group,label])=>{
  const matches=value.fields.filter(item=>item.id===id);
  if(matches.length!==1||typeof matches[0].text!=='string'||!Array.isArray(matches[0].evidence))throw Error('The AI omitted or duplicated a PROSPERO field: '+label);
  const field=matches[0],references=field.evidence.filter(ref=>{
   const item=available.get(ref?.sourceId);
   return item&&item.allowed.includes(id)&&norm(ref.quote)&&norm(ref.quote)===norm(item.text);
  });
  // Preserve source rules exactly, even if the model drops or rewrites them.
  const rules=input.evidence.filter(item=>item.kind&&item.allowed[0]===id);
  const prefixes={inclusion:'Inclusion',exclusion:'Exclusion',other:'Other'};
  if(rules.length)return {id,group,label,text:rules.map(item=>(prefixes[item.kind]||item.kind)+': '+item.text).join('\n'),evidence:rules.map(item=>({sourceId:item.id,quote:item.text}))};
  // An unsupported field stays blank, including invented dates and methods.
  const narrative=id==='reviewTitle'||id==='reviewObjectives';
  return {id,group,label,text:references.length?(narrative?supplied(field.text):references.map(ref=>ref.quote).join('\n')):'',evidence:references};
 });
 return {fields:result,issues:value.issues.map(String)};
}
function text(value){
 let group='';const lines=[];
 for(const field of value){if(field.group!==group){group=field.group;lines.push(group,'');}lines.push(field.label,field.text,'');}
 return lines.join('\n');
}
const api={fields,source,schema,validate,text};
if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepProtocolGeneration=api;
})(globalThis);
