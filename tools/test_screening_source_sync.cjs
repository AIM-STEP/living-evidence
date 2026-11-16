'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../title-abstract-screening.html'),'utf8');
const part=(start,end)=>{const a=html.indexOf(start),b=html.indexOf(end,a);assert(a>=0&&b>a);return html.slice(a,b);};
function setup(){
 const writes=[],events=[],c={structuredClone,Map,Set,JSON,Promise,AimstepDedup:require('../app/screening-dedup.js'),
 workspace:{sourceSig:'old',criteriaSig:'criteria',imports:[{id:'kept',records:[{uid:'r',title:'Original title',abstract:'Original abstract',authors:[],provenance:[]}]}],importedRuns:[],screeningStages:{saved:'criteria'},criteriaUpload:null,pilot:{size:20,rounds:[{ids:['r']}],human:{r:{decision:'yes'}},approved:{}},full:{ai:{r:{decision:'no'}},ai2:{},human:{}}},
 source:{sourceSig:'new',criteriaSig:'criteria',records:[{uid:'r',title:'Title'}],runs:[]},sourceError:'',busy:'',importing:false,pilotReviewSaving:false,fullReviewSaving:false,
 pilotReviewDrafts:new Map(),exclusionDrafts:new Map(),stagesDialog:{open:false},document:{visibilityState:'visible'},refreshPromise:null,
 newPilot:size=>({size,rounds:[],ai:{},human:{},approved:null}),newFull:()=>({ai:{},ai2:{},human:{}}),
 log:(action,detail)=>events.push({action,...detail}),now:()=> 'test',save:async()=>{writes.push(structuredClone(c.workspace))},publishSummary(){},render(){},
 showNotice(...args){c.notice=args},fingerprint:JSON.stringify,
 screeningHasProgress:()=>!!(c.workspace.pilot.rounds.length||Object.keys(c.workspace.full.ai).length||Object.keys(c.workspace.full.human).length)};
 vm.createContext(c);vm.runInContext(part('function clearCalibration()', '// Deduplication is automatic.'),c);c.writes=writes;c.events=events;return c;
}
(async()=>{
 let c=setup(),imports=JSON.stringify(c.workspace.imports),settings=JSON.stringify(c.workspace.screeningStages);
 c.pilotReviewDrafts.set('r',{note:'Unfinished correction'});c.exclusionDrafts.set('r','Unfinished reason');
 c.confirm=()=>{throw Error('No confirmation allowed')};c.screeningStagesReady=()=>false;
 assert.equal(await c.syncSource(),true);assert.equal(c.workspace.sourceSig,'new');assert.equal(c.workspace.pilot.rounds.length,0);
 assert.equal(c.workspace.dedupArchives[0].pilot.human.r.decision,'yes');assert.equal(c.workspace.dedupArchives[0].full.ai.r.decision,'no');assert.equal(c.workspace.dedupArchives[0].automatic,true);assert.equal(c.workspace.dedupArchives[0].drafts.pilot[0][1].note,'Unfinished correction');assert.equal(c.pilotReviewDrafts.size,0);assert.equal(c.exclusionDrafts.size,0);
 assert.equal(JSON.stringify(c.workspace.imports),imports);assert.equal(JSON.stringify(c.workspace.screeningStages),settings);assert(c.workspace.sourceUpdateNotice.includes('archived'));
 assert.equal(await c.syncSource(),false);assert.equal(c.writes.length,1);assert.equal(c.workspace.dedupArchives.length,1);
 console.log('PASS: automatic archive/reset without button, confirmation or criteria popup; unchanged source is a no-op');
 c=setup();c.workspace.pilot.rounds=[];c.workspace.full.ai={};await c.syncSource();assert.equal(c.workspace.dedupArchives,undefined);assert.equal(c.workspace.sourceUpdateNotice,'');
 c=setup();let before=JSON.stringify(c.workspace);c.sourceError='temporary storage error';assert.equal(await c.syncSource(),false);assert.equal(JSON.stringify(c.workspace),before);
 c=setup();before=JSON.stringify(c.workspace);c.save=async()=>{throw Error('storage full')};await assert.rejects(c.syncSource(),/storage full/);assert.equal(JSON.stringify(c.workspace),before);assert.equal(c.workspace.sourceSig,'old');
 c.save=async()=>{};await c.syncSource();assert.equal(c.workspace.dedupArchives.length,1);
 console.log('PASS: no-progress adoption, read-error guard, failed-save rollback and retry without duplicate archive');
 // Exercise the real loader, including the initial-page/import path.
 c=setup();Object.assign(c,{scope:'synthetic',searchKey:'search',searchRuns:[],recordById:new Map(),localStorage:{getItem:()=>null},
 openDB:async()=>({close(){}}),getProject:async()=>null,pendingFulltextReturns:async()=>[],prepareFulltextReturns:async()=>{},applyFulltextReturns:async()=>{},
 eligibilityFallback:()=>({rows:[{title:'Population',condition:'Adults'}]}),validCriteriaUpload:()=>null,row:r=>r,
 text:(v,n)=>String(v??'').slice(0,n),assignSourceNumbers:()=>false});
 vm.runInContext(part('function cleanRecord(', 'function recordKeys(')+part('async function loadSource(', 'function stale('),c);
 await c.loadSource();assert.equal(c.workspace.sourceSig,c.source.sourceSig);assert.equal(c.workspace.criteriaSig,c.source.criteriaSig);assert.equal(c.workspace.dedupArchives.length,1);assert.equal(c.source.records.length,1);
 await c.loadSource();assert.equal(c.workspace.dedupArchives.length,1);assert.equal(c.writes.length,1);
 console.log('PASS: initial load and import path automatically adopt source once, even when record numbering is unchanged');
 // Background refresh must not race model work or unfinished manual edits.
 c=setup();let reads=0,release;c.loadSource=async()=>{reads++;await new Promise(resolve=>{release=resolve})};
 vm.runInContext(part('function refreshSource()', "window.addEventListener('storage'"),c);
 for(const flag of ['busy','importing','pilotReviewSaving','fullReviewSaving']){c[flag]=flag==='busy'?'pilot':true;await c.refreshSource();assert.equal(reads,0);c[flag]=flag==='busy'?'':false;}
 c.pilotReviewDrafts.set('r',{});await c.refreshSource();assert.equal(reads,0);c.pilotReviewDrafts.clear();
 c.exclusionDrafts.set('r','draft');await c.refreshSource();assert.equal(reads,0);c.exclusionDrafts.clear();
 const pending=c.refreshSource();assert.equal(reads,1);assert.equal(c.busy,'source-refresh');await c.refreshSource();assert.equal(reads,1);release();await pending;assert.equal(c.busy,'');assert.equal(c.refreshPromise,null);
 c.loadSource=async()=>{throw Error('storage failed')};c.render=()=>{c.notice=['render replaced notice']};await c.refreshSource();assert(c.notice[1].includes('storage failed'));assert.equal(c.notice[2],'error');
 assert(!html.includes('id="sync-source"'));assert(!html.includes('Use latest source'));assert(!html.includes("$('sync-source')"));
 console.log('PASS: refresh pauses during screening/edits, prevents overlapping work, unlocks on failure and keeps the error visible');
})().catch(e=>{console.error(e);process.exitCode=1});
