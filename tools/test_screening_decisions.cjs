'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {t,el}=require('./fixtures/screening-page.cjs')();
const C=require('../app/screening-calibration.js');
const criteria={rows:[{title:'Population',condition:'Adults only'},{title:'Design',condition:'Original randomized controlled trials only'}]};
const records=[
 {uid:'children',title:'Pediatric randomized trial',abstract:'Children aged 6 to 12 years were randomly assigned.'},
 {uid:'review',title:'Systematic review of randomized trials',abstract:'We systematically reviewed 15 randomized controlled trials in adults.'},
 {uid:'nonrandom',title:'Adult cohort',abstract:'Adults entered a non-randomized observational cohort.'},
 {uid:'rct',title:'Adult randomized controlled trial',abstract:'Adults aged 20 to 60 years were randomly assigned to two groups.'},
 {uid:'unknown',title:'Treatment outcomes',abstract:'Outcomes improved after treatment.'},
 ...Array.from({length:4},(_,i)=>({uid:'extra'+i,title:'Adult randomized trial '+i,abstract:'Adults were randomly assigned.'}))
].map(r=>({...r,authors:[],year:'2026',journal:''}));
t.setup(records,criteria);let saved;const requests=[];
t.bindSave(async()=>{saved=structuredClone(t.get())});
const judgments=(p,d,pq,dq)=>({decision:'include',criteria:[{dimension:'Population',judgment:p,quote:pq},{dimension:'Design',judgment:d,quote:dq}]});
const assess=(id,a)=>t.pilotDecision(a,records.find(r=>r.uid===id));
assert.equal(assess('children',judgments('not met','met',records[0].abstract,records[0].abstract)).decision,'no');
assert.equal(assess('review',judgments('met','not met',records[1].abstract,'Systematic review of randomized trials')).decision,'no');
assert.equal(assess('nonrandom',judgments('met','not met',records[2].abstract,records[2].abstract)).decision,'no');
assert.equal(assess('rct',judgments('met','met',records[3].abstract,records[3].abstract)).decision,'yes');
for(const a of [judgments('met','met','',''),judgments('not met','met','fabricated quotation',''),{decision:'include',criteria:[]},judgments('met','unclear',records[3].abstract,'')])assert.equal(assess('rct',a).decision,'maybe');
let a=judgments('met','met',records[3].abstract,records[3].abstract);a.criteria.push({dimension:'Design',judgment:'not met',quote:records[3].abstract});assert.equal(assess('rct',a).decision,'maybe');
assert.equal(assess('rct',{criteria:[{dimension:'Deleted criterion',judgment:'not met',quote:records[3].abstract}]}).decision,'maybe');
// A supported exclusion survives an unsupported inclusion; supported contradiction remains a conflict.
const result=(a)=>({...a,stageSig:t.stageSig(),criteriaSig:'synthetic-criteria'}),w=t.get();
w.full.ai.review=result(assess('review',judgments('met','not met',records[1].abstract,records[1].title)));
w.full.ai2.review=result(judgments('met','met','',''));assert.equal(t.aiPair('review'),'no');
w.full.ai2.review=result(judgments('met','met',records[1].abstract,records[1].title));assert.equal(t.aiPair('review'),'conflict');
w.full.ai2.review=result(judgments('unclear','unclear','',''));assert.equal(t.aiPair('review'),'no');
w.full.ai.rct=result(judgments('met','met','',''));w.full.ai2.rct=result(judgments('met','met','',''));assert.equal(t.aiPair('rct'),'maybe');
console.log('PASS evidence normalization: population mismatch, systematic review, non-RCT, eligible RCT, absent/invented evidence, omitted/duplicate/deleted criteria and two-reading aggregation');
(async()=>{
 t.setup(records,criteria);t.bindSave(async()=>{saved=structuredClone(t.get())});
 await t.saveScreeningPrompt({text:'Apply the current population and study-design rules. Use Maybe for missing evidence.',mode:'edited'},{criteriaSig:'synthetic-criteria',stageSig:t.stageSig()});
 // Use the actual screenPilotRecord/pilotPrompt/TypeSafe routing, with a mocked external response.
 t.bindApi(async(base,payload)=>{requests.push(structuredClone(payload));return {version:'typesafe-screen-v5',model:'synthetic-jev',value:judgments('met','met','',''),raw:{}}});
 await t.startPilotRound();let state=t.get(),ids=state.pilot.rounds[0].ids;
 for(const id of ids)assert.equal(state.pilot.ai[id].decision,'maybe');
 assert.match(t.pilotCard(records.find(r=>r.uid===ids[0]),t.pilotRoundState(0),0),/AI decision: Maybe/);
 await t.savePilotReview(ids[0],'agree');assert.equal(state.pilot.human[ids[0]].decision,'maybe');assert.equal(t.finalDecision(ids[0]),'maybe');
 t.beginPilotMistake(ids[1]);t.pilotReviewDrafts.get(ids[1]).note='A systematic review of RCTs is not itself an original randomized trial. Judge the design of this report.';
 await t.savePilotReview(ids[1],'mistake');assert.match(t.pilotReviewErrors.get(ids[1]),/Select the corrected decision/);assert(!state.pilot.human[ids[1]]);
 await el('pilot-list').fire('change',{target:{dataset:{reviewDecision:ids[1]},value:'no'}});
 const before=JSON.stringify(state);t.bindSave(async()=>{throw Error('Synthetic disk failure')});await t.savePilotReview(ids[1],'mistake');assert.equal(JSON.stringify(t.get()),before);assert(t.pilotReviewDrafts.has(ids[1]));
 t.bindSave(async()=>{saved=structuredClone(t.get())});await t.savePilotReview(ids[1],'mistake');assert.equal(state.pilot.human[ids[1]].decision,'no');
 assert.equal(t.currentCalibration().lessons.length,0,'Unfinished rounds do not leak into their own prompts');
 await t.savePilotReview(ids[2],'agree');assert.equal(t.currentCalibration().lessons.length,3);assert.equal(t.pilotMetrics(ids).accuracy,2/3);
 await t.approvePilotRound();assert(t.pilotApprovalValid());const approved=structuredClone(state.pilot.approved.calibration);
 const snapshot=t.currentCalibration(),supplement=C.supplement(snapshot);assert.equal(supplement.correctionCount,1);
 assert(supplement.text.includes('systematic review of RCTs'));
 const firstRequestCount=requests.length;await t.startPilotRound();assert.equal(state.pilot.rounds.length,2);assert(!state.pilot.approved);
 for(const req of requests.slice(firstRequestCount)){
  assert(req.input.stagePolicy.includes('systematic review of RCTs'));
  assert(req.input.stagePolicy.includes('Judge the actual participants and design of THIS report'));
  assert.equal(req.input.reviewerCalibration.supplement.hash,supplement.hash);
 }
 assert(state.pilot.rounds[1].ids.every(id=>!ids.includes(id)));
 assert.equal(state.pilot.rounds[1].feedbackSupplement.hash,supplement.hash);
 const newId=state.pilot.rounds[1].ids[0];
 for(const variant of [1,2]){const answer=await t.screenPilotRecord(records.find(r=>r.uid===newId),1,null,variant,approved);assert.equal(answer.feedbackSupplement.hash,supplement.hash);assert.equal(answer.promptDelivery,'stage-policy');assert(answer.calibrationLessonIds.includes('round-1-'+ids[1]));}
 t.restore(saved);assert.equal(C.supplement(t.currentCalibration()).hash,supplement.hash,'Confirmed feedback survives reload');
 console.log('PASS tri-state Pilot and summary, explicit corrected choice, save rollback, exact accuracy, frozen feedback, distinct next sample and actual supplemental instructions in both TypeSafe requests');
 // Legacy policy change must archive old inclusion/approval; explicit corrections survive.
 state=t.get();state.decisionPolicyVersion='legacy';state.pilot.approved={round:0,criteriaSig:t.pilotCriteriaSig(),calibration:approved};
 for(const id of ids){state.pilot.ai[id].reviewMode='ai-first-v1';state.pilot.ai[id].originalDecision='maybe';state.pilot.ai[id].decision='yes';state.pilot.human[id].reviewMode='ai-first-v1';}
 const old=structuredClone(state);t.bindSave(async()=>{throw Error('Migration storage failure')});await assert.rejects(t.syncDecisionPolicy(),/Migration storage failure/);assert.equal(JSON.stringify(t.get()),JSON.stringify(old));
 t.bindSave(async()=>{saved=structuredClone(t.get())});assert.equal(await t.syncDecisionPolicy(),true);state=t.get();assert.equal(state.pilot.rounds.length,0);assert(!state.pilot.approved);assert.equal(state.decisionPolicyArchives.length,1);assert.equal(state.decisionPolicyArchives[0].pilot.rounds.length,2);assert.equal(t.currentCalibration().lessons.length,1,'Retain explicit corrections, not legacy agreement on flattened Maybe');assert(C.supplement(t.currentCalibration()).text.includes('systematic review of RCTs'));assert.equal(await t.syncDecisionPolicy(),false);
 assert(state.screeningPrompt);assert.equal(t.source().records.length,9);
 // Editing the base prompt preserves confirmed feedback and archives assessments.
 await t.startPilotRound();const oldLessonIds=t.currentCalibration().lessons.map(l=>l.id);
 await t.saveScreeningPrompt({text:'Updated wording of the same saved criteria.',mode:'edited'},{criteriaSig:'synthetic-criteria',stageSig:t.stageSig()});
 assert(t.currentCalibration().lessons.length>=oldLessonIds.length);assert(C.supplement(t.currentCalibration()).text.includes('systematic review of RCTs'));
 t.clearCalibration();assert.equal(t.currentCalibration().lessons.length,0,'Explicit Pilot Clear removes learned feedback');
 console.log('PASS policy migration rollback, durable archive, approval reset, safe legacy correction memory, idempotence, prompt edit preservation and explicit feedback reset');
 // Include and Maybe share full-text forwarding, but are different screening judgments.
 t.setup(records,criteria);await t.saveScreeningPrompt({text:'Use current rules.',mode:'edited'},{criteriaSig:'synthetic-criteria',stageSig:t.stageSig()});await t.startPilotRound();
 const triIds=t.get().pilot.rounds[0].ids;await t.savePilotReview(triIds[0],'agree');await t.savePilotReview(triIds[1],'agree');t.beginPilotMistake(triIds[2]);t.pilotReviewDrafts.get(triIds[2]).decision='yes';t.pilotReviewDrafts.get(triIds[2]).note='Both enabled criteria are explicitly supported.';await t.savePilotReview(triIds[2],'mistake');
 const metrics=t.pilotMetrics(triIds);assert.equal(metrics.agreement,2/3);assert.equal(metrics.accuracy,2/3);assert.equal(metrics.forwardAgreement,1);assert.equal(metrics.kappa,0);assert.equal(metrics.recall,1);
 const counts=t.summary();assert.equal(counts.yes,1);assert.equal(counts.maybe,2);assert.equal(counts.no,0);assert.equal(counts.forward,3);
 console.log('PASS three-way accuracy, agreement and kappa distinguish Include from Maybe, with separate full-text forwarding recall and counts');

 if(process.env.SCREENING_LIVE_INPUT_DIR){
  const dir=process.env.SCREENING_LIVE_INPUT_DIR;fs.mkdirSync(dir,{recursive:true});t.setup(records,criteria);await t.saveScreeningPrompt({text:'Apply only the enabled Population and Design rules with exact quotations. A review of RCTs is not itself an RCT.',mode:'edited'},{criteriaSig:'synthetic-criteria',stageSig:t.stageSig()});
  for(const r of records.slice(0,5))fs.writeFileSync(dir+'/'+r.uid+'.json',JSON.stringify({provider:'typesafe',action:'screen',model:'jev-latest',input:JSON.parse(t.pilotPrompt(r,0))}));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
