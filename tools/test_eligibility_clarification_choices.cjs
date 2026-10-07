const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../eligibility.html'),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const params='));
const storage=new Map(),elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{value:'',hidden:false,innerHTML:'',textContent:'',options:[{value:'Systematic Review'}],classList:{add(){},remove(){},toggle(){}},handlers:{},addEventListener(k,f){this.handlers[k]=f},setAttribute(){},getAttribute(){return null},querySelectorAll(){return []},focus(){}});return elements.get(id);}
const ctx={console,URL,URLSearchParams,AbortController,structuredClone,TextEncoder,Blob,setTimeout(){},clearTimeout(){},navigator:{},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},sessionStorage:{getItem(){return null}},
 location:{search:'',href:'http://127.0.0.1:8765/eligibility.html',pathname:'/eligibility.html'},document:{getElementById:el,querySelectorAll(){return []},addEventListener(){}},window:{addEventListener(){}}};
const code=source.replace('// Reuse this exact manual editor',`globalThis.criteriaTest={get:()=>state,set:s=>{state=s;fill()},pending:currentPending,generate:generateFinalCriteria,export:criteriaWordFile,recordPendingChoice,save,renderCards,updateVisibleRule};\n// Reuse this exact manual editor`);
vm.runInNewContext(code,ctx);const api=ctx.criteriaTest;
function setup(mode){const state=api.get();Object.assign(state,{activeGenerator:mode,generationMethodChoice:mode,framework:'Other',finalCriteria:null,resolvedPending:[],pendingDecisions:{},manualRefinement:null,machineRefinement:null,criteria:[{title:'Population',condition:'Adults.\nDefine the age threshold',uncertain:'Children',definition:''},{title:'Study design',condition:'Randomized trials',uncertain:'',definition:'Define the excluded study designs'}]});state.machineCriteria=structuredClone(state.criteria);state.machineRun={question:'Synthetic question',reviewType:'Systematic Review',sourceRevision:0};state.machineSourceRevision=0;state.question='Synthetic question';api.set(state);return state;}
function docXml(){const bytes=Buffer.from(api.export());let offset=0;while(bytes.readUInt32LE(offset)===0x04034b50){const size=bytes.readUInt32LE(offset+18),n=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),name=bytes.subarray(offset+30,offset+30+n).toString();const start=offset+30+n+extra;if(name==='word/document.xml')return bytes.subarray(start,start+size).toString();offset=start+size;}throw Error('Missing Word document XML');}

for(const mode of ['manual','machine']){
 let state=setup(mode),items=api.pending();assert.equal(items.length,2);
 const markup=el('preview').innerHTML;
 assert(!markup.includes('For each item, choose'));assert(!markup.includes('Generate final criteria'));assert(!markup.includes('class="pc-fields"'));
 assert.match(markup,/pc-number">1\./);assert.match(markup,/pc-number">2\./);assert.match(markup,/>×<\/button>/);assert.match(markup,/>✓<\/button>/);
 // A reminder without a concrete rule still exports its exact choice.
 assert.equal(api.recordPendingChoice(items[0],'meets'),true);
 assert.equal(api.pending().includes(items[0]),false);assert.equal(api.pending().includes(items[1]),true);
 assert.match(docXml(),/Clarification decisions/);assert.match(docXml(),/Meets \(✓\)/);
 let saved=JSON.parse(storage.get('aimstep-eligibility:default'));
 assert(saved.clarificationGuidance.startsWith('For each item'));assert.equal(saved.finalCriteria.decisions[0].item,items[0]);
 api.set(saved);assert.equal(api.pending().includes(items[0]),false);
 // Failed writes leave the outstanding question and prior decisions intact.
 const before=JSON.stringify(api.get()),stored=storage.get('aimstep-eligibility:default');
 const write=ctx.localStorage.setItem;ctx.localStorage.setItem=()=>{throw Error('Synthetic quota failure')};
 assert.equal(api.recordPendingChoice(items[1],'fails'),false);assert.equal(JSON.stringify(api.get()),before);assert.equal(storage.get('aimstep-eligibility:default'),stored);
 ctx.localStorage.setItem=write;assert.equal(api.recordPendingChoice(items[1],'fails'),true);
 assert.match(docXml(),/Does not meet \(×\)/);assert.equal(api.pending().length,0);
 assert.equal(api.recordPendingChoice(items[1],'fails'),false,'Repeated clicks cannot duplicate a saved decision');
 assert.equal(api.get().finalCriteria.decisions.length,2);
}
// Concrete legacy draft text is applied and retained in the Word file, hidden on page.
let state=setup('machine'),item=api.pending()[0];state.pendingDecisions[item]={domain:'Population',text:'Adults aged 21 or older'};
assert.equal(api.recordPendingChoice(item,'meets'),true);assert.match(docXml(),/Adults aged 21 or older/);assert(!el('preview').innerHTML.includes('Adults aged 21 or older'));
console.log('PASS: numbered clarification icons, immediate scoped persistence, hidden selections, Word decisions, failed-save retry and duplicate-click protection');
