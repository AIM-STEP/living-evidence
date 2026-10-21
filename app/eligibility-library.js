/* Project-scoped saved criteria sets. Only review content is copied into sets. */
(function(root){
'use strict';
const fields=['framework','question','reviewType','activeGenerator','generationMethodChoice','generationMode','generationMethod','criteria','machineCriteria','machineRun','machineSourceRevision','manualRefinement','machineRefinement','finalCriteria','resolvedPending','pendingDecisions','visibleDescription','dateRange','language','limitsOther','years','dateEnd','reportType','reportTypeOther','limitsReason','outcomeGate','outcomeReason','protocolSource','confirmed'];
const clone=value=>JSON.parse(JSON.stringify(value));
const key=id=>'aimstep-eligibility-library:'+id;
function read(storage,id){
 const value=JSON.parse(storage.getItem(key(id))||'null');if(value&&Array.isArray(value.entries))return value;
 const library={version:1,entries:[],activeId:null};let backups=[];try{backups=JSON.parse(storage.getItem('aimstep-protocol-backups:'+id)||'[]');}catch(_){}
 const seen=new Set();for(const backup of Array.isArray(backups)?backups:[]){const data=backup.eligibility;if(!data||!hasRules(data))continue;const date=data.machineRun?.generatedAt||data.protocolSource?.date||backup.date;if(!date||Number.isNaN(Date.parse(date)))continue;const signature=kind(data)+date+rowKey(data);if(seen.has(signature))continue;seen.add(signature);let hash=2166136261;for(const char of signature)hash=Math.imul(hash^char.charCodeAt(0),16777619);library.entries.push({id:'legacy-'+(hash>>>0).toString(16),createdAt:new Date(date).toISOString(),title:String(data.question||'').trim()||'Eligibility criteria',method:kind(data),snapshot:snapshot(data)});}
 library.entries.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));return library;
}
function rows(value){return (value.activeGenerator==='machine'?value.machineCriteria:value.criteria)||[];}
function hasRules(value){return !!value.generationMethodChoice&&rows(value).some(row=>['condition','uncertain','definition'].some(field=>{const text=String(row[field]||'').trim();return text&&!['Adults with the condition or population of interest','Eligible study designs','Define age threshold, diagnosis and how mixed populations are handled.','Specify design features; distinguish design from report format.'].includes(text);}));}
function snapshot(value){return clone(Object.fromEntries(fields.filter(field=>value[field]!==undefined).map(field=>[field,value[field]])));}
function kind(value){return value.protocolSource?.sharedCriteria?'proposal':value.activeGenerator==='machine'?'machine':'manual';}
function rowKey(value){return JSON.stringify(rows(value).map(row=>[row.title,row.condition,row.uncertain,row.definition]));}
function plan(storage,id,value,options={}){
 const library=read(storage,id),next={...value};
 const previous=options.previous;
 if(previous&&hasRules(previous)&&!library.entries.some(entry=>entry.id===previous.criteriaLibraryId||kind(entry.snapshot)===kind(previous)&&rowKey(entry.snapshot)===rowKey(previous))){const date=previous.machineRun?.generatedAt||previous.protocolSource?.date;library.entries.push({id:previous.criteriaLibraryId||root.crypto?.randomUUID?.()||'prior-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),createdAt:date&&!Number.isNaN(Date.parse(date))?new Date(date).toISOString():new Date().toISOString(),title:String(previous.question||'').trim()||'Eligibility criteria',method:kind(previous),snapshot:snapshot(previous)});}

 if(!hasRules(value)){next.criteriaLibraryId=null;library.activeId=null;return {state:next,library};}
 let entry=library.entries.find(entry=>entry.id===value.criteriaLibraryId&&kind(entry.snapshot)===kind(value));
 if(options.fresh)entry=null;
 else if(!entry)entry=library.entries.find(entry=>kind(entry.snapshot)===kind(value)&&rowKey(entry.snapshot)===rowKey(value));
 const now=new Date().toISOString();
 if(!entry){const date=options.createdAt||value.machineRun?.generatedAt||value.protocolSource?.date;entry={id:root.crypto?.randomUUID?.()||'criteria-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),createdAt:date&&!Number.isNaN(Date.parse(date))?new Date(date).toISOString():now,title:String(value.question||'').trim()||String(value.reviewType||'Review')+' criteria',method:kind(value),snapshot:snapshot(value)};library.entries.push(entry);}
 else if(options.updateEntry||rowKey(entry.snapshot)!==rowKey(value)){entry.snapshot=snapshot(value);entry.title=String(value.question||'').trim()||entry.title;entry.updatedAt=now;}
 library.activeId=entry.id;next.criteriaLibraryId=entry.id;
 library.entries.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));return {state:next,library};
}
function write(storage,values){const before=values.map(([key])=>storage.getItem(key));try{for(const [key,value]of values)value===null?storage.removeItem(key):storage.setItem(key,JSON.stringify(value));}catch(error){values.forEach(([key],index)=>{try{before[index]===null?storage.removeItem(key):storage.setItem(key,before[index]);}catch(_){}});throw error;}}
function commit(storage,id,value,options={}){const result=plan(storage,id,value,options);write(storage,[[key(id),result.library],['aimstep-eligibility:'+id,result.state]]);return result.state;}
function remove(storage,id,entryId,value){const library=read(storage,id),active=library.activeId===entryId||value.criteriaLibraryId===entryId;library.entries=library.entries.filter(entry=>entry.id!==entryId);let state=value;if(active){library.activeId=null;state={...value,criteriaLibraryId:null,criteria:[],machineCriteria:[],machineRun:null,manualRefinement:null,machineRefinement:null,finalCriteria:null,pendingDecisions:{},resolvedPending:[],visibleDescription:null,confirmed:false};if(state.protocolSource)state.protocolSource={...state.protocolSource,sharedCriteria:false};}const values=[[key(id),library]];if(active)values.push(['aimstep-eligibility:'+id,state],['aimstep-eligibility-summary:'+id,null]);write(storage,values);return {state,active};}
const api={key,read,hasRules,plan,commit,remove};if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepEligibilityLibrary=api;
})(globalThis);
