const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app/proposal-context.js'),'utf8'),core=require('../app/manuscript-core.js');
function make({failure,pending,timeout}={}){
 const ids=[],closed=[];
 const stores={
  'aimstep-search-results':{runs:[{id:'run1',db:'pubmed',query:'exercise',status:'complete',total:12}]},
  'aimstep-title-abstract':{state:{criteria:'Saved criteria',sampleSize:20}},
  'aimstep-fulltext':{state:{criteria:'Saved full-text criteria',records:[]}},
  'aimstep-extraction':{state:{form:{fields:['Age']},studies:[]}},
  'aimstep-rob':{state:{selectedToolId:'rob2',studies:[]}},
  'aimstep-analysis':{state:{plan:'A saved synthesis plan',runs:[],rows:[]}}
 };
 const context={AimstepManuscriptCore:core,DOMException,setTimeout:timeout?callback=>{queueMicrotask(callback);return 1;}:setTimeout,clearTimeout:timeout?()=>{}:clearTimeout,localStorage:{getItem:key=>key==='aimstep-eligibility:test'?JSON.stringify({question:'Exercise review',activeGenerator:'manual',criteria:[{title:'Population',condition:'Adults'}]}):null},indexedDB:{open(name){const request={};if(pending)return request;queueMicrotask(()=>{const db={objectStoreNames:{contains:()=>true},close(){closed.push(name);},transaction(){if(failure)throw Error('Synthetic closing database');const transaction={objectStore:()=>({get(id){ids.push(id);const row={result:stores[name]};queueMicrotask(()=>transaction.oncomplete?.());return row;}})};return transaction;}};request.result=db;request.onsuccess?.();});return request;}}};context.window=context;vm.runInNewContext(source,context);return {api:context.AimstepProposalContext,ids,closed};
}
test('reads all saved project stores and keeps the requested project scope',async()=>{const {api,ids,closed}=make(),value=await api.collect('test');assert.equal(value.projectId,'test');assert.equal(ids.length,6);assert(ids.every(id=>id==='test'));assert.equal(closed.length,6);assert(value.materials.some(item=>item.stage.includes('Extraction')));assert(value.materials.some(item=>item.stage.includes('Analysis')));assert.equal(value.eligibility.criteria[0].condition,'Adults');});
test('a synchronous database transaction error rejects instead of hanging',async()=>{const {api}=make({failure:true});await assert.rejects(api.collect('test'),/Synthetic closing database/);});
test('pending project reads can be stopped',async()=>{const {api}=make({pending:true}),controller=new AbortController(),result=api.collect('test',{signal:controller.signal});controller.abort();await assert.rejects(result,{name:'AbortError'});});
test('pending project reads report a timeout',async()=>{const {api}=make({pending:true,timeout:true});await assert.rejects(api.collect('test'),/timed out/);});
