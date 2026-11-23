const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Engine=require('../../app/eligibility/engine.js');
const Background=require('../../app/eligibility/background.js');
const Model=require('../../app/eligibility/model.js');
const Library=require('../../app/eligibility-library.js');
const {setup}=require('../../tools/test_eligibility_grounding.cjs');

const question='对于出院回家的成年心力衰竭患者，与常规出院随访相比，护士主导的电话随访能否降低出院后 90 天内的全因再入院风险？仅考虑随机对照试验。若电话随访与家庭访视联合实施，仅在对照组也接受相同家庭访视时纳入。';
const population='Adults with heart failure discharged home';
const intervention='Nurse-led telephone follow-up';
const comparator='Usual post-discharge follow-up';
const studyDesign='Randomised controlled trials';
const outcome='Risk of all-cause readmission within 90 days after discharge';
const matched=(extra='home visits')=>intervention+' (when telephone follow-up is combined with '+extra+
 ', studies are eligible only if the control group also receives the same '+extra+')';
const clinicalWording=new Map([
 ['出院回家的成年心力衰竭患者',population],['随机对照试验',studyDesign],
]);
const translatedText=new Map([
 ['Eligibility criteria','纳排标准'],['Framework','框架'],['Inclusion','纳入标准'],['Exclusion','排除标准'],
 ['Population','人群'],['Intervention','干预'],['Comparison','对照'],['Study design','研究设计'],['Outcomes','结局'],
 [population,'出院回家的成年心力衰竭患者'],[comparator,'常规出院随访'],[studyDesign,'随机对照试验'],
 [outcome,'出院后 90 天内的全因再入院风险'],[matched(),'护士主导的电话随访（若联合家庭访视，仅纳入对照组也接受相同家庭访视的试验）'],
]);
const config={
 frameworkConfig:require('../../config/eligibility-frameworks.json'),
 profileConfig:require('../../config/eligibility-review-profiles.json'),baseURL:'http://localhost/',
};

async function generate(input,{repair,review,extract}={}){
 const page=setup(),calls=[];
 Object.assign(page.ctx.window,{AIMSTEPEligibilityEngine:Engine,AIMSTEPEligibilityBackground:{...Background,create:args=>Background.create({...args,...config})}});
 page.api.transport(async(url,options)=>{
  const {step,payload}=JSON.parse(JSON.parse(options.body).messages[1].content);
  calls.push({step,payload});
  let response;
  if(step==='extract_elements'){
   // The model returns no candidates, reproducing the previous blank result.
   response={source_language:'en',questions:[{question_id:payload.question.question_id,review_topic:'Review population and scope',
    framework_candidates:['picos'],elements:extract?.(payload)||[],issues:[],logic:null}]};
  }else if(step==='repair_candidate_wording'){
   response={items:payload.items.map(item=>({id:item.id,normalized_text:repair?.(item)||clinicalWording.get(item.source_quotes[0].quote),structured_value:null}))};
  }else if(step==='review_normalization'){
   assert.equal(payload.items.length,1);
   response={items:payload.items.map(item=>({...item,status:'supported',issue_type:'none',reason:'Matches the original.',
    reviewer:{provider:'typesafe',verdict:'supported',confidence:.99,choice_probability:.99},...review?.(item)}))};
  }else{
   assert.equal(step,'translate_criteria');
   response={items:payload.items.map(({id,text})=>{
    let translation=translatedText.get(text.replace(/\.$/,''))||translatedText.get(text);
    if(text.startsWith('We will include')&&text.includes('same home visits')){
     translation='本综述纳入出院回家的成年心力衰竭患者的随机对照试验，比较护士主导的电话随访与常规出院随访。若电话随访联合家庭访视，仅纳入对照组也接受相同家庭访视的试验。结局为出院后 90 天内的全因再入院风险。';
    }
    if(text.startsWith('Nurse-led telephone follow-up in'))translation='出院回家的成年心力衰竭患者的护士主导电话随访。';
    return {id,text:translation||text};
   })};
  }
  return {ok:true,json:async()=>({message:{content:JSON.stringify(response)},
   ...(step==='review_normalization'&&{provider:'typesafe',review:{policy:'jev-once-v1'}})})};
 },'backend');
 const selector=page.el('generation-method');
 selector.value='machine';selector.handlers.change();
 page.el('question').value=input;
 await page.el('start-machine').handlers.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(page.el('generation-status').textContent,'');
 return {page,calls,state:page.api.state(),preview:page.el('preview').innerHTML};
}

test('a blank extraction recovers the complete discharge question and preserves the matched co-intervention',async()=>{
 const {page,calls,state,preview}=await generate(question);
 const extracted=calls.find(call=>call.step==='extract_elements').payload.source_defined_fields;
 assert.deepEqual(extracted.map(field=>field.dimension),['population','comparator','intervention','outcome','study_design']);
 assert.match(extracted.find(field=>field.dimension==='intervention').conditional_inclusion,/仅在对照组也接受相同家庭访视时纳入/);
 const reviews=calls.filter(call=>call.step==='review_normalization').map(call=>call.payload.items[0]);
 assert.equal(reviews.length,5);
 const interventionCheck=reviews.find(item=>item.dimension_id==='intervention');
 assert.equal(interventionCheck.normalized_text,matched());
 assert.deepEqual(interventionCheck.source_quotes.map(ref=>ref.quote),['护士主导的电话随访','若电话随访与家庭访视联合实施，仅在对照组也接受相同家庭访视时纳入']);
 const stored=state.eligibilityV3Snapshot.questions[0];
 assert.deepEqual(stored.include.map(c=>c.dimension_id).sort(),['comparator','intervention','population','study_design']);
 assert.equal(stored.include.find(c=>c.dimension_id==='intervention').text,matched());
 assert.equal(stored.focus[0].normalized_text,outcome);
 assert.equal(stored.exclude.length,0);
 assert.equal(state.machineRefinement.sourceConfirmations.length,0);
 assert.match(state.machineRefinement.reviewTopic,/^Nurse-led telephone follow-up in /i);
 assert.match(state.machineRefinement.manuscriptParagraph,/comparing nurse-led telephone follow-up with usual post-discharge follow-up in adults with heart failure discharged home\./i);
 assert.match(state.machineRefinement.manuscriptParagraph,/When telephone follow-up is combined with home visits, studies are eligible only if the control group also receives the same home visits\./i);
 assert.match(preview,/lang="zh"[\s\S]*护士主导的电话随访[\s\S]*对照组也接受相同家庭访视[\s\S]*出院后 90 天内的全因再入院风险[\s\S]*>无。<[\s\S]*>文字描述</);
 const word=Buffer.from(page.api.export()).toString('utf8');
 assert.match(word,/only if the control group also receives the same home visits[\s\S]*对照组也接受相同家庭访视/);
});

const otherCondition=question.replaceAll('家庭访视','药师指导');
for(const incomplete of [false,true]){
 test('a co-intervention qualifier is '+(incomplete?'never silently omitted after a failed repair':'retained after a correction'),async()=>{
  const {page,calls,state,preview}=await generate(otherCondition,{repair(item){
   if(item.dimension_id!=='intervention')return;
   return !item.review_feedback||incomplete?intervention:matched('pharmacist counselling');
  }});
  const attempts=calls.filter(call=>call.step==='repair_candidate_wording'&&call.payload.items[0].dimension_id==='intervention');
  assert.equal(attempts.length,2);
  assert.match(attempts[1].payload.items[0].review_feedback,/conditional requirement/);
  const rule=state.eligibilityV3Snapshot.questions[0].include.find(c=>c.dimension_id==='intervention');
  assert.equal(rule?.text,incomplete?undefined:matched('pharmacist counselling'));
  const coverage=state.eligibilityV3Snapshot.validation.completeness.eligibility;
  assert.equal(coverage.incomplete,incomplete);
  assert.equal(Library.incompleteCriteria(state),incomplete);
  assert.equal(state.machineRefinement.sourceConfirmations.length,0);
  if(incomplete){
   assert.equal(state.eligibilityV3Snapshot.status,'incomplete');
   assert.deepEqual(state.eligibilityV3Snapshot.questions[0].include.map(c=>c.dimension_id).sort(),['comparator','population','study_design']);
   assert.match(preview,/Generation incomplete[\s\S]*药师指导/);
   assert.match(preview,/lang="zh"[\s\S]*生成不完整/);
   assert.equal(page.storage.has('aimstep-eligibility-summary:synthetic-grounding'),false);
   const scope='synthetic-grounding',localStorage=page.ctx.localStorage;
   assert(Library.hasIncompleteCriteria(localStorage,scope));
   assert(!Library.hasIncompleteCriteria(localStorage,scope,'upload'));
   for(const file of ['title-abstract-screening.html','full-text-screening.html']){
    const html=fs.readFileSync(file,'utf8');
    const guard=html.match(/^function screeningStagesReady\(\)\{.+\}$/m)[0];
    const context={scope,localStorage,workspace:{},source:{},AimstepEligibilityLibrary:Library,
     AimstepScreeningStages:{valid:()=>true}};
    assert.equal(vm.runInNewContext(guard+';screeningStagesReady()',context),false,file);
    assert.equal(vm.runInNewContext(guard+';screeningStagesReady()',{
     ...context,localStorage:{getItem:()=>null}
    }),true,file);
   }
   assert.match(Buffer.from(page.api.export()).toString(),/Generation incomplete[\s\S]*药师指导[\s\S]*生成不完整/);
  }
 });
}


test('design paraphrase retains all fields and the independent home-visit qualifier',async()=>{
 const {calls,state}=await generate(question.replace('仅考虑随机对照试验','研究设计仅限随机对照试验'));
 const result=state.eligibilityV3Snapshot;
 assert.equal(result.status,'final');
 assert.equal(result.validation.valid,true);
 assert.equal(result.validation.completeness.eligibility.source_coverage.length,5);
 assert.equal(calls.filter(call=>call.step==='review_normalization').length,5);
 assert.deepEqual(result.questions[0].include.map(c=>c.dimension_id).sort(),['comparator','intervention','population','study_design']);
 assert.equal(result.questions[0].include.find(c=>c.dimension_id==='intervention').text,matched());
 assert.equal(result.questions[0].focus[0].normalized_text,outcome);
});

test('known fields are checked before retrying a missed clause, and a poorer retry does not erase them',async()=>{
 const input=question.replace(/若电话.*$/u,'除非两组都提供同等家庭访视，否则排除合并家庭访视的试验。');
 const {calls,state}=await generate(input,{extract(payload){
  if(payload.validation_feedback?.code==='SOURCE_COVERAGE'){
   assert(payload.source_requirements.some(item=>item.source_refs[0].quote.includes('除非')));
   assert(!payload.source_requirements.some(item=>item.dimension==='population'));
   return [];
  }
  const source=payload.question.sources[0];
  return [{candidate_id:'p',dimension_id:'population',normalized_text:population,structured_value:null,
   source_refs:[{source_id:source.source_id,source_revision:source.revision,quote:'出院回家的成年心力衰竭患者'}],
   semantic_role:'eligibility_condition',information_status:'explicit',scope_status:'restricted',disposition:'include'}];
 }});
 const target=calls.findIndex(call=>call.payload.validation_feedback?.code==='SOURCE_COVERAGE');
 assert(target>calls.findIndex(call=>call.step==='review_normalization'));
 const result=state.eligibilityV3Snapshot;
 assert.equal(result.status,'incomplete');
 assert.equal(result.validation.valid,false);
 assert.equal(result.validation.completeness.eligibility.all_scope_information_accounted_for,false);
 assert.equal(result.questions[0].include[0].text,population);
 assert.equal(result.questions[0].exclude.length,0);
});

test('an attached protocol contributes explicit exclusions but its results do not become criteria',async()=>{
 const env=Engine.environment();
 const state=Engine.save_input(Engine.create_project('coverage-attachment'),{research_question:'Exercise'}).state;
 const q=state.questions[0],source=Engine.addSource(state,'user_input',
  'Exclusion criteria:\nStudy design: Case reports.\nResults:\nPopulation: Ten participants.',
  [q.question_id],'protocol',{input_kind:'original_document'});
 q.imported_source_refs.push(Engine.ref(source));
 const mock={request:async(step,project,payload)=>{
  if(step==='extract_elements')return {questions:[{question_id:q.question_id,review_topic:'Exercise',
   framework_candidates:['picos'],elements:[],issues:[],logic:null}]};
  assert.fail('Nothing should reach review');
 }};
 const {candidates}=await Model.analyze(state,env,mock,{retries:0});
 const project=Engine.ingest_candidates(state,candidates,{},env).state;
 assert.equal(project.status,'incomplete');
 assert.deepEqual(project.validation.completeness.eligibility.source_coverage.map(item=>[
  item.dimension,item.side,item.source_refs[0].quote,item.status]),[['study_design','exclude','Case reports','unresolved']]);
 assert.equal(project.criteria.length,0);
});
