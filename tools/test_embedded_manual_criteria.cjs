const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../eligibility.html'),'utf8');
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const params='));
const elements=new Map(),writes=[],reads=[];
function el(id){if(!elements.has(id))elements.set(id,{value:'',hidden:false,textContent:'',innerHTML:'',disabled:false,style:{},dataset:{},options:[{value:'Systematic Review'}],classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},getAttribute(){return null},querySelectorAll(){return []},focus(){}});return elements.get(id);}
const storage={getItem(k){reads.push(k);return null},setItem(k,v){writes.push([k,v])},removeItem(k){writes.push([k,null])}};
const ctx={console,URL,URLSearchParams,AbortController,DOMException,structuredClone,TextEncoder,TextDecoder,Blob,Map,Set,setTimeout(){},clearTimeout(){},navigator:{},localStorage:storage,sessionStorage:storage,
 location:{search:'?embedded=fulltext-criteria&projectId=synthetic',href:'http://127.0.0.1:8765/eligibility.html?embedded=fulltext-criteria&projectId=synthetic',pathname:'/eligibility.html'},
 document:{getElementById:el,querySelectorAll(){return []},addEventListener(){},documentElement:{classList:{add(){}}}},window:{addEventListener(){}}};
vm.runInNewContext(code.replace('// Reuse this exact manual editor', 'globalThis.testManual={state:()=>state,signature:manualSourceSignature,persistQuietly,save,setBusy(){manualRefinementController=new AbortController()}};\n// Reuse this exact manual editor'),ctx);
const editor=ctx.window.aimstepManualEditor;
assert(editor);assert.equal(el('manual-generate-panel').hidden,false);
const upstream={framework:'PICO',question:'Synthetic review',rows:[{title:'Population',condition:'Adults',uncertain:'Children',definition:'Age at enrollment'}]};
editor.load(upstream);el('start-date').value='2020-01-01';el('end-date').value='2025-12-31';el('language').value='English';el('limits-other').value='Peer-reviewed reports';
const edited=editor.read();assert.equal(edited.rows[0].condition,'Adults');assert.equal(edited.rows[0].definition,'Age at enrollment');assert.equal(edited.rows[1].title,'Limits');assert.match(edited.rows[1].condition,/2020-01-01 to 2025-12-31/);assert.match(edited.rows[1].condition,/English/);assert.match(edited.rows[1].condition,/Peer-reviewed reports/);
assert.equal(upstream.rows.length,1);assert(!upstream.manualEditor);
editor.load({...edited,question:upstream.question});assert.equal(editor.read().rows.length,2,'Reopening must not duplicate the limits criterion');assert.equal(el('language').value,'English');
el('start-date').value='2030-01-01';assert.throws(()=>editor.read(),/start date/);el('start-date').value='2020-01-01';
editor.load(upstream);ctx.testManual.save();const state=ctx.testManual.state();state.manualRefinement={signature:ctx.testManual.signature(),rows:[{dimension:'Population',include:['Adults aged 18 or older.'],exclude:['Children.']}],uncertainties:[],reviewTopic:'Synthetic',manuscriptParagraph:'Synthetic paragraph.'};
assert.equal(editor.read().rows[0].condition,'Adults aged 18 or older.','Current standardized rules are used for assessment');
state.criteria[0].condition='Adults aged 21 or older';assert.equal(editor.read().rows[0].condition,'Adults aged 21 or older','Stale standardized rules must not override an edit');
ctx.testManual.setBusy();assert.throws(()=>editor.read(),/Standardize to finish/);editor.stop();assert.equal(editor.read().rows[0].condition,'Adults aged 21 or older');
ctx.testManual.persistQuietly();ctx.testManual.save();
assert.deepEqual(writes,[],'Draft editing/preview must never modify upstream criteria, summary or completion flags');assert(!reads.some(k=>k==='aimstep-eligibility:synthetic'),'Embedded editor must not load upstream saved state');
editor.load(upstream);assert.equal(editor.read().rows[0].condition,'Adults','Discarded draft is not restored');
const standalone={...ctx,location:{...ctx.location,search:'?projectId=synthetic'},window:{addEventListener(){}}};
vm.runInNewContext(code,standalone);
assert.equal(standalone.window.aimstepManualEditor,undefined);assert(writes.some(([key])=>key==='aimstep-eligibility-summary:synthetic'),'Standalone preview keeps its original sharing behavior');
console.log('PASS: shared manual editor, isolated drafts, limits roundtrip, date validation, current/stale standardization and cancellation');
