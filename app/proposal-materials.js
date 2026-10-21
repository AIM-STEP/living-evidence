/* Read arbitrarily long author material in bounded model packets. Every packet
 * is processed; complete author inputs and criteria remain available for the PDF.
 */
(function(root){
'use strict';
const str={type:'string',maxLength:120},schema={type:'object',properties:{facts:{type:'array',maxItems:4,items:{type:'object',properties:{quote:str,note:{type:'string',maxLength:40}},required:['quote','note']}},gaps:{type:'array',maxItems:2,items:{type:'string',maxLength:80}}},required:['facts','gaps']};
function cost(text){let value=0;for(const char of text)value+=char.codePointAt(0)>127?2:1/3;return value;}
function parts(text,limit=2200){const out=[];let value='',budget=0;for(const char of text){const size=char.codePointAt(0)>127?2:1/3;if(budget+size>limit&&value){out.push(value);value='';budget=0;}value+=char;budget+=size;}if(value)out.push(value);return out;}
async function prepare(source,{model,signal,status,core}){
 if(source.text.length<=16000&&cost(source.text)<=4500)return {...source.input};
 const materials=[{id:'AUTHOR',stage:'Current author form: authoritative',data:source.input.form},{id:'CRITERIA',stage:'Current complete inclusion and exclusion criteria: authoritative',data:source.input.eligibilityPreview},...source.input.project.materials.filter(item=>item.stage!=='Eligibility criteria'),...source.input.uploadedProposals.map((file,index)=>({id:'UPLOAD-'+index,stage:'Uploaded proposal: '+file.name,data:{text:file.text}}))];
 let packets=materials.flatMap(item=>parts(JSON.stringify(item.data)).map((text,index)=>({id:item.id+'-'+index,stage:item.stage,text}))),round=0;
 for(;;){
  round++;const digests=[],factLimit=Math.max(1,5-round),responseSchema={...schema,properties:{...schema.properties,facts:{...schema.properties.facts,maxItems:factLimit}}};
  for(let index=0;index<packets.length;index++){
   if(signal.aborted)throw new DOMException('Stopped','AbortError');
   status('Reading project materials: pass '+round+', '+(index+1)+' / '+packets.length+'…');
   const packet=packets[index],instructions='Extract a compact planning digest from EVERY supplied material fragment. Keep review questions, eligibility logic, negations, thresholds, dates, methods, outcomes, platforms and unresolved decisions. Distinguish authoritative current form/criteria, completed work and unconfirmed older proposals. Facts must quote exact contiguous substrings of packet.text; notes may only explain the quoted source. A JSON fragment can start mid-field: do not invent context. Use at most '+factLimit+' facts; quotes at most 120 characters and notes at most 40 characters. Use gaps to identify details that need the complete source appendix. The final PDF preserves all author-entered form text and full eligibility criteria verbatim, so concise synthesis must not claim to replace the authoritative appendix.';
   let value=await model(instructions,JSON.stringify(packet),responseSchema,signal);
   const valid=value=>Array.isArray(value?.facts)&&value.facts.length<=factLimit&&value.facts.every(fact=>typeof fact.quote==='string'&&!!fact.quote.trim()&&fact.quote.length<=120&&packet.text.includes(fact.quote)&&typeof fact.note==='string'&&fact.note.length<=40)&&Array.isArray(value.gaps)&&value.gaps.length<=2&&value.gaps.every(gap=>typeof gap==='string'&&gap.length<=80);
   if(!valid(value))value=await model(instructions+' The previous response failed validation: a quotation was not an exact substring of packet.text or a schema size constraint was exceeded. Copy quotations character for character from packet.text, preserving punctuation, whitespace and literal backslashes. Do not paraphrase or translate quotations. If no reliable quotation is available, return an empty facts array and explain the missing detail in gaps. Strictly follow every size constraint in the response schema.',JSON.stringify(packet),responseSchema,signal);
   if(!valid(value))throw Error('The model could not produce a source-verified material summary after retrying. Your full inputs are saved; try Generate again.');
   const digest=core.facts(value,packet);digests.push({id:digest.id,stage:digest.stage,facts:digest.facts,gaps:digest.gaps});
  }
  const result={projectId:source.input.project.projectId,materials:digests,completeAuthorInputsInAppendix:true},text=JSON.stringify(result);
  if(cost(text)<=4500&&text.length<=16000)return result;
  // Balanced reduction rereads every digest, rather than discarding late packets.
  packets=parts(text).map((text,index)=>({id:'PASS-'+round+'-'+index,stage:'Source-grounded combined planning material',text}));
 }
}
const api={prepare,cost,parts};if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepProposalMaterials=api;
})(globalThis);
