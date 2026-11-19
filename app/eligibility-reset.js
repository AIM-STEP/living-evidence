/* Project-scoped deletion and generation guard shared by eligibility and screening editors. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.AimstepEligibilityReset=api;
})(globalThis,function(){
'use strict';
function fail(code,message){throw Object.assign(new Error(message),{code});}
function currentEpoch(storage,projectId){
 return storage.getItem('aimstep-eligibility-epoch:'+projectId);
}
function requireEpoch(storage,projectId,expected){
 if(currentEpoch(storage,projectId)!==(expected??null)){
  fail('VERSION_CONFLICT','These criteria were cleared in another session. Reload this project before saving new criteria.');
 }
}
function projectKeys(projectId){
 return {project:'aimstep-eligibility-v3:'+projectId,legacy:'aimstep-eligibility:'+projectId,
  library:'aimstep-eligibility-library:'+projectId,summary:'aimstep-eligibility-summary:'+projectId};
}
function resetProject(storage,projectId,cleanState,extraChanges=[]){
 if(!projectId)fail('PROJECT_REQUIRED','Open a registered project first.');
 requireEpoch(storage,projectId,cleanState.criteria_epoch);
 const keys=projectKeys(projectId),epochKey='aimstep-eligibility-epoch:'+projectId;
 const allowed=new Set(['aimstep-protocol-backups:'+projectId,'aimstep-search-strategy:'+projectId,
  'aimstep-setup-completed:'+encodeURIComponent(projectId)]);
 for(const [key,value] of extraChanges)if(!allowed.has(key)||(value!==null&&typeof value!=='string')){
  fail('INVALID_RESET_TARGET','The reset target does not belong to this criteria workspace.');
 }
 // Only the question input and editor settings survive a criteria reset.
 const epoch=crypto.randomUUID(),fresh={question:typeof cleanState.question==='string'?cleanState.question:'',
  criteria:[],machineCriteria:[],criteria_epoch:epoch};
 for(const field of ['reviewType','activeGenerator','generationMethodChoice','generationMode']){
  if(cleanState[field]!==undefined)fresh[field]=cleanState[field];
 }
 const changes=[[keys.project,null],[keys.legacy,JSON.stringify(fresh)],
  [keys.library,JSON.stringify({version:1,entries:[],activeId:null})],[keys.summary,null],...extraChanges,[epochKey,epoch]];
 const before=changes.map(([key])=>storage.getItem(key));
 let written=0;
 try{
  for(const [key,value] of changes){
   if(value===null)storage.removeItem(key);else storage.setItem(key,value);
   written++;
  }
 }catch(error){
  while(written>0){
   const index=--written,key=changes[index][0];
   try{if(before[index]===null)storage.removeItem(key);else storage.setItem(key,before[index]);}catch(_){}
  }
  throw error;
 }
 return epoch;
}
return {currentEpoch,requireEpoch,projectKeys,resetProject};
});
