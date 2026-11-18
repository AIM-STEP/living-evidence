const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../eligibility.html'),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const params='));
const storage=new Map(),elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{value:'',hidden:false,innerHTML:'',textContent:'',options:[{value:'Systematic Review'}],classList:{add(){},remove(){},toggle(){}},handlers:{},addEventListener(k,f){this.handlers[k]=f},setAttribute(){},getAttribute(){return null},querySelectorAll(){return []},focus(){}});return elements.get(id);}
const ctx={console,URL,URLSearchParams,AbortController,structuredClone,TextEncoder,Blob,setTimeout(){},clearTimeout(){},navigator:{},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},sessionStorage:{getItem(){return null}},
 location:{search:'?projectId=synthetic-project',href:'http://127.0.0.1:8765/eligibility.html?projectId=synthetic-project',pathname:'/eligibility.html'},document:{getElementById:el,querySelectorAll(){return []},addEventListener(){}},window:{addEventListener(){}}};
const code=source.replace('// Reuse this exact manual editor',`globalThis.criteriaTest={get:()=>state,set:s=>{state=s;fill()},pending:currentPending,generate:generateFinalCriteria,export:criteriaWordFile,apply:applyScopeSuggestion,normalized:standardizedCriteria,normalizeSuggestions:normalizeScopeSuggestions,currentSignature:()=>state.activeGenerator==='machine'?machineSourceSignature(state.machineRun?.question,state.machineRun?.reviewType,state.machineRun?.sourceRevision??0,state.machineCriteria):manualSourceSignature(),save,renderCards,updateVisibleRule};\n// Reuse this exact manual editor`);
ctx.window.AIMSTEPProjectAccess={run:fn=>fn()};
 vm.runInNewContext(code,ctx);const api=ctx.criteriaTest;
function setup(mode){const state=api.get();Object.assign(state,{activeGenerator:mode,generationMethodChoice:mode,framework:'Other',finalCriteria:null,resolvedPending:[],pendingDecisions:{},manualRefinement:null,machineRefinement:null,criteria:[{title:'Population',condition:'Adults.\nDefine the age threshold',uncertain:'Children',definition:''},{title:'Study design',condition:'Randomized trials',uncertain:'',definition:'Define the excluded study designs'}]});state.machineCriteria=structuredClone(state.criteria);state.machineRun={question:'Synthetic question',reviewType:'Systematic Review',sourceRevision:0};state.machineSourceRevision=0;state.question='Synthetic question';api.set(state);return state;}
function docXml(){const bytes=Buffer.from(api.export());let offset=0;while(bytes.readUInt32LE(offset)===0x04034b50){const size=bytes.readUInt32LE(offset+18),n=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),name=bytes.subarray(offset+30,offset+30+n).toString();const start=offset+30+n+extra;if(name==='word/document.xml')return bytes.subarray(start,start+size).toString();offset=start+size;}throw Error('Missing Word document XML');}

for(const mode of ['manual','machine']){
 const state=setup(mode);api.save();const rows=api.normalized().rows;
 const suggestions=[{item:'Optional scope: exclude case reports',kind:'proposal',domain:'Study design',text:'Case reports.',side:'exclude',reason:'Excluding case reports narrows the eligible designs.',status:'suggested'},
  {item:'Optional scope: confirmed diagnosis',kind:'proposal',domain:'Population',text:'Participants with a confirmed diagnosis.',side:'include',reason:'A confirmed diagnosis narrows the eligible population.',status:'suggested'}];
 state[mode==='machine'?'machineRefinement':'manualRefinement']={signature:api.currentSignature(),rows:rows.map(row=>({dimension:row.label,include:row.include,exclude:row.exclude})),uncertainties:['Historical question requiring a blank'],clarifications:[{item:'Historical question requiring a blank',kind:'question',required:true,domain:'Population'}],scopeSuggestions:suggestions,manuscriptParagraph:'Eligible adults and randomized trials.'};
 api.set(state);api.save();
 const markup=el('preview').innerHTML;
 assert.equal(api.pending().length,0);assert(!markup.includes('Pending clarification'));assert(!markup.includes('data-pc-'));assert(!markup.includes('<input'));assert(!markup.includes('Historical question'));
 assert(!markup.includes('Optional scope suggestions'));assert(!markup.includes('data-scope-action="adopt"'));
 assert(!api.normalized().exclusions.some(row=>row.rule.includes('Case reports')),'A proposed exclusion is initially inactive');
 assert.equal(api.apply(0,'adopt'),true);
 assert(api.normalized().exclusions.some(row=>row.rule.includes('Case reports')));assert(api.normalized().paragraph.includes('Case reports'));assert.match(docXml(),/Case reports/);
 let saved=JSON.parse(storage.get('aimstep-eligibility:synthetic-project'));assert.equal(saved.finalCriteria.decisions[0].provenance,'author-decision');
 api.set(saved);const refinement=api.get()[mode==='machine'?'machineRefinement':'manualRefinement'];refinement.descriptionEditedByAuthor=true;refinement.manuscriptParagraph='Author-written Description that must stay unchanged when keeping the draft.';api.save();assert(!el('preview').innerHTML.includes('data-scope-index="0"'));assert.equal(api.apply(0,'adopt'),false,'A repeated click cannot duplicate the saved rule');
 const before=JSON.stringify(api.get()),stored=storage.get('aimstep-eligibility:synthetic-project'),write=ctx.localStorage.setItem;
 ctx.localStorage.setItem=()=>{throw Error('Synthetic quota failure')};
 assert.equal(api.apply(1,'keep'),false);assert.equal(JSON.stringify(api.get()),before);assert.equal(storage.get('aimstep-eligibility:synthetic-project'),stored);
 ctx.localStorage.setItem=write;
 const currentRows=JSON.stringify(mode==='machine'?api.get().machineCriteria:api.get().criteria);
 assert.equal(api.apply(1,'keep'),true);assert.equal(JSON.stringify(mode==='machine'?api.get().machineCriteria:api.get().criteria),currentRows,'Keeping the draft creates no complementary rule');
 assert(!el('preview').innerHTML.includes('Optional scope suggestions'));assert.doesNotMatch(docXml(),/Ignored suggestion/);assert.equal(api.normalized().paragraph,'Author-written Description that must stay unchanged when keeping the draft.');
 assert.equal(api.get().finalCriteria.decisions.length,2);assert.equal(api.pending().length,0);
 const summary=JSON.parse(storage.get('aimstep-eligibility-summary:synthetic-project'));assert(summary.exclusions.some(row=>row.text.includes('Case reports')));
}
const types=['Population','Study design','Comparison'].map(title=>({title}));
const normalize=api.normalizeSuggestions;
assert.equal(normalize([{dimension:'Population',rule:'Enter the age ____',side:'include',reason:'Age changes scope.',priority:'important'}],types).length,0);
assert.equal(normalize([{dimension:'Study design',rule:'Randomized trials.',side:'include',reason:'Optional convenience.',priority:'optional'}],types).length,0);
const input=types.map(type=>({dimension:type.title,rule:type.title==='Population'?'Participants with a confirmed diagnosis.':type.title==='Study design'?'Randomized trials only.':'Concurrent control groups.',side:'include',reason:'This restriction materially changes eligible studies.',priority:'important'}));
assert.equal(normalize(input,types).length,2,'At most two important complete proposals are displayed');
assert(!html.includes('function pendingEditor('));assert(!html.includes('data-pc-rule='));assert(!html.includes('Automatic check notes</span>'));
console.log('PASS: direct results without required forms, at most two optional complete suggestions, side-preserving adoption, dismissal without complements, visible Description/export/handoff, persistence, rollback and duplicate-click protection');
