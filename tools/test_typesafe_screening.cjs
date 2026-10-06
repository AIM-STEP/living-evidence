const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../title-abstract-screening.html'),'utf8');
const elements={};function $(id){return elements[id]??={value:'',textContent:'',disabled:false,hidden:false,events:{},addEventListener(n,f){this.events[n]=f},replaceChildren(...items){this.items=items}}}
let response={models:['synthetic-model']},requests=[],accept=true;
const context=vm.createContext({$,AbortController,DOMException,setTimeout,clearTimeout,structuredClone,Error,Option:function(t,v){this.text=t;this.value=v},
 location:{href:'http://127.0.0.1:8765/title-abstract-screening.html'},URL,LOCAL_SERVER:'http://127.0.0.1:8765',
 workspace:{pilot:{size:20,rounds:[],ai:{},human:{}},full:{ai:{},human:{}}},source:{criteriaSig:'c',sourceSig:'s'},busy:'',pilotModel:null,pilotView:-1,
 confirm:()=>accept,now:()=> 'test-time',log(){},save:async()=>{},render(){},download(){},
 newPilot:size=>({size,rounds:[],ai:{},human:{}}),newFull:()=>({ai:{},human:{}}),
 pilotHasProgress:()=>context.workspace.pilot.rounds.length>0,isUnreachable:()=>false,
 localFetch:async(url,options={})=>{if(url.endsWith('/health'))return {json:async()=>({typesafe:{available:true}})};requests.push(JSON.parse(options.body));return {ok:true,json:async()=>response}}});
const a=html.indexOf('// TypeSafe credentials live'),b=html.indexOf('/* Screening uses TypeSafe;',a);
vm.runInContext(html.slice(a,b),context);
(async()=>{
 $('screen-model-source').value='typesafe';await $('screen-model-source').events.change();
 assert.equal(context.workspace.screeningProvider,'typesafe');assert.equal($('screen-api-settings').hidden,false);
 await $('screen-api-confirm').events.click();assert.match($('screen-api-status').textContent,/Paste/);
 $('screen-api-key').value='synthetic-key';await $('screen-api-confirm').events.click();
 assert.equal(context.workspace.screeningModel,'synthetic-model');assert.equal($('screen-api-key').value,'');
 assert.equal(vm.runInContext('typesafeKey',context),'synthetic-key');
 assert.equal(requests[0].action,'models');assert.equal(requests[0].apiKey,'synthetic-key');
 assert(!JSON.stringify(context.workspace).includes('synthetic-key'));
 context.workspace.pilot.rounds=[{ids:['r1']}];context.workspace.pilot.approved={model:'synthetic-model'};
 context.workspace.full.ai={r1:{decision:'yes'}};
 await assert.rejects(context.setScreeningModel('local'),/uses TypeSafe/);
 accept=false;await context.setScreeningModel('typesafe','synthetic-model-2');
 assert.equal(context.workspace.screeningProvider,'typesafe');assert.equal(context.workspace.pilot.rounds.length,1);
 accept=true;await context.setScreeningModel('typesafe','synthetic-model-2');
 assert.equal(context.workspace.screeningProvider,'typesafe');assert.equal(context.workspace.pilot.rounds.length,0);
 assert.equal(context.workspace.modelArchives[0].full.ai.r1.decision,'yes');assert.equal(vm.runInContext('typesafeKey',context),'synthetic-key');
 assert(!JSON.stringify(context.workspace).includes('synthetic-key'));
 console.log('PASS: TypeSafe confirmation, model discovery, key isolation, model-change cancellation and archiving');
 // Existing decision rule still governs TypeSafe results.
 context.source.criteria={rows:[{title:'Population'}]};context.text=(s,n)=>String(s??'').slice(0,n);
 vm.runInContext(html.slice(html.indexOf('const squash='),html.indexOf('async function screenPilotRecord(')),context);
 const value={decision:'exclude',criteria:[{dimension:'Population',judgment:'not met',quote:'Children only.',probabilities:{met:0,not_met:1,unclear:0}}]};
 context.value=value;context.record={title:'Trial',abstract:'Children only.'};
 assert.equal(vm.runInContext('pilotDecision(value,record).decision',context),'no');
 context.record.abstract='';assert.equal(vm.runInContext('pilotDecision(value,record).decision',context),'maybe');
 context.record.abstract='Adults only.';assert.equal(vm.runInContext('pilotDecision(value,record).decision',context),'maybe');
 context.record.title='Children only.';context.record.abstract='';assert.equal(vm.runInContext('pilotDecision(value,record).decision',context),'no');
 console.log('PASS: explicit title evidence suffices; absent or unsupported evidence cannot exclude');
})().catch(e=>{console.error(e);process.exitCode=1});
