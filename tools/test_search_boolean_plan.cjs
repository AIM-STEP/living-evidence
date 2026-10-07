const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../search-strategy.html'),'utf8');
const compiler=html.slice(html.indexOf('const PROXIMITY='),html.indexOf('\nconst wait='));
const planner=html.slice(html.indexOf('function booleanInventory('),html.indexOf('// Query validation'));
const db=html.slice(html.indexOf('const DB={'),html.indexOf('\nconst params='));
const concepts=[{id:'a',label:'Population',terms:'asthma\nwheeze\nchildren',mesh:'Asthma',sourceRule:'Children with asthma'},{id:'b',label:'Intervention',terms:'drug A',mesh:''},{id:'c',label:'Intervention alternative',terms:'drug B',mesh:''}];
const plan={root:'root',nodes:[{id:'same',op:'OR',args:['c0t0','c0t1','c0m0'],reason:'Alternative disease terms'},{id:'population',op:'AND',args:['same','c0t2'],reason:'Both disease and age required'},{id:'treatment',op:'OR',args:['c1t0','c2t0'],reason:'Either eligible treatment'},{id:'root',op:'AND',args:['population','treatment'],reason:'Population with eligible treatment'}]};
let revision='v1';
const ctx={state:{concepts,criteriaSnapshot:{rows:[{condition:'Children with asthma receiving either drug A or drug B',uncertain:'Adults only'}]},limits:{apply:true,start:'2020-01-01',end:'',language:'',other:''},databases:['pubmed','scopus']},lines:v=>String(v||'').split('\n').filter(Boolean),dq:v=>'"'+v.replace(/"/g,'')+'"',isRctDesign:()=>false,now:()=>'',draftHash:()=>revision,clone:structuredClone,lastModel:{name:'synthetic'},validateConcepts:()=>concepts,searchWordsReady:()=>true,DOMException,requestModelJSON:async(prompt)=>{assert(prompt.includes('Adults only'));return structuredClone(plan)}};
vm.createContext(ctx);vm.runInContext(db+compiler+planner+'\nglobalThis.databases=DB;',ctx);
(async()=>{
 const atoms=ctx.booleanInventory(concepts);ctx.validateBooleanPlan(plan,atoms);
 for(const id of Object.keys(ctx.databases)){const q=ctx.compileBooleanPlan(id,concepts,atoms,plan);assert(/\bAND\b/i.test(q.text));assert(/\bOR\b/i.test(q.text));assert(q.booleanAudit.plan===plan);assert(q.text.includes('children'));if(!['pubmed','europepmc','ovid'].includes(id))assert(!q.text.includes('MeSH Terms'));}
 const q=ctx.compileBooleanPlan('pubmed',concepts,atoms,plan);assert.equal((q.text.match(/Date - Publication/g)||[]).length,2);assert(q.text.includes('"drug A"[tiab]')&&q.text.includes('"drug B"[tiab]'));
 for(const mutate of [p=>p.nodes[0].args.push('invented'),p=>p.nodes[0].args.pop(),p=>p.nodes[0].args.push('c0t0'),p=>p.nodes[0].args.push('root'),p=>p.nodes[0].op='NOT']){const bad=structuredClone(plan);mutate(bad);assert.throws(()=>ctx.validateBooleanPlan(bad,atoms));}
 const result=await ctx.machineStrategies(new AbortController().signal);assert(result.pubmed.booleanAudit);
 let calls=0;ctx.requestModelJSON=async()=>++calls===1?{}:[plan];await ctx.machineStrategies(new AbortController().signal);assert.equal(calls,2);
 ctx.requestModelJSON=async()=>{revision='v2';return plan};await assert.rejects(()=>ctx.machineStrategies(new AbortController().signal),/inputs changed/);
 if(process.env.REAL_MODEL==='1'){ctx.requestModelJSON=async(prompt,schema)=>{const r=await fetch('http://127.0.0.1:8765/api/eligibility/model',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'local',messages:[{role:'system',content:'Return only the requested JSON.'},{role:'user',content:prompt}],format:schema})});if(!r.ok)throw Error('Model HTTP '+r.status);const data=await r.json();return JSON.parse(data.message.content.replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/,''))};const real=await ctx.machineStrategies(new AbortController().signal);assert(real.pubmed.booleanAudit);console.log('PASS: real local model returned valid complete Boolean plan');ctx.requestModelJSON=async()=>plan;}
 const ac=new AbortController();ac.abort();await assert.rejects(()=>ctx.machineStrategies(ac.signal),/Stopped/);
 assert(html.includes("${field==='terms'?'':`<div class=\"term-label\">"));
 console.log('PASS: model-selected nested within/across-element logic, 13 database compilers, one limits clause, audits, rejection of missing/invented/duplicate/cyclic/NOT plans, stale input and abort guards');
})().catch(e=>{console.error(e);process.exitCode=1});
