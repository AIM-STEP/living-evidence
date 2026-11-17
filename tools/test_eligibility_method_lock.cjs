const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../eligibility.html'),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const params='));
function setup(storage=new Map()){
 const elements=new Map();
 function el(id){
  if(!elements.has(id))elements.set(id,{value:'',hidden:false,innerHTML:'',textContent:'',disabled:false,handlers:{},
   options:id==='generation-method'?['','machine','manual'].map(value=>({value,disabled:false})):[],
   style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},dataset:{},
   addEventListener(type,handler){this.handlers[type]=handler},setAttribute(){},getAttribute(){return null},
   querySelectorAll(){return []},querySelector(){return {textContent:''}},replaceChildren(){},focus(){}});
  return elements.get(id);
 }
 const ctx={console,URL,URLSearchParams,AbortController,structuredClone,TextEncoder,Blob,setTimeout(){},clearTimeout(){},navigator:{},confirm:()=>true,
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},sessionStorage:{getItem(){return null}},
  location:{search:'?projectId=synthetic-method-lock',href:'http://localhost/eligibility.html?projectId=synthetic-method-lock',pathname:'/eligibility.html'},
  document:{getElementById:el,querySelectorAll(){return []},addEventListener(){}},window:{addEventListener(){},AIMSTEPProjectAccess:{run:fn=>fn()}}};
 const code=source.replace('// Reuse this exact manual editor',`globalThis.methodTest={state:()=>state,save,fill,clear:clearPreviewCriteria,
  stub(fail=false){
   resolveLocalModel=async()=>({name:'Synthetic model'});
   prepareSources=async question=>({texts:[{name:'Question',text:question}],images:[]});
   requestMachineCriteria=async()=>({framework:'PICO',criteria:[{dimension:'Population',eligibilityRule:'Adults',exclusionRule:'Children'}]});
   autoCriteriaPipeline=async(model,input,signature)=>{
    if(fail)throw Error('Synthetic generation failure');
    return {signature,generatedAt:'2026-11-17T00:00:00Z',reviewTopic:'Synthetic review',manuscriptParagraph:'Adults are eligible.',uncertainties:[],trace:[],
     rows:input.criteria.map(row=>({dimension:row.dimension,include:[row.eligibilityRule],exclude:row.exclusionRule?[row.exclusionRule]:[]}))};
   };
  }};\n// Reuse this exact manual editor`);
 vm.runInNewContext(code,ctx);
 const select=el('generation-method');
 return {ctx,storage,el,api:ctx.methodTest,select,
  choose(mode){select.value=mode;select.handlers.change();},
  disabled(mode){return select.options.find(option=>option.value===mode).disabled;}};
}
(async()=>{
 for(const mode of ['machine','manual']){
  const other=mode==='machine'?'manual':'machine',test=setup();
  test.api.stub();test.choose(other);test.choose(mode);
  assert.equal(test.select.value,mode,'Inputs alone must allow switching methods');
  assert(!test.disabled(other));
  test.el('question').value='Synthetic question';
  await test.el(mode==='machine'?'start-machine':'refine-manual').handlers.click();
  assert(test.disabled(other),'Successful generation disables the opposite option');
  assert(!test.disabled(mode));
  const generated=JSON.stringify(test.api.state());
  test.choose(other);
  assert.equal(test.select.value,mode,'A stale or programmatic change cannot switch a generated set');
  assert.equal(JSON.stringify(test.api.state()),generated);
  const reloaded=setup(test.storage);
  assert.equal(reloaded.select.value,mode);assert(reloaded.disabled(other),'Refresh must restore the lock');
  reloaded.el('question').value='Updated source';reloaded.api.save();
  assert(reloaded.disabled(other),'Source edits must not unlock an existing criteria set');
  reloaded.ctx.confirm=()=>false;assert.equal(reloaded.api.clear(),false);assert(reloaded.disabled(other));
  reloaded.ctx.confirm=()=>true;
  const write=reloaded.ctx.localStorage.setItem;
  reloaded.ctx.localStorage.setItem=()=>{throw Error('Synthetic quota failure')};
  assert.equal(reloaded.api.clear(),false);assert(reloaded.disabled(other),'Failed Clear keeps the criteria and lock');
  reloaded.ctx.localStorage.setItem=write;
  assert.equal(reloaded.api.clear(),true);
  assert(!reloaded.disabled('machine'));assert(!reloaded.disabled('manual'));
  reloaded.choose(other);assert.equal(reloaded.select.value,other,'Successful Clear permits changing methods');
  const failed=setup();failed.api.stub(true);failed.choose(mode);failed.el('question').value='Synthetic question';
  await failed.el(mode==='machine'?'start-machine':'refine-manual').handlers.click();
  assert(!failed.disabled(other),'Failed generation must not lock the method');
  failed.choose(other);assert.equal(failed.select.value,other);
 }
 console.log('PASS: both generation flows lock the opposite method only after success; blocked changes, reload, source edits, failed/cancelled Clear, successful Clear and failed generation');
})().catch(error=>{console.error(error);process.exitCode=1});
