const test=require('node:test'),assert=require('node:assert/strict'),D=require('../app/proposal-materials.js'),core=require('../app/manuscript-core.js');
function source(value){const input={form:[{title:'Methods',fields:[{id:'synthesis',text:value}]}],eligibilityPreview:{includes:[{label:'Population',text:'Adults only. LAST_RULE'}],exclusions:[]},project:{projectId:'test',materials:[]},uploadedProposals:[]};return {input,text:JSON.stringify(input)};}
test('long individual form fields and complete criteria are read in bounded packets',async()=>{const calls=[],input=source('长文本方法 '.repeat(9000));const result=await D.prepare(input,{core,signal:new AbortController().signal,status(){},model:async(system,input)=>{const packet=JSON.parse(input);calls.push(packet);return {facts:[packet.text.slice(0,60)],gaps:[]};}});assert(calls.length>1);assert(calls.some(packet=>packet.text.includes('LAST_RULE')));assert(calls.every(packet=>D.cost(packet.text)<=2200));assert.equal(result.completeAuthorInputsInAppendix,true);assert(D.cost(JSON.stringify(result))<=4500);});
test('large combined digests are reduced through additional passes, with all packets read',async()=>{const calls=[];const result=await D.prepare(source('Comprehensive author-entered methods. '.repeat(20000)),{core,signal:new AbortController().signal,status(){},model:async(system,input,schema)=>{const packet=JSON.parse(input);calls.push(packet);return {facts:Array.from({length:schema.properties.facts.maxItems},(_,index)=>index).map(()=>packet.text.slice(0,120)),gaps:[]};}});assert(calls.some(packet=>packet.id.startsWith('PASS-')));assert(D.cost(JSON.stringify(result))<=4500);});
test('splitting preserves Unicode source text exactly',()=>{const text='Adults: 年龄≥18岁 🧑‍⚕️. '.repeat(1000),parts=D.parts(text);assert.equal(parts.join(''),text);assert(parts.every(part=>D.cost(part)<=2200));});

test('planning summaries need no verbatim quotation or citation',async()=>{
 const result=await D.prepare(source('Author methods. '.repeat(2000)),{signal:new AbortController().signal,status(){},model:async(system)=>{
  assert(system.includes('No quotations, citations'));
  return {facts:['A paraphrased prospective review plan.'],gaps:[]};
 }});
 assert(result.materials.some(item=>item.facts.includes('A paraphrased prospective review plan.')));
});

test('digest recovery is bounded and reuses completed packets on retry',async()=>{
 const cache=new Map(),seen=new Map();let fail=true;
 const options={signal:new AbortController().signal,status(){},cache,model:async(system,input)=>{
  const packet=JSON.parse(input);seen.set(packet.id,(seen.get(packet.id)||0)+1);
  if(fail&&packet.id==='AUTHOR-1')return {};
  return {facts:['Compact summary'],gaps:[]};
 }};
 const input=source('Methods. '.repeat(4000));await assert.rejects(D.prepare(input,options),/material summary.*automatic retries/);
 assert.equal(seen.get('AUTHOR-0'),1);assert.equal(seen.get('AUTHOR-1'),3);
 fail=false;await D.prepare(input,options);assert.equal(seen.get('AUTHOR-0'),1);
});
