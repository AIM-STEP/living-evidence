/* Source-grounded analysis roles and English criteria prose. No study-design defaults. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./domain.js'):root.AIMSTEPEligibilityDomain);if(typeof module==='object'&&module.exports)module.exports=api;else root.AIMSTEPEligibilityMethodology=api;})(typeof window==='object'?window:globalThis,function(D){
'use strict';
const norm=x=>String(x||'').normalize('NFKC');
const older=/\b(?:older (?:people|patients|adults|participants)|elderly)\b|老年/i;
function phrase(text){return String(text||'').trim().replace(/[.。]+$/,'').replace(/^(?:include\s+)?studies\s+(?:involving|evaluating|of|in)\s+/i,'').replace(/^various\s+/i,'');}
function lower(text){return String(text||'').replace(/^(?:Hospitali[sz]ed|Older|Adults?|Patients?|People|Exercise|Nutritional|Standard|Placebo|Another|Various)\b/,s=>s.toLowerCase());}
function dataGate(text){const t=norm(text),data='(?:IPD|individual\\s+(?:participant|patient)\\s+data(?:\\s*\\(IPD\\))?)';return new RegExp('(?:only\\s+(?:include\\s+)?(?:studies|trials|reports)|include\\s+only\\s+(?:studies|trials|reports)|eligibility\\s+(?:requires|depends))[\\s\\S]{0,100}(?:with|providing|for which|available|availability|access)[\\s\\S]{0,80}'+data,'i').test(t)||new RegExp('(?:only\\s+include\\s+(?:studies|trials|reports)|studies\\s+must|trials\\s+must)[\\s\\S]{0,100}'+data+'[\\s\\S]{0,40}(?:available|provided|obtained)','i').test(t)||new RegExp(data+'\\s+(?:must\\s+be\\s+available|availability\\s+is\\s+required)','i').test(t)||new RegExp('exclude\\s+(?:studies|trials)\\s+without\\s+'+data,'i').test(t);}

function plan(original){const text=norm(original),nma=original.match(/network\s+meta[-– ]analysis(?:\s*\(NMA\))?|\bNMA\b/i),ipd=original.match(/individual\s+(?:participant|patient)\s+data(?:\s*\(IPD\))?|\bIPD\b/i);const analysis=/\b(?:using|conduct|perform|based\s+on|analyse|analyze)\b[\s\S]{0,160}(?:network\s+meta[- ]analysis|\bNMA\b|individual\s+(?:participant|patient)\s+data|\bIPD\b)|(?:network\s+meta[- ]analysis|\bNMA\b)[\s\S]{0,100}\bbased\s+on\b/i.test(text);return {nma:analysis&&nma?nma[0]:null,ipd:analysis&&ipd?ipd[0]:null,rank:analysis&&/\brank(?:ing)?\b/i.test(text)?original.match(/\brank(?:ing)?\b[^.!?;]*?(?=\s+using\b|\s+by\b|[.!?;]|$)/i)?.[0]:null};}
function classifyAnalysis(element,context){const text=norm(element.normalized_text),dimension=element.dimension_id||'',pureIPD=/^(?:studies (?:based on|using|with)\s+|based on\s+|using\s+)?(?:individual\s+(?:participant|patient)(?:[- ]level)?\s+data|IPD)(?:\s*\(IPD\))?\.?$/i.test(text),pureNMA=/^(?:using\s+)?(?:network\s+meta[- ]analysis|NMA)(?:\s*\(NMA\))?\.?$/i.test(text);if(dataGate(context)&&/IPD|individual\s+(?:participant|patient)\s+data/i.test(text))return null;if((pureIPD&&plan(context).ipd)||dimension==='analysis_data_unit')return {dimension_id:'analysis_data_unit',normalized_text:pureIPD?'individual participant data (IPD)':element.normalized_text};if(((pureNMA||/^network\s+meta[-– ]analysis[\s\S]*\bbased\s+on\b[\s\S]*(?:individual\s+(?:participant|patient)\s+data|IPD)/i.test(text))&&plan(context).nma)||dimension==='analysis_method')return {dimension_id:'analysis_method',normalized_text:pureNMA?'network meta-analysis (NMA)':element.normalized_text};if(dimension==='analysis_objective')return {dimension_id:dimension,normalized_text:element.normalized_text};return null;}
function restoreAge(element){if(element.dimension_id.split('.')[0]!=='population'||element.dimension_id==='population.age'||!older.test(element.raw_text)||older.test(element.normalized_text)||element.explicit_revision)return;const word=/\belderly\b/i.test(element.raw_text)?'elderly':'older';if(/\b(?:people|patients|adults|participants)\b/i.test(element.normalized_text)){const previous=element.normalized_text;element.normalized_text=element.normalized_text.replace(/\b(people|patients|adults|participants)\b/i,word+' $1');element.metadata_corrections=[...(element.metadata_corrections||[]),{field:'normalized_text',from:previous,to:element.normalized_text,basis:'Restore the age qualification explicitly present in the source; no numeric threshold inferred.'}];}}
function interventionReference(elements){const candidates=elements.filter(e=>e.active!==false&&e.dimension_id==='intervention'&&e.information_status!=='missing'&&e.normalized_text),i=candidates.find(e=>e.scope_status==='restricted')||candidates[0];if(!i)return null;const value=lower(phrase(i.normalized_text));return /interventions?$/i.test(value)?value.replace(/interventions$/i,'intervention'):'eligible intervention';}
function normalizeComparators(elements){const target=interventionReference(elements);for(const e of elements.filter(e=>e.active!==false)){
 const clean=value=>norm(phrase(value)).trim().replace(/[.,;:]+$/,'').replace(/^(?:compared\s+(?:with|to)|versus|vs\.?)\s+(?:either\s+)?/i,''),raw=clean(e.raw_text),text=clean(e.normalized_text);
 const dimension=String(e.dimension_id).toLowerCase(),aliases=['comparison','comparisons','comparison_group','comparison.group','control','control_group','control.group','comparators'];
 const comparisonOnly=value=>/^(?:(?:(?:an?|the|either a) )?control (?:group|arm)\b[\s\S]*|(?:standard care|usual care|treatment as usual|placebo|sham|no treatment|wait[- ]?list)(?:\s*[,;]?\s+(?:and|or)\s+(?:(?:an?|another|other)\s+)?[\w\s()-]+)*|each other|one another)$/i.test(value);
 const sourceComparison=/\b(?:compar(?:ed|ing)\s+(?:with|to)|versus|vs\.?|control (?:group|arm)|placebo|each other|one another)\b/i.test(raw);
 if(!e.explicit_revision&&(aliases.includes(dimension)||(['other','intervention','comparator'].includes(dimension)&&(comparisonOnly(raw)||sourceComparison&&comparisonOnly(text))))){if(e.dimension_id!=='comparator')e.metadata_corrections=[...(e.metadata_corrections||[]),{field:'dimension_id',from:e.dimension_id,to:'comparator',basis:'Source-defined control/comparison alternative'}];e.dimension_id='comparator';}
 if(e.dimension_id==='comparator'&&target&&!e.explicit_revision){e.normalized_text=e.normalized_text.replace(/\b(?:a )?control group\s*\(([^()]*)\)/gi,'$1');if(/^(?:each other|one another)$/i.test(raw)||/^(?:each other|one another)$/i.test(text))e.normalized_text='another '+target;else e.normalized_text=e.normalized_text.replace(/\beach other\b|\bone another\b/gi,'another '+target);}
}}

function join(items,op='any_of'){const list=items.filter(Boolean);if(list.length<2)return list[0]||'';const word=op==='any_of'?'or':'and';return list.length===2?list.join(' '+word+' '):list.slice(0,-1).join(', ')+', '+word+' '+list.at(-1);}
function qualifierText(value){if(typeof value==='string')return value;for(const key of ['text','description','condition','quote'])if(typeof value?.[key]==='string')return value[key];D.fail('UNRENDERABLE_QUALIFIER','output','A scope qualifier needs readable source-preserving text before criteria can be displayed.');}
function criterionPhrase(c){let value=lower(phrase(c.text));if(c.dimension_id==='comparator')value=value.replace(/^control\s+group\s*\(([^()]*)\)$/i,'$1');if(c.scope_conditions?.length&&!/\b(?:if|when|among|for)\b/i.test(value))value='For '+c.scope_conditions.map(x=>qualifierText(x)).join(' and ')+': '+value;if(c.exceptions?.length&&!/\bexcept\b|\bunless\b/i.test(value))value+=', except '+c.exceptions.map(x=>qualifierText(x)).join('; ');return value;}
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
function ageClause(criteria){if(criteria.length!==1||criteria[0].dimension_id!=='population.age')return null;const value=criteria[0].structured_value;if(!value)return null;const unit=['year','years'].includes(value.unit)?'years':value.unit;if(value.operator==='between')return 'aged '+(value.lower_inclusive===false?'>':'≥')+value.lower+' and '+(value.upper_inclusive===false?'<':'≤')+value.upper+' '+unit;const symbols={gt:'>',gte:'≥',lt:'<',lte:'≤',eq:'='};return symbols[value.operator]?'aged '+symbols[value.operator]+value.value+' '+unit:null;}
function clause(dimension,value,reference){return lower(phrase(value).replace(/^Studies comparing .*? with /i,''));}
function topic(question,elements){
 const values=dimension=>elements.filter(e=>e.active!==false&&e.dimension_id===dimension&&e.semantic_role!=='background_information'&&e.information_status!=='missing').map(e=>lower(phrase(e.normalized_text)));
 let population=values('population')[0],intervention=values('intervention')[0];if(!population||!intervention)return null;
 // A title summarises the question; operative population qualifications stay in the criteria.
 if(/hospitali[sz]ed older (?:people|patients|adults)/i.test(population)&&/at risk of or with established malnutrition/i.test(population))population=population.replace(/hospitali[sz]ed older (?:people|patients|adults)/i,'hospitalised patients').replace(/at risk of or with established malnutrition/i,'with or at risk of malnutrition');
 if(/\beffects?\b|\beffectiveness\b/i.test(norm(question.original_text)))return 'Effects of '+intervention+' in '+population;
 return intervention.replace(/^./,c=>c.toUpperCase())+' in '+population;
}
// Clear, direct, active prose; keep source qualifications and protocol tense.
// Writing reference: https://www.bmj.com/about-bmj/resources-authors/house-style
function descriptionContext(question,project){
 const originalText=question.research_question||question.original_text||'';
 const p=plan(originalText);
 const original=project?.questions?.find(q=>q.question_id===question.question_id);
 // Only an explicit review focus may supplement the accepted eligibility rows.
 // Exclusions, uncertain conditions and retired decisions must not become review aims.
 const focus=(question.focus||[]).filter(e=>e.active!==false&&e.information_status==='explicit'&&e.disposition!=='exclude'&&e.normalized_text).map(e=>{
  const analysis=e.decision_status==='confirmed_by_user'?null:classifyAnalysis(e,originalText);
  return analysis?{...e,...analysis}:e;
 });
 function values(dimension){
  const elements=focus.filter(e=>e.dimension_id===dimension);
  if(!elements.length)return [];
  const criteria=elements.map(e=>({...e,criterion_id:e.element_id,text:e.normalized_text}));
  const logic=original?.logic&&D.mapExpression(original.logic,new Map(elements.map(e=>[e.element_id,e.element_id])));
  if(!logic)return [...new Set(criteria.map(criterionPhrase))];
  const covered=new Set(leaves(logic));
  return [naturalExpression(logic,criteria),...criteria.filter(c=>!covered.has(c.criterion_id)).map(criterionPhrase)];
 }
 const dimensions=[...new Set(focus.map(e=>e.dimension_id))];
 const aims=[],methods=[],outcomes=values('outcome');
 if(outcomes.length)aims.push(sentence('We will assess '+join(outcomes,'all_of')));
 for(const dimension of dimensions){
  if(['population','intervention','comparator','outcome','analysis_method','analysis_data_unit','analysis_objective'].includes(dimension))continue;
  const value=join(values(dimension),'all_of');
  if(!value)continue;
  const lead={context:'The review focuses on ',exposure:'We will examine exposure to ',index_test:'The index test of interest is ',reference_test:'The reference test of interest is '};
  aims.push(sentence((lead[dimension]||'The review will examine ')+(dimension==='exposure'?value.replace(/^exposure to\s+/i,''):value)));
 }
 const analysis='network meta-analysis'+(p.ipd?' of individual participant data':'');
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
 return {display_number:question.display_number,source_population:values('population'),source_interventions:values('intervention'),source_comparisons:values('comparator'),focus_sentence:aims.join(' '),methods_sentence:[...new Set(methods)].join(' ')};
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
  case 'Outcomes':return sentence('Eligibility requires '+value);
  case 'Language':return sentence('Eligible reports must be '+(/^(?:written|published|in)\b/i.test(value)?'':'in ')+value);
  case 'Publication date':return sentence('Eligible reports must be published '+(/^(?:between|from|through|in|after|before|on|since|during|by)\b/i.test(value)?'':'in ')+value);
  case 'Exposure':case 'Concept':case 'Phenomenon of Interest':case 'Condition':case 'Target condition':return sentence('Eligible studies must examine '+value);
  case 'Duration':case 'Follow-up':return sentence(dimension+' must be '+value);
  case 'Other':case 'Additional limit':return sentence('Eligibility requires '+value);
  default:return sentence('For '+dimension.toLowerCase()+', eligibility requires '+value);
 }
}
function description(rows,context={}){
 if(context.question_contexts?.length&&JSON.stringify(context.combined_rows)===JSON.stringify(rows)){
  const paragraphs=context.question_contexts.map((item,index)=>{
   const text=description(item.rows||[],item);
   return text?'For question '+(index+1)+', '+text.charAt(0).toLowerCase()+text.slice(1):'';
  }).filter(Boolean);
  if(context.question_relation==='all_of')paragraphs.push('Studies must satisfy the requirements of all questions.');
  if(context.question_relation==='any_of')paragraphs.push('Studies may meet the requirements of any question.');
  return paragraphs.join(' ');
 }
 const groups=new Map(),sourceRules=[];
 for(const row of rows){
  const dimension=row.dimension||row.label;
  const phrases=[];
  for(const rule of row.include||[]){
   const value=prosePhrase(rule);
   if(sourceSentence.test(value))sourceRules.push(sentence(value));
   else if(value)phrases.push(value);
  }
  if(phrases.length)groups.set(dimension,[...new Set([...(groups.get(dimension)||[]),...phrases])]);
 }
 const take=dimension=>{const items=groups.get(dimension)||[];groups.delete(dimension);return items;};
 const sentences=[],population=populationProse(take('Population')),intervention=join(take('Intervention'),'all_of');
 // Keep a comparator when the source supplies one without an accepted intervention.
 const comparison=intervention?join(take('Comparison'),'all_of'):'';
 const designs=groups.get('Study design')||[];
 const studies=designs.length===1&&/\b(?:studies|trials|reviews|reports)$/i.test(designs[0])?take('Study design')[0]:'studies';
 const people=population?' in '+population:'';
 if(intervention){
  const assessment=comparison?'comparing '+comparisonProse(intervention,comparison):'evaluating '+intervention;
  const controls=headToHeadControls(intervention,comparison);
  if(population.split(/\s+/).length>=8&&controls){
   sentences.push(sentence('We will include '+studies+' of '+intervention+people));
   sentences.push(sentence('Eligible studies will compare the interventions with '+controls+', or with one another'));
  }else sentences.push(sentence('We will include '+studies+' '+assessment+people));
 }else if(population||studies!=='studies')sentences.push(sentence('We will include '+studies+(population?' of '+population:'')));
 const focusPeople=populationProse(context.source_population||[]),focusIntervention=join(context.source_interventions||[],'all_of'),focusComparison=join(context.source_comparisons||[],'all_of');
 if(focusIntervention||focusComparison){
  const subject=focusIntervention||intervention,control=focusComparison||comparison;
  const aim=subject?(control?'compare '+comparisonProse(subject,control):'assess '+subject):'examine comparisons with '+control;
  sentences.push(sentence('We will '+aim+(focusPeople?' in '+focusPeople:'')));
 }else if(focusPeople)sentences.push(sentence('The review focuses on '+focusPeople));
 sentences.push(...sourceRules);
 for(const [dimension,items] of groups)for(const item of items)sentences.push(extraRule(dimension,item));
 const exclusions=context.exclusions||rows.flatMap(r=>r.exclude||[]);
 const excluded=[...new Set(exclusions.map(e=>lower(String(typeof e==='string'?e:e.rule||'').trim().replace(/^(?:exclude|excluding)\s+/i,'').replace(/[.。]+$/,''))).map(s=>s.replace(/^(?:Studies|Reports|Trials)\b/,w=>w.toLowerCase())).filter(Boolean))];
 if(excluded.length)sentences.push(sentence('We will exclude '+join(excluded)));
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
 if(/^We will [^.!?]+\.$/.test(focus)&&/^We will [^.!?]+\.$/.test(methods)){
  focus=focus.slice(0,-1)+' and '+methods.slice('We will '.length);methods='';
 }
 return [...new Set([...sentences,focus,methods].filter(Boolean))].join(' ');
}

return {ageClause,plan,classifyAnalysis,restoreAge,normalizeComparators,interventionReference,phrase,join,criterionPhrase,naturalExpression,splitDimensions,clause,topic,descriptionContext,description};
});
