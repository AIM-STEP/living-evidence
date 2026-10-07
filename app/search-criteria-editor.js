/* Synchronize direct Search strategy edits with the previous criteria workspace. */
(function(root){
  'use strict';
  const copy=v=>JSON.parse(JSON.stringify(v));
  function workspace(previous,snapshot,at){
    const value=copy(previous||{}),machine=value.activeGenerator==='machine'&&!!value.machineRun;
    const field=machine?'machineCriteria':'criteria',oldRows=value[field]||[];
    value.criteriaEditHistory=[...(value.criteriaEditHistory||[]),{at,source:'Search strategy',previous:{question:value.question,framework:value.framework,activeGenerator:value.activeGenerator,rows:copy(oldRows),refinement:copy(value[machine?'machineRefinement':'manualRefinement']||null)}}].slice(-20);
    value[field]=snapshot.rows.map(row=>({...oldRows.find(r=>r.id===row.id),...copy(row)}));
    value.question=snapshot.question;value.framework=snapshot.framework||'Other';value.reviewType=snapshot.reviewType||value.reviewType||'Systematic Review';
    value.activeGenerator=machine?'machine':'manual';value.generationMethodChoice=value.activeGenerator;value.confirmed=false;
    // A refinement based on old rows must not override the user's edited wording.
    value[machine?'machineRefinement':'manualRefinement']=null;
    if(machine)value.machineRun={...value.machineRun,question:value.question,reviewType:value.reviewType,sourceRevision:value.machineSourceRevision||0};
    value.dateRange||={start:{year:'',month:'',day:''},end:{year:'',month:'',day:''}};
    value.language??='';value.limitsOther??='';
    return value;
  }
  function commit(storage,changes){
    const before=changes.map(([key])=>[key,storage.getItem(key)]),written=[];
    try{for(const [key,value]of changes){value===null?storage.removeItem(key):storage.setItem(key,value);written.push(key)}}
    catch(error){let rollbackFailed=false;for(const [key,value]of before.reverse()){if(!written.includes(key))continue;try{value===null?storage.removeItem(key):storage.setItem(key,value)}catch(e){rollbackFailed=true}}
      throw new Error(rollbackFailed?'Saving was interrupted. Keep your edits here and check both tools before retrying.':'Could not save criteria on this device. Your edits are still available; please retry.');}
  }
  const api={workspace,commit};if(typeof module==='object'&&module.exports)module.exports=api;else root.AIMSearchCriteriaEditor=api;
})(globalThis);
