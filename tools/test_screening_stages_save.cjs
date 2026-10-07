const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const S=require('../app/screening-stages.js'),html=fs.readFileSync(require('node:path').join(__dirname,'../title-abstract-screening.html'),'utf8');
const extract=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
function setup(){
 const criteria={rows:[{title:'Population',condition:'Adults'},{title:'Duration',condition:'12 weeks'}]},items=S.items(criteria);
 const old={sourceSig:'c',assignments:Object.fromEntries(items.map(i=>[i.id,'abstract']))};
 const nodes=new Map(),ctx={AimstepScreeningStages:S,structuredClone,source:{criteria,criteriaSig:'c',sourceSig:'s',records:[{uid:'r'}]},workspace:{screeningStages:old,sourceSig:'s',criteriaSig:'c',pilot:{rounds:[{ids:['r']}],size:10},full:{ai:{r:{decision:'no'}}}},stagesDraft:{...old.assignments,[items[1].id]:'fulltext'},stagesBase:'c',stagesInitial:'',stagesSaving:false,busy:'',now:()=>'',confirm:()=>true,clearActionsBlocked:()=>false,screeningHasProgress:()=>true,loadSource:async()=>{},save:async()=>{},render:()=>{},publishSummary:()=>{},log:()=>{},showNotice:()=>{},newPilot:size=>({size,rounds:[],ai:{},human:{}}),newFull:()=>({ai:{},ai2:{},human:{}}),
 $:id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,hidden:true,textContent:''});return nodes.get(id)},
 pilotReviewDrafts:new Map(),pilotReviewErrors:new Map(),expandedPilotAssessments:new Set(),fullReviewErrors:new Map(),exclusionDrafts:new Map(),expandedFullAssessments:new Set(),collapsedFullAssessments:new Set(),fullNow:new Map(),fullDone:[]};
 vm.createContext(ctx);vm.runInContext(extract('function screeningStagesReady()','function readySource()')+extract('function clearCalibration()','function syncSource()')+extract('async function saveStageSettings()',"$('save-stages').addEventListener"),ctx);
 return ctx;
}
(async()=>{
 let c=setup();await c.saveStageSettings();assert.equal(c.workspace.screeningStageArchives.length,1);assert.equal(c.workspace.screeningStageArchives[0].full.ai.r.decision,'no');assert.equal(c.workspace.pilot.rounds.length,0);assert.equal(Object.keys(c.workspace.full.ai).length,0);assert(c.screeningStagesReady());
 c=setup();c.confirm=()=>false;await c.saveStageSettings();assert.equal(c.workspace.pilot.rounds.length,1);assert.equal(c.workspace.screeningStageArchives,undefined);
 c=setup();const before=JSON.stringify(c.workspace);c.save=async()=>{throw Error('synthetic full storage')};await c.saveStageSettings();assert.equal(JSON.stringify(c.workspace),before);assert(!c.$('stages-error').hidden);assert.equal(c.busy,'');
 c=setup();c.loadSource=async()=>{c.source.criteriaSig='changed'};await c.saveStageSettings();assert.equal(c.workspace.screeningStages.sourceSig,'c');assert(c.$('stages-error').textContent.includes('changed'));assert.equal(c.workspace.pilot.rounds.length,1);
 console.log('PASS: stage save archives excluded records, resets dependent results, cancellation, storage rollback and concurrent upstream changes');
})().catch(e=>{console.error(e);process.exitCode=1});
