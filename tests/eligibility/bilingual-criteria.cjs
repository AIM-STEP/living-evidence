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
 ['Population','Population'],['Study design','Type d’étude'],['None.','Aucun.'],
 ['Review topic','Sujet de la revue'],['Framework','Cadre'],['Description','Description'],
 ['Domain','Domaine'],['Include','Inclure'],['Exclude','Exclure'],['Review population and scope','Population et portée de la revue'],
 ['We will include studies of participants aged 18 years or older. We will exclude Case reports.',
  'Nous inclurons les études portant sur des participants de 18 ans ou plus. Nous exclurons les rapports de cas.'],
 ['Follow-up takes place at home.','Le suivi a lieu à domicile.'],['The author’s first note.','Première note de l’auteur.'],['The author’s second note.','Deuxième note de l’auteur.'],
 ['Author check','Vérification de l’auteur'],['Source','Source'],['Pending','En attente'],
 ['Confirm the proposed setting.','Confirmer le lieu proposé.'],['Community setting','Milieu communautaire'],
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
   })).filter(element=>source.original_text.includes(element.source_refs[0].quote));
   answer={source_language:language,questions:[{question_id:q.question_id,review_topic:'Eligibility of adults',
    framework_candidates:['picos'],elements,issues:[],logic:null}]};
  }else if(step==='repair_candidate_wording'){
   answer={items:payload.items.map(item=>({...item,normalized_text:english[words.findIndex(word=>item.normalized_text.includes(word))]||item.normalized_text}))};
  }else if(step==='review_normalization'){
   answer={items:payload.items.map(item=>({...item,status:'supported',issue_type:'none',reason:'Verified against the original',
    reviewer:{provider:'typesafe',verdict:'supported',confidence:.99,choice_probability:.99}}))};
  }else{
   assert.equal(step,'translate_criteria');
   if(payload.target_language==='en'){
    assert.equal(output_language,'en');
    const edits=new Map([['Personnes âgées de 21 ans ou plus.','Adults aged at least 21 years.'],
     ['Suivi à domicile.','Follow-up takes place at home.']]);
    answer={items:payload.items.map(({id,text})=>({id,text:edits.get(text)||text}))};
   }else{
    assert.equal(payload.target_language,language);
    assert.equal(output_language,language);
    await beforeTranslation?.();
    answer={items:payload.items.map(({id,text})=>({id,text:alterTranslation?.(text)||terms.get(text.replace(/[.]$/u,''))||terms.get(text)||text}))};
   }
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
 assert.equal(copy.texts['Aged ≥18 years'],'Âgés de ≥18 ans');
 assert.equal(copy.texts['Case reports'],french[1]);
 const localized=area.innerHTML.split('data-criteria-localization lang="fr"')[1];
 assert.match(localized,/<strong>Sujet de la revue:<\/strong>[\s\S]*<strong>Cadre:<\/strong> PICOS[\s\S]*<h3>Inclusion<\/h3>[\s\S]*<h3>Exclusion<\/h3>[\s\S]*<h3>Description<\/h3>[\s\S]*Nous inclurons/);
 assert.match(localized,/data-localized-criteria-document contenteditable="plaintext-only"/);
 assert.match(area.innerHTML,/data-criteria-document[\s\S]*Aged ≥18 years[\s\S]*Case reports[\s\S]*data-criteria-localization lang="fr"[\s\S]*Âgés de ≥18 ans[\s\S]*Rapports de cas/);
 const word=Buffer.from(page.api.export()).toString('utf8');
 assert.match(word,/Aged ≥18 years[\s\S]*Critères d’admissibilité[\s\S]*Sujet de la revue[\s\S]*Cadre: PICOS[\s\S]*<w:tbl>[\s\S]*Domaine[\s\S]*Inclure[\s\S]*Exclure[\s\S]*Âgés de ≥18 ans[\s\S]*Description[\s\S]*Nous inclurons/);
 assert.equal((word.match(/<w:tbl>/g)||[]).length,2);
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
 const editor={childNodes:[{nodeType:3,nodeValue:'Inclusion\nPopulation: Adults aged at least 21 years.\n\nExclusion\nStudy design: Case reports.\n\nDescription\nThe author’s first note.\n\nThe author’s second note.'}]};
 area.querySelector=()=>editor;
 area.handlers.input({target:{closest:selector=>selector==='[data-criteria-document]'?editor:null}});
 assert(page.el('save-criteria').handlers.click());
 assert.doesNotMatch(area.innerHTML,/Âgés de ≥18 ans/);
 await flush();
 assert.match(area.innerHTML,/Adults aged at least 21 years[\s\S]*Adultes âgés d’au moins 21 ans/);
 assert.match(area.innerHTML,/data-criteria-localization[\s\S]*Première note de l’auteur\.\n\nDeuxième note de l’auteur\./);
 assert(calls.filter(call=>call.step==='translate_criteria').some(call=>call.payload.items.some(item=>item.text.includes('21 years'))));
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

test('legacy translations are refreshed and pending author checks remain in their matching section',async()=>{
 const page=open(),calls=[];
 mockModel(page,calls);
 await generate(page,'machine',french);
 await flush();
 const state=page.api.state();
 state.machineRun={...state.machineRun,translation:{key:'legacy',language:'fr',labels:{title:'Old copy'},rows:[]}};
 state.machineRefinement.sourceConfirmations=[{
  issue_id:'synthetic-pending',status:'suggested',kind:'proposal',backgroundIssue:true,text:'Confirm the proposed setting.',
  options:[{label:'Keep the source wording',option_id:'retain'}],evidence:[{quote:'Cadre communautaire'}],
  locations:[{domain:'Population',section:'include',subject:'Community setting'}],
 }];
 page.storage.set('aimstep-eligibility:'+projectId,JSON.stringify(state));
 const before=calls.length;
 page.api.fill();
 await flush();
 const preview=page.el('preview').innerHTML;
 const [original,localized]=preview.split('data-criteria-localization lang="fr"');
 assert.match(original,/Pending · Community setting[\s\S]*Confirm the proposed setting\./);
 assert.match(localized,/<h3>Inclusion<\/h3>[\s\S]*En attente · Milieu communautaire[\s\S]*Vérification de l’auteur:[\s\S]*Confirmer le lieu proposé\.[\s\S]*Cadre communautaire[\s\S]*<h3>Exclusion<\/h3>/);
 assert.doesNotMatch(localized,/data-source-confirm=/);
 assert(calls.slice(before).length);
 assert(calls.slice(before).every(call=>call.step==='translate_criteria'));
});

test('translation of a long description carries all sentences across bounded requests',async()=>{
 const model=require('../../app/eligibility/model.js');
 const source='Include participants with at least 12 months of follow-up. ';
 const translated='Inclure les participants ayant au moins 12 mois de suivi.';
 const prose=source.repeat(90).trim();
 const plan=model.translationPlan('fr',['Description',prose]);
 let calls=0;
 const result=await model.translateCriteria(plan,async({items})=>{
  calls++;
  for(const item of items)assert(item.text.length<=2400);
  return {items:items.map(({id,text})=>({id,text:text==='Description'?'Présentation':text.split(source.trim()).slice(1).map(()=>translated).join(' ')}))};
 });
 assert(calls>1);
 assert.equal(result.texts[prose],Array(90).fill(translated).join(' '));
});

test('author edits made in the original language update one set of screening rules and both outputs',async()=>{
 const page=open(),area=page.el('preview'),calls=[];
 mockModel(page,calls);
 await generate(page,'machine',french);
 await flush();
 const editor={childNodes:[{nodeType:3,nodeValue:'Inclusion\nPopulation: Personnes âgées de 21 ans ou plus.\n\nExclusion\nType d’étude: Rapports de cas.\n\nDescription\nSuivi à domicile.'}]};
 area.querySelector=selector=>selector==='[data-localized-criteria-document]'?editor:null;
 area.handlers.input({target:{closest:selector=>selector==='[data-localized-criteria-document]'?editor:null}});
 assert(await page.el('save-criteria').handlers.click());
 await flush();
 const state=page.api.state();
 assert.match(state.machineRefinement.rows.find(row=>row.dimension==='Population').include[0],/21 years/);
 assert.match(state.eligibilityV3Snapshot.questions[0].include[0].text,/21 years/);
 assert.equal(state.previewEditHistory.at(-1).sourceLanguage,'fr');
 assert.match(state.previewEditHistory.at(-1).authorText,/Suivi à domicile/);
 const [en,fr]=area.innerHTML.split('data-criteria-localization');
 assert.match(en,/Adults aged at least 21 years[\s\S]*Follow-up takes place at home/);
 assert.match(fr,/Personnes âgées de 21 ans ou plus[\s\S]*Suivi à domicile/);
 const reverse=calls.find(call=>call.step==='translate_criteria'&&call.payload.target_language==='en');
 assert.deepEqual(reverse.payload.items.map(item=>item.text),['Personnes âgées de 21 ans ou plus.','Suivi à domicile.']);
 const word=Buffer.from(page.api.export()).toString('utf8');
 assert.match(word,/Adults aged at least 21 years[\s\S]*Personnes âgées de 21 ans ou plus[\s\S]*Suivi à domicile/);
});

for(const [language,source,empty] of [['zh',chinese,'无。'],['fr',french,'Aucun.']]){
 test('an empty exclusion section uses the meaning of “None” in the '+language+' preview and export',async()=>{
  const page=open(),calls=[];
  mockModel(page,calls,{language});
  await generate(page,'machine',source.slice(0,1));
  await flush();
  const preview=page.el('preview').innerHTML;
  assert.match(preview,/Not reporting\./);
  assert(preview.split('data-criteria-localization')[1].includes('>'+empty+'</p>'));
  const word=Buffer.from(page.api.export()).toString('utf8');
  assert(word.includes('>'+empty+'</w:t>'));
  if(language==='fr'){
   const inputs=calls.filter(call=>call.step==='translate_criteria').flatMap(call=>call.payload.items.map(item=>item.text));
   assert(inputs.includes('None.'));
   assert(!inputs.includes('Not reporting.'));
  }
 });
}
