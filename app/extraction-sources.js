(function(root){
'use strict';
function merge(records,incoming,numbers={next:1,byUid:{}}){
 const map=new Map(records.map(r=>[r.uid,r]));
 const upstream=incoming.map(r=>({...map.get(r.uid),...r,extractionOrigin:'fulltext'}));
 const ids=new Set(upstream.map(r=>r.uid));
 const result=[...upstream,...records.filter(r=>r.extractionOrigin==='local'&&!ids.has(r.uid))];
 numbers=structuredClone(numbers);numbers.byUid??={};
 numbers.next=Math.max(numbers.next||1,...Object.values(numbers.byUid).filter(Number.isSafeInteger).map(n=>n+1),...result.map(r=>Number.isSafeInteger(r.sourceNumber)?r.sourceNumber+1:1));
 for(const r of result){if(r.extractionOrigin==='fulltext'&&Number.isSafeInteger(r.sourceNumber))numbers.byUid[r.uid]=r.sourceNumber;if(!numbers.byUid[r.uid])numbers.byUid[r.uid]=numbers.next++;r.sourceNumber=numbers.byUid[r.uid];}
 return {records:result,numbers};
}
async function readPdf(file){
 if(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf')throw Error('Choose a PDF file.');
 const bytes=await file.arrayBuffer();
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const lib=await import(new URL('../vendor/pdfjs/pdf.min.mjs',document.currentScript?.src||new URL('app/extraction-sources.js',location.href)).href);
 lib.GlobalWorkerOptions.workerSrc=new URL('vendor/pdfjs/pdf.worker.min.mjs',location.href).href;
 const pdf=await lib.getDocument({data:new Uint8Array(bytes)}).promise;
 try{
  const metadata=await pdf.getMetadata().catch(()=>({})),pages=[];
  for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n),content=await page.getTextContent();pages.push({page:n,text:content.items.map(it=>(it.str||'')+(it.hasEOL?'\n':' ')).join('').normalize('NFKC')});page.cleanup();}
  const chunks=[];for(const p of pages){const sentences=p.text.replace(/\s+/g,' ').trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[];const bounded=sentences.flatMap(s=>s.match(/[\s\S]{1,450}/g)||[]);for(let i=0;i<bounded.length;i+=2){const text=bounded.slice(i,i+4).join(' ').trim();if(text)chunks.push({id:'C'+(chunks.length+1),page:p.page,section:'Body',text});}}
  const first=pages.slice(0,2).map(p=>p.text).join('\n'),info=metadata.info||{};
  const uid='extraction-local-'+hash;
  const record={uid,contentHash:hash,extractionOrigin:'local',title:String(info.Title||'').trim()||file.name.replace(/\.pdf$/i,''),authors:info.Author?[String(info.Author)]:[],year:'',journal:'',abstract:'',doi:(first.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i)||[''])[0].replace(/[.,;]+$/,''),fullText:{kind:'pdf',source:'Uploaded locally',filename:file.name,chunks:chunks.length,readable:!!chunks.length}};
  return {record,doc:{uid,kind:'pdf',source:'Uploaded locally',filename:file.name,pdf:file,chunks,fullText:pages.map(p=>p.text).join('\n'),evidence:null}};
 }finally{await pdf.destroy();}
}
const api={merge,readPdf};if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepExtractionSources=api;
})(globalThis);
