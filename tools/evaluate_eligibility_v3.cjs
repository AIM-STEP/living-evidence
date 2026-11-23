/* Real model evaluation using reported examples and synthetic cases with source-derived expectations. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),E=require('../app/eligibility/engine.js'),M=require('../app/eligibility/model.js'),D=require('../app/eligibility/domain.js');
const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const chosen=arg('--case','all'),base=arg('--base',process.env.AIMSTEP_ELIGIBILITY_MODEL_BASE||'http://127.0.0.1:8765/api/eligibility'),output=path.resolve(arg('--output','/tmp/aimstep-eligibility-real-evaluation')),exchange=arg('--exchange-dir',null),replay=arg('--replay',null);
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const neonatal=require('../tests/eligibility/fixtures/neonatal-resuscitation.cjs');
const cases=[
 {id:'stroke-balance-training',input:{research_question:'In adults recovering from stroke, compared with usual rehabilitation or an education booklet, does supervised home balance training reduce falls within 12 weeks? Include only randomised controlled trials.',output_language:'en'},
  expected:{coverage:true,eligibility_dimensions:['population','comparator','intervention','study_design'],comparator:/usual rehabilitation or an education booklet/i,outcome:/falls within 12 weeks/i}},

 {id:'mixed-diabetes-cohort',input:{research_question:'对于使用胰岛素的成年 2 型糖尿病患者，与指尖血糖监测相比，实时连续血糖监测能否降低 6 个月时的糖化血红蛋白（HbA1c）水平？仅纳入随机对照试验。若试验同时纳入 1 型和 2 型糖尿病患者，仅在能够单独提取使用胰岛素的成年 2 型糖尿病患者的数据时纳入。',output_language:'en'},
  expected:{coverage:true,eligibility_dimensions:['population','comparator','intervention','study_design'],comparator:/fingerstick blood glucose monitoring/i,
   outcome:/HbA1c.+at 6 months/i,populationCondition:/eligible only if data for insulin-treated adults with type 2 diabetes can be extracted separately/i,bilingual:'zh'}},

 {id:'heart-failure-discharge',input:{research_question:'对于出院回家的成年心力衰竭患者，与常规出院随访相比，护士主导的电话随访能否降低出院后 90 天内的全因再入院风险？仅考虑随机对照试验。若电话随访与家庭访视联合实施，仅在对照组也接受相同家庭访视时纳入。',output_language:'en'},
  expected:{coverage:true,eligibility_dimensions:['population','comparator','intervention','study_design'],comparator:/usual.+follow.up/i,outcome:/90 days.+discharge/i,qualifier:/control.+(?:same|identical|matched).+home visits/i}},
 {id:'heart-failure-alternate-design',input:{research_question:'对于出院回家的成年心力衰竭患者，与常规出院随访相比，护士主导的电话随访能否降低出院后 90 天内的全因再入院风险？研究设计仅限随机对照试验。若电话随访与家庭访视联合实施，仅在对照组也接受相同家庭访视时纳入。',output_language:'en'},
  expected:{coverage:true,eligibility_dimensions:['population','comparator','intervention','study_design'],comparator:/usual.+follow.up/i,outcome:/90 days.+discharge/i,qualifier:/control.+(?:same|identical|matched).+home visits/i}},
 {id:'community-fall-prevention',input:{research_question:'对于居住在社区、过去一年内至少跌倒过一次的老年人，与常规照护或单纯健康教育相比，以平衡训练为必备内容的居家运动计划能否降低随访期间至少跌倒一次的风险？仅纳入随机对照试验，排除所有训练均在医疗机构内完成的项目。',output_language:'en'},
  expected:{coverage:true,eligibility_dimensions:['population','comparator','intervention','study_design'],comparator:/usual care.+or.+health education/i,outcome:/at least once/i,exclude:/all.+healthcare facilit/i}},

 {id:'neonatal-resuscitation',input:{research_question:neonatal.question,review_method:'systematic_review',question_type:'intervention_effect',output_language:'en'},expected:{neonatal:true}},
 {id:'nutrition-ipd-nma',input:{research_question:require('../tests/eligibility/fixtures/nutrition-ipd-nma.json').research_question,question_framework:'PICO',review_method:'systematic_review',output_language:'en'},expected:{framework:'pico',no_rct_default:true,eligibility_dimensions:['population','intervention','comparator'],nutrition_scope:true}},
 {id:'strict-age',input:{research_question:'Include people aged >18 years.',question_framework:'PICO',output_language:'en'},expected:{strict_bound:'gt',value:18,no_rct_default:true}},
 {id:'eligibility-directions',input:{research_question:'Compare exercise with education for adults with knee pain. Include randomised trials. We excluded studies of children, studies conducted outside outpatient clinics and studies of postoperative rehabilitation.',question_framework:'PICOS',output_language:'en'},expected:{framework:'picos',eligibility_dimensions:['population','intervention','comparator','study_design'],arms:['exercise','education'],study_exclusions:['studies of children','studies of postoperative rehabilitation']}},
 {id:'elderly-answer',input:{research_question:'Include elderly people.',question_framework:'PICO',output_language:'en'},expected:{age_boundary_question:true,no_invented_age:true,answer:'Define elderly as 65 years or older.',final_age:65}},
 {id:'peco-exposure',input:{research_question:'Include studies of exposure to air pollution.',question_framework:'pECO',output_language:'en'},expected:{framework:'peco',dimension:'exposure',eligibility_dimensions:['exposure']}},
 {id:'pcc-context',input:{research_question:'Map digital health literacy in community settings.',question_framework:'PCC',output_language:'en'},expected:{framework:'pcc',dimensions:['concept','context'],eligibility_dimensions:['concept','context'],no_required_comparator:true}}
];
async function run(def){
 const dir=path.join(output,def.id);fs.mkdirSync(dir,{recursive:true});const replayDir=replay?path.join(path.resolve(replay),def.id):null;let state=(args.includes('--resume')&&fs.existsSync(path.join(dir,'input-state.json')))?JSON.parse(fs.readFileSync(path.join(dir,'input-state.json'),'utf8')):replayDir?JSON.parse(fs.readFileSync(path.join(replayDir,'input-state.json'),'utf8')):E.save_input(E.create_project('evaluation-'+def.id),def.input).state;fs.writeFileSync(path.join(dir,'input-state.json'),JSON.stringify(state,null,2));let count=0;const records=[];
 const adapter=M.client({base,timeout_ms:600000,fetch:replayDir||exchange?async(url,init)=>{
  const index=++count,raw=init.body,target=replayDir||path.join(path.resolve(exchange),def.id);fs.mkdirSync(target,{recursive:true});const requestFile=path.join(target,'request-'+index+'.json'),responseFile=path.join(target,'response-'+index+'.json');
  if(replayDir){if(hash(fs.readFileSync(requestFile,'utf8'))!==hash(raw))throw new Error('Replay request differs from the original prompt; no live-model claim can be made.');}
  else {if(fs.existsSync(requestFile)&&fs.existsSync(responseFile)){if(hash(fs.readFileSync(requestFile,'utf8'))!==hash(raw))throw Error('Cached request changed; use a fresh exchange directory.');}else{fs.writeFileSync(requestFile,raw);fs.writeFileSync(path.join(target,'url-'+index+'.txt'),url);console.log('EXCHANGE_REQUEST',def.id,index,requestFile,responseFile);const start=Date.now();while(!fs.existsSync(responseFile)){if(Date.now()-start>590000)throw Error('External exchange timed out.');await new Promise(r=>setTimeout(r,200));}}}
  const response=JSON.parse(fs.readFileSync(responseFile,'utf8'));records.push({request:JSON.parse(raw),response});return {ok:!response.error,status:response.error?502:200,json:async()=>response,text:async()=>JSON.stringify(response)};
 }:undefined,onExchange:record=>{fs.writeFileSync(path.join(dir,'exchange-'+(adapter.exchanges.length)+'.json'),JSON.stringify(record,null,2));}});
 let result={case_id:def.id,evaluation_type:replay?'RECORDED_REAL_OUTPUT_REPLAY':'REAL_LLM_CALLS',input:def.input,expected:Object.fromEntries(Object.entries(def.expected).map(([key,value])=>[key,value instanceof RegExp?value.source:value])),expectation_basis:'User technical specification; developer-authored, not independently expert-adjudicated',independent_holdout:false,passed:false};
 const started=Date.now();
 try{
  const extracted=await M.analyze(state,E.environment(),adapter,{retries:Number(arg('--retries','1')),...(def.expected.bilingual&&{languageSample:def.input.research_question}),onProgress:message=>console.log(def.id,message)});state=E.ingest_candidates(state,extracted.candidates,{base_revision:extracted.base_revision}).state;result.stage_one_status=state.status;result.metadata_corrections=state.elements.flatMap(e=>e.metadata_corrections||[]);result.raw_model_clean=!result.metadata_corrections.length;result.stage_one_elements=D.clone(state.elements.filter(e=>e.active!==false&&e.information_status!=='missing'));result.stage_one_issues=D.clone(state.issues.filter(i=>i.status==='open'));
  const es=state.elements.filter(e=>e.active!==false),errors=[];
  if(def.expected.neonatal){
   const view=require('../app/eligibility/background.js').projectToClassic(state);
   result.classic_output=view;
   const accepted=name=>view.rows.find(r=>r.dimension===name)?.include.join(' ')||'';
   if(view.framework!=='PICOS')errors.push('Unexpected inferred framework '+view.framework);
   if(!/\bair\b/i.test(view.reviewTopic)||!/supplemental oxygen/i.test(view.reviewTopic)||!/resuscitation/i.test(view.reviewTopic)||!/late preterm/i.test(view.reviewTopic))errors.push('Title does not identify the clinical comparison and population.');
   if(!/term.+late preterm/i.test(accepted('Population'))||!/respiratory support at birth/i.test(accepted('Population')))errors.push('Population missing its source qualifications.');
   if(!/^air\.?$/i.test(accepted('Intervention'))||!/^any supplemental oxygen\.?$/i.test(accepted('Comparison')))errors.push('Incorrect or missing treatment arms.');
   if(!['random','quasi','cluster'].every(type=>accepted('Study design').toLowerCase().includes(type)))errors.push('Eligible trial designs missing or in the wrong field.');
   if(view.rows.some(row=>row.dimension==='Other'&&row.include.length)||/eligibility requires .+?\bor\b/i.test(view.manuscriptParagraph))errors.push('Cross-domain requirements rendered as alternatives.');
   const lines=view.rows.flatMap(row=>row.exclude);
   if(lines.length!==2||!['saturation targeting','congenital anomalies'].every(term=>lines.filter(x=>x.includes(term)).length===1))errors.push('Incorrect framework-scoped exclusions.');
   if(!view.rows.find(r=>r.dimension==='Intervention')?.exclude.some(s=>s.includes('saturation targeting')))errors.push('Incorrect exclusion domain.');
   if(!view.rows.find(r=>r.dimension==='Population')?.exclude.some(s=>s.includes('congenital anomalies')))errors.push('Population exclusion in the wrong field.');
   if(/delivery room|income of the study country|neurodevelopmental impairment|all.cause mortality/i.test(view.manuscriptParagraph))errors.push('Description contains a non-eligibility outcome, analysis factor or standalone setting.');
  }
  if(def.expected.strict_bound&&!es.some(e=>e.structured_value?.operator===def.expected.strict_bound&&e.structured_value.value===def.expected.value))errors.push('Strict bound not represented faithfully.');
  if(def.expected.no_rct_default&&state.criteria.some(c=>/randomi[sz]ed|RCT/i.test(c.text)))errors.push('An unprovided design restriction appeared.');
  if(def.expected.framework&&state.questions[0].framework_mapping.framework_id!==def.expected.framework)errors.push('Wrong framework mapping.');
  for(const dimension of def.expected.dimensions||[def.expected.dimension].filter(Boolean))if(!es.some(e=>e.dimension_id===dimension||e.dimension_id.startsWith(dimension+'.')))errors.push('Missing dimension '+dimension);
  for(const dimension of def.expected.eligibility_dimensions||[])if(!state.criteria.some(c=>c.dimension_id===dimension&&c.disposition==='include'))errors.push('No source-backed inclusion criterion for '+dimension);
  if(!state.criteria.length)errors.push('No usable eligibility clauses generated.');
  if(def.expected.coverage){
   const {source_coverage,incomplete}=state.validation.completeness.eligibility;
   if(state.status!=='final'||incomplete||source_coverage.length<5||source_coverage.some(item=>item.status!=='covered'))errors.push('Explicit source clauses did not all reach a verified final result.');
   const comparator=state.criteria.find(c=>c.dimension_id==='comparator'&&c.disposition==='include')?.text||'';
   if(!def.expected.comparator.test(comparator))errors.push('Incorrect comparator wording.');
   const outcome=es.find(e=>e.dimension_id==='outcome'&&e.semantic_role==='review_focus')?.normalized_text||'';
   if(!def.expected.outcome.test(outcome))errors.push('Outcome and its source qualifiers were not retained as review focus.');
   if(def.expected.qualifier&&!state.criteria.some(c=>c.dimension_id==='intervention'&&def.expected.qualifier.test(c.text)))errors.push('Matched co-intervention clause missing.');
   if(def.expected.populationCondition&&!state.criteria.some(c=>c.dimension_id==='population'&&def.expected.populationCondition.test(c.text)))errors.push('The mixed-cohort data-separability condition is missing.');
   if(def.expected.bilingual){
    const view=require('../app/eligibility/background.js').projectToClassic(state);
    const phrases=['Eligibility criteria','Population','Intervention','Comparison','Outcomes','Study design','Description',
     view.reviewTopic,view.manuscriptParagraph,outcome,...view.rows.flatMap(row=>row.include)];
    if(phrases.some(text=>M.needsSourceTranslation(text,'en')))errors.push('The English output contains untranslated source text.');
    const population=view.rows.find(row=>row.dimension==='Population')?.include[0];
    const plan=M.translationPlan(def.expected.bilingual,['Eligibility criteria',population,outcome]);
    const bilingual=await M.translateCriteria(plan,(payload,schema,instruction,signal)=>adapter.request('translate_criteria',state,payload,schema,instruction,signal));
    if(!/单独|分别|独立/u.test(bilingual.texts[population]||''))errors.push('The original-language population loses the separate-data condition.');
    result.bilingual=bilingual;
   }
   if(def.expected.exclude&&!state.criteria.some(c=>c.disposition==='exclude'&&def.expected.exclude.test(c.text)))errors.push('Explicit intervention exclusion missing.');
  }

  if(def.expected.no_required_comparator&&state.issues.some(i=>i.status==='open'&&i.blocking&&/comparat|对照/i.test(i.question_text)))errors.push('An unprovided comparator was made mandatory.');
  if(def.expected.nutrition_scope){const classic=require('../app/eligibility/background.js').projectToClassic(state);result.classic_output=classic;if(!classic.rows.some(r=>r.dimension==='Population'&&/older/i.test(r.include.join(' '))))errors.push('Older population qualifier lost.');if(classic.rows.some(r=>r.dimension==='Other'))errors.push('Within-comparator alternatives flattened the whole PICO into Other.');if(state.criteria.some(c=>/IPD|individual participant data|network meta.analysis/i.test(c.text)))errors.push('Analysis/data plan became an unprovided study eligibility condition.');if(!/nutrition/i.test(classic.reviewTopic)||!/older/i.test(classic.reviewTopic))errors.push('Review topic omitted the intervention or clinical population.');if(/rank the|network meta.analysis|individual participant data/i.test(classic.manuscriptParagraph))errors.push('Description contains the analysis plan.');}
  if(def.expected.study_exclusions){
   const exclusions=state.criteria.filter(c=>c.disposition==='exclude');
   const classic=require('../app/eligibility/background.js').projectToClassic(state);
   result.exclusions_expected=def.expected.study_exclusions.length;
   result.exclusions_found=def.expected.study_exclusions.filter(expected=>exclusions.some(c=>c.text.toLowerCase().includes(expected))&&classic.manuscriptParagraph.toLowerCase().includes(expected)).length;
   if(result.exclusions_found!==result.exclusions_expected||exclusions.length!==result.exclusions_expected)errors.push('Incorrect coverage or direction of the explicit exclusions.');
   for(const [index,role] of ['intervention','comparator'].entries()){
    const rows=state.criteria.filter(c=>c.dimension_id===role&&c.disposition==='include');
    if(!rows.some(c=>c.text.toLowerCase().includes(def.expected.arms[index])&&!c.text.toLowerCase().includes(def.expected.arms[1-index])))errors.push('Incorrect treatment assignment to '+role+'.');
   }
  }
  if(def.expected.age_boundary_question){
   const boundary=state.issues.find(i=>i.status==='open'&&i.reason_code==='AMBIGUOUS_BOUNDARY');if(!boundary)errors.push('No necessary age-boundary question.');
   if(es.some(e=>e.dimension_id.includes('age')&&e.structured_value?.value!=null))errors.push('Age was invented before the author answer.');
   if(boundary){const request=await M.parse_answers(state,def.expected.answer,[boundary.issue_id],adapter);state=E.apply_decisions(state,request).state;if(!state.elements.some(e=>e.active!==false&&e.dimension_id==='population.age'&&e.structured_value?.value===65&&e.decision_status==='confirmed_by_user'))errors.push('The actual answer did not become a confirmed age rule.');if(state.status!=='final')errors.push('Necessary decisions were not completed after the answer.');}
  }
  result.errors=errors;result.passed=!errors.length;result.final_status=state.status;result.criteria=state.criteria;result.validation=state.validation;result.project_revision=state.revision;fs.writeFileSync(path.join(dir,'project.json'),JSON.stringify(state,null,2));
 }catch(error){result.error={code:error.code||'TRANSPORT_OR_EVALUATION_ERROR',step:error.step||'transport',message:error.message,details:error.details};console.error('EVALUATION_FAILED',def.id,JSON.stringify(result.error));}
 result.elapsed_ms=Date.now()-started;result.model_calls=adapter.exchanges;result.recorded_http_exchanges=records;fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(result,null,2));console.log('EVALUATION_RESULT',def.id,result.passed?'PASS':'FAIL');return result;
}
(async()=>{const selected=cases.filter(c=>chosen==='all'||c.id===chosen);if(!selected.length)throw Error('Unknown --case');const results=[];for(const c of selected)results.push(await run(c));const report={created_at:new Date().toISOString(),evaluation_type:replay?'RECORDED_REAL_OUTPUT_REPLAY':'REAL_LLM_CALLS',model_configuration:base,independent_expert_validation:false,case_count:results.length,passed:results.filter(r=>r.passed).length,results:results.map(r=>({case_id:r.case_id,passed:r.passed,error:r.error,errors:r.errors}))};fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(results.some(r=>!r.passed))process.exitCode=1;})().catch(e=>{console.error(e.stack);process.exitCode=1});
