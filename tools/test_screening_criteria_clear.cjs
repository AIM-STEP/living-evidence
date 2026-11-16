'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const eligibility=read('eligibility.html'),dialogCode=read('app/screening-criteria-dialog.js');
const inline=[...eligibility.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const params='));
const original={activeGenerator:'manual',generationMethodChoice:'manual',reviewType:'Systematic Review',framework:'PICO',question:'Adults receiving exercise',criteria:[{id:'population',title:'Population',condition:'Adults'}],machineCriteria:[],materials:[{name:'Protocol.txt'}]};
function previewTest(){
  const elements=new Map(),writes=[];let confirmed=false;
  const el=id=>{if(!elements.has(id))elements.set(id,{value:'',hidden:false,textContent:'',innerHTML:'',disabled:false,style:{},dataset:{},options:[{value:'Systematic Review'}],classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},getAttribute(){return null},querySelectorAll(){return []},focus(){}});return elements.get(id)};
  const storage={getItem:()=>null,setItem:(k,v)=>writes.push([k,v]),removeItem:k=>writes.push([k,null])};
  const ctx={console,URL,URLSearchParams,AbortController,DOMException,structuredClone,TextEncoder,TextDecoder,Blob,Map,Set,setTimeout(){},clearTimeout(){},navigator:{},localStorage:storage,sessionStorage:storage,confirm:()=>confirmed,
    location:{search:'?embedded=search-criteria-preview&projectId=synthetic',href:'https://example.test/eligibility.html',pathname:'/eligibility.html'},document:{getElementById:el,querySelectorAll:()=>[],addEventListener(){},documentElement:{classList:{add(){}}}},window:{addEventListener(){}}};
  vm.runInNewContext(inline,ctx);const api=ctx.window.aimstepCriteriaPreview;assert.equal(typeof api.clear,'function');
  api.load(original);assert.match(el('preview').innerHTML,/Adults/);assert.equal(api.clear(),false);assert.equal(api.read().workspace.criteria.length,1);
  confirmed=true;assert.equal(api.clear(),true);let result=api.read().workspace;assert.equal(result.criteria.length,0);assert.equal(result.question,original.question);assert.equal(result.materials[0].name,'Protocol.txt');assert.equal(result.criteriaClearHistory.at(-1).rows[0].condition,'Adults');assert(!el('preview').innerHTML.includes('Adults'));assert.equal(api.read().summary,null);
  api.load({...original,activeGenerator:'machine',generationMethodChoice:'machine',machineCriteria:original.criteria,machineRun:{question:original.question,reviewType:original.reviewType,sourceRevision:0}});assert.match(el('preview').innerHTML,/Adults/);assert.equal(api.clear(),true);result=api.read().workspace;assert.equal(result.machineCriteria.length,0);assert.equal(result.criteria.length,1);assert.equal(result.machineRun,null);assert(!el('preview').innerHTML.includes('Adults'));assert.equal(api.read().summary,null);
  assert.deepEqual(writes,[],'Embedded clear must remain a draft until parent Save');
}
function setup(saved){
  const elements=new Map(),created=[],data=new Map([['aimstep-eligibility:synthetic',JSON.stringify(original)],['aimstep-eligibility-summary:synthetic','{"old":true}'],['aimstep-setup-completed:synthetic','[1,2,3,4]']]);
  let snapshot=saved?.snapshot||{framework:original.framework,question:original.question,rows:structuredClone(original.criteria)},confirmed=true,busy=false,fail=false;
  if(saved)for(const [key,value]of saved.data)data.set(key,value);
  const applied=[],storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  function element(tag){
    const handlers=new Map(),value={tag,style:{},disabled:false,hidden:false,open:false,children:[],setAttribute(){},before(){},after(){},append(child){this.children.push(child)},replaceChildren(...children){this.children=children},
      addEventListener(type,fn){const list=handlers.get(type)||[];list.push(fn);handlers.set(type,list)},async fire(type){for(const fn of handlers.get(type)||[])await fn({target:this,preventDefault(){},stopImmediatePropagation(){}})},showModal(){this.open=true},close(){this.open=false;this.fire('close')}};
    Object.defineProperty(value,'id',{set(id){this._id=id;elements.set(id,this)},get(){return this._id}});
    Object.defineProperty(value,'textContent',{set(text){this._text=text;this.children=[]},get(){return this._text||''}});
    if(tag==='iframe'){
      let workspace;
      value.contentWindow={aimstepCriteriaPreview:{load(v){workspace=structuredClone(v)},read(){return {workspace:structuredClone(workspace),summary:{old:true}}},clear(){if(!confirmed)return false;workspace[workspace.activeGenerator==='machine'?'machineCriteria':'criteria']=[];return true},discard(){}}};
      value.contentDocument={body:{scrollHeight:100},addEventListener(){}};
    }
    created.push(value);return value;
  }
  const el=id=>{if(!elements.has(id)){const value=element('div');value.id=id}return elements.get(id)};
  const ctx={URL,structuredClone,localStorage:storage,location:{href:'https://example.test/title-abstract-screening.html'},confirm:()=>confirmed,
    AIMSearchCriteriaEditor:require('../app/search-criteria-editor.js'),ResizeObserver:class{observe(){}disconnect(){}},document:{getElementById:el,createElement:element},window:{addEventListener(){}}};
  vm.runInNewContext(dialogCode,ctx);
  ctx.window.AIMScreeningCriteriaDialog({scope:'synthetic',projectId:'synthetic',pageLink:p=>p,busy:()=>busy,snapshot:()=>snapshot,parse:async()=>snapshot,apply:async next=>{if(fail)throw Error('save failed');applied.push(next);snapshot=next}});
  return {el,data,applied,created,setConfirm:v=>confirmed=v,setBusy:v=>busy=v,setFail:v=>fail=v,async open(){await el('open-criteria').fire('click');const frame=el('criteria-view').children.at(-1);if(frame?.tag==='iframe')await frame.fire('load')},save:()=>el('save-shared-criteria').fire('click'),clear:()=>el('clear-shared-criteria').fire('click')};
}
async function dialogTest(){
  let s=setup();await s.open();const originalStorage=JSON.stringify([...s.data]);assert.equal(s.el('clear-shared-criteria').className,s.el('save-shared-criteria').className);assert.equal(s.el('clear-shared-criteria').className,'criteria-source-link');assert.equal(s.el('clear-shared-criteria').textContent,'Clear');assert.equal(s.el('clear-shared-criteria').innerHTML,undefined);
  s.setConfirm(false);await s.clear();await s.save();assert.equal(s.applied[0].rows.length,1,'Cancelling Clear retains rules');
  s=setup();await s.open();s.setBusy(true);await s.clear();assert.equal(s.applied.length,0);assert.equal(JSON.stringify([...s.data]),originalStorage);s.setBusy(false);
  await s.clear();assert.equal(s.applied.length,1,'Clear must save immediately without clicking Save');assert.equal(s.applied[0].cleared,true);assert.equal(s.applied[0].rows.length,0);assert.equal(JSON.parse(s.data.get('aimstep-eligibility:synthetic')).question,original.question);assert.equal(s.data.has('aimstep-eligibility-summary:synthetic'),false);assert.deepEqual(JSON.parse(s.data.get('aimstep-setup-completed:synthetic')),[4]);assert.equal(s.el('clear-shared-criteria').disabled,true);assert.equal(s.el('save-shared-criteria').disabled,true);
  await s.el('close-criteria').fire('click');await s.open();assert.equal(s.el('save-shared-criteria').disabled,true,'Reopening after Clear must remain empty');assert.equal(s.el('criteria-view').children.length,0);
  const reloaded=setup({data:s.data,snapshot:s.applied[0]});await reloaded.open();assert.equal(reloaded.el('save-shared-criteria').disabled,true,'Reloaded saved clear must remain empty');assert.equal(reloaded.el('criteria-view').children.length,0);
  s=setup();await s.open();s.setFail(true);await s.clear();assert.equal(JSON.stringify([...s.data].sort()),JSON.stringify([...setup().data].sort()),'Failed immediate clear restores all storage');assert.equal(s.applied.length,0);assert.equal(s.el('save-shared-criteria').disabled,false);assert(s.created.some(el=>el.className==='criteria-upload-error'&&el.textContent==='save failed'&&!el.hidden));s.setFail(false);await s.save();assert.equal(s.applied[0].cleared,true);
  s=setup();await s.open();s.data.set('aimstep-eligibility:synthetic','{"external":true}');await s.clear();assert.equal(s.applied.length,0);assert.equal(s.data.get('aimstep-eligibility:synthetic'),'{"external":true}');
}
async function sourceTest(){
  const html=read('title-abstract-screening.html'),part=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
  const c={structuredClone,Map,Set,AimstepDedup:require('../app/screening-dedup.js'),scope:'synthetic',searchKey:'search',recordById:new Map(),workspace:{imports:[],importedRuns:[],criteriaUpload:{name:'Eligibility criteria',cleared:true,snapshot:{framework:'PICO',question:original.question,rows:[]}}},localStorage:{getItem:()=>JSON.stringify({criteriaSnapshot:{rows:original.criteria}})},openDB:async()=>({close(){}}),getProject:async()=>null,pendingFulltextReturns:async()=>[],prepareFulltextReturns:async()=>{},applyFulltextReturns:async()=>{},eligibilityFallback:()=>({rows:original.criteria}),row:r=>r,text:(v,n)=>String(v??'').slice(0,n),assignSourceNumbers:()=>false,fingerprint:JSON.stringify};
  vm.createContext(c);vm.runInContext(part('function validCriteriaUpload(', 'function screeningHasProgress(')+part('async function loadSource(', 'function stale('),c);
  await c.loadSource({persist:false,includeReturns:false});assert.equal(c.source.criteria.rows.length,0);assert.equal(c.source.criteria.cleared,true);assert.equal(c.validCriteriaUpload({...c.workspace.criteriaUpload,cleared:false}),null);
}
(async()=>{previewTest();await dialogTest();await sourceTest();console.log('PASS: matching adjacent text buttons; visible manual/machine clear; immediate save, reopen/reload, cancellation, rollback and concurrency protection');})().catch(e=>{console.error(e);process.exitCode=1});
