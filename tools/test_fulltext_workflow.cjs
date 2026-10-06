const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../full-text-screening.html'),'utf8');
const elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,style:{},dataset:{},handlers:{},parentElement:{classList:{toggle(){}}},classList:{toggle(){}},setAttribute(){},removeAttribute(name){delete this[name]},querySelector(){return {textContent:''}},querySelectorAll(){return []},closest(){return {classList:{toggle(){}}}},addEventListener(k,fn){this.handlers[k]=fn},replaceChildren(){},showModal(){},close(){},checkValidity(){return true}});return elements.get(id);}
const sandbox={console:{...console,error(e){throw e;}},URL,URLSearchParams,AbortController,DOMException,structuredClone,TextEncoder,Blob,Map,Set,performance,
 setTimeout(){return 1},clearTimeout(){},localStorage:{getItem(){return null},setItem(){}},navigator:{},location:{href:'http://127.0.0.1:8765/full-text-screening.html',search:'',hostname:'127.0.0.1'},document:{addEventListener(){},getElementById:el,querySelectorAll(){return []},body:{dataset:{}}},window:{addEventListener(){}},confirm(){return true},AimstepCalibration:require('../app/screening-calibration.js')};
let code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes('const FT_PROMPT'));
code=code.replace(/\ninit\(\);/,`\nglobalThis.ft={set(w){workspace=w;indexRecords();},get(){return workspace},defaults,importFile,mergeLocalRecords,openFulltextManager,closeFulltextManager,saveManagedLink,uploadManagedPdf,removeManagedItem,manageOperation,safeFulltextLink,realStoreText:storeText,bindManagerStorage(){storeText=this.realStoreText;loadDoc=async id=>docCache.get(id)||null;saveDoc=async d=>docCache.set(d.uid,d);deleteKey=async()=>{};},bindPdf(fn){pdfPages=fn;},manager(){return {id:manageId,busy,working:manageWorking}},bindSave(fn){save=fn},newPilot,newFull,ftDecision,aiPair,finalOf,needsCheck,approvalsValid,currentCalibration,ftPrompt,evidenceChunks,chunkParagraphs,pilotDecide,approvePilot,readReport,saveCriteria,archiveRun,checkCalibration,setHuman,exportResults,render,renderPilot,renderFull,summary,openReader,releaseReaderPdf,fulltextPrimaryBadge,sourceRecordCard,sourceDetailsOpen,findOpenAccess,retrieveReadable,retrievalDue,importFromScreening,clearSource,restoreSource,bindRetrieval(fn){findTypesafeBackend=async()=>'/backend';retrieveReadable=fn;storeText=async(id,got)=>{workspace.docs[id]={kind:got.kind,source:got.source};};},bindHandoff(h){readHandoff=async()=>h;},setBusy(v){busy=v;},\n stub(){save=async()=>{};render=()=>{};log=()=>{};showNotice=()=>{};toast=()=>{};},setDoc(id,d){docCache.set(id,d)},setReason(id,s){reasonDrafts.set(id,s)},view(i){pilotView=i},bindModel(fn){pilotModelJSON=fn;resolvePilotModel=async()=>({name:'test',provider:'backend'});evidenceFor=async id=>docCache.get(id)},downloads(fn){download=fn}};`);
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
 // Background retrieval runs without a manual button, skips existing files and backs off failures.
 w=setup();w.docs={};ft.set(w);let lookups=0;
 ft.bindRetrieval(async()=>{lookups++;return {got:{kind:'xml',source:'Synthetic OA'},attempts:[]};});
 await ft.findOpenAccess();assert.equal(lookups,1);assert.equal(w.docs.r.kind,'xml');await ft.findOpenAccess();assert.equal(lookups,1);
 w.docs={};ft.bindRetrieval(async()=>{lookups++;return {got:null,attempts:[{source:'OA',status:'unavailable'}]};});
 await ft.findOpenAccess();assert.equal(w.docs.r.kind,'none');assert(Date.parse(w.docs.r.retryAt)>Date.now());const failedCount=lookups;await ft.findOpenAccess();assert.equal(lookups,failedCount);
 w.docs.r.retryAt=new Date(0).toISOString();await ft.findOpenAccess();assert.equal(lookups,failedCount+1);
 w.docs={};ft.setBusy('full');await ft.findOpenAccess();assert.equal(lookups,failedCount+1);ft.setBusy('');
 let release;ft.bindRetrieval(()=>new Promise(resolve=>{release=resolve;}));const pending=ft.findOpenAccess();await Promise.resolve();await Promise.resolve();
 await ft.clearSource();release({got:{kind:'pdf',source:'Synthetic'},attempts:[]});await pending;assert.equal(w.records.length,0);assert.equal(w.docs.r,undefined,'Cancelled download must not revive cleared results');
 assert(!html.includes('id="find-oa"'));assert(!html.includes('id="stop-find"'));
 const cardRecord={...rec,title:'A complete title <with markup>',authors:['First Author','Second Author'],journal:'Example Journal',year:'2024',volume:'12',issue:'3',pages:'45–51',abstract:'Abstract <content>'};
 let card=ft.sourceRecordCard(cardRecord,30);assert(card.includes('#31'));assert(card.includes('A complete title &lt;with markup&gt;'));assert(card.includes('First Author, Second Author'));assert(card.includes('12(3): 45–51'));assert(card.includes('aria-expanded="false"'));assert(card.includes('Abstract &lt;content&gt;'));
 ft.sourceDetailsOpen.add('r|abstract');card=ft.sourceRecordCard(cardRecord,30);assert(card.includes('aria-expanded="true" aria-controls="source-abstract-30"'));assert(card.includes('id="source-abstract-30" aria-label="Abstract">'));assert(!html.includes('<tbody id="doc-rows">'));

 assert.equal(ft.fulltextPrimaryBadge([{kind:'xml'},{kind:'pdf'}]),'');
 assert.equal(ft.fulltextPrimaryBadge([{kind:'pdf'}]),'');
 assert(ft.fulltextPrimaryBadge([{kind:'pdf'},{kind:'pdf'}]).includes('Primary'));
 // Full-text links use real source metadata and reject executable URL schemes.
 w=setup();w.docs.r={kind:'pdf',source:'Synthetic repository',url:'https://example.org/synthetic-report.pdf'};
 card=ft.sourceRecordCard(rec,0);assert(card.includes('data-read="r" aria-haspopup="dialog" aria-controls="reader-dialog"'));assert(card.includes('synthetic-report.pdf'));assert(card.includes('Full text retrieved from Synthetic repository'));assert(!card.includes('>Primary</span>'));assert(card.includes('data-manage="r" aria-haspopup="dialog" aria-controls="manage-dialog"'));
 w.docs.r.url='javascript:alert(1)';card=ft.sourceRecordCard(rec,0);assert(!card.includes('javascript:'));assert(card.includes('class="source-file-link" type="button" data-read="r"'));
 w.docs={};card=ft.sourceRecordCard(rec,0);assert(!card.includes('>Primary</span>'));assert(card.includes('No full text available yet.'));
 // Uploaded names are shown verbatim; legacy File names are recovered from saved content.
 w=setup();w.docs.r={kind:'pdf',filename:'Original full title 2026.pdf'};assert(ft.sourceRecordCard(rec,0).includes('Original full title 2026.pdf'));
 delete w.docs.r.filename;ft.setDoc('r',{...doc,pdf:{name:'Legacy original name.pdf'}});assert(ft.sourceRecordCard(rec,0).includes('Legacy original name.pdf'));
 w.docs.r={kind:'xml'};ft.setDoc('r',{...doc,pdf:null});card=ft.sourceRecordCard(rec,0);assert(!card.includes('Full text (XML)'));assert(card.includes('aria-controls="reader-dialog">Full text</button>'));
 // The entire import dialog and parser block match the preceding page.
 const ta=fs.readFileSync(require('node:path').join(__dirname,'../title-abstract-screening.html'),'utf8');
 const between=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
 assert.equal(between(html,'<dialog id="import-dialog"','</dialog>'),between(ta,'<dialog id="import-dialog"','</dialog>'));
 assert.equal(between(html,'function csvRows(','// Keep local records').trim(),between(ta,'function csvRows(','async function importFile(').trim());
 assert(html.indexOf('id="open-import"')<html.indexOf('id="clear-source"'));
 const file=(name,contents)=>({name,size:contents.length,text:async()=>contents});
 const fixtures=[['ris','TY  - JOUR\nTI  - Synthetic RIS\nAB  - Synthetic abstract\nER  -'],['nbib','PMID- 123456\nTI  - Synthetic NBIB\nAB  - Synthetic abstract\n'],['csv','Title,Abstract,DOI\n"Synthetic, CSV","Two lines\nof abstract",10.1234/csv'],['tsv','Title\tAbstract\nSynthetic TSV\tSynthetic abstract'],['json',JSON.stringify({source:{records:[{title:'Synthetic JSON',abstract:'Synthetic abstract'}]}})],['txt','%0 Journal Article\n%T Synthetic EndNote\n%X Synthetic abstract\n'],['ciw','FN Clarivate\nPT J\nTI Synthetic WoS\nAB Synthetic abstract\nER\nEF']];
 for(const [ext,contents] of fixtures){w=ft.defaults();ft.set(w);const run=await ft.importFile(file('synthetic.'+ext,contents),'Synthetic source');assert.equal(run.added,1,ext);assert(w.records[0].abstract,ext);assert.equal(w.imports[0].records[0].provenance[0].db,'Synthetic source');}
 w=setup();const prior=w.records.length;
 await assert.rejects(ft.importFile(file('invalid.csv','Title\n"Unclosed'),'Synthetic'),/unclosed/);
 await assert.rejects(ft.importFile({name:'big.ris',size:81*1024*1024},'Synthetic'),/80 MB/);
 await assert.rejects(ft.importFile(file('empty.json','[]'),'Synthetic'),/No bibliographic/);
 assert.equal(w.records.length,prior);
 const local=file('synthetic.json',JSON.stringify([{title:'Duplicate',doi:'https://doi.org/10.1234/test'},{title:'Synthetic local',doi:'10.1234/local',abstract:'Synthetic abstract'}]));
 w.full.human.r={decision:'include'};let run=await ft.importFile(local,'Synthetic');assert.equal(run.added,1);assert.equal(w.full.human.r.decision,'include');
 const localId=w.records[1].uid;assert.equal((await ft.importFile(local,'Synthetic')).added,0);
 w=structuredClone(w);ft.set(w);ft.bindHandoff({records:[rec],criteria:w.criteria,criteriaSig:w.criteriaSig,updatedAt:'import-test'});await ft.importFromScreening();assert.equal(w.records.length,2);assert.equal(w.records[1].uid,localId);
 ft.bindHandoff({records:[],criteria:w.criteria,criteriaSig:w.criteriaSig,updatedAt:'empty-test'});await ft.importFromScreening();assert.equal(w.records.length,2,'Local imports remain when upstream is empty');assert(w.records.some(r=>r.uid===localId));
 await ft.clearSource();assert.equal(w.imports.length,0);assert.equal(w.records.length,0);
 await ft.importFile(file('after-clear.json',JSON.stringify([{title:'Synthetic after clear',doi:'10.1234/after'}])),'Synthetic');assert.equal(w.sourceCleared,true);
 await ft.importFromScreening();assert.equal(w.records.length,1,'Import does not restore cleared upstream');
 let retrieved=0;ft.bindRetrieval(async()=>{retrieved++;return {got:{kind:'xml',source:'Synthetic'},attempts:[]}});await ft.findOpenAccess();assert.equal(retrieved,1,'Locally imported records retrieve even after Clear');
 const beforeFailure=JSON.stringify(w);ft.bindSave(async()=>{throw Error('Synthetic storage failure')});
 await assert.rejects(ft.importFile(file('failed.json','[{"title":"Synthetic failure"}]'),'Synthetic'),/storage failure/);assert.equal(JSON.stringify(ft.get()),beforeFailure,'Failed saves roll back the import');ft.bindSave(async()=>{});


 // The manager locks background work, persists one safe link without making it AI evidence,
 // validates matching PDFs, and archives replaced/removed screening decisions.
 ft.bindManagerStorage();w=setup();ft.setDoc('r',{...doc,uid:'r'});ft.openFulltextManager('r');assert.equal(ft.manager().busy,'manage');
 assert.equal(el('manage-report').textContent,rec.title);
 await ft.saveManagedLink('https://example.org/first');await ft.saveManagedLink('https://example.org/second');assert.equal(Object.keys(w.fulltextLinks).length,1);assert.equal(w.fulltextLinks.r.url,'https://example.org/second');
 await assert.rejects(ft.saveManagedLink('javascript:alert(1)'),/valid/);assert.equal(ft.safeFulltextLink('https://user:password@example.org'), '');
 const syntheticPdf=new Blob(['%PDF-1.7 synthetic test fixture'],{type:'application/pdf'});syntheticPdf.name='synthetic.pdf';
 await assert.rejects(ft.uploadManagedPdf(new Blob(['not a PDF'])),/valid PDF/);
 await assert.rejects(ft.uploadManagedPdf({size:41*1024*1024}),/40 MB/);
 ft.bindPdf(async()=>[{page:1,text:'Completely unrelated synthetic report'}]);await assert.rejects(ft.uploadManagedPdf(syntheticPdf),/does not match/);
 ft.bindPdf(async()=>[{page:1,text:'10.1234/test'}]);await assert.rejects(ft.uploadManagedPdf(syntheticPdf),/too little readable/);
 const pages=[1,2,3].map(page=>({page,text:'Synthetic report DOI: 10.1234/test. These are synthetic full text sentences for testing document replacement. Each page contains readable text with more than five words.'}));
 ft.bindPdf(async()=>pages);w.full.human.r={decision:'include'};await ft.uploadManagedPdf(syntheticPdf);assert.equal(w.docs.r.filename,'synthetic.pdf');assert.equal(w.docs.r.source,'Uploaded locally');assert(!w.full.human.r);assert(w.modelArchives.length);
 const beforeUploadFailure=JSON.stringify(w);ft.bindSave(async()=>{throw Error('Synthetic quota exceeded')});await assert.rejects(ft.uploadManagedPdf(syntheticPdf),/quota/);assert.equal(JSON.stringify(ft.get()),beforeUploadFailure);ft.bindSave(async()=>{});w=ft.get();
 await ft.removeManagedItem('file');assert.equal(w.docs.r.kind,'none');assert.equal(w.fulltextLinks.r.url,'https://example.org/second');assert.equal(ft.summary().retrieved,0,'A link alone is not readable evidence');
 await ft.removeManagedItem('link');assert(!w.fulltextLinks.r);ft.closeFulltextManager();assert.equal(ft.manager().busy,'');assert.equal(ft.manager().id,'');

 // Saved original PDF bytes are embedded, while XML stays clearly labelled as extracted text.
 await Promise.resolve();await Promise.resolve();
 w=setup();ft.bindManagerStorage();const originalPdf=new Blob(['%PDF-1.7 synthetic original bytes'],{type:'application/pdf'});
 ft.setDoc('r',{...doc,uid:'r',kind:'pdf',pdf:originalPdf});await ft.openReader('r');
 assert.equal(el('reader-original').hidden,false);assert.equal(el('reader-body').hidden,true);assert.match(el('reader-original').src,/^blob:/);assert.equal(el('reader-original').src,el('reader-pdf').href);
 assert.equal(await (await fetch(el('reader-original').src)).text(),await originalPdf.text(),'Viewer must use the original PDF bytes');
 const oldPdfUrl=el('reader-original').src;ft.setDoc('r',{...doc,uid:'r',kind:'xml',pdf:null});await ft.openReader('r');
 assert.equal(el('reader-original').hidden,true);assert.equal(el('reader-body').hidden,false);assert.match(el('reader-meta').textContent,/Only XML full text is saved/);assert(el('reader-body').innerHTML.includes('All participants were children'));
 await assert.rejects(fetch(oldPdfUrl));ft.releaseReaderPdf();

 const known=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));for(const id of elements.keys())assert(known.has(id),'Missing UI element: '+id);
 console.log('PASS: full-text startup bindings, evidence validation, criterion conflicts, review scopes, five exports, calibration, snapshots, model requests, reason gating and bounded retrieval');
})().catch(e=>{console.error(e);process.exitCode=1});
