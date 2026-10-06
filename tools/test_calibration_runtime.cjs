const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const engine=require('../app/screening-calibration.js');
const html=fs.readFileSync(path.join(__dirname,'../title-abstract-screening.html'),'utf8');
const rec={uid:'r',title:'Adults included',abstract:'Adults received treatment.'};
const elements={};function $(id){return elements[id]??={value:'',textContent:'',innerHTML:'',disabled:false,hidden:false,addEventListener(){}}}
const pilot={size:20,rounds:[{ids:['r'],revealedAt:'done',criteriaSig:'criteria'}],ai:{r:{decision:'no',model:'test-model',criteria:[]}},human:{r:{decision:'yes',calibrationCriterion:'Population',note:'Adults satisfy the population criterion.'}},approved:null};
const source={criteriaSig:'criteria',criteria:{rows:[{title:'Population',condition:'Adults'}]},records:[rec]};
let calls=0,asked=0;
const ctx=vm.createContext({$,AimstepCalibration:engine,AbortController,structuredClone,JSON,
 PILOT_REVIEW_MODE:'ai-first-v1',pilotAIOutcome:a=>a.decision==='no'?'no':'yes',pilotReviewSaving:false,pilotReviewDrafts:new Map(),workspace:{pilot,full:{ai:{},ai2:{},human:{}}},source,recordById:new Map([['r',rec]]),busy:'',controller:null,
 text:(x,n)=>String(x??'').slice(0,n),esc:x=>String(x??''),now:()=> 'time',stale:()=>false,
 render(){},renderFull(){},renderPilot(){},save:async()=>{},log(){},download(){},stamp:()=> 'test',projectId:'test',showNotice(){},
 resolvePilotModel:async()=>({name:'test-model'}),
 screenPilotRecord:async(record,round,signal,variant,bundle)=>{calls++;assert.equal(bundle.lessons[0].reviewerDecision,'yes');return {decision:'yes',model:'test-model',calibrationHash:bundle.hash,calibrationLessonIds:[bundle.lessons[0].id]}},
 pilotRoundState:()=>({revealed:true,aiDone:true,votesDone:true,ids:['r']}),pilotMetrics:()=>({recommended:true}),pilotCriteriaSig:()=> 'sig',pilotApprovalValid:()=>false,screeningProvider:()=> 'local',PILOT_PROMPT:'test-prompt',
 confirm:()=>{asked++;return true},newFull:()=>({ai:{},ai2:{},human:{}})});
function load(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert(a>=0&&b>a);vm.runInContext(html.slice(a,b),ctx);}
load('const calibrationEngine=','// Variant 2 is the second reading');
load('async function approvePilotRound(){','// Reviewer-entered reasons take precedence');
(async()=>{
 const original=JSON.stringify(pilot.ai);
 await vm.runInContext('checkCalibration()',ctx);
 assert.equal(calls,1);assert.equal(pilot.calibrationCheck.matched,1);assert.equal(pilot.calibrationCheck.completed,true);
 assert.equal(JSON.stringify(pilot.ai),original);assert.equal(pilot.human.r.decision,'yes');
 await vm.runInContext('approvePilotRound()',ctx);assert(pilot.approved.calibration);assert.equal(pilot.approved.calibration.lessons.length,1);
 const oldHash=pilot.approved.calibration.hash;
 ctx.workspace.full.ai.r={decision:'no',calibrationHash:oldHash};
 pilot.human.r.note+=' Do not invent an age cutoff.';
 await vm.runInContext('approvePilotRound()',ctx);
 assert.equal(asked,1);assert.equal(ctx.workspace.modelArchives.length,1);assert.equal(ctx.workspace.modelArchives[0].full.ai.r.decision,'no');
 assert.equal(Object.keys(ctx.workspace.full.ai).length,0);assert.notEqual(pilot.approved.calibration.hash,oldHash);
 console.log('PASS: correction replay preserves original pilot, approval freezes lessons, reapproval archives mismatched formal results');
})().catch(e=>{console.error(e);process.exitCode=1});
