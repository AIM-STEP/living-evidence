const {test}=require('node:test');
const assert=require('node:assert/strict');
const {setup}=require('../../tools/test_eligibility_grounding.cjs');
const Background=require('../../app/eligibility/background.js');
const Engine=require('../../app/eligibility/engine.js');
const Library=require('../../app/eligibility-library.js');
const Reset=require('../../app/eligibility-reset.js');
const frameworkConfig=require('../../config/eligibility-frameworks.json');
const profileConfig=require('../../config/eligibility-review-profiles.json');

const projectId='synthetic-grounding';
const drafts=[
 {id:'INC-01',title:'Population',condition:'Adults with chronic pain.'},
 {id:'INC-02',title:'Intervention',condition:'Exercise.'},
 {id:'INC-05',title:'Study design',condition:'Randomised trials.',uncertain:'Case reports.'},
 {id:'INC-04',title:'Outcomes',definition:'Outcomes of interest were pain scores.'},
];
const fields=[
 ['p','population','Adults with chronic pain.','include'],
 ['i','intervention','Exercise.','include'],
 ['s','study_design','Randomised trials.','include'],
 ['x','study_design','Case reports.','exclude'],
];
function open(storage){
 const page=setup(storage);
 Object.assign(page.ctx.window,{AIMSTEPEligibilityEngine:Engine,AIMSTEPEligibilityBackground:{
  ...Background,create:args=>Background.create({...args,frameworkConfig,profileConfig,baseURL:'http://localhost/'}),
 },AimstepEligibilityLibrary:Library,AimstepEligibilityReset:Reset});
 return page;
}
function choose(page,mode){
 const select=page.el('generation-method');
 select.value=mode;select.handlers.change();
}
function stubBackend(page,calls,{unavailable=false,ambiguous=false,rejected=false,beforeReview,logic,terms=fields}={}){
 page.api.transport(async(url,options)=>{
  const request=JSON.parse(JSON.parse(options.body).messages[1].content);
  calls.push(request);
  const payload=request.payload;
  let answer;
  if(request.step==='extract_elements'){
   const q=payload.question,source=q.sources.find(item=>item.input_kind==='research_question');
   const elements=terms.filter(([, ,quote])=>source.original_text.includes(quote)).map(([id,dimension,quote,side])=>({
    candidate_id:id,dimension_id:dimension,normalized_text:quote,structured_value:null,
    source_refs:[{source_id:source.source_id,source_revision:source.revision,quote}],
    information_status:'explicit',semantic_role:'eligibility_condition',scope_status:'restricted',disposition:side,
   }));
   answer={questions:[{question_id:q.question_id,review_topic:'Exercise in adults with chronic pain',
    framework_candidates:['picos'],elements,issues:[],logic}]};
  }else{
   assert.equal(request.step,'review_normalization');
   assert.equal(payload.review_policy,'jev-once-v1');
   assert.equal(payload.items.length,1);
   await beforeReview?.(payload.items[0]);
   answer={items:payload.items.map(item=>{
    const exclusion=item.dimension_id==='study_design'&&item.disposition==='exclude';
    if(ambiguous&&exclusion){
     return {...item,status:'uncertain',issue_type:'ambiguous_source',reason:'The exclusion needs author confirmation.'};
    }
    if(rejected&&exclusion){
     return {...item,status:'uncertain',issue_type:'unsupported_rewrite',reason:'Not supported by the source.',
      reviewer:{provider:'typesafe',verdict:'wording_or_scope'}};
    }
    return {...item,status:'supported',issue_type:'none',reason:'Verified.',
     ...(unavailable&&exclusion?{reviewer:{verdict:'unavailable'}}:{})};
   })};
  }
  return {ok:true,json:async()=>({message:{content:JSON.stringify(answer)},
   ...(request.step==='review_normalization'?{provider:'typesafe',review:{policy:'jev-once-v1'}}:{})})};
 },'backend');
}

test('manual and machine input enter the same source review and publish the same effective criteria',async()=>{
 const manual=open(),manualCalls=[];
 choose(manual,'manual');
 const state=manual.api.state();
 state.framework='PICOS';
 state.criteria=structuredClone(drafts);
 manual.api.fill();
 manual.el('language').value='English';
 manual.el('start-date').value='2020-01-01';
 assert.doesNotMatch(manual.el('preview').innerHTML,/Adults with chronic pain/);
 stubBackend(manual,manualCalls);
 await manual.el('refine-manual').handlers.click();
 assert.equal(manual.el('manual-refine-status').textContent,'');
 assert.deepEqual(manualCalls.map(call=>call.step),['extract_elements',...Array(4).fill('review_normalization')]);
 assert.equal(manualCalls[0].payload.question.context.framework_requested,'PICOS');
 const source=manualCalls[0].payload.question.sources[0].original_text;
 assert.match(source,/Inclusion criteria:\nPopulation: Adults with chronic pain/);
 assert.match(source,/Exclusion criteria:\nStudy design: Case reports/);
 assert.match(source,/Conditions and exceptions:\nOutcomes: Outcomes of interest/);
 assert.match(source,/Additional limits:\nPublication date: From 2020-01-01\nLanguage: English/);
 assert.equal(manual.api.state().generationMethodChoice,'manual');
 assert.equal(manual.api.state().machineRun.inputMode,'manual');
 assert.equal(manual.api.state().machineRefinement.audit.sources[0].name,'Author-entered criteria');
 assert.deepEqual(manual.api.state().criteria,drafts,'the original form inputs are retained');
 assert.equal(manual.el('generation-method').options.find(option=>option.value==='machine').disabled,true);
 assert.equal(Library.read(manual.ctx.localStorage,projectId).entries[0].method,'manual');
 assert.match(manual.el('preview').innerHTML,/Case reports/);
 const word=Buffer.from(manual.api.export()).toString();
 assert.match(word,/Case reports/);
 assert.match(word,/English/);
 assert.match(word,/2020-01-01/);
 const persisted=JSON.parse(manual.storage.get('aimstep-eligibility:'+projectId));
 const restored=open(manual.storage);
 assert.equal(restored.el('generation-method').value,'manual');
 assert.match(restored.el('preview').innerHTML,/Case reports/);
 assert.deepEqual(JSON.parse(JSON.stringify(restored.api.state().criteria)),drafts);

 const machine=open(),machineCalls=[];
 choose(machine,'machine');
 machine.el('question').value=source;
 stubBackend(machine,machineCalls);
 await machine.el('start-machine').handlers.click();
 assert.equal(machine.el('generation-status').textContent,'');
 assert.deepEqual(machineCalls.map(call=>call.step),manualCalls.map(call=>call.step));
 assert.deepEqual(JSON.parse(JSON.stringify(machine.api.state().machineCriteria)),persisted.machineCriteria);
});

for(const mode of ['unavailable','rejected']){
 test(mode+' exclusion stays out of the saved criteria without interrupting verified rules',async()=>{
  const page=open(),calls=[];
  choose(page,'manual');
  page.api.state().framework='PICOS';
  page.api.state().criteria=structuredClone(drafts);
  page.api.fill();
  stubBackend(page,calls,{[mode]:true});
  await page.el('refine-manual').handlers.click();
  const reviews=calls.filter(call=>call.step==='review_normalization').flatMap(call=>call.payload.items);
  assert.equal(reviews.filter(item=>item.disposition==='exclude').length,mode==='unavailable'?2:1);
  assert.equal(reviews.filter(item=>item.disposition==='include').length,3);
  assert.equal(page.el('manual-refine-status').textContent,'');
  assert.match(page.el('preview').innerHTML,/Adults with chronic pain/);
  assert.doesNotMatch(page.el('preview').innerHTML,/Case reports/);
  const word=Buffer.from(page.api.export()).toString();
  assert.match(word,/Randomised trials/);
  assert.doesNotMatch(word,/Case reports/);
  assert.deepEqual(page.api.state().criteria,drafts);
  if(mode==='unavailable'){
   const keys=Reset.projectKeys(projectId);
   assert.equal(page.storage.get(keys.draft),undefined);
   assert.equal(JSON.parse(page.storage.get(keys.lessons)).counts.service_availability,1);
  }
 });
}

test('author confirmation applies to the shared result without changing the manual input or calling the model',async()=>{
 const page=open(),calls=[];
 choose(page,'manual');
 page.api.state().framework='PICOS';
 page.api.state().criteria=structuredClone(drafts);
 page.api.fill();
 stubBackend(page,calls,{ambiguous:true});
 await page.el('refine-manual').handlers.click();
 const generated=page.api.state().machineRefinement;
 const index=generated.sourceConfirmations.findIndex(detail=>detail.evidence.some(ref=>ref.quote.includes('Case reports')));
 assert(index>=0);
 const choice=generated.sourceConfirmations[index].options.findIndex(option=>option.option_id==='use_proposed');
 assert(choice>=0);
 page.api.denyModelAccess();
 assert(await page.api.confirm(index,choice));
 assert.equal(page.api.state().generationMethodChoice,'manual');
 assert.equal(page.api.state().machineRun.inputMode,'manual');
 assert.deepEqual(page.api.state().criteria,drafts);
 assert.match(Buffer.from(page.api.export()).toString(),/Case reports/);
});

function startGeneration(page,mode){
 choose(page,mode);
 if(mode==='manual'){
  page.api.state().framework='PICOS';
  page.api.state().criteria=structuredClone(drafts);
  page.api.fill();
 }else page.el('question').value='Adults with chronic pain. Exercise. Randomised trials. Exclude Case reports.';
 return page.el(mode==='manual'?'refine-manual':'start-machine');
}

async function until(check){
 for(let attempts=0;attempts<50;attempts++){
  if(check())return;
  await new Promise(resolve=>setImmediate(resolve));
 }
 assert.fail('The expected review progress did not arrive.');
}

for(const mode of ['manual','machine'])test(mode+' saves an approved item while the other items are still under review',async()=>{
 const page=open(),calls=[],button=startGeneration(page,mode),keys=Reset.projectKeys(projectId);
 let release;
 const pending=new Promise(resolve=>{release=resolve;});
 stubBackend(page,calls,{rejected:true,beforeReview:item=>item.dimension_id!=='population'?pending:undefined});
 const running=button.handlers.click();
 try{
  await until(()=>page.el('preview').innerHTML.includes('Verified so far'));
  const draft=JSON.parse(page.storage.get(keys.draft));
  assert.equal(draft.rows.length,1);
  assert.match(page.el('preview').innerHTML,/Adults with chronic pain/);
  assert.doesNotMatch(page.el('preview').innerHTML,/Exercise|Case reports|Randomised trials/i);
  assert.equal(page.el('download').hidden,true);
  assert.equal(page.storage.has(keys.project),false);
  assert.equal(page.api.state().machineRefinement,null);
  const reopened=open(new Map(page.storage));
  reopened.api.fill();
  assert.match(reopened.el('preview').innerHTML,/Verified draft from an unfinished run/);
  assert.match(reopened.el('preview').innerHTML,/Adults with chronic pain/);
 }finally{
  release();
  await running;
 }
 assert.equal(page.storage.has(keys.draft),false);
 assert.match(page.el('preview').innerHTML,/Randomised trials/i);
 assert.doesNotMatch(page.el('preview').innerHTML,/Case reports/);

 const firstRun=calls.map(call=>call.step);
 await button.handlers.click();
 assert.deepEqual(calls.map(call=>call.step),[...firstRun,...firstRun]);
});

test('an incomplete OR is held while independent verified rules can enter the draft',async()=>{
 const page=open(),button=startGeneration(page,'machine'),calls=[];
 page.el('question').value='Include Adults with chronic pain or Exercise. Only Randomised trials. Exclude Case reports.';
 const predicate=element_id=>({op:'predicate',element_id});
 const logic={op:'all_of',children:[{op:'any_of',children:['p','i'].map(predicate)},predicate('s')]};
 let release;
 const pending=new Promise(resolve=>{release=resolve;});
 const terms=fields.map(([id,dimension,quote,side])=>[id,dimension,quote.replace(/\.$/,''),side]);
 stubBackend(page,calls,{logic,terms,beforeReview:item=>item.dimension_id==='intervention'?pending:undefined});
 const running=button.handlers.click();
 try{
  await until(()=>page.el('preview').innerHTML.includes('Randomised trials'));
  assert.match(page.el('preview').innerHTML,/Verified so far/);
  assert.doesNotMatch(page.el('preview').innerHTML,/Adults with chronic pain|Exercise/i);
 }finally{
  release();
  await running;
 }
 assert.match(page.el('preview').innerHTML,/Adults with chronic pain/);
 assert.match(page.el('preview').innerHTML,/Exercise/i);
});

test('Clear removes the verified draft and an earlier review cannot write it back',async()=>{
 const page=open(),button=startGeneration(page,'machine'),calls=[],keys=Reset.projectKeys(projectId);
 let release;
 const pending=new Promise(resolve=>{release=resolve;});
 stubBackend(page,calls,{beforeReview:item=>item.dimension_id!=='population'?pending:undefined});
 const running=button.handlers.click();
 try{
  await until(()=>page.el('preview').innerHTML.includes('Verified so far'));
  Reset.resetProject(page.ctx.localStorage,projectId,{question:page.el('question').value});
 }finally{
  release();
  await running;
 }
 assert.equal(page.storage.has(keys.draft),false);
 assert.equal(page.storage.has(keys.project),false);
});
