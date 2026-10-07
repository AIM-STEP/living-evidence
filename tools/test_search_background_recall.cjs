const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('search-strategy.html','utf8');
const code=html.slice(html.indexOf('function recallInputs(){'),html.indexOf('// Fills only empty lists:'));
let calls=0,saves=0;
const ctx=vm.createContext({state:{knownPmids:'',queries:{pubmed:{text:'pain'}}},now:()=> 'synthetic',saveDraft:()=>saves++,eutilsJSON:async()=>{calls++;return{esearchresult:{idlist:calls%2?['123','456']:['123']}}}});
vm.runInContext(code,ctx);
(async()=>{
 await ctx.checkRecall();assert.equal(ctx.state.recallCheck.status,'unavailable');assert.equal(calls,0);
 ctx.state.knownPmids='123, 456, 789, 123';await ctx.checkRecall();assert.equal(ctx.state.recallCheck.percent,50);assert.equal(ctx.state.recallCheck.missing.join(','),'456');assert.equal(ctx.state.recallCheck.unknown.join(','),'789');
 await ctx.checkRecall();assert.equal(calls,2);
 ctx.state.queries.pubmed.text='changed';ctx.eutilsJSON=async()=>({});await ctx.checkRecall();assert.equal(ctx.state.recallCheck.status,'error');
 let release;ctx.eutilsJSON=()=>{ctx.eutilsJSON=async()=>({});return new Promise(r=>release=r)};const pending=ctx.checkRecall();ctx.state.queries.pubmed.text='newer';release({});await pending;assert(!ctx.state.recallCheck.key.includes('newer'));
 assert(html.includes("d.recordLimit='all'"));assert(!html.includes('id="record-limit"'));assert(!html.includes('id="known-pmids"'));
 console.log('PASS: background recall missing references, match/miss/unknown, deduplication, malformed responses, stale responses and automatic retrieval migration');
})().catch(e=>{console.error(e);process.exitCode=1});
