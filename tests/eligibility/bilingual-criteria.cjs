const {test}=require('node:test');
const assert=require('node:assert/strict');
const {setup}=require('../../tools/test_eligibility_grounding.cjs');
const Background=require('../../app/eligibility/background.js');
const Engine=require('../../app/eligibility/engine.js');
const Library=require('../../app/eligibility-library.js');
const Reset=require('../../app/eligibility-reset.js');

const projectId='synthetic-grounding';
const english=['Adults aged at least 18 years','Case reports'];
const french=['Adultes âgés d’au moins 18 ans','Rapports de cas'];
const chinese=['至少18岁的成年人','病例报告'];
const frenchTerms=new Map([
 ['Eligibility criteria','Critères d’admissibilité'],['Inclusion','Inclusion'],['Exclusion','Exclusion'],
 ['Population','Population'],['Study design','Type d’étude'],['No explicit exclusion rules entered.','Aucun critère d’exclusion explicite.'],
 ...english.map((text,index)=>[text,french[index]]),
 ['Aged ≥18 years','Âgés de ≥18 ans'],['Adults aged at least 21 years','Adultes âgés d’au moins 21 ans'],
]);
const chineseTerms=new Map([
 ['Eligibility criteria','纳入与排除标准'],['Inclusion','纳入标准'],['Exclusion','排除标准'],
 ['Population','人群'],['Study design','研究设计'],['Aged ≥18 years','年龄≥18岁'],['Case reports','病例报告'],
]);
function open(storage){
 const page=setup(storage);
 page.ctx.confirm=()=>true;
 page.el('machine-attachments').replaceChildren=()=>{};
 Object.assign(page.ctx.window,{AIMSTEPEligibilityEngine:Engine,AIMSTEPEligibilityBackground:{
  ...Background,create:args=>Background.create({...args,frameworkConfig:require('../../config/eligibility-frameworks.json'),
   profileConfig:require('../../config/eligibility-review-profiles.json'),baseURL:'http://localhost/'}),
 },AimstepEligibilityLibrary:Library,AimstepEligibilityReset:Reset});
 return page;
}
function mockModel(page,calls,{language='fr',beforeTranslation,alterTranslation}={}){
 const words={en:english,fr:french,zh:chinese}[language];
 const terms=language==='zh'?chineseTerms:frenchTerms;
 page.api.transport(async(url,options)=>{
  const {step,payload,output_language}=JSON.parse(JSON.parse(options.body).messages[1].content);
  calls.push({step,payload,output_language});
  let answer;
  if(step==='extract_elements'){
   const q=payload.question,source=q.sources.find(item=>item.input_kind==='research_question');
   const elements=words.map((quote,index)=>({
    candidate_id:String(index),dimension_id:index?'study_design':'population.age',normalized_text:english[index],
    structured_value:index?null:{operator:'gte',value:18,unit:'year'},
    source_refs:[{source_id:source.source_id,source_revision:source.revision,quote}],
    information_status:'explicit',semantic_role:'eligibility_condition',scope_status:'restricted',disposition:index?'exclude':'include',
   }));
   answer={source_language:language,questions:[{question_id:q.question_id,review_topic:'Eligibility of adults',
    framework_candidates:['picos'],elements,issues:[],logic:null}]};
  }else if(step==='repair_candidate_wording'){
   answer={items:payload.items.map(item=>({...item,normalized_text:english[words.findIndex(word=>item.normalized_text.includes(word))]||item.normalized_text}))};
  }else if(step==='review_normalization'){
   answer={items:payload.items.map(item=>({...item,status:'supported',issue_type:'none',reason:'Verified against the original',
    reviewer:{provider:'typesafe',verdict:'supported',confidence:.99,choice_probability:.99}}))};
  }else{
   assert.equal(step,'translate_criteria');
   assert.equal(payload.target_language,language);
   assert.equal(output_language,language);
   await beforeTranslation?.();
   answer={items:payload.items.map(({id,text})=>({id,text:alterTranslation?.(text)||terms.get(text.replace(/[.]$/u,''))||terms.get(text)||text}))};
  }
  return {ok:true,json:async()=>({message:{content:JSON.stringify(answer)},...(step==='review_normalization'?{provider:'typesafe',review:{policy:'jev-once-v1'}}:{})})};
 },'backend');
}
async function generate(page,mode,words){
 const select=page.el('generation-method');
 select.value=mode;select.handlers.change();
 if(mode==='machine'){
  page.el('question').value=words.join('. ')+'.';
  await page.el('start-machine').handlers.click();
  assert.equal(page.el('generation-status').textContent,'');
 }else{
  Object.assign(page.api.state(),{framework:'PICOS',manualFramework:'PICOS',criteria:[
   {id:'INC-01',title:'Population',condition:words[0]},
   {id:'INC-05',title:'Study design',uncertain:words[1]},
  ]});
  page.api.fill();
  await page.el('refine-manual').handlers.click();
  assert.equal(page.el('manual-refine-status').textContent,'');
 }
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

for(const mode of ['machine','manual'])test(mode+' input saves and exports English criteria followed by the original-language copy',async()=>{
 const page=open(),calls=[],area=page.el('preview');
 mockModel(page,calls);
 await generate(page,mode,french);
 await flush();
 const extraction=calls.find(call=>call.step==='extract_elements');
 assert.equal(extraction.output_language,'en');
 assert.match(extraction.payload.question_language_sample,/Adultes/);
 assert.doesNotMatch(extraction.payload.question_language_sample,/Inclusion criteria|Population:/);
 const saved=JSON.parse(page.storage.get('aimstep-eligibility:'+projectId));
 const copy=saved.machineRun.translation;
 assert.equal(copy.language,'fr');
 assert(copy.rows.some(row=>row.include.includes('Âgés de ≥18 ans')));
 assert(copy.rows.some(row=>row.exclude.includes(french[1])));
 assert.match(area.innerHTML,/data-criteria-document[\s\S]*Aged ≥18 years[\s\S]*Case reports[\s\S]*data-criteria-localization lang="fr"[\s\S]*Âgés de ≥18 ans[\s\S]*Rapports de cas/);
 const word=Buffer.from(page.api.export()).toString('utf8');
 assert.match(word,/Aged ≥18 years[\s\S]*Critères d’admissibilité[\s\S]*Âgés de ≥18 ans/);
 const savedSet=Library.read(page.ctx.localStorage,projectId).entries[0];
 assert.deepEqual(savedSet.snapshot.machineRun.translation,copy);
 assert.match(open(page.storage).el('preview').innerHTML,/lang="fr"[\s\S]*Rapports de cas/);
});

test('English input retains one criteria set and skips translation',async()=>{
 const page=open(),calls=[];
 mockModel(page,calls,{language:'en'});
 await generate(page,'machine',english);
 await flush();
 assert.equal(page.api.state().machineRun.inputLanguage,'en');
 assert(!calls.some(call=>call.step==='translate_criteria'));
 assert.doesNotMatch(page.el('preview').innerHTML,/data-criteria-localization/);
});

test('a translation that changes numeric scope can be retried without altering the English criteria',async()=>{
 const page=open(),area=page.el('preview'),calls=[];
 mockModel(page,calls,{alterTranslation:text=>text.includes('18')?'Adultes âgés d’au moins 25 ans':null});
 await generate(page,'machine',french);
 await flush();
 assert.match(area.innerHTML,/data-retry-criteria-translation/);
 assert.match(area.innerHTML,/Aged ≥18 years/);
 assert.doesNotMatch(area.innerHTML,/25 ans/);
 assert.equal(page.api.state().machineRun.translation,undefined);
 mockModel(page,calls);
 area.handlers.click({target:{closest:()=>({dataset:{retryCriteriaTranslation:''}})}});
 await flush();
 assert.match(area.innerHTML,/Âgés de ≥18 ans/);
});

test('saving a revised English rule refreshes the translation from the saved content',async()=>{
 const page=open(),area=page.el('preview'),calls=[];
 mockModel(page,calls);
 await generate(page,'machine',french);
 await flush();
 const editor={childNodes:[{nodeType:3,nodeValue:'Inclusion\nPopulation: Adults aged at least 21 years.\n\nExclusion\nStudy design: Case reports.'}]};
 area.querySelector=()=>editor;
 area.handlers.input({target:{closest:selector=>selector==='[data-criteria-document]'?editor:null}});
 assert(page.el('save-criteria').handlers.click());
 assert.doesNotMatch(area.innerHTML,/Âgés de ≥18 ans/);
 await flush();
 assert.match(area.innerHTML,/Adults aged at least 21 years[\s\S]*Adultes âgés d’au moins 21 ans/);
 assert.equal(calls.filter(call=>call.step==='translate_criteria').length,2);
});

test('an in-flight translation cannot restore a cleared project',async()=>{
 const page=open(),calls=[];
 let resolveTranslation,beginTranslation;
 const waiting=new Promise(resolve=>{resolveTranslation=resolve;});
 const started=new Promise(resolve=>{beginTranslation=resolve;});
 mockModel(page,calls,{beforeTranslation:()=>{beginTranslation();return waiting;}});
 await generate(page,'machine',french);
 await started;
 assert(page.el('clear-criteria').handlers.click());
 resolveTranslation();
 await flush();
 assert.equal(page.api.state().machineRun,null);
 assert.doesNotMatch(page.el('preview').innerHTML,/Adultes|data-criteria-localization/);
});

test('Chinese input preserves numerals and separates the two criteria languages',async()=>{
 const page=open(),calls=[];
 mockModel(page,calls,{language:'zh'});
 await generate(page,'machine',chinese);
 await flush();
 assert.match(page.el('preview').innerHTML,/Aged ≥18 years[\s\S]*lang="zh"[\s\S]*纳入标准[\s\S]*年龄≥18岁[\s\S]*排除标准[\s\S]*病例报告/);
});

test('validation of unparsed source-language quantities still requires exact digits and Jev support',()=>{
 const {check_semantics}=require('../../app/eligibility/domain.js');
 const source=[{quote:'Adultes âgés d’au moins 18 ans'}];
 const element={dimension_id:'population.age',source_language:'fr',normalized_text:'Adults aged ≥18 years',
  structured_value:{operator:'gte',value:18,unit:'year'},
  semantic_review:{status:'supported',reviewer:{provider:'typesafe',verdict:'supported'}}};
 assert(check_semantics(element,source));
 assert.throws(()=>check_semantics({...element,semantic_review:{status:'supported'}},source),{code:'NUMERIC_SCOPE_CHANGE'});
 assert.throws(()=>check_semantics({...element,normalized_text:'Adults aged ≥25 years',structured_value:{operator:'gte',value:25,unit:'year'}},source),
  {code:'NUMERIC_SCOPE_CHANGE'});
 assert.throws(()=>check_semantics(element,[{quote:'Adultes âgés de >18 ans'}]),{code:'NUMERIC_SCOPE_CHANGE'});
});
