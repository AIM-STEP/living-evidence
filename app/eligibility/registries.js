/* Configuration-driven definitions. Framework choice never authorizes a restriction. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AIMSTEPEligibilityRegistries=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
class FrameworkRegistry{
 constructor(config){this.version=config.version||'custom';this.items=new Map();for(const item of config.frameworks||[])this.register(item);}
 register(value){const item=copy(value);if(!item.framework_id||!item.display_name||!Array.isArray(item.slots))throw Error('Framework definition requires framework_id, display_name and slots.');const ids=new Set();for(const slot of item.slots){if(!slot.slot_id||ids.has(slot.slot_id))throw Error('Framework slot IDs must be unique and nonempty.');ids.add(slot.slot_id);}for(const rule of item.check_rules||[]){if(!rule.rule_id||!['core_scope','dimension','evidence_unit','advice'].includes(rule.kind)||rule.kind==='dimension'&&!rule.dimension_id)throw Error('Framework check_rules need a rule_id and a supported kind (core_scope, dimension, evidence_unit, advice).');}this.items.set(item.framework_id,item);return item;}
 get(id){return this.items.get(id)||null;}
 list(){return [...this.items.values()].map(copy);}
 resolve(name,context={}){
  if(!name)return {framework:null,candidates:[],basis:'not_specified',explicit:false};
  if(name==='pico'){
   const dims=context.dimensions||[],types=context.question_types||[];
   if(dims.includes('phenomenon_of_interest')||types.includes('experience'))return {framework:this.get('pico_qualitative'),candidates:[],basis:'context_disambiguates_lowercase_pico',explicit:true};
   if(dims.includes('intervention')||types.includes('intervention_effect'))return {framework:this.get('pico'),candidates:[],basis:'context_disambiguates_lowercase_pico',explicit:true};
   return {framework:null,candidates:['pico','pico_qualitative'].map(id=>this.get(id)).filter(Boolean),basis:'case_ambiguity_changes_semantics',explicit:true};
  }
  const found=this.list().filter(item=>item.display_name===name||(item.aliases||[]).includes(name)||item.framework_id===name);
  return found.length===1?{framework:found[0],candidates:[],basis:'explicit_name_or_maintained_alias',explicit:true}:{framework:null,candidates:found,basis:'unknown_or_ambiguous_framework',explicit:true};
 }
 map(dimension,framework){const root=dimension.split('.')[0],slot=framework?.slots.find(slot=>slot.slot_id===dimension||slot.slot_id===root);return slot?[{framework_id:framework.framework_id,slot_id:slot.slot_id}]:[];}
}
class ReviewProfileRegistry{
 constructor(config){this.version=config.version||'custom';this.items=new Map((config.profiles||[]).map(p=>[p.profile_id,copy(p)]));this.questionTypes=copy(config.question_types||{});}
 get(id){return this.items.get(id)||null;}
 resolve(methods=[]){const names=Array.isArray(methods)?methods:[methods];return [...this.items.values()].filter(p=>p.profile_id==='general'||p.review_methods.some(m=>names.includes(m)));}
 list(){return [...this.items.values()].map(copy);}
}
return {FrameworkRegistry,ReviewProfileRegistry};
});
