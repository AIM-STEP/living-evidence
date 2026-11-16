'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const P=require('../app/screening-prompt.js'),S=require('../app/screening-stages.js'),C=require('../app/screening-calibration.js');
const html=fs.readFileSync('title-abstract-screening.html','utf8'),elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,open:false,style:{},dataset:{},classList:{toggle(){},add(){},remove(){}},setAttribute(){},getAttribute(){return null},closest(){return {classList:{toggle(){}}}},querySelector(selector){return selector==='.sr-only'?{textContent:''}:null},querySelectorAll(){return []},addEventListener(){},showModal(){this.open=true},close(){this.open=false}});return elements.get(id);}
let requests=0,savedState;
const context={console,URL,URLSearchParams,AbortController,DOMException,structuredClone,TextEncoder,Blob,Map,Set,performance,CSS:{escape:x=>x},
 setTimeout(){return 1},clearTimeout(){},setInterval(){},localStorage:{getItem(){return null},setItem(){},removeItem(){}},sessionStorage:{getItem(){return null}},navigator:{},
 location:{href:'https://aimsetp.com/title-abstract-screening.html',search:'',hostname:'aimsetp.com'},document:{activeElement:null,addEventListener(){},getElementById:el,querySelectorAll(){return []},visibilityState:'visible',body:{dataset:{}}},window:{addEventListener(){}},confirm(){return true},
 AimstepCalibration:C,AimstepScreeningStages:S,AimstepScreeningPrompt:P,AIMScreeningCriteriaDialog:()=>({})};
let code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const PILOT_PROMPT'));
assert(code);
code=code.replace(/\ninit\(\);/,`\nglobalThis.flow={setup(records){source={records,criteriaSig:'c1',sourceSig:'source',runs:[],criteria:{framework:'PICO',rows:[{title:'Population',condition:'Adults',uncertain:'Children'}]}};recordById.clear();records.forEach(r=>recordById.set(r.uid,r));workspace=defaults();workspace.sourceSig='source';workspace.criteriaSig='c1';workspace.screeningModel='synthetic-jev';workspace.screeningStages={version:2,sourceSig:'c1',elements:AimstepScreeningStages.seed(source.criteria)};workspace.pilot.size=3;render=()=>{};renderPilot=()=>{};renderFull=()=>{};renderCalibration=()=>{};renderPilotApproval=()=>{};publishSummary=()=>{};log=()=>{};toast=()=>{};showNotice=()=>{};resolvePilotModel=async()=>({provider:'typesafe',name:'synthetic-jev',base:'/backend'});loadSource=async()=>{};},get:()=>workspace,bindSave(fn){save=fn},bindApi(fn){typesafeRequest=fn},startPilotRound,savePilotReview,approvePilotRound,pilotApprovalValid,currentScreeningPrompt,syncPromptVersion,saveScreeningPrompt,readySource,refreshSource};`);
vm.runInNewContext(code,context);
const flow=context.flow,records=Array.from({length:3},(_,i)=>({uid:'r'+i,title:'Synthetic adults trial '+i,abstract:'Adults were randomized.',authors:['Synthetic'],year:'2026',journal:''}));
(async()=>{
 flow.setup(records);flow.bindSave(async()=>{savedState=structuredClone(flow.get())});
 flow.bindApi(async(base,payload)=>{requests++;assert.equal(payload.action,'screen');assert.equal(payload.input.screeningPrompt.text,flow.currentScreeningPrompt().text);return {version:'typesafe-screen-v6-prompt',model:'synthetic-jev',value:{decision:'include',criteria:payload.input.criteria.map(r=>({dimension:r.dimension,judgment:'met',quote:'Adults were randomized.',reason:'Explicit adult population.'}))},screeningPrompt:{version:P.VERSION,hash:payload.input.screeningPrompt.hash},raw:{}};});
 await flow.syncPromptVersion();assert(flow.readySource());
 // A saved criteria edit can precede the next background refresh: Start must
 // bind the new generated prompt before any new assessments are collected.
 flow.get().screeningStages.elements[0].inclusion='Adults in a randomized trial';
 await Promise.all([flow.startPilotRound(),flow.startPilotRound()]);assert.equal(flow.get().screeningPromptSnapshot.hash,flow.currentScreeningPrompt().hash);
 await flow.syncPromptVersion();assert.equal(flow.get().pilot.rounds.length,1);assert.equal((flow.get().screeningPromptArchives||[]).length,0);
 const state=flow.get();assert.equal(requests,3);assert.equal(state.pilot.rounds.length,1);assert.equal(Object.keys(state.pilot.ai).length,3);
 for(const r of records){assert.equal(state.pilot.ai[r.uid].screeningPromptHash,flow.currentScreeningPrompt().hash);await flow.savePilotReview(r.uid,'agree');}
 assert(state.pilot.rounds[0].revealedAt);await flow.approvePilotRound();assert(flow.pilotApprovalValid());assert(savedState.pilot.approved);
 const oldHash=flow.currentScreeningPrompt().hash;
 await flow.saveScreeningPrompt({text:'Interpret age using the explicit population criterion; keep missing age unclear.',mode:'edited'}, {criteriaSig:'c1',stageSig:S.signature(state.screeningStages)});
 assert.notEqual(flow.currentScreeningPrompt().hash,oldHash);assert.equal(flow.get().screeningPromptArchives.length,1);assert.equal(flow.get().screeningPromptArchives[0].prompt.hash,oldHash);assert.equal(flow.get().pilot.rounds.length,0);assert(!flow.pilotApprovalValid());assert.equal(records.length,3);assert.equal(requests,3,'saving never starts paid model calls');
 await flow.startPilotRound();assert.equal(requests,6);assert.equal(Object.keys(flow.get().pilot.ai).length,3);
 console.log('PASS actual page workflow: generated prompt → TypeSafe pilot → reviews → approval → edited prompt archives prior results and approval → fresh pilot; saving itself makes no model calls');
})().catch(e=>{console.error(e);process.exitCode=1});
