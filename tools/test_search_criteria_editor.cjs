const assert=require('node:assert/strict');
const {workspace,commit}=require('../app/search-criteria-editor.js');
const {blankWorkspace}=require('../app/eligibility-library.js');
const snapshot={question:'Edited topic',framework:'PICO',reviewType:'Systematic Review',rows:[{id:'INC-01',title:'Population',condition:'Edited adults',uncertain:'Children',definition:''}]};
for(const mode of ['manual','machine']){
 const field=mode==='machine'?'machineCriteria':'criteria',original={activeGenerator:mode,generationMethodChoice:mode,question:'Old topic',criteria:[],machineCriteria:[],machineSourceRevision:2,machineRun:{question:'Old topic',reviewType:'Systematic Review',sourceRevision:2},[field]:[{...snapshot.rows[0],condition:'Old adults',purpose:'Eligibility'}],finalCriteria:{decisions:[{decision:'meets'}]},[mode+'Refinement']:{trace:['keep audit']}};
 const updated=workspace(original,snapshot,'synthetic-time');
 assert.equal(updated[field][0].condition,'Edited adults');assert.equal(updated[field][0].purpose,'Eligibility');assert.equal(updated.activeGenerator,mode);assert.equal(updated[mode+'Refinement'],null);
 assert.equal(updated.criteriaEditHistory[0].previous.refinement.trace[0],'keep audit');assert.deepEqual(updated.finalCriteria,original.finalCriteria);assert.equal(original.question,'Old topic');
 if(mode==='machine')assert.equal(updated.machineRun.question,updated.question);
}
assert.equal(workspace(null,snapshot,'now').generationMethodChoice,'manual');
for(const mode of ['manual','machine']){
 const original={activeGenerator:mode,criteria:structuredClone(snapshot.rows),machineCriteria:structuredClone(snapshot.rows),question:'Preserved question',attachments:['Protocol'],machineRun:{question:'Preserved question'},manualRefinement:{trace:['manual']},machineRefinement:{trace:['machine']},finalCriteria:{decisions:['old']},language:'English',limitsOther:'Old limit'};
 const emptied=blankWorkspace(original),field=mode==='machine'?'machineCriteria':'criteria';
 assert.equal(emptied[field].length,0);assert.equal(original[field].length,1);
 assert.equal(emptied.activeGenerator,mode);assert.equal(emptied.machineRun,null);assert.equal(emptied.finalCriteria,null);
 const shared=blankWorkspace({...original,protocolSource:{sharedCriteria:true}});
 assert.equal(shared.criteria.length,0);assert.equal(shared.machineCriteria.length,0);assert.equal(shared.protocolSource,undefined);
}
const map=new Map([['previous','old'],['search','old-search'],['summary','old-summary']]);let fail=true;
const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>{if(k==='search'&&fail){fail=false;throw Error('Quota')}map.set(k,v)},removeItem:k=>map.delete(k)};
assert.throws(()=>commit(storage,[['previous','new'],['search','new-search'],['summary',null]]),/Could not save/);
assert.equal(map.get('previous'),'old');assert.equal(map.get('search'),'old-search');assert.equal(map.get('summary'),'old-summary');
commit(storage,[['previous','new'],['search','new-search'],['summary',null]]);assert.equal(map.get('previous'),'new');assert(!map.has('summary'));
console.log('PASS: manual/machine sync, audit retention, original data preserved, failed-write rollback and retry');
