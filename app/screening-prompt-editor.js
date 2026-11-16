/* Draft-only dialog. Save applies the instructions through the host transaction. */
(function(root){
'use strict';
function mount(options){
 const $=id=>document.getElementById(id),api=root.AimstepScreeningPrompt,dialog=$('screening-prompt-dialog');
 let baseline='',base=null,mode='generated',filename='',saving=false,reading=false,closed=false;
 const text=$('screening-prompt-text'),error=$('screening-prompt-error'),status=$('screening-prompt-status');
 const exportButton=$('export-screening-prompt'),menu=$('screening-prompt-export-menu');
 const dirty=()=>!!dialog.open&&text.value!==baseline;
 const fail=e=>{error.textContent=e.message||String(e);error.hidden=false;};
 const translate=s=>root.AIMSTEP?.t?.(s)||s;
 const setStatus=value=>{status.textContent=value;status.hidden=!value;};
 const info=()=>setStatus(mode==='imported'?translate('Imported prompt')+(filename?' · '+filename:''):translate(mode==='edited'?'Edited prompt':'Automatically generated from the saved Screening criteria'));
 function setExportOpen(open,focusIndex=0){
  open=!!open&&!saving&&!reading&&!!text.value.trim();menu.hidden=!open;exportButton.setAttribute('aria-expanded',String(open));
  if(!open)return;
  const rect=exportButton.getBoundingClientRect(),width=menu.offsetWidth,height=menu.offsetHeight;
  menu.style.left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12))+'px';
  menu.style.top=(rect.bottom+height+4<=window.innerHeight?rect.bottom+4:Math.max(12,rect.top-height-4))+'px';
  const items=menu.querySelectorAll('[data-prompt-export]');items[(focusIndex+items.length)%items.length]?.focus();
 }
 function lock(){
  for(const id of ['generate-screening-prompt','import-screening-prompt','close-screening-prompt'])$(id).disabled=saving||reading;
  for(const id of ['save-screening-prompt','export-screening-prompt'])$(id).disabled=saving||reading||!text.value.trim();
  text.disabled=saving||reading;if(saving||reading||!text.value.trim())setExportOpen(false);
 }
 function close(){if(saving||reading)return;if(dirty()&&!confirm('Discard unsaved screening prompt changes?'))return;setExportOpen(false);dialog.close();}
 $('open-screening-prompt').addEventListener('click',()=>{
  if(options.blocked())return;
  try{
   const context=options.context(),saved=options.saved?.(),prompt=saved?options.current():null;
   base={...context.signatures};text.value=prompt?.text||'';baseline=text.value;mode=prompt?.mode||'generated';filename=prompt?.filename||'';
   error.hidden=true;setStatus('');setExportOpen(false);lock();
   if(prompt&&!prompt.current)setStatus('Screening criteria changed. Review and save this prompt, or Generate a new prompt.');
   dialog.showModal();
  }catch(e){options.notice(e.message);}
 });
 text.addEventListener('input',()=>{if(saving||reading)return;mode='edited';info();setExportOpen(false);lock();});
 $('generate-screening-prompt').addEventListener('click',()=>{
  if(saving||reading)return;
  if(dirty()&&!confirm('Replace this unsaved draft with a generated prompt?'))return;
  try{const context=options.context();text.value=api.generate(context.criteria);mode='generated';filename='';error.hidden=true;info();setExportOpen(false);lock();}catch(e){fail(e);}
 });
 $('import-screening-prompt').addEventListener('click',()=>{if(!saving&&!reading){setExportOpen(false);$('screening-prompt-file').click();}});
 $('screening-prompt-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file||saving||reading)return;
  if(dirty()&&!confirm('Replace this unsaved draft with the imported prompt?')){event.target.value='';return;}
  reading=true;lock();
  try{if(file.size>api.MAX_BYTES)throw Error('Prompt files must be 1 MB or smaller.');const value=api.parse(await file.text(),file.name);if(closed)return;text.value=value;mode='imported';filename=file.name;error.hidden=true;info();}catch(e){fail(e);}finally{reading=false;event.target.value='';lock();}
 });
 $('save-screening-prompt').addEventListener('click',async()=>{
  if(saving||reading||!text.value.trim())return;saving=true;lock();error.hidden=true;
  try{const value=api.validate(text.value);await options.apply({text:value,mode,filename},base);const context=options.context(),prompt=options.current();base={...context.signatures};text.value=prompt.text;baseline=text.value;mode=prompt.mode;filename=prompt.filename;setStatus('Screening prompt saved. This version will be used for screening.');}
  catch(e){fail(e);}finally{saving=false;lock();}
 });
 function exportDraft(format){
  if(saving||reading||!text.value.trim())return;
  try{const context=options.context(),draft=api.saved(text.value,mode,context.signatures,filename);options.download(api.exportFile({...draft,hash:api.hash([draft.version,draft.criteriaSig,draft.stageSig,draft.text])},format));}catch(e){fail(e);}
 }
 exportButton.addEventListener('click',()=>setExportOpen(menu.hidden));
 exportButton.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();setExportOpen(true,event.key==='ArrowUp'?-1:0);}});
 menu.addEventListener('click',event=>{const item=event.target.closest('[data-prompt-export]');if(!item)return;setExportOpen(false);exportButton.focus();exportDraft(item.dataset.promptExport);});
 menu.addEventListener('keydown',event=>{
  const items=[...menu.querySelectorAll('[data-prompt-export]')],index=items.indexOf(document.activeElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:index+(event.key==='ArrowDown'?1:-1);items[(next+items.length)%items.length]?.focus();}
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setExportOpen(false);exportButton.focus();}
 });
 document.addEventListener('click',event=>{if(!exportButton.contains(event.target)&&!menu.contains(event.target))setExportOpen(false);});
 dialog.addEventListener('scroll',()=>setExportOpen(false));
 window.addEventListener('resize',()=>setExportOpen(false));
 $('close-screening-prompt').addEventListener('click',close);
 dialog.addEventListener('cancel',event=>{event.preventDefault();if(!menu.hidden){setExportOpen(false);exportButton.focus();return;}close();});
 dialog.addEventListener('close',()=>{setExportOpen(false);baseline='';base=null;});
 window.addEventListener('beforeunload',event=>{if(dirty()||saving||reading){event.preventDefault();event.returnValue='';}});
 return {dirty,isOpen:()=>!!dialog.open,isBusy:()=>saving||reading,destroy(){closed=true;}};
}
const api={mount};if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepScreeningPromptEditor=api;
})(globalThis);
