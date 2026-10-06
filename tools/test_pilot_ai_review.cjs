const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../title-abstract-screening.html'),'utf8'),engine=require('../app/screening-calibration.js');
const elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,style:{},dataset:{},handlers:{},classList:{toggle(){},add(){},remove(){}},setAttribute(){},getAttribute(){return null},closest(){return {classList:{toggle(){}}}},querySelector(selector){return selector==='.sr-only'?{textContent:''}:null},querySelectorAll(){return []},addEventListener(k,f){this.handlers[k]=f},focus(){},showModal(){},close(){}});return elements.get(id);}
const ctx={console,URL,URLSearchParams,AbortController,DOMException,structuredClone,TextEncoder,Blob,Map,Set,performance,CSS:{escape:x=>x},
 setTimeout(){return 1},clearTimeout(){},setInterval(){},localStorage:{getItem(){return null},setItem(){},removeItem(){}},sessionStorage:{getItem(){return null}},navigator:{},
 location:{href:'https://aimsetp.com/title-abstract-screening.html',search:'',hostname:'aimsetp.com'},document:{activeElement:null,addEventListener(){},getElementById:el,querySelectorAll(){return []},body:{dataset:{}}},window:{addEventListener(){}},confirm(){return true},AimstepCalibration:engine};
let code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const PILOT_PROMPT'));
code=code.replace(/\ninit\(\);/,`\nglobalThis.testPilot={setup(records){source={records,criteriaSig:'criteria',sourceSig:'source',runs:[],criteria:{framework:'PICO',rows:[{title:'Population',condition:'Adults',uncertain:'Children'}]}};recordById.clear();records.forEach(r=>recordById.set(r.uid,r));workspace=defaults();workspace.sourceSig='source';workspace.criteriaSig='criteria';workspace.pilot.size=3;pilotView=-1;pilotReviewDrafts.clear();pilotReviewErrors.clear();},get:()=>workspace,replace(w){workspace=w},view(i){pilotView=i},bindSave(fn){save=fn},bindModel(fn){resolvePilotModel=async()=>({name:'test',provider:'typesafe'});screenPilotRecord=fn},stub(){render=()=>renderPilot();publishSummary=()=>{};log=()=>{};renderCalibration=()=>{};renderFull=()=>{};showNotice=()=>{};toast=()=>{}},startPilotRound,savePilotReview,beginPilotMistake,approvePilotRound,pilotRoundState,pilotMetrics,pilotCard,renderPilot,currentCalibration,pilotPrompt,pilotApprovalValid,validPilotReview,pilotReviewDrafts,pilotReviewErrors};`);
vm.runInNewContext(code,ctx);const t=ctx.testPilot;t.stub();
const currentRoundHTML=()=>el('rounds').innerHTML.match(/<button[^>]*class="round current[^"]*"[^>]*>(.*?)<\/button>/)?.[1]||'';
const records=Array.from({length:6},(_,i)=>({uid:'r'+i,title:'Synthetic adults study '+i,abstract:'Adults received treatment.',authors:[],year:'2026',journal:'Synthetic'}));
let saved,calls=[];t.setup(records);t.bindSave(async()=>{saved=structuredClone(t.get())});
t.bindModel(async(r,round,signal,variant,bundle)=>{calls.push({id:r.uid,bundle:structuredClone(bundle)});return {decision:'maybe',round,criteria:[{dimension:'Population',judgment:'unclear',quote:'',reason:'Age threshold not reported.'}],criteriaSig:'criteria',at:r.uid+round,model:'synthetic',promptHash:r.uid+round}});
(async()=>{
 await t.startPilotRound();let w=t.get(),st=t.pilotRoundState(0),ids=st.ids;assert.equal(ids.length,3);assert.equal(st.aiDone,true);assert.equal(st.votesDone,false);
 const card=t.pilotCard(records.find(r=>r.uid===ids[0]),st,0);assert.match(card,/AI decision: Include/);assert.match(card,/data-review="agree"/);assert.match(card,/data-review="mistake"/);assert(!card.includes('data-pvote'));assert(!card.includes('AI result stays hidden'));
 t.renderPilot();assert(!currentRoundHTML().includes('AI accuracy'));
 await t.startPilotRound();assert.equal(w.pilot.rounds.length,1,'Cannot advance before human review');
 await t.savePilotReview(ids[0],'agree');assert.equal(w.pilot.human[ids[0]].decision,'yes');assert.equal(t.pilotRoundState(0).voted,1);assert(!currentRoundHTML().includes('AI accuracy'));
 t.beginPilotMistake(ids[1]);await t.savePilotReview(ids[1],'mistake');assert(!w.pilot.human[ids[1]]);assert.match(t.pilotReviewErrors.get(ids[1]),/Explain why/);
 t.pilotReviewDrafts.get(ids[1]).note='The population includes children, contrary to the adult inclusion criterion.';
 const prior=structuredClone(w);t.bindSave(async()=>{throw Error('Synthetic disk failure')});await t.savePilotReview(ids[1],'mistake');assert.equal(JSON.stringify(w),JSON.stringify(prior));assert.match(t.pilotReviewErrors.get(ids[1]),/Could not save/);assert(t.pilotReviewDrafts.has(ids[1]));
 t.bindSave(async()=>{saved=structuredClone(t.get())});await t.savePilotReview(ids[1],'mistake');assert.equal(w.pilot.human[ids[1]].decision,'no');assert.match(w.pilot.human[ids[1]].exclusionReason,/children/);assert.equal(t.pilotRoundState(0).revealed,false);
 await t.savePilotReview(ids[2],'agree');assert.equal(t.pilotRoundState(0).revealed,true);assert.equal(t.pilotMetrics(ids).accuracy,2/3);assert(currentRoundHTML().includes('AI accuracy'));assert(currentRoundHTML().includes('AI accuracy 67%')&&currentRoundHTML().includes('Round 1 Reviewed'));
 t.beginPilotMistake(ids[0]);assert(!currentRoundHTML().includes('AI accuracy'));await t.startPilotRound();assert.equal(w.pilot.rounds.length,1);await t.approvePilotRound();assert.equal(w.pilot.approved,null);await t.savePilotReview(ids[0],'agree');assert(currentRoundHTML().includes('AI accuracy'));
 assert.equal(el('pilot-agreed-count').textContent,'2');assert.equal(el('pilot-mistake-count').textContent,'1');assert(!el('pilot-list').innerHTML.includes('id="pilot-record-'+ids[1]+'"'));assert(el('pilot-list').innerHTML.includes('id="pilot-record-'+ids[0]+'"'));
 el('pilot-filter').handlers.click({target:{closest:()=>({dataset:{filter:'differ'}})}});assert(el('pilot-list').innerHTML.includes('id="pilot-record-'+ids[1]+'"'));assert(!el('pilot-list').innerHTML.includes('id="pilot-record-'+ids[0]+'"'));
 el('pilot-filter').handlers.click({target:{closest:()=>({dataset:{filter:'agreed'}})}});
 // Status badges fold the complete AI assessment without changing saved reviews.
 for(const id of [ids[0],ids[1]]){
  const before=JSON.stringify(w.pilot.human[id]),body={hidden:false},attrs={};
  const toggle={dataset:{toggleAssessment:id},closest:()=>({querySelector:()=>body}),setAttribute:(k,v)=>attrs[k]=v};
  const event={target:{closest:selector=>selector==='[data-toggle-assessment]'?toggle:null}};
  el('pilot-list').handlers.click(event);assert.equal(body.hidden,true);assert.equal(attrs['aria-expanded'],'false');
  const folded=t.pilotCard(records.find(r=>r.uid===id),t.pilotRoundState(0),0);assert(folded.includes('data-pilot-assessment hidden'));assert(folded.includes(id===ids[0]?'Agreed':'Corrected'));assert(!folded.includes('Correction saved'));
  t.renderPilot();assert(t.pilotCard(records.find(r=>r.uid===id),t.pilotRoundState(0),0).includes('data-pilot-assessment hidden'));
  el('pilot-list').handlers.click(event);assert.equal(body.hidden,false);assert.equal(attrs['aria-expanded'],'true');assert.equal(JSON.stringify(w.pilot.human[id]),before);
 }
 const bundle=t.currentCalibration();assert.equal(bundle.pending.length,0);assert.equal(bundle.lessons.length,3);assert.equal(bundle.lessons.filter(l=>l.review==='agree').length,2);assert.equal(bundle.lessons.filter(l=>l.review==='mistake').length,1);
 const prompt=JSON.parse(t.pilotPrompt(records[5],1,1,bundle));assert.equal(prompt.reviewerCalibration.totalLessons,3);assert(prompt.reviewerExamples.some(x=>x.review==='mistake'&&x.correction.includes('children')));assert(prompt.reviewerExamples.some(x=>x.review==='agree'));
 t.replace(structuredClone(saved));w=t.get();assert.equal(t.pilotRoundState(0).revealed,true);assert.equal(t.pilotMetrics(ids).accuracy,2/3);
 await t.approvePilotRound();assert(t.pilotApprovalValid());assert.equal(w.pilot.approved.calibration.lessons.length,3);
 await t.startPilotRound();assert.equal(w.pilot.rounds.length,2);assert.equal(w.pilot.approved,null);assert(calls.slice(3).every(c=>c.bundle.lessons.length===3));assert(w.pilot.rounds[1].ids.every(id=>!ids.includes(id)));assert(!currentRoundHTML().includes('AI accuracy'));
 // Historical yes/no/maybe votes are retained but do not count as saved AI reviews.
 const id=w.pilot.rounds[1].ids[0];w.pilot.human[id]={decision:'yes',note:'Legacy vote'};assert.equal(t.validPilotReview(id,1),false);
 await t.savePilotReview(id,'agree');assert(t.validPilotReview(id,1));w.pilot.ai[id].at='new inference';assert.equal(t.validPilotReview(id,1),false,'A different AI result needs fresh review');
 // Agree with exclusion preserves an explicit reason; Mistake flips it to Include.
 w.pilot.ai[id].decision='no';w.pilot.ai[id].criteria=[{dimension:'Population',judgment:'not met',quote:'children',reason:'Children only'}];await t.savePilotReview(id,'agree');assert.equal(w.pilot.human[id].decision,'no');assert.match(w.pilot.human[id].exclusionReason,/Children only/);
 t.beginPilotMistake(id);t.pilotReviewDrafts.get(id).note='The report includes eligible adults.';await t.savePilotReview(id,'mistake');assert.equal(w.pilot.human[id].decision,'yes');assert.equal(w.pilot.human[id].exclusionReason,'');
 t.view(0);t.renderPilot();assert(currentRoundHTML().includes('Round 1'));assert(currentRoundHTML().includes('AI accuracy 67%')&&currentRoundHTML().includes('Round 1 Reviewed'));assert(el('rounds').innerHTML.includes('data-round="0" aria-pressed="true"'));assert(el('rounds').innerHTML.includes('data-round="1" aria-pressed="false"'));
 assert(html.indexOf('id="run-pilot"')<html.indexOf('id="rounds"'));assert(html.indexOf('id="rounds"')<html.indexOf('id="reset-calibration"'));assert(html.includes('.pilot-rounds .round.current{'));
 assert(!html.includes('pilot-abs-all'));assert(!html.includes('pilot-abs-tools'));assert(html.includes('class="pilot-filter-tab"'));
 assert(html.includes('id="pilot-detail" hidden'));assert(!html.includes('id="pilot-accuracy"'));
 for(const id of ['pilot-voted','pilot-ai','pilot-agreement','pilot-kappa','pilot-false-ex'])assert(!html.includes('id="'+id+'"'));
 const known=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));for(const id of elements.keys())assert(known.has(id),'Missing UI binding '+id);
 console.log('PASS: AI-first review, Agree/Mistake, required reason, failed-save retry, accuracy, reload, approval, next-round calibration and both corrected outcomes');
})().catch(e=>{console.error(e);process.exitCode=1});
