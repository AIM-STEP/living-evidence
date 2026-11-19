const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),grounding=require('../app/criteria-grounding.js');
const html=fs.readFileSync(path.join(root,'eligibility.html'),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const params='));
function setup(initialStorage=new Map()){
 const elements=new Map(),storage=initialStorage;
 function el(id){if(!elements.has(id))elements.set(id,{value:'',hidden:false,textContent:'',innerHTML:'',disabled:false,handlers:{},options:id==='generation-method'?['','machine','manual'].map(value=>({value})):[],style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},dataset:{},addEventListener(type,handler){this.handlers[type]=handler},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelectorAll(){return []},querySelector(){return {textContent:''}},focus(){}});return elements.get(id);}
 const ctx={console,URL,URLSearchParams,AbortController,structuredClone,TextEncoder,Blob,Map,crypto:crypto.webcrypto,setTimeout(){},clearTimeout(){},navigator:{},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},sessionStorage:{getItem(){return null}},
  location:{search:'?projectId=synthetic-grounding',href:'http://localhost/eligibility.html?projectId=synthetic-grounding',pathname:'/eligibility.html'},
  document:{getElementById:el,querySelectorAll(){return []},addEventListener(){}},window:{AIMSTEPEligibilityModel:require('../app/eligibility/model.js'),AIMSTEPCriteriaGrounding:grounding,AIMSTEPProjectAccess:{run:fn=>fn()},addEventListener(){}}};
 const code=source.replace('// Reuse this exact manual editor',`globalThis.testAPI={progressClient:backgroundModelClient,validate:validateAcademicDraft,extract:processExtracts,segments:sourceSegments,pipeline:autoCriteriaPipeline,state:()=>state,fill,pending:currentPending,normalized:standardizedCriteria,signature:machineSourceSignature,confirm:confirmSourceRule,sourceConfirmation,mergeConfirmations:mergeSourceConfirmations,topic:summaryTopic,validTopic:validatedReviewTopic,normalize:normalizeMachineCriteria,suggest:applyScopeSuggestion,normalizeSuggestions:normalizeScopeSuggestions,export:criteriaWordFile,sourceImages:originalMachineSources,navigate:saveBeforeToolNavigation,
  transport(fn){localFetch=fn;resolveLocalModel=async()=>({name:'Synthetic model',provider:'ollama',base:'http://synthetic.invalid',slot:'synthetic'});},
  manualInput(input){prepareSources=async()=>input;},
  declineAll(){reviewCriteriaRules=async(m,items)=>new Map(items.map(item=>[item.id,{status:'uncertain',reason:'Needs author clarification.'}]));}
 };\n// Reuse this exact manual editor`);
 vm.runInNewContext(code,ctx);return {api:ctx.testAPI,el,ctx,storage};
}
function evaluate(api,example,candidate,status='supported',verification='original-text'){
 const extracts={atoms:[{id:'A001',dimension:example.domain,logic:'required',sourceId:'S001',sourceName:'Synthetic protocol',sourceSentence:example.source,verification}],issues:[],draftReview:new Map([[example.domain+':include:0',{status,reason:'Synthetic independent assessment.'}]])};
 return api.validate({criteria:[{dimension:example.domain,include:[{text:candidate,evidenceIds:['A001']}],exclude:[]}],reviewTopic:'Unverified topic',manuscriptParagraph:'Only English-language studies were eligible.',uncertainties:[]},{framework:'PICO',criteria:[{dimension:example.domain,eligibilityRule:example.source}],limits:{}},'synthetic',{name:'Synthetic'},extracts);
}
async function run(){
 const {api}=setup(),fixturePath=path.join(__dirname,'fixtures/eligibility-grounding-benchmark.json'),bytes=fs.readFileSync(fixturePath),benchmark=JSON.parse(bytes);
 // Only change this digest after an explicit review of benchmark changes.
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),fs.readFileSync(fixturePath+'.sha256','utf8').trim(),'The evaluation fixture changed; review it before updating the lock.');
 for(const split of ['development','test'])for(const example of benchmark[split]){
  const good=evaluate(api,example,example.accept),bad=evaluate(api,example,example.reject);
  assert.equal(good.rows[0].include.length,1,example.id+' supported paraphrase');
  assert.equal(bad.rows[0].include.length,0,example.id+' changed meaning must be inactive even when model review says supported');
  assert(bad.uncertainties.length,example.id+' must retain a diagnostic note');
  assert(!good.manuscriptParagraph.includes('English-language'),'Model-generated Description must not add a restriction');
 }
 console.log('PASS: separate development/test splits; 14 supported paraphrases and 14 adversarial rules; thresholds, strictness, units, AND/OR, negation, exceptions, Chinese and numeric scope');
 for(const example of [
  {domain:'Population',source:'Age of at least 18 years. Follow-up of at least 12 months.',accept:'Age of at least 18 years. Follow-up of at least 12 months.',reject:'Age of at least 18 years.'},
  {domain:'Intervention',source:'At least 12 weeks after treatment.',accept:'At least 12 weeks after treatment.',reject:'At least 12 weeks before treatment.'}
 ]){assert.equal(evaluate(api,example,example.accept).rows[0].include.length,1);assert.equal(evaluate(api,example,example.reject).rows[0].include.length,0);}
 const outcome=evaluate(api,{domain:'Outcomes',source:'Outcomes of interest include pain.'},'Studies must report pain.');
 assert.equal(outcome.rows[0].include.length,0);assert.equal(outcome.clarifications[0].kind,'proposal');
 const example=benchmark.development[0];
 assert.equal(evaluate(api,example,example.accept,'contradicted').rows[0].include.length,0);
 assert.equal(evaluate(api,example,example.accept,'uncertain').clarifications[0].kind,'proposal');
 assert.equal(evaluate(api,example,example.accept,'supported','visual-review-required').rows[0].include.length,1,'Legible image-transcription rules generate directly while retaining their provenance');
 assert.equal(evaluate(api,example,example.accept,'supported','image-transcription').rows[0].include.length,1);
 const imageTest=setup();imageTest.api.transport(async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({text:'Adults with fibromyalgia.',uncertain:false})}})}));
 const transcribed=await imageTest.api.sourceImages({name:'Synthetic vision',provider:'ollama',base:'http://synthetic.invalid'},{texts:[],images:[{name:'Synthetic scan',dataUrl:'data:image/png;base64,AA=='}]},'Systematic Review',new AbortController().signal);
 assert.equal(transcribed[0].verification,'image-transcription');assert.equal(transcribed[0].text,'Adults with fibromyalgia.');
 imageTest.api.transport(async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({text:'Unclear text',uncertain:true})}})}));
 await assert.rejects(()=>imageTest.api.sourceImages({name:'Synthetic vision',provider:'ollama',base:'http://synthetic.invalid'},{texts:[],images:[{name:'Synthetic scan',dataUrl:'data:image/png;base64,AA=='}]},'Systematic Review',new AbortController().signal),/incomplete or uncertain/);
 const missing=grounding.reviewMap({items:[]},['R1']);assert.equal(missing.get('R1').status,'uncertain');
 assert.equal(grounding.reviewMap({items:[{id:'R1',status:'supported'},{id:'R1',status:'supported'}]},['R1']).get('R1').status,'uncertain');
 const original=[{name:'Original protocol',page:9,text:'Adults with fibromyalgia. '+('Context '.repeat(600))+'Follow-up of at least 24 months.'}];
 const segments=api.segments({originalSources:original,criteria:[{dimension:'Population',eligibilityRule:'Invented adult age of 18 years.'}]});
 assert.equal(segments.map(s=>s.text).join(''),original[0].text);assert(segments.at(-1).text.includes('24 months'));assert(segments.every(s=>s.page===9));
 const manifest=await grounding.manifest(original);assert.equal(manifest[0].sha256,crypto.createHash('sha256').update(original[0].text).digest('hex'));
 const forged=api.extract([{items:[{sourceId:segments[0].id,dimension:'Population',sourceSentence:'Invented adult age of 18 years.',logic:'required',attribute:'Age',value:'18',entityType:'Population',temporality:'',modifier:'',proposition:'Age of at least 18 years.'}]}],segments,['Population']);
 assert.equal(forged.atoms.length,0,'A first-pass draft is not original-source evidence');
 const clippedSegments=grounding.segments([{name:'Eligibility',text:'Adults aged at least 18 years.'}]);
 const clipped=api.extract([{items:[{sourceId:'S001',dimension:'Population',sourceSentence:'Adults',logic:'required',attribute:'Adults',value:'',entityType:'Population',temporality:'',modifier:'',proposition:'Adults.'}]}],clippedSegments,['Population']);
 assert(clipped.issues.some(item=>item.includes('unconverted source constraint >= 18')));assert.equal(clipped.atoms[0].sourceContext,clippedSegments[0].text,'Review also receives the context surrounding a quoted phrase');
 const conflictAtoms=['required','prohibited'].map((logic,index)=>({id:'A00'+(index+1),dimension:'Study design',logic,sourceSentence:'Randomized trials.',sourceName:'Conflicting author statements'}));
 const conflict=api.validate({criteria:[{dimension:'Study design',include:[{text:'Randomized trials.',evidenceIds:['A001']}],exclude:[{text:'Randomized trials.',evidenceIds:['A002']}]}],uncertainties:[]},{framework:'PICO',criteria:[{dimension:'Study design'}]},'conflict',{name:'Synthetic'},{atoms:conflictAtoms,issues:[],draftReview:new Map([['Study design:include:0',{status:'supported'}],['Study design:exclude:0',{status:'supported'}]])});
 assert.equal(conflict.rows[0].include.length+conflict.rows[0].exclude.length,0);assert(conflict.trace.every(atom=>!atom.used));assert.equal(conflict.ruleEvidence.length,0);
 const omitted={id:'A002',dimension:'Study design',logic:'required',sourceSentence:'Randomized trials.',proposition:'Randomized trials.',review:{status:'supported'},verification:'original-text'};
 const recovered=api.validate({criteria:[{dimension:'Population',include:[{text:'Adults.',evidenceIds:['A001']}],exclude:[]},{dimension:'Study design',include:[],exclude:[]}],uncertainties:[]},{framework:'PICO',criteria:[{dimension:'Population'},{dimension:'Study design'}]},'omission',{name:'Synthetic'},{atoms:[{id:'A001',dimension:'Population',logic:'required',sourceSentence:'Adults.'},omitted],issues:[],draftReview:new Map([['Population:include:0',{status:'supported'}]])});
 assert.deepEqual(Array.from(recovered.rows[1].include),['Randomized trials.']);assert(recovered.renderingFallbacks.includes('A002'));assert(recovered.ruleEvidence.find(link=>link.evidenceIds.includes('A002')).renderedFromReviewedAtom);
 const repaired=api.validate({criteria:[{dimension:'Population',include:[{text:'Adults aged at most 18 years.',evidenceIds:['A001']}],exclude:[]}],uncertainties:[]},{framework:'PICO',criteria:[{dimension:'Population'}]},'repair',{name:'Synthetic'},{atoms:[{id:'A001',dimension:'Population',logic:'required',sourceSentence:'Adults aged at least 18 years.',proposition:'Adults aged at least 18 years.',review:{status:'supported'}}],issues:[],draftReview:new Map([['Population:include:0',{status:'contradicted',issueType:'unsupported_rewrite'}]])});
 assert.deepEqual(Array.from(repaired.rows[0].include),['Adults aged at least 18 years.']);assert.equal(grounding.decisions(repaired).length,0,'A corrected rewrite is an audit note, not a human task');
 assert.throws(()=>grounding.batches([{text:'x'.repeat(8100)}]),/focused source excerpt/);
 console.log('PASS: original document tails, exact offsets, page attribution, SHA-256 manifest, forged quotations, missing/duplicate semantic assessments, and image-transcription provenance');
 const test=setup(),calls=[];let synthesisCalls=0;
 test.api.transport(async(url,options)=>{
  const body=JSON.parse(options.body),system=body.messages[0].content,payload=JSON.parse(body.messages[1].content);calls.push({system,payload});let answer;
  if(system.startsWith('Organize'))answer={framework:'PICO',criteria:[{dimension:'Population',eligibilityRule:'Adults aged at least 18 years with fibromyalgia.'}],questions:['What outcomes must be reported?','What publication dates should be required?'],suggestions:[{dimension:'Study design',rule:'Randomized controlled trials only.',side:'include',reason:'Restricting designs changes which studies are eligible.',priority:'important'},{dimension:'Comparison',rule:'Studies with a concurrent control group.',side:'include',reason:'A concurrent control group narrows the eligible comparisons.',priority:'important'}]};
  else if(system.startsWith('Extract atomic')){
   assert(!payload.segments.some(s=>s.text.includes('18')),'Extraction sees original passages, not the first-pass draft');
   answer={items:[{sourceId:payload.segments[0].id,dimension:'Population',sourceSentence:payload.segments[0].text,attribute:'Fibromyalgia',value:'',entityType:'Population',temporality:'',modifier:'',logic:'required',proposition:'Adults with fibromyalgia.'}],uncertainties:[]};
  }else if(system.startsWith('Independently'))answer={items:payload.items.map(item=>({id:item.id,status:'supported',reason:'All words were supplied.'}))};
  else if(system.startsWith('You are a systematic review methods editor')){assert.equal(body.format.type,'object');assert.equal(body.format.additionalProperties,false);synthesisCalls++;answer=synthesisCalls===1?{criteria:[],dimension:'Intervention'}:{criteria:[{dimension:'Population',include:[{text:'Adults with fibromyalgia.',evidenceIds:['A001']},{text:'Adults aged at least 18 years with fibromyalgia.',evidenceIds:['A001']}],exclude:[]}],uncertainties:[]};}
  else throw Error('Unexpected model call: '+system.slice(0,60));
  return {ok:true,json:async()=>({message:{content:JSON.stringify(answer)}})};
 });
 test.el('generation-method').value='machine';test.el('generation-method').handlers.change();test.el('question').value='Include studies of adults with fibromyalgia.';
 await test.el('start-machine').handlers.click();
 assert.equal(synthesisCalls,2,'A malformed structure is retried once with the original atoms and schema');
 const state=test.api.state();assert(state.machineRun, test.el('generation-status').textContent);assert.equal(state.machineCriteria.length,1);assert.equal(state.machineCriteria[0].condition,'Adults with fibromyalgia.');
 test.api.navigate({preventDefault(){throw Error('Pending clarification must not block navigation');}});assert(JSON.parse(test.storage.get('aimstep-setup-completed:synthetic-grounding')||'[]').includes(1),'Generated criteria are complete without answering optional scope suggestions');
 assert(!state.machineRefinement.manuscriptParagraph.includes('English'));assert(!state.machineRefinement.manuscriptParagraph.includes('18'));assert(!state.machineRefinement.manuscriptParagraph.includes('2020'));
 assert.equal(state.machineRefinement.audit.sources[0].text,test.el('question').value);assert.equal(state.machineRefinement.trace[0].sourceName,'Question / voice input');
 assert(calls.filter(c=>c.system.startsWith('Independently')).length>=2,'Extracted and final rules undergo separate reviews');
 assert(!test.el('preview').innerHTML.includes('Original source excerpts'));assert(test.api.state().machineRefinement.trace.length);
 assert.equal(test.api.pending().length,0,'Missing core scope and diagnostics must not become required questions');
 assert(!test.el('preview').innerHTML.includes('Automatic check notes'));assert(!test.el('preview').innerHTML.includes('data-pc-'));
 assert.equal(state.machineRefinement.scopeSuggestions.length,2);assert(!test.el('preview').innerHTML.includes('Optional scope suggestions'));
 assert.equal(state.machineCriteria.length,1,'Suggestions do not enter the active criteria automatically');
 const rowsBefore=JSON.stringify(state.machineCriteria);
 assert(test.api.suggest(0,'keep'));assert.equal(JSON.stringify(state.machineCriteria),rowsBefore,'Keeping the draft must not create a complementary exclusion');
 assert.equal(state.finalCriteria.decisions.at(-1).rule,'');
 assert(test.api.suggest(1,'adopt'));assert(state.machineCriteria.some(row=>row.title==='Comparison'&&row.condition.includes('concurrent control')));
 assert(state.machineRefinement.manuscriptParagraph.includes('concurrent control'));assert.equal(state.machineRefinement.audit.decisions.at(-1).provenance,'author-decision');
 assert.equal(test.api.suggest(1,'adopt'),false,'A repeated click cannot duplicate a rule');
 assert.equal(test.api.pending().length,0);assert(!test.el('preview').innerHTML.includes('Optional scope suggestions'));
 const saved=JSON.parse(test.storage.get('aimstep-eligibility:synthetic-grounding'));assert(saved.machineRefinement.audit.sources.length);assert.equal(saved.machineRefinement.audit.version,grounding.VERSION);
 assert.equal(saved.machineRefinement.audit.calls.length,calls.length);assert(saved.machineRefinement.audit.calls.every(call=>call.promptHash?.length===64&&call.responseHash?.length===64));
 assert(saved.machineRefinement.audit.calls.some(call=>call.schemaHash?.length===64),'Schema-constrained calls are recorded');
 const reloaded=setup(test.storage);assert.equal(reloaded.api.state().machineRefinement.audit.sources[0].sha256,saved.machineRefinement.audit.sources[0].sha256);assert(!reloaded.el('preview').innerHTML.includes('Original source excerpts'));assert(reloaded.api.state().machineRefinement.trace.length);
 const archive=Buffer.from(test.api.export());let offset=0,xml='';
 while(archive.readUInt32LE(offset)===0x04034b50){const length=archive.readUInt32LE(offset+18),nameLength=archive.readUInt16LE(offset+26),extra=archive.readUInt16LE(offset+28),name=archive.subarray(offset+30,offset+30+nameLength).toString(),start=offset+30+nameLength+extra;if(name==='word/document.xml')xml=archive.subarray(start,start+length).toString();offset=start+length;}
 assert(!xml.includes('Source evidence'));assert(!xml.includes('Include studies of adults with fibromyalgia.'));assert(saved.machineRefinement.audit.sources[0].text.includes('Include studies of adults with fibromyalgia.'));assert(!xml.includes('Ignored suggestion'));
 reloaded.api.state().machineRun.sourceFiles=['Saved protocol.pdf'];const generatedAt=reloaded.api.state().machineRun.generatedAt;
 await reloaded.el('start-machine').handlers.click();assert(reloaded.el('generation-status').textContent.includes('Reattach the original files'));assert.equal(reloaded.api.state().machineRun.generatedAt,generatedAt);
 console.log('PASS: end-to-end machine transport, original-source evidence, two semantic review passes, inactive fabricated limits, direct editable output, no required forms, optional important suggestions, consistent Description, author audit and persistence');
 const empty=setup();empty.api.declineAll();
 empty.api.transport(async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({items:[]})}})}));
 const partial=await empty.api.pipeline({name:'Synthetic'}, {framework:'PICO',originalSources:[{name:'Topic',text:'Fibromyalgia?'}],criteria:[{dimension:'Population',eligibilityRule:''}]},'empty',new AbortController().signal,()=>{});
 assert.equal(partial.audit.status,'empty-draft');assert.equal(partial.clarifications.length,0); assert(partial.rows.every(row=>!row.include.length));
 console.log('PASS: unsupported-only input yields an empty draft without questions or invented rules');
 // Saved v2 drafts are interpreted with the new policy without re-running a model or changing their rules.
 const old=setup(),oldState=old.api.state();
 Object.assign(oldState,{framework:'PICO',activeGenerator:'machine',generationMethodChoice:'machine',question:'Saved review',reviewType:'Systematic Review',machineSourceRevision:0,
  machineRun:{question:'Saved review',reviewType:'Systematic Review',sourceRevision:0},machineCriteria:[{title:'Population',condition:'Adults.\nAdults aged 21 or older.',uncertain:'',definition:''},{title:'Intervention',condition:'Exercise.',uncertain:'',definition:''},{title:'Study design',condition:'Randomized trials.',uncertain:'Case reports.',definition:''}],
  finalCriteria:{decisions:[{domain:'Population',decision:'meets',rule:'Adults aged 21 or older.'},{domain:'Study design',decision:'fails',rule:'Case reports.'}]}});
 const entries=[...Array.from({length:12},(_,i)=>({item:'Internal source check '+i,kind:'review'})),{item:'Other: Clarify what outcomes must be reported?',kind:'question',domain:'Other'},{item:'Study design: Specify eligible study designs; none was confirmed from the sources.',kind:'question',domain:'Study design'},{item:'Population: Consider an optional restriction.',kind:'proposal',domain:'Population',text:'Optional restriction.'}];
 oldState.machineRefinement={signature:old.api.signature(oldState.question,oldState.reviewType,0,oldState.machineCriteria),audit:{version:'original-source-v2'},rows:oldState.machineCriteria.map(row=>({dimension:row.title,include:row.condition.split('\n'),exclude:row.uncertain?[row.uncertain]:[]})),uncertainties:entries.map(e=>e.item),clarifications:entries,manuscriptParagraph:'An older incomplete Description.',trace:[]};
 const priorRows=JSON.stringify(oldState.machineCriteria),storage=new Map([['aimstep-eligibility:synthetic-grounding',JSON.stringify(oldState)]]),restored=setup(storage);
 assert.equal(restored.api.pending().length,0);assert.equal(JSON.stringify(restored.api.state().machineCriteria),priorRows);assert.equal(restored.api.state().machineRefinement.uncertainties.length,15);
 const preview=restored.el('preview').innerHTML,description=preview.slice(preview.indexOf('>Description</h3>'));
 assert(description.includes('Adults aged 21 or older.'));assert(description.includes('Case reports.'));assert(!preview.includes('>Pending clarification</h3>'));
 const mixed=grounding.decisions({rows:[],clarifications:[{item:'Population: Specify the intended scope.',kind:'question',domain:'Population'},{item:'Other: Specify a complete inclusion rule.',kind:'question',domain:'Other'},{item:'Population: Verify the conflicting rule "Adults"; it was removed from both inclusion and exclusion.',kind:'review',domain:'Other'},{item:'Intervention: Specify the intended scope.',kind:'question',domain:'Intervention'}]});
 assert.equal(mixed.length,0,'Old essential-scope and source-conflict tasks do not reopen required forms');
 assert.equal(grounding.reviewMap({items:[{id:'R',status:'contradicted',reason:'The original text contradicts the proposed rewrite.'}]},['R']).get('R').issueType,'unclassified');
 console.log('PASS: v2 drafts restore all confirmed rules and full Description without regeneration; historical prompts remain archived; no required forms for optional, missing-scope or conflicting-source notices');
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1});
module.exports={setup};
