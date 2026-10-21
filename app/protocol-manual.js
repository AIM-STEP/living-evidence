/* Manual protocol intake, checked against PROSPERO's public application on
 * 2026-10-21: https://www.crd.york.ac.uk/PROSPERO/
 * Word ranges follow the corresponding current editor, not a registration check.
 */
(function(root){
'use strict';
const field=(id,label,hint='',options={})=>({id,label,hint,type:'textarea',...options});
const choice=(id,label,options,hint='')=>field(id,label,hint,{type:'select',options});
const sections=[
 {id:'basic',title:'Review title and basic details',fields:[
  field('reviewTitle','Review title','Use a clear English title describing the population, intervention or exposure, and review purpose.',{type:'text',required:true,minWords:5,maxWords:30}),
  choice('reviewType','Review type',[['Systematic Review','Systematic review'],['Network/Meta-analysis','Systematic review with meta-analysis / network meta-analysis'],['Diagnostic Review','Diagnostic accuracy review'],['Prognostic Review','Prognostic review'],['Qualitative Review','Qualitative evidence synthesis'],['Scoping Review','Scoping review'],['Other Review','Other review']],'Describe the actual review design.'),
  choice('framework','Question framework',[['PICO','PICO'],['PECO','PECO'],['PICo','PICo'],['PCC','PCC'],['Other','Other']],'Use the framework that fits your question.'),
  field('rationale','Rationale','Explain why the review is needed and what gap it addresses.',{required:true,minWords:5,maxWords:250}),
  field('objectives','Review objectives','State the questions the review will answer.',{required:true,minWords:10,maxWords:200})
 ]},
 {id:'eligibility',title:'Eligibility criteria',tool:'eligibility.html',fields:[]},
 {id:'searching',title:'Searching and screening',fields:[
  field('databases','Main databases and platforms','Name each database and the platform used to search it.'),
  field('screeningAdditional','Screening information','Describe study selection, screening roles, disagreement resolution and any automation.',{maxWords:250})
 ]},
 {id:'collection',title:'Data collection process',fields:[
  field('dataItems','Data to extract','Specify study, participant, intervention, outcome and other variables.')
 ]},
 {id:'synthesis',title:'Planned data synthesis',fields:[
  field('synthesis','Overall synthesis plan','Describe how study results will be combined, or the conditions required for synthesis.',{minWords:30,maxWords:500}),
  field('subgroups','Subgroup analyses','Prespecify groups, effect modifiers and their rationale.',{maxWords:250}),
  field('sensitivity','Sensitivity analyses','Specify the assumptions or decisions to be examined.')
 ]}
];
const fields=sections.flatMap(section=>section.fields.map(value=>({...value,section:section.id})));
const text=value=>String(value??'').trim();
function migrate(saved,legacy={}){
 if(saved&&typeof saved==='object'&&!Array.isArray(saved))return {...saved};
 return {reviewTitle:text(legacy.question),framework:text(legacy.framework),reviewType:text(legacy.type),legacyEligibility:text(legacy.eligibility),legacyOutcomes:text(legacy.outcomes),legacySearch:text(legacy.search),legacyMethods:text(legacy.methods),legacyTeam:text(legacy.team),legacyOther:text(legacy.other)};
}
function active(){return true;}
function wordCount(value){return text(value).split(/\s+/).filter(Boolean).length;}
function fieldErrors(field,value){
 const content=text(value);if(!content)return [];
 const count=wordCount(content),errors=[];
 if(field.minWords&&count<field.minWords)errors.push('Use at least '+field.minWords+' words.');
 if(field.maxWords&&count>field.maxWords)errors.push('Use no more than '+field.maxWords+' words.');
 if(/^(?:n\/?a|none|not applicable|-)$/i.test(content)&&field.maxWords)errors.push('Give an explanation or leave the draft field blank.');
 if(field.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content))errors.push('Enter a valid email address.');
 return errors;
}
function validate(values,options={}){
 const errors=[];
 if(!text(values.reviewTitle))errors.push('Enter a review title before generating.');
 for(const item of fields){if(item.type==='team'||!active(item,values))continue;for(const error of fieldErrors(item,values[item.id])){if(options.draft&&error.startsWith('Use at least '))continue;errors.push(item.label+': '+error);}}
 return errors;
}
function display(item,value){
 if(item.type==='select')return item.options.find(([id])=>id===value)?.[1]||text(value);
 return text(value);
}
function snapshot(values){
 return sections.filter(section=>!section.when||section.when(values)).map(section=>({title:section.title,fields:section.fields.filter(item=>active({...item,section:section.id},values)).map(item=>({id:item.id,label:item.label,text:display(item,values[item.id])}))}));
}
function format(values){return snapshot(values).map((section,index)=>(index+1)+'. '+section.title.toUpperCase()+'\n\n'+section.fields.map(field=>field.label+'\n'+field.text).join('\n\n')).join('\n\n');}
const api={sections,fields,migrate,active,wordCount,fieldErrors,validate,snapshot,format};
if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepProtocolManual=api;
})(globalThis);
