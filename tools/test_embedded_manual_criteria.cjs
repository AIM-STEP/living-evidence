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
editor.load(upstream);
assert.match(el('preview').innerHTML,/Adults/);assert.match(el('preview').innerHTML,/Age at enrollment/);assert.match(el('preview').innerHTML,/Children/);
assert(!el('preview').innerHTML.includes('Standardize'));
const edited=editor.read();assert.equal(edited.rows.length,1);assert.equal(edited.rows[0].condition,'Adults');assert.equal(edited.rows[0].definition,'Age at enrollment');
assert.equal(upstream.rows.length,1);assert(!upstream.manualEditor);
editor.load({...edited,manualEditor:{...edited.manualEditor,language:'English',limitsOther:'Legacy limit',dateRange:{start:{year:'2030'}},manualRefinement:{signature:'old'}}});
assert.equal(editor.read().rows.length,1);assert.equal(editor.read().manualEditor.language,undefined);assert.equal(el('language').value,'');
const state=ctx.testManual.state();state.criteria[0].condition='Adults aged 21 or older';ctx.testManual.save();
assert.match(el('preview').innerHTML,/Adults aged 21 or older/);assert.equal(editor.read().rows[0].condition,'Adults aged 21 or older');
state.criteria[0].condition='<script>synthetic</script>';ctx.testManual.save();assert(!el('preview').innerHTML.includes('<script>'));assert.match(el('preview').innerHTML,/&lt;script&gt;/);
assert.match(html,/embedded-manual \.manual-limits-heading/);
ctx.testManual.persistQuietly();ctx.testManual.save();
assert.deepEqual(writes,[],'Draft editing/preview must never modify upstream criteria, summary or completion flags');assert(!reads.some(k=>k==='aimstep-eligibility:synthetic'),'Embedded editor must not load upstream saved state');
editor.load(upstream);assert.equal(editor.read().rows[0].condition,'Adults','Discarded draft is not restored');
const standalone={...ctx,location:{...ctx.location,search:'?projectId=synthetic'},window:{addEventListener(){}}};
vm.runInNewContext(code,standalone);
assert.equal(standalone.window.aimstepManualEditor,undefined);assert(writes.some(([key])=>key==='aimstep-eligibility-summary:synthetic'),'Standalone preview keeps its original sharing behavior');
console.log('PASS: direct live criteria preview, no limits or standardization dependency, escaped input, isolated drafts and standalone compatibility');
