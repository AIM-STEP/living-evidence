'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../app/screening-dedup.js'),E=require('../app/screening-dedup-export.js'),R=require('../app/extraction-results.js');
const abstract='This randomized clinical trial compared exercise therapy with usual care in adult patients with chronic pain. Participants attended supervised sessions and completed standardized assessments of physical function and quality of life at baseline and after treatment.';
const rec=(uid,change={})=>({uid,title:'Exercise therapy for chronic pain',abstract,authors:['Smith J','Jones K'],year:'2024',journal:'Pain Research',volume:'12',issue:'3',pages:'100-110',doi:'',pmid:'',url:'',provenance:[{db:uid,runId:uid}],...change});
const batch=(records,key='local:one',at='2026-01-01')=>({key,at,records});
const run=records=>D.run([batch(records)]);
let count=0;function test(name,fn){fn();count++;console.log('PASS: '+name);}
test('identifier normalization and missing fields provide no positive evidence',()=>{
 assert.equal(D.doi(' DOI: https://doi.org/10.1000/Ab%28Cd%29 '),'10.1000/ab(cd)');
 assert.equal(D.doi('not-a-doi'),'');assert.equal(D.pmid('000123'),'123');assert.equal(D.pmid('unknown'),'');
 const a=rec('a',{abstract:'',volume:'',issue:'',pages:'',authors:[]});
 assert.equal(D.compare(D.fields(a),D.fields(a)).status,'possible');
});
test('same valid identifiers merge and preserve every source',()=>{
 const a=rec('a',{doi:'https://doi.org/10.1000/ABC'}),b=rec('b',{doi:'10.1000/abc'}),input=[a,b],before=JSON.stringify(input),d=run(input);
 assert.equal(d.records.length,1);assert.equal(d.groups[0].members.length,2);assert.equal(d.records[0].provenance.length,2);assert.equal(JSON.stringify(input),before);
 assert.equal(d.groups[0].merges[0].reason,'exact-doi');
 assert.equal(run([rec('a',{pmid:'123'}),rec('b',{pmid:'123'})]).records.length,1);
});
test('different DOI and PMID values cannot auto-merge despite identical text',()=>{
 for(const records of [[rec('a',{doi:'10.1000/a'}),rec('b',{doi:'10.2000/b'})],[rec('a',{pmid:'123'}),rec('b',{pmid:'456'})],[rec('a',{pmid:'123',doi:'10.1000/a'}),rec('b',{pmid:'123',doi:'10.1000/b'})]]){
  const d=run(records);assert.equal(d.records.length,2);assert.equal(d.pairs.length,1);
 }
});
test('similar numbered reports and report types remain separate',()=>{
 for(const titles of [['Exercise therapy for chronic pain: trial 1','Exercise therapy for chronic pain: trial 2'],['Exercise therapy for chronic pain','Exercise therapy for chronic pain: protocol']]){
 const d=run(titles.map((title,i)=>rec(String(i),{title,abstract:'',volume:'',issue:'',pages:''})));assert.equal(d.records.length,2);assert.equal(d.pairs.length,1);
 }
});
test('near titles require real publication details; exact titles can use full abstract',()=>{
 assert.equal(run([rec('a'),rec('b',{title:'Exercise therapy for chronic pain.'})]).records.length,1);
 assert.equal(run([rec('a',{volume:'',pages:'',abstract:''}),rec('b',{volume:'',pages:'',abstract:''})]).records.length,2);
 assert.equal(run([rec('a',{volume:'',pages:''}),rec('b',{volume:'',pages:''})]).records.length,1);
});
test('full abstracts, not just a shared 500-character prefix, are compared',()=>{
 const prefix='shared background information '.repeat(30),a=rec('a',{volume:'',pages:'',abstract:prefix+abstract}),b=rec('b',{volume:'',pages:'',abstract:prefix+'Different population neonatal surgery mortality ventilation intensive care hospital admission antibiotics sepsis outcomes survival infection.'});
 const d=run([a,b]);assert.equal(d.records.length,2);assert.equal(d.pairs.length,1);
});
test('all originals remain indexed after enrichment; conflicts cannot bridge through missing DOI',()=>{
 const d=run([rec('a'),rec('b',{doi:'10.1000/a'}),rec('c',{doi:'10.1000/b'})]);
 assert.equal(d.records.length,2);assert(d.pairs.length);assert(d.groups.every(g=>new Set(g.members.map(m=>D.doi(m.record.doi)).filter(Boolean)).size<=1));
 const indexed=run([rec('a'),rec('b',{doi:'10.1000/a'}),rec('c',{doi:'10.1000/a',title:'An alternative imported title'})]);
 assert(indexed.groups.some(g=>g.members.some(m=>m.record.uid==='b')&&g.members.some(m=>m.record.uid==='c')));
});
test('longer abstract and field sources retained; batch order is deterministic',()=>{
 const a=batch([rec('a',{doi:'10.1000/a',abstract:'Short abstract'})],'search:a','2026-01-01'),b=batch([rec('b',{doi:'10.1000/a'})],'local:b','2026-01-02');
 const d=D.run([a,b]),reordered=D.run([b,a]);assert.deepEqual(d,reordered);assert.equal(d.records[0].abstract,abstract);
 assert.equal(d.groups[0].members.find(m=>m.memberId===d.groups[0].fieldSources.abstract).record.uid,'b');assert.equal(d.stats.get('local:b').duplicates,1);
});
test('possible duplicates always remain separate, including legacy reviewer choices',()=>{
 const batches=[batch([rec('a',{doi:'10.1000/a'}),rec('b',{doi:'10.1000/b'})])],d=D.run(batches),key=d.pairs[0].key;
 for(const action of ['merge','separate'])assert.deepEqual(D.run(batches,{decisions:{[key]:{action,at:'old'}}}),d);
 assert.equal(d.records.length,2);assert.equal(d.policy,'retain-possible');assert.equal(d.pairs.length,1);
 const definite=[batch([rec('a'),rec('b')])],g=D.run(definite).groups[0],oldKey=D.pairKey(g.members[0].memberId,g.members[1].memberId);
 assert.equal(D.run(definite,{decisions:{[oldKey]:{action:'separate'}}}).records.length,1);
});
test('same UID never overwrites distinct reports; invalid identifiers never cause exact match',()=>{
 const d=run([rec('same',{title:'Different report alpha',doi:'bad'}),rec('same',{title:'Different report beta',doi:'bad'})]);assert.equal(d.records.length,2);assert.equal(new Set(d.records.map(r=>r.uid)).size,2);
});
// Real page functions with controlled storage/DOM, no network or real project data.
const html=fs.readFileSync(require('node:path').join(__dirname,'../title-abstract-screening.html'),'utf8');
function slice(a,b){const i=html.indexOf(a);assert(i>=0,a);const j=html.indexOf(b,i);assert(j>i,b);return html.slice(i,j);}
const elements={};const $=id=>elements[id]??={value:'json',events:{},addEventListener(e,fn){this.events[e]=fn}};
const initial=run([rec('a',{doi:'10.1000/a'}),rec('b',{doi:'10.1000/b'}),rec('c',{doi:'10.1000/c'})]);let savesFail=false,progress=true;
const context=vm.createContext({AimstepDedup:D,AimstepDedupExport:E,AimstepExtractionResults:R,structuredClone,Map,Set,JSON,Number,$,
 source:{records:initial.records,dedup:initial,sourceSig:'source',criteriaSig:'criteria',criteria:{rows:[{}]}},workspace:{dedupDecisions:{},pilot:{old:'pilot'},full:{old:'full'}},dedupStats:{total:3},recordById:new Map(),
 busy:'',importing:false,pilotReviewSaving:false,fullReviewSaving:false,pilotReviewDrafts:new Map(),exclusionDrafts:new Map(),sourceError:'',databaseNames:{},scope:'synthetic',projectId:'synthetic',
 esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),sourceDatabases:r=>r.provenance.map(p=>p.db),now:()=> 'test',stamp:()=> 'test',
 screeningHasProgress:()=>progress,confirm:()=>true,render(){},publishSummary(){},log(){},toast(){},showNotice(...args){context.notice=args},
 clearCalibration(){context.workspace.pilot={};context.workspace.full={};},save:async()=>{if(savesFail)throw Error('storage failed')},
 loadSource:async()=>{const d=initial;context.source={...context.source,records:d.records,dedup:d,sourceSig:'changed'};},
 download(...args){context.downloaded=args},csvCell:v=>'"'+String(v??'').replaceAll('"','""')+'"',risSafe:v=>String(v).replace(/\s+/g,' ').trim()});
vm.runInContext(slice('// Deduplication is automatic.', 'function renderSource()'),context);
(async()=>{
 const before=JSON.stringify(context.workspace);
 context.renderDedupDetails();assert(elements['dedup-details-body'].innerHTML.includes('proceed to screening automatically'));
 for(const action of ['Same report: merge','keep separate','data-dedup-action','Reset duplicate review'])assert(!elements['dedup-details-body'].innerHTML.includes(action));
 assert(!html.includes('applyDedupReview'));assert(!html.includes('data-dedup-action'));assert(!html.includes('Review duplicates'));
 assert.equal(JSON.stringify(context.workspace),before);assert.equal(context.source.records.length,3);
 // The audit action is in the always-visible source footer, outside collapsed details.
 const footer=html.slice(html.indexOf('<div class="toolbar source-foot">'),html.indexOf('</section>',html.indexOf('<div class="toolbar source-foot">')));
 assert(footer.includes('id="export-dedup-audit"'));assert(footer.includes('export duolications'));
 // Possible-only records do not count as removed duplicates and cannot be exported here.
 assert.equal($('export-dedup-audit').disabled,true);$('export-dedup-audit').events.click();assert.equal(context.downloaded,undefined);
 const live=context.source,merged=D.run([batch([rec('kept',{doi:'10.1000/same'}),rec('removed',{doi:'10.1000/same'}),rec('possible',{doi:'10.1000/other'})])]);
 context.source={...live,records:merged.records,dedup:merged};context.renderDedupDetails();assert.equal($('export-dedup-audit').disabled,false);$('export-dedup-audit').events.click();
 assert.match(context.downloaded[0],/^duplications-.*\.xlsx$/);assert.equal(context.downloaded[1],R.mime);
 assert.equal(context.downloaded[2][0],0x50);assert.equal(context.downloaded[2][1],0x4b);
 const workbook=E.sheets(context.dedupAudit());assert.equal(workbook.length,1);assert.equal(workbook[0].rows.length,2);
 assert.deepEqual(workbook[0].rows[0],['ID号','标题','作者','年份','重复理由']);assert.equal(workbook[0].rows[1][0],'removed');
 const lastDownload=context.downloaded;context.source={records:[]};context.renderDedupDetails();assert.equal($('export-dedup-audit').disabled,true);$('export-dedup-audit').events.click();assert.equal(context.downloaded,lastDownload);context.source=live;
 console.log('PASS: duplicate-only Excel export, five requested columns and disabled empty/possible-only states');count++;
 context.screeningStagesReady=()=>true;context.workspace.pilot={old:'pilot'};context.workspace.full={old:'full'};
 vm.runInContext(slice('async function syncSource()', '// Deduplication is automatic.'),context);
 await context.syncSource();assert.equal(context.workspace.dedupArchives.at(-1).reason,'source-or-deduplication-version-changed');
 const syncBefore=JSON.stringify(context.workspace);context.workspace.sourceSig='older';const changedBefore=JSON.stringify(context.workspace);savesFail=true;await assert.rejects(context.syncSource(),/storage failed/);assert.equal(JSON.stringify(context.workspace),changedBefore);savesFail=false;context.workspace.sourceSig=context.source.sourceSig;
 console.log('PASS: adopting a changed source archives prior screening and rolls back failed saves');count++;

 context.finalDecision=()=> 'no';context.workspace.full={human:{a:{decision:'no'}}};
 vm.runInContext(slice('/* Export the complete source dataset used by Pilot,','// Imports use the same isolated manual editor'),context);
 // Every format must use the same complete record set even after screening decisions exist.
 for(const format of ['json','csv','ris','bib']){$('source-format').value=format;await elements['export-source'].events.click();assert(context.downloaded[0].startsWith('deduplicated-source-records-'));const body=context.downloaded[2];if(format==='json'){const value=JSON.parse(body);assert.equal(value.records.length,3);assert.equal(value.scope,'all-deduplicated');assert(value.deduplication.possiblePairs);}else assert(body.includes('Exercise therapy for chronic pain'));}
 // Pilot samples source.records directly, not a separate/export-filtered array.
 context.workspace.pilot={rounds:[]};context.fingerprint=v=>String(v).split('').reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619)>>>0,2166136261).toString(16);
 vm.runInContext(slice('function pilotSample(', 'async function startPilotRound('),context);assert.equal(context.pilotSample(20,'test').length,3);
 context.stale=()=>false;vm.runInContext(slice('function readySource()', '// Records going forward'),context);assert.equal(context.readySource(),true);
 assert(html.includes('source={records,dedup,runs:'));assert(html.includes('AimstepDedup.run(prepared)'));assert(!html.includes('run(prepared,{decisions:'));
 console.log('PASS: complete JSON/CSV/RIS/BibTeX source export and shared Pilot dataset');count++;
 vm.runInContext(slice('function risRecords(', 'async function importFile('),context);
 const sourceRecord=rec('roundtrip',{pmid:'12345',doi:'10.1000/a'});context.sourceRecord=sourceRecord;
 const ris=context.sourceRIS([sourceRecord]),roundtrip=context.risRecords(ris)[0];
 for(const key of ['title','abstract','volume','issue','pages','doi','pmid'])assert.equal(roundtrip[key],sourceRecord[key]);
 const nbib=context.risRecords('PMID- 12345\nTI  - Trial\nVI  - 12\nIP  - 3\nPG  - 100-110\nDP  - 2024\n',true)[0];assert.equal(nbib.volume,'12');assert.equal(nbib.pages,'100-110');
 console.log('PASS: RIS/NBIB retain publication metadata and source RIS round-trips PMID');count++;
 let earlySaves=0,returnReads=0;
 const searchRecord=rec('search',{doi:'10.1000/shared',provenance:[{db:'pubmed',runId:'s'}]});
 const loading=vm.createContext({AimstepDedup:D,Map,Set,JSON,structuredClone,sourceError:'',source:{},scope:'synthetic',searchRuns:[],searchKey:'search',criteriaOrigin:null,recordById:new Map(),
   workspace:{importedRuns:[{runId:'s',importedAt:'2026-01-01'}],imports:[{id:'l',db:'embase',startedAt:'2026-01-02',records:[rec('local',{doi:'10.1000/shared',provenance:[{db:'embase',runId:'l'}]})]}]},
   localStorage:{getItem:()=>null},openDB:async()=>({close(){}}),getProject:async()=>({runs:[{id:'s',db:'pubmed'}],records:[searchRecord]}),
   text:(v,n)=>String(v??'').slice(0,n),fingerprint:JSON.stringify,now:()=> 'test',row:r=>r,
   eligibilityFallback:()=>({rows:[{title:'Population',condition:'Adults'}]}),validCriteriaUpload:()=>null,
   pendingFulltextReturns:async()=>{returnReads++;return []},prepareFulltextReturns:async()=>{},applyFulltextReturns:async()=>{},assignSourceNumbers:()=>true,save:async()=>{earlySaves++;}
 });
 vm.runInContext(slice('function cleanRecord(', 'function recordKeys(')+slice('async function loadSource(', 'function stale('),loading);
 await loading.loadSource({persist:false,includeReturns:false});assert.equal(earlySaves,0);assert.equal(returnReads,0);assert.equal(loading.source.records.length,1);assert.equal(loading.source.dedup.total,2);assert.equal(loading.source.records[0].provenance.length,2);
 assert.equal(loading.source.records,loading.source.dedup.records);
 console.log('PASS: actual source loader combines search/local imports and defers transactional writes');count++;


 const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());for(const script of scripts)new vm.Script(script);
 console.log('PASS: all page inline scripts parse');count++;
 console.log(`${count} deduplication checks passed.`);
})().catch(e=>{console.error(e);process.exitCode=1});
