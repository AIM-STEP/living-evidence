const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../full-text-screening.html'),'utf8');
const elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,style:{},dataset:{},handlers:{},parentElement:{classList:{toggle(){}}},classList:{toggle(){}},setAttribute(){},querySelector(){return {textContent:''}},querySelectorAll(){return []},closest(){return {classList:{toggle(){}}}},addEventListener(k,fn){this.handlers[k]=fn},replaceChildren(){},showModal(){},close(){},checkValidity(){return true}});return elements.get(id);}
const sandbox={console:{...console,error(e){throw e;}},URL,URLSearchParams,AbortController,DOMException,structuredClone,TextEncoder,Blob,Map,Set,performance,
 setTimeout(){return 1},clearTimeout(){},localStorage:{getItem(){return null},setItem(){}},navigator:{},location:{href:'http://127.0.0.1:8765/full-text-screening.html',search:'',hostname:'127.0.0.1'},document:{addEventListener(){},getElementById:el,querySelectorAll(){return []},body:{dataset:{}}},window:{addEventListener(){}},confirm(){return true},AimstepCalibration:require('../app/screening-calibration.js')};
let code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes('const FT_PROMPT'));
code=code.replace(/\ninit\(\);/,`\nglobalThis.ft={set(w){workspace=w;indexRecords();},get(){return workspace},defaults,newPilot,newFull,ftDecision,aiPair,finalOf,needsCheck,approvalsValid,currentCalibration,ftPrompt,evidenceChunks,chunkParagraphs,pilotDecide,approvePilot,readReport,saveCriteria,archiveRun,checkCalibration,setHuman,exportResults,render,renderPilot,renderFull,summary,importFromScreening,clearSource,restoreSource,bindHandoff(h){readHandoff=async()=>h;},setBusy(v){busy=v;},\n stub(){save=async()=>{};render=()=>{};log=()=>{};showNotice=()=>{};toast=()=>{};},setDoc(id,d){docCache.set(id,d)},setReason(id,s){reasonDrafts.set(id,s)},view(i){pilotView=i},bindModel(fn){pilotModelJSON=fn;resolvePilotModel=async()=>({name:'test',provider:'backend'});evidenceFor=async id=>docCache.get(id)},downloads(fn){download=fn}};`);
vm.runInNewContext(code,sandbox);const ft=sandbox.ft;ft.stub();
const rec={uid:'r',title:'Example report',abstract:'Participants received treatment.',authors:['Reviewer'],doi:'10.1234/test'};
const doc={fullText:'All participants were children. The design was randomized.',chunks:[{id:'C1',text:'All participants were children.',section:'Methods',page:2},{id:'C2',text:'The design was randomized.',section:'Methods',page:3}],evidence:{method:'test',byCriterion:{Population:[{id:'C1',score:-1}],Design:[{id:'C2',score:1}]}}};
function setup(){const w=ft.defaults();w.records=[rec];w.criteria={rows:[{title:'Population',condition:'Adults'},{title:'Design',condition:'Randomized trials'}]};w.criteriaSig='criteria';w.docs.r={kind:'pdf',hash:'doc'};ft.set(w);ft.setDoc('r',doc);return w;}
function value(criteria){return ft.ftDecision({criteria},doc)}
const unmet={dimension:'Population',judgment:'not met',passage:'C1',quote:'All participants were children.'};
let w=setup();ft.render();assert.equal(value([unmet]).decision,'exclude');assert.equal(value([{...unmet,passage:'C2'}]).decision,'unclear');assert.equal(value([{...unmet,quote:'Invented'}]).decision,'unclear');assert.equal(value([{...unmet,dimension:'Invented'}]).decision,'unclear');assert.equal(value([unmet,{...unmet,judgment:'met'}]).decision,'unclear');
const result=(criteria)=>({...value(criteria),criteriaSig:'criteria',documentHash:'doc',calibrationHash:'hash',prompt:'fulltext-v2-calibrated'});
w.pilot.approved={calibration:{hash:'hash'}};w.full.ai.r=result([unmet]);w.full.ai2.r=result([{dimension:'Population',judgment:'unclear'}]);assert.equal(ft.aiPair('r'),'exclude');assert.equal(ft.needsCheck('r'),false);assert.match(ft.finalOf('r').reason,/children/);
w.full.ai2.r=result([{dimension:'Population',judgment:'met'}]);assert.equal(ft.aiPair('r'),'conflict');assert.equal(ft.needsCheck('r'),true);assert.equal(ft.finalOf('r').decision,'');
w.full.ai2.r=result([{dimension:'Population',judgment:'unclear'}]);w.full.check='all';assert.equal(ft.needsCheck('r'),true);w.full.check='sample';assert.equal(ft.needsCheck('r'),true);w.full.check='unresolved';
w.full.human.r={decision:'include'};assert.equal(ft.finalOf('r').decision,'include');delete w.full.human.r;
w.docs.r.hash='changed';assert.equal(ft.aiPair('r'),'');w.docs.r.hash='doc';
// All export formats retain the actual exclusion reason.
let downloads=[];ft.downloads((name,type,data)=>downloads.push({name,data}));el('export-option').value='exclude';for(const fmt of ['csv','ris','revman','bib','json']){el('export-format').value=fmt;ft.exportResults();}assert.equal(downloads.length,5);for(const d of downloads)assert.match(d.data,/All participants were children/);
// Full-text quote calibration validates full text, not just abstract.
w=setup();w.pilot.rounds=[{ids:['r'],criteriaSig:'criteria',revealedAt:'done',prompt:'fulltext-v2-calibrated'}];w.pilot.ai.r={...result([unmet]),round:0,model:'test'};w.pilot.human.r={decision:'include',calibrationCriterion:'Population',note:'Apply the prespecified exception.',calibrationQuote:'The design was randomized.'};let c=ft.currentCalibration();assert.equal(c.pending.length,0);assert.equal(c.lessons.length,1);assert.match(c.lessons[0].fullTextExcerpt,/children/);ft.view(0);
(async()=>{
 await ft.approvePilot();assert.equal(ft.approvalsValid(),true);const approvedHash=w.pilot.approved.calibration.hash;
 let sent;ft.bindModel(async messages=>{sent=JSON.parse(messages[1].content);return {value:{criteria:[unmet]},model:'test'}});
 const read=await ft.readReport('r',1,new AbortController().signal,1,w.pilot.approved.calibration);assert.equal(sent.stage,'fulltext');assert.equal(sent.passages[0].id,'C1');assert.equal(sent.reviewerCalibration.hash,approvedHash);assert.equal(read.calibrationHash,approvedHash);assert.equal(read.decision,'exclude');
 w.pilot.human.r.note+=' Clarified.';assert.equal(ft.approvalsValid(),false);
 w.full.ai.r={decision:'exclude',calibrationHash:approvedHash};await ft.approvePilot();assert.equal(w.modelArchives.length,1);assert.equal(Object.keys(w.full.ai).length,0);
 const pageChunks=ft.chunkParagraphs([{text:'First page sentence with sufficient original text.',section:'Methods',page:1},{text:'Second page sentence with different original text.',section:'Methods',page:2}]);assert.equal(pageChunks.length,2);assert(!pageChunks[0].text.includes('Second'));assert.equal(pageChunks[1].page,2);
 const original=JSON.stringify(w.pilot.ai);await ft.checkCalibration();assert.equal(JSON.stringify(w.pilot.ai),original);assert.equal(w.pilot.calibrationCheck.completed,true);
 ft.setHuman(w.pilot.human,'r',{decision:'unclear'});assert.equal(w.pilot.human.r.calibrationCriterion,'Population');
 // Unexplained human exclusions are rejected.
 w.pilot.human={};ft.pilotDecide('r','exclude');assert.equal(w.pilot.human.r,undefined);ft.setReason('pvote|r','Population: children');ft.pilotDecide('r','exclude');assert.equal(w.pilot.human.r.reason,'Population: children');
 // Bounds and opposing evidence selection for long reports.
 const many={chunks:Array.from({length:200},(_,i)=>({id:'C'+i,text:'x'.repeat(2000)})),evidence:{byCriterion:{Population:Array.from({length:8},(_,i)=>({id:'C'+i}))}}};assert(ft.evidenceChunks(many).some(c=>c.id==='C7'));assert(ft.evidenceChunks(many).reduce((n,c)=>n+c.text.length,0)<=42000);
 const long='x'.repeat(5000)+' final token here.';const chunks=ft.chunkParagraphs([{text:long,section:'Methods',page:1}]);assert(chunks.some(c=>c.text.includes('final token')));
 const archives=w.modelArchives.length;el('crit-question').value='Edited question';el('crit-rows').querySelectorAll=()=>[{querySelector(sel){return {value:({'.crit-title':'Population','.crit-condition':'Adults aged 18 or older','.crit-uncertain':'Children','.crit-definition':''})[sel]}}}];await ft.saveCriteria();assert.equal(w.criteriaEdited,true);assert.equal(w.pilot.rounds.length,0);assert.equal(w.criteria.rows[0].condition,'Adults aged 18 or older');assert.equal(w.modelArchives.length,archives+1);assert.equal(w.docs.r.kind,'pdf');
 // Auto handoff: additions preserve valid work, removal/metadata changes invalidate it.
 w=setup();let incoming={criteria:w.criteria,criteriaSig:'criteria',records:[rec,{...rec,uid:'r2'}],updatedAt:'now'};
 ft.bindHandoff(incoming);await ft.importFromScreening();assert.equal(w.records.length,2);
 w.full.human.r={decision:'include'};await ft.importFromScreening();assert.equal(w.full.human.r.decision,'include');
 await ft.clearSource();assert.equal(w.records.length,0);assert.equal(w.sourceCleared,true);assert.equal(incoming.records.length,2);assert.equal(w.docs.r.kind,'pdf');assert.equal(w.modelArchives.at(-1).records.length,2);
 await ft.importFromScreening();assert.equal(w.records.length,0);
 w=structuredClone(w);ft.set(w);await ft.importFromScreening();assert.equal(w.records.length,0,'Clear persists across reload');
 await ft.restoreSource();assert.equal(w.records.length,2);assert.equal(w.sourceCleared,false);assert.equal(Object.keys(w.full.human).length,0);
 w.criteriaEdited=true;w.criteria={rows:[{title:'Population',condition:'Local custom rule'}]};w.criteriaSig='custom';
 incoming={...incoming,criteriaSig:'new-upstream',records:[{...rec,title:'Updated title'}]};ft.bindHandoff(incoming);await ft.importFromScreening();assert.equal(w.criteriaSig,'custom');assert.equal(w.records[0].title,'Updated title');
 ft.bindHandoff({...incoming,records:[]});ft.setBusy('full');await ft.importFromScreening();assert.equal(w.records.length,1);ft.setBusy('');await ft.importFromScreening();assert.equal(w.records.length,0,'Empty upstream results remove old records');
 assert(!html.includes('id="import-ta"'));
 const known=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));for(const id of elements.keys())assert(known.has(id),'Missing UI element: '+id);
 console.log('PASS: full-text startup bindings, evidence validation, criterion conflicts, review scopes, five exports, calibration, snapshots, model requests, reason gating and bounded retrieval');
})().catch(e=>{console.error(e);process.exitCode=1});
