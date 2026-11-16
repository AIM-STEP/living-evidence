/* Draft-only dialog. Save applies the instructions through the host transaction. */
(function(root){
'use strict';
function mount(options){
 const $=id=>document.getElementById(id),api=root.AimstepScreeningPrompt,dialog=$('screening-prompt-dialog');
 let baseline='',base=null,mode='generated',filename='',saving=false,reading=false,closed=false;
 const text=$('screening-prompt-text'),error=$('screening-prompt-error'),status=$('screening-prompt-status');
 const dirty=()=>!!dialog.open&&text.value!==baseline;
 const fail=e=>{error.textContent=e.message||String(e);error.hidden=false;};
 const translate=s=>root.AIMSTEP?.t?.(s)||s;
 const info=()=>{status.textContent=mode==='imported'?translate('Imported prompt')+(filename?' · '+filename:''):translate(mode==='edited'?'Edited prompt':'Automatically generated from the saved Screening criteria');};
 function lock(){for(const id of ['save-screening-prompt','generate-screening-prompt','import-screening-prompt','export-screening-prompt','close-screening-prompt'])$(id).disabled=saving||reading;text.disabled=saving||reading;}
 function preview(){
  try{const current=options.context();$('screening-prompt-preview').textContent=JSON.stringify({screeningPrompt:{version:api.VERSION,text:api.validate(text.value)},criteria:api.rows(current.criteria),record:{title:'[current report title]',abstract:'[current report abstract]'},reviewerCalibration:'[relevant saved reviewer feedback is supplied per report]'},null,2);}catch(e){$('screening-prompt-preview').textContent=e.message;}
 }
 function close(){if(saving||reading)return;if(dirty()&&!confirm('Discard unsaved screening prompt changes?'))return;dialog.close();}
 $('open-screening-prompt').addEventListener('click',()=>{
  if(options.blocked())return;
  try{const context=options.context(),prompt=options.current();base={...context.signatures};text.value=prompt.text;baseline=text.value;mode=prompt.mode;filename=prompt.filename;error.hidden=true;info();if(!prompt.current)status.textContent='Screening criteria changed. Review and save this prompt, or Generate a new prompt.';preview();dialog.showModal();}catch(e){options.notice(e.message);}
 });
 text.addEventListener('input',()=>{if(saving||reading)return;mode='edited';info();preview();});
 $('generate-screening-prompt').addEventListener('click',()=>{
  if(saving||reading)return;
  if(dirty()&&!confirm('Replace this unsaved draft with a generated prompt?'))return;
  try{const context=options.context();text.value=api.generate(context.criteria);mode='generated';filename='';error.hidden=true;info();preview();}catch(e){fail(e);}
 });
 $('import-screening-prompt').addEventListener('click',()=>{if(!saving&&!reading)$('screening-prompt-file').click();});
 $('screening-prompt-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file||saving||reading)return;
  if(dirty()&&!confirm('Replace this unsaved draft with the imported prompt?')){event.target.value='';return;}
  reading=true;lock();
  try{if(file.size>api.MAX_BYTES)throw Error('Prompt files must be 1 MB or smaller.');const value=api.parse(await file.text(),file.name);if(closed)return;text.value=value;mode='imported';filename=file.name;error.hidden=true;info();preview();}catch(e){fail(e);}finally{reading=false;event.target.value='';lock();}
 });
 $('save-screening-prompt').addEventListener('click',async()=>{
  if(saving||reading)return;saving=true;lock();error.hidden=true;
  try{const value=api.validate(text.value);await options.apply({text:value,mode,filename},base);const context=options.context(),prompt=options.current();base={...context.signatures};text.value=prompt.text;baseline=text.value;mode=prompt.mode;filename=prompt.filename;status.textContent='Screening prompt saved. This version will be used for screening.';preview();}
  catch(e){fail(e);}finally{saving=false;lock();}
 });
 $('export-screening-prompt').addEventListener('click',()=>{
  if(saving||reading)return;
  try{const context=options.context(),draft=api.saved(text.value,mode,context.signatures,filename);options.download(JSON.stringify(api.exportPrompt({...draft,hash:api.hash([draft.version,draft.criteriaSig,draft.stageSig,draft.text])}),null,2));}catch(e){fail(e);}
 });
 $('close-screening-prompt').addEventListener('click',close);
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('close',()=>{baseline='';base=null;});
 window.addEventListener('beforeunload',event=>{if(dirty()||saving||reading){event.preventDefault();event.returnValue='';}});
 return {dirty,isOpen:()=>!!dialog.open,isBusy:()=>saving||reading,destroy(){closed=true;}};
}
const api={mount};if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepScreeningPromptEditor=api;
})(globalThis);
