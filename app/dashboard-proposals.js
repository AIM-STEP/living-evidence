/* The dashboard lists saved proposal files, deduplicating project seed copies. */
(()=>{
'use strict';
const list=document.getElementById('dashboard-proposals');if(!list)return;
const prefix='aimstep-protocol:',deleted='aimstep-proposal-deleted:';
function files(){
 const result=new Map(),keys=[];
 for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(prefix))keys.push(key);}
 keys.sort((a,b)=>a===prefix+'default'?-1:b===prefix+'default'?1:a.localeCompare(b));
 for(const key of keys){
  let draft;try{draft=JSON.parse(localStorage.getItem(key)||'null');}catch(_){continue;}
  const scope=key.slice(prefix.length);
  for(const file of Array.isArray(draft?.imports)?draft.imports:[]){
   if(!file?.name||file.id&&localStorage.getItem(deleted+file.id))continue;
   const id=file.id||scope+':'+file.name,entry={...file,scope};
   if(!result.has(id)||file.ownerScope===scope)result.set(id,entry);
  }
 }
 return [...result.values()].sort((a,b)=>String(b.importedAt||'').localeCompare(String(a.importedAt||'')));
}
function render(){
 const entries=files();list.hidden=!entries.length;
 list.replaceChildren(...entries.map(file=>{
  const row=document.createElement('li'),link=document.createElement('a'),close=document.createElement('button'),url=new URL('build-protocol.html',document.baseURI);
  url.searchParams.set('projectId',file.scope);if(file.id)url.searchParams.set('proposalId',file.id);else url.searchParams.set('proposalName',file.name);
  link.href=url.href;link.textContent=file.name;link.className='dashboard-proposal-name';
  row.appendChild(link);
  if(file.id){close.type='button';close.className='dashboard-proposal-delete';close.textContent='×';close.setAttribute('aria-label',(window.AIMSTEP?.lang()==='zh'?'删除：':'Delete: ')+file.name);close.onclick=()=>{try{localStorage.setItem(deleted+file.id,new Date().toISOString());window.dispatchEvent(new Event('aimstep:proposals-updated'));const frame=document.getElementById('project-page-frame');frame?.contentWindow?.dispatchEvent(new Event('aimstep:proposals-updated'));}catch(error){console.error('Could not delete proposal',error);}};row.appendChild(close);}
  return row;
 }));
}
window.addEventListener('aimstep:proposals-updated',render);
window.addEventListener('storage',event=>{if(!event.key||event.key.startsWith(prefix)||event.key.startsWith(deleted))render();});
window.addEventListener('focus',render);
document.addEventListener('aimstep:lang',render);
render();
})();
