/* Pure domain checks shared by browser, program-rule tests and real-model evaluation. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('../criteria-grounding.js'):root.AIMSTEPCriteriaGrounding);if(typeof module==='object'&&module.exports)module.exports=api;else root.AIMSTEPEligibilityDomain=api;})(typeof window==='object'?window:globalThis,function(grounding){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x)),array=x=>Array.isArray(x)?x:x==null?[]:[x];
const ENUMS={semantic_role:['eligibility_condition','review_focus','background_information','undecided'],information_status:['explicit','ambiguous','missing','conflicting'],decision_status:['accepted_from_input','confirmed_by_user','accepted_by_authorized_rule','pending','proposed'],scope_status:['restricted','unrestricted','unspecified','not_applicable'],disposition:['include','exclude'],reason_code:['AMBIGUOUS_MEANING','AMBIGUOUS_BOUNDARY','MISSING_REQUIRED_DECISION','CONFLICTING_REQUIREMENTS','UNCLEAR_LOGIC','UNRESOLVED_ROLE','PROPOSED_RESTRICTION','FRAMEWORK_AMBIGUITY']};
class EligibilityError extends Error{constructor(code,step,message,details={}){super(message);this.name='EligibilityError';this.code=code;this.step=step;this.details=details;}}
function fail(code,step,message,details){throw new EligibilityError(code,step,message,details);}
function id(prefix){return prefix+'_'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));}
function stableId(prefix,value){const raw=String(value);return prefix+'_'+[2166136261,3335557771,2654435761,2246822519].map(seed=>{let h=seed;for(let i=0;i<raw.length;i++)h=Math.imul(h^raw.charCodeAt(i),16777619);return (h>>>0).toString(16).padStart(8,'0');}).join('');}
const now=()=>new Date().toISOString(),key=text=>String(text||'').normalize('NFKC').toLowerCase().replace(/[\s。，,.;:!?！？]+/gu,' ').trim();
function enumValue(field,value){if(!ENUMS[field]?.includes(value))fail('INVALID_ENUM','schema',field+': '+String(value));return value;}
function object(value,step='schema'){if(!value||typeof value!=='object'||Array.isArray(value))fail('INVALID_STRUCTURE',step,'Expected an object.');return value;}
function text(value,field,max=20000){if(typeof value!=='string'||value.length>max)fail('INVALID_STRUCTURE','schema','Invalid '+field);return value;}
function sourceAt(state,ref){return state.sources.find(s=>s.source_id===ref.source_id&&s.revision===ref.source_revision);}
function locate(source,quote){const at=source.indexOf(quote);return at<0?null:{start:Array.from(source.slice(0,at)).length,end:Array.from(source.slice(0,at+quote.length)).length};}
function quoteText(refs,separator=' '){return [...new Set(refs.map(ref=>ref.quote))].join(separator);}
function occurrenceClause(passage){
 const {quote,start,source_id,source_revision,match_start,match_end}=passage;
 const points=Array.from(quote);
 const matchFrom=points.slice(0,match_start-start).join('').length;
 const matchTo=matchFrom+points.slice(match_start-start,match_end-start).join('').length;
 // Split only at an explicit new include/exclude instruction. A semicolon
 // introducing a time limit, condition or exception stays with the selected rule.
 const boundary=/(?:[,，]?\s*\b(?:whereas|but)\s+|[;；]\s*|[,，]?\s*(?:但是|但|而)\s*)(?=(?:we\s+)?(?:(?:will|must|should|do)\s+)?(?:not\s+)?(?:include|exclude)\b|(?:不予|不得|不)?(?:纳入|排除))/giu;
 let from=0,to=quote.length;
 for(const separator of quote.matchAll(boundary)){
  const next=separator.index+separator[0].length;
  if(next<=matchFrom)from=next;
  else if(separator.index>=matchTo){to=separator.index;break;}
 }
 const exact=quote.slice(from,to),offset=start+Array.from(quote.slice(0,from)).length;
 return {source_id,source_revision,quote:exact,start:offset,end:offset+Array.from(exact).length};
}
function validate_provenance(state,refs,questionId,{allowEmpty=false}={}){
 if(!Array.isArray(refs)||!refs.length&&!allowEmpty)fail('MISSING_SOURCE','provenance','A supported requirement needs a source.');
 const characters=new Map();
 return refs.map(ref=>{
  object(ref,'provenance');const source=sourceAt(state,ref);if(!source)fail('SOURCE_REVISION_NOT_FOUND','provenance','Source or revision does not exist.',{source_id:ref.source_id,revision:ref.source_revision});
  if(source.question_ids?.length&&!source.question_ids.includes(questionId))fail('CROSS_QUESTION_REFERENCE','provenance','This source belongs to a different research question.');
  const quote=text(ref.quote,'quote');if(!quote)fail('EMPTY_QUOTE','provenance','An empty quote is not evidence.');
  let {start,end}=ref;
  if(start==null&&end==null){
   const found=locate(source.original_text,quote);
   start=found?.start;
   end=found?.end;
  }else if(start==null||end==null){
   const length=Array.from(quote).length;
   if(start==null)start=end-length;else end=start+length;
  }
  // Multiple exact occurrences in a document share this index within one validation.
  if(!characters.has(source))characters.set(source,Array.from(source.original_text));
  const points=characters.get(source);
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>points.length||end<=start||points.slice(start,end).join('')!==quote){
   if(!source.original_text.includes(quote))fail('QUOTE_NOT_FOUND','provenance','The quotation is absent from the specified source revision.',{source_id:source.source_id,quote});
   fail('QUOTE_OFFSET_MISMATCH','provenance','Quote offsets must use Unicode code points in the referenced revision.');
  }
  return {source_id:source.source_id,source_revision:source.revision,quote,start,end};
 });
}
const numericOperators={gt:'>',gte:'>=',lt:'<',lte:'<=',eq:'=',between:'between'};
const units={year:['month',12],years:['month',12],岁:['month',12],年:['month',12],month:['month',1],months:['month',1],月:['month',1],个月:['month',1],week:['day',7],weeks:['day',7],周:['day',7],day:['day',1],days:['day',1],天:['day',1],hour:['minute',60],hours:['minute',60],小时:['minute',60],minute:['minute',1],minutes:['minute',1],分钟:['minute',1],g:['mg',1000],mg:['mg',1]};
function canonical(c){const [unit,factor]=units[c.unit]||[c.unit,1];return {...c,unit,value:Number(c.value)*factor};}
function sameConstraint(a,b){const x=canonical(a),y=canonical(b);return x.value===y.value&&x.operator===y.operator&&(!x.unit||!y.unit||x.unit===y.unit)&&(!x.anchor||!y.anchor||x.anchor===y.anchor)&&(!x.role||!y.role||x.role===y.role);}
function structuredConstraints(value,dimension){if(!value||typeof value!=='object')return [];if(value.operator==='between')return [{value:value.lower,operator:value.lower_inclusive===false?'>':'>=',unit:value.unit||'',role:dimension.includes('age')?'age':''},{value:value.upper,operator:value.upper_inclusive===false?'<':'<=',unit:value.unit||'',role:dimension.includes('age')?'age':''}];if(typeof value.value==='number')return [{value:value.value,operator:numericOperators[value.operator]||value.operator||'=',unit:value.unit||'',anchor:value.anchor||'',role:dimension.includes('age')?'age':''}];return [];}
function check_semantics(element,refs,{human=false}={}){
 const original=quoteText(refs),normalized=element.normalized_text||'';
 const known=grounding.constraints(original),textConstraints=grounding.constraints(normalized),valueConstraints=structuredConstraints(element.structured_value,element.dimension_id),actual=[...textConstraints,...valueConstraints];
 if(textConstraints.length&&valueConstraints.length&&textConstraints.some(c=>!valueConstraints.some(value=>sameConstraint(c,value))))fail('TEXT_VALUE_MISMATCH','normalization','The displayed numeric condition disagrees with its structured value.');
 for(const c of actual)if(!known.some(k=>sameConstraint(c,k)))fail('NUMERIC_SCOPE_CHANGE','normalization','A threshold, strict bound, unit or time anchor changed without a matching source.',{dimension_id:element.dimension_id,constraint:c});
 const originalNums=[...original.matchAll(/\d+(?:\.\d+)?/g)].map(m=>Number(m[0]));
 for(const match of normalized.matchAll(/\d+(?:\.\d+)?/g))if(!originalNums.includes(Number(match[0]))&&!actual.some(c=>Number(c.value)===Number(match[0])&&known.some(k=>sameConstraint(c,k))))fail('UNSUPPORTED_NUMBER','normalization','A number is absent from the source.');
 const requiresLead=/护士主导|nurse[- ]led|led by nurses/i.test(original),hasLead=/主导|nurse[- ]led|led by nurses/i.test(normalized);
 if(requiresLead&&!hasLead&&!(human&&element.explicit_revision))fail('IMPLEMENTER_ROLE_CHANGED','normalization','Nurse-led cannot be weakened to nurse participation.');
 const hasException=/除非|除外|例外|但不包括|\bexcept\b|\bunless\b/i.test(original);
 if(hasException&&!(human&&element.explicit_revision)&&!/除非|除外|例外|但不包括|\bexcept\b|\bunless\b/i.test(normalized)&&!element.exceptions?.length)fail('EXCEPTION_DROPPED','normalization','A conditional exception was lost.');
 if(element.semantic_review?.status==='contradicted'&&!human)fail('SEMANTIC_MISMATCH','semantic_review','The semantic review rejected the normalized meaning.',{element_id:element.element_id,reason:element.semantic_review.reason});
 return true;
}
function hasOr(text){return /或者|或是|或(?=[\u3400-\u9fff])|\bor\b/i.test(String(text).replace(/\bor (?:older|younger|more|less|above|below|greater)\b/gi,''));}
function hasAnd(text){return /联合|同时|并且|以及|\band\b|combined with|in combination/i.test(text);}
function treeHas(node,op){return !!node&&(node.op===op||(node.children||[]).some(n=>treeHas(n,op)));}
function validate_expression(node,allowed,field='element_id'){
 object(node,'logic');if(!['predicate','all_of','any_of','not'].includes(node.op))fail('INVALID_LOGIC_NODE','logic','Unknown logic operator.');
 if(node.op==='predicate'){if(typeof node[field]!=='string'||!allowed.has(node[field]))fail('INVALID_LOGIC_REFERENCE','logic','A logic leaf references a missing or different-question item.',{reference:node[field]});return;}
 if(!Array.isArray(node.children)||!node.children.length||node.op==='not'&&node.children.length!==1)fail('INCOMPLETE_LOGIC','logic','A logical operator has missing children.');node.children.forEach(n=>validate_expression(n,allowed,field));
}
function mapExpression(node,map,field='criterion_id'){if(node.op==='predicate')return map.has(node.element_id)?{op:'predicate',[field]:map.get(node.element_id)}:null;const children=node.children.map(n=>mapExpression(n,map,field)).filter(Boolean);if(!children.length)return null;if(node.op==='not')return {op:'not',children};return children.length===1?children[0]:{op:node.op,children};}
function walkLeaves(node){return node?.op==='predicate'?[node.element_id]:array(node?.children).flatMap(walkLeaves);}
function validate_candidate_element(candidate){
 object(candidate);for(const field of ['candidate_id','dimension_id','normalized_text'])text(candidate[field],field,2000);if(!candidate.candidate_id||!candidate.dimension_id)fail('INVALID_STRUCTURE','schema','Element and dimension IDs cannot be empty.');
 if(candidate.information_status!=='missing'&&!candidate.normalized_text.trim())fail('INVALID_STRUCTURE','schema','A source-defined element needs non-empty wording.');
 if(!Object.hasOwn(candidate,'structured_value')||candidate.structured_value!==null&&(typeof candidate.structured_value!=='object'||Array.isArray(candidate.structured_value)))fail('INVALID_STRUCTURE','schema','structured_value must be an object or null.');
 for(const field of ['semantic_role','information_status','scope_status'])enumValue(field,candidate[field]);
 if(candidate.disposition!=null)enumValue('disposition',candidate.disposition);
 if(candidate.semantic_role==='eligibility_condition'&&candidate.scope_status==='restricted'&&!candidate.disposition)fail('INVALID_STRUCTURE','schema','Eligibility conditions must specify include or exclude.');
 if(!Array.isArray(candidate.source_refs))fail('INVALID_STRUCTURE','schema','source_refs must be an array.');
 if(candidate.semantic_review&&!['supported','uncertain','contradicted'].includes(candidate.semantic_review.status))fail('INVALID_ENUM','semantic_review','Invalid semantic review status.');
 return candidate;
}
return {clone,array,ENUMS,EligibilityError,fail,id,stableId,now,key,object,text,enumValue,sourceAt,locate,quoteText,occurrenceClause,validate_provenance,sourceDifferences:grounding.differences,sourceConstraints:grounding.constraints,canonical,sameConstraint,structuredConstraints,check_semantics,hasOr,hasAnd,treeHas,validate_expression,mapExpression,walkLeaves,validate_candidate_element};
});
