const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const S=require('../app/screening-stages.js'),html=fs.readFileSync(require('node:path').join(__dirname,'../full-text-screening.html'),'utf8');
const extract=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
function setup(){
 const criteria={rows:[{title:'Population',condition:'Adults'},{title:'Duration',condition:'12 weeks'}]},items=S.items(criteria);
 const old={version:2,sourceSig:'c',elements:S.seed(criteria)};
 const nodes=new Map(),ctx={AimstepScreeningStages:S,structuredClone,source:{criteria,criteriaSig:'c',sourceSig:'s',records:[{uid:'r'}]},workspace:{criteria,records:[{uid:'r'}],docs:{r:{kind:'pdf',hash:'original'}},screeningStages:old,sourceSig:'s',criteriaSig:'c',pilot:{rounds:[{ids:['r']}],size:10},full:{ai:{r:{decision:'no'}}}},stagesDraft:old.elements.map((e,i)=>({...e,enabled:i===0})),stagesFramework:'PICO',stagesBase:'c',stagesInitial:'',stagesSaving:false,busy:'',now:()=>'',confirm:()=>true,clearActionsBlocked:()=>false,screeningHasProgress:()=>true,importFromScreening:async()=>{},pauseRetrieval:()=>{},retrievalSettled:Promise.resolve(),save:async()=>{},render:()=>{},publishSummary:()=>{},log:()=>{},showNotice:()=>{},toast:()=>{},newPilot:size=>({size,rounds:[],ai:{},human:{}}),newFull:()=>({ai:{},ai2:{},human:{}}),
 $:id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,hidden:true,textContent:''});return nodes.get(id)},
 pilotReviewDrafts:new Map(),pilotReviewErrors:new Map(),expandedPilotAssessments:new Set(),fullReviewErrors:new Map(),reasonDrafts:new Map(),expandedFullAssessments:new Set(),collapsedFullAssessments:new Set(),fullNow:new Map(),fullDone:[]};
 vm.createContext(ctx);vm.runInContext(extract('function stageDraftSignature()','function stagesDirty()')+extract('function screeningStagesReady()','const criteriaRows=')+extract('async function saveStageSettings()',"$('save-stages').addEventListener"),ctx);
 return ctx;
}
(async()=>{
 let c=setup();await c.saveStageSettings();assert.equal(c.workspace.screeningStageArchives.length,1);assert.equal(c.workspace.screeningStageArchives[0].full.ai.r.decision,'no');assert.equal(c.workspace.pilot.rounds.length,0);assert.equal(Object.keys(c.workspace.full.ai).length,0);assert(c.screeningStagesReady());assert.equal(c.workspace.docs.r.hash,"original");assert.equal(c.workspace.criteria.rows.length,2);assert.equal(c.activeScreeningCriteria().rows.length,1);
 c=setup();c.confirm=()=>false;await c.saveStageSettings();assert.equal(c.workspace.pilot.rounds.length,1);assert.equal(c.workspace.screeningStageArchives,undefined);
 c=setup();const before=JSON.stringify(c.workspace);c.save=async()=>{throw Error('synthetic full storage')};await c.saveStageSettings();assert.equal(JSON.stringify(c.workspace),before);assert(!c.$('stages-error').hidden);assert.equal(c.busy,'');
 c=setup();c.importFromScreening=async()=>{c.workspace.criteriaSig='changed'};await c.saveStageSettings();assert.equal(c.workspace.screeningStages.sourceSig,'c');assert(c.$('stages-error').textContent.includes('changed'));assert.equal(c.workspace.pilot.rounds.length,1);
 console.log('PASS: full-text stage save preserves PDFs and original criteria, archives excluded records, resets dependent results, cancellation, storage rollback and concurrent upstream changes');
})().catch(e=>{console.error(e);process.exitCode=1});
