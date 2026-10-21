/* Store original proposal files as Blobs, without converting their contents. */
(()=>{
'use strict';
function open(){return new Promise((resolve,reject)=>{
 let blocked=false;
 const request=indexedDB.open('aimstep-proposal-files',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('files');
 request.onsuccess=()=>blocked?request.result.close():resolve(request.result);
 request.onerror=()=>reject(request.error);
 request.onblocked=()=>{blocked=true;reject(Error('Close other proposal tabs and try again.'));};
});}
async function access(mode,operation){
 const db=await open();
 try{return await new Promise((resolve,reject)=>{
  const transaction=db.transaction('files',mode),request=operation(transaction.objectStore('files'));
  transaction.oncomplete=()=>resolve(request.result);
  transaction.onabort=transaction.onerror=()=>reject(transaction.error||request.error||Error('Could not access the original file.'));
 });}finally{db.close();}
}
window.AimstepProposalFiles={
 get:id=>access('readonly',store=>store.get(id)),
 put:(id,file)=>access('readwrite',store=>store.put(file,id)),
 remove:id=>access('readwrite',store=>store.delete(id))
};
})();
