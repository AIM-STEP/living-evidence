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
function stubBackend(page,calls,{unavailable=false,ambiguous=false}={}){
 page.api.transport(async(url,options)=>{
  const request=JSON.parse(JSON.parse(options.body).messages[1].content);
  calls.push(request);
  const payload=request.payload;
  let answer;
  if(request.step==='extract_elements'){
   const q=payload.question,source=q.sources.find(item=>item.input_kind==='research_question');
   const elements=fields.filter(([, ,quote])=>source.original_text.includes(quote)).map(([id,dimension,quote,side])=>({
    candidate_id:id,dimension_id:dimension,normalized_text:quote,structured_value:null,
    source_refs:[{source_id:source.source_id,source_revision:source.revision,quote}],
    information_status:'explicit',semantic_role:'eligibility_condition',scope_status:'restricted',disposition:side,
   }));
   answer={questions:[{question_id:q.question_id,review_topic:'Exercise in adults with chronic pain',
    framework_candidates:['picos'],elements,issues:[]}]};
  }else{
   assert.equal(request.step,'review_normalization');
   assert.equal(payload.review_policy,'jev-once-v1');
   answer={items:payload.items.map(item=>{
    if(ambiguous&&item.dimension_id==='study_design'&&item.disposition==='exclude'){
     return {...item,status:'uncertain',issue_type:'ambiguous_source',reason:'The exclusion needs author confirmation.'};
    }
    return {...item,status:'supported',issue_type:'none',reason:'Verified.',
     ...(unavailable?{reviewer:{verdict:'unavailable'}}:{})};
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
 assert.doesNotMatch(manual.el('preview').innerHTML,/Adults with chronic pain/);
 stubBackend(manual,manualCalls);
 await manual.el('refine-manual').handlers.click();
 assert.equal(manual.el('manual-refine-status').textContent,'');
 assert.deepEqual(manualCalls.map(call=>call.step),['extract_elements','review_normalization']);
 assert.equal(manualCalls[0].payload.question.context.framework_requested,'PICOS');
 const source=manualCalls[0].payload.question.sources[0].original_text;
 assert.match(source,/Inclusion criteria:\nPopulation: Adults with chronic pain/);
 assert.match(source,/Exclusion criteria:\nStudy design: Case reports/);
 assert.match(source,/Conditions and exceptions:\nOutcomes: Outcomes of interest/);
 assert.equal(manual.api.state().generationMethodChoice,'manual');
 assert.equal(manual.api.state().machineRun.inputMode,'manual');
 assert.equal(manual.api.state().machineRefinement.audit.sources[0].name,'Author-entered criteria');
 assert.deepEqual(manual.api.state().criteria,drafts,'the original form inputs are retained');
 assert.equal(manual.el('generation-method').options.find(option=>option.value==='machine').disabled,true);
 assert.equal(Library.read(manual.ctx.localStorage,projectId).entries[0].method,'manual');
 assert.match(manual.el('preview').innerHTML,/Case reports/);
 assert.match(Buffer.from(manual.api.export()).toString(),/Case reports/);
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

test('missing source review is retried and author-entered data survives a failed regeneration',async()=>{
 const page=open(),calls=[];
 choose(page,'manual');
 page.api.state().framework='PICOS';
 page.api.state().criteria=structuredClone(drafts);
 page.api.fill();
 stubBackend(page,calls);
 await page.el('refine-manual').handlers.click();
 const approved=JSON.stringify(page.api.state().machineCriteria);
 const generatedAt=page.api.state().machineRun.generatedAt;
 page.api.state().criteria[0].condition='Adults with arthritis.';
 page.api.fill();
 assert.match(page.el('preview').innerHTML,/Click Generate/);
 const failedCalls=[];
 stubBackend(page,failedCalls,{unavailable:true});
 await page.el('refine-manual').handlers.click();
 assert.deepEqual(failedCalls.map(call=>call.step),['extract_elements','review_normalization','review_normalization']);
 assert.match(page.el('manual-refine-status').textContent,/could not finish checking the source/i);
 assert.equal(page.api.state().machineRun.generatedAt,generatedAt);
 assert.equal(JSON.stringify(page.api.state().machineCriteria),approved);
 assert.equal(page.api.state().criteria[0].condition,'Adults with arthritis.');
});

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
