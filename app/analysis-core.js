/* Deterministic data preparation and confirmation gates. No model-generated code. */
(function(root){
'use strict';
const VERSION='analysis-2.0.0';
const fields=['study','author','year','outcome','timepoint','treat','type','n','event','mean','sd','unit','valueType','design'];
const numeric=['n','event','mean','sd'];
const value=x=>String(x&&typeof x==='object'&&'v' in x?x.v:x??'').trim();
const missing=x=>!value(x)||/^(NR|NA|N\/A|not reported|not applicable|null|undefined)$/i.test(value(x));
const number=x=>missing(x)?null:/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value(x))&&Number.isFinite(Number(value(x)))?Number(value(x)):null;
const key=x=>value(x).toLowerCase().replace(/[\s_\-]+/g,' ');
const signature=x=>JSON.stringify(x);
const dataSignature=ws=>signature({rows:ws.rows,sources:ws.sources.map(s=>({id:s.id,kind:s.kind,snapshot:s.snapshot}))});
const inputSignature=ws=>signature({data:dataSignature(ws),requirements:ws.requirements});
const planSignature=ws=>signature({input:inputSignature(ws),plan:ws.plan});
const confirmedData=ws=>!(ws.dataReview?.issues||[]).some(i=>i.severity==='error')&&!!ws.rows.length&&ws.dataConfirmed?.signature===dataSignature(ws)&&ws.dataReview?.signature===dataSignature(ws);
const confirmedPlan=ws=>confirmedData(ws)&&ws.planConfirmed?.signature===planSignature(ws)&&ws.planReview?.input===inputSignature(ws)&&ws.planReview?.signature===signature(ws.plan);
const aliases={study:['study','study id','studlab','id','report id','ref id #'],author:['author','first author'],year:['year','publication year'],outcome:['outcome','outcome name'],timepoint:['timepoint','time point','follow up','followup'],treat:['treat','treatment','node','arm','intervention'],type:['type','outcome type'],n:['n','total','n analysed','n analyzed','n analysed / at risk','sample size'],event:['event','events','r','participants with event'],mean:['mean','y'],sd:['sd','standard deviation'],unit:['unit','units','scale'],valueType:['value type','valuetype','endpoint or change','data type'],design:['design','study design','study type']};
function canonical(raw,defaults={}){
 const row={...defaults};for(const f of fields){const match=Object.keys(raw).find(k=>aliases[f].includes(key(k)));if(match!==undefined)row[f]=value(raw[match]);else row[f]=value(row[f]);}
 row.type=({dichotomous:'binary',bin:'binary',cont:'continuous'})[key(row.type)]||row.type.toLowerCase();
 if(!row.type)row.type=!missing(row.event)?'binary':(!missing(row.mean)||!missing(row.sd))?'continuous':'';
 return row;
}
function table(rows,name){
 rows=rows.filter(r=>Array.isArray(r)&&r.some(x=>value(x)));if(!rows.length)return [];
 // AIM-STEP exports are vertical: ID / Author / Year, then outcome and arm rows.
 if(key(rows[0][0])==='id'&&key(rows[1]?.[0])==='author'&&rows.some(r=>key(r[0])==='outcome')&&rows.some(r=>key(r[0])==='arm')){
  return Array.from({length:Math.max(...rows.map(r=>r.length))-1},(_,i)=>canonical(Object.fromEntries([...rows].reverse().map(r=>[r[0],r[i+1]??''])),{type:/dichotomous|binary/i.test(name)?'binary':/continuous/i.test(name)?'continuous':''})).filter(r=>!missing(r.outcome)&&!missing(r.treat));
 }
 const h=rows.findIndex(r=>r.some(v=>aliases.study.includes(key(v)))&&r.some(v=>aliases.treat.includes(key(v))));
 if(h<0)return [];
 return rows.slice(h+1).map(r=>canonical(Object.fromEntries(rows[h].map((v,i)=>[v,r[i]??''])),{outcome:name.replace(/\.[^.]+$/,'')}));
}
function parse(text,ext,name,csv){
 if(ext==='xlsx'){const sheets=JSON.parse(text);return sheets.flatMap(s=>table(s.rows,s.sheet));}
 if(ext==='json'){const obj=JSON.parse(text);if(Array.isArray(obj)&&obj[0]?.rows&&obj[0]?.sheet)return obj.flatMap(s=>table(s.rows,s.sheet));const list=Array.isArray(obj)?obj:obj.rows;if(Array.isArray(list))return list.map(r=>canonical(r));if(Array.isArray(obj.outcomes))return obj.outcomes.flatMap(o=>(o.rows||[]).map(r=>canonical(r,{outcome:o.name,timepoint:o.timepoint,type:o.type})));throw Error('JSON must contain rows or outcomes.');}
 if(!['csv','tsv','txt'].includes(ext))throw Error('Use CSV, TSV, Excel (.xlsx), JSON or a text table for analysis data.');
 return table(csv(text.replace(/^\ufeff/,''),ext==='tsv'||text.split(/\r?\n/)[0].includes('\t')?'\t':','),name);
}
function extraction(state,Results){
 const rows=[],notes=[];if(!state?.form)return {rows,notes};
 for(const record of state.records||[]){const study=state.studies?.[record.uid];if(!study)continue;
  if(!study.ai&&!Object.keys(study.res||{}).length)continue;
  const result=Results.fromStudy(study,state.form),field=k=>{const f=state.form.fields?.find(f=>f.baselineKey===k);return f?value(study.fields?.[f.id]):'';};
  const designField=state.form.fields?.find(f=>/study (design|type)|research (design|type)/i.test(f.label));
  for(const r of result.results){const o=state.form.outcomes.find(o=>o.id===r.outcome||o.name===r.outcome);if(!o||study.nr?.[o.id])continue;
   const stats=o.type==='binary'?[r.events,r.total]:[r.mean,r.sd,r.n];if(stats.every(missing)){notes.push((record.recordNumber||record.uid)+' · '+o.name+': no reported numeric outcome data.');continue;}
   rows.push(canonical({study:record.recordNumber||record.displayId||record.uid,author:field('firstName')||record.firstName||'',year:field('year')||record.year||'',outcome:o.name,timepoint:r.timepoint,treat:r.arm,type:o.type,n:o.type==='binary'?r.total:r.n,event:r.events,mean:r.mean,sd:r.sd,unit:o.unit||'',design:designField?value(study.fields?.[designField.id]):'',valueType:''}));
  }if(!study.done)notes.push((record.recordNumber||record.uid)+': extraction is not yet confirmed; check these values before confirming analysis data.');
 }return {rows,notes:[...new Set(notes)]};
}
function datasets(rows){const groups=new Map();for(const row of rows){const g=signature([row.outcome,row.timepoint,row.type,row.unit,row.valueType]);if(!groups.has(g))groups.set(g,{id:'d'+(groups.size+1),name:row.outcome,timepoint:row.timepoint,type:row.type,unit:row.unit,valueType:row.valueType,rows:[]});groups.get(g).rows.push({...row,...Object.fromEntries(numeric.map(f=>[f,number(row[f])]))});}return [...groups.values()];}
function validate(rows){const issues=[];const add=(row,message,severity='error')=>issues.push({row:row+1,severity,message});if(!rows.length)return [{row:0,severity:'error',code:'empty-data',message:'Import data before checking.'}];
 const seen=new Set();for(const [i,r] of rows.entries()){
  for(const f of ['study','outcome','timepoint','treat','type'])if(missing(r[f]))add(i,'Add '+f+'.');
  if(!['binary','continuous'].includes(r.type))add(i,'Outcome type must be binary or continuous.');
  const n=number(r.n);if(!Number.isInteger(n)||n<2)add(i,'N must be a whole number of at least 2.');
  if(r.type==='binary'){const e=number(r.event);if(!Number.isInteger(e)||e<0||e>n)add(i,'Events must be a whole number between 0 and N.');}
  if(r.type==='continuous'){if(number(r.mean)===null)add(i,'A reported mean is required; NR/NA is not zero.');if(!(number(r.sd)>0))add(i,'SD must be above zero.');if(missing(r.unit))add(i,'Specify the measurement unit or named scale.');if(!['endpoint','change'].includes(key(r.valueType)))add(i,'Set valueType to endpoint or change.');}
  if(!missing(r.design)&&/cluster|crossover|cross.over|paired|matched/i.test(r.design))add(i,'This raw arm-level engine requires independent parallel groups. Supply appropriately adjusted data in a supported analysis workflow.');
  else if(missing(r.design))add(i,'Study design is not specified; verify independent parallel groups.','warning');
  const id=signature([key(r.study),key(r.outcome),key(r.timepoint),key(r.treat)]);if(seen.has(id))add(i,'Duplicate study/outcome/time-point/treatment row. Resolve duplicate reports or arms before analysis.');seen.add(id);
 }
 for(const d of datasets(rows)){const by=new Map();for(const r of d.rows){if(!by.has(r.study))by.set(r.study,[]);by.get(r.study).push(r);}for(const [study,arms]of by)if(arms.length<2)issues.push({row:0,severity:'warning',message:d.name+' · '+d.timepoint+' · '+study+': only one arm; pooling requires at least two.'});}
 return issues;
}
function planErrors(plan,rows,requirements=''){
 const errors=[],ds=datasets(rows);if(!plan||!Array.isArray(plan.analyses)||!plan.analyses.length)return ['The AI must create at least one analysis.'];
 errors.push(...(plan.blockers||[]),...(plan.unsupported||[]));const used=new Set();
 for(const p of plan.analyses){const d=ds.find(d=>d.id===p.datasetId);if(!d){errors.push('Unknown dataset '+p.datasetId);continue;}if(used.has(d.id))errors.push('Duplicate analysis for '+d.id);used.add(d.id);
  if(!['descriptive','frequentist','bayesian','both'].includes(p.method))errors.push('Unsupported method: '+p.method);
  if(p.method==='descriptive')continue;
  if(!(d.type==='binary'?['RR','OR']:['MD','SMD']).includes(p.measure))errors.push('Effect measure does not match '+d.name);
  if(!['common','random'].includes(p.model))errors.push('Choose common or random effects.');
  if(!d.rows.some(r=>r.treat===p.reference))errors.push('Reference treatment not found for '+d.id);
  if(typeof p.smallBetter!=='boolean')errors.push('Specify the preferred outcome direction for '+d.id);
  const by=new Map();for(const r of d.rows){if(!by.has(r.study))by.set(r.study,[]);by.get(r.study).push(r);}if([...by.values()].some(a=>a.length<2))errors.push('Resolve single-arm studies for '+d.id+' before pooling.');
  const treatments=[...new Set(d.rows.map(r=>r.treat))],seen=new Set(treatments.slice(0,1));let grew=true;while(grew){grew=false;for(const arms of by.values())if(arms.some(r=>seen.has(r.treat)))for(const r of arms)if(!seen.has(r.treat)){seen.add(r.treat);grew=true;}}if(seen.size!==treatments.length)errors.push('Disconnected network for '+d.id+'. Analyse connected subsets separately.');if(treatments.length>40)errors.push('This browser engine supports up to 40 treatments per analysis.');
  if(p.measure==='SMD'&&[...by.values()].some(a=>a.length>2))errors.push('Multi-arm SMD is not enabled; use a validated multivariate SMD workflow.');
  if(['bayesian','both'].includes(p.method)){if(p.model==='common')errors.push('Bayesian common-effect analysis is not implemented. Select frequentist or random effects.');if(!['halfnormal','uniform'].includes(p.prior))errors.push('Unsupported heterogeneity prior.');if(!(Number(p.prior==='uniform'?p.priorMax:p.priorScale)>0))errors.push('Set a positive heterogeneity prior scale/upper limit.');if(!Number.isInteger(p.draws)||p.draws<2000||p.draws>100000)errors.push('Use 2,000–100,000 posterior draws.');if(!Number.isInteger(p.seed))errors.push('Seed must be an integer.');}
 }
 const excluded=plan.excludedDatasets||[];for(const e of excluded){if(!ds.some(d=>d.id===e.datasetId)||used.has(e.datasetId)||!value(e.reason))errors.push('Invalid or unexplained dataset exclusion.');else used.add(e.datasetId);}for(const d of ds)if(!used.has(d.id))errors.push('Specify an analysis or explicit exclusion for '+d.id+' ('+d.name+' · '+d.timepoint+').');
 // Independent backstop: never silently perform a simpler analysis than an explicit request.
 const unsupported=/\b(REML|Hartung|Knapp|meta[ -]?regression|IPD|individual participant|Cox|survival|hazard ratio|logistic regression|funnel|Egger|Begg|subgroup|leave.one.out|sensitivity analysis|binomial likelihood|publication bias test)\b|亚组|回归|生存分析|敏感性分析|漏斗|个体数据/i;
 const requested=requirements.replace(/\b(?:do not|don't|without|avoid|exclude)\b[^.;\n]*/gi,'').replace(/(?:不要|不需要|不做|无需|不进行)[^。；\n]*/g,'');
 if(unsupported.test(requested))errors.push('The requirements name a method not supported by this execution engine. Revise the requirements or use a validated external statistical workflow; it will not be silently substituted.');
 return [...new Set(errors.map(value).filter(Boolean))];
}
function canRun(ws){return !!ws.requirements.trim()&&confirmedPlan(ws)&&!validate(ws.rows).some(x=>x.severity==='error')&&!planErrors(ws.plan,ws.rows,ws.requirements).length;}
function invalidate(ws,part='data'){if(part==='data'){ws.dataReview=null;ws.dataConfirmed=null;}ws.planReview=null;ws.planConfirmed=null;}
function csv(rows){const safe=x=>{const s=String(x??'');return '"'+(/^[=+@\-]/.test(s)&&number(s)===null?'\u0027':'')+s.replace(/"/g,'""')+'"';};return rows.map(r=>r.map(safe).join(',')).join('\r\n');}
const api={VERSION,fields,numeric,value,missing,number,key,signature,dataSignature,inputSignature,planSignature,confirmedData,confirmedPlan,canonical,table,parse,extraction,datasets,validate,planErrors,canRun,invalidate,csv};if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepAnalysisCore=api;
})(globalThis);
