const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const code=fs.readFileSync(require('node:path').join(__dirname,'../app/protocol-workspace.js'),'utf8');
function setup(saved){
 const nodes=new Map(),data=new Map(saved?[['aimstep-protocol:test',JSON.stringify(saved)]]:[]);let fail=false;
 class E{constructor(){this.value='';this.children=[];this.style={};this.classList={toggle(){}};this.tagName='TEXTAREA';}setAttribute(){}insertAdjacentHTML(){}append(...c){this.children.push(...c)}appendChild(c){this.children.push(c)}replaceChildren(...c){this.children=c}querySelector(){return new E()}get firstElementChild(){return new E()}}
 const get=id=>{if(!nodes.has(id))nodes.set(id,new E());return nodes.get(id)};
 const storage={getItem:k=>data.get(k)||null,setItem(k,v){if(fail)throw Error('Quota');data.set(k,v)}};
 const context={window:{AimstepProtocolCore:{handoffSchema:{}}},document:{getElementById:get,querySelectorAll:()=>[],createElement:()=>new E(),addEventListener(){},documentElement:{lang:'en'}},location:{search:'?projectId=test',href:'https://aimsetp.com/build-protocol.html?projectId=test'},localStorage:storage,URL,URLSearchParams,AbortController,DOMException,Intl,Date,setInterval:()=>1,clearInterval(){},setTimeout(){},fetch:async()=>{throw Error('AI unavailable')},AimstepExtractionFormImport:{sourceText:async f=>{if(f.name.endsWith('.bad'))throw Error('Unsupported');return f.text()}},AimstepExtractionSources:{readPdf:async f=>({doc:{fullText:await f.text()}})},confirm:()=>true};
 vm.runInNewContext(code,context);return {get,data,fail:()=>{fail=true},state:()=>JSON.parse(data.get('aimstep-protocol:test'))};
}
const file=(name,text)=>({name,size:text.length,text:async()=>text});
(async()=>{
 let app=setup();app.get('protocol-file').files=[file('first.docx','Adults only'),file('second.pdf','Search PubMed')];await app.get('protocol-file').onchange();
 let saved=app.state();assert.equal(saved.imports.length,2);assert(saved.imports.every(f=>!Number.isNaN(Date.parse(f.importedAt))));assert(saved.importText.includes('Adults only'));assert(saved.importText.includes('Search PubMed'));assert.equal(app.get('proposal-import-list').children.length,2);assert(app.get('protocol-status').textContent.includes('AI unavailable'));
 app=setup(saved);assert.equal(app.get('proposal-import-list').children.length,2);
 app.get('protocol-file').files=[file('<img onerror=alert(1)>.md','Additional rules'),file('broken.bad','bad')];await app.get('protocol-file').onchange();assert.equal(app.state().imports.length,3);assert.equal(app.get('proposal-import-list').children[2].children[0].textContent,'<img onerror=alert(1)>.md');assert(app.get('import-status').textContent.includes('broken.bad'));
 app.get('clear-protocol').onclick();assert.equal(app.state().imports.length,3);assert.equal(app.state().text,'');
 app=setup({version:1,inputs:{},text:'Legacy',issues:[],mapping:null,history:[],importName:'old.txt',importText:'Legacy'});assert.equal(app.get('proposal-import-list').children.length,1);assert.equal(app.get('proposal-import-list').children[0].children[1].textContent,'Date not recorded');
 app=setup(saved);app.get('protocol-file').files=[file('huge.txt','x'.repeat(120000))];await app.get('protocol-file').onchange();assert.equal(app.state().imports.length,2);
 app=setup(saved);app.fail();app.get('protocol-file').files=[file('new.txt','New')];await app.get('protocol-file').onchange();assert.equal(app.state().imports.length,2);
 console.log('PASS multi-file import, dates, reload persistence, AI failure retention, partial failures, safe filenames, legacy migration, clear retention, size and storage errors');
})().catch(e=>{console.error(e);process.exitCode=1});
