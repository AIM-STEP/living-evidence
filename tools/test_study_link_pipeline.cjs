'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),S=require('../app/study-links.js');
const read=name=>fs.readFileSync(name+'.html','utf8');
function part(html,a,b){const i=html.indexOf(a),j=html.indexOf(b,i);assert(i>=0&&j>i,a);return html.slice(i,j);}
// A transactional in-memory IndexedDB stand-in exercises the actual shared-store API.
function fakeIDB(){
 const projects=new Map();let fail=false;
 return {projects,failNext(){fail=true},open(){const req={};queueMicrotask(()=>{req.result={createObjectStore(){},close(){},transaction(){const pending=new Map(projects);let aborted=false;const tx={abort(){aborted=true;queueMicrotask(()=>tx.onabort?.())},objectStore(){return {get(id){const get={};queueMicrotask(()=>{get.result=pending.get(id);get.onsuccess?.();queueMicrotask(()=>{if(aborted)return;projects.clear();for(const entry of pending)projects.set(...entry);tx.oncomplete?.()})});return get},put(value){if(fail){fail=false;throw Error('synthetic storage failure')}pending.set(value.id,structuredClone(value));}}}};return tx;}};req.onsuccess?.()});return req;}};
}
(async()=>{
 global.indexedDB=fakeIDB();
 const records=[{uid:'a',title:'Primary trial results',authors:['A Author'],year:'2024',abstract:'Trial registration: NCT01234567.'},{uid:'b',title:'Long-term follow-up',authors:['A Author'],year:'2025',abstract:'Trial registration: NCT01234567.'}];
 let r=await S.sync('project-a',records);assert.equal(r.groups.length,1);assert.equal((await S.sync('project-b',[{...records[0],abstract:''}])).groups[0].registryId,'');
 const before=JSON.stringify(indexedDB.projects.get('project-a'));indexedDB.failNext();await assert.rejects(S.sync('project-a',[{...records[0],abstract:'Trial registration: NCT87654321.'}]),/synthetic storage failure/);assert.equal(JSON.stringify(indexedDB.projects.get('project-a')),before);
 console.log('PASS: shared IndexedDB storage is project scoped and failed transactions retain prior link evidence');
 // Execute the real title/abstract handoff; do not convert linked reports into one screening record.
 const ta=read('title-abstract-screening'),input=S.reconcile([...records,{uid:'no',title:'Excluded',authors:[],abstract:''}]);let timer,published;
 const c={workspace:{returnTokens:{}},source:{records:input.records,criteria:{rows:[]},criteriaSig:'criteria'},scope:'project-a',criteriaOrigin:null,handoffTimer:null,clearTimeout(){},setTimeout(fn){timer=fn;return 1},summary:()=>({pending:0,completed:true}),finalDecision:id=>id==='no'?'no':'yes',forward:d=>d==='yes'||d==='maybe',decisionSource:()=> 'reviewer',sourceDatabases:()=>['PubMed'],openDB:async()=>({close(){}}),putProject:async(db,value)=>{published=value},now:()=> 'test',AimstepStudyLinks:S,console};
 vm.createContext(c);vm.runInContext(part(ta,'let handoffTimer=', 'function publishSummary()'),c);c.publishForFullText();await timer();
 assert.equal(published.records.length,2);assert.equal(published.records[0].studyIds[0],published.records[1].studyIds[0]);assert.notEqual(published.records[0].reportId,published.records[1].reportId);
 console.log('PASS: real title/abstract handoff preserves separate report IDs and shared study IDs, excluding only screened-out reports');
 // Metadata-only linkage changes must not invalidate full-text decisions.
 const ft=read('full-text-screening');const sign={fingerprint:JSON.stringify};vm.createContext(sign);vm.runInContext(part(ft,'const sourceRecordSig=', 'let syncingSource=')+'globalThis.sourceRecordSig=sourceRecordSig;',sign);
 const old={...records[0]},updated={...old,studyIds:['S-NCT01234567'],reportId:'R-a',registryIds:['NCT01234567']};
 assert.equal(JSON.stringify(sign.sourceRecordSig(old)),JSON.stringify(sign.sourceRecordSig(updated)));
 console.log('PASS: full-text screening comparison excludes study-link metadata so grouping does not reset eligibility decisions');
 // Execute actual source CSV export: columns must stay aligned after adding linkage metadata.
 const csv={sourceDatabases:()=>['PubMed'],csvCell:v=>'"'+String(v??'').replace(/"/g,'""')+'"'};
 vm.createContext(csv);vm.runInContext(part(ta,'function sourceCSV(', 'function sourceBibTeX('),csv);
 const csvLines=csv.sourceCSV(input.records.slice(0,2)).trim().split('\r\n').map(line=>line.replace(/^\uFEFF/,''));
 assert.equal(csvLines[0].split(',').length,16);assert(csvLines[0].endsWith('"Report ID","Study IDs","Report type"'));assert(csvLines[1].includes('"S-NCT01234567"'));assert(csvLines[1].includes(input.records[0].reportId));
 console.log('PASS: source CSV preserves original columns and appends aligned study/report identities');
 // Execute the full-text update helper, including document retraction and original decisions.
 const elements={};const linkState={AimstepStudyLinks:{...S,sync:async(id,recs,docs)=>S.reconcile(recs,linkState.memory,docs)},scope:'helper-test',workspace:{records:structuredClone(records),docs:{a:{hash:'a'},b:{hash:'b'}},full:{keepDecision:true}},docCache:new Map(records.map(rec=>[rec.uid,{fullText:'Trial registration: NCT01234567.'}])),hasDoc:uid=>!!linkState.workspace.docs[uid],indexRecords(){},save:async()=>{},$:id=>elements[id]??={},memory:{entries:{}}};
 vm.createContext(linkState);vm.runInContext(part(ft,'async function updateStudyLinks()', 'async function importFromScreening()'),linkState);
 await linkState.updateStudyLinks();assert.equal(linkState.workspace.studyLinks.groups.length,1);assert.equal(linkState.workspace.records.length,2);assert(linkState.workspace.full.keepDecision);
 linkState.workspace.records=linkState.workspace.records.map(r=>({...r,abstract:''}));linkState.docCache.delete('b');delete linkState.workspace.docs.b;
 await linkState.updateStudyLinks();assert.equal(linkState.workspace.studyLinks.groups.length,2);assert(linkState.workspace.full.keepDecision);
 console.log('PASS: full-text helper enriches links, retracts removed text evidence and preserves assessments');
 // Execute real extraction dataset and source selection to prove no double counting.
 const extraction=read('extraction');const linked=S.reconcile(records).records,values={a:2,b:4};
 const e={AimstepStudyLinks:S,ws:{records:linked,form:{outcomes:[{id:'pain',name:'Pain',type:'continuous',timepoint:'12 weeks'}]},nodes:{},studyOutcomeSources:{}},st:uid=>({done:{by:'reviewer'},nr:{},arms:[{id:'t',label:{v:'Treatment'}}],res:{pain:{t:{mean:{v:String(values[uid])},sd:{v:'1'},n:{v:'20'}}}},tp:{pain:{v:'12 weeks'}}}),rowCells:(s,o,a)=>['mean','sd','n'].map(k=>s.res[o.id][a.id][k]),num:x=>Number(x.v),val:x=>x?.v||'',studyLabel:r=>r.uid,nodeOf:x=>x,Map,Set};
 vm.createContext(e);vm.runInContext(part(extraction,'function dataset(', 'function renderStudyDataChoices()'),e);
 const outcome=e.ws.form.outcomes[0];assert.equal(e.dataset(outcome).length,0);assert.equal(e.ws.studyDataConflicts.pain.length,1);
 const choice=e.ws.studyDataChoices.pain[0];e.ws.studyOutcomeSources.pain={sources:{[choice.key]:'b'}};const dataset=e.dataset(outcome);assert.equal(dataset.length,1);assert.equal(dataset[0].mean,4);assert.equal(dataset[0].studyId,'S-NCT01234567');assert.equal(dataset[0].reportId,linked[1].reportId);assert.deepEqual([...dataset[0].sourceReports],['b']);
 values.b=2;e.ws.studyOutcomeSources={};assert.equal(e.dataset(outcome).length,1);
 console.log('PASS: actual extraction dataset blocks conflicting reports, accepts explicit source, and collapses identical results once');
 // Execute the source choice handler: failed local saves must roll back choices.
 let onChange,publishCount=0,persisted,failChoice=false,choiceError='';
 const choose={ws:e.ws,busy:'',structuredClone,saveChain:Promise.resolve(),store:{},scope:'project-a',now:()=> 'test',$:()=>({addEventListener(type,fn){onChange=fn}}),putProject:async(db,value)=>{if(failChoice)throw Error('synthetic choice save failure');persisted=structuredClone(value)},publish(){publishCount++},showNotice(id,message){choiceError=message},renderStudyDataChoices(){}};
 vm.createContext(choose);vm.runInContext(part(extraction,"$('study-result-links').addEventListener('change'",'/* ---------------- Analysis hand-off'),choose);
 values.b=4;const field={dataset:{studyOutcome:'pain',studyChoice:choice.key,studyChoiceKind:'sources'},value:'b'};
 await onChange({target:field});assert.equal(persisted.state.studyOutcomeSources.pain.sources[choice.key],'b');assert.equal(publishCount,1);assert.equal(choose.busy,'');
 failChoice=true;field.value='a';await onChange({target:field});assert.equal(choose.ws.studyOutcomeSources.pain.sources[choice.key],'b');assert.equal(publishCount,1);assert.match(choiceError,/synthetic choice save failure/);
 console.log('PASS: source choice is saved before publication, with rollback on persistence failure');
 // Every page uses the same linkage module and retains all original source entries.
 for(const page of ['title-abstract-screening','full-text-screening','extraction','risk-of-bias'])assert(read(page).includes('app/study-links.js'));
 assert(ta.includes('Export duplication'));assert(!ta.includes('Export deplication'));
 const subset=S.reconcile([records[0]],r.memory);assert.equal(subset.records.length,1);assert.equal(subset.groups[0].relatedReports.length,1);assert(S.html(subset).includes('related reports in other steps'));
 console.log('PASS: related reports in other steps remain discoverable without adding analysis rows; button label is corrected');
 delete global.indexedDB;
})().catch(error=>{console.error(error);process.exitCode=1});
