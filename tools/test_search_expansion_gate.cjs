const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('search-strategy.html','utf8');
const fn=html.slice(html.indexOf('function searchWordsReady(){'),html.indexOf('function renderStrategies(){'));
const c={terms:'synthetic',mesh:'',expansionPending:false,expansionStale:false};
const ctx=vm.createContext({state:{concepts:[c]},mwController:null,machineWordPending:null,lines:s=>s.split('\n').filter(Boolean)});vm.runInContext(fn,ctx);
assert(ctx.searchWordsReady());ctx.mwController={};assert(!ctx.searchWordsReady());ctx.mwController=null;ctx.machineWordPending={};assert(!ctx.searchWordsReady());ctx.machineWordPending=null;c.expansionPending=true;assert(!ctx.searchWordsReady());c.expansionPending=false;c.expansionStale=true;assert(!ctx.searchWordsReady());c.expansionStale=false;c.terms='';assert(!ctx.searchWordsReady());c.mesh='Heading';assert(ctx.searchWordsReady());
ctx.state.concepts=[];assert(!ctx.searchWordsReady());
const renderer=html.slice(html.indexOf('function renderStrategies(){'),html.indexOf('function setBusy('));assert(renderer.includes("qn.textContent='';qn.hidden=true"));assert(!renderer.includes('q?.notes'));
console.log('PASS: blocks active, incomplete, stale and empty expansion; allows completed inventory; technical notes hidden');
