/* Shared direct criteria preview for screening tools, using tool 1's editor. */
window.AIMScreeningCriteriaDialog=function(config){
  const $=id=>document.getElementById(id),dialog=$('criteria-dialog'),saveButton=document.createElement('button'),clearButton=document.createElement('button');
  saveButton.type='button';saveButton.className='criteria-source-link';saveButton.textContent='Save';saveButton.id='save-shared-criteria';$('edit-criteria').after(saveButton);
  clearButton.type='button';clearButton.className='criteria-source-link';clearButton.id='clear-shared-criteria';clearButton.setAttribute('data-ui-localize','');clearButton.setAttribute('aria-label','Clear eligibility criteria');
  clearButton.textContent='Clear';saveButton.before(clearButton);
  $('crit-restore').hidden=true;$('edit-criteria').textContent='Edit eligibility criteria';
  let frame=null,readyFrame=null,previewWorkspace=null,observer=null,dirty=false,saving=false,base='',snapshot=null,active=false;
  const eligibilityKey='aimstep-eligibility:'+config.scope,summaryKey='aimstep-eligibility-summary:'+config.scope;
  const error=document.createElement('p');error.className='criteria-upload-error';error.hidden=true;$('criteria-view').before(error);
  const loading=document.createElement('p');loading.className='hint';loading.setAttribute('role','status');loading.textContent='Loading eligibility criteria…';loading.hidden=true;$('criteria-view').before(loading);
  const showError=e=>{error.textContent=e?.message||String(e||'');error.hidden=!error.textContent};
  const blocked=()=>saving||config.busy();
  function discard(){if(saving)return false;if(dirty&&!confirm('Discard unsaved criteria edits?'))return false;frame?.contentWindow?.aimstepCriteriaPreview?.discard();dirty=false;return true}
  function mount(value,imported=false){
    base=localStorage.getItem(eligibilityKey);
    const canonical=JSON.parse(base||'null');
    if(!imported&&canonical?.criteria_epoch){
      // The previous screening handoff may still describe a completed screening run.
      // Only the current criteria workspace can supply an editable shared draft.
      value={framework:canonical.framework||'',reviewType:canonical.reviewType||'',question:canonical.question||'',
        rows:(canonical.activeGenerator==='machine'?canonical.machineCriteria:canonical.criteria)||[]};
    }
    snapshot=structuredClone(value);dirty=false;showError('');observer?.disconnect();
    readyFrame=null;previewWorkspace=null;loading.hidden=true;
    $('criteria-editor').hidden=true;$('criteria-view').hidden=false;$('criteria-origin').hidden=true;saveButton.disabled=true;clearButton.disabled=!snapshot?.rows?.length;
    if(!snapshot?.rows?.length){$('criteria-view').replaceChildren();frame=null;return}
    const previous=JSON.parse(base||'null'),rows=previous?(previous.activeGenerator==='machine'?previous.machineCriteria:previous.criteria):null;
    const same=previous&&previous.generationMethodChoice&&(previous.question||'')===(snapshot.question||'')&&(previous.framework||'Other')===(snapshot.framework||'Other')&&JSON.stringify((rows||[]).map(r=>[r.title,r.condition||'',r.uncertain||'',r.definition||'']))===JSON.stringify(snapshot.rows.map(r=>[r.title,r.condition||'',r.uncertain||'',r.definition||'']));
    const valueToLoad=same?previous:AIMSearchCriteriaEditor.workspace(previous,snapshot,new Date().toISOString());previewWorkspace=valueToLoad;loading.hidden=false;
    const current=document.createElement('iframe');frame=current;current.className='criteria-preview-frame';current.title='Editable eligibility criteria';
    const url=new URL(config.pageLink('eligibility.html'),location.href);
    url.searchParams.set('embedded','search-criteria-preview');current.src=url.href;
    current.addEventListener('load',()=>initialize(current));
    current.addEventListener('error',()=>{if(frame===current){loading.hidden=true;showError('Could not load the criteria editor. Clear is still available.')}});
    $('criteria-view').replaceChildren(current);
  }
  function initialize(current){
    if(frame!==current||readyFrame===current)return;
    try{
      const api=current.contentWindow.aimstepCriteriaPreview;if(!api)return;
      api.load(previewWorkspace);readyFrame=current;loading.hidden=true;
      const resize=()=>{const height=Math.ceil(current.contentDocument.getElementById('preview').getBoundingClientRect().height+8)+'px';if(current.style.height!==height)current.style.height=height};
      observer=new ResizeObserver(resize);observer.observe(current.contentDocument.getElementById('preview'));resize();
      current.contentDocument.addEventListener('input',()=>dirty=true);current.contentDocument.addEventListener('click',e=>{if(e.target.closest('[data-pc-dec]'))dirty=true});saveButton.disabled=saving;clearButton.disabled=saving;
    }catch(e){loading.hidden=true;showError(e)}
  }
  window.addEventListener('message',event=>{if(frame&&event.source===frame.contentWindow&&event.origin===new URL(location.href).origin&&event.data?.type==='aimstep:criteria-preview-ready')initialize(frame)});
  function intercept(id,fn){$(id).addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();fn()},true)}
  intercept('open-criteria',()=>{if(blocked())return;active=true;try{mount(config.snapshot());dialog.showModal()}catch(e){showError(e);dialog.showModal()}});
  intercept('close-criteria',()=>{if(discard())dialog.close()});
  dialog.addEventListener('cancel',e=>{if(!discard())e.preventDefault()},true);
  dialog.addEventListener('click',e=>{if(e.target!==dialog)return;e.stopImmediatePropagation();const r=dialog.getBoundingClientRect();if((e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)&&discard())dialog.close()},true);
  dialog.addEventListener('close',()=>{active=false;observer?.disconnect();frame=null;readyFrame=null;loading.hidden=true;dirty=false});
  intercept('edit-criteria',()=>{if(!blocked()&&discard())location.href=config.pageLink('eligibility.html')});
  clearButton.addEventListener('click',async()=>{
    if(blocked()){showError('Wait for the current operation to finish.');return}if(!previewWorkspace||!snapshot?.rows?.length)return;
    if(!confirm('Permanently clear attachments and every saved criteria draft for this project? The review question will stay in the input box.'))return;
    saving=true;saveButton.disabled=true;clearButton.disabled=true;
    try{
      if(base!==localStorage.getItem(eligibilityKey))throw Error('Criteria changed elsewhere. Reopen the dialog to see the current criteria.');
      const previous=JSON.parse(base||'null')||{};
      const blank=AimstepEligibilityLibrary.blankWorkspace(previous);
      blank.question=previous.question||'';
      const changes=AimstepEligibilityLibrary.clearChanges(localStorage,config.scope);
      AimstepEligibilityReset.resetProject(localStorage,config.scope,blank,changes);
      const empty={rows:[],question:'',framework:'',reviewType:blank.reviewType||'',cleared:true};
      mount(empty);
      try{await config.apply(empty)}catch(error){showError('Criteria were cleared. This screening view could not be updated. '+error.message);}
    }catch(error){showError(error)}
    finally{saving=false;saveButton.disabled=!frame||readyFrame!==frame;clearButton.disabled=!snapshot?.rows?.length}
  });
  const upload=document.createElement('input');upload.type='file';upload.hidden=true;upload.accept='.docx,.xlsx,.csv,.tsv,.txt,.md,.json,.html,.htm';dialog.append(upload);
  intercept('crit-import',()=>{if(!blocked()&&discard()){upload.value='';upload.click()}});
  upload.addEventListener('change',async()=>{if(!upload.files[0]||blocked())return;saving=true;try{const value=await config.parse(upload.files[0]);mount(value,true);dirty=true}catch(e){showError(e)}finally{saving=false;if(frame?.contentWindow?.aimstepCriteriaPreview)saveButton.disabled=false}});
  async function saveDraft(){
    if(blocked()){showError('Wait for the current operation to finish.');return}if(!frame||readyFrame!==frame)return;showError('');let rollback=null,written=null;saving=true;saveButton.disabled=true;clearButton.disabled=true;
    try{
      if(base!==localStorage.getItem(eligibilityKey))throw Error('Criteria changed elsewhere. Copy your edits before reopening this dialog.');
      const prepared=frame.contentWindow.aimstepCriteriaPreview.read(),updated=prepared.workspace;
      const rows=updated.activeGenerator==='machine'?updated.machineCriteria:updated.criteria;
      if(!rows?.length)throw Error('Add at least one criterion before saving.');
      const next={...snapshot,question:updated.question||'',framework:updated.framework||'Other',reviewType:updated.reviewType||'',rows:structuredClone(rows||[]),cleared:false};
      const changes=[[eligibilityKey,JSON.stringify(updated)],[summaryKey,prepared.summary?JSON.stringify(prepared.summary):null]];
      if(config.projectId){const key='aimstep-setup-completed:'+encodeURIComponent(config.projectId),done=JSON.parse(localStorage.getItem(key)||'[]');changes.push([key,JSON.stringify(Array.isArray(done)?done.filter(n=>![1,2,3].includes(Number(n))):[])])}
      rollback=changes.map(([key])=>[key,localStorage.getItem(key)]);AIMSearchCriteriaEditor.commit(localStorage,changes);written=localStorage.getItem(eligibilityKey);
      await config.apply(next);rollback=null;dirty=false;mount(next);return true;
    }catch(e){if(rollback&&written!==null&&localStorage.getItem(eligibilityKey)===written){try{AIMSearchCriteriaEditor.commit(localStorage,rollback)}catch(restoreError){e=new Error(e.message+' '+restoreError.message)}}showError(e);return false}
    finally{saving=false;saveButton.disabled=!frame||readyFrame!==frame;clearButton.disabled=!snapshot?.rows?.length}
  }
  saveButton.addEventListener('click',()=>saveDraft());
  window.addEventListener('storage',event=>{
    if(active&&event.key==='aimstep-eligibility-epoch:'+config.scope)mount(null);
  });
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
  return {get active(){return active}};
};
