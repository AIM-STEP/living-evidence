const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../title-abstract-screening.html'),'utf8');
const clear=html.slice(html.indexOf('function clearActionsBlocked()'),html.indexOf("for(const kind of ['source','pilot','full'])$('clear-'+kind).addEventListener"));
const calibration=html.slice(html.indexOf('function clearCalibration()'),html.indexOf('function syncSource()'));
function setup(){
  const nodes=new Map(),freshFull=()=>({ai:{},ai2:{},human:{}}),freshPilot=size=>({size,rounds:[],ai:{},human:{},approved:null});
  const ctx={structuredClone,Map,Set,busy:'',importing:false,pilotReviewSaving:false,fullReviewSaving:false,scope:'synthetic',confirm:()=>true,
    workspace:{imports:[{id:'local',records:[{uid:'a'}]}],importedRuns:[{runId:'search'}],excludedRuns:[],sourceSig:'source',criteriaSig:'criteria',pilot:{size:10,rounds:[{}],human:{a:{}},approved:{}},full:{ai:{a:{}},human:{b:{}}}},
    source:{records:[{uid:'a'}],runs:[{}],sourceSig:'source',criteriaSig:'criteria',criteria:{rows:[{}]}},dedupStats:{total:2},recordById:new Map([['a',{}]]),
    newFull:freshFull,newPilot:freshPilot,fingerprint:JSON.stringify,now:()=>'',importStore:{},save:async()=>{},putProject:async()=>{},log:()=>{},publishSummary:()=>{},render:()=>{},showNotice:()=>{},toast:()=>{},$:(id)=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)},
    fullReviewErrors:new Map(),exclusionDrafts:new Map(),expandedFullAssessments:new Set(),collapsedFullAssessments:new Set(),fullFilter:'yes',fullNow:new Map(),fullDone:[1],pilotReviewDrafts:new Map(),pilotReviewErrors:new Map(),expandedPilotAssessments:new Set()};
  vm.createContext(ctx);vm.runInContext(calibration+clear,ctx);return ctx;
}
(async()=>{
  let c=setup();c.confirm=()=>false;await c.clearScreeningSection('source');assert.equal(c.source.records.length,1);assert.equal(c.workspace.pilot.rounds.length,1);
  c=setup();c.busy='pilot';await c.clearScreeningSection('source');assert.equal(c.source.records.length,1);
  c=setup();await c.clearScreeningSection('full');assert.equal(Object.keys(c.workspace.full.ai).length,0);assert.equal(c.workspace.pilot.rounds.length,1);assert(c.workspace.pilot.approved);assert.equal(c.source.records.length,1);
  c=setup();await c.clearScreeningSection('pilot');assert.equal(c.workspace.pilot.rounds.length,0);assert.equal(Object.keys(c.workspace.full.ai).length,0);assert.equal(c.source.records.length,1);
  c=setup();let stored;c.putProject=async(db,row)=>stored=row;await c.clearScreeningSection('source');assert.equal(stored.runs.length,0);assert.equal(c.workspace.importedRuns.length,0);assert.equal(c.workspace.imports.length,0);assert.equal(c.source.records.length,0);assert.equal(c.workspace.pilot.rounds.length,0);assert(c.source.criteria);
  c=setup();let writes=[];c.putProject=async(db,row)=>writes.push(row);c.save=async()=>{throw Error('synthetic storage failure')};await c.clearScreeningSection('source');assert.equal(c.source.records.length,1);assert.equal(c.workspace.imports.length,1);assert.equal(writes.at(-1).runs.length,1);assert.equal(c.busy,'');
  console.log('PASS: confirmation, busy guard, all three clear scopes, persistence writes and rollback');
})().catch(e=>{console.error(e);process.exitCode=1});
