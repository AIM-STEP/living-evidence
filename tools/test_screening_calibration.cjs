const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const engine=require('../app/screening-calibration.js');
const records=[{uid:'a',title:'Adults with insomnia',abstract:'Adults received behavioral therapy.'},{uid:'b',title:'Children only',abstract:'Children received therapy.'}];
const criteria={rows:[{title:'Population',condition:'Adults'}],question:'Synthetic review'};
const pilot={rounds:[{ids:['a','b'],revealedAt:'done',criteriaSig:'sig'}],ai:{a:{decision:'no',round:0,criteria:[{dimension:'Population',judgment:'not met',quote:'Adults'}]},b:{decision:'yes',round:0,criteria:[]}},human:{a:{decision:'yes'},b:{decision:'no',exclusionReason:'Children are outside the eligible population.'}}};
let bundle=engine.build(pilot,records,criteria,'sig');assert.equal(bundle.pending.length,2);
pilot.human.a.calibrationCriterion='Population';pilot.human.a.note='Adults satisfy the population criterion. Do not exclude them based on missing age ranges.';
pilot.human.a.calibrationQuote='Invented quotation';pilot.human.b.calibrationCriterion='Population';
bundle=engine.build(pilot,records,criteria,'sig');assert.equal(bundle.pending.length,1);assert.match(bundle.pending[0].issue,/exactly/);
pilot.human.a.calibrationQuote='Adults received behavioral therapy.';
bundle=engine.build(pilot,records,criteria,'sig');assert.equal(bundle.pending.length,0);assert.equal(bundle.lessons.length,2);
assert.equal(engine.build(pilot,records,criteria,'sig',0).lessons.length,0);
assert.equal(engine.build(pilot,records,null,'sig').pending.length,2);
assert.equal(engine.build(pilot,records,criteria,'different').lessons.length,0);
const approved=structuredClone(bundle);
pilot.human.a.note+=' Apply to eligible adults only.';
assert.notEqual(engine.build(pilot,records,criteria,'sig').hash,approved.hash);
assert(!approved.lessons[0].correction.includes('eligible adults only'));
const selected=engine.select(approved,records[0],{maxLessons:1,maxExamples:1});
assert.equal(selected.rules.length,1);assert.equal(selected.rules[0].lessonId,'round-1-a');assert.equal(selected.examples[0].reviewerDecision,'yes');
const many={...approved,lessons:Array.from({length:40},(_,i)=>({...approved.lessons[i%2],id:'l'+i,recordId:'r'+i,correction:'A'.repeat(1200)}))};
const bounded=engine.select(many,records[0]);assert(JSON.stringify(bounded).length<=20000);assert(bounded.rules.length<=12);assert.equal(bounded.totalLessons,40);
// Actual local-model prompt contains the selected rules and the immutable version.
const html=fs.readFileSync(path.join(__dirname,'../title-abstract-screening.html'),'utf8');
const ctx=vm.createContext({pilotReviewSaving:false,pilotReviewDrafts:new Map(),calibrationEngine:engine,source:{criteria,criteriaSig:'sig'},workspace:{pilot},record:records[0],approved,records,JSON,
 activeScreeningCriteria:()=>criteria,screeningStagesReady:()=>true,screeningProvider:()=> 'local',stale:()=>false,pilotCriteriaSig:()=> 'criteria-prompt',
 currentCalibration:()=>engine.build(pilot,records,criteria,'sig'),calibrationReady:()=>engine.build(pilot,records,criteria,'sig').pending.length===0,
 pilotRoundState:()=>({revealed:true,aiDone:true,votesDone:true})});
function load(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert(a>=0&&b>a);vm.runInContext(html.slice(a,b),ctx);}
load('function pilotPrompt(','const squash=');
let prompt=JSON.parse(vm.runInContext('pilotPrompt(record,1,1,approved)',ctx));
assert.equal(prompt.reviewerCalibration.hash,approved.hash);assert.equal(prompt.reviewerCalibration.rules.length,2);
assert.equal(prompt.reviewerExamples[0].supportingQuote,'Adults received behavioral therapy.');
let second=JSON.parse(vm.runInContext('pilotPrompt(record,1,2,approved)',ctx));assert.deepEqual(second.reviewerCalibration,prompt.reviewerCalibration);
load('function pilotApprovalValid(','function pilotHasProgress(');
pilot.approved={round:0,criteriaSig:'criteria-prompt',calibration:approved};
assert.equal(vm.runInContext('pilotApprovalValid()',ctx),false);
pilot.approved.calibration=engine.build(pilot,records,criteria,'sig');assert.equal(vm.runInContext('pilotApprovalValid()',ctx),true);
pilot.human.b.calibrationCriterion='';assert.equal(vm.runInContext('pilotApprovalValid()',ctx),false);
console.log('PASS: correction completeness, exact evidence, scoped history, frozen versions, bounded selection, both prompt variants and approval invalidation');

// Every confirmed correction is supplemental guidance, independently of example selection.
const corrections={...approved,lessons:Array.from({length:20},(_,i)=>({...approved.lessons[0],id:'correction-'+i,round:i+1,review:'mistake',correction:'Apply the current population rule: confirmed clarification '+i}))};
const all=engine.supplement(corrections);assert.equal(all.correctionCount,20);assert.equal(all.lessonIds.length,20);assert.equal(all.rounds.length,20);
assert(all.text.includes('clarification 0'));assert(all.text.includes('clarification 19'));
const limited=engine.select(corrections,records[0]);assert.equal(limited.rules.length,12);assert(all.lessonIds.includes('correction-19'));
const repeated=engine.supplement({...corrections,lessons:[corrections.lessons[0],{...corrections.lessons[0],id:'duplicate',round:21},{...corrections.lessons[1],review:'agree',aiDecision:'yes',reviewerDecision:'yes'}]});
assert.equal(repeated.correctionCount,1);assert.deepEqual(repeated.lessonIds,['correction-0','duplicate']);assert.deepEqual(repeated.rounds,[1,21]);
assert.throws(()=>engine.supplement(corrections,{maxChars:100}),/no feedback has been discarded/);
const edited=engine.supplement({...corrections,lessons:corrections.lessons.map(l=>({...l,correction:l.correction+' revised'}))});assert.notEqual(edited.hash,all.hash);
const combined=engine.merge(approved,{...corrections,criteriaSig:approved.criteriaSig});assert.equal(combined.lessons.length,22);assert.notEqual(combined.hash,approved.hash);assert.equal(engine.merge(approved,{...corrections,criteriaSig:'deleted-scope'}),approved);
console.log('PASS complete feedback supplement beyond example limits, deduplication with round trace, agreement examples, explicit oversize failure, revisions and scoped memory');
