const assert=require('node:assert/strict'),fs=require('node:fs');
const {setup}=require('./test_eligibility_grounding.cjs');
const grounding=require('../app/criteria-grounding.js');
const question='Review exercise in adults with fibromyalgia. Exclude animal studies; randomized trials may be eligible.';
const topic='This review examines exercise in adults with fibromyalgia.';
function wordXml(api){
 const bytes=Buffer.from(api.export());let at=0;
 while(bytes.readUInt32LE(at)===0x04034b50){const size=bytes.readUInt32LE(at+18),n=bytes.readUInt16LE(at+26),extra=bytes.readUInt16LE(at+28),start=at+30+n+extra;if(bytes.subarray(at+30,at+30+n).toString()==='word/document.xml')return bytes.subarray(start,start+size).toString();at=start+size;}
 throw Error('Missing Word document');
}
async function generated(onlyAmbiguous=false){
 const test=setup();
 test.api.transport(async(url,options)=>{
  const body=JSON.parse(options.body),system=body.messages[0].content,payload=JSON.parse(body.messages[1].content);let answer;
  if(system.startsWith('Organize'))answer={framework:'PICO',reviewTopic:topic,criteria:[],questions:[],suggestions:[]};
  else if(system.startsWith('Extract atomic')){
   const facts=onlyAmbiguous?[]:[['Population','required','Adults with fibromyalgia.'],['Intervention','required','Exercise.'],['Study design','prohibited','Animal studies.']];
   facts.push(['Study design','uncertain','Randomized trials.']);
   answer={items:facts.map(([dimension,logic,proposition])=>({dimension,logic,proposition,sourceId:payload.segments[0].id,sourceSentence:payload.segments[0].text,attribute:'Eligibility',value:'',entityType:dimension,temporality:'',modifier:''})),uncertainties:[]};
  }else if(system.startsWith('Independently'))answer={items:payload.items.map(item=>item.rule==='Randomized trials.'?{id:item.id,status:'uncertain',issueType:'ambiguous_source',reason:'The source leaves the eligibility of randomized trials undecided.',alternatives:[{text:'Randomized trials.',side:'include'},{text:'Randomized trials.',side:'exclude'}]}:{id:item.id,status:'supported',issueType:'none'})};
  else if(system.startsWith('You are a systematic review methods editor'))answer={criteria:payload.atoms.map(atom=>({dimension:atom.dimension,include:atom.logic==='required'?[{text:atom.proposition,evidenceIds:[atom.id]}]:[],exclude:atom.logic==='prohibited'?[{text:atom.proposition,evidenceIds:[atom.id]}]:[]})),uncertainties:[]};
  else throw Error('Unexpected model call');
  return {ok:true,json:async()=>({message:{content:JSON.stringify(answer)}})};
 });
 test.el('generation-method').value='machine';test.el('generation-method').handlers.change();test.el('question').value=question;
 await test.el('start-machine').handlers.click();assert(test.api.state().machineRun,test.el('generation-status').textContent);
 return test;
}
(async()=>{
 const {api}=setup(),rows=[{label:'Population',include:['Participants must be adults with fibromyalgia.']},{label:'Intervention',include:['The intervention must be exercise.']},{label:'Comparison',include:['Usual care.']},{label:'Outcomes',include:['Pain.']}];
 assert.equal(api.topic(rows,'PICO'),'This review examines exercise compared with usual care with a focus on pain in adults with fibromyalgia.');
 assert.equal(api.topic([{label:'Population',include:['Adults.']},{label:'Phenomenon of Interest',include:['Lived experience of recovery.']}],'PICo'),'This review explores lived experience of recovery in adults.');
 assert(api.topic([{label:'Population',include:['Adults.']},{label:'Intervention',include:['CBT.']}],'PICO').includes('CBT in adults.'));
 assert(!api.topic(rows,'PCC').includes('P:'));assert(!api.topic(rows,'Other').includes('To be defined'));
 assert.equal(api.validTopic(topic,question),topic);assert.equal(api.validTopic('P: Adults · I: Exercise'), '');
 assert.equal(api.validTopic('This review examines adults aged 18 years.',question),'');
 assert.equal(api.validTopic('This review examines exercise. It examines pain.'),'');
 const atom={dimension:'Study design',logic:'uncertain',proposition:'Randomized trials.',sourceSentence:'Randomized trials may be eligible.'};
 assert.equal(api.sourceConfirmation(atom,{status:'uncertain',issueType:'unsupported_rewrite'}),null,'Internal rewrite failures must not become human tasks');
 const safe=api.sourceConfirmation(atom,{status:'uncertain',issueType:'ambiguous_source',alternatives:[{text:'Studies with at least 18 participants.',side:'include'}]});
 assert(safe.options.every(option=>!option.text.includes('18')),'Unspecified numeric cutoffs cannot become confirmation options');
 const review=grounding.reviewMap({items:[{id:'A1',status:'uncertain',issueType:'ambiguous_source',alternatives:[{text:'Randomized trials.',side:'exclude'}]}]},['A1']);assert.equal(review.get('A1').alternatives[0].side,'exclude');
 for(const choice of [0,1]){
  const test=await generated(),state=test.api.state(),refinement=state.machineRefinement;
  assert.equal(test.api.normalized().topic,topic);assert.equal(refinement.sourceConfirmations.length,1);
  assert(state.machineCriteria.some(row=>row.title==='Population'&&row.condition.includes('Adults')));
  assert(state.machineCriteria.some(row=>row.uncertain.includes('Animal studies')));
  assert(!JSON.stringify(state.machineCriteria).includes('Randomized trials'),'Ambiguous content remains outside active criteria');
  const markup=test.el('preview').innerHTML;assert(markup.includes('Confirm unclear criteria'));assert(!markup.includes('<input'));assert(!markup.includes('Original source excerpts'));assert(!markup.includes('Automatic check notes'));assert(!markup.includes('The source leaves'));
  const before=JSON.stringify(state),persisted=test.storage.get('aimstep-eligibility:synthetic-grounding'),write=test.ctx.localStorage.setItem;
  test.ctx.localStorage.setItem=()=>{throw Error('Synthetic storage failure')};
  assert.equal(test.api.confirm(0,choice),false);assert.equal(JSON.stringify(test.api.state()),before);assert.equal(test.storage.get('aimstep-eligibility:synthetic-grounding'),persisted);
  test.ctx.localStorage.setItem=write;
  test.el('preview').handlers.click({target:{closest:selector=>selector==='[data-source-confirm]'?{dataset:{sourceConfirm:'0',sourceOption:String(choice)}}:null}});
  const active=test.api.state(),rule=active.machineCriteria.find(row=>row.title==='Study design'),side=choice===0?'condition':'uncertain',opposite=choice===0?'uncertain':'condition';
  assert(rule[side].includes('Randomized trials'));assert(!rule[opposite].includes('Randomized trials'));assert(rule.uncertain.includes('Animal studies'));
  assert(active.machineRefinement.manuscriptParagraph.includes('Randomized trials'));assert(!test.el('preview').innerHTML.includes('Confirm unclear criteria'));
  assert.equal(test.api.confirm(0,choice),false,'Repeated confirmation must not duplicate a rule');
  const shared=JSON.parse(test.storage.get('aimstep-eligibility-summary:synthetic-grounding'));assert(!('trace' in shared));assert(choice===0?shared.includes.some(row=>row.text.includes('Randomized trials')):shared.exclusions.some(row=>row.text.includes('Randomized trials')));
  const saved=JSON.parse(test.storage.get('aimstep-eligibility:synthetic-grounding'));assert(saved.machineRefinement.trace.length);assert.equal(saved.machineRefinement.audit.sources[0].text,question);assert(saved.machineRefinement.sourceConfirmations[0].evidence[0].quote.includes('may be eligible'));
  const reloaded=setup(test.storage);assert.equal(reloaded.api.state().machineRefinement.sourceConfirmations[0].status,'confirmed');assert(reloaded.el('preview').innerHTML.includes('Randomized trials'));
  const xml=wordXml(reloaded.api);assert(xml.includes('Randomized trials'));assert(!xml.includes('Source evidence'));assert(!xml.includes(question));
 }
 const only=await generated(true);assert(only.el('preview').innerHTML.includes('Confirm unclear criteria'));assert(only.el('download').hidden);assert.equal(only.api.state().machineCriteria.length,0);assert(only.api.confirm(0,1));assert(only.api.state().machineCriteria[0].uncertain.includes('Randomized trials'));assert(!only.el('download').hidden);
 const opposite=await generated(),oppositeState=opposite.api.state(),design=oppositeState.machineCriteria.find(row=>row.title==='Study design');
 design.condition='Randomized trials.';oppositeState.machineRefinement.rows.find(row=>row.dimension==='Study design').include=['Randomized trials.'];oppositeState.machineRefinement.signature=opposite.api.signature(oppositeState.machineRun.question,oppositeState.machineRun.reviewType,0,oppositeState.machineCriteria);
 assert(opposite.api.confirm(0,1));assert(!opposite.api.state().machineCriteria.find(row=>row.title==='Study design').condition.includes('Randomized trials'));assert(opposite.api.state().machineCriteria.find(row=>row.title==='Study design').uncertain.includes('Animal studies'));
 const stale=await generated();stale.api.state().machineCriteria[0].condition='Changed source rule.';stale.api.fill();const changed=JSON.stringify(stale.api.state());assert.equal(stale.api.confirm(0,0),false);assert.equal(JSON.stringify(stale.api.state()),changed);assert(!stale.el('preview').innerHTML.includes('Confirm unclear criteria'),'Stale confirmations must not overwrite newer rules');
 const legacy=await generated(),legacyState=legacy.api.state();delete legacyState.machineRefinement.sourceConfirmations;legacyState.machineRefinement.reviewTopic='P: Adults with fibromyalgia · I: Exercise';
 legacyState.machineRefinement.trace.push({id:'A099',dimension:'Study design',logic:'uncertain',proposition:'Randomized trials.',sourceSentence:'Randomized trials may be eligible.',review:{status:'supported'}});
 legacy.storage.set('aimstep-eligibility:synthetic-grounding',JSON.stringify(legacyState));const restored=setup(legacy.storage);
 assert(restored.el('preview').innerHTML.includes('Confirm unclear criteria'));assert.equal(restored.api.state().machineRefinement.sourceConfirmations.length,1);assert(restored.api.normalized().topic.startsWith('This review '));assert(!restored.api.normalized().topic.includes('P:'));assert(restored.api.confirm(0,0),'Saved source ambiguities can be confirmed without another model run');
 for(const page of ['eligibility.html','title-abstract-screening.html','full-text-screening.html'])assert(!fs.readFileSync(page,'utf8').includes('${traceHtml}'),'Audit excerpts must not render in shared previews');
 console.log('PASS: full-sentence topic, explicit include/exclude, source-only ambiguity confirmation without blanks, immediate chosen-side updates, persistence/rollback, empty-draft confirmation and audit-only excerpts/notes.');
})().catch(error=>{console.error(error);process.exitCode=1});
