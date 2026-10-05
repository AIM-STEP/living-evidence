// Synthetic boundary cases for pilot gating, exclusion logic, review scope and all exports.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../title-abstract-screening.html'),'utf8');
let output;
const record={uid:'r1',title:'Synthetic pediatric trial',abstract:'Children only. Drug B only.',authors:['Test Author'],year:'2026',journal:'Synthetic',doi:'',pmid:'',url:''};
const elements={};const $=id=>elements[id]??={value:'',textContent:'',disabled:false};
const ctx=vm.createContext({$,Map,Set,Math,JSON,Array,String,Date,console,
 source:{criteriaSig:'criteria',records:[record],criteria:{rows:[{title:'Population',condition:'Adults',definition:'',uncertain:'Children'},{title:'Intervention',condition:'Drug A'}]}},
 workspace:{pilot:{rounds:[],ai:{},human:{},approved:null},full:{ai:{},ai2:{},human:{},check:'unresolved'}},recordById:new Map([['r1',record]]),
 text:(x,n)=>String(x??'').slice(0,n),esc:x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),excerpt:x=>String(x),
 forward:d=>d==='yes'||d==='maybe',fingerprint:()=> 'abcd',stale:()=>false,screeningProvider:()=> 'local',pilotCriteriaSig:()=> 'sig',currentCalibration:()=>({hash:'feedback'}),calibrationReady:()=>true,
 label:d=>({yes:'Yes',no:'No',maybe:'Maybe'}[d]||''),sourceDatabases:()=>['Synthetic'],projectId:'synthetic-project',now:()=> 'test-time',
 download:(...args)=>{output=args},toast(){},log(){},save:async()=>{},summary:()=>({pending:0})});
function load(from,to){const a=html.indexOf(from),b=html.indexOf(to,a);assert(a>=0&&b>a);vm.runInContext(html.slice(a,b),ctx);}
load('const squash=','async function screenPilotRecord(');
load('const CHECK_SCOPES=','// Share of agreed AI exclusions');
load('function pilotRoundState(','function wilson(');
load('function pilotApprovalValid(','function pilotHasProgress(');
load('const openAbstracts=','function newPilot(');
load('const exclusionDrafts=','function pilotCard(');
load('function stamp(','function csvRows(');
load('function sourceBibTeX(',"$('export-source').addEventListener");
const evaluate=code=>vm.runInContext(code,ctx);
const c=(dimension,judgment,quote='')=>({dimension,judgment,quote,reason:'Synthetic reason'});
const result=(criteria,decision='maybe')=>({criteria,decision,criteriaSig:'criteria',model:'synthetic-model'});
const set=(a,b)=>{ctx.workspace.full.ai={r1:a};ctx.workspace.full.ai2={r1:b};ctx.workspace.full.human={};ctx.workspace.pilot.human={};ctx.workspace.pilot.approved=null;};
// One supported failure beats unknown information on every other criterion.
set(result([c('Population','not met','Children only.'),c('Intervention','unclear')],'no'),result([c('Population','unclear'),c('Intervention','unclear')]));
assert.equal(evaluate("aiPair('r1')"),'no');assert.equal(evaluate('checkIds().length'),0);
assert.match(evaluate("exclusionDetails('r1').reason"),/Population not met.*Adults.*Children only/);
// Direct contradiction on that criterion requires a reviewer.
ctx.workspace.full.ai2.r1=result([c('Population','met'),c('Intervention','unclear')]);
assert.equal(evaluate("aiPair('r1')"),'conflict');assert.equal(evaluate('conflictIds().length'),1);
// A separate, uncontested failed criterion is sufficient despite another disagreement.
ctx.workspace.full.ai.r1.criteria.push(c('Intervention','not met','Drug B only.'));
assert.equal(evaluate("aiPair('r1')"),'no');
// No supporting quote, including missing abstract, is never an inferred exclusion.
set(result([c('Population','not met','Invented quote')],'no'),result([c('Population','unclear')]));
assert.equal(evaluate("aiPair('r1')"),'maybe');assert.equal(evaluate('checkIds().length'),1);
ctx.record=record;ctx.value={criteria:[c('Population','not met','Children only.')],decision:'exclude'};
assert.equal(evaluate('pilotDecision(value,record).decision'),'no');
// New and migrated default review scopes avoid the old mandatory 300 checks.
assert.equal(evaluate('newFull().check'),'unresolved');
ctx.old={version:3,check:'sample'};assert.equal(evaluate('validFull(old).check'),'unresolved');
ctx.old.checkPolicy=2;assert.equal(evaluate('validFull(old).check'),'sample');
// Minimum one complete, compared pilot; starting another round revokes the gate.
ctx.workspace.pilot={rounds:[],ai:{},human:{},approved:null};assert.equal(evaluate('pilotApprovalValid()'),false);
ctx.workspace.pilot={rounds:[{ids:['r1'],revealedAt:'time'}],ai:{r1:{round:0}},human:{r1:{decision:'yes'}},approved:{round:0,criteriaSig:'sig',calibration:{hash:'feedback'}}};
assert.equal(evaluate('pilotApprovalValid()'),true);
ctx.workspace.pilot.rounds.push({ids:['r1']});assert.equal(evaluate('pilotApprovalValid()'),false);
ctx.workspace.pilot.rounds.pop();delete ctx.workspace.pilot.human.r1;assert.equal(evaluate('pilotApprovalValid()'),false);
// Fold controls work even for short abstracts and have distinct accessible IDs.
assert.match(evaluate("abstractBlock('r1','Short abstract',[],true)"),/aria-expanded="false"/);
assert.match(evaluate("abstractBlock('r1','Short abstract',[],true)"),/aria-controls="check-abs-r1"/);
evaluate("openCheckAbstracts.add('r1')");assert.match(evaluate("abstractBlock('r1','Short abstract',[],true)"),/aria-expanded="true"/);
// Explicit reviewer reasons override machine reasons, including contradictory AI.
set(result([c('Population','not met','Children only.')],'no'),result([c('Population','unclear')]));
ctx.workspace.full.human.r1={decision:'no',exclusionReason:'Wrong publication type.'};
assert.equal(evaluate("exclusionDetails('r1').reason"),'Wrong publication type.');
ctx.workspace.full.human={};
// Every result format carries the actionable exclusion reason and original evidence.
$('export-option').value='exclude';
for(const format of ['csv','ris','revman','bib','json']){
 $('export-format').value=format;evaluate('exportResults()');assert(output,format);
 assert.match(output[2],/Population not met/,format);assert.match(output[2],/Children only\./,format);
 if(format==='csv'){assert.match(output[2],/Exclusion reason/);assert.match(output[2],/Exclusion evidence/);}
 if(format==='json'){assert.equal(JSON.parse(output[2]).records[0].exclusionDetails.source,'AI');}
}
// Original source bibliography export remains untouched.
assert(!evaluate('sourceBibTeX(source.records)').includes('Exclusion reason'));
console.log('PASS: pilot gating, one-failure exclusion, genuine conflicts, default review scope, folding and five export formats');
