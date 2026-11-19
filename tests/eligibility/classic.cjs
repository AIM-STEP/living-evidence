/* Established frontend + real engine/adapter; semantic model responses are simulated. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const E=require('../../app/eligibility/engine.js'),B=require('../../app/eligibility/background.js'),{setup}=require('../../tools/test_eligibility_grounding.cjs');
const frameworks=require('../../config/eligibility-frameworks.json'),profiles=require('../../config/eligibility-review-profiles.json');
const html=fs.readFileSync(path.join(__dirname,'../../eligibility.html'),'utf8');
for(const id of ['start-machine','generation-status','criteria-progress','preview'])assert(html.includes('id="'+id+'"'),'Missing established entry point '+id);
assert(!html.includes('AIMSTEPEligibilityWorkspace.mount'));assert(!html.includes('app/eligibility/workspace.css'));assert(!html.includes('app/eligibility/workspace.js'));assert(html.includes('app/eligibility/background.js'));
(async()=>{
 const t=setup(),steps=[],progress=[];t.el('criteria-progress').style.setProperty=(key,value)=>{if(key==='--progress')progress.push(parseInt(value));};t.ctx.window.AIMSTEPEligibilityEngine=E;t.ctx.window.AIMSTEPEligibilityBackground={...B,create:options=>B.create({...options,baseURL:'http://localhost/',frameworkConfig:frameworks,profileConfig:profiles})};
 const waitingLabel={textContent:''};t.el('criteria-progress').querySelector=()=>waitingLabel;
 const timers=new Map();let timerId=0;t.ctx.setTimeout=(fn,ms)=>{const id=++timerId;if(ms===1000)timers.set(id,fn);return id;};t.ctx.clearTimeout=id=>timers.delete(id);
 t.api.transport(async(url,options)=>{const body=JSON.parse(options.body),payload=JSON.parse(body.messages[1].content);steps.push(payload.step);let answer;
  assert.equal(payload.output_language,'en');if(payload.step!=='interpret_human_answer'){assert(t.el('generation-status').hidden,'Source extraction detail stays in the background');assert.equal(t.el('criteria-progress').hidden,false);assert.match(waitingLabel.textContent,/^\d+%$/);assert.equal(t.el('criteria-working').hidden,false);assert.match(t.el('criteria-elapsed').textContent,/^\d+:\d{2}$/);}
  if(payload.step==='extract_elements'){const q=payload.payload.question,source=q.sources.find(s=>s.input_kind==='research_question');answer={questions:[{question_id:q.question_id,review_topic:'This review examines exercise in older patients.',framework_candidates:[{framework_id:'pico',basis:'SIMULATED'}],elements:[['p','population','older patients'],['i','intervention','exercise'],['x','study_design','animal studies']].map(([id,dimension,quote])=>({candidate_id:id,dimension_id:dimension,normalized_text:quote,structured_value:null,source_refs:[{source_id:source.source_id,source_revision:source.revision,quote}],semantic_role:'eligibility_condition',information_status:'explicit',scope_status:'restricted',disposition:id==='x'?'exclude':'include'})),logic:{op:'all_of',children:[{op:'predicate',element_id:'p'},{op:'predicate',element_id:'i'}]},issues:[]}]};}
  else if(payload.step==='review_normalization')answer={items:payload.payload.items.map(item=>({id:item.id,status:'supported',reason:'SIMULATED',issue_type:'none',information_status:item.information_status,semantic_role:item.semantic_role,scope_status:item.scope_status,disposition:item.disposition}))};
  else if(payload.step==='interpret_human_answer'){const issue=payload.payload.issues[0];answer={answers:[{issue_ids:[issue.issue_id],answer_text:payload.payload.answer_text,action:'confirm',updates:[{element_id:issue.element_ids[0],structured_value:{operator:'gte',value:65,unit:'year'}}]}]};}
  else throw Error('Unexpected call '+payload.step);
  return {ok:true,json:async()=>({message:{content:JSON.stringify(answer)},model:'SIMULATED'})};
 });
 t.el('generation-method').value='machine';t.el('generation-method').handlers.change();t.el('question').value='Review exercise in older patients. Exclude animal studies.';
 await t.el('start-machine').handlers.click();let state=t.api.state();assert(state.machineRun,t.el('generation-status').textContent);assert.equal(state.machineRefinement.audit.version,E.VERSION);assert.equal(state.eligibilityV3Snapshot.output_language,'en');assert(state.machineCriteria.some(row=>/animal studies/i.test(row.uncertain)),'Explicit exclusions must remain in Exclusion');
 let markup=t.el('preview').innerHTML;for(const section of ['Review topic:','Inclusion','Exclusion','Description','Author check:'])assert(markup.includes(section),section);
 assert(!/[\u3400-\u9fff]/u.test(markup));assert(!markup.includes('FrameworkRegistry'));assert(!markup.includes('Original source excerpts'));assert(!markup.includes('Automatic check notes'));assert(markup.includes('data-source-answer='));assert(markup.indexOf('Author check:')<markup.indexOf('>Description</h3>'));
 for(const value of [15,60,90,94,98,100])assert(progress.includes(value),'Missing completed stage '+value);assert(progress.every((v,i)=>!i||v>=progress[i-1]));
 let core=JSON.parse(t.storage.get('aimstep-eligibility-v3:synthetic-grounding'));assert.equal(core.status,'needs_clarification');assert.equal(core.output_language,'en');
 // An earlier release retired the structured project when an author edited only prose.
 for(const changeRule of [false,true]){
  const copy=setup(new Map(t.storage));
  const service=await B.create({projectId:'synthetic-grounding',storage:copy.ctx.localStorage,frameworkConfig:frameworks,profileConfig:profiles,baseURL:'http://localhost/'});
  const legacy=structuredClone(state);
  legacy.machineRefinement.manuscriptParagraph='Wording supplied by the author.';
  legacy.machineRefinement.descriptionEditedByAuthor=true;
  if(changeRule)legacy.machineCriteria[0].condition+=' Additional author restriction.';
  const oldEdit=service.recordEdit(state,legacy);
  oldEdit.project.presentation_version='previous-release';
  legacy.previewEditHistory=[{changes:[],paragraph:legacy.machineRefinement.manuscriptParagraph}];
  service.transaction(oldEdit,()=>copy.ctx.localStorage.setItem(service.keys.legacy,JSON.stringify(legacy)));
  const refreshed=service.refreshPresentation(legacy);
  if(changeRule)assert.equal(refreshed,null,'Never restore a snapshot over revised eligibility criteria');
  else assert(refreshed.classic.sourceConfirmations.some(c=>c.issue_id===state.machineRefinement.sourceConfirmations[0].issue_id),'Restore the original pending issue after a prose-only edit');
 }
 const issue=state.machineRefinement.sourceConfirmations[0];assert.equal(issue.options.length,2);t.ctx.document.querySelector=()=>({value:'Define older participants as 65 years or older.'});assert(await t.api.confirm(0,'answer'));
 state=t.api.state();core=JSON.parse(t.storage.get('aimstep-eligibility-v3:synthetic-grounding'));assert.equal(core.status,'final');assert(state.machineCriteria.some(row=>row.condition.includes('65')));assert(t.el('preview').innerHTML.includes('65'));assert(!t.el('preview').innerHTML.includes('Author check:'));assert(core.decisions.some(d=>d.answer_text.includes('65')));assert(core.sources.some(s=>s.source_type==='human_answer'));
 assert.equal(timers.size,0,'Wait counters must stop after each response');assert(steps.includes('extract_elements'));assert(steps.includes('review_normalization'));assert(steps.includes('interpret_human_answer'));assert(!steps.includes(undefined));
 const reloaded=setup(t.storage);assert(reloaded.el('preview').innerHTML.includes('65'));assert(!reloaded.el('preview').innerHTML.includes('v3-panel'));
 const service=await B.create({projectId:'synthetic-grounding',storage:t.ctx.localStorage,frameworkConfig:frameworks,profileConfig:profiles,baseURL:'http://localhost/'}),before=t.api.state(),edited=structuredClone(before);edited.machineCriteria[0].condition+=' Author revision.';
 const revision=service.recordEdit(before,edited);assert(revision);service.transaction(revision,()=>t.ctx.localStorage.setItem(service.keys.legacy,JSON.stringify(edited)));assert.equal(service.current().status,'input_saved');assert(service.current().decisions.at(-1).action==='classic_author_revision');
 const storedBefore=new Map(t.storage),stagedBefore=service.current(),atomic={project:{...stagedBefore,revision:stagedBefore.revision+1},expectedRevision:stagedBefore.revision,expectedSignature:B.signature(edited)},originalWrite=t.ctx.localStorage.setItem;let failOnce=true;
 t.ctx.localStorage.setItem=(key,value)=>{if(key===service.keys.project&&failOnce){failOnce=false;throw Error('SIMULATED storage failure');}originalWrite(key,value);};
 assert.throws(()=>service.transaction(atomic,()=>originalWrite(service.keys.legacy,JSON.stringify({...edited,question:'Uncommitted change'}))),/SIMULATED/);assert.deepEqual(t.storage,storedBefore);t.ctx.localStorage.setItem=originalWrite;
 const bad={project:service.current(),expectedRevision:core.revision,expectedSignature:B.signature(edited)};assert.throws(()=>service.transaction(bad,()=>{}),error=>error.code==='VERSION_CONFLICT');
 const cancelled=setup(),activeTimers=new Map();cancelled.ctx.setInterval=fn=>{activeTimers.set(1,fn);return 1;};cancelled.ctx.clearInterval=id=>activeTimers.delete(id);cancelled.api.transport(()=>new Promise(()=>{}));const controller=new AbortController(),client=cancelled.api.progressClient({name:'SIMULATED',provider:'ollama',base:'http://synthetic.invalid',auditTrail:[]}),waitingRequest=client.request('extract_elements',{project_id:'cancel-test',revision:1,config_versions:{}},{},{},'SIMULATED',controller.signal);controller.abort();await assert.rejects(()=>waitingRequest,e=>e.name==='AbortError');assert.equal(activeTimers.size,0,'Stop/deadline must release the UI even when the transport never resolves');
 console.log('PASS classic English UI (simulated model): established Generate → headless v3 extraction/review → necessary age answer → immediate Include/Exclude/Description update → restore → manual-revision provenance → stale guard.');
})().catch(error=>{console.error(error.stack);process.exitCode=1});
