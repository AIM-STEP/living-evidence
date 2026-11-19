/* Regression checks with simulated model replies and the real frontend/engine. */
const assert=require('node:assert/strict'),E=require('../../app/eligibility/engine.js'),B=require('../../app/eligibility/background.js'),{setup}=require('../../tools/test_eligibility_grounding.cjs');
const fixture=require('./fixtures/nutrition-ipd-nma.json'),frameworks=require('../../config/eligibility-frameworks.json'),profiles=require('../../config/eligibility-review-profiles.json');
(async()=>{
 const t=setup();t.ctx.window.AIMSTEPEligibilityEngine=E;t.ctx.window.AIMSTEPEligibilityBackground={...B,create:options=>B.create({...options,baseURL:'http://localhost/',frameworkConfig:frameworks,profileConfig:profiles})};
 t.api.transport(async(url,options)=>{
  const envelope=JSON.parse(JSON.parse(options.body).messages[1].content),payload=envelope.payload;let result;
  if(envelope.step==='extract_elements'){
   const q=payload.question,source=q.sources.find(s=>s.input_kind==='research_question');
   const make=(candidate_id,dimension_id,quote,normalized_text=quote)=>({candidate_id,dimension_id,normalized_text,structured_value:null,source_refs:[{source_id:source.source_id,source_revision:source.revision,quote}],semantic_role:'eligibility_condition',information_status:'explicit',scope_status:'restricted',disposition:'include'});
   result={questions:[{question_id:q.question_id,review_topic:'Nutritional interventions in hospitalised older people.',framework_candidates:[{framework_id:'pico',basis:'Simulated'}],elements:[
    make('p','population','hospitalised older people at risk of or with established malnutrition'),make('i','intervention','various nutritional interventions','nutritional interventions'),
    make('c1','other',fixture.research_question,'standard care or placebo.'),make('c2','comparison_group','each other','nutritional interventions'),{...make('o','outcome','patient-relevant outcomes'),semantic_role:'review_focus',scope_status:'unspecified',disposition:null}],
    issues:[{reason_code:'AMBIGUOUS_MEANING',question_text:'Which assessment defines nutritional risk?',scope_impact:'Defines the intended population.',element_candidate_ids:['p']}],
    logic:{op:'all_of',children:[{op:'predicate',element_id:'p'},{op:'predicate',element_id:'i'},{op:'any_of',children:[{op:'predicate',element_id:'c1'},{op:'predicate',element_id:'c2'}]}]}}]};
  }else if(envelope.step==='review_normalization')result={items:payload.items.map(item=>({id:item.id,status:'supported',reason:'Simulated source review',issue_type:'none',information_status:item.information_status,semantic_role:item.semantic_role,scope_status:item.scope_status,disposition:item.disposition}))};
  else throw Error('Unexpected step');
  return {ok:true,json:async()=>({message:{content:JSON.stringify(result)},model:'Simulated'})};
 });
 t.el('generation-method').value='machine';t.el('generation-method').handlers.change();t.el('question').value=fixture.research_question;await t.el('start-machine').handlers.click();
 let state=t.api.state();assert(state.machineRun,t.el('generation-status').textContent);const rows=state.machineRefinement.rows;
 assert(!rows.some(r=>r.dimension==='Other'));assert(rows.find(r=>r.dimension==='Comparison').include.join(' ').includes('another nutritional intervention'));
 const checks=state.machineRefinement.sourceConfirmations;assert(checks.some(c=>c.text.includes('Which assessment defines nutritional risk?')),'Actual source questions must reach the user');
 assert(!checks.some(c=>['Intervention','Comparison','Outcomes','Analysis plan','Data plan'].includes(c.domain)),'Broad, clearly stated scope is accepted directly');
 const preview=t.el('preview').innerHTML;assert(!preview.includes('Review focus and analysis plan'));assert(preview.includes('patient-relevant outcomes'));assert(preview.includes('individual participant data'));
 const exported=Buffer.from(t.api.export()).toString('utf8');assert(!exported.includes('Review focus and analysis plan'));assert(!exported.includes('Author checks pending'));assert(exported.includes('patient-relevant outcomes'));
 assert(state.machineRefinement.focusRows.length);assert(!Object.hasOwn(t.api.normalized(),'focusRows'));
 const risk='Which assessment defines nutritional risk?';
 const populationRow=rows.find(r=>r.dimension==='Population');
 assert(checks.filter(c=>c.domain==='Population').every(c=>c.locations.some(l=>l.rule===populationRow.include[0])),'Both the age subelement and risk issue belong on the source population rule');
 assert(preview.indexOf(risk)>preview.indexOf('data-criteria-row="0"'));assert(preview.indexOf(risk)<preview.indexOf('data-criteria-row="1"'));
 assert(preview.slice(preview.lastIndexOf('aria-label="Description"')).endsWith('</span></p></section></div>'),'Description ends the preview');
 const xml=exported.slice(exported.indexOf('<w:document'),exported.indexOf('</w:document>'));
 assert(xml.indexOf(risk)<xml.indexOf('>Intervention<'),'Word places the question inside the affected row');
 assert(xml.lastIndexOf('</w:p>')>xml.indexOf('>Description<'));assert.equal(xml.slice(xml.indexOf('>Description<')).match(/<w:p>/g).length,1,'Only the Description paragraph follows its heading');
 const savedChecks=state.machineRefinement.sourceConfirmations;
 const targets=[{id:'p',label:'Population & setting'},{id:'o',label:'Outcomes'}];
 const placed=structuredClone(savedChecks[0]);placed.text='Linked question';placed.answerTargets=targets;placed.locations=[
  {domain:'Framework',section:'framework'},{domain:'Outcomes',section:'focus',subject:'outcome of interest',targetId:'o'},
  {domain:'Unused group',section:'exclude',subject:'Source eligibility wording',targetId:'p'}];
 const sameDomain=structuredClone(savedChecks[0]);sameDomain.text='Second rule question';
 populationRow.include.push('Second population rule.');
 sameDomain.locations=[{domain:'Population',section:'include',rule:'Second population rule.'}];
 state.machineRefinement.sourceConfirmations=[placed,sameDomain];
 t.api.fill();const routed=t.el('preview').innerHTML;
 assert.equal(routed.split('Linked question').length-1,3,'Cross-element checks must appear at each affected location');
 const scopes=[...routed.matchAll(/Linked question<\/p>[\s\S]*?<select data-source-target="0">([^]*?)<\/select>/g)].map(match=>match[1]);
 assert.equal(scopes.length,3);
 assert(scopes.every(scope=>scope.includes('Population &amp; setting')&&scope.includes('<option value="*">All listed criteria</option>')));
 assert.equal(scopes.filter(scope=>!scope.includes(' selected')).length,1,'A shared location must start with no target');
 assert.equal(scopes.filter(scope=>scope.includes('value="p" selected')).length,1);
 assert.equal(scopes.filter(scope=>scope.includes('value="o" selected')).length,1);
 assert(routed.indexOf('>Framework:</strong>')<routed.indexOf('Linked question',routed.indexOf('>Framework:</strong>'))&&routed.indexOf('Linked question',routed.indexOf('>Framework:</strong>'))<routed.indexOf('>Inclusion</h3>'));
 assert(routed.indexOf('Second population rule.')<routed.indexOf('Second rule question')&&routed.indexOf('Second rule question')<routed.indexOf('>Intervention:</strong>'));
 assert(routed.indexOf('>Exclusion</h3>')<routed.indexOf('Unused group'));assert(!routed.includes('Outcomes · Review focus'));assert(routed.includes('outcome of interest')&&routed.indexOf('outcome of interest')<routed.indexOf('>Framework:</strong>'));
 state.machineRefinement.sourceConfirmations=savedChecks;populationRow.include.pop();t.api.fill();
 assert(checks.some(c=>c.text.includes('age boundary')));assert(t.el('preview').innerHTML.includes('data-source-answer='),'Unresolved questions need a working answer field');
 t.api.denyModelAccess();
 const ageIndex=checks.findIndex(c=>c.text.includes('age boundary'));t.ctx.document.querySelector=()=>({value:'65 years or older',focus(){}});
 // Exercise the actual row's option and Apply handlers independently of the engine target validator.
 for(const [choice,selection] of [[0,'p'],['answer','*']]){
  const scoped=setup(new Map(t.storage)),requests=[];
  scoped.ctx.window.AIMSTEPEligibilityEngine=E;
  scoped.ctx.window.AIMSTEPEligibilityBackground={...B,create:async options=>{
   const service=await t.ctx.window.AIMSTEPEligibilityBackground.create(options);
   return {...service,decide({target_id,...request}){requests.push({target_id,...request});return service.decide(request);}};
  }};
  scoped.api.denyModelAccess();
  const localIssue=scoped.api.state().machineRefinement.sourceConfirmations[ageIndex];
  localIssue.answerTargets=targets;
  const selector={value:'',focus(){this.focused=true;}},field={value:'65 years or older'};
  const form={querySelector:key=>key==='[data-source-target]'?selector:field};
  const button={dataset:{sourceConfirm:String(ageIndex),sourceOption:String(choice)},closest:()=>form};
  const click=()=>scoped.el('preview').handlers.click({target:{closest:()=>button}});
  assert.equal(await click(),false);assert(selector.focused);assert.equal(requests.length,0);
  selector.value=selection;
  const saved=click();
  selector.value='o';field.value='changed after submission';
  assert(await saved,scoped.el('generation-status').textContent);assert.equal(requests.length,1);
  assert.equal(requests[0].target_id,selection);assert.equal(requests[0].issue_id,localIssue.issue_id);
  assert.equal(requests[0].answer_text,choice==='answer'?'65 years or older':localIssue.options[0].label);
 }
 // Submit two independent checks before the local service finishes initialising.
 const queued=setup(new Map(t.storage));
 queued.ctx.window.AIMSTEPEligibilityEngine=E;
 queued.ctx.window.AIMSTEPEligibilityBackground=t.ctx.window.AIMSTEPEligibilityBackground;
 queued.api.denyModelAccess();
 const riskIndex=checks.findIndex(c=>c.text.includes(risk));
 const ageAnswer='65 years or older',riskAnswer='Use the Mini Nutritional Assessment.';
 const ageField={value:ageAnswer},riskField={value:riskAnswer};
 const both=[queued.api.confirm(ageIndex,'answer',ageField),queued.api.confirm(riskIndex,'answer',riskField)];
 ageField.value=riskField.value='Changed after submission';
 assert.deepEqual(await Promise.all(both),[true,true],queued.el('generation-status').textContent);
 const projectAfterBoth=JSON.parse(queued.storage.get('aimstep-eligibility-v3:synthetic-grounding'));
 assert.deepEqual(projectAfterBoth.decisions.slice(-2).map(d=>[d.issue_ids[0],d.answer_text]),[[checks[ageIndex].issue_id,ageAnswer],[checks[riskIndex].issue_id,riskAnswer]]);
 assert(!queued.api.state().machineRefinement.sourceConfirmations.some(c=>[checks[riskIndex].issue_id,checks[ageIndex].issue_id].includes(c.issue_id)));
 assert(await t.api.confirm(ageIndex,'answer'),t.el('generation-status').textContent);state=t.api.state();
 assert(state.machineCriteria.some(r=>r.condition.includes('65')),'A real author answer must update the criteria');
 assert(state.machineRefinement.sourceConfirmations.some(c=>c.text.includes('Which assessment defines nutritional risk?')),'Unanswered questions must remain pending');
 const service=await B.create({projectId:'synthetic-grounding',storage:t.ctx.localStorage,frameworkConfig:frameworks,profileConfig:profiles,baseURL:'http://localhost/'});
 const edited=structuredClone(state);edited.machineCriteria[0].condition+=' Author edit.';assert.equal(service.refreshPresentation(edited),null,'Presentation refresh must preserve author edits');
 const proseEdit=structuredClone(state);
 Object.assign(proseEdit.machineRefinement,{editedAt:new Date().toISOString(),descriptionEditedByAuthor:true,manuscriptParagraph:'Author-edited description.'});
 proseEdit.previewEditHistory=[{changes:[]}];
 const beforeEdit=service.current(),pendingIds=project=>project.issues.filter(issue=>issue.status==='open').map(issue=>issue.issue_id);
 const afterEdit=service.recordEdit(state,proseEdit).project;
 assert.equal(afterEdit.revision,beforeEdit.revision+1);
 assert.deepEqual(pendingIds(afterEdit),pendingIds(beforeEdit));
 assert.deepEqual(afterEdit.elements,beforeEdit.elements);
 const project=service.current(),q=project.questions.find(q=>q.active!==false),find=dimension=>project.elements.filter(e=>e.active!==false&&e.dimension_id===dimension&&e.information_status!=='missing');
 const population=find('population')[0],intervention=find('intervention')[0],comparisons=find('comparator'),leaf=e=>({op:'predicate',element_id:e.element_id});
 q.logic={op:'any_of',children:comparisons.map(c=>({op:'all_of',children:[leaf(population),leaf(intervention),leaf(c)]}))};E.rebuild(project);
 const factored=B.projectToClassic(project);assert(!factored.rows.some(r=>r.dimension==='Other'),'Equivalent comparison branches must stay in PICO domains');assert(factored.rows.find(r=>r.dimension==='Comparison').include.join(' ').includes(' or '));
 console.log('PASS: comparator aliases and source context, unresolved source questions, author answer application and edit-safe presentation refresh');
})().catch(error=>{console.error(error.stack);process.exitCode=1});
