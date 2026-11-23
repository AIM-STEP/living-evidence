/* Source-grounded analysis roles and English criteria prose. No study-design defaults. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./domain.js'):root.AIMSTEPEligibilityDomain);if(typeof module==='object'&&module.exports)module.exports=api;else root.AIMSTEPEligibilityMethodology=api;})(typeof window==='object'?window:globalThis,function(D){
'use strict';
const norm=x=>String(x||'').normalize('NFKC');
const older=/\b(?:older (?:people|patients|adults|participants)|elderly)\b|老年/i;
// A shared treatment duration belongs in the eligibility description once.
const treatmentDuration=/\s+(for (?:at least |at most |more than |less than |up to )?(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve) (?:days?|weeks?|months?|years?)(?: or (?:longer|shorter))?)$/iu;
function studyDesignWording(text){
 return text.replace(/^randomi[sz]ed[,]?\s+double[-‐‑– ]blind(?:ed)? (controlled )?(trials?)\b/iu,(_,controlled,trials)=>
  'double-blind randomised '+(controlled?'controlled ':'')+trials.toLowerCase());
}
function sharedTreatmentDuration(criteria,expression,elementById){
 const arms=['intervention','comparator'].map(dimension=>criteria.filter(c=>c.dimension_id===dimension));
 if(!arms.every(group=>group.length===1))return null;
 const pair=arms.flat();
 const contains=(node,id)=>node?.op==='predicate'?node.criterion_id===id:node?.op==='all_of'&&node.children.some(child=>contains(child,id));
 if(pair.some(c=>!contains(expression,c.criterion_id)||c.scope_conditions.length||c.exceptions.length||c.source_element_ids.length!==1))return null;
 const suffix=pair[0].text.match(treatmentDuration)?.[0];
 if(!suffix||!pair[1].text.endsWith(suffix))return null;
 const sources=pair.map(c=>elementById.get(c.source_element_ids[0]));
 if(sources.some(e=>!e||e.decision_status!=='accepted_from_input'||e.explicit_revision))return null;
 const samePassage=sources[0].source_refs.some(ref=>ref.quote.trim()===suffix.trim()&&sources[1].source_refs.some(
  other=>ref.source_id===other.source_id&&ref.source_revision===other.source_revision&&ref.start===other.start&&ref.end===other.end));
 return samePassage?{suffix,ids:new Set(pair.map(c=>c.criterion_id)),
  intervention:pair[0].text.slice(0,-suffix.length),comparison:pair[1].text.slice(0,-suffix.length)}:null;
}
function phrase(text){return String(text||'').trim().replace(/[.。]+$/,'').replace(/^(?:include\s+)?studies\s+(?:involving|evaluating|of|in)\s+/i,'').replace(/^various\s+/i,'');}
function lower(text){return String(text||'').replace(/^(?:Hospitali[sz]ed|Older|Adults?|Patients?|People|Exercise|Nutritional|Standard|Placebo|Another|Various)\b/,s=>s.toLowerCase());}
function dataGate(text){const t=norm(text),data='(?:IPD|individual\\s+(?:participant|patient)\\s+data(?:\\s*\\(IPD\\))?)';return new RegExp('(?:only\\s+(?:include\\s+)?(?:studies|trials|reports)|include\\s+only\\s+(?:studies|trials|reports)|eligibility\\s+(?:requires|depends))[\\s\\S]{0,100}(?:with|providing|for which|available|availability|access)[\\s\\S]{0,80}'+data,'i').test(t)||new RegExp('(?:only\\s+include\\s+(?:studies|trials|reports)|studies\\s+must|trials\\s+must)[\\s\\S]{0,100}'+data+'[\\s\\S]{0,40}(?:available|provided|obtained)','i').test(t)||new RegExp(data+'\\s+(?:must\\s+be\\s+available|availability\\s+is\\s+required)','i').test(t)||new RegExp('exclude\\s+(?:studies|trials)\\s+without\\s+'+data,'i').test(t);}

function plan(original){const text=norm(original),nma=original.match(/network\s+meta[-– ]analysis(?:\s*\(NMA\))?|\bNMA\b/i),ipd=original.match(/individual\s+(?:participant|patient)\s+data(?:\s*\(IPD\))?|\bIPD\b/i);const analysis=/\b(?:using|conduct|perform|based\s+on|analyse|analyze)\b[\s\S]{0,160}(?:network\s+meta[- ]analysis|\bNMA\b|individual\s+(?:participant|patient)\s+data|\bIPD\b)|(?:network\s+meta[- ]analysis|\bNMA\b)[\s\S]{0,100}\bbased\s+on\b/i.test(text);return {nma:analysis&&nma?nma[0]:null,ipd:analysis&&ipd?ipd[0]:null,rank:analysis&&/\brank(?:ing)?\b/i.test(text)?original.match(/\brank(?:ing)?\b[^.!?;]*?(?=\s+using\b|\s+by\b|[.!?;]|$)/i)?.[0]:null};}
function classifyAnalysis(element,context){const text=norm(element.normalized_text),dimension=element.dimension_id||'',pureIPD=/^(?:studies (?:based on|using|with)\s+|based on\s+|using\s+)?(?:individual\s+(?:participant|patient)(?:[- ]level)?\s+data|IPD)(?:\s*\(IPD\))?\.?$/i.test(text),pureNMA=/^(?:using\s+)?(?:network\s+meta[- ]analysis|NMA)(?:\s*\(NMA\))?\.?$/i.test(text);if(dataGate(context)&&/IPD|individual\s+(?:participant|patient)\s+data/i.test(text))return null;if((pureIPD&&plan(context).ipd)||dimension==='analysis_data_unit')return {dimension_id:'analysis_data_unit',normalized_text:pureIPD?'individual participant data (IPD)':element.normalized_text};if(((pureNMA||/^network\s+meta[-– ]analysis[\s\S]*\bbased\s+on\b[\s\S]*(?:individual\s+(?:participant|patient)\s+data|IPD)/i.test(text))&&plan(context).nma)||dimension==='analysis_method')return {dimension_id:'analysis_method',normalized_text:pureNMA?'network meta-analysis (NMA)':element.normalized_text};if(dimension==='analysis_objective')return {dimension_id:dimension,normalized_text:element.normalized_text};return null;}
function restoreAge(element){if(element.dimension_id.split('.')[0]!=='population'||element.dimension_id==='population.age'||!older.test(element.raw_text)||older.test(element.normalized_text)||element.explicit_revision)return;const word=/\belderly\b/i.test(element.raw_text)?'elderly':'older';if(/\b(?:people|patients|adults|participants)\b/i.test(element.normalized_text)){const previous=element.normalized_text;element.normalized_text=element.normalized_text.replace(/\b(people|patients|adults|participants)\b/i,word+' $1');element.metadata_corrections=[...(element.metadata_corrections||[]),{field:'normalized_text',from:previous,to:element.normalized_text,basis:'Restore the age qualification explicitly present in the source; no numeric threshold inferred.'}];}}
function interventionReference(elements){const candidates=elements.filter(e=>e.active!==false&&e.dimension_id==='intervention'&&e.disposition!=='exclude'&&e.information_status!=='missing'&&e.normalized_text),i=candidates.find(e=>e.scope_status==='restricted')||candidates[0];if(!i)return null;const value=lower(phrase(i.normalized_text));return /interventions?$/i.test(value)?value.replace(/interventions$/i,'intervention'):'eligible intervention';}
function studyExclusionSubject(value){
 return norm(value).toLowerCase().trim().replace(/[.。]+$/u,'').replace(/^(?:(?:we (?:also )?(?:will )?)?excluded?|excluding)\s+/u,'')
  .replace(/^(?:studies|trials|reports) (?:of|testing|evaluating|investigating)\s+/u,'').replace(/[‐‑–-]/gu,' ').replace(/\s+/gu,' ');
}
function isInterventionStudyExclusion(wording){
 const subject=studyExclusionSubject(wording);
 // Targeting a clinical measure is an intervention strategy. Measuring the
 // same variable, describing participants or assessing effect modifiers is not.
 return /^(?:oxygen saturation|blood (?:pressure|glucose)) targeting(?: strateg(?:y|ies))?$/u.test(subject)||
  /^(?:studies|trials) (?:testing|evaluating) [\p{L}\d-]+(?: [\p{L}\d-]+){0,8} as (?:the|an?) (?:assigned )?intervention[.]?$/iu.test(String(wording||'').trim());
}
function normalizeExcludedIntervention(e){
 if(e.active===false||e.information_status!=='explicit'||e.disposition!=='exclude'||e.semantic_role!=='eligibility_condition'||
    !['design','study_design','other'].includes(e.dimension_id)||e.explicit_revision||e.decision_status==='confirmed_by_user'||
    e.source_occurrence_pending||e.source_occurrence_alternatives?.length||e.semantic_review?.status==='contradicted'||
    !isInterventionStudyExclusion(e.normalized_text))return false;
 const subject=studyExclusionSubject(e.normalized_text);
 const supported=e.source_refs?.some(({quote})=>{
  if(studyExclusionSubject(quote)===subject)return true;
  if(!/^(?:we (?:also )?(?:will )?)?excluded?\s+/iu.test(quote)||/\b(?:except|unless|from|if|when)\b/iu.test(quote))return false;
  return quote.split(/,\s*(?:(?:and|or) )?|\s+(?:and|or) (?=(?:studies|trials|reports) )/iu).some(item=>studyExclusionSubject(item)===subject);
 });
 if(!supported)return false;
 e.metadata_corrections=[...(e.metadata_corrections||[]),{field:'dimension_id',from:e.dimension_id,to:'intervention',basis:'The excluded studies evaluate an intervention strategy.'}];
 e.dimension_id='intervention';return true;
}
// Only repair an arm when its own citation contains the misplaced comparison.
// An explicit eligibility clause can supply a broader qualifier such as "any".
const armContrast=/\s+(?:compared (?:with|to)|versus|vs\.?)\s+/i;
const armKey=value=>norm(value).toLowerCase().trim().replace(/[.。]+$/,'').replace(/[‐‑]/gu,'-').replace(/[‘’]/gu,"'").replace(/[“”]/gu,'"').replace(/\s+/g,' ');
function explicitComparisonPairs(ref){
 const pairs=[];
 for(const match of ref.quote.matchAll(/\bcomparing\s+([^;!?\n]{1,140}?)\s+(?:with|to)\s+([^;!?\n]{1,160}?)(?=\.(?:\s|$)|[;!?\n]|$)/gi)){
  const [quote,intervention,comparator]=match;
  const prefix=ref.quote.slice(0,match.index).split(/(?:[.!?]\s+|[;\n])/).at(-1);
  if(/\b(?:exclud(?:e|ed|ing)|ineligible|did not include|except|unless)\b/i.test(prefix))continue;
  if(![intervention,comparator].every(arm=>!armContrast.test(arm)&&!/(?:\.\s|[,;]|\b(?:comparing|with|than|respectively|among|participants|studies|trials|except|unless|when|who)\b)/i.test(arm)))continue;
  const start=ref.start+Array.from(ref.quote.slice(0,match.index)).length;
  pairs.push({intervention:intervention.trim(),comparator:comparator.trim(),ref:{source_id:ref.source_id,source_revision:ref.source_revision,quote,start,end:start+Array.from(quote).length}});
 }
 return pairs;
}
function objectiveArms(value){
 const wording=phrase(value).replace(/^studies comparing\s+/i,'comparing ').replace(/\uFB00/gu,'ff');
 const objective=wording.match(/^(?:to |we (?:aim(?:ed)? to )?)?(?:assess|evaluate|examine|determine) (?:the )?(?:(?:clinical|comparative|relative|cost|economic|benefits?|harms?|effects?|efficacy|effectiveness|safety|and)[ ‐‑–-]+)+of (.+)$/i);
 if(!objective){
  const pair=wording.match(/^(?:comparing|to compare) (.+?) (?:with|to) (.+)$/i);
  if(pair)return {intervention:pair[1],comparator:pair[2]};
  const arms=wording.split(armContrast);
  return arms.length===2?{intervention:arms[0],comparator:arms[1]}:null;
 }
 const arms=objective[1].split(armContrast);
 if(arms.length!==2)return null;
 // Purpose and outcome clauses commonly follow an objective's comparator.
 const comparator=arms[1].split(/(?:,\s*|\s+)(?:for (?:the )?(?:resuscitation|treatment|management|prevention|diagnosis) of|in (?:reducing|preventing|improving)|on (?:the )?(?:risks?|rates?|incidence|mortality|morbidity|survival|quality of life|health[‐‑– -]related quality of life|outcomes?|[\w-]+(?: [\w-]+){0,3} (?:levels?|outcomes?)))\b/i)[0];
 let intervention=arms[0].replace(/,$/,'').trim();
 const sharedName=/^[\p{L}]+[‐‑–-]dose ([\p{L}][\p{L} ‐‑–-]{1,45})$/iu.exec(comparator.trim());
 if(sharedName&&/^[\p{L}]+[‐‑–-]dose$/iu.test(intervention))intervention+=' '+sharedName[1];
 return {objective:true,intervention,comparator:comparator.trim(),sharedPurpose:comparator!==arms[1]&&/^,?\s*for\b/i.test(arms[1].slice(comparator.length))};
}
// In “effects of X on Y”, X is the treatment and Y is the outcome. A
// duration in the X phrase qualifies treatment and is never a second arm.
function treatmentObjective(original){
 const primary=String(original||'').trim().split(/[.!?](?=\s|$)|[;\n]/u)[0];
 const aim=/^(?:to |we (?:aim(?:ed)? to )?)?(?:assess|evaluate|examine|investigate|determine)\s+(?:the )?((?:(?:long|short|medium)[-‐‑– ]term )?(?:effects?|impacts?|benefits?(?: and harms?)?|efficacy|effectiveness|safety)) of ((?:[^()]|\([^()]*\))+?) on (.+)$/iu.exec(primary);
 if(!aim||armContrast.test(aim[2])||/\b(?:compared|comparing|whether|except|unless|depending)\b/iu.test(aim[2]))return null;
 const use=/^(?:(?:prolonged|extended|long[-‐‑– ]term|short[-‐‑– ]term|continuous) )?(?:use|administration|application)\s*(?:\(([^()]+)\)\s*)?of (.+)$/iu.exec(aim[2]);
 const name=(use?use[2]:aim[2]).trim();
 if(!compactTitle(name)||genericArmTitle(name)||/[;!?]/u.test(name)||/\b(?:to assess|studies|trials)\b/iu.test(name))return null;
 const population=/\b(?:in|among) ((?:(?!\b(?:in|among)\b)[^,;])+?\b(?:adults?|participants?|patients?|infants?|children|people|men|women)(?: (?:with|without|aged|at risk of) [^,;]+)?)$/iu.exec(aim[3])?.[1];
 return {primary,name,arm:aim[2],goal:aim[1].replace(/[‐‑–]/gu,'-'),qualification:use?aim[2].slice(0,aim[2].lastIndexOf(' of ')).trim():'',outcomeClause:aim[3],population};
}
// For a single source objective, the contrast assigns each intact noun phrase to
// its group. Parenthetical descriptions may contain “with” or “or” within an arm.
function standaloneObjectiveArms(ref){
 if(!Number.isInteger(ref.start)||/[;!?\n]|\.(?=\s+[A-Z])|\b(?:unless|except|only if|provided that|depending on)\b/iu.test(ref.quote))return null;
 const pair=objectiveArms(ref.quote);
 if(!pair?.objective||pair.sharedPurpose||armKey(pair.intervention)===armKey(pair.comparator))return null;
 for(const arm of [pair.intervention,pair.comparator]){
  if(/\b(?:unless|except|when|whether|depending|each other|one another)\b/iu.test(arm))return null;
  const head=arm.replace(/\([^()]+\)/gu,' ').trim();
  if(!head||head.split(/\s+/u).length>16||/[(),;:.!?]|\b(?:among|in|for|on|where|studies|trials|compare[ds]?|versus|assess|outcomes?)\b/iu.test(head))return null;
 }
 const separator=armContrast.exec(ref.quote);
 if(!separator)return null;
 function citation(arm,from){
  const index=ref.quote.indexOf(arm,from);
  if(index<0)return null;
  const start=ref.start+Array.from(ref.quote.slice(0,index)).length;
  return {source_id:ref.source_id,source_revision:ref.source_revision,quote:arm,start,end:start+Array.from(arm).length};
 }
 const intervention=citation(pair.intervention,0),comparator=citation(pair.comparator,separator.index+separator[0].length);
 if(!intervention||!comparator)return null;
 return {intervention,comparator};
}
// An eligibility sentence may repeat the contrast from the preceding objective.
// Require the same two named arms, in order, before using the objective's detail.
function repeatedObjectiveArms(source){
 const end=source.quote.search(/[.!?。](?:\s|$)/u);
 if(end<0)return null;
 const primary={...source,quote:source.quote.slice(0,end)};
 const arms=standaloneObjectiveArms(primary);
 if(!arms)return null;
 const rest=source.quote.slice(end+1);
 const contrasts=[...rest.matchAll(/[^.!?。\n;]+/gu)].filter(m=>armContrast.test(m[0])||/\bcomparing\b/iu.test(m[0]));
 if(!contrasts.length)return null;
 const intervention=armKey(arms.intervention.quote.replace(/\s+\([^()]+\)$/u,''));
 const comparator=armKey(arms.comparator.quote);
 const corroborating=[];
 const repeats=contrasts.every(m=>{
  const s=m[0];
  if(!/^\s*(?:(?:we (?:will )?)?included?|eligible (?:trials|studies)\b)/iu.test(s)||/\b(?:not|except|unless|excluding|whereas|instead)\b/iu.test(s))return false;
  const sides=armKey(s).split(armContrast);
  if(sides.length!==2)return false;
  const first=sides[0].replace(/,$/u,'').trim(),second=sides[1];
  if(!first.endsWith(' '+intervention))return false;
  if(second!==comparator&&!(second.startsWith(comparator+', ')&&/^(?:with follow[- ]up|in |among )/iu.test(second.slice(comparator.length+2))))return false;
  const start=source.start+Array.from(source.quote.slice(0,end+1+m.index)).length;
  corroborating.push({start,end:start+Array.from(s).length});
  return true;
 });
 return repeats?{primary,arms,corroborating}:null;
}
function normalizeComparisonArms(elements,sources=[]){
 const candidates=elements.filter(e=>['intervention','comparator','comparison','comparison_group','control_group','control'].includes(e.dimension_id)&&e.active!==false&&e.information_status==='explicit'&&!e.explicit_revision&&e.decision_status!=='confirmed_by_user'&&e.disposition!=='exclude'&&!e.exceptions?.length&&!e.scope_conditions?.length&&!e.structured_value&&!e.source_occurrence_pending&&!e.source_occurrence_alternatives?.length);
 const pairsBySource=new Map(),objectiveBySource=new Map(),changed=[];
 for(const e of candidates){
  const role=e.dimension_id==='intervention'?'intervention':'comparator',refs=e.source_refs||[],wording=armKey(e.normalized_text);
  const ranges=sources.length?sources:refs;
  let original=ranges.find(r=>refs.length&&refs.every(c=>c.source_id===r.source_id&&c.source_revision===r.source_revision&&Number.isInteger(c.start)&&c.start>=r.start&&c.end<=(r.end??r.start+Array.from(r.quote).length)));
  // A separately quoted objective can also establish the arms when additional
  // sentences discuss other topics without assigning competing treatments.
  if(original&&refs.length===1&&refs[0].quote!==original.quote&&armContrast.test(refs[0].quote)){
   const rest=original.quote.replace(refs[0].quote,'');
   if(!armContrast.test(rest)&&!/\b(?:comparing|eligib\w*|includ\w*|exclud\w*|ineligible|unless|except)\b/iu.test(rest))original=refs[0];
  }
  if(original){
   if(!objectiveBySource.has(original))objectiveBySource.set(original,repeatedObjectiveArms(original)||{primary:original,arms:standaloneObjectiveArms(original)});
   const {primary,arms,corroborating=[]}=objectiveBySource.get(original);
   const citation=arms?.[role];
   const copied=wording===armKey(primary.quote);
   const covers=r=>r.start<=citation.start&&r.end>=citation.end;
   const repeated=r=>corroborating.some(s=>r.start>=s.start&&r.end<=s.end+1)&&armKey(r.quote).includes(armKey(citation.quote.replace(/\s+\([^()]+\)$/u,'')));
   if(citation&&(copied||wording===armKey(citation.quote))&&refs.some(covers)&&refs.every(r=>covers(r)||repeated(r))){
    if(e.normalized_text!==citation.quote)e.metadata_corrections=[...(e.metadata_corrections||[]),{field:'normalized_text',from:e.normalized_text,to:citation.quote,basis:'Separate the two arms of the explicit comparison in the original source.'}];
    e.normalized_text=citation.quote;e.source_refs=[citation];
    if(e.raw_text!==undefined)e.raw_text=citation.quote;
    changed.push({element:e,citation,literalDimension:role});continue;
   }
  }
  const objective=objectiveArms(e.normalized_text);
  if(!objective)continue;
  const arm=armKey(objective[role]);
  const cited=refs.filter(ref=>{
   const quote=armKey(ref.quote);
   if(quote.includes(wording))return true;
   if(quote!==arm&&quote!=='any '+arm)return false;
   return sources.some(source=>source.source_id===ref.source_id&&source.source_revision===ref.source_revision&&armKey(source.quote).includes(wording));
  });
  if(!cited.length)continue;
  const pairs=[];
  for(const ref of cited){
   const ranges=sources.filter(r=>r.source_id===ref.source_id&&r.source_revision===ref.source_revision);
   for(const range of ranges.length?ranges:[ref]){
    if(!Number.isInteger(range.start))continue;
    if(!pairsBySource.has(range))pairsBySource.set(range,explicitComparisonPairs(range));
    pairs.push(...pairsBySource.get(range));
   }
  }
  const equivalent=(a,b)=>armKey(a)===armKey(b)||armKey(a)==='any '+armKey(b);
  const matching=pairs.filter(p=>equivalent(p.intervention,objective.intervention)&&equivalent(p.comparator,objective.comparator));
  if(!matching.length&&!pairs.length&&!objective.sharedPurpose){
   // A standalone, unqualified binary contrast also identifies both arms.
   const simple=arm=>arm.trim().split(/\s+/).length<=12&&!/[,;:.!?]|\b(?:with|compared|versus|vs|in|among|for|where|whether|when|unless|except|receiving|differ|reduce|reducing|includ(?:e|ed)|exclud(?:e|ed)|eligible|ineligible|studies|trials|assess|effects?|each other|one another)\b/i.test(arm);
   if(simple(objective.intervention)&&simple(objective.comparator))matching.push({...objective,ref:cited[0]});
  }
  if(new Set(matching.map(p=>JSON.stringify([armKey(p.intervention),armKey(p.comparator)]))).size!==1)continue;
  const pair=matching[0],text=pair[role];
  if(armKey(pair.intervention)===armKey(pair.comparator))continue;
  const supporting=refs.filter(r=>!cited.includes(r));
  const nextRefs=[pair.ref,...supporting.filter(r=>r.source_id!==pair.ref.source_id||r.source_revision!==pair.ref.source_revision||r.start!==pair.ref.start||r.end!==pair.ref.end)];
  e.metadata_corrections=[...(e.metadata_corrections||[]),{field:'normalized_text',from:e.normalized_text,to:text,basis:'Separate the two arms of the explicit comparison in the original source.'}];
  e.normalized_text=text;e.source_refs=nextRefs;changed.push({element:e,citation:pair.ref});
  if(e.raw_text!==undefined)e.raw_text=D.quoteText(nextRefs,'\n');
 }
 return changed;
}
function normalizeComparators(elements,sources=[]){
 const sourceInterventions=new Set(normalizeComparisonArms(elements,sources).filter(fix=>fix.literalDimension==='intervention').map(fix=>fix.element));
 const target=interventionReference(elements);for(const e of elements.filter(e=>e.active!==false)){
 const clean=value=>norm(phrase(value)).trim().replace(/[.,;:]+$/,'').replace(/^(?:compared\s+(?:with|to)|versus|vs\.?)\s+(?:either\s+)?/i,''),raw=clean(e.raw_text),text=clean(e.normalized_text);
 const dimension=String(e.dimension_id).toLowerCase(),aliases=['comparison','comparisons','comparison_group','comparison.group','control','control_group','control.group','comparators'];
 const comparisonOnly=value=>/^(?:(?:(?:an?|the|either a) )?control (?:group|arm)\b[\s\S]*|(?:standard care|usual care|treatment as usual|placebo|sham|no treatment|wait[- ]?list)(?:\s*[,;]?\s+(?:and|or)\s+(?:(?:an?|another|other)\s+)?[\w\s()-]+)*|each other|one another)$/i.test(value);
 const sourceComparison=/\b(?:compar(?:ed|ing)\s+(?:with|to)|versus|vs\.?|control (?:group|arm)|placebo|each other|one another)\b/i.test(raw);
 const definedIntervention=sourceInterventions.has(e)||dimension==='intervention'&&comparisonOnly(text)&&(e.source_refs||[]).some(ref=>{
  const objective=objectiveArms(ref.quote);
  if(objective&&armKey(objective.intervention)===armKey(text))return true;
  return sources.some(source=>source.source_id===ref.source_id&&source.source_revision===ref.source_revision&&explicitComparisonPairs(source).some(pair=>armKey(pair.intervention)===armKey(text)));
 });
 if(!e.explicit_revision&&e.decision_status!=='confirmed_by_user'&&!definedIntervention&&(aliases.includes(dimension)||(['other','intervention','comparator'].includes(dimension)&&(comparisonOnly(raw)||sourceComparison&&comparisonOnly(text))))){if(e.dimension_id!=='comparator')e.metadata_corrections=[...(e.metadata_corrections||[]),{field:'dimension_id',from:e.dimension_id,to:'comparator',basis:'Source-defined control/comparison alternative'}];e.dimension_id='comparator';}
 if(e.dimension_id==='comparator'&&target&&!e.explicit_revision&&e.decision_status!=='confirmed_by_user'){e.normalized_text=e.normalized_text.replace(/\b(?:a )?control group\s*\(([^()]*)\)/gi,'$1');if(/^(?:each other|one another)$/i.test(raw)||/^(?:each other|one another)$/i.test(text))e.normalized_text='another '+target;else e.normalized_text=e.normalized_text.replace(/\beach other\b|\bone another\b/gi,'another '+target);}
}}

function join(items,op='any_of'){const list=items.filter(Boolean);if(list.length<2)return list[0]||'';const word=op==='any_of'?'or':'and';return list.length===2?list.join(' '+word+' '):list.slice(0,-1).join(', ')+', '+word+' '+list.at(-1);}
function qualifierText(value){if(typeof value==='string')return value;for(const key of ['text','description','condition','quote'])if(typeof value?.[key]==='string')return value[key];D.fail('UNRENDERABLE_QUALIFIER','output','A scope qualifier needs readable source-preserving text before criteria can be displayed.');}
function comparatorDisplayText(value){
 // The field already identifies the comparator. Strip an explicit arm label
 // while keeping treatment names such as “blood pressure control” intact.
 return String(value||'')
  .replace(/^(?:a |an |the )?control (?:group|arm)\s*\(([^()]+)\)$/iu,'$1')
  .replace(/(?<![\p{L}\p{N}])(?:(?:a|an|the)\s+)?(?:'([^'\n]+)'|"([^"\n]+)"|‘([^’\n]+)’|“([^”\n]+)”)\s+control(?:\s+(?:group|arm))?\b/giu,
    (_,single,double,curlySingle,curlyDouble)=>single||double||curlySingle||curlyDouble)
  .replace(/^(?:(?:a|an|the)\s+)?(no (?:exercise|treatment|intervention|training)|placebo|usual care|standard care|sham(?: treatment)?|wait[- ]?list)\s+control(?:\s+(?:group|arm))?$/iu,'$1');
}
function criterionPhrase(c){
 // Keep the subject of a study-level exclusion. Removing “studies of” can
 // turn an excluded research objective into an excluded clinical procedure.
 let value=lower(c.disposition==='exclude'?String(c.text||'').trim().replace(/[.。]+$/,''):phrase(c.text));if(c.dimension_id==='comparator'&&!c.source_decision_ids?.length&&!c.explicit_revision&&c.decision_status!=='confirmed_by_user')value=comparatorDisplayText(value);if(c.scope_conditions?.length&&!/\b(?:if|when|among|for)\b/i.test(value))value='For '+c.scope_conditions.map(x=>qualifierText(x)).join(' and ')+': '+value;if(c.exceptions?.length&&!/\bexcept\b|\bunless\b/i.test(value))value+=', except '+c.exceptions.map(x=>qualifierText(x)).join('; ');return value;}
function naturalExpression(node,criteria){
 if(!node)return '';
 if(node.op==='predicate'){
  const criterion=criteria.find(c=>c.criterion_id===node.criterion_id);
  return criterion?criterionPhrase(criterion):'';
 }
 if(node.op==='not')return 'not ('+naturalExpression(node.children[0],criteria)+')';
 let values=node.children.map(child=>{
  const text=naturalExpression(child,criteria);
  return ['all_of','any_of'].includes(child.op)&&child.op!==node.op&&child.children.length>1?'('+text+')':text;
 });
 if(node.op==='any_of'&&leaves(node).every(id=>criteria.find(c=>c.criterion_id===id)?.dimension_id==='comparator')&&!values.some(v=>/\band\b|\bnot\b/i.test(v)))values=values.flatMap(v=>v.split(/\s+or\s+/i));
 return join(values,node.op);
}
function leaves(node){return node?.op==='predicate'?[node.criterion_id]:(node?.children||[]).flatMap(leaves);}
function factorSharedConditions(node){
 if(!node||node.op==='predicate')return node;const children=node.children.map(factorSharedConditions),key=n=>n.op==='predicate'?'p:'+n.criterion_id:n.op+'('+n.children.map(key).sort().join('|')+')';
 if(node.op!=='any_of')return {...node,children};
 const parts=children.map(n=>n.op==='all_of'?n.children:[n]),common=parts[0].filter(n=>parts.every(branch=>branch.some(item=>key(item)===key(n))));if(!common.length)return {...node,children};
 const keys=new Set(common.map(key)),rest=parts.map(branch=>branch.filter(n=>!keys.has(key(n))));
 // (P and I and C1) or (P and I and C2) = P and I and (C1 or C2).
 // Keep genuinely different populations/interventions coupled to their branch.
 if(rest.every(branch=>branch.length))common.push({op:'any_of',children:rest.map(branch=>branch.length===1?branch[0]:{op:'all_of',children:branch})});
 return common.length===1?common[0]:{op:'all_of',children:common};
}
function splitDimensions(node,criteria,domain){node=factorSharedConditions(node);if(!node)return [];if(node.op==='all_of')return node.children.flatMap(n=>splitDimensions(n,criteria,domain));const ids=[...new Set(leaves(node))],items=ids.map(id=>criteria.find(c=>c.criterion_id===id)).filter(Boolean),names=[...new Set(items.map(c=>domain(c.dimension_id)))];return [{dimension:names.length===1?names[0]:'Other',node,criteria:items,text:naturalExpression(node,criteria)}];}
// Keep a real alternative across fields attached to its branch. Displaying the
// whole disjunction under Other hides the fields; independent rows would change it to AND.
function frameworkUnits(node,criteria,domain,relations){
 const projected=node=>{
  if(!node)return null;
  if(node.op==='predicate')return criteria.some(c=>c.criterion_id===node.criterion_id)?node:null;
  const children=node.children.map(projected).filter(Boolean);
  return !children.length?null:children.length===1&&node.op!=='not'?children[0]:{...node,children};
 };
 const units=splitDimensions(projected(node),criteria,domain);
 return units.flatMap(unit=>{
  if(!unit.criteria.length)return [];
  if(new Set(unit.criteria.map(c=>domain(c.dimension_id))).size===1)return [unit];
  const relation={expression:naturalExpression(unit.node,criteria),fields:[]};
  relations.push(relation);
  function fields(branch,negative=false){
   const ids=leaves(branch),items=criteria.filter(c=>ids.includes(c.criterion_id));
   const dimensions=[...new Set(items.map(c=>domain(c.dimension_id)))];
   if(dimensions.length===1){
    const value=naturalExpression(branch,criteria);
    const text=negative?'not ('+value+')':value;
    relation.fields.push({dimension:dimensions[0],text});
    return [{dimension:dimensions[0],node:branch,criteria:items,text,linked:true}];
   }
   if(branch.op==='not')return fields(branch.children[0],!negative);
   return branch.children.flatMap(child=>fields(child,negative));
  }
  return fields(unit.node);
 });
}
function ageClause(criteria){if(criteria.length!==1||criteria[0].dimension_id!=='population.age')return null;const value=criteria[0].structured_value;if(!value)return null;const unit=['year','years'].includes(value.unit)?'years':value.unit;if(value.operator==='between')return 'aged '+(value.lower_inclusive===false?'>':'≥')+value.lower+' and '+(value.upper_inclusive===false?'<':'≤')+value.upper+' '+unit;const symbols={gt:'>',gte:'≥',lt:'<',lte:'≤',eq:'='};return symbols[value.operator]?'aged '+symbols[value.operator]+value.value+' '+unit:null;}
function clause(dimension,value,reference){return lower(phrase(value));}
const titleDimensions={pico:'intervention',picos:'intervention',peco:'exposure',pecos:'exposure',peo:'exposure',
 pcc:'concept',pico_qualitative:'phenomenon_of_interest',spider:'phenomenon_of_interest',cocopop:'condition',pird:'index_test'};
function titlePhrase(value){
 if(/(?:…|\.{2,})\s*$/u.test(value||''))return '';
 return norm(phrase(value)).replace(/^this (?:review|study) (?:examines|assesses|evaluates|investigates|explores|compares|maps|synthesi[sz]es|focuses on)\s+(?:(?:the )?evidence (?:on|concerning) )?/i,'')
  .replace(/^to (?:assess|evaluate|examine|investigate|explore|compare|map)\s+/i,'')
  .replace(/^(?:the )?(?:effects?|effectiveness) of (?!.*\bon\b)/i,'')
  .replace(/(?:[.;]\s+(?:include|exclude|use|assess eligibility|define eligibility)\b|,?\s+(?:(?:who\s+)?(?:were|are)\s+)?(?:recruited|enrolled|followed up)\s+(?:at|from|between|for|after)\b)[\s\S]*$/i,'')
  .replace(/\bhospitali[sz]ed (older )?(?:people|adults|patients|participants)\b/gi,(_,age)=>(age||'')+'inpatients')
  .replace(/\bat risk of or with (?:established )?/gi,'with or at risk of ')
  .replace(/^(?:Pain|Usual|Air|Daily|Standard|Physical|Cognitive|Lived|Recovery|Randomi[sz]ed|Workplace|Prevalence|Incidence|An?|The)\b/,word=>word.toLowerCase())
  .replace(/[.。]+$/u,'').trim();
}
function completePhrase(value){
 return value&&!/(?:…|\.{2,}|[,;:/-]|\b(?:and|or|with|without|versus|of|for|on|in|the|who|were))$/iu.test(value);
}
function compactTitle(value,maxWords=14,maxLength=105){
 return completePhrase(value)&&value.length<=maxLength&&value.split(/\s+/u).length<=maxWords&&
  (value.match(/[\u3400-\u9fff]/gu)||[]).length<=28;
}
function populationTitleHead(value){
 return value.split(/[,;]\s+|\s+(?:who (?:were|are|have|had|received)|experiencing|recruited|enrolled|followed up|participating in)\s+/iu)[0]
  .replace(/\s+aged\s+(?:(?:at least|at most|between|over|under)\s+)?[<>≥≤=\s]*\d+(?:[.\d]*)(?:\s*(?:to|and|[-–])\s*\d+(?:[.\d]*))?\s+(?:days?|weeks?|months?|years?)(?:\s+or (?:older|younger))?(?=$|\s)/iu,'')
  .replace(/\s*\((?:[≥≤<>˂˃=]\s*)?\d+(?:\.\d+)?\s+weeks?'? gestation\)/giu,'')
  .replace(/\s+who required [^,;]+$/iu,'')
  .replace(/^(?:term and preterm|preterm and term) (infants|neonates)\b/iu,'$1')
  .trim();
}
const populationNoun=/\b(?:adults?|participants?|patients?|infants?|neonates?|newborns?|children|adolescents?|people|men|women|survivors?|caregivers?|inpatients?|outpatients?)\b/iu;
function statedPopulation(original){
 const [primary,...sentences]=original.split(/[.!?](?=\s|$)|[;\n]/u);
 const inclusions=sentences.filter(sentence=>/^\s*(?:we\s+)?(?:included|include|eligible studies included)\b/iu.test(sentence));
 // Read complete noun phrases from the objective. Ignore trailing settings and time cues.
 for(const sentence of [primary,...inclusions]){
  for(const lead of [...sentence.matchAll(/\s+(?:in|among|of|for|enrolling)\s+/giu)].reverse()){
   const group=sentence.slice(lead.index+lead[0].length).split(/\s+(?:at birth|at baseline|in (?:the |reducing|improving)|took|were assigned|compared with|versus|to (?:assess|determine|improve|reduce))\b/iu)[0];
   const candidate=populationTitleHead(titlePhrase(group));
   const noun=populationNoun.exec(candidate);
   if(noun&&noun.index<=40&&compactTitle(candidate)&&!/[?;,:()]|\b(?:versus|compared|outcomes?|trials?)\b/iu.test(candidate))return lower(candidate);
  }
 }
 return '';
}
function comparisonTitleTerms(value,original){
 let text=value.replace(/[‐‑]/gu,'-')
  .replace(/\s+\([^()]*\balone or (?:combined |in combination )?with\b[^()]*\)$/iu,'')
  .replace(/^['‘“"](.+)['’”"] (?:control|control group)$/iu,'$1');
 text=abbreviationFormatter(abbreviationDefinitions(original),{longOnly:true})(text);
 return text.replace(/\bCoronary heart disease\b/gu,'coronary heart disease');
}
const unnamedIntervention=/^(?:(?:the|an?|any|various|different|multiple|several|eligible|active|experimental|study|specified|unspecified)\s+)*(?:interventions?|treatments?|therap(?:y|ies))(?:\s+(?:arms?|groups?|of interest|under study|\d+))?$/iu;
function genericArmTitle(text){
 return unnamedIntervention.test(text.replace(/^(?:the )?(?:effects?|effectiveness|benefits and harms) of /iu,'').split(/\s+(?:in|for|on|among)\s+/iu)[0]);
}
function interventionTitleName(value){
 if(/^(?:to |we (?:aim(?:ed)? to )?)(?:assess|evaluate|examine|investigate|determine|compare)\b/iu.test(value))return treatmentObjective(value)?.name||'';
 let text=titlePhrase(value).replace(treatmentDuration,'').replace(/^(?:various|different|multiple|several)\s+/iu,'');
 const definition=/^(.+?)\s*\(([^()]+)\)$/u.exec(text);
 if(definition){
  const [,head,detail]=definition;
  // A placeholder may introduce the actual arm name. A named arm may instead
  // be followed by a description of how it was delivered.
  if(unnamedIntervention.test(head))text=/^(?:e\.g\.|including\b|such as\b|for example\b)/iu.test(detail)?'':detail.trim();
  else text=head.trim();
 }
 const delivery=/^(.+?)\s*,?\s+(?:delivered|administered|provided|performed)\s+(?:in|over|during|by|for|at)\b/iu.exec(text);
 if(delivery&&!/\b(?:and|or|plus|combined with)\b/iu.test(text.slice(delivery[1].length)))text=delivery[1].trim();
 text=text.replace(/\b(exercise|training|counselling|therapy|rehabilitation|supplementation|vaccination|stimulation) interventions?$/iu,'$1');
 return completePhrase(text)&&!genericArmTitle(text)?text:'';
}
function focalIntervention(original){
 const primary=original.split(/[.!?](?=\s+[A-Z]|$)|[;\n]/u)[0];
 const pair=objectiveArms(primary);
 const aim=/^(?:to |we (?:aim(?:ed)? to )?)?(?:assess|evaluate|examine|investigate|determine)\s+(?:the\s+)?(?:(?:effects?|impacts?|benefits?|harms?|safety|efficacy|effectiveness|clinical|comparative|cost|and)[ ‐‑–-]+)+of\s+(.+)$/iu;
 const stated=pair?.intervention||treatmentObjective(primary)?.name||aim.exec(primary)?.[1]||/\b(?:the (?:active |experimental )?intervention (?:was|is|consisted of)|the intervention group received)\s+([^.!?;\n]+)/iu.exec(original)?.[1];
 if(!stated)return '';
 const name=interventionTitleName(stated.replace(aim,'$1').split(/,?\s+(?:on\s+|(?:in|among|for)\s+(?:older |younger |hospitali[sz]ed )?(?:adults?|participants?|patients?|infants?|children|people|men|women)\b)/iu)[0]);
 return compactTitle(name)&&!/[;?!]|\b(?:assess|evaluate|compared|versus|studies|trials)\b/iu.test(name)?lower(name):'';
}
function clinicalComparisonTitle(original,intervention,comparison,populations){
 if(!original||!intervention||!comparison||!compactTitle(intervention)||!compactTitle(comparison))return '';
 // Bind a clinical use to the actual named arms in the primary objective.
 // A secondary subgroup question or a comparator-specific indication cannot supply it.
 const primary=original.split(/[.!?](?=\s+[A-Z]|$)|[;\n]/u)[0];
 const armPattern=value=>value.replace(/^(?:any|the)\s+/i,'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const pair=new RegExp('(?:^|\\s)('+armPattern(intervention)+')\\s*,?\\s*(compared (?:with|to)|versus|vs\\.?|with)\\s+(?:any |the )?('+armPattern(comparison)+')\\s+(for .+)$','i').exec(primary);
 if(!pair||/^with$/i.test(pair[2])&&!/\bcompar(?:e|ing)\s*$/i.test(primary.slice(0,pair.index)))return '';
 const use=titlePhrase(pair[4].split(/,?\s+(?:in (?:reducing|improving|increasing|decreasing)\b|(?:to|and to) (?:assess|evaluate|determine|reduce|improve)\b|using (?:a |an )?(?:network )?meta[- ]analysis\b)|[,;]\s*(?:including|with particular|according to)\b/i)[0]).replace(/\s+at birth$/iu,'');
 if(!/^for (?:the )?(?:[\w-]+ ){0,2}(?:[\w-]+(?:tion|sion|ment|ing)|diagnosis|repair|relief|control)\b/i.test(use))return '';
 const contains=(whole,part)=>(' '+whole.toLowerCase()+' ').includes(' '+part.toLowerCase()+' ');
 const groups=populations.map(e=>({value:lower(titlePhrase(e.normalized_text)),confirmed:e.explicit_revision||e.decision_status==='confirmed_by_user'}));
 let candidate=(interventionTitleName(intervention)||intervention)+' '+use;
 function matchesPopulation(g){
  const head=populationTitleHead(g.value);
  if(!head)return false;
  if(contains(use,head))return true;
  // The title states the primary objective in its original terms. An eligibility
  // sentence may enumerate the same descriptors with "and" instead of "or".
  // Only use this allowance for wording actually present in the same source.
  return !g.confirmed&&/\band\b/i.test(head)&&contains(original.replace(/[.,;:!?]/g,' '),head)&&
   contains(use,head.replace(/\band\b/i,'or'));
 }
 if(groups.length&&!groups.some(matchesPopulation)){
  if(groups.length!==1||/\b(?:among|in|patients?|adults?|children|people|infants?|neonates?|participants?|women|men|adolescents?|newborns?)\b/i.test(use))return '';
  candidate+=' in '+groups[0].value;
 }
 if(groups.some(g=>g.confirmed&&!contains(candidate,g.value)))return '';
 return compactTitle(candidate,19,135)?candidate:'';
}
function topic(question,elements){
 const scope=elements.filter(e=>e.active!==false&&!e.source_occurrence_pending&&(!e.review_pending||e.decision_status==='confirmed_by_user')&&e.information_status!=='missing'&&
  e.disposition!=='exclude'&&e.semantic_review?.status!=='contradicted'&&e.semantic_role!=='background_information'&&e.normalized_text);
 const frame=question.framework_mapping?.framework_id;
 const contrastWording=/\b(?:versus|vs\.?(?=\s|$)|compar(?:e|ed|ing)|comparison (?:of|between|with|to))\b/iu;
 function elementTitle(e){
  if(e.dimension_id==='population'&&e.title_population&&!e.explicit_revision&&e.decision_status!=='confirmed_by_user'&&
     e.source_refs?.some(ref=>ref.quote===e.title_population))return titlePhrase(e.title_population);
  const arm=['intervention','exposure'].includes(e.dimension_id)&&objectiveArms(e.normalized_text);
  const value=arm?arm.intervention:e.normalized_text;
  if(e.dimension_id==='intervention')return interventionTitleName(value);
  return ['population','sample'].includes(e.dimension_id)?populationTitleHead(titlePhrase(value)):titlePhrase(value);
 }
 // Project only the named dimension onto the original logic tree. Alternatives
 // and combined interventions must not be reduced to the first listed arm.
 function wording(dimension){
  let group=scope.filter(e=>e.dimension_id===dimension);
  if(['population','sample'].includes(dimension)&&group.some(e=>populationNoun.test(elementTitle(e)))){
   group=group.filter(e=>populationNoun.test(elementTitle(e)));
  }
  const values=[...new Set(group.map(e=>lower(elementTitle(e))).filter(completePhrase))];
  if(values.length<=1)return values[0]||'';
  if(question.logic&&group.every(e=>e.element_id)){
   const records=group.map(e=>({...e,criterion_id:e.element_id,text:elementTitle(e)}));
   const tree=D.mapExpression(question.logic,new Map(group.map(e=>[e.element_id,e.element_id])));
   const mapped=new Set(leaves(tree));
   if(group.every(e=>mapped.has(e.element_id)))return naturalExpression(tree,records);
  }
  return join(values);
 }
 const original=norm(question.original_text||'');
 const compareReview=titleDimensions[frame]==='intervention';
 const revisedPopulation=elements.some(e=>e.active!==false&&['population','sample'].includes(e.dimension_id.split('.')[0])&&
  (e.explicit_revision||e.decision_status==='confirmed_by_user'));
 const effectAim=compareReview?treatmentObjective(original):null;
 const pendingPopulation=!revisedPopulation&&elements.find(e=>e.active!==false&&e.review_pending&&!e.source_occurrence_pending&&e.disposition==='include'&&
  ['population','sample'].includes(e.dimension_id)&&e.source_refs?.some(ref=>armKey(ref.quote)===armKey(e.normalized_text)));
 const populationValue=(!revisedPopulation&&effectAim?.population)||wording('population')||wording('sample')||
  (!revisedPopulation&&(statedPopulation(original)||pendingPopulation&&elementTitle(pendingPopulation)))||'';
 const population=populationTitleHead(compareReview?comparisonTitleTerms(populationValue,original):populationValue);
 const titlePopulations=scope.filter(e=>['population','sample'].includes(e.dimension_id));
 if(!titlePopulations.length&&population)titlePopulations.push({normalized_text:population});
 // Keep an intact clinical group before ancillary recruitment or follow-up details.
 const populationHead=populationTitleHead(population);
 const shortPopulation=compactTitle(populationHead)?populationHead:'';
 const ranked=[...new Set([titleDimensions[frame],'intervention','exposure','phenomenon_of_interest','concept','index_test','condition','target_condition','outcome','core_scope'].filter(Boolean))];
 const interventionRecords=elements.filter(e=>e.active!==false&&e.dimension_id==='intervention'&&e.disposition!=='exclude');
 const authorIntervention=interventionRecords.some(e=>e.explicit_revision||e.decision_status==='confirmed_by_user');
 const sourceName=compareReview&&!authorIntervention?focalIntervention(original):'';
 const dimension=ranked.find(id=>scope.some(e=>e.dimension_id===id)||id==='intervention'&&sourceName);
 let subject=dimension?wording(dimension):'';
 if(dimension==='intervention'&&sourceName){
  const namedClass=/\b(?:interventions|therapies|treatments|strategies|programmes|programs)\b$/iu.test(sourceName);
  const singleName=interventionRecords.length===1&&armKey(subject).startsWith(armKey(sourceName)+' ');
  if(effectAim||!subject||!compactTitle(subject)&&(namedClass||singleName))subject=sourceName;
 }
 let comparison=wording('comparator');
 // Either arm can independently contain the copied primary objective. Recover
 // the affected arm from that objective and keep every other named arm intact.
 let primaryTitle='';
 if(dimension==='intervention'||titleDimensions[frame]==='intervention'){
  const primary=original.split(/[.!?](?=\s+[A-Z]|$)|[;\n]/u)[0];
  const pair=objectiveArms(primary);
  if(pair&&interventionTitleName(pair.intervention)&&compactTitle(pair.intervention)&&compactTitle(pair.comparator)&&armKey(pair.intervention)!==armKey(pair.comparator)){
   function recover(dimension,value,arm){
    const records=scope.filter(e=>e.dimension_id===dimension);
    const copied=e=>!e.explicit_revision&&e.decision_status!=='confirmed_by_user'&&armKey(e.normalized_text)===armKey(primary);
    const key=text=>armKey(text).replace(/^any /,'');
    return records.some(copied)&&records.every(e=>copied(e)||key(e.normalized_text)===key(arm))?lower(titlePhrase(arm)):value;
   }
   subject=recover('intervention',subject,pair.intervention);
   comparison=recover('comparator',comparison,pair.comparator);
   // A review title describes the whole question even if an eligibility field
   // still awaits review. Use the stated primary objective only when no settled
   // treatment or author decision conflicts with it.
   const matches=(value,arm)=>!value||armKey(value).replace(/^any /,'')===armKey(arm).replace(/^any /,'');
   const protectedArm=elements.some(e=>e.active!==false&&['intervention','comparator'].includes(e.dimension_id)&&
    (e.decision_status==='confirmed_by_user'||e.explicit_revision)&&(e.scope_status==='not_applicable'||e.scope_status==='unrestricted'));
   if(!protectedArm&&(dimension!=='intervention'||matches(subject,pair.intervention))&&matches(comparison,pair.comparator)){
    primaryTitle=clinicalComparisonTitle(original,lower(titlePhrase(pair.intervention)),lower(titlePhrase(pair.comparator)),titlePopulations);
   }
  }
 }
 const clinicalTitle=primaryTitle||(dimension==='intervention'&&clinicalComparisonTitle(original,subject,comparison,titlePopulations));
 if(dimension==='intervention')subject=comparisonTitleTerms(subject,original);
 if(dimension==='index_test'){
  if(/\bdiagnostic accuracy\b/i.test(original))subject='diagnostic accuracy of '+subject;
  const target=wording('target_condition');if(target)subject+=' for '+target;
 }
 if(dimension==='condition'){
  const measure=original.match(/\b(prevalence and incidence|incidence and prevalence|prevalence|incidence)\b/i)?.[0];
  if(measure&&!subject.toLowerCase().includes(measure.toLowerCase()))subject=measure.toLowerCase()+' of '+subject;
 }
 const outcome=wording('outcome');
 const focus=subject&&dimension==='exposure'&&compactTitle(outcome,5,45)&&!/[,(]|\b(?:and|or|outcomes?)\b/iu.test(outcome)&&
  !subject.toLowerCase().includes(outcome.toLowerCase())?outcome:'';
 const people=population&&subject&&!subject.toLowerCase().includes(population.toLowerCase())?' in '+population:'';
 const withFocus=focus?subject+' and '+focus:'';
 // When the full clinical phrase exceeds the display budget, the existing
 // extraction may already contain a short title. Accept only supported wording
 // grounded in the intervention, exposure or other focal dimensions.
 const suggested=titlePhrase(question.review_topic||question.original_text);
 const tokens=value=>(norm(value).toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(token=>!/^(?:a|an|the|of|for|in|on|to|with|or|and|versus|by|during|patients?|people|participants?|interventions?)$/i.test(token));
 function supportedTitle(){
  if(!compactTitle(suggested)||contrastWording.test(suggested)||/[.?;]\s|\b(?:meta-analysis|eligible studies|randomised trials only)\b/i.test(suggested))return '';
  if(compareReview&&genericArmTitle(suggested))return '';
  const source=scope.length?scope.filter(e=>e.dimension_id!=='comparator').map(elementTitle).join(' '):
   objectiveArms(original)?.intervention||original;
  const basis=new Set(tokens(source)),terms=tokens(suggested);
  if(!terms.length||terms.some(token=>!basis.has(token)))return '';
  const focal=scope.filter(e=>e.dimension_id===dimension||!dimension&&['population','sample'].includes(e.dimension_id));
  return focal.every(e=>{
   const value=elementTitle(e).toLowerCase();
   if(/\b(?:no|not|without|versus)\b/.test(value)&&!suggested.toLowerCase().includes(value))return false;
   return tokens(value).some(token=>terms.includes(token));
  })?suggested:'';
 }
 let result=clinicalTitle||[withFocus&&withFocus+people,subject&&subject+people].find(value=>compactTitle(value));
 if(!result){
  const shortPeople=people&&shortPopulation&&population!==shortPopulation?' in '+shortPopulation:'';
  const shorter=[withFocus&&shortPeople&&withFocus+shortPeople,subject&&shortPeople&&subject+shortPeople];
  const supported=supportedTitle();
  const namesPopulation=shortPopulation&&armKey(supported).includes(armKey(shortPopulation));
  result=shorter.find(value=>compactTitle(value))||(people&&compactTitle(subject+people,19,135)?subject+people:'')||
   (namesPopulation?supported:'')||(population?(shortPopulation||population):supported||[withFocus,subject].find(value=>compactTitle(value)));
 }
 if(!result){
  const names={exposure:'Exposures',phenomenon_of_interest:'Experiences',concept:'Review concept',index_test:'Diagnostic testing',condition:'Clinical condition',target_condition:'Clinical condition',outcome:'Outcomes',core_scope:'Review scope'};
  const name=names[dimension]||'';
  const originalAim=(question.original_text||'').split(/[.!?;]\s+|,\s+and to\s+|\s+using (?:a |an )?(?:network )?meta.analysis/iu)[0];
  const primary=objectiveArms(originalAim)?.intervention||(!contrastWording.test(originalAim)&&!comparison?originalAim:'');
  const trials=dimension==='intervention'?[subject&&shortPopulation&&subject+' in '+shortPopulation,subject]:
   [compareReview?sourceName:titlePhrase(primary),subject&&shortPopulation&&subject+' in '+shortPopulation,subject,name&&shortPopulation&&name+' in '+shortPopulation,name];
  result=trials.find(value=>compactTitle(value))||(dimension==='intervention'&&compactTitle(subject,19,135)&&subject)||shortPopulation||(compactTitle(population,19,135)&&population)||'Review population and scope';
 }
 // Retain the local model's wording when it expresses the same source-backed
 // subject and clinical scope.
 if(question.review_topic&&compactTitle(suggested,19,135)&&armKey(suggested)===armKey(result))result=suggested;
 return result.replace(/^./u,c=>c.toUpperCase());
}
function projectTopic(questions){
 const titles=[...new Set(questions.map(q=>abbreviationFormatter(abbreviationDefinitions(q.research_question||''),{longOnly:true})(q.objective?.trim()||'')).filter(Boolean))];
 if(titles.length<2)return titles[0]||'';
 const combined=titles.join(' · ');
 return compactTitle(combined)?combined:titles[0]+' (+'+(titles.length-1)+' other '+(titles.length===2?'topic':'topics')+')';
}
// Clear, direct, active prose; keep source qualifications and protocol tense.
// Writing reference: https://www.bmj.com/about-bmj/resources-authors/house-style
// Use an explicitly enumerated outcome list and a stated effect-modification
// objective verbatim. Keep the positions in the question to distinguish these
// declarations from separate requirements, added sources and author decisions.
function declaredFocus(source){
 const declarations=[];
 let cursor=0,offset=0;
 for(const boundary of source.matchAll(/[.!?](?=\s|$)|$/g)){
  if(boundary[0]==='.'&&/\b(?:e\.g|i\.e|vs)\.$/i.test(source.slice(Math.max(0,boundary.index-5),boundary.index+1)))continue;
  const end=boundary.index+boundary[0].length,raw=source.slice(cursor,end);
  const text=raw.trim().replace(/[.!?]$/,'').trim();
  const position=offset;offset+=Array.from(raw).length;cursor=end;
  if(!text)continue;
  const ranked=text.match(/^(?:(?:our|the) )?(primary|secondary|critical) outcomes?\s*(?:(?:included?|comprised?|was|were|is|are)\s+|:\s*)(.+)$/is);
  const list=ranked?[text,ranked[2]]:text.match(/^(?:(?:our|the) )?outcomes? of interest (?:were|are|included?)\s+(.+)$/is);
  const modifiers=text.match(/^(?:(?:to |we (?:aim(?:ed)? to )?)?(?:assess|determine|examine|investigate|evaluate) whether (?:the )?((?:benefits and harms|effects?)\b.+? (?:differ(?:ed)?|var(?:y|ied)) (?:according to|by) .+))$/is);
  const objective=text.match(/^(?:to |we (?:aim(?:ed)? to )?)(?:assess|evaluate|examine|investigate|determine)\s+(?:the )?[^.;:!?]*?\b(?:e(?:ff|ﬀ)ects?|impact|e(?:ff|ﬀ)ectiveness|benefits? and harms?) of .+?\s+on\s+(.+)$/iu);
  // Keep endpoint modifiers, while separating a final clause naming the cohort.
  const endpoints=objective?.[1].split(/,?\s+(?:in|among)\s+(?=(?:(?:[\w‐‑–-]+\s+){0,5})(?:women|men|adults?|children|people|patients?|participants?|infants?|newborns?)\b)|,\s+and to\s+/iu)[0];
  const examples=text.match(/^(?:we|the review) focus(?:es|ed)? on (?:studies?|trials?) (?:assessing|evaluating|examining|reporting) .+?\boutcomes?,\s*(?:including|such as)\s+(.+)$/iu);
  const scopeMatch=text.match(/^(.+?)\s+(?:is|was|were|are)\s+(?:beyond|outside) the scope of (?:this|our|the) review\b/iu);
  // Only an explicit review aim or endpoint is a narrative boundary. A group
  // of people or studies described as outside scope can still define eligibility.
  const reviewAim=/^(?:(?:the |its |their )?(?:(?:long[‐‑– -]term|short[‐‑– -]term|clinical|adverse|beneficial) )*(?:efficacy|effectiveness|safety|benefits?|harms?|effects?|impact|outcomes?|endpoints?|symptom relief)\b|.{1,100}['’]s\s+(?:efficacy|effectiveness|safety|effects?|impact)\b)/iu;
  const scopeNote=scopeMatch&&reviewAim.test(scopeMatch[1])?scopeMatch[0]:'';
  if(!modifiers&&!endpoints&&!examples&&!scopeNote&&(!list||/^(?:not|unknown|unclear|unavailable|unreported|described|reported|as follows\s*$)\b/i.test(list[1])))continue;
  const start=position+Array.from(raw.slice(0,raw.indexOf(text))).length;
  const dimension=scopeNote?'review_boundary':modifiers?'analysis_objective':examples?'outcome_examples':endpoints?'objective_endpoints':'outcome';
  const value=scopeNote||modifiers?.[1]||examples?.[1]||endpoints||list[1];
  const scopeRemainder=scopeNote&&text.slice(scopeNote.length);
  const governingText=scopeRemainder&&!/^,?\s+and (?:is|was|has been) (?:assessed|reviewed|addressed|covered) (?:in|by)\b/iu.test(scopeRemainder)?scopeNote:text;
  const valueAt=text.lastIndexOf(value);
  const valueStart=start+Array.from(text.slice(0,valueAt)).length;
  declarations.push({dimension,text,value:value.trim(),...(ranked&&{rank:ranked[1].toLowerCase()}),start,end:start+Array.from(governingText).length,valueStart,valueEnd:valueStart+Array.from(value).length});
 }
 return declarations;
}
function listedOutcomes(text){
 // Delimit top-level endpoints only. Nested procedures, shared modifiers and
 // parallel adjectives (such as "fatal and non-fatal MI") stay together.
 const items=[];
 let start=0,depth=0;
 for(const match of text.matchAll(/[()[\]]|;\s*|,\s+(?:and\s+)?|\s+and\s+/giu)){
  const token=match[0];
  if(token==='('||token==='['){depth++;continue;}
  if(token===')'||token===']'){if(--depth<0)return [text];continue;}
  if(depth)continue;
  const before=text.slice(start,match.index).trim(),after=text.slice(match.index+token.length);
  if(!before||/^(?:including|defined as|measured|assessed|which included|at |as |with |without )/iu.test(after)||
     /^\d+(?:\.\d+)?(?=\s*,|\s+and\b|\s+(?:days?|weeks?|months?|hours?)\b)/iu.test(after))continue;
  if(token.trim().toLowerCase()==='and'&&
     (!/^(?:[A-Z][A-Za-z0-9]{1,8}\b|(?:cost[‐‑– -]effectiveness|(?:health[‐‑– -]related )?quality of life|mortality|morbidity|pain|hospitali[sz]ation|revascularisation|survival|cognition|fractures?|cancer|adverse events?|incidence of|length of stay|(?:serum|blood) [a-z-]+ (?:levels?|concentrations?))\b)/u.test(after)||
      /^(?:fatal|non[‐‑– -]fatal|primary|secondary|all[‐‑– -]cause|cardiovascular|moderate|mild|severe|short[‐‑– -]term|long[‐‑– -]term)$/iu.test(before)))continue;
  items.push(before);start=match.index+token.length;
 }
 return depth?[text]:[...items,text.slice(start).trim()].filter(Boolean);
}
function outcomeGroups(source){
 const groups=[];
 const names=outcomeAbbreviations(source);
 const declarations=declaredFocus(source);
 // A dedicated outcomes section supplies the detailed definitions. Otherwise
 // preserve the endpoints named in the objective before the illustrative list.
 const kind=['outcome','objective_endpoints','outcome_examples'].find(kind=>declarations.some(d=>d.dimension===kind));
 for(const d of declarations.filter(d=>d.dimension===kind)){
  const label=d.rank?d.rank[0].toUpperCase()+d.rank.slice(1):'';
  let group=groups.find(g=>g.label===label);
  if(!group){group={label,items:[]};groups.push(group);}
  for(const item of listedOutcomes(d.value)){
   const label=names.get(item)?names.get(item)+' ('+item+')':item
    .replace(/at the latest periods of measurements, which included /iu,'at the latest recorded time points, including ')
    .replace(/\b(hours?|days?|weeks?) (?:after|aOer) treatment commencement\b/giu,'$1 after treatment began');
   if(!group.items.includes(label))group.items.push(label);
  }
 }
 return groups;
}
// Split long enumerations at top-level noun phrases only. A continuation,
// embedded "and", time range or qualification stays with its endpoint.
function outcomeAbbreviations(source){
 const abbreviations=new Map();
 const remember=(short,long)=>{
  const prior=abbreviations.get(short);
  const key=s=>s.toLowerCase().replace(/[‐‑]/gu,'-').replace(/\s+/gu,' ');
  abbreviations.set(short,prior===undefined?long:key(prior)===key(long)?prior:'');
 };
 const initialsOf=words=>words.map(w=>w[0]).join('').toUpperCase();
 const matches=(words,short)=>{
  const caps=short.replace(/s$/u,'').toUpperCase(),initials=initialsOf(words);
  return initials===short.toUpperCase()||initials===caps||
   words.length===2&&caps.length===3&&words[0][0].toUpperCase()===caps[0]&&
   words[0].slice(1).toUpperCase().includes(caps[1])&&words[1][0].toUpperCase()===caps[2];
 };
 for(const match of source.matchAll(/\s+\(([A-Z][A-Za-z0-9]{1,8})\)/g)){
  const short=match[1];
  const tail=source.slice(Math.max(0,match.index-120),match.index).split(/[\n!?。；;]/u).at(-1);
  const words=[...tail.matchAll(/[\p{L}]+/gu)].slice(-6);
  for(let i=0;i<words.length;i++){
   const name=words.slice(i).map(m=>m[0]);
   if(!matches(name,short))continue;
   const long=tail.slice(words[i].index);
   if(/[^\p{L}\s‐‑–-]/u.test(long))continue;
   remember(short,long);
   break;
  }
 }
 for(const match of source.matchAll(/\b([A-Z][A-Za-z0-9]{1,8})\s+\(([\p{L}][\p{L} ‐‑–-]{3,90})\)/gu)){
  const words=match[2].match(/[\p{L}]+/gu);
  if(matches(words,match[1]))remember(match[1],match[2]);
 }
 return abbreviations;
}
function abbreviationDefinitions(source){
 source=Array.isArray(source)?source.join('\n'):String(source||'');
 const definitions=outcomeAbbreviations(source);
 if(!definitions.has('CR')&&/\b[Ee]xercise[-‐‑ ]based CR\b/u.test(source)&&
    /\b(?:coronary heart disease|cardiac rehabilitation)\b/iu.test(source))definitions.set('CR','cardiac rehabilitation');
 // Some sources give the full design in prose and use only the acronym in a field.
 const trials=source.match(/\brandomi[sz]ed controlled trials?\b/iu);
 if(trials||/\bRCTs\b/u.test(source)||/\b(?:study design|randomised|randomized|trial)\b[\s\S]{0,70}\bRCT\b/iu.test(source)){
  const name=trials?trials[0].toLowerCase().replace(/s$/u,''):'randomised controlled trial';
  if(!definitions.has('RCT')&&!definitions.has('RCTs')){definitions.set('RCT',name);definitions.set('RCTs',name+'s');}
  else if(definitions.get('RCTs')?.toLowerCase()===name+'s'&&!definitions.has('RCT'))definitions.set('RCT',name);
  else if(definitions.get('RCT')?.toLowerCase()===name&&!definitions.has('RCTs'))definitions.set('RCTs',name+'s');
 }
 for(const [id,long] of [['HRQoL','health-related quality of life'],['COPD','chronic obstructive pulmonary disease']]){
  if(!definitions.has(id)&&new RegExp('\\b'+id+'\\b','u').test(source))definitions.set(id,long);
 }
 return [...definitions].filter(([short,long])=>long&&!/^(?:AND|OR|NOT|IU|SI|CIU|Hz|Pa|Gy|Sv|mL|mmHg)$/u.test(short));
}
function abbreviationFormatter(definitions,{longOnly=false}={}){
 const names=new Map(),seen=new Set(),conflicts=new Set();
 const key=text=>text.toLowerCase().replace(/[‐‑–]/gu,'-').replace(/\s+/gu,' ').trim();
 for(const [id,long] of definitions||[]){
  if(!long||conflicts.has(id))continue;
  if(names.has(id)&&key(names.get(id))!==key(long)){names.delete(id);conflicts.add(id);}
  else names.set(id,long);
 }
 if(!names.size)return text=>text;
 const ids=[...names.keys()].filter(short=>/^[A-Z][A-Za-z0-9]{1,8}$/u.test(short)).sort((a,b)=>b.length-a.length).join('|');
 if(!ids)return text=>text;
 const pattern=new RegExp('\\(('+ids+')\\)|\\b('+ids+')\\b','gu');
 return value=>{
  const text=value.replace(/\b([A-Z][A-Za-z0-9]{1,8})\s+\(([\p{L}][\p{L} ‐‑–-]{3,90})\)/gu,(pair,id,long)=>
   names.has(id)&&key(names.get(id))===key(long)?long+' ('+id+')':pair);
  return text.replace(pattern,(token,parenthesised,bare,index)=>{
  const short=parenthesised||bare,name=names.get(short),prefix=key(text.slice(Math.max(0,index-2*name.length-10),index));
  if(parenthesised&&prefix.endsWith(key(name))){
   const repeat=seen.has(short);seen.add(short);return longOnly||repeat?'':token;
  }
  if(!longOnly&&seen.has(short))return token;
  seen.add(short);
  if(longOnly)return name;
  return parenthesised?'('+name+' ('+short+'))':name+' ('+short+')';
  }).replace(/[ \t]+(?=[.,)]|$)/gu,'').replace(/ {2,}/gu,' ');
 };
}
function outcomeSentences(list,source){
 let text=list;
 const abbreviations=outcomeAbbreviations(source);
 for(const [short,long] of abbreviations){
  if(!long||text.includes('('+short+')')||text.toLowerCase().includes(long.toLowerCase()))continue;
  text=text.replace(new RegExp('\\b'+short+'\\b'),()=>long+' ('+short+')');
 }
 let depth=0,start=0;
 const parts=[];
 for(let i=0;i<text.length;i++){
  if(text[i]==='(')depth++;
  else if(text[i]===')')depth--;
  else if(!depth&&text[i]===','&&text[i+1]===' '){
   parts.push(text.slice(start,i));start=i+2;
  }
 }
 parts.push(text.slice(start));
 const endpoint=/^(?:(?:all[-‐‑–]cause|in[-‐‑–]hospital|post[-‐‑–]discharge|moderate|severe|number of|length of|duration of|incidence of|rates? of|risk of|time to|change in|days (?:on|of)|mortality|hospitali[sz]ation)\b)/i;
 if(depth!==0||parts.length<5||!parts.every(p=>endpoint.test(p)))return sentence('We will assess '+text);
 return sentence('We will assess '+join(parts.slice(0,3),'all_of'))+' '+sentence('Other outcomes of interest are '+parts.slice(3).join(', '));
}
function descriptionContext(question,project){
 const originalText=question.research_question||question.original_text||'';
 const p=plan(originalText);
 const original=project?.questions?.find(q=>q.question_id===question.question_id);
 // Only an explicit review focus may supplement the accepted eligibility rows.
 // Exclusions, uncertain conditions and retired decisions must not become review aims.
 const focus=(question.focus||[]).filter(e=>e.active!==false&&!e.review_pending&&e.information_status==='explicit'&&e.disposition!=='exclude'&&e.normalized_text).map(e=>{
  const analysis=e.decision_status==='confirmed_by_user'?null:classifyAnalysis(e,originalText);
  return analysis?{...e,...analysis}:e;
 });
 const primaryRef=ref=>original?.source_refs?.some(s=>s.source_id===ref.source_id&&s.source_revision===ref.source_revision&&s.quote===originalText);
 const declarations=declaredFocus(originalText).filter(d=>!(question.elements||[]).some(e=>
  e.active!==false&&e.dimension_id===d.dimension&&e.source_refs?.some(primaryRef)&&(e.explicit_revision||e.decision_status==='confirmed_by_user'||e.source_occurrence_pending||e.role_issue||
   (d.dimension==='outcome'&&e.outcome_use&&e.outcome_use!=='interest'))));
 const simplify=value=>norm(value).toLowerCase().replace(/[‐‑–]/g,'-').replace(/[.。]+$/,'').trim();
 function represented(e,d){
  if(!e.source_refs?.length||e.decision_status==='confirmed_by_user'||e.explicit_revision||e.scope_conditions?.length||e.exceptions?.length)return false;
  if(!e.source_refs.every(primaryRef))return false;
  if(e.source_refs.every(r=>r.start>=d.start&&r.end<=d.end+1))return true;
  if(e.dimension_id!==d.dimension)return false;
  const value=simplify(e.normalized_text);
  if(simplify(d.value).includes(value))return true;
  // An introduction may name an endpoint in full, with only the acronym used
  // in the subsequent list of defined outcomes and time points.
  const acronym=e.normalized_text.match(/\(([A-Z][A-Z0-9]{1,9})\)$/)?.[1];
  return d.dimension==='outcome'&&!!acronym&&d.value.split(/[^A-Za-z0-9]+/).includes(acronym)&&
   e.source_refs.every(r=>r.end<=d.start&&simplify(r.quote).includes(value)&&
    /\b(?:assess|evaluate|determine|examine)\b/i.test(Array.from(originalText).slice(0,r.start).join('').split(/[.!?]/).at(-1)+' '+r.quote));
 }
 function values(dimension){
  const elements=focus.filter(e=>e.dimension_id===dimension&&!declarations.some(d=>
   (d.dimension===dimension||d.dimension==='analysis_objective'&&['other','context','analysis_method'].includes(dimension))&&represented(e,d)));
  if(!elements.length)return [];
  const criteria=elements.map(e=>({...e,criterion_id:e.element_id,text:e.normalized_text}));
  const logic=original?.logic&&D.mapExpression(original.logic,new Map(elements.map(e=>[e.element_id,e.element_id])));
  if(!logic)return [...new Set(criteria.map(criterionPhrase))];
  const covered=new Set(leaves(logic));
  return [naturalExpression(logic,criteria),...criteria.filter(c=>!covered.has(c.criterion_id)).map(criterionPhrase)];
 }
 const dimensions=[...new Set(focus.map(e=>e.dimension_id))];
 const aims=[],methods=[],outcomes=values('outcome');
 for(const d of declarations.filter(d=>d.dimension==='outcome'))aims.push(outcomeSentences(d.value,originalText));
 if(outcomes.length)aims.push(sentence('We will assess '+join(outcomes,'all_of')));
 for(const dimension of dimensions){
  if(['population','intervention','comparator','outcome','analysis_method','analysis_data_unit','analysis_objective'].includes(dimension))continue;
  const value=join(values(dimension),'all_of');
  if(!value)continue;
  const lead={context:'The review focuses on ',exposure:'We will examine exposure to ',index_test:'The index test of interest is ',reference_test:'The reference test of interest is '};
  aims.push(sentence((lead[dimension]||'The review will examine ')+(dimension==='exposure'?value.replace(/^exposure to\s+/i,''):value)));
 }
 const analysis='network meta-analysis'+(p.ipd?' of individual participant data':'');
 for(const d of declarations.filter(d=>d.dimension==='analysis_objective')){
  const arms=['intervention','comparator'].map(dim=>(question.include||[]).filter(c=>c.dimension_id===dim).map(c=>simplify(c.text).replace(/^any /,'')));
  let value=d.value.replace(/ (?:differ|vary) (?:according to|by) (?:different )?/i,' vary by ');
  if(arms.every(group=>group.length===1)){
   const prefix=value.match(/^(benefits and harms|effects?) of (.+?) compared (?:with|to) (.+?) vary by /i);
   if(prefix&&simplify(prefix[2])===arms[0][0]&&simplify(prefix[3]).replace(/^any /,'')===arms[1][0])value=prefix[1]+' vary by '+value.slice(prefix[0].length);
  }
  methods.push(sentence('We will examine whether '+value));
 }
 const ranking=p.rank&&norm(p.rank).replace(/^rank (?:the )?effects of (?:these |the )?(?:different )?interventions$/i,'rank the interventions');
 if(p.nma)methods.push(sentence('We will '+(ranking?ranking+' using a '+analysis:'conduct a '+analysis)));
 else if(p.ipd)methods.push('We will analyse individual participant data.');
 for(const dimension of ['analysis_method','analysis_data_unit','analysis_objective']){
  for(const value of values(dimension)){
   // Skip only the plan already expressed above. Retain additional methods,
   // qualifications and objectives, including plans supplied in attachments.
   const text=norm(value);
   if(dimension==='analysis_method'&&p.nma&&/^(?:using\s+)?(?:network meta-analysis(?:\s*\(NMA\))?|NMA)(?:\s+(?:based on|of|using)\s+(?:individual (?:participant|patient) data(?:\s*\(IPD\))?|IPD))?$/i.test(text))continue;
   if(dimension==='analysis_data_unit'&&p.ipd&&/^(?:individual (?:participant|patient) data(?:\s*\(IPD\))?|IPD)$/i.test(text))continue;
   if(dimension==='analysis_objective'&&ranking&&[ranking,norm(p.rank),'rank the effects of the interventions','perform the planned ranking'].some(p=>p.toLowerCase()===text.toLowerCase()))continue;
   if(sourceSentence.test(value)){methods.push(sentence(value));continue;}
   if(dimension==='analysis_objective'){
    const aim=value.replace(/^to\s+/i,'');
    methods.push(sentence((/^(?:compare|rank|estimate|assess|examine|explore|determine|identify|evaluate|investigate|analyse|analyze|perform)\b/i.test(aim)?'We will ':'The analysis will examine ')+aim));
   }else if(/^(?:conduct|perform|use|apply|analyse|analyze)\s+/i.test(value))methods.push(sentence('We will '+value));
   else methods.push(sentence((dimension==='analysis_data_unit'?'We will analyse ':'We will use ')+value.replace(/^using\s+/i,'')));
  }
 }
 const supplemental=[];
 for(const e of question.elements||[]){
  if(e.active===false||e.information_status!=='explicit'||!e.normalized_text||!e.source_refs?.length||
   !['accepted_from_input','accepted_by_authorized_rule','confirmed_by_user'].includes(e.decision_status)||e.boundary_resolution)continue;
  if(e.semantic_role==='review_focus')continue;
  const value=criterionPhrase({...e,text:e.normalized_text});
  if(e.scope_status==='unrestricted'){
   const domain=e.dimension_id==='population.age'?'age':e.dimension_id.replace(/[._]/g,' ');
   if(!e.exceptions?.length&&!e.scope_conditions?.length&&/^(?:any language|all languages|不限语言|语种不限)$/i.test(value))supplemental.push('Reports in any language are eligible.');
   else if(!e.exceptions?.length&&!e.scope_conditions?.length&&/^(?:unrestricted|no restrictions?|不限|无限制|不设限制|remove the older-people restriction|no age restriction)$/i.test(value))supplemental.push(sentence('No '+domain+' restriction applies'));
   else supplemental.push(sentence(value));
  }else if(e.scope_status==='not_applicable'){
   const subject=e.dimension_id.replace(/[._]/g,' ');
   supplemental.push(sentence(/^not applicable[. ]*$/i.test(value)?subject+' does not apply to this review':value));
  }else if(e.semantic_role==='background_information'){
   const complete=/\b(?:is|are|was|were|has|have|had|will|took|occurred)\b/i.test(value);
   supplemental.push(sentence(complete?value:e.dimension_id==='context'?'The review setting is '+value:'The source describes '+value));
  }
 }
 return {display_number:question.display_number,source_population:values('population'),source_interventions:values('intervention'),source_comparisons:values('comparator'),focus_sentence:aims.join(' '),methods_sentence:[...new Set(methods)].join(' '),supplemental_sentences:[...new Set(supplemental)]};
}

// Keep proper names and abbreviations intact when joining source phrases into sentences.
function prosePhrase(text){
 const value=lower(phrase(text));
 return value.replace(/^(?:Children|Adolescents|Women|Men|Participants|Clinical|Usual|Randomised|Randomized|Observational|Prospective|Retrospective|Primary|Secondary|All|Studies|Trials|Reports|At|Follow-up|No)\b/,word=>word.toLowerCase());
}
function populationProse(parts){
 const ages=parts.filter(t=>/^aged\b/i.test(t)),people=parts.filter(t=>!/^aged\b/i.test(t));
 const population=join(people,'all_of').replace(/\bat risk of or with established ([\w-]+)$/i,'with established $1 or at risk of developing it');
 const age=join(ages,'all_of').replace(/^aged ≥(\d+(?:\.\d+)?) years$/,'aged $1 years or older').replace(/^aged ≤(\d+(?:\.\d+)?) years$/,'aged $1 years or younger');
 return [population|| (age?'participants':''),age].filter(Boolean).join(' ');
}
// Rejoin a participant group with its own relative clauses only when the
// eligibility expression requires all of them. Keep each underlying criterion.
function combinePopulationUnits(units){
 const population=units.filter(unit=>!unit.linked&&unit.criteria.length&&unit.criteria.every(c=>c.dimension_id==='population'));
 if(population.length<2||population.some(unit=>unit.node.op!=='predicate'||unit.criteria.some(c=>c.exceptions?.length||c.scope_conditions?.length)))return units;
 const relative=/^(?:who\s+|whose\s+|(?:received|required|underwent|were|had)\s+|(?:with|without)\s+)/i;
 const heads=population.filter(unit=>!relative.test(unit.text));
 const participant=/\b(?:infants|neonates|newborns|children|adolescents|adults|people|men|women|patients|participants)\b/i;
 if(heads.length!==1||!participant.test(heads[0].text))return units;
 // "term or late preterm infants" has a shared noun; "adults or infants"
 // has two possible antecedents for a trailing relative clause.
 if(heads[0].text.split(/\s+(?:or|and)\s+/i).slice(0,-1).some(part=>participant.test(part)))return units;
 const qualifiers=population.filter(unit=>unit!==heads[0]);
 if(qualifiers.some(unit=>/^(?:with|without)\b/i.test(unit.text)&&/\bor\b/i.test(unit.text)))return units;
 const clauses=qualifiers.map(unit=>unit.text.replace(/^(?:Who|Whose|With|Without)\b/,word=>word.toLowerCase()).replace(/^(received|required|underwent|were|had)\b/i,(_,verb)=>'who '+verb.toLowerCase()));
 const combined={...heads[0],text:heads[0].text+' '+join(clauses,'all_of'),criteria:population.flatMap(unit=>unit.criteria)};
 return units.flatMap(unit=>unit===heads[0]?[combined]:population.includes(unit)?[]:[unit]);
}
function headToHeadControls(intervention,comparison){
 if(!/^(?:[\w-]+ ){0,5}interventions$/i.test(intervention))return null;
 const counterpart='another '+intervention.slice(0,-1);
 if(!comparison.toLowerCase().endsWith(counterpart.toLowerCase()))return null;
 const prefix=comparison.slice(0,-counterpart.length);
 if(prefix&&!/\bor\s+$/i.test(prefix))return null;
 const controls=prefix.replace(/,?\s*\bor\s*$/i,'');
 return /[()]/.test(controls)?null:join(controls.split(/,\s*/));
}
function comparisonProse(intervention,comparison){
 const controls=headToHeadControls(intervention,comparison);
 if(controls===null)return intervention+' with '+comparison;
 return intervention+(controls?' with '+controls+', or with one another':' with one another');
}
function sentence(text){
 const value=String(text||'').trim();
 return value?value.charAt(0).toUpperCase()+value.slice(1).replace(/[.。]+$/,'')+'.':'';
}
const sourceSentence=/^(?:(?:eligible |included )?(?:studies|trials|reports|participants|patients)|we)\s+(?:must|will|should|are|were|may|can|have to)\b/i;
function extraRule(dimension,value){
 if(sourceSentence.test(value))return sentence(value);
 switch(dimension){
  case 'Study design':case 'Evidence source':case 'Research type':return sentence('We will include '+value.replace(/^evidence unit:\s*/i,''));
  case 'Context':return sentence('Studies must take place '+(/^(?:in|at|within|outside)\b/i.test(value)?'':'in ')+value);
  case 'Comparison':return sentence('Eligible comparators include '+value);
  case 'Outcomes':return sentence(/^(?:measure|report|assess|record)\b/i.test(value)?'Eligible studies must '+value:'The required outcome is '+value);
  case 'Language':return sentence('Eligible reports must be '+(/^(?:written|published|in)\b/i.test(value)?'':'in ')+value);
  case 'Publication date':return sentence('Eligible reports must be published '+(/^(?:between|from|through|in|after|before|on|since|during|by)\b/i.test(value)?'':'in ')+value);
  case 'Sample':return sentence('Eligible studies must enrol '+value);
  case 'Index test':return sentence('Eligible studies must evaluate '+value+' as the index test');
  case 'Reference test':return sentence('The reference standard must be '+value);
  case 'Evaluation':return sentence('Eligible studies must assess '+value);
  case 'Exposure':case 'Concept':case 'Phenomenon of Interest':case 'Condition':case 'Target condition':return sentence('Eligible studies must examine '+value);
  case 'Duration':case 'Follow-up':return sentence(dimension+' must be '+value);
  case 'Other':case 'Additional limit':return sentence('Eligibility requires '+value);
  default:return sentence('For '+dimension.toLowerCase()+', eligibility requires '+value);
 }
}
function manuscriptContext(source){
 const completed=/(?:^|[.!?]\s+)we included\b/iu.test(source)&&!/\bwe (?:will|plan to) include\b/iu.test(source);
 const primary=source.split(/[.!?](?:\s|$)|[\n;]/u)[0];
 const pair=objectiveArms(primary);
 const goal=pair?.objective&&primary.match(/^(?:to |we (?:aim(?:ed)? to )?)?(?:assess|evaluate|examine|determine) (?:the )?(.+?) of /iu)?.[1];
 let aim;
 if(goal&&pair.intervention&&pair.comparator){
  const variants=pair.intervention.match(/^(.+?) \(([^()]+ alone or (?:combined with|in combination with) [^()]+)\)$/iu);
  const name=comparisonTitleTerms(variants?.[1]||pair.intervention,source);
  aim={goal,intervention:pair.intervention,comparison:pair.comparator,name,control:comparisonTitleTerms(pair.comparator,source),variants:variants?.[2]};
 }
 const intervals=source.match(/(?:^|[.!?]\s+)we (?:categorised|categorized|classified|grouped) follow[-‐‑ ]up (?:as|into) ([^.!?\n]+(?:\.\d+[^.!?\n]*)*)[.]?(?=\s|$)/iu)?.[1];
 const declarations=declaredFocus(source);
 const scopeNotes=declarations.filter(d=>d.dimension==='review_boundary').map(d=>d.value);
 const noParticipantExclusions=/\bwe specified no exclusion criteria for (?:the )?(?:infants?|patients?|participants?|adults?|children)\b/iu.test(source);
 if(noParticipantExclusions)scopeNotes.push('There were no additional participant-level exclusions');
 const delivery=norm(source).match(/\bare achieved in various ways:\s*([^.!?]+)\.\s*We compared these different methods of delivering ([^.!?]+?) to each other\b/iu);
 const deliveryMethods=delivery&&delivery[1].split(/\s*;\s*(?:or\s+)?/iu).map(method=>
  method.replace(/^by the use of /iu,'the use of ').replace(/^different levels of light intensity\b/iu,'different light intensities')
   .replace(/^positioning of the devices /iu,'placing devices '));
 const deliveryNote=deliveryMethods&&deliveryMethods.length>1?
  'We also compared methods of delivering '+delivery[2]+' directly, including '+join(deliveryMethods,'all_of'):'';
 const examples=declarations.filter(d=>d.dimension==='outcome_examples').flatMap(d=>listedOutcomes(d.value));
 const outcomeSubject=declarations.find(d=>d.dimension==='outcome_examples')?.text.match(/\b((?:(?:long|short)[‐‑– -]term )?(?:clinical |patient[‐‑– -]relevant )?outcomes),\s*(?:including|such as)\b/iu)?.[1];
 return {completed,abbreviations:abbreviationDefinitions(source),...(aim&&{aim}),...(intervals&&{intervals}),...(scopeNotes.length&&{scopeNotes}),...(examples.length&&{examples,outcomeSubject}),...(deliveryNote&&{deliveryNote})};
}
function description(rows,context={}){
 if(context.pending_inclusion_relation){
  const settled=description(rows.map(row=>({...row,include:[]})),{...context,pending_inclusion_relation:false});
  const details=(context.pending_extra_conditions||[]).map(text=>sentence('The source specifies '+phrase(text)));
  return [settled,...details,'How the groups of inclusion conditions should be combined remains to be confirmed.'].filter(Boolean).join(' ');
 }
 if(context.question_contexts?.length&&JSON.stringify(context.combined_rows)===JSON.stringify(rows)){
  const paragraphs=context.question_contexts.map((item,index)=>{
   const text=description(item.rows||[],item);
   return text?'For question '+(index+1)+', '+text.charAt(0).toLowerCase()+text.slice(1):'';
  }).filter(Boolean);
  if(context.question_relation==='all_of')paragraphs.push('Studies must satisfy the requirements of all questions.');
  if(context.question_relation==='any_of')paragraphs.push('Studies may meet the requirements of any question.');
  return paragraphs.join(' ');
 }
 const linked=context.linked_conditions||[];
 const linkedFields=new Set(linked.flatMap(group=>group.fields.map(f=>JSON.stringify([f.dimension,f.text]))));
 const groups=new Map(),sourceRules=[];
 for(const row of rows){
  const dimension=row.dimension||row.label;
  const phrases=[];
  for(const rule of row.include||[]){
   if(linkedFields.has(JSON.stringify([dimension,rule])))continue;
   const value=prosePhrase(rule);
   const qualification=dimension==='Intervention'&&value.match(/^(.+?)\s+\(((?:if|when)\b[^()]+?\b(?:eligible only if|eligible only when|must)\b[^()]+?\b(?:control|comparison|comparator)\b[^()]*)\)$/iu);
   if(qualification){
    phrases.push(qualification[1].replace(/^Nurse-led\b/u,'nurse-led'));
    sourceRules.push(sentence(qualification[2]));
   }else if(sourceSentence.test(value))sourceRules.push(sentence(value));
   else if(value)phrases.push(value);
  }
  if(phrases.length)groups.set(dimension,[...new Set([...(groups.get(dimension)||[]),...phrases])]);
 }
 const take=dimension=>{const items=groups.get(dimension)||[];groups.delete(dimension);return items;};
 const sentences=[],population=populationProse(take('Population')),intervention=join(take('Intervention'),'all_of');
 // Keep a comparator when the source supplies one without an accepted intervention.
 const comparison=intervention?join(take('Comparison'),'all_of'):'';
 const designs=groups.get('Study design')||[];
 const manuscript=context.manuscript,completed=manuscript?.completed;
 const include=completed?'We included ':'We will include ';
 const studies=designs.length===1&&/\b(?:studies|trials|reviews|reports|RCTs)(?:\s*\([^()]+\))?$/i.test(designs[0])?take('Study design')[0]:'studies';
 const people=population?' in '+population:'';
 const aim=manuscript?.aim;
 const recorded=context.shared_treatment_duration;
 let sharedDuration=recorded&&armKey(intervention)===armKey(recorded.intervention)&&armKey(comparison)===armKey(recorded.comparison)?recorded.suffix:'';
 if(aim&&armKey(intervention)===armKey(aim.intervention)&&armKey(comparatorDisplayText(comparison))===armKey(comparatorDisplayText(aim.comparison))&&designs.length===1){
  sentences.push(sentence((completed?'We assessed the ':'We will assess the ')+aim.goal+' of '+aim.name+' compared with '+aim.control+people));
  groups.delete('Study design');
  const design=designs[0].replace(/ with follow[-‐‑ ]up of ([\w -]+? (?:days?|weeks?|months?|years?)) or longer$/iu,' with at least $1 of follow-up');
  sentences.push(sentence(include+design));
  if(aim.variants)sentences.push(sentence((completed?'The intervention comprised ':'The intervention comprises ')+aim.variants.replace(/ alone or combined with /iu,' alone or in combination with ')));
 }else if(intervention){
  const duration=intervention.match(treatmentDuration)?.[0];
  const shared=duration&&comparison.toLowerCase().endsWith(duration.toLowerCase())?duration:'';
  const assessment=comparison?'comparing '+comparisonProse(shared?intervention.slice(0,-shared.length):intervention,shared?comparison.slice(0,-shared.length):comparison):'evaluating '+intervention;
  const controls=headToHeadControls(intervention,comparison);
  if(population.split(/\s+/).length>=8&&controls){
   sentences.push(sentence(include+studies+' of '+intervention+people));
   sentences.push(sentence((completed?'Eligible studies compared ':'Eligible studies will compare ')+'the interventions with '+controls+', or with one another'));
  }else sentences.push(sentence(include+studies+' '+assessment+people));
  sharedDuration=shared||sharedDuration;
 }else if(population||studies!=='studies')sentences.push(sentence(include+studies+(population?' of '+population:'')));
 if(sharedDuration)sentences.push(sentence((completed?'Participants received':'Participants must receive')+' their assigned treatment '+sharedDuration.trim()));
 if(manuscript?.deliveryNote)sentences.push(sentence(manuscript.deliveryNote));
 const focusPeople=populationProse(context.source_population||[]),focusIntervention=join(context.source_interventions||[],'all_of'),focusComparison=join(context.source_comparisons||[],'all_of');
 if(focusIntervention||focusComparison){
  const subject=focusIntervention||intervention,control=focusComparison||comparison;
  const aim=subject?(control?'compare '+comparisonProse(subject,control):'assess '+subject):'examine comparisons with '+control;
  sentences.push(sentence('We will '+aim+(focusPeople?' in '+focusPeople:'')));
 }else if(focusPeople)sentences.push(sentence('The review focuses on '+focusPeople));
 sentences.push(...sourceRules);
 for(const group of linked)sentences.push(sentence('Eligible studies must meet the following condition: '+group.expression));
 for(const [dimension,items] of groups)for(const item of items)sentences.push(completed&&dimension==='Study design'?sentence(include+item):extraRule(dimension,item));
 const exclusions=context.exclusions||rows.flatMap(r=>r.exclude||[]);
 const excluded=[...new Set(exclusions.map(e=>lower(String(typeof e==='string'?e:e.rule||'').trim().replace(/^(?:exclude|excluding)\s+/i,'').replace(/[.。]+$/,''))).map(s=>s.replace(/^(?:Studies|Reports|Trials)\b/,w=>w.toLowerCase())).filter(Boolean))];
 if(excluded.length)sentences.push(sentence((completed?'We excluded ':'We will exclude ')+join(excluded)));
 for(const limit of context.limits||[]){
  const [,label,value]=String(limit).match(/^(Language|Publication date|Additional limit):\s*(.+)$/i)||[];
  if(value){
   const dateRange=label==='Publication date'&&value.match(/^(\d[\d-]*) to (\d[\d-]*)$/);
   sentences.push(extraRule(label,dateRange?'from '+dateRange[1]+' to '+dateRange[2]:prosePhrase(value)));
  }else sentences.push(extraRule('Other',prosePhrase(limit)));
 }
 if(context.question_contexts?.length){
  for(const [index,question] of context.question_contexts.entries()){
   const aims=description([],question);
   if(aims)sentences.push('For question '+(index+1)+', '+aims.charAt(0).toLowerCase()+aims.slice(1));
  }
  return [...new Set(sentences)].join(' ');
 }
 let focus=context.focus_sentence||'',methods=context.methods_sentence||'';
 if((focus+' '+methods).split(/\s+/).length<=35&&/^We will [^.!?]+\.$/.test(focus)&&/^We will [^.!?]+\.$/.test(methods)){
  focus=focus.slice(0,-1)+' and '+methods.slice('We will '.length);methods='';
 }
 const outcomeGroups=context.outcome_groups||[];
 const endpointKey=value=>armKey(value).replace(/^(?:deaths?|mortality)$/u,'mortality');
 const allOutcomes=outcomeGroups.flatMap(group=>group.items.map(endpointKey));
 const examples=new Set((manuscript?.examples||[]).filter(item=>!allOutcomes.includes(endpointKey(item))));
 for(const group of outcomeGroups){
  const items=group.items.map(item=>{
   const term=prosePhrase(item).replace(/^(mortality|hospitalisation) \(all[-‐‑ ]cause and cardiovascular\)$/iu,'all-cause and cardiovascular $1')
    .replace(/^incidence of /iu,'the incidence of ');
   if(/^cardiovascular (?:events|outcomes)$/iu.test(term)&&allOutcomes.filter(name=>name===endpointKey(term)).length===1){
    const coronary=[...examples].filter(example=>/^coronary events?$/iu.test(example));
    if(coronary.length){for(const example of coronary)examples.delete(example);return term+' (including '+join(coronary,'all_of')+')';}
   }
   return term;
  });
  if(!items.length)continue;
  const label=group.label||'Review';
  if(!group.label&&manuscript?.outcomeSubject){
   sentences.push(sentence('The '+manuscript.outcomeSubject+' of interest '+(completed?'were ':'are ')+join(items,'all_of')));
  }else sentences.push(sentence((items.length===1?'The '+label.toLowerCase():label)+(items.length===1?' outcome':' outcomes')+(completed?(items.length===1?' was ':' were '):(items.length===1?' is ':' are '))+join(items,'all_of')));
 }
 if(outcomeGroups.length&&examples.size)sentences.push(sentence('Examples '+(completed?'included ':'include ')+join([...examples],'all_of')));
 for(const note of manuscript?.scopeNotes||[])sentences.push(sentence(note));
 if(manuscript?.intervals)sentences.push(sentence('We classified follow-up as '+manuscript.intervals));
 let result=[...new Set([...sentences,...(context.supplemental_sentences||[]),focus,methods].filter(Boolean))].join(' ');
 if(manuscript){
  for(const [short,long] of outcomeAbbreviations(result))if(long&&result.match(new RegExp('\\b'+short+'\\b','g'))?.length===1)result=result.replace(' ('+short+')','');
  if((result.match(/\bRCTs\b/gu)||[]).length===1)result=result.replace(/(randomi[sz]ed controlled trials) \(RCTs\)/iu,'$1');
  result=abbreviationFormatter(manuscript.abbreviations)(result).replace(/[‐‑]/gu,'-').replace(/([<>])\s+(?=\d)/gu,'$1');
 }
 return result;
}

return {ageClause,plan,classifyAnalysis,restoreAge,treatmentObjective,objectiveArms,studyDesignWording,sharedTreatmentDuration,standaloneObjectiveArms,normalizeComparisonArms,normalizeComparators,isInterventionStudyExclusion,normalizeExcludedIntervention,interventionReference,phrase,join,comparatorDisplayText,criterionPhrase,naturalExpression,splitDimensions,frameworkUnits,combinePopulationUnits,clause,topic,projectTopic,declaredFocus,outcomeGroups,abbreviationDefinitions,abbreviationFormatter,descriptionContext,manuscriptContext,description};
});
