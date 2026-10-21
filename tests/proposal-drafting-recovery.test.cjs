const test=require('node:test'),assert=require('node:assert/strict'),D=require('../app/proposal-drafting.js');
const options={instructions:'Draft the requested sections.',input:'Author material',ids:['title','rationale'],signal:new AbortController().signal};
test('keeps completed sections and repairs only the missing one',async()=>{
 const calls=[];const result=await D.generateSections({...options,model:async(prompt,input,schema)=>{const ids=schema.properties.sections.items.properties.id.enum;calls.push(ids);return calls.length===1?{sections:[{id:'title',text:'Original title'}]}:{sections:[{id:'rationale',text:'Recovered rationale'}],issues:[]};}});
 assert.deepEqual(calls,[['title','rationale'],['rationale']]);assert.equal(result.sections[0].text,'Original title');assert.equal(result.sections[1].text,'Recovered rationale');
});
test('repairs empty or duplicate sections and ignores unrequested sections',async()=>{
 let calls=0;const result=await D.generateSections({...options,model:async(prompt,input,schema)=>{calls++;return {sections:calls===1?[{id:'title',text:''},{id:'rationale',text:'one'},{id:'rationale',text:'two'},{id:'unrequested',text:'Extra'}]:schema.properties.sections.items.properties.id.enum.map(id=>({id,text:'Recovered '+id})),issues:[]};}});
 assert.equal(calls,3);assert.deepEqual(result.sections.map(row=>row.id),options.ids);
});
test('recovers malformed model JSON with smaller single-section requests',async()=>{
 let calls=0;const result=await D.generateSections({...options,model:async(prompt,input,schema)=>{if(++calls===1)throw Object.assign(Error('Truncated JSON'),{code:'MODEL_JSON_INVALID'});return {sections:schema.properties.sections.items.properties.id.enum.map(id=>({id,text:'Recovered'})),issues:[]};}});assert.equal(result.sections.length,2);assert.equal(calls,3);
});
test('persistent missing sections stop after bounded retries',async()=>{
 let calls=0;await assert.rejects(D.generateSections({...options,model:async()=>{calls++;return {sections:[],issues:[]};}}),/title.*automatic retries/);assert.equal(calls,3);
});
test('transport failures and Stop propagate without extra calls',async()=>{
 for(const error of [Error('Model unavailable'),new DOMException('Stopped','AbortError')]){let calls=0;await assert.rejects(D.generateSections({...options,model:async()=>{calls++;throw error;}}),value=>value===error);assert.equal(calls,1);}
});
