const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('search-strategy.html','utf8');
let value,label;const el={};const ctx={state:{concepts:[{}],wordProgressPercent:42},$:()=>el,esc:v=>String(v).replace(/</g,'&lt;').replace(/"/g,'&quot;'),mwController:{},machineWordPending:null,searchWordsReady:()=>false};vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf('function progressMarkup('),html.indexOf('function renderWordTerms(')),ctx);
for(const n of [0,42,100,null]){const markup=ctx.progressMarkup(n,'Test');assert(markup.includes((n??0)+'%'));assert(!markup.includes('…'));assert(markup.includes('progress-fill'));assert(markup.includes('progress-percent'));}
let updates={};const native={setAttribute:(k,v)=>updates[k]=v},text={};const meter={style:{setProperty:(k,v)=>updates[k]=v},querySelector:q=>q==='progress'?native:text};ctx.updateProgress({querySelector:()=>meter},63,'Actual stage');assert.equal(updates['--progress'],'63%');assert.equal(native.value,63);assert.equal(text.textContent,'63%');
ctx.updateProgress=(_,v,l)=>{value=v;label=l};ctx.renderWordProgress();assert.equal(value,42);ctx.mwController=null;ctx.searchWordsReady=()=>true;ctx.renderWordProgress();assert.equal(value,100);ctx.searchWordsReady=()=>false;ctx.renderWordProgress();assert.equal(value,0);
assert(html.includes('transition:width 1.2s ease'));assert(html.includes('onProgress(Math.min(all.length,i+24)/all.length)'));
console.log('PASS: fill and endpoint percentage, no ellipsis, smooth updates, stage progress, completion and stale states');
