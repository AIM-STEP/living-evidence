/* Read saved materials from the same project stores used by the evidence summary. */
(()=>{
'use strict';
function local(prefix,id){const value=localStorage.getItem(prefix+':'+id);if(!value)return null;try{return JSON.parse(value);}catch(_){throw Error('Could not read saved '+prefix+' materials. Open that tool and save them again.');}}
function read(name,id){return new Promise((resolve,reject)=>{
 const request=indexedDB.open(name);let missing=false;
 request.onupgradeneeded=()=>{missing=true;request.transaction.abort();};
 request.onerror=()=>missing?resolve(null):reject(request.error);
 request.onblocked=()=>reject(Error('Project storage is blocked. Close other project tabs and retry.'));
 request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('projects')){db.close();resolve(null);return;}const transaction=db.transaction('projects'),row=transaction.objectStore('projects').get(id);transaction.oncomplete=()=>{db.close();resolve(row.result||null);};transaction.onabort=transaction.onerror=()=>{db.close();reject(transaction.error||Error('Could not read project materials.'));};};
});}
async function collect(id){
 const names=['aimstep-search-results','aimstep-title-abstract','aimstep-fulltext','aimstep-extraction','aimstep-rob','aimstep-analysis'];
 const rows=await Promise.all(names.map(name=>read(name,id)));
 const raw={eligibility:local('aimstep-eligibility',id),search:local('aimstep-search-strategy',id),coe:local('aimstep-coe',id),screenSummary:local('aimstep-screen-summary',id),fullSummary:local('aimstep-fulltext-summary',id),coeSummary:local('aimstep-coe-summary',id),searchResults:rows[0],screening:rows[1]?.state,fulltext:rows[2]?.state,extraction:rows[3]?.state,rob:rows[4]?.state,analysis:rows[5]?.state};
 return {projectId:id,materials:window.AimstepManuscriptCore.projectSources(raw),eligibility:window.AimstepManuscriptCore.clean(raw.eligibility)};
}
window.AimstepProposalContext={collect};
})();
