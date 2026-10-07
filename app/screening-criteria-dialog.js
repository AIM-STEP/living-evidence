/* Shared direct criteria preview for screening tools, using tool 1's editor. */
window.AIMScreeningCriteriaDialog=function(config){
  const $=id=>document.getElementById(id),dialog=$('criteria-dialog'),saveButton=document.createElement('button');
  saveButton.type='button';saveButton.className='criteria-source-link';saveButton.textContent='Save';saveButton.id='save-shared-criteria';$('edit-criteria').after(saveButton);
  $('crit-restore').hidden=true;$('edit-criteria').textContent='Edit eligibility criteria';
  let frame=null,observer=null,dirty=false,saving=false,base='',snapshot=null,active=false;
  const eligibilityKey='aimstep-eligibility:'+config.scope,summaryKey='aimstep-eligibility-summary:'+config.scope;
  const error=document.createElement('p');error.className='criteria-upload-error';error.hidden=true;$('criteria-view').before(error);
  const showError=e=>{error.textContent=e?.message||String(e||'');error.hidden=!error.textContent};
  const blocked=()=>saving||config.busy();
  function discard(){if(saving)return false;if(dirty&&!confirm('Discard unsaved criteria edits?'))return false;frame?.contentWindow?.aimstepCriteriaPreview?.discard();dirty=false;return true}
  function mount(value){
    base=localStorage.getItem(eligibilityKey);if(!value?.rows?.length&&base){const previous=JSON.parse(base);value={question:previous.question||'',framework:previous.framework||'Other',reviewType:previous.reviewType||'',rows:previous.activeGenerator==='machine'?previous.machineCriteria:previous.criteria}}snapshot=structuredClone(value);dirty=false;showError('');observer?.disconnect();
    $('criteria-editor').hidden=true;$('criteria-view').hidden=false;$('criteria-origin').hidden=true;saveButton.disabled=true;
    if(!snapshot?.rows?.length){$('criteria-view').textContent='No eligibility rules saved for this project. Complete Eligibility criteria or select Import from local.';frame=null;return}
    const previous=JSON.parse(base||'null'),rows=previous?(previous.activeGenerator==='machine'?previous.machineCriteria:previous.criteria):null;
    const same=previous&&(previous.question||'')===(snapshot.question||'')&&(previous.framework||'Other')===(snapshot.framework||'Other')&&JSON.stringify((rows||[]).map(r=>[r.title,r.condition||'',r.uncertain||'',r.definition||'']))===JSON.stringify(snapshot.rows.map(r=>[r.title,r.condition||'',r.uncertain||'',r.definition||'']));
    const valueToLoad=same?previous:AIMSearchCriteriaEditor.workspace(previous,snapshot,new Date().toISOString());
    const current=document.createElement('iframe');frame=current;current.className='criteria-preview-frame';current.title='Editable eligibility criteria';
    const url=new URL(config.pageLink('eligibility.html'),location.href);url.searchParams.set('embedded','search-criteria-preview');current.src=url.href;
    current.addEventListener('load',()=>{if(frame!==current)return;try{current.contentWindow.aimstepCriteriaPreview.load(valueToLoad);const resize=()=>current.style.height=Math.ceil(current.contentDocument.body.scrollHeight+8)+'px';observer=new ResizeObserver(resize);observer.observe(current.contentDocument.body);resize();current.contentDocument.addEventListener('input',()=>dirty=true);current.contentDocument.addEventListener('click',e=>{if(e.target.closest('[data-pc-dec]'))dirty=true});saveButton.disabled=!!blocked()}catch(e){showError(e)}});
    $('criteria-view').replaceChildren(current);
  }
  function intercept(id,fn){$(id).addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();fn()},true)}
  intercept('open-criteria',()=>{if(blocked())return;active=true;try{mount(config.snapshot());dialog.showModal()}catch(e){showError(e);dialog.showModal()}});
  intercept('close-criteria',()=>{if(discard())dialog.close()});
  dialog.addEventListener('cancel',e=>{if(!discard())e.preventDefault()},true);
  dialog.addEventListener('click',e=>{if(e.target!==dialog)return;e.stopImmediatePropagation();const r=dialog.getBoundingClientRect();if((e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)&&discard())dialog.close()},true);
  dialog.addEventListener('close',()=>{active=false;observer?.disconnect();frame=null;dirty=false});
  intercept('edit-criteria',()=>{if(!blocked()&&discard())location.href=config.pageLink('eligibility.html')});
  const upload=document.createElement('input');upload.type='file';upload.hidden=true;upload.accept='.docx,.xlsx,.csv,.tsv,.txt,.md,.json,.html,.htm';dialog.append(upload);
  intercept('crit-import',()=>{if(!blocked()&&discard()){upload.value='';upload.click()}});
  upload.addEventListener('change',async()=>{if(!upload.files[0]||blocked())return;saving=true;try{const value=await config.parse(upload.files[0]);mount(value);dirty=true}catch(e){showError(e)}finally{saving=false;if(frame?.contentWindow?.aimstepCriteriaPreview)saveButton.disabled=false}});
  saveButton.addEventListener('click',async()=>{
    if(blocked()||!frame)return;showError('');let rollback=null;saving=true;saveButton.disabled=true;
    try{
      if(base!==localStorage.getItem(eligibilityKey))throw Error('Criteria changed elsewhere. Copy your edits before reopening this dialog.');
      const prepared=frame.contentWindow.aimstepCriteriaPreview.read(),updated=prepared.workspace;
      const rows=updated.activeGenerator==='machine'?updated.machineCriteria:updated.criteria;
      if(!rows?.length)throw Error('Add at least one criterion before saving.');
      const next={...snapshot,question:updated.question||'',framework:updated.framework||'Other',reviewType:updated.reviewType||'',rows:structuredClone(rows)};
      const changes=[[eligibilityKey,JSON.stringify(updated)],[summaryKey,prepared.summary?JSON.stringify(prepared.summary):null]];
      if(config.projectId){const key='aimstep-setup-completed:'+encodeURIComponent(config.projectId),done=JSON.parse(localStorage.getItem(key)||'[]');changes.push([key,JSON.stringify(Array.isArray(done)?done.filter(n=>![1,2,3].includes(Number(n))):[])])}
      rollback=changes.map(([key])=>[key,localStorage.getItem(key)]);AIMSearchCriteriaEditor.commit(localStorage,changes);
      await config.apply(next);rollback=null;dirty=false;mount(next);
    }catch(e){if(rollback){try{AIMSearchCriteriaEditor.commit(localStorage,rollback)}catch(restoreError){e=new Error(e.message+' '+restoreError.message)}}showError(e)}
    finally{saving=false;saveButton.disabled=false}
  });
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
  return {get active(){return active}};
};
