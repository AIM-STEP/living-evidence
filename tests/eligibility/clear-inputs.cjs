const assert=require('node:assert/strict');
const {setup}=require('../../tools/test_eligibility_grounding.cjs');
const library=require('../../app/eligibility-library.js'),reset=require('../../app/eligibility-reset.js');
const project='synthetic-grounding',key='aimstep-eligibility:'+project;
const row={title:'Population',condition:'previous patient group',definition:'',uncertain:''};
const old={question:'previous question',activeGenerator:'machine',generationMethodChoice:'machine',reviewType:'Systematic Review',framework:'PICO',machineCriteria:[row],criteria:[row],machineRun:{question:'previous question',sourceRevision:0,reviewType:'Systematic Review'},machineSourceRevision:0,previewEditHistory:[row],criteriaClearHistory:[row],versions:[row],materials:['prior.pdf'],protocolSource:{sharedCriteria:false}};
function page(storage){
 const t=setup(storage);
 Object.assign(t.ctx.window,{AimstepEligibilityLibrary:library,AimstepEligibilityReset:reset});
 t.ctx.confirm=()=>true;t.ctx.document.createElement=()=>({addEventListener(){},setAttribute(){},append(){}});
 Object.assign(t.el('machine-attachments'),{replaceChildren(){},append(){},appendChild(){}});
 return t;
}
(async()=>{
 for(const button of ['clear-criteria','clear-question','manual-generate']){
  const store=new Map([[key,JSON.stringify(old)],['aimstep-eligibility-v3:'+project,JSON.stringify(old)],['aimstep-eligibility-summary:'+project,'previous summary']]);
  const t=page(store),stale=page(store);
  const file={name:'prior.txt',size:3,text(){throw Error('A cleared attachment was reused');}};
  t.el('source-files').handlers.change({target:{files:[file],value:'old filename'}});
  t.el(button).handlers.click();
  assert.equal(t.el('question').value,'');assert.equal(t.api.state().criteria.length,0);assert.equal(t.api.state().machineCriteria.length,0);
  assert.equal(t.el('machine-attachments').hidden,true);assert(!JSON.stringify([...store]).includes('previous'));assert(!JSON.stringify([...store]).includes('prior.'));
  t.api.transport(()=>{throw Error('Generation must ask for new source material');});
  await t.el('start-machine').handlers.click();assert(t.el('generation-status').textContent.includes('before starting.'));
  stale.el('question').value='previous restored question';stale.el('question').handlers.input({isComposing:false});
  assert.equal(stale.api.state().question,'');assert(!JSON.stringify([...store]).includes('previous'));
  assert.throws(()=>library.commit(t.ctx.localStorage,project,old),e=>e.code==='VERSION_CONFLICT');
  const blank=t.api.state();const planned=library.plan(t.ctx.localStorage,project,blank,{previous:old});assert.equal(planned.library.entries.length,0);
 }
 const t=page(new Map([[key,JSON.stringify(old)]])),state=t.api.state();
 state.machineRefinement={signature:t.api.signature(state.question,state.reviewType,0,state.machineCriteria),sourceConfirmations:[{backgroundIssue:true,issue_id:'issue',options:[{option_id:'keep',label:'Keep'}]}]};
 let started,finish;
 const reviewing=new Promise(resolve=>{started=resolve;});
 t.ctx.window.AIMSTEPEligibilityBackground={create:async()=>({decide(){started();return new Promise((_,reject)=>{finish=reject;});}})};
 const answer=t.api.confirm(0,0);await reviewing;t.el('clear-criteria').handlers.click();finish(Error('Stale review rejected'));assert.equal(await answer,false);assert.equal(t.api.state().question,'');assert(!JSON.stringify(t.api.state()).includes('previous'));
 const independent={source:'upload',criteriaSnapshot:{rows:[row]},concepts:[{sourceRule:'independently uploaded'}]};assert.strictEqual(library.stripLinkedSearchCriteria(independent),independent);
 console.log('PASS: all three Clear actions erase source text, attached files and both editors; empty regeneration, stale tab and late answer cannot restore criteria');
})().catch(error=>{console.error(error.stack);process.exitCode=1});
