const test=require('node:test'),assert=require('node:assert/strict'),D=require('../app/proposal-materials.js'),core=require('../app/manuscript-core.js');
function source(value){const input={form:[{title:'Methods',fields:[{id:'synthesis',text:value}]}],eligibilityPreview:{includes:[{label:'Population',text:'Adults only. LAST_RULE'}],exclusions:[]},project:{projectId:'test',materials:[]},uploadedProposals:[]};return {input,text:JSON.stringify(input)};}
test('long individual form fields and complete criteria are read in bounded packets',async()=>{const calls=[],input=source('长文本方法 '.repeat(9000));const result=await D.prepare(input,{core,signal:new AbortController().signal,status(){},model:async(system,input)=>{const packet=JSON.parse(input);calls.push(packet);return {facts:[{quote:packet.text.slice(0,60),note:'Source facts'}],gaps:[]};}});assert(calls.length>1);assert(calls.some(packet=>packet.text.includes('LAST_RULE')));assert(calls.every(packet=>D.cost(packet.text)<=2200));assert.equal(result.completeAuthorInputsInAppendix,true);assert(D.cost(JSON.stringify(result))<=4500);});
test('large combined digests are reduced through additional passes, with all packets read',async()=>{const calls=[];const result=await D.prepare(source('Comprehensive author-entered methods. '.repeat(20000)),{core,signal:new AbortController().signal,status(){},model:async(system,input,schema)=>{const packet=JSON.parse(input);calls.push(packet);return {facts:Array.from({length:schema.properties.facts.maxItems},(_,index)=>index).map(()=>({quote:packet.text.slice(0,120),note:'Preserved planning detail'})),gaps:[]};}});assert(calls.some(packet=>packet.id.startsWith('PASS-')));assert(D.cost(JSON.stringify(result))<=4500);});
test('splitting preserves Unicode source text exactly',()=>{const text='Adults: 年龄≥18岁 🧑‍⚕️. '.repeat(1000),parts=D.parts(text);assert.equal(parts.join(''),text);assert(parts.every(part=>D.cost(part)<=2200));});

test('untraceable quotations are retried against the same original packet',async()=>{
 const attempts=new Map();let corrected=0;
 const result=await D.prepare(source('Author methods. '.repeat(2000)),{core,signal:new AbortController().signal,status(){},model:async(system,input)=>{
  const packet=JSON.parse(input),count=attempts.get(input)||0;attempts.set(input,count+1);
  if(!count)return {facts:[{quote:'Invented quotation absent from the source',note:'Unsupported'}],gaps:[]};
  assert(system.includes('Do not paraphrase or translate'));corrected++;
  return {facts:[{quote:packet.text.slice(0,60),note:'Verified'}],gaps:[]};
 }});
 assert(corrected>0);assert([...attempts.values()].every(count=>count===2));assert(!JSON.stringify(result).includes('Invented quotation'));
});
test('persistent quotation mismatches stop after one retry without accepting unsupported facts',async()=>{
 let calls=0;
 await assert.rejects(D.prepare(source('Author methods. '.repeat(2000)),{core,signal:new AbortController().signal,status(){},model:async()=>{calls++;return {facts:[{quote:'Invented quotation absent from the source',note:'Unsupported'}],gaps:[]};}}),/source-verified material summary after retrying/);
 assert.equal(calls,2);
});
