const {test}=require('node:test');
const assert=require('node:assert/strict');
const Engine=require('../../app/eligibility/engine.js');
const Background=require('../../app/eligibility/background.js');
const {setup}=require('../../tools/test_eligibility_grounding.cjs');

const objective='对于使用胰岛素的成年 2 型糖尿病患者，与指尖血糖监测相比，实时连续血糖监测能否降低 6 个月时的糖化血红蛋白（HbA1c）水平？';
const condition='若试验同时纳入 1 型和 2 型糖尿病患者，仅在能够单独提取使用胰岛素的成年 2 型糖尿病患者的数据时纳入';
const question=objective+'仅纳入随机对照试验。'+condition+'。';
const population='Insulin-treated adults with type 2 diabetes';
const conditional=population+' (trials enrolling participants with both type 1 and type 2 diabetes are eligible only if data for insulin-treated adults with type 2 diabetes can be extracted separately)';
const comparison='Fingerstick blood glucose monitoring';
const treatment='Real-time continuous glucose monitoring';
const outcome='Glycated haemoglobin (HbA1c) level at 6 months';
const config={
 frameworkConfig:require('../../config/eligibility-frameworks.json'),
 profileConfig:require('../../config/eligibility-review-profiles.json'),baseURL:'http://localhost/',
};

async function generate(input,{review,repair}={}){
 const page=setup(),calls=[];
 Object.assign(page.ctx.window,{
  AIMSTEPEligibilityEngine:Engine,AIMSTEPEligibilityBackground:{...Background,create:args=>Background.create({...args,...config})}
 });
 page.api.transport(async(url,options)=>{
  const {step,payload}=JSON.parse(JSON.parse(options.body).messages[1].content);
  calls.push({step,payload});
  let response;
  if(step==='extract_elements'){
   const q=payload.question,source=q.sources[0];
   // The reported response copied the research question into Population.
   response={source_language:'zh',questions:[{question_id:q.question_id,review_topic:objective,
    framework_candidates:['picos'],issues:[],logic:null,elements:[{
     candidate_id:'p',dimension_id:'population',normalized_text:objective,structured_value:null,
     source_refs:[{source_id:source.source_id,source_revision:source.revision,quote:objective}],
     semantic_role:'eligibility_condition',information_status:'explicit',scope_status:'restricted',disposition:'include'
    }]}]};
  }else if(step==='review_normalization'){
   assert.equal(payload.items.length,1);
   response={items:payload.items.map(item=>({...item,status:'supported',issue_type:'none',reason:'Verified.',
    reviewer:{provider:'typesafe',verdict:'supported',confidence:.99,choice_probability:.99},...review?.(item)}))};
  }else if(step==='repair_candidate_wording'){
   response={items:payload.items.map(item=>({id:item.id,normalized_text:repair?.(item)||conditional,structured_value:null}))};
  }else{
   assert.equal(step,'translate_criteria');
   response={items:payload.items.map(({id,text})=>{
    const translated={
     'Eligibility criteria':'纳排标准','Review topic':'研究主题','Framework':'框架','Inclusion':'纳入','Exclusion':'排除','Description':'文字描述',
     'Population':'人群','Intervention':'干预','Comparison':'对照','Outcomes':'结局','Study design':'研究设计',
     [conditional]:'使用胰岛素的成年 2 型糖尿病患者（若试验同时纳入 1 型和 2 型糖尿病患者，仅在能够单独提取使用胰岛素的成年 2 型糖尿病患者的数据时纳入）',
     [treatment]:'实时连续血糖监测',[comparison]:'指尖血糖监测',
     [outcome]:'6 个月时的糖化血红蛋白（HbA1c）水平',
     'Randomised controlled trials':'随机对照试验',
     'Real-time continuous glucose monitoring in insulin-treated adults with type 2 diabetes':'使用胰岛素的成年 2 型糖尿病患者的实时连续血糖监测',
    };
    const prose='我们将纳入比较实时连续血糖监测和指尖血糖监测的随机对照试验，研究对象为使用胰岛素的成年 2 型糖尿病患者。若试验同时纳入 1 型和 2 型糖尿病患者，仅在能够单独提取使用胰岛素的成年 2 型糖尿病患者的数据时纳入。研究结局为 6 个月时的糖化血红蛋白（HbA1c）水平。';
    return {id,text:translated[text.replace(/\.$/,'')]||(text.startsWith('We will include')&&text.includes('can be extracted separately')?prose:text)};
   })};
  }
  return {ok:true,json:async()=>({message:{content:JSON.stringify(response)},
   ...(step==='review_normalization'&&{provider:'typesafe',review:{policy:'jev-once-v1'}})})};
 },'backend');
 const method=page.el('generation-method');method.value='machine';method.handlers.change();
 page.el('question').value=input;
 await page.el('start-machine').handlers.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(page.el('generation-status').textContent,'');
 return {page,state:page.api.state(),calls,preview:page.el('preview').innerHTML};
}

for(const [label,tail] of [
 ['reported wording',condition],
 ['paraphrased conditional','如果研究也招募 1 型及 2 型糖尿病患者，只在可以分别获得使用胰岛素的成年 2 型糖尿病患者的数据时才纳入该研究']
])test('a mixed-population condition stays in Population with '+label,async()=>{
 const {page,state,calls,preview}=await generate(question.replace(condition,tail));
 const snapshot=state.eligibilityV3Snapshot,stored=snapshot.questions[0];
 assert.equal(snapshot.status,'final');
 assert.equal(snapshot.validation.valid,true);
 assert.deepEqual(stored.include.map(c=>c.dimension_id).sort(),['comparator','intervention','population','study_design']);
 assert.equal(stored.include.find(c=>c.dimension_id==='population').text,conditional);
 assert.match(stored.include.find(c=>c.dimension_id==='comparator').text,/fingerstick/i);
 assert.equal(stored.include.find(c=>c.dimension_id==='intervention').text,treatment);
 assert.equal(stored.focus[0].normalized_text,outcome);
 assert.equal(stored.exclude.length,0);
 assert.equal(state.machineRefinement.sourceConfirmations.length,0);
 assert.equal(calls.filter(({step})=>step==='review_normalization').length,5);
 assert(!calls.some(({step})=>step==='repair_candidate_wording'));
 const pop=calls.find(({step,payload})=>step==='review_normalization'&&payload.items[0].dimension_id==='population').payload.items[0];
 assert.deepEqual(pop.source_quotes.map(r=>r.quote),['使用胰岛素的成年 2 型糖尿病患者',tail]);
 assert(!pop.source_quotes.some(r=>r.quote===objective));
 const english=preview.split('data-criteria-localization')[0];
 assert.doesNotMatch(english,/\p{Script=Han}/u);
 assert.doesNotMatch(english,/Generation incomplete/);
 assert.match(english,/only if data for insulin-treated adults with type 2 diabetes can be extracted separately/);
 assert.match(state.machineRefinement.manuscriptParagraph,/Trials enrolling participants with both type 1 and type 2 diabetes are eligible only if/);
 assert.match(preview,/data-criteria-localization[\s\S]*能够单独提取使用胰岛素的成年 2 型糖尿病患者的数据[\s\S]*>无。</);
 assert.match(Buffer.from(page.api.export()).toString(),/data for insulin-treated adults[\s\S]*能够单独提取使用胰岛素的成年 2 型糖尿病患者的数据/);
});

test('an unresolved population condition keeps independent fields and cannot publish a copied question',async()=>{
 const tail='混杂队列的处理仍待定。如果研究招募了其他患者，只有目标人群的数据可供单独分析才纳入。';
 const {state,preview,calls}=await generate(question.replace(condition+'。',tail));
 const stored=state.eligibilityV3Snapshot.questions[0];
 assert.equal(state.eligibilityV3Snapshot.status,'incomplete');
 assert.equal(stored.include.some(c=>c.dimension_id==='population'),false);
 assert.deepEqual(stored.include.map(c=>c.dimension_id).sort(),['comparator','intervention','study_design']);
 assert.equal(stored.focus[0].normalized_text,outcome);
 assert.match(preview,/Generation incomplete/);
 assert.doesNotMatch(preview.split('data-criteria-document')[1],/对于使用胰岛素/);
 const p=calls.filter(({step})=>step==='review_normalization').flatMap(({payload})=>payload.items);
 assert(!p.some(item=>item.dimension_id==='population'));
});

test('a correction that drops subgroup data separability cannot enter screening',async()=>{
 const {state,calls}=await generate(question,{review(item){
  if(item.dimension_id==='population'&&item.normalized_text===conditional)return {status:'contradicted',issue_type:'unsupported_rewrite'};
 },repair:()=>population});
 assert.equal(state.eligibilityV3Snapshot.status,'incomplete');
 assert.equal(state.eligibilityV3Snapshot.questions[0].include.some(c=>c.dimension_id==='population'),false);
 assert(calls.some(({step,payload})=>step==='repair_candidate_wording'&&payload.items[0].separable_population));
});

test('an uncertain field check retries with an explicit role and keeps the verified arm wording',async()=>{
 const {state,calls}=await generate(question,{review(item){
  if(['intervention','comparator'].includes(item.dimension_id)&&!item.normalized_text.startsWith('The ')){
   return {status:'uncertain',issue_type:'ambiguous_source',
    reviewer:{provider:'typesafe',verdict:'low_confidence',original_verdict:'wrong_field',confidence:.48,choice_probability:.57}};
  }
 }});
 assert.equal(state.eligibilityV3Snapshot.status,'final');
 const items=calls.filter(call=>call.step==='review_normalization').map(({payload})=>payload.items[0]);
 assert(items.some(item=>item.normalized_text==='The intervention in the stated comparison is '+treatment+'.'));
 assert(items.some(item=>item.normalized_text==='The comparator in the stated comparison is '+comparison.toLowerCase()+'.'));
 const criteria=state.eligibilityV3Snapshot.questions[0].include;
 assert.equal(criteria.find(c=>c.dimension_id==='intervention').text,treatment);
 assert.equal(criteria.find(c=>c.dimension_id==='comparator').text,comparison.toLowerCase());
});
