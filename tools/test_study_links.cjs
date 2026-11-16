'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),S=require('../app/study-links.js');
const report=(uid,fields={})=>({uid,title:'Exercise treatment for chronic pain results',abstract:'Trial registration: NCT01234567.',authors:['Smith J'],year:'2024',doi:'10.1000/'+uid,...fields});
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS: '+name)};
test('same own-trial registration links distinct reports without deleting records or decisions',()=>{
 const input=[report('a',{decision:'yes'}),report('b',{title:'Long term follow-up of exercise treatment',decision:'maybe'})],original=JSON.stringify(input),r=S.reconcile(input);
 assert.equal(r.records.length,2);assert.equal(r.groups.length,1);assert.equal(r.groups[0].reports.length,2);assert.equal(r.groups[0].studyId,'S-NCT01234567');assert.equal(r.records[0].decision,'yes');assert.equal(JSON.stringify(input),original);
 assert.notEqual(r.records[0].reportId,r.records[1].reportId);assert.equal(r.groups[0].primaryReportId,r.records[0].reportId);
 assert(r.records[0].studyLinkEvidence.every(e=>input[0].abstract.includes(e.quote)));
});
test('incidental registry mentions and metadata similarity remain candidate relationships',()=>{
 const a=report('a'),b=report('b',{abstract:'A previous trial was registered at NCT01234567.'});const r=S.reconcile([a,b]);assert.equal(r.groups.length,2);assert.equal(r.candidates.length,1);assert.notDeepEqual(r.records[0].studyIds,r.records[1].studyIds);
 const r2=S.reconcile([report('x',{abstract:'',studySites:['Example Hospital'],interventions:['Exercise']}),report('y',{abstract:'',studySites:['Example Hospital'],interventions:['Exercise']})]);assert.equal(r2.groups.length,2);assert.equal(r2.candidates[0].reason,'cohort-features');
});
test('one article can link to two studies without collapsing the studies',()=>{
 const r=S.reconcile([report('both',{abstract:'Trial registration: NCT01234567 and NCT87654321.'}),report('one'),report('two',{abstract:'Trial registration: NCT87654321.'})]);assert.equal(r.groups.length,2);assert.equal(r.records[0].studyIds.length,2);assert.equal(r.groups[0].reports.length,2);assert.equal(r.groups[1].reports.length,2);
});
test('explicit follow-up citation links reports; different registrations prevent a bridge',()=>{
 const base=report('main',{abstract:'',doi:'10.1000/main'}),follow=report('follow',{abstract:'This is a secondary analysis of the trial reported in 10.1000/main.'});const r=S.reconcile([base,follow]);assert.equal(r.groups.length,1);assert.equal(r.links.length,1);
 const conflict=S.reconcile([report('a'),report('b',{abstract:'Trial registration: NCT87654321. This is a secondary analysis of the trial reported in 10.1000/a.'})]);assert.equal(conflict.groups.length,2);assert.equal(conflict.candidates[0].reason,'conflicting-registration');
});
test('full text enriches, persists across stages and retracts its evidence when removed',()=>{
 const records=[report('a',{abstract:''}),report('b',{abstract:''})],initial=S.reconcile(records);
 const documents={a:{fullText:'The trial was registered at NCT01234567.',hash:'a'},b:{fullText:'Trial registration: NCT01234567.',hash:'b'}};
 const enriched=S.reconcile(records,initial.memory,documents);assert.equal(enriched.groups.length,1);assert.equal(enriched.records.length,2);
 const revisit=S.reconcile(records,enriched.memory);assert.equal(revisit.groups.length,1);assert.equal(revisit.records[0].reportId,initial.records[0].reportId);
 const removed=S.reconcile(records,revisit.memory,{b:null});assert.equal(removed.groups.length,2);assert.equal(removed.records[1].studyLinkEvidence.length,0);
});
test('structured registration fields survive handoffs and reference-section mentions do not link',()=>{
 const a=report('a',{abstract:'',registryIds:['ISRCTN12345678']}),r=S.reconcile([a]);const handed={...a,...S.metadata(r.records[0])};assert.deepEqual(handed.registryIds,['ISRCTN12345678']);assert.equal(S.reconcile([handed],r.memory).groups[0].studyId,'S-ISRCTN12345678');
 const cited=S.features('Body text.\nReferences\nTrial registration: NCT01234567.','full text');assert.equal(cited.owned.length,0);
 assert.equal(S.features('ClinicalTrials.gov: NCT01234567.','full text').owned[0].id,'NCT01234567');
 assert.equal(S.features('ISRCTN: ISRCTN12345678.','full text').owned[0].id,'ISRCTN12345678');
});
test('study and report identities are stable, escaped and scoped to the active report set',()=>{
 const records=[report('a',{title:'<img src=x onerror=bad> results'}),report('b')],r=S.reconcile(records),again=S.reconcile([...records].reverse(),r.memory);
 assert.equal(r.records[0].reportId,again.records[1].reportId);assert.equal(S.reconcile([records[0]],r.memory).groups[0].reports.length,1);
 const html=S.html(r);assert(!html.includes('<img'));assert(html.includes('&lt;img'));assert(html.includes('screened separately'));
});
const records=S.reconcile([report('a'),report('b')]).records;
const arms=(uid,mean=2,timepoint='12 weeks')=>[{uid,treat:'Exercise',label:'Exercise',mean,sd:1,n:20,timepoint},{uid,treat:'Control',label:'Control',mean:3,sd:1,n:20,timepoint}];
test('identical report data count once and preserve all source report IDs',()=>{const result=S.collate([...arms('a'),...arms('b')],records);assert.equal(result.rows.length,2);assert.equal(result.conflicts.length,0);assert.equal(new Set(result.rows.map(r=>r.study)).size,1);assert(result.rows.every(r=>r.sourceReports.length===2));});
test('conflicting values and different time points require explicit per-outcome sources',()=>{
 for(const rows of [[...arms('a'),...arms('b',4)],[...arms('a'),...arms('b',2,'6 weeks')]]){const r=S.collate(rows,records);assert.equal(r.rows.length,0);assert.equal(r.conflicts.length,1);const selected=S.collate(rows,records,{sources:{[r.choices[0].key]:'b'}});assert.equal(selected.rows.length,2);assert(selected.rows.every(x=>x.uid==='b'&&x.sourceReports[0]==='b'));}
});
test('multi-study reports require a valid result-to-study assignment',()=>{const r=S.reconcile([report('both',{abstract:'Trial registration: NCT01234567 and NCT87654321.'})]);const pending=S.collate(arms('both'),r.records);assert.equal(pending.rows.length,0);const selected=S.collate(arms('both'),r.records,{assignments:{both:'S-NCT01234567'}});assert.equal(selected.rows.length,2);assert(selected.rows.every(x=>x.studyId==='S-NCT01234567'));});
for(const name of ['title-abstract-screening','full-text-screening','extraction','risk-of-bias']){
 const html=fs.readFileSync(name+'.html','utf8');assert(html.includes('app/study-links.js'));assert(html.includes('id="study-links"'));for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(match[1].trim())new vm.Script(match[1]);
}
console.log('PASS: linked source, full-text, risk-of-bias and extraction pages include valid scripts and study-link panels');
console.log(count+' study linkage and evidence-collation checks passed.');
