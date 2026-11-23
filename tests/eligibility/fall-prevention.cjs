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
 ['intervention','exclude','所有训练均在医疗机构内完成的项目','Programmes in which all training sessions took place in healthcare facilities'],
];
const englishBySource=new Map(fields.map(([, ,quote,text])=>[quote,text]));
const chineseByEnglish=new Map(fields.map(([, ,quote,text])=>[text.toLowerCase(),quote.replace(/^降低(?=随访)/,'')]));
const listLabels=new Map([
 ['Eligibility criteria','纳入与排除标准'],['Inclusion','纳入标准'],['Exclusion','排除标准'],
 ['Population','人群'],['Intervention','干预'],['Comparison','对照'],['Study design','研究设计'],
 ['Review topic','研究主题'],['Framework','研究框架'],['Outcomes','结局'],['Description','说明'],
 ['Domain','要素'],['Include','纳入'],['Exclude','排除'],
]);
const config={frameworkConfig:require('../../config/eligibility-frameworks.json'),profileConfig:require('../../config/eligibility-review-profiles.json'),baseURL:'http://localhost/'};
function extracted(source,[dimension_id,disposition,quote,normalized_text],index){
 return {candidate_id:'model'+index,dimension_id,disposition,normalized_text,source_refs:[{source_id:source.source_id,source_revision:source.revision,quote}],
  structured_value:null,semantic_role:disposition?'eligibility_condition':'review_focus',information_status:'explicit',scope_status:disposition?'restricted':'unspecified'};
}
function connect(page,calls,{fullButIncomplete=false}={}){
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
   response={items:payload.items.map(item=>({id:item.id,normalized_text:englishBySource.get(item.source_quotes[0].quote),structured_value:null}))};
  }else if(step==='review_normalization'){
   assert.equal(payload.items.length,1);
   response={items:payload.items.map(item=>{
    const shortened=fullButIncomplete&&item.normalized_text==='Home-based exercise programmes';
    return {...item,status:shortened?'uncertain':'supported',issue_type:shortened?'unsupported_rewrite':'none',
     reason:shortened?'The original requires balance training.':'Matches the original clause.',
     reviewer:{provider:'typesafe',verdict:shortened?'wording_or_scope':'supported',confidence:.99,choice_probability:.99}};
   })};
  }else{
   assert.equal(step,'translate_criteria');
   response={items:payload.items.map(({id,text})=>{
   const normalized=text.trim().replace(/\.$/,'').toLowerCase();
   let translation=listLabels.get(text)||chineseByEnglish.get(normalized);
   if(text.startsWith('We will include'))translation='本综述纳入符合条件的随机对照试验，评估随访期间至少跌倒一次的风险。';
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
 assert.match(preview,/lang="zh"[\s\S]*研究主题：[\s\S]*社区老年人的居家运动计划[\s\S]*研究框架：<\/strong> PICOS[\s\S]*纳入标准[\s\S]*以平衡训练为必备内容的居家运动计划[\s\S]*结局：[\s\S]*随访期间至少跌倒一次的风险[\s\S]*排除标准[\s\S]*所有训练均在医疗机构内完成的项目[\s\S]*<h3>说明<\/h3>[\s\S]*本综述纳入/);
 const word=Buffer.from(page.api.export()).toString('utf8');
 assert.match(word,/纳入与排除标准[\s\S]*研究主题[\s\S]*社区老年人的居家运动计划[\s\S]*研究框架： PICOS[\s\S]*<w:tbl>[\s\S]*所有训练均在医疗机构内完成的项目[\s\S]*随访期间至少跌倒一次的风险[\s\S]*说明/);
 assert.equal(calls.filter(call=>call.step==='review_normalization').length,fullButIncomplete?7:6);
});
