const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../eligibility.html'),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const params='));
const storage=new Map(),elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{value:'',hidden:false,innerHTML:'',textContent:'',options:[{value:'Systematic Review'}],classList:{add(){},remove(){},toggle(){}},handlers:{},addEventListener(k,f){this.handlers[k]=f},setAttribute(){},getAttribute(){return null},querySelectorAll(){return []},focus(){}});return elements.get(id);}
const ctx={console,URL,URLSearchParams,AbortController,structuredClone,TextEncoder,Blob,setTimeout(){},clearTimeout(){},navigator:{},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},sessionStorage:{getItem(){return null}},
 location:{search:'',href:'http://127.0.0.1:8765/eligibility.html',pathname:'/eligibility.html'},document:{getElementById:el,querySelectorAll(){return []},addEventListener(){}},window:{addEventListener(){}}};
const code=source.replace('// Reuse this exact manual editor',`globalThis.criteriaTest={get:()=>state,set:s=>{state=s;fill()},pending:currentPending,generate:generateFinalCriteria,export:criteriaWordFile,save,renderCards,updateVisibleRule};\n// Reuse this exact manual editor`);
vm.runInNewContext(code,ctx);const api=ctx.criteriaTest;
function setup(mode){const state=api.get();Object.assign(state,{activeGenerator:mode,generationMethodChoice:mode,framework:'Other',finalCriteria:null,resolvedPending:[],pendingDecisions:{},manualRefinement:null,machineRefinement:null,criteria:[{title:'Population',condition:'Adults.\nDefine the age threshold',uncertain:'Children',definition:''},{title:'Study design',condition:'Randomized trials',uncertain:'',definition:'Define the excluded study designs'}]});state.machineCriteria=structuredClone(state.criteria);state.machineRun={question:'Synthetic question',reviewType:'Systematic Review',sourceRevision:0};state.machineSourceRevision=0;state.question='Synthetic question';api.set(state);return state;}
function docXml(){const bytes=Buffer.from(api.export());let offset=0;while(bytes.readUInt32LE(offset)===0x04034b50){const size=bytes.readUInt32LE(offset+18),n=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),name=bytes.subarray(offset+30,offset+30+n).toString();const start=offset+30+n+extra;if(name==='word/document.xml')return bytes.subarray(start,start+size).toString();offset=start+size;}throw Error('Missing Word document XML');}
for(const mode of ['manual','machine']){
 const state=setup(mode),pending=api.pending();assert.equal(pending.length,2);assert.match(el('preview').innerHTML,/Pending clarification/);
 for(const item of pending)state.pendingDecisions[item]=item.startsWith('Population')?{decision:'meets',domain:'Population',text:'Adults aged 21 or older'}:{decision:'fails',domain:'Study design',text:'Case reports'};
 api.generate();
 assert(!el('preview').innerHTML.includes('Pending clarification'));assert(!el('preview').innerHTML.includes('Adults aged 21'));assert(!el('preview').innerHTML.includes('Case reports'));assert(!el('criteria-list').innerHTML.includes('Adults aged 21'));assert(!el('criteria-list').innerHTML.includes('Case reports'));
 assert.match(el('preview').innerHTML,/Adults\./);assert.match(el('preview').innerHTML,/Randomized trials/);
 const xml=docXml();assert.match(xml,/Adults aged 21 or older/);assert.match(xml,/Case reports/);
 const shared=JSON.parse(storage.get('aimstep-eligibility-summary:default'));assert(shared.includes.some(r=>r.text.includes('Adults aged 21')));assert(shared.exclusions.some(r=>r.text.includes('Case reports')));
 // Editing a visible field must not erase its hidden, confirmed rule.
 const row=(mode==='manual'?state.criteria:state.machineCriteria)[0];api.updateVisibleRule(row,'condition','Participants with chronic pain');api.save();assert.match(docXml(),/Adults aged 21 or older/);assert.match(docXml(),/Participants with chronic pain/);
 // Saved state keeps the same presentation/export separation on refresh.
 api.set(JSON.parse(storage.get('aimstep-eligibility:default')));assert(!el('preview').innerHTML.includes('Adults aged 21'));assert.match(docXml(),/Adults aged 21 or older/);
}
assert(!html.includes('Back: Toolset'));
console.log('PASS: manual/machine confirmations hidden from page, retained in DOCX and handoff, preserved on visible edits and reload');
