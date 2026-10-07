// Synthetic completion regression: real orchestration and note rendering, mocked external services.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('search-strategy.html','utf8');
const start=html.slice(html.indexOf('let machineContext=null,mwController=null;'),html.indexOf("$('mw-start').addEventListener"));
const notes=html.slice(html.indexOf('function showConceptNotes('),html.indexOf('function mergeNotes('));
const message=html.match(/const conceptsDoneMessage=.*;/)[0];
const elements=new Map(),note={hidden:true,textContent:'',dataset:{}};let errorState=false,saved=0;
const $=id=>{if(!elements.has(id))elements.set(id,{textContent:'',disabled:false,hidden:true,classList:{toggle:(_,v)=>{errorState=v}},focus(){}});return elements.get(id)};
const ctx=vm.createContext({$,lines:v=>String(v||'').split('\n').filter(Boolean),busy:false,generating:false,state:{machineInput:'',queries:{},concepts:[{id:'synthetic-selected',keywords:'synthetic seed'}]},machineWordCriteria:()=>[{eligibilityRule:'Synthetic PIS criteria'}],AbortController,setTimeout,clearTimeout,addCriteriaConcepts:()=>3,saveDraft:()=>saved++,renderConcepts(){},renderStrategies(){},renderMachineWords(){},fillConceptWords:async()=>({filled:3}),enrichFilled:async()=>new Map([['p','Synthetic verification note'],['missing','Ignored deleted card']]),CSS:{escape:s=>s},document:{querySelector:s=>s.includes('"p"')?note:null},isUnreachable:()=>false});
vm.runInContext(notes+message+start,ctx);
(async()=>{await ctx.startMachineWords();assert.equal(errorState,false);assert.equal(note.textContent,'Synthetic verification note');assert.equal(note.hidden,true);assert.match($('mw-status').textContent,/Search words filled in for 3 concepts/);assert.equal($('mw-start').textContent,'Generate');assert.equal($('mw-start').disabled,false);assert(saved>0);
ctx.enrichFilled=async()=>new Map([['p','Not checked against NLM/PubMed (synthetic offline).']]);await ctx.startMachineWords();assert.equal(errorState,false);assert.match(note.textContent,/Not checked/);console.log('PASS: machine generation completion, verification notes, missing cards and button reset');})().catch(e=>{console.error(e);process.exitCode=1});
