const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../eligibility.html'),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const params='));
const storage=new Map(),elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{value:'',hidden:false,innerHTML:'',textContent:'',options:[{value:'Systematic Review'}],classList:{add(){},remove(){},toggle(){}},handlers:{},addEventListener(k,f){this.handlers[k]=f},setAttribute(){},getAttribute(){return null},querySelectorAll(){return []},focus(){}});return elements.get(id);}
const ctx={console,URL,URLSearchParams,AbortController,structuredClone,TextEncoder,Blob,setTimeout(){},clearTimeout(){},navigator:{},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},sessionStorage:{getItem(){return null}},
 location:{search:'',href:'http://127.0.0.1:8765/eligibility.html',pathname:'/eligibility.html'},document:{getElementById:el,querySelectorAll(){return []},addEventListener(){}},window:{addEventListener(){}}};
const code=source.replace('// Reuse this exact manual editor',`globalThis.criteriaTest={get:()=>state,set:s=>{state=s;fill()},pending:currentPending,generate:generateFinalCriteria,export:criteriaWordFile,savePreviewEdits,clearPreviewCriteria,dirty(){previewDirty=true},normalized:standardizedCriteria,exportState:()=>({dirty:previewDirty}),save,renderCards,updateVisibleRule};\n// Reuse this exact manual editor`);
vm.runInNewContext(code,ctx);const api=ctx.criteriaTest;
function setup(mode){const state=api.get();Object.assign(state,{activeGenerator:mode,generationMethodChoice:mode,framework:'Other',finalCriteria:null,resolvedPending:[],pendingDecisions:{},manualRefinement:null,machineRefinement:null,criteria:[{title:'Population',condition:'Adults.\nDefine the age threshold',uncertain:'Children',definition:''},{title:'Study design',condition:'Randomized trials',uncertain:'',definition:'Define the excluded study designs'}]});state.machineCriteria=structuredClone(state.criteria);state.machineRun={question:'Synthetic question',reviewType:'Systematic Review',sourceRevision:0};state.machineSourceRevision=0;state.question='Synthetic question';api.set(state);return state;}
function docXml(){const bytes=Buffer.from(api.export());let offset=0;while(bytes.readUInt32LE(offset)===0x04034b50){const size=bytes.readUInt32LE(offset+18),n=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),name=bytes.subarray(offset+30,offset+30+n).toString();const start=offset+30+n+extra;if(name==='word/document.xml')return bytes.subarray(start,start+size).toString();offset=start+size;}throw Error('Missing Word document XML');}

function edit(nodes,textNodes=[]){
 el('preview').querySelectorAll=selector=>selector==='[data-criteria-row]'?nodes:selector==='[data-criteria-text]'?textNodes:[];
 api.dirty();
}
const node=(index,kind,position,text)=>({dataset:{criteriaRow:String(index),criteriaKind:kind,criteriaRule:String(position)},innerText:text});
for(const mode of ['manual','machine']){
 let state=setup(mode);
 // Generate confirmed hidden rules first, then edit visible criteria only.
 for(const item of api.pending())state.pendingDecisions[item]=item.startsWith('Population')?{decision:'meets',domain:'Population',text:'Adults aged 21 or older'}:{decision:'fails',domain:'Study design',text:'Case reports'};
 api.generate();
 const before=structuredClone(api.get());
 assert.match(el('preview').innerHTML,/contenteditable="plaintext-only"/);
 edit([node(0,'include',0,'Participants with active Fibromyalgia.\nParticipants taking stable medication.'),node(0,'exclude',0,'Pregnant participants.')]);
 assert.equal(api.savePreviewEdits(),true);
 let saved=JSON.parse(storage.get('aimstep-eligibility:default'));
 const rows=mode==='machine'?saved.machineCriteria:saved.criteria;
 assert.match(rows[0].condition,/active Fibromyalgia/);assert.match(rows[0].condition,/Adults aged 21/);
 assert.match(rows[0].uncertain,/Pregnant/);
 assert(!el('preview').innerHTML.includes('Adults aged 21'));assert(!el('preview').innerHTML.includes('Case reports'));
 assert.match(docXml(),/active Fibromyalgia/);assert.match(docXml(),/Adults aged 21/);assert.match(docXml(),/Case reports/);
 const shared=JSON.parse(storage.get('aimstep-eligibility-summary:default'));assert(shared.includes.some(r=>r.text.includes('active Fibromyalgia')));
 api.set(saved);assert.match(el('preview').innerHTML,/active Fibromyalgia/);
 // A failed storage write keeps the persisted/source criteria and editable draft intact.
 const prior=JSON.stringify(api.get()),persisted=storage.get('aimstep-eligibility:default');
 edit([node(0,'include',0,'Synthetic replacement that must not be lost.')]);
 const write=ctx.localStorage.setItem;ctx.localStorage.setItem=()=>{throw Error('Synthetic quota failure')};
 assert.equal(api.savePreviewEdits(),false);assert.equal(JSON.stringify(api.get()),prior);assert.equal(storage.get('aimstep-eligibility:default'),persisted);assert.equal(api.exportState().dirty,true);
 ctx.localStorage.setItem=write;assert.equal(api.savePreviewEdits(),true);assert.match(docXml(),/Synthetic replacement/);
 // Edited text must be escaped on rerender, never inserted as markup.
 edit([node(0,'include',0,'<img src=x onerror=alert(1)> Synthetic text.')]);assert.equal(api.savePreviewEdits(),true);assert(!el('preview').innerHTML.includes('<img'));assert.match(el('preview').innerHTML,/&lt;img/);
}
// Hidden-only domains must not shift the source row edited in the next visible domain.
let state=setup('machine');state.machineCriteria.unshift({title:'Other',condition:'Hidden custom rule.',uncertain:'',definition:''});state.finalCriteria={decisions:[{domain:'Other',decision:'meets',rule:'Hidden custom rule.'}]};api.set(state);
edit([node(0,'include',0,'Visible population update.')]);assert.equal(api.savePreviewEdits(),true);
assert.equal(api.get().machineCriteria[0].condition,'Hidden custom rule.');assert.match(api.get().machineCriteria[1].condition,/Visible population update/);

// Topic/paragraph edits are persisted and exported; Next also commits pending edits.
state=setup('machine');
edit([node(0,'include',0,'Adults with active Fibromyalgia.')],[{dataset:{criteriaText:'topic'},innerText:'Synthetic custom review topic'},{dataset:{criteriaText:'paragraph'},innerText:'Synthetic edited manuscript wording.'}]);
let prevented=false;el('next-search-strategy').handlers.click({preventDefault(){prevented=true}});
assert.equal(prevented,false);assert.match(docXml(),/Synthetic custom review topic/);assert.match(docXml(),/Synthetic edited manuscript wording/);
const trace=[{id:'source-1',proposition:'Synthetic source rule',used:true}];api.get().machineRefinement.trace=trace;api.set(api.get());
edit([node(0,'include',0,'Adults receiving stable medication.')]);assert.equal(api.savePreviewEdits(),true);
assert.equal(JSON.stringify(api.get().machineRefinement.trace),JSON.stringify(trace));assert(!el('preview').innerHTML.includes('Intermediate draft trace'));
// Clear is explicit, cancellation is inert, failed persistence keeps edits, and reload stays clear.
for(const mode of ['manual','machine']){
 state=setup(mode);const beforeClear=JSON.stringify(api.get());
 ctx.confirm=()=>false;assert.equal(api.clearPreviewCriteria(),false);assert.equal(JSON.stringify(api.get()),beforeClear);
 ctx.confirm=()=>true;
 const write=ctx.localStorage.setItem;ctx.localStorage.setItem=()=>{throw Error('Synthetic storage failure')};
 assert.equal(api.clearPreviewCriteria(),false);assert.equal(JSON.stringify(api.get()),beforeClear);
 ctx.localStorage.setItem=write;
 edit([node(0,'include',0,'Unsaved change to discard only after confirmation.')]);
 assert.equal(api.clearPreviewCriteria(),true);assert.equal(api.exportState().dirty,false);
 const saved=JSON.parse(storage.get('aimstep-eligibility:default'));
 assert.equal((mode==='machine'?saved.machineCriteria:saved.criteria).length,0);assert.equal(saved.question,'Synthetic question');assert(saved.criteriaClearHistory.at(-1).rows.length>0);
 assert.equal(storage.has('aimstep-eligibility-summary:default'),false);
 api.set(saved);assert.equal(el('save-criteria').hidden,true);assert.equal(el('clear-criteria').hidden,true);
}
state=setup('machine');
// A source change must not be overwritten by an older preview draft.
edit([node(0,'include',0,'Stale preview text.')]);api.get().machineCriteria[0].condition='New source criterion.';
assert.equal(api.savePreviewEdits(),false);assert.equal(api.get().machineCriteria[0].condition,'New source criterion.');
assert(html.indexOf('id="save-criteria"')<html.indexOf('id="download"'));assert(!html.includes('Download criteria'));assert(html.indexOf('id="download"')<html.indexOf('id="clear-criteria"'));assert(!html.includes('<h3>Inclusion criteria</h3>'));assert(html.includes('<h3>Inclusion</h3>'));
console.log('PASS: editable criteria save/export/handoff/reload, hidden rules, failed-save retry, escaped text and filtered-domain mapping');
