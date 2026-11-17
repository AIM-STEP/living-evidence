'use strict';
const assert=require('node:assert/strict');
const {t,el,context}=require('./fixtures/screening-page.cjs')();
const records=Array.from({length:924},(_,i)=>({uid:'conflict-test-'+i,title:'Synthetic study '+i,abstract:'Adults received treatment.',authors:[],year:'2026',journal:''}));
const criteria={rows:[{title:'Population',condition:'Adults'}]};
t.setup(records,criteria);const state=t.get();state.full.startedAt='synthetic-start';
for(let i=0;i<920;i++){
 const answer={decision:'yes',criteriaSig:'synthetic-criteria',stageSig:t.stageSig(),at:'synthetic',criteria:[{dimension:'Population',judgment:'met',quote:'Adults received treatment.',reason:'Synthetic assessment.'}]};
 state.full.ai[records[i].uid]=structuredClone(answer);state.full.ai2[records[i].uid]=structuredClone(answer);
 if(i<2){state.full.ai[records[i].uid].decision='no';state.full.ai[records[i].uid].criteria[0].judgment='not met';}
}
const [first,second]=records.map(r=>r.uid),inferences=JSON.stringify([state.full.ai,state.full.ai2]);let saved;
t.bindSave(async()=>{saved=structuredClone(t.get())});
(async()=>{
 t.bindBusy('full');
 assert.equal(t.aiPair(first),'conflict');assert.equal(t.summary().aiScreened,920);
 const card=t.fullCard(first);assert(!/data-fvote="yes"[^>]* disabled/.test(card),'Completed records must be reviewable while Main AI continues');
 await t.castFullVote(first,'yes');assert.equal(state.full.human[first]?.decision,'yes','Save a completed conflict while Main AI continues');
 assert.equal(t.finalDecision(first),'yes');assert(!t.fullCategoryIds('conflicts').includes(first));
 assert.equal(t.summary().conflictsResolved,1);assert.equal(t.summary().conflictsPending,1);
 assert.equal(t.getBusy(),'full');assert.equal(JSON.stringify([state.full.ai,state.full.ai2]),inferences,'Human review must preserve the 920 saved AI assessments');
 assert.equal(state.full.completedAt,'','Other reports still need inference');
 assert.equal(saved.full.human[first].decision,'yes');
 console.log('PASS completed conflicts can be reviewed during Main screening and leave the pending queue without replacing AI assessments');
 // No needs a reviewer reason, and failed writes keep both the conflict and draft.
 await t.castFullVote(second,'no');assert(!state.full.human[second]);assert.match(t.fullReviewErrors.get(second),/exclusion reason/);
 t.exclusionDrafts.set('full|'+second,'The reviewer confirmed the population mismatch.');
 t.bindSave(async()=>{throw Error('Synthetic quota failure')});await t.castFullVote(second,'no');
 assert(!state.full.human[second]);assert(t.fullCategoryIds('conflicts').includes(second));assert.match(t.fullReviewErrors.get(second),/Please retry/);assert(t.exclusionDrafts.has('full|'+second));
 assert.equal(JSON.stringify([state.full.ai,state.full.ai2]),inferences);
 // A human save and an unrelated inference can finish concurrently.
 let release;const pendingSave=new Promise(resolve=>{release=resolve});t.bindSave(async()=>{await pendingSave;saved=structuredClone(t.get())});
 const saving=t.castFullVote(second,'no');assert.equal(t.canReviewFullRecord(first),false,'Prevent overlapping human writes');
 const next=records[920].uid,answer=structuredClone(state.full.ai[records[2].uid]);state.full.ai[next]=answer;state.full.ai2[next]=structuredClone(answer);
 const withNewInference=JSON.stringify([state.full.ai,state.full.ai2]);release();await saving;
 assert.equal(state.full.human[second].decision,'no');assert.equal(t.summary().conflictsPending,0);assert.equal(t.fullCategoryIds('conflicts').length,0);
 assert.equal(JSON.stringify([state.full.ai,state.full.ai2]),withNewInference,'Human save must retain a concurrently completed inference');assert(!t.exclusionDrafts.has('full|'+second));
 assert.equal(saved.full.ai[next].decision,'yes');assert.equal(t.currentCalibration().lessons.length,0,'Main decisions are not silently learned as Pilot feedback');
 const unfinished=records[921].uid;assert(!t.canReviewFullRecord(unfinished));await t.castFullVote(unfinished,'yes');assert(!state.full.human[unfinished]);
 for(const operation of ['source-refresh','pilot','clear','stage-settings']){t.bindBusy(operation);assert(!t.canReviewFullRecord(first));await t.castFullVote(first,'no');assert.equal(state.full.human[first].decision,'yes');}
 t.bindBusy('full');assert(t.canReviewFullRecord(first));
 t.restore(saved);assert.equal(t.finalDecision(first),'yes');assert.equal(t.finalDecision(second),'no');assert.equal(t.summary().conflictsPending,0);assert.equal(await t.syncDecisionPolicy(),false,'This fix must not trigger re-screening or archive the existing run');
 console.log('PASS exclusion reasons, save rollback/retry, concurrent AI persistence, guards, draft cleanup and reload without re-screening');
 // Rendering must retain input focus and caret while AI updates the list.
 const current=t.get();
 el('full-conflicts').parentElement={classList:{toggle(){}}};el('screening-progress-percent').parentElement={style:{setProperty(){}}};
 t.bindMainRendering();await el('full-categories').fire('click',{target:{closest:()=>({dataset:{fullCategory:'conflicts'}})}});
 assert.match(el('check-list').innerHTML,/No unresolved conflicts/);assert.equal(el('full-conflicts').textContent,'0');
 await el('full-categories').fire('click',{target:{closest:()=>({dataset:{fullCategory:'yes'}})}});
 const focusedId=records[2].uid,typed='A reviewer reason in progress.';t.exclusionDrafts.set('full|'+focusedId,typed);
 context.document.activeElement={matches:()=>true,dataset:{exclusionId:focusedId},selectionStart:7,selectionEnd:12};let focusArgs,range;
 el('check-list').querySelector=selector=>selector.includes(focusedId)?{focus(args){focusArgs=args},setSelectionRange(a,b){range=[a,b]}}:null;
 t.renderMain();assert.equal(focusArgs.preventScroll,true);assert.deepEqual(range,[7,12]);assert(el('check-list').innerHTML.includes(typed));
 context.document.activeElement=null;
 // Delegated Yes/No button clicks use the same working save path during Main.
 t.bindSave(async()=>{saved=structuredClone(t.get())});await el('check-list').fire('click',{target:{closest:selector=>selector==='[data-fvote]'?{dataset:{id:focusedId,fvote:'yes'}}:null}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(current.full.human[focusedId].decision,'yes');assert(!t.exclusionDrafts.has('full|'+focusedId));
 console.log('PASS conflict counter/queue, Yes/No event binding and stable exclusion input focus/caret during Main rendering');
 // A failing optional review must not erase completion reached by another task.
 let reject;const blocked=new Promise((resolve,fail)=>{reject=fail});t.bindSave(()=>blocked);const optional=records[3].uid;
 const optionalSave=t.castFullVote(optional,'yes');
 for(const record of records.slice(921)){current.full.ai[record.uid]=structuredClone(answer);current.full.ai2[record.uid]=structuredClone(answer)}
 t.maybeComplete();assert(current.full.completedAt);reject(Error('Synthetic failure after last AI reading'));await optionalSave;
 assert(!current.full.human[optional]);assert(current.full.completedAt);assert.equal(t.summary().pending,0);assert.equal(t.summary().completed,true);
 console.log('PASS concurrent completion remains consistent after human-save rollback');

})().catch(e=>{console.error(e);process.exitCode=1});
