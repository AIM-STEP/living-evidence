const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../title-abstract-screening.html'),'utf8');
const helpers=html.slice(html.indexOf('async function pendingFulltextReturns(){'),html.indexOf('async function loadSource(){'));
const records=html.slice(html.indexOf('function cleanRecord('),html.indexOf('const databaseNames='));
const rec={uid:'r',title:'Synthetic returned report',doi:'10.1234/return',pmid:'',year:'2024',authors:[],provenance:[]};
const entry={id:'return-1',at:'2026-10-06',record:rec};
const make=()=>({imports:[],pilot:{rounds:[],ai:{},human:{}},full:{ai:{r:{decision:'yes'},other:{decision:'no'}},ai2:{r:{decision:'yes'}},human:{r:{decision:'yes'}}},criteriaSig:'criteria',sourceSig:'old',audit:[]});
let persisted,fail=false;
const ctx={structuredClone,console,workspace:make(),source:{records:[rec],sourceSig:'new',criteriaSig:'criteria'},scope:'synthetic-project',importStore:{},text:(s,n)=>String(s??'').slice(0,n),fingerprint:()=>'',now:()=> 'now',
 openDB:async()=>({close(){}}),getProject:async()=>({state:{returnedRecords:[entry]}}),putProject:async(db,value)=>{persisted=structuredClone(value)},validPilot:p=>p,validFull:p=>p,
 log(){},render(){},publishSummary(){},save:async()=>{if(fail)throw Error('Synthetic quota error')},clearCalibration(){ctx.workspace.pilot={rounds:[],ai:{},human:{}};ctx.workspace.full={ai:{},ai2:{},human:{}};}};
vm.createContext(ctx);vm.runInContext(records+helpers,ctx);
(async()=>{
 let pending=await ctx.pendingFulltextReturns();assert.equal(pending.length,1);
 await ctx.prepareFulltextReturns(pending);assert.equal(ctx.workspace.imports.length,1);assert.equal(persisted.id,'synthetic-project');
 await ctx.prepareFulltextReturns(pending);assert.equal(ctx.workspace.imports.length,1,'Inbox retries must not duplicate imports');
 await ctx.applyFulltextReturns(pending);assert(!ctx.workspace.full.human.r);assert(!ctx.workspace.full.ai.r);assert(!ctx.workspace.full.ai2.r);assert(ctx.workspace.full.ai.other,'Unrelated decisions are retained');assert.equal(ctx.workspace.returnTokens.r,'return-1');assert.equal(ctx.workspace.sourceSig,'new');assert.equal(ctx.workspace.modelArchives.length,1);
 assert.equal((await ctx.pendingFulltextReturns()).length,0,'Applied return must not reset a new decision again');
 ctx.workspace=make();ctx.workspace.pilot.rounds=[{ids:['r']}];await ctx.applyFulltextReturns([entry]);assert.equal(ctx.workspace.pilot.rounds.length,0);assert.equal(Object.keys(ctx.workspace.full.ai).length,0,'Pilot returns require recalibration and preserve an archive');
 ctx.workspace=make();fail=true;await assert.rejects(ctx.applyFulltextReturns([entry]),/quota/);assert(ctx.workspace.full.human.r);assert(!ctx.workspace.appliedFulltextReturns);fail=false;await ctx.applyFulltextReturns([entry]);assert.equal(ctx.workspace.appliedFulltextReturns.length,1);
 // Publishing includes the return token only when a new forward decision exists.
 let publish;
 Object.assign(ctx,{handoffTimer:null,criteriaOrigin:null,clearTimeout(){},setTimeout(fn){publish=fn;return 1},summary:()=>({pending:1,completed:false}),forward:v=>['yes','maybe'].includes(v),finalDecision:()=>'',sourceDatabases:()=>[],decisionSource:()=> 'Synthetic reviewer'});
 vm.runInContext(html.slice(html.indexOf('function publishForFullText(){'),html.indexOf('function publishSummary(){')),ctx);
 ctx.publishForFullText();await publish();assert.equal(persisted.records.length,0);
 ctx.finalDecision=()=> 'yes';ctx.publishForFullText();await publish();assert.equal(persisted.records[0].returnId,'return-1');
 console.log('PASS: scoped return inbox, idempotent imports, decision reset, calibration archives, failed-save retry and fresh handoff tokens');
})().catch(e=>{console.error(e);process.exitCode=1});
