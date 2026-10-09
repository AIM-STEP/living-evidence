/* Reviewable, project-scoped pilot and main risk-of-bias assessment. */
(function(root){
'use strict';

const clone=x=>JSON.parse(JSON.stringify(x));
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function state(ws){return ws.robFlow??={rounds:[],selected:0,approved:null,main:{done:{},errors:{}}};}
function signature(ws){return JSON.stringify({version:'rob-assess-v1',outcomes:ws.outcomes,timepoints:ws.outcomeTimepoints||[],records:ws.records.map(r=>[r.uid,r.fullText,ws.studies[r.uid]?.design]),tools:ws.toolChoice,selectedTool:ws.selectedToolId});}
function complete(round){return !!round?.ids.length&&round.ids.every(id=>round.entries[id]?.draft&&['agree','mistake'].includes(round.entries[id].review?.decision));}
function accuracy(round){return complete(round)?Math.round(round.ids.filter(id=>round.entries[id].review.decision==='agree').length/round.ids.length*100):null;}
function differences(before,after,path=[]){if(before===after)return [];if(after&&typeof after==='object')return Object.keys(after).flatMap(k=>differences(before?.[k],after[k],[...path,k]));return [{path:path.join('.'),before:before??'',after:after??''}];}
function corrections(flow,sig){return flow.rounds.filter(r=>r.signature===sig).flatMap(r=>r.ids.flatMap(id=>{const e=r.entries[id];return e?.review?.decision==='mistake'?[{report:id,tool:e.draft.value.tool,note:e.review.note,changes:differences(e.draft.value,e.review.corrected)}]:[]}));}
function normalize(value){return clone(value);}
function approved(flow,sig){return flow.approved===sig&&flow.rounds.some(r=>r.signature===sig&&complete(r));}
function sample(ids,n,random=Math.random){const a=[...ids];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a.slice(0,n);}
function mount(api){
 const host=document.getElementById('rob-workflow');let running='',abort=null,progress={done:0,total:0},error='',filter='all';const collapsed={},lastProgress={};
 const ws=api.state,flow=()=>state(ws()),sig=()=>signature(ws()),selected=()=>flow().rounds[flow().selected];
 const button=(label,attrs='')=>`<button type="button" class="btn small" ${attrs}>${label}</button>`;
 const help=text=>`<span class="extract-help" tabindex="0" aria-label="Instructions">ⓘ<span role="tooltip">${text}</span></span>`;
 const clearIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg>';
 const toggle=part=>button(collapsed[part]?'⌄':'⌃',`data-action="toggle" data-part="${part}" aria-label="${collapsed[part]?'Expand':'Collapse'} ${part==='pilot'?'Pilot assess':'Main assess'}" aria-expanded="${!collapsed[part]}"`);
 const bar=part=>{
  const round=selected(),ids=part==='pilot'?(round?.ids||[]):api.records().map(r=>r.uid);
  const count=ids.filter(id=>part==='pilot'?!!round.entries[id]?.draft:!!flow().main.done[id]||!!api.study(id).done).length;
  const percent=Math.round(count/Math.max(1,ids.length)*100);
  const previous=lastProgress[part]??percent;lastProgress[part]=percent;
  return `<div class="extract-progress" data-progress="${part}" style="--extract-progress:${percent}%;--extract-previous:${previous}%" role="progressbar" aria-label="${part==='pilot'?'Pilot':'Main'} assessment progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><b>${percent}%</b><div class="extract-progress-track"><span style="width:${percent}%"></span></div></div>`;
 };
 const header=(title,part,instructions,actions)=>`<div class="panel-head"><div class="extract-heading"><h2>${title}</h2>${help(instructions)}</div>${part==='main'?bar(part):''}<div class="toolbar">${actions}${button('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 15v5h14v-5"/></svg>Export',`data-action="export" data-part="${part}" ${running?'disabled':''}`)}${button(clearIcon+'Clear',`data-action="clear" data-part="${part}" ${running?'disabled':''}`)}${toggle(part)}</div></div>`;
 function title(uid){const r=api.record(uid);return `<strong>${esc(r?.sourceNumber?'#'+(r.extractionOrigin==='local'?'L':'')+r.sourceNumber+' ':'')}${esc(r?.title||uid)}</strong>`;}
 function render(){
  const f=flow(),r=selected(),s=sig(),valid=approved(f,s)&&api.configured(),roundReady=complete(r)&&r.signature===s;
  const pilotCards=(r?.ids||[]).filter(id=>filter==='all'||r.entries[id]?.review?.decision===filter).map(id=>{const e=r.entries[id]||{},review=e.review,raw=e.draft?.value;
   const rows=raw?api.rows(review?.corrected||raw):[];
   return `<article class="record" data-pilot-card="${esc(id)}">${title(id)}<div class="toolbar">${button('Full text',`data-action="pdf" data-id="${esc(id)}"`)}${review?`<span>${review.decision==='agree'?'Agreed':'Corrected'}</span>`:''}</div>${e.error?`<p class="notice error">${esc(e.error)}</p>`:''}${raw?`${api.summary(review?.corrected||raw)}<details ${review?'':'open'}><summary>AI assessment</summary><div class="table-wrap"><table class="grid"><thead><tr><th>Item</th><th>Value</th><th>Source quotation</th></tr></thead><tbody>${rows.map((x,i)=>`<tr><td>${esc(x.label)}</td><td><select class="select compact" data-edit="${i}" aria-label="${esc(x.label)}" disabled>${x.options.map(v=>`<option value="${esc(v)}" ${v===x.value?'selected':''}>${esc(v)}</option>`).join('')}</select><p class="hint">${esc(x.reason||'')}</p></td><td>${esc(x.passage)} ${esc(x.quote)}${x.value&&!e.draft.verified?.[i]?'<small class="hint"> · Source quotation not verified</small>':''}</td></tr>`).join('')}</tbody></table></div></details><div class="toolbar">${button('Agree',`data-action="agree" data-id="${esc(id)}" ${running||r.signature!==s?'disabled':''}`)}${button('Mistake',`data-action="mistake" data-id="${esc(id)}" ${running||r.signature!==s?'disabled':''}`)}</div><div data-correction hidden><label>Correction reason<textarea class="input" data-note required aria-label="Correction reason">${esc(review?.note||'')}</textarea></label>${button('Save',`data-action="save-review" data-id="${esc(id)}"`)}</div>`:'<p class="hint">Awaiting assessment.</p>'}</article>`;
  }).join('');
  host.innerHTML=`<section class="panel">${header('Pilot assess','pilot','Run a random sample. Review the AI assessment against the report. Choose Agree, or Mistake, correct answers and save a reason. Complete at least one round and approve the pilot before Main assess. Further rounds are optional. AI accuracy is the percentage of sampled reports marked Agree.',button(valid?'Pilot approved':'Approve pilot',`data-action="approve" aria-pressed="${valid}" ${!roundReady||running||!api.configured()?'disabled':''}`))}<div class="panel-body" ${collapsed.pilot?'hidden':''}><div class="pilot-controls"><label>Records per round <input class="input compact" id="extract-sample" type="number" min="1" max="20" value="${f.sampleSize||3}" ${running?'disabled':''}></label>${button(r&&!complete(r)&&r.signature===s?'Resume round':f.rounds.length?'Run another round (optional)':'Round 1',`data-action="round" ${running||!api.configured()?'disabled':''}`)}${running==='pilot'?button('Stop','data-action="stop"'):''}${bar('pilot')}</div><span class="extract-rounds">${f.rounds.map((x,i)=>button(`Round ${i+1}${complete(x)?` reviewed<br><small>AI accuracy ${accuracy(x)}%</small>`:''}`,`data-action="round-tab" data-index="${i}" aria-pressed="${f.selected===i}"`)).join('')}</span>${r&&r.signature!==s?'<p class="hint">The tools, outcomes or included studies changed. Start a new pilot round.</p>':''}${r?`<div class="toolbar extract-filters">${[['all','All records'],['agree','Agreed'],['mistake','Mistakes']].map(([k,l])=>button(`${l} ${k==='all'?r.ids.length:r.ids.filter(id=>r.entries[id]?.review?.decision===k).length}`,`data-action="filter" data-filter="${k}" aria-pressed="${filter===k}"`)).join('')}</div>`:''}${pilotCards}</div></section>
  <section class="panel">${header('Main assess','main','The AI assesses every readable included report using approved pilot corrections. Open each draft to verify or correct its answers and confirm assessment. Stop keeps completed drafts; Resume continues pending reports.',button(running==='main'?'Stop':Object.keys(f.main.done).length?'Resume':'Start',`data-action="${running==='main'?'stop':'main'}" ${running&&running!=='main'||!valid?'disabled':''}`))}<div class="panel-body" ${collapsed.main?'hidden':''}>${api.records().map(x=>`<article class="record">${title(x.uid)}<div class="toolbar">${button(api.study(x.uid).done?'Completed':api.study(x.uid).ai?'Check':'Review',`data-action="review" data-id="${esc(x.uid)}" ${running?'disabled':''}`)}${button('Full text',`data-action="pdf" data-id="${esc(x.uid)}"`)}${!x.fullText||x.fullText.readable===false?'<span class="hint">Readable full text required for AI assessment.</span>':''}</div>${f.main.errors[x.uid]?`<p class="notice error">${esc(f.main.errors[x.uid])}</p>`:''}</article>`).join('')}</div></section>${error?`<p role="alert" class="notice error">${esc(error)}</p>`:''}`;
 }
 async function atomic(fn){const previous=clone(flow());try{fn();await api.persist();}catch(e){ws().robFlow=previous;throw e;}}
 function prerequisite(){api.prerequisite();}
 async function run(part){if(running)return;prerequisite();const signatureAtStart=sig(),f=flow();if(part==='main'&&!approved(f,signatureAtStart))throw Error('Complete and approve a pilot round first.');
  running=part;abort=new AbortController();api.lock(part);error='';
  try{
   const readable=[];for(const record of api.records()){if(abort.signal.aborted)break;if(record.fullText?.readable===false)continue;const doc=await api.ready(record.uid);if(doc?.chunks?.length)readable.push(record.uid);}
   if(abort.signal.aborted)return;if(!readable.length)throw Error('No readable full texts are available. Import a readable PDF first.');
   let r=selected(),ids;const learned=corrections(f,signatureAtStart),runKey=JSON.stringify({signature:signatureAtStart,learned});
   if(part==='pilot'){
    if(!r||complete(r)||r.signature!==signatureAtStart){r={ids:sample(readable,Math.min(f.sampleSize||3,readable.length)),entries:{},signature:signatureAtStart,at:new Date().toISOString()};await atomic(()=>{f.rounds.push(r);f.selected=f.rounds.length-1;f.approved=null;});}
    ids=r.ids.filter(id=>!r.entries[id]?.draft);
   }else ids=readable.filter(id=>!api.study(id).done&&f.main.done[id]!==runKey);
   progress={done:0,total:ids.length};render();
   for(const id of ids){if(abort.signal.aborted)break;
    let draft;try{draft=await api.extract(id,abort.signal,learned);}catch(e){if(abort.signal.aborted)break;if(part==='pilot')r.entries[id]={error:e.message};else f.main.errors[id]=e.message;await api.persist();progress.done++;render();continue;}
    if(abort.signal.aborted)break;if(sig()!==signatureAtStart)throw Error('The tools, outcomes or studies changed during assessment. Start a new pilot round.');
    const priorEntry=r?.entries[id],priorStudy=ws().assess[id]?clone(ws().assess[id]):null,priorDone=f.main.done[id];
    if(part==='pilot'){draft.value=normalize(draft.value);r.entries[id]={draft:clone({value:draft.value,model:draft.model,prompt:draft.prompt,at:draft.at,verified:api.rows(draft.value).map(x=>!!x.quote&&!x.quoteMissing)})};}
    else{api.apply(id,draft);f.main.done[id]=runKey;delete f.main.errors[id];}
    try{await api.persist();}catch(e){if(part==='pilot'){if(priorEntry)r.entries[id]=priorEntry;else delete r.entries[id];}else{if(priorStudy)ws().assess[id]=priorStudy;else delete ws().assess[id];if(priorDone)f.main.done[id]=priorDone;else delete f.main.done[id];}throw e;}progress.done++;render();
   }
  }finally{running='';abort=null;api.lock('');api.changed();render();}
 }
 host.addEventListener('change',e=>{if(e.target.id==='extract-sample'){flow().sampleSize=Math.max(1,Math.min(20,Number(e.target.value)||3));api.persist().catch(fail);}});
 function fail(e){error=e.message||String(e);render();}
 host.addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(!b)return;const action=b.dataset.action,id=b.dataset.id;try{
  if(action==='stop'){abort?.abort();return;}if(action==='pdf'){await api.pdf(id);return;}
  if(action==='toggle'){collapsed[b.dataset.part]=!collapsed[b.dataset.part];render();return;}
  if(running||api.busy?.())return;
  error='';
  if(action==='export'){api.exportResults(b.dataset.part,selected());return;}
  if(action==='round'||action==='main'){await run(action==='round'?'pilot':'main');return;}
  if(action==='round-tab'){flow().selected=Number(b.dataset.index);filter='all';await api.persist();}
  if(action==='filter')filter=b.dataset.filter;
  if(action==='approve'){if(!complete(selected())||selected().signature!==sig())throw Error('Review every sampled report and save corrections first.');await atomic(()=>{flow().approved=sig();});}
  if(action==='clear'){if(!confirm(`Clear ${b.dataset.part==='pilot'?'Pilot assess rounds and approval':'Main assess progress'}? Saved assessments and PDFs will be kept.`))return;await atomic(()=>{if(b.dataset.part==='pilot'){flow().rounds=[];flow().selected=0;flow().approved=null;}else flow().main={done:{},errors:{}};});}
  if(action==='review'){api.review(id);return;}
  if(action==='mistake'){const card=b.closest('[data-pilot-card]');card.querySelector('[data-correction]').hidden=false;card.querySelector('details').open=true;card.querySelectorAll('[data-edit]').forEach(x=>x.disabled=false);return;}
  if(action==='agree'||action==='save-review'){
   const round=selected(),entry=round?.entries[id];if(!entry?.draft||round.signature!==sig())throw Error('This pilot round no longer matches the current assessment settings.');
   let review={decision:'agree',at:new Date().toISOString()};if(action==='agree')api.validate(entry.draft.value);
   if(action==='save-review'){const card=b.closest('[data-pilot-card]'),note=card.querySelector('[data-note]').value.trim();if(!note){card.querySelector('[data-note]').reportValidity();return;}const corrected=normalize(entry.review?.corrected||entry.draft.value),rows=api.rows(corrected);card.querySelectorAll('[data-edit]').forEach(input=>{const path=rows[Number(input.dataset.edit)].path;let target=corrected;for(const key of path.slice(0,-1))target=target[key];target[path.at(-1)]=input.value;});api.validate(corrected);for(const [key,a] of Object.entries(corrected.answers)){if(a.answer!==entry.draft.value.answers[key]?.answer)a.reason='Reviewer correction: '+note;}review={decision:'mistake',note,corrected,at:new Date().toISOString()};}
   await atomic(()=>{entry.review=review;flow().approved=null;});
  }
  render();
 }catch(e){fail(e);}});
 render();return {render};
}
const api={state,signature,complete,accuracy,corrections,approved,sample,normalize,mount};if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepRobWorkflow=api;
})(globalThis);
