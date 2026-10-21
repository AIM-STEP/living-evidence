/* Review-specific drafting guidance, based on official methodological manuals.
 * Reviewed 2026-10-21. These are drafting instructions, not registry validation.
 */
(function(root){
'use strict';
const references={
 protocols:{title:'PRISMA-P: review protocols',url:'https://www.prisma-statement.org/protocols'},
 cochrane:{title:'Cochrane Handbook for Systematic Reviews of Interventions',url:'https://training.cochrane.org/handbook/current'},
 jbi:{title:'JBI Manual for Evidence Synthesis',url:'https://jbi-global-wiki.refined.site/space/MANUAL/'},
 diagnostic:{title:'Cochrane handbooks: diagnostic test accuracy',url:'https://training.cochrane.org/handbooks'},
 qualitative:{title:'Cochrane-Campbell Handbook for Qualitative Evidence Synthesis',url:'https://training.cochrane.org/cochrane-campbell-handbook-qualitative-evidence-synthesis'}
};
const common='Write a prospective review protocol: explain the rationale and question, eligibility, information sources, reproducible searching, selection, data collection, outcomes, bias assessment, synthesis and certainty. Include administrative details and amendments. Describe planned methods, not invented results. Preserve supplied decisions and thresholds. Distinguish missing factual information from methodological proposals.';
const types={
 'Systematic Review':{refs:['protocols','cochrane'],text:'Frame the question using the selected framework. Specify study selection, extraction, design-appropriate bias assessment, outcome definitions, synthesis and certainty methods. Choose pooling only when clinical and methodological comparability support it; describe an alternative when pooling is inappropriate.'},
 'Network/Meta-analysis':{refs:['protocols','cochrane'],text:'Plan pairwise and, only when justified by the question and treatment network, network meta-analysis. Specify effect measures, model, heterogeneity, effect modifiers and sensitivity analyses. For network synthesis address network geometry, transitivity, consistency, multi-arm studies and uncertainty in treatment ranking. Do not invent a connected network or select treatments beyond the supplied eligibility.'},
 'Diagnostic Review':{refs:['protocols','diagnostic'],text:'Define the target condition, index test, reference standard, intended use, clinical pathway, thresholds and participant spectrum. Plan diagnostic study selection, paired accuracy extraction, appropriate bias assessment and a synthesis of sensitivity and specificity that accounts for threshold and between-study variation. Do not treat diagnostic accuracy as an intervention effect.'},
 'Prognostic Review':{refs:['protocols','jbi'],text:'Distinguish prognostic factors from prediction models. Specify population, baseline time, outcome horizon, predictors, adjustment and study design. Plan extraction of the relevant associations or model performance, appropriate bias assessment, heterogeneity and validation. Avoid mixing incompatible time horizons or adjusted and unadjusted estimates without a plan.'},
 'Qualitative Review':{refs:['qualitative','jbi'],text:'Align the question, context, participant experience and qualitative synthesis approach. Describe searching, sampling/selection, contextual data collection, methodological appraisal, reflexivity, synthesis and confidence in qualitative findings. Do not impose quantitative pooling or intervention effect measures on a qualitative question.'},
 'Scoping Review':{refs:['jbi'],text:'Use the population, concept and context framework when appropriate. Specify the mapping purpose, breadth of eligible evidence, search strategy, selection, data charting and presentation of the evidence map. Explain whether critical appraisal is relevant. Do not automatically add effect pooling, GRADE or a claim of PROSPERO eligibility.'},
 'Other Review':{refs:['jbi'],text:'Identify and explain the review design supported by the supplied question and methods. Align selection, appraisal, extraction and synthesis to that design; mark any unresolved design choice for author confirmation. Do not claim compliance with an inapplicable reporting or registration standard.'}
};
function guidance(type){const value=types[type];if(!value)throw Error('Select a supported Review type before generating.');return {reviewType:type,instructions:common+' '+value.text,references:value.refs.map(id=>references[id])};}
const strings={type:'array',items:{type:'string'}};
const planSchema={type:'object',properties:{approach:{type:'string'},requirements:strings,confirmations:strings},required:['approach','requirements','confirmations']};
function validatePlan(value){if(typeof value?.approach!=='string'||!value.approach.trim()||!Array.isArray(value.requirements)||!Array.isArray(value.confirmations)||!value.requirements.every(item=>typeof item==='string')||!value.confirmations.every(item=>typeof item==='string'))throw Error('The model returned an incomplete drafting plan. Try Generate again.');return {approach:value.approach,requirements:value.requirements.map(String),confirmations:value.confirmations.map(String)};}
function sectionSchema(ids){return {type:'object',properties:{sections:{type:'object',properties:Object.fromEntries(ids.map(id=>[id,{type:'string',minLength:1}])),required:ids,additionalProperties:false},issues:strings},required:['sections','issues'],additionalProperties:false};}
function validateSections(value,ids){if(value?.sections&&!Array.isArray(value.sections)&&typeof value.sections==='object')value={...value,sections:Object.entries(value.sections).map(([id,text])=>({id,text}))};if(!Array.isArray(value?.sections)||!Array.isArray(value.issues)||value.sections.length!==ids.length)throw Error('The model returned an incomplete proposal section. Try Generate again.');return {sections:ids.map(id=>{const found=value.sections.filter(row=>row.id===id);if(found.length!==1||typeof found[0].text!=='string'||!found[0].text.trim())throw Error('The model omitted proposal section '+id+'. Try Generate again.');return {id,text:found[0].text.trim()};}),issues:value.issues.map(String)};}
function parseResponse(content){
 if(content&&typeof content==='object')return content;
 try{return JSON.parse(String(content||'').replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/,''));}
 catch(_){throw Object.assign(Error('The model returned incomplete JSON.'),{code:'MODEL_JSON_INVALID'});}
}
async function structured(request,validate,signal,label){
 for(let attempt=0;attempt<3;attempt++){
  if(signal?.aborted)throw new DOMException('Stopped','AbortError');
  let value;try{value=await request(attempt);}catch(error){if(['MODEL_JSON_INVALID','MODEL_OUTPUT_LIMIT'].includes(error.code))continue;throw error;}
  if(signal?.aborted)throw new DOMException('Stopped','AbortError');
  try{return validate(value);}catch(_){}
 }
 throw Error('The model could not complete '+label+' after automatic retries. Your saved inputs and previous proposals are unchanged. Try Generate again to resume.');
}
async function generateSections({model,instructions,input,ids,signal,checkpoint={}}){
 const saved=checkpoint.saved||(checkpoint.saved=new Map()),issues=checkpoint.issues||(checkpoint.issues=[]);
 const stopped=()=>{if(signal?.aborted)throw new DOMException('Stopped','AbortError');};
 const accept=(value,requested)=>{
  if(Array.isArray(value?.issues))issues.push(...value.issues.filter(item=>typeof item==='string'));
  if(!value?.sections||typeof value.sections!=='object')return;
  const entries=Array.isArray(value.sections)?value.sections:Object.entries(value.sections).map(([id,text])=>({id,text}));
  for(const id of requested){const rows=entries.filter(row=>row?.id===id);
   if(rows.length===1&&typeof rows[0].text==='string'&&rows[0].text.trim())saved.set(id,{id,text:rows[0].text.trim()});
  }
 };
 const request=async(requested,prompt)=>{
  stopped();
  try{const value=await model(prompt,input,sectionSchema(requested),signal);stopped();accept(value,requested);}
  catch(error){if(!['MODEL_JSON_INVALID','MODEL_OUTPUT_LIMIT'].includes(error.code))throw error;}
 };
 if(!saved.size)await request(ids,instructions);
 for(const id of ids){
  for(let attempt=0;!saved.has(id)&&attempt<2;attempt++)await request([id],instructions+' Repair the incomplete response by writing ONLY section '+id+'. Return one sections entry with exactly this id and a nonempty text string. Include issues as an array (empty if none).');
  if(!saved.has(id))throw Error('The model could not complete the proposal section "'+id+'" after automatic retries. Your saved inputs and previous proposals are unchanged. Try Generate again.');
 }
 return {sections:ids.map(id=>saved.get(id)),issues:[...new Set(issues)]};
}
const settings=Object.freeze({workers:2});
const api={settings,guidance,planSchema,validatePlan,sectionSchema,validateSections,generateSections,parseResponse,structured};
if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepProposalDrafting=api;
})(globalThis);
