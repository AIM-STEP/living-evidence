const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('search-strategy.html','utf8');
const code=html.slice(html.indexOf("const WORD_METHOD_VERSION="),html.indexOf('function showConceptNotes('));
let mode='ok',calls=0,reviewCalls=0;const state={criteriaSnapshot:{question:'Synthetic fibromyalgia review'},concepts:[]};
const descriptor={uid:'123',ds_recordtype:'descriptor',ds_meshui:'D005356',ds_meshterms:['Fibromyalgia','Fibrositis'],ds_scopenote:'Synthetic fixture'};
const ctx=vm.createContext({state,Map,Set,DOMException,now:()=> 'synthetic',saveDraft(){},machineWordKey:()=> 'synthetic-key',currentFramework:()=> 'PIS',lines:s=>String(s||'').split('\n').filter(Boolean),dq:s=>'"'+s+'"',isRctDesign:c=>c.role==='design',eutilsJSON:async(path,p)=>{
 calls++;
 if(mode==='offline')throw Error('synthetic offline');
 if(p.db==='mesh'&&path==='esearch.fcgi')return{esearchresult:{idlist:['123']}};
 if(p.db==='mesh')return{result:{uids:['123'],123:descriptor}};
 if(mode==='badCount')return{esearchresult:{ERROR:'synthetic error'}};
 return{esearchresult:{count:p.term.includes('novel')?'0':'12'}};
},requestModelJSON:async(prompt,schema)=>{
 reviewCalls++;if(mode==='retry'&&reviewCalls===1)return{decisions:[]};
 if(mode==='badReview')return{decisions:[]};
 const ids=schema.properties.decisions.items.properties.id.enum;
 const payload=JSON.parse(prompt.slice(prompt.indexOf('\n')+1));
 if(mode==='editDuringReview')state.concepts[0].terms='user edit';
 const response={decisions:ids.map(id=>{const c=payload.groups.flatMap(g=>g.candidates).find(c=>c.id===id);return{id,accept:!['pain','FM'].includes(c.term),reason:['pain','FM'].includes(c.term)?'Too broad or ambiguous.':'Same scoped concept.'}})};
 return mode==='array'?response.decisions:response;
}});
vm.runInContext(code,ctx);
const controller=new AbortController();const seed=()=>{const c={id:'p',label:'Population',role:'population',terms:'fibromyalgia\nnovel syndrome\npain\nFM',mesh:'',sourceRule:'Fibromyalgia',wordAudit:{status:'draft'}};state.concepts=[c];return c};
(async()=>{
 assert.equal(ctx.cleanGeneratedWords(['fibromyalgia',' Fibromyalgia ','fibromyalg*','ab*','pain[tiab]','pain OR fever']).join('|'),'fibromyalgia|fibromyalg*');
 assert.equal(ctx.meshDescriptors('Fibrositis',{uids:['123'],123:descriptor})[0].id,'D005356');
 assert.equal(ctx.meshDescriptors('pain',{uids:['123'],123:descriptor}).length,0);
 assert.equal(ctx.meshDescriptors('Fibromyalgia',{uids:['123'],123:{...descriptor,ds_recordtype:'supplemental'}}).length,0);
 let c=seed();await ctx.verifyConcepts(new Set(['p']),new Map([['p',['fibromyalgia']]]),controller.signal,()=>{});
 assert(c.terms.includes('Fibrositis'));assert(c.terms.includes('novel syndrome'));assert(!c.terms.split('\n').includes('pain'));assert(!c.terms.split('\n').includes('FM'));assert.equal(c.mesh,'Fibromyalgia');assert(c.wordAudit.checks.some(x=>x.status==='zero-hits'));assert.equal(c.wordAudit.status,'reviewed');
 mode='badReview';c=seed();const original=c.terms;await ctx.verifyConcepts(new Set(['p']),new Map([['p',['fibromyalgia']]]),controller.signal,()=>{});assert.equal(c.terms,original);assert.equal(c.mesh,'');assert.equal(c.wordAudit.status,'draft-review-unavailable');
 mode='offline';c=seed();await ctx.verifyConcepts(new Set(['p']),new Map([['p',['fibromyalgia']]]),controller.signal,()=>{});assert(c.terms.includes('novel syndrome'));assert.equal(c.mesh,'');assert.equal(c.wordAudit.status,'partial');assert(c.wordAudit.checks.every(x=>x.status==='unavailable'));
 mode='editDuringReview';c=seed();await ctx.verifyConcepts(new Set(['p']),new Map([['p',['fibromyalgia']]]),controller.signal,()=>{});assert.equal(c.terms,'user edit');assert.equal(c.mesh,'');
 mode='array';c=seed();await ctx.verifyConcepts(new Set(['p']),new Map([['p',['fibromyalgia']]]),controller.signal,()=>{});assert.equal(c.wordAudit.status,'reviewed');
 mode='retry';reviewCalls=0;c=seed();await ctx.verifyConcepts(new Set(['p']),new Map([['p',['fibromyalgia']]]),controller.signal,()=>{});assert.equal(reviewCalls,2);assert.equal(c.wordAudit.status,'reviewed');
 mode='badCount';await assert.rejects(ctx.pubmedCount('x',controller.signal),/valid record count/);
 controller.abort();await assert.rejects(ctx.verifyConcepts(new Set(['p']),new Map([['p',['fibromyalgia']]]),controller.signal,()=>{}),{name:'AbortError'});
 console.log('PASS: source-confirmed MeSH, contextual rejection, safe truncation, zero-hit preservation, review/network failures, user-edit protection, cancellation');
})().catch(e=>{console.error(e);process.exitCode=1});
