/* Read saved materials from the same project stores used by the evidence summary. */
(()=>{
'use strict';
function local(prefix,id){const value=localStorage.getItem(prefix+':'+id);if(!value)return null;try{return JSON.parse(value);}catch(_){throw Error('Could not read saved '+prefix+' materials. Open that tool and save them again.');}}
function read(name,id,signal){return new Promise((resolve,reject)=>{
 if(signal?.aborted){reject(new DOMException('Stopped','AbortError'));return;}
 let request,db,missing=false,settled=false;
 const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(db)db.close();error?reject(error):resolve(value);};
 const abort=()=>finish(new DOMException('Stopped','AbortError'));
 const timer=setTimeout(()=>finish(Error('Reading saved '+name+' materials timed out. Close other AIM-STEP tabs and try Generate again.')),10000);
 signal?.addEventListener('abort',abort,{once:true});
 try{request=indexedDB.open(name);}catch(error){finish(error);return;}
 request.onupgradeneeded=()=>{missing=true;request.transaction.abort();};
 request.onerror=()=>finish(missing?null:request.error,null);
 request.onblocked=()=>finish(Error('Project storage is blocked by another tab. Close other AIM-STEP tabs and retry Generate.'));
 request.onsuccess=()=>{
  db=request.result;if(settled){db.close();return;}
  try{if(!db.objectStoreNames.contains('projects')){finish(null,null);return;}const transaction=db.transaction('projects'),row=transaction.objectStore('projects').get(id);transaction.oncomplete=()=>finish(null,row.result||null);transaction.onabort=transaction.onerror=()=>finish(transaction.error||Error('Could not read project materials.'));}catch(error){finish(error);}
 };
});}
async function collect(id,{signal}={}){
 const names=['aimstep-search-results','aimstep-title-abstract','aimstep-fulltext','aimstep-extraction','aimstep-rob','aimstep-analysis'];
 const rows=await Promise.all(names.map(name=>read(name,id,signal)));
 const raw={eligibility:local('aimstep-eligibility',id),search:local('aimstep-search-strategy',id),coe:local('aimstep-coe',id),screenSummary:local('aimstep-screen-summary',id),fullSummary:local('aimstep-fulltext-summary',id),coeSummary:local('aimstep-coe-summary',id),searchResults:rows[0],screening:rows[1]?.state,fulltext:rows[2]?.state,extraction:rows[3]?.state,rob:rows[4]?.state,analysis:rows[5]?.state};
 return {projectId:id,materials:window.AimstepManuscriptCore.projectSources(raw),eligibility:window.AimstepManuscriptCore.clean(raw.eligibility)};
}
window.AimstepProposalContext={collect};
})();
