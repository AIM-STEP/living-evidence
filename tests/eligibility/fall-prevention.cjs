const {test}=require('node:test');
const assert=require('node:assert/strict');
const Engine=require('../../app/eligibility/engine.js');
const Background=require('../../app/eligibility/background.js');
const {setup}=require('../../tools/test_eligibility_grounding.cjs');

const question='对于居住在社区、过去一年内至少跌倒过一次的老年人，与常规照护或单纯健康教育相比，以平衡训练为必备内容的居家运动计划能否降低随访期间至少跌倒一次的风险？仅纳入随机对照试验，排除所有训练均在医疗机构内完成的项目。';
const fields=[
 ['population','include','居住在社区、过去一年内至少跌倒过一次的老年人','Community-dwelling older adults who have fallen at least once in the past year'],
 ['comparator','include','常规照护或单纯健康教育','Usual care or health education alone'],
 ['intervention','include','以平衡训练为必备内容的居家运动计划','Home-based exercise programmes with balance training as a required component'],
 ['outcome',null,'降低随访期间至少跌倒一次的风险','Risk of falling at least once during follow-up'],
 ['study_design','include','随机对照试验','Randomised controlled trials'],
 ['intervention','exclude','所有训练均在医疗机构内完成的项目','Programmes in which all training took place in healthcare facilities'],
];
const englishBySource=new Map(fields.map(([, ,quote,text])=>[quote,text]));
const chineseByEnglish=new Map(fields.map(([, ,quote,text])=>[text.toLowerCase(),quote.replace(/^降低(?=随访)/,'')]));
const listLabels=new Map([
 ['Eligibility criteria','入选标准'],['Inclusion','纳入标准'],['Exclusion','排除标准'],
 ['Population','人群'],['Intervention','干预'],['Comparison','对照'],['Study design','研究设计'],
 ['Review topic','综述主题'],['Framework','研究框架'],['Outcomes','结局'],['Description','描述'],
 ['Domain','要素'],['Include','纳入'],['Exclude','排除'],
]);
const config={frameworkConfig:require('../../config/eligibility-frameworks.json'),profileConfig:require('../../config/eligibility-review-profiles.json'),baseURL:'http://localhost/'};
function extracted(source,[dimension_id,disposition,quote,normalized_text],index){
 return {candidate_id:'model'+index,dimension_id,disposition,normalized_text,source_refs:[{source_id:source.source_id,source_revision:source.revision,quote}],
  structured_value:null,semantic_role:disposition?'eligibility_condition':'review_focus',information_status:'explicit',scope_status:disposition?'restricted':'unspecified'};
}
function connect(page,calls,{fullButIncomplete=false,reviewVerdict,firstWording}={}){
 page.api.transport(async(url,options)=>{
  const {step,payload}=JSON.parse(JSON.parse(options.body).messages[1].content);
  calls.push({step,payload});
  let response;
  if(step==='extract_elements'){
   const q=payload.question,source=q.sources[0];
   const responseFields=fullButIncomplete?[fields[0],[...fields[2].slice(0,3),'Home-based exercise programmes']]:[fields[0]];
   response={source_language:fullButIncomplete?'zh':'en',questions:[{question_id:q.question_id,review_topic:'Community-dwelling older adults',
    framework_candidates:['picos'],elements:responseFields.map((field,index)=>extracted(source,field,index)),issues:[],
    logic:{op:'predicate',element_id:'model0'}}]};
  }else if(step==='repair_candidate_wording'){
   response={items:payload.items.map(item=>({id:item.id,normalized_text:firstWording?.(item)||
    englishBySource.get(item.source_quotes[0].quote),structured_value:null}))};
  }else if(step==='review_normalization'){
   assert.equal(payload.items.length,1);
   response={items:payload.items.map(item=>{
    const shortened=fullButIncomplete&&item.normalized_text==='Home-based exercise programmes';
    const assessment=reviewVerdict?.(item);
    return {...item,status:shortened?'uncertain':'supported',issue_type:shortened?'unsupported_rewrite':'none',
     reason:shortened?'The original requires balance training.':'Matches the original clause.',
     reviewer:{provider:'typesafe',verdict:shortened?'wording_or_scope':'supported',confidence:.99,choice_probability:.99},...assessment};
   })};
  }else{
   assert.equal(step,'translate_criteria');
   response={items:payload.items.map(({id,text})=>{
   const normalized=text.trim().replace(/\.$/,'').toLowerCase();
   let translation=listLabels.get(text)||chineseByEnglish.get(normalized);
   if(text.startsWith('We will include'))translation='本综述纳入符合条件的随机对照试验，评估随访期间至少跌倒一次的风险。。';
   if(!translation&&normalized.startsWith('home-based exercise programmes')&&normalized.includes('community-dwelling older adults'))translation='社区老年人的居家运动计划。';
   return {id,text:translation||text};
  })};
  }
  return {ok:true,json:async()=>({message:{content:JSON.stringify(response)},
   ...(step==='review_normalization'&&{provider:'typesafe',review:{policy:'jev-once-v1'}})})};
 },'backend');
}
for(const fullButIncomplete of [false,true])test('Chinese comparative question retains all explicit fields after '+(fullButIncomplete?'an incomplete normalisation':'a population-only extraction'),async()=>{
 const page=setup(),calls=[];
 Object.assign(page.ctx.window,{AIMSTEPEligibilityEngine:Engine,AIMSTEPEligibilityBackground:{...Background,create:args=>Background.create({...args,...config})}});
 connect(page,calls,{fullButIncomplete});
 const selector=page.el('generation-method');
 selector.value='machine';selector.handlers.change();
 page.el('question').value=question;
 await page.el('start-machine').handlers.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(page.el('generation-status').textContent,'');
 const preview=page.el('preview').innerHTML,state=page.api.state();
 const first=calls.find(call=>call.step==='extract_elements');
 assert.deepEqual(first.payload.source_defined_fields.map(field=>field.quote),fields.map(field=>field[2]));
 assert.equal(state.framework,'PICOS');
 assert.match(state.machineRefinement.reviewTopic,/home-based exercise/i);
 for(const [, , ,text] of fields)assert(preview.toLowerCase().includes(text.toLowerCase()),text+' is visible');
 assert.equal(state.machineRefinement.sourceConfirmations.length,0,JSON.stringify(state.machineRefinement.sourceConfirmations.map(x=>x.text)));
 assert.equal(state.eligibilityV3Snapshot.questions[0].focus[0].dimension_id,'outcome');
 assert(!state.eligibilityV3Snapshot.questions[0].include.some(criterion=>criterion.dimension_id==='outcome'));
 assert(state.eligibilityV3Snapshot.questions[0].exclude.some(criterion=>criterion.text.includes('all training')));
 assert.match(state.machineRefinement.manuscriptParagraph,/at least once during follow-up/i);
 assert.match(preview,/lang="zh"[\s\S]*研究主题：[\s\S]*社区老年人的居家运动计划[\s\S]*研究框架：<\/strong> PICOS[\s\S]*纳入标准[\s\S]*以平衡训练为必备内容的居家运动计划[\s\S]*结局：[\s\S]*随访期间至少跌倒一次的风险[\s\S]*排除标准[\s\S]*所有训练均在医疗机构内完成的项目[\s\S]*<h3>文字描述<\/h3>[\s\S]*本综述纳入/);
 assert.match(preview,/<h3>纳排标准<\/h3>/);
 assert.doesNotMatch(preview,/入选标准|综述主题|风险。。/);
 const word=Buffer.from(page.api.export()).toString('utf8');
 assert.match(word,/纳排标准[\s\S]*研究主题[\s\S]*社区老年人的居家运动计划[\s\S]*研究框架： PICOS[\s\S]*<w:tbl>[\s\S]*所有训练均在医疗机构内完成的项目[\s\S]*随访期间至少跌倒一次的风险[\s\S]*文字描述/);
 assert.equal(calls.filter(call=>call.step==='review_normalization').length,fullButIncomplete?7:6);
});

async function buildQuestion(source,options){
 const page=setup(),calls=[];
 Object.assign(page.ctx.window,{AIMSTEPEligibilityEngine:Engine,AIMSTEPEligibilityBackground:{...Background,create:args=>Background.create({...args,...config})}});
 connect(page,calls,options);
 const choice=page.el('generation-method');
 choice.value='machine';choice.handlers.change();
 page.el('question').value=source;
 await page.el('start-machine').handlers.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(page.el('generation-status').textContent,'');
 return {state:page.api.state(),page,calls};
}
test('exact Chinese comparator and intervention exclusion reach Jev with their governing clauses',async()=>{
 const {state,page,calls}=await buildQuestion(question,{reviewVerdict(item){
  if(item.dimension_id!=='comparator'&&item.disposition!=='exclude')return;
  return {status:'uncertain',issue_type:'ambiguous_source',reviewer:{
   provider:'typesafe',verdict:'low_confidence',original_verdict:'supported',confidence:.82,choice_probability:.82}};
 }});
 const checked=calls.filter(call=>call.step==='review_normalization').map(call=>call.payload.items[0]);
 const comparison=checked.find(item=>item.dimension_id==='comparator');
 assert.equal(comparison.normalized_text,'usual care or health education alone');
 assert.equal(comparison.source_quotes[0].context,'与常规照护或单纯健康教育相比');
 const exclusion=checked.find(item=>item.disposition==='exclude');
 assert.equal(exclusion.source_quotes[0].context,'排除所有训练均在医疗机构内完成的项目');
 const saved=state.eligibilityV3Snapshot.questions[0];
 assert.match(saved.elements.find(e=>e.dimension_id==='comparator').semantic_review.reason,/complete source field/);
 assert(saved.include.some(criterion=>criterion.dimension_id==='comparator'&&/usual care or health education alone/.test(criterion.text)));
 assert(saved.exclude.some(criterion=>/all training/.test(criterion.text)));
 const preview=page.el('preview').innerHTML;
 assert.match(preview,/lang="zh"[\s\S]*常规照护或单纯健康教育[\s\S]*所有训练均在医疗机构内完成的项目/);
});
test('copied original-language conditions get a repair after the first wording is rejected by Jev',async()=>{
 const alternative='禁止运动训练的健康教育';
 const text=question.replace('单纯健康教育',alternative);
 const {state,calls}=await buildQuestion(text,{
  firstWording:item=>item.dimension_id==='comparator'?
   (item.review_feedback?'Usual care or health education without exercise training':'Usual care'):undefined,
  reviewVerdict:item=>item.dimension_id==='comparator'&&item.normalized_text==='Usual care'?
   {status:'uncertain',issue_type:'unsupported_rewrite',reason:'The second alternative is missing.'}:undefined,
 });
 const repairs=calls.filter(call=>call.step==='repair_candidate_wording'&&call.payload.items[0].dimension_id==='comparator');
 assert.equal(repairs.length,2);
 assert.match(repairs[1].payload.items[0].review_feedback,/joined by OR/);
 const passed=state.eligibilityV3Snapshot.questions[0].include.find(row=>row.dimension_id==='comparator');
 assert.match(passed?.text,/Usual care or health education without exercise training/);
});

const Model=require('../../app/eligibility/model.js');
const preventionQuestion='对于居住在社区的 65 岁及以上老年人，与常规照护相比，居家平衡训练能否降低 12 个月内至少跌倒一次的风险？仅纳入随机对照试验，允许按个人或社区随机分组。既往是否跌倒过均不影响纳入。';
const needsWaiver='既往是否跌倒过均不影响纳入';
const randomisation='允许按个人或社区随机分组';
const fallPopulation='Community-dwelling older adults aged 65 years or older, regardless of prior fall history';
const fallDesign='Individually randomised or community-randomised controlled trials';
const fallOutcome='Risk of falling at least once within 12 months';
const fallTitle='Home-based balance training in community-dwelling older adults';

test('community fall prevention retains the intervention, permitted trial designs and neutral fall history in both languages',async()=>{
 const page=setup(),reviews=[];
 Object.assign(page.ctx.window,{AIMSTEPEligibilityEngine:Engine,AIMSTEPEligibilityBackground:{...Background,create:args=>Background.create({...args,...config})}});
 page.api.transport(async(url,options)=>{
  const {step,payload}=JSON.parse(JSON.parse(options.body).messages[1].content);
  let response;
  if(step==='extract_elements'){
   const q=payload.question,source=q.sources[0];
   const elements=[
    extracted(source,['population','include','居住在社区的 65 岁及以上老年人','Community-dwelling older adults aged 65 years and above'],0),
    extracted(source,['study_design','include','随机对照试验','Randomised controlled trials'],1),
   ];
   assert.deepEqual(payload.source_defined_fields.filter(field=>field.qualification).map(field=>field.qualification),[needsWaiver,randomisation]);
   response={source_language:'zh',questions:[{question_id:q.question_id,review_topic:'Community-dwelling older adults and above',framework_candidates:['picos'],elements,issues:[],logic:null}]};
  }else if(step==='review_normalization'){
   const [item]=payload.items;
   assert.equal(payload.items.length,1);
   reviews.push(item);
   const lowConfidence=item.dimension_id==='intervention';
   response={items:[{...item,status:lowConfidence?'uncertain':'supported',
    issue_type:lowConfidence?'ambiguous_source':'none',reason:'Faithful to the original wording.',
    reviewer:lowConfidence?{provider:'typesafe',verdict:'low_confidence',original_verdict:'supported',confidence:.67,choice_probability:.71}:
     {provider:'typesafe',verdict:'supported',confidence:.97,choice_probability:.99}}]};
  }else{
   assert.equal(step,'translate_criteria');
   const wording=new Map([
    [fallPopulation.toLowerCase(),'65 岁及以上的社区居住老年人，既往跌倒史不限'],
    [fallDesign.toLowerCase(),'按个人或社区随机分组的随机对照试验'],
    [fallOutcome.toLowerCase(),'12 个月内至少跌倒一次的风险'],
    [fallTitle.toLowerCase(),'社区老年人的居家平衡训练'],
    ['home-based balance training','居家平衡训练'],['usual care','常规照护'],
   ]);
   response={items:payload.items.map(({id,text})=>({id,text:listLabels.get(text)||
    wording.get(text.trim().replace(/\.$/,'').toLowerCase())||(text.startsWith('We will include')?
     '我们将纳入比较居家平衡训练与常规照护的随机对照试验，允许按个人或社区随机分组。对象为 65 岁及以上的社区居住老年人，既往跌倒史不限。研究结局为 12 个月内至少跌倒一次的风险。':text)}))};
  }
  return {ok:true,json:async()=>({message:{content:JSON.stringify(response)},
   ...(step==='review_normalization'&&{provider:'typesafe',review:{policy:'jev-once-v1'}})})};
 },'backend');
 const choice=page.el('generation-method');
 choice.value='machine';choice.handlers.change();
 page.el('question').value=preventionQuestion;
 await page.el('start-machine').handlers.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(page.el('generation-status').textContent,'');
 const state=page.api.state(),snapshot=state.eligibilityV3Snapshot,q=snapshot.questions[0],preview=page.el('preview').innerHTML;
 assert.equal(snapshot.status,'final');
 assert.equal(snapshot.validation.completeness.eligibility.incomplete,false);
 assert.equal(state.machineRefinement.reviewTopic,fallTitle);
 assert.equal(reviews.length,5);
 assert.match(q.elements.find(e=>e.dimension_id==='intervention').semantic_review.reason,/complete source field/);
 for(const [dimension,quote] of [['population',needsWaiver],['study_design',randomisation]]){
  assert(reviews.find(item=>item.dimension_id===dimension).source_quotes.some(ref=>ref.quote===quote));
 }
 assert.deepEqual(q.include.map(c=>c.dimension_id).sort(),['comparator','intervention','population','study_design']);
 assert.equal(q.include.find(c=>c.dimension_id==='population').text,fallPopulation);
 assert.equal(q.include.find(c=>c.dimension_id==='study_design').text,fallDesign);
 assert.equal(q.focus[0].normalized_text,fallOutcome);
 assert.equal(q.exclude.length,0);
 assert.match(state.machineRefinement.manuscriptParagraph,/individually randomised or community-randomised controlled trials/i);
 assert.match(state.machineRefinement.manuscriptParagraph,/regardless of prior fall history/i);
 assert.match(preview,/Home-based balance training[\s\S]*lang="zh"[\s\S]*居家平衡训练/);
 assert.match(preview,/65 岁及以上的社区居住老年人，既往跌倒史不限/);
 assert.match(preview,/按个人或社区随机分组的随机对照试验/);
 assert.match(preview,/12 个月内至少跌倒一次的风险[\s\S]*>无。</);
 assert.doesNotMatch(preview,/Generation incomplete|生成不完整|and above/);
 const word=Buffer.from(page.api.export()).toString('utf8');
 assert.match(word,/community-randomised controlled trials[\s\S]*按个人或社区随机分组/);
});

test('paraphrased Chinese eligibility preserves the actual age, period and named randomisation units',async()=>{
 const source=preventionQuestion.replace('65 岁及以上','70岁以上').replace('12 个月','６个月')
  .replace(randomisation,'允许以个体或学校为单位进行随机分配').replace(needsWaiver,'不论既往有无跌倒史，均可纳入');
 const env=Engine.environment(),original=Engine.save_input(Engine.create_project('fall-variation'),{research_question:source,output_language:'en'}, {},env).state;
 const model={async request(step,state,payload){
  if(step==='extract_elements')return {questions:[{question_id:payload.question.question_id,framework_candidates:[],elements:[],issues:[],logic:null}]};
  assert.equal(step,'review_normalization');
  return {items:payload.items.map(item=>({...item,status:'supported',issue_type:'none',reason:'Supported.'}))};
 }};
 const {candidates}=await Model.analyze(original,env,model,{languageSample:source});
 const result=Engine.ingest_candidates(original,candidates,{},env).state;
 assert.equal(result.status,'final');
 assert(result.criteria.some(c=>c.dimension_id==='population'&&c.text.includes('70 years or older, regardless of prior fall history')));
 assert(result.criteria.some(c=>c.dimension_id==='study_design'&&/individually randomised or school-randomised/i.test(c.text)));
 assert(result.elements.some(e=>e.semantic_role==='review_focus'&&e.normalized_text.includes('within 6 months')));
});
