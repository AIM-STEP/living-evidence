const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../full-text-screening.html'),'utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes('const FT_PROMPT'));
const disk=new Map(),reads=[];
function session(){
 const elements=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',hidden:false,style:{},dataset:{},classList:{toggle(){}},setAttribute(){},querySelector(){return {textContent:''}},querySelectorAll(){return []},closest(){return {classList:{toggle(){}}}},addEventListener(){}});return elements.get(id);}
 const sandbox={console,URL,URLSearchParams,AbortController,DOMException,structuredClone,Blob,Map,Set,performance,
  setTimeout(){return 1},clearTimeout(){},setInterval(){return 1},localStorage:{getItem(){return null},setItem(){}},navigator:{},
  location:{href:'https://aimsetp.com/full-text-screening.html?projectId=synthetic-reload',search:'?projectId=synthetic-reload',hostname:'aimsetp.com'},
  document:{addEventListener(){},getElementById:el,querySelectorAll(){return []},body:{dataset:{}}},window:{addEventListener(){}},
  read(db,key){reads.push([db,key]);return structuredClone(disk.get(db+'|'+key)||null)},write(db,value){disk.set(db+'|'+value.id,structuredClone(value))}};
 const expose=`
 openDB=async name=>name;
 getProject=async db=>globalThis.read(db,scope);
 getKey=async(db,key)=>globalThis.read(db,key);
 putProject=async(db,value)=>globalThis.write(db,value);
 readHandoff=async()=>null;
 publishSummary=()=>{};scheduleRetrieval=()=>{};
 render=()=>renderSource();
 globalThis.ft={init,defaults,get:()=>workspace,save,hasOriginalPdf,loadDoc,fulltextFilename,retrievalDue,el:id=>$(id)};
 `;
 vm.runInNewContext(script.replace(/\ninit\(\);/,expose),sandbox);
 return sandbox;
}
(async()=>{
 const first=session(),state=first.ft.defaults();
 state.records=Array.from({length:35},(_,i)=>({uid:'r'+i,title:'Synthetic reload report '+i,doi:'10.1234/reload'+i,authors:[],year:'2026'}));
 const pdf=new Blob(['%PDF-1.7 synthetic original persisted bytes'],{type:'application/pdf'});
 for(const r of state.records){state.docs[r.uid]={kind:'pdf',filename:r.uid+'.pdf',source:'Uploaded locally',hash:'saved'};disk.set('aimstep-fulltext-docs|synthetic-reload|'+r.uid,{uid:r.uid,kind:'pdf',pdf,chunks:[],fullText:'Synthetic text'});}
 // XML is readable evidence, but is not an original PDF.
 state.docs.r1.kind='xml';disk.get('aimstep-fulltext-docs|synthetic-reload|r1').pdf=null;
 // No pilot exists: all 34 saved PDFs must still be restored, including hidden rows.
 disk.set('aimstep-fulltext|synthetic-reload',{id:'synthetic-reload',state});
 for(let cycle=0;cycle<2;cycle++){
  const s=cycle===0?first:session();await s.ft.init();
  assert.equal(s.document.body.dataset.ready,'true');
  assert.equal(s.ft.get().records.length,35);
  assert.match(s.ft.el('source-counts').innerHTML,/With PDF 34/);
  assert.equal(s.ft.hasOriginalPdf('r34'),true,'Restore PDFs beyond the first 30 displayed records');
  assert.equal(s.ft.hasOriginalPdf('r1'),false);
  assert.equal(s.ft.retrievalDue(s.ft.get().records[34]),false,'Do not redownload a persisted PDF after refresh');
  assert.equal(s.ft.fulltextFilename('r0'),'r0.pdf');
  assert.equal(await (await s.ft.loadDoc('r34')).pdf.text(),await pdf.text());
  assert.match(s.ft.el('doc-rows').innerHTML,/data-original-pdf="r0"/);
  await s.ft.save();
 }
 assert(reads.every(([,key])=>key.startsWith('synthetic-reload')),'Do not read another project');
 console.log('PASS: fresh sessions restore all saved PDFs without a pilot, preserve original bytes/names, count XML correctly and skip redownloads');
})().catch(e=>{console.error(e);process.exitCode=1});
