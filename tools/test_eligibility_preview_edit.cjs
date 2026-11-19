const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../eligibility.html'),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const params='));
const storage=new Map(),elements=new Map(),documentEvents=new Map();
function el(id){if(!elements.has(id))elements.set(id,{value:'',hidden:false,innerHTML:'',textContent:'',options:[{value:'Systematic Review'}],classList:{add(){},remove(){},toggle(){}},handlers:{},addEventListener(k,f){this.handlers[k]=f},setAttribute(){},getAttribute(){return null},querySelector(){return {textContent:''}},querySelectorAll(){return []},replaceChildren(){},focus(){}});return elements.get(id);}
const ctx={console,URL,URLSearchParams,AbortController,structuredClone,TextEncoder,Blob,setTimeout(){},clearTimeout(){},navigator:{},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},sessionStorage:{getItem(){return null}},
 location:{search:'?projectId=synthetic-project',href:'http://127.0.0.1:8765/eligibility.html?projectId=synthetic-project',pathname:'/eligibility.html'},document:{getElementById:el,querySelectorAll(){return []},addEventListener(type,handler){documentEvents.set(type,handler)}},window:{addEventListener(){},AimstepEligibilityLibrary:require('../app/eligibility-library.js'),AimstepEligibilityReset:require('../app/eligibility-reset.js'),AIMSTEPEligibilityMethodology:require('../app/eligibility/methodology.js')}};
const code=source.replace('// Reuse this exact manual editor',`globalThis.criteriaTest={get:()=>state,set:s=>{previewDirty=false;state=s;fill()},pending:currentPending,generate:generateFinalCriteria,export:criteriaWordFile,savePreviewEdits,clearPreviewCriteria,dirty(){previewDirty=true},normalized:standardizedCriteria,exportState:()=>({dirty:previewDirty}),save,renderCards,updateVisibleRule};\n// Reuse this exact manual editor`);
ctx.window.AIMSTEPProjectAccess={run:fn=>fn()};
 vm.runInNewContext(code,ctx);const api=ctx.criteriaTest;
function setup(mode){const state=api.get();Object.assign(state,{activeGenerator:mode,generationMethodChoice:mode,framework:'Other',finalCriteria:null,resolvedPending:[],pendingDecisions:{},manualRefinement:null,machineRefinement:null,criteria:[{title:'Population',condition:'Adults.\nDefine the age threshold',uncertain:'Children',definition:''},{title:'Study design',condition:'Randomized trials',uncertain:'',definition:'Define the excluded study designs'}]});state.machineCriteria=structuredClone(state.criteria);state.machineRun={question:'Synthetic question',reviewType:'Systematic Review',sourceRevision:0};state.machineSourceRevision=0;state.question='Synthetic question';api.set(state);return state;}
function docXml(){const bytes=Buffer.from(api.export());let offset=0;while(bytes.readUInt32LE(offset)===0x04034b50){const size=bytes.readUInt32LE(offset+18),n=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),name=bytes.subarray(offset+30,offset+30+n).toString();const start=offset+30+n+extra;if(name==='word/document.xml')return bytes.subarray(start,start+size).toString();offset=start+size;}throw Error('Missing Word document XML');}

function edit(nodes,textNodes=[]){
 el('preview').querySelectorAll=selector=>selector==='[data-criteria-row]'?nodes:selector==='[data-criteria-text]'?textNodes:[];
 api.dirty();
}
const node=(index,kind,position,text)=>({dataset:{criteriaRow:String(index),criteriaKind:kind,criteriaRule:String(position)},innerText:text});
for(const mode of ['manual','machine']){
 let state=setup(mode);
 // Previously confirmed rules remain editable without reopening a questionnaire.
 const confirmedRows=mode==='machine'?state.machineCriteria:state.criteria;
 confirmedRows[0].condition='Adults.\nAdults aged 21 or older.';confirmedRows[1].uncertain='Case reports';
 state.finalCriteria={decisions:[{domain:'Population',decision:'meets',rule:'Adults aged 21 or older.'},{domain:'Study design',decision:'fails',rule:'Case reports.'}]};
 api.set(state);api.save();
 const before=structuredClone(api.get());
 assert.match(el('preview').innerHTML,/contenteditable="plaintext-only"/);
 edit([node(0,'include',0,'Participants with active Fibromyalgia.\nParticipants taking stable medication.\nAdults aged 21 or older.'),node(0,'exclude',0,'Pregnant participants.')]);
 assert.equal(api.savePreviewEdits(),true);
 let saved=JSON.parse(storage.get('aimstep-eligibility:synthetic-project'));
 const rows=mode==='machine'?saved.machineCriteria:saved.criteria;
 assert.match(rows[0].condition,/active Fibromyalgia/);assert.match(rows[0].condition,/Adults aged 21/);
 assert.match(rows[0].uncertain,/Pregnant/);
 assert(el('preview').innerHTML.includes('Adults aged 21'));assert(el('preview').innerHTML.includes('Case reports'));
 assert.match(docXml(),/active Fibromyalgia/);assert.match(docXml(),/Adults aged 21/);assert.match(docXml(),/Case reports/);
 const shared=JSON.parse(storage.get('aimstep-eligibility-summary:synthetic-project'));assert(shared.includes.some(r=>r.text.includes('active Fibromyalgia')));
 api.set(saved);assert.match(el('preview').innerHTML,/active Fibromyalgia/);
 // A failed storage write keeps the persisted/source criteria and editable draft intact.
 const prior=JSON.stringify(api.get()),persisted=storage.get('aimstep-eligibility:synthetic-project');
 edit([node(0,'include',0,'Synthetic replacement that must not be lost.')]);
 const write=ctx.localStorage.setItem;ctx.localStorage.setItem=()=>{throw Error('Synthetic quota failure')};
 assert.equal(api.savePreviewEdits(),false);assert.equal(JSON.stringify(api.get()),prior);assert.equal(storage.get('aimstep-eligibility:synthetic-project'),persisted);assert.equal(api.exportState().dirty,true);
 ctx.localStorage.setItem=write;assert.equal(api.savePreviewEdits(),true);assert.match(docXml(),/Synthetic replacement/);
 // Edited text must be escaped on rerender, never inserted as markup.
 edit([node(0,'include',0,'<img src=x onerror=alert(1)> Synthetic text.')]);assert.equal(api.savePreviewEdits(),true);assert(!el('preview').innerHTML.includes('<img'));assert.match(el('preview').innerHTML,/&lt;img/);
}
// Confirmed-only domains stay visible; editing the next domain uses its actual index.
let state=setup('machine');state.machineCriteria.unshift({title:'Other',condition:'Hidden custom rule.',uncertain:'',definition:''});state.finalCriteria={decisions:[{domain:'Other',decision:'meets',rule:'Hidden custom rule.'}]};api.set(state);
assert.match(el('preview').innerHTML,/Hidden custom rule/);edit([node(1,'include',0,'Visible population update.')]);assert.equal(api.savePreviewEdits(),true);
assert.equal(api.get().machineCriteria[0].condition,'Hidden custom rule.');assert.match(api.get().machineCriteria[1].condition,/Visible population update/);

// Topic/paragraph edits are persisted and exported; Next also commits pending edits.
state=setup('machine');
edit([node(0,'include',0,'Adults with active Fibromyalgia.')],[{dataset:{criteriaText:'topic'},innerText:'Synthetic custom review topic'},{dataset:{criteriaText:'paragraph'},innerText:'Synthetic edited manuscript wording.'}]);
let prevented=false;el('next-search-strategy').handlers.click({preventDefault(){prevented=true}});
assert.equal(prevented,false);assert.match(docXml(),/Synthetic custom review topic/);assert.match(docXml(),/Synthetic edited manuscript wording/);
// Every shared navigation action must save edits and stay put on a storage error.
edit([node(0,'include',0,'Saved before jumping to another tool.')]);
documentEvents.get('aimstep:before-tool-navigation')({preventDefault(){throw Error('Save should succeed')}});
assert.match(docXml(),/Saved before jumping to another tool/);
const workingWrite=ctx.localStorage.setItem;ctx.localStorage.setItem=()=>{throw Error('Synthetic storage failure')};
prevented=false;el('next-search-strategy').handlers.click({preventDefault(){prevented=true}});
assert.equal(prevented,true,'Next must not leave after a failed save');
prevented=false;documentEvents.get('aimstep:before-tool-navigation')({preventDefault(){prevented=true}});
assert.equal(prevented,true,'Step picker and return navigation must not leave after a failed save');
ctx.localStorage.setItem=workingWrite;
const trace=[{id:'source-1',proposition:'Synthetic source rule',used:true}];api.get().machineRefinement.trace=trace;api.set(api.get());
edit([node(0,'include',0,'Adults receiving stable medication.')]);assert.equal(api.savePreviewEdits(),true);
assert.equal(JSON.stringify(api.get().machineRefinement.trace),JSON.stringify(trace));assert(!el('preview').innerHTML.includes('Intermediate draft trace'));
// Clear is explicit, cancellation is inert, failed persistence keeps edits, and reload stays clear.
for(const mode of ['manual','machine']){
 state=setup(mode);const beforeClear=JSON.stringify(api.get());
 ctx.confirm=()=>false;assert.equal(api.clearPreviewCriteria(),false);assert.equal(JSON.stringify(api.get()),beforeClear);
 ctx.confirm=()=>true;
 const write=ctx.localStorage.setItem;ctx.localStorage.setItem=()=>{throw Error('Synthetic storage failure')};
 assert.equal(api.clearPreviewCriteria(),false);assert.equal(JSON.stringify(api.get()),beforeClear);
 ctx.localStorage.setItem=write;
 edit([node(0,'include',0,'Unsaved change to discard only after confirmation.')]);
 assert.equal(api.clearPreviewCriteria(),true);assert.equal(api.exportState().dirty,false);
 const saved=JSON.parse(storage.get('aimstep-eligibility:synthetic-project'));
 assert.equal((mode==='machine'?saved.machineCriteria:saved.criteria).length,0);assert.equal(saved.question,'Synthetic question');assert.equal(saved.criteriaClearHistory,undefined);assert(!JSON.stringify(saved).includes('Adults'));
 assert.equal(storage.has('aimstep-eligibility-summary:synthetic-project'),false);
 api.set(saved);assert.equal(el('save-criteria').hidden,true);assert.equal(el('clear-criteria').hidden,false);
}
state=setup('machine');
// A source change must not be overwritten by an older preview draft.
edit([node(0,'include',0,'Stale preview text.')]);api.get().machineCriteria[0].condition='New source criterion.';
assert.equal(api.savePreviewEdits(),false);assert.equal(api.get().machineCriteria[0].condition,'New source criterion.');
assert(html.indexOf('id="save-criteria"')<html.indexOf('id="download"'));assert(!html.includes('Download criteria'));assert(html.indexOf('id="download"')<html.indexOf('id="clear-criteria"'));assert(!/<h3(?:\s[^>]*)?>Inclusion criteria<\/h3>/.test(html));assert.match(html,/<h3(?:\s[^>]*)?>Inclusion<\/h3>/);
{
 const project=setup('machine');
 project.framework='PICOS';
 project.machineCriteria=[
  {title:'Context',condition:'Inpatient wards.',uncertain:'Community clinics.'},
  {title:'Population',condition:'Adults with asthma.'},
  {title:'Other',condition:'At least two follow-up visits.'},
  {title:'Study design',condition:'Randomized trials.'},
 ];
 api.set(project);
 const displayed=el('preview').innerHTML.split('>Description</h3>');
 assert(!displayed[0].includes('>Other:</strong>')&&!displayed[0].includes('>Context:</strong>'));
 assert(displayed[0].includes('>Study design:</strong>')&&/inpatient wards/i.test(displayed[1]));
 const document=docXml(),table=document.split('<w:tbl>')[1].split('</w:tbl>')[0];
 assert(!/>(Other|Context|Limits)</.test(table));assert(/>Study design</.test(table));
 assert.match(document.split('>Description<')[1],/community clinics/i);
 edit([node(0,'include',0,'Adults aged 21 years or older with asthma.')]);
 assert(api.savePreviewEdits());assert.equal(api.get().machineCriteria[0].condition,'Inpatient wards.');
 assert.match(api.get().machineCriteria[1].condition,/21 years/);
 const share=JSON.parse(storage.get('aimstep-eligibility-summary:synthetic-project'));
 assert(!share.includes.some(row=>['Other','Context'].includes(row.label)));assert.match(share.paragraph,/two follow-up visits/i);
 assert(share.screeningCriteria.includes.some(r=>r.label==='Other'&&r.text.includes('two follow-up visits')));
 const protocol=fs.readFileSync(path.join(__dirname,'../app/protocol-workspace.js'),'utf8');
 const protocolReader=protocol.slice(protocol.indexOf('function savedManualCriteria()'),protocol.indexOf('function renderManualCriteria()'))+'\nsavedManualCriteria();';
 const protocolCriteria=()=>vm.runInNewContext(protocolReader,{URL,localStorage:ctx.localStorage,manualCriteriaLink:()=>ctx.location.href,projectDeleted:()=>false});
 let protocolRules=protocolCriteria();
 assert(protocolRules.includes.some(r=>r.label==='Context'&&r.text.includes('Inpatient wards')));
 assert(protocolRules.exclusions.some(r=>r.domain==='Context'&&r.text.includes('Community clinics')));
 const persistedWorkspace=storage.get('aimstep-eligibility:synthetic-project'),newer=JSON.parse(persistedWorkspace);
 newer.machineCriteria[0].condition='Regional hospitals.';newer.machineCriteria[0].uncertain='Remote clinics.';
 storage.set('aimstep-eligibility:synthetic-project',JSON.stringify(newer));
 protocolRules=protocolCriteria();
 assert(protocolRules.includes.some(r=>r.label==='Context'&&r.text==='Regional hospitals.'));
 assert(protocolRules.exclusions.some(r=>r.domain==='Context'&&r.text==='Remote clinics.'));
 storage.set('aimstep-eligibility:synthetic-project',persistedWorkspace);
 const storedRows=structuredClone(project.machineCriteria);
 const manual=setup('manual');
 manual.framework='PCC';manual.criteria=[{title:'Context',condition:'Rural primary care.'},{title:'Other',condition:'Prospective registration.'}];manual.language='English';
 api.set(manual);
 assert(el('criteria-list').innerHTML.includes('Rural primary care'));assert(!el('criteria-list').innerHTML.includes('Prospective registration'));
 assert(el('description-criteria-list').innerHTML.includes('Prospective registration'));
 const projected=el('preview').innerHTML.split('>Description</h3>');assert(projected[0].includes('>Context:</strong>'));
 assert(!projected[0].includes('>Other:</strong>')&&!projected[0].includes('>Limits:</strong>'));
 assert.match(projected[1],/prospective registration/i);assert.match(projected[1],/english/i);
 const checked=setup('machine');checked.framework='PICOS';checked.machineCriteria=storedRows;
 api.set(checked);edit([],[{dataset:{criteriaText:'paragraph'},innerText:'Published clinical wording. Studies must take place in inpatient wards.'}]);
 assert(api.savePreviewEdits());const editedParagraph=el('preview').innerHTML.split('>Description</h3>')[1];
 assert(editedParagraph.includes('Published clinical wording.'));assert.equal((editedParagraph.match(/inpatient wards/gi)||[]).length,1);assert.match(editedParagraph,/two follow-up visits/i);
 const view=api.get().machineRefinement;
 view.frameworkSlots=[];
 view.frameworkQuestions=[
  {display_number:'RQ1',framework:'PICOS',frameworkSlots:['Population','Intervention','Comparison','Outcomes','Study design'],rows:[{dimension:'Population',include:['Adults.'],exclude:[]},{dimension:'Context',include:['District hospitals.'],exclude:[]}]},
  {display_number:'RQ2',framework:'PCC',frameworkSlots:['Population','Concept','Context'],rows:[{dimension:'Context',include:['School clinics.'],exclude:[]}]},
 ];
 api.set(api.get());const sections=el('preview').innerHTML.split('>Description</h3>');
 assert(sections[0].includes('RQ1 · Population')&&sections[0].includes('RQ2 · Context'));
 assert(!sections[0].includes('RQ1 · Context')&&!sections[0].includes('District hospitals')&&!sections[0].includes('data-criteria-row='));
 assert.match(sections[1],/district hospitals/i);assert(docXml().includes('RQ2 · Context'));
}
console.log('PASS: editable criteria save/export/handoff/reload, framework-only rows, retained additional conditions, failed-save retry and source-index mapping');

{
 const project=setup('machine'),rules=[
  'Studies of oxygen saturation targeting.',
  'Studies not taking place in the delivery room.',
  'Studies of infants with antenatally diagnosed congenital anomalies.'
 ];
 project.framework='PICOS';
 project.machineCriteria=[{title:'Other',uncertain:rules[0]},{title:'Context',uncertain:rules[1]},
  {title:'Population',condition:'Term or late preterm infants.',uncertain:rules[2]}];
 api.set(project);
 const exclusions=el('preview').innerHTML.split('>Exclusion</h3>')[1].split('</section>')[0];
 const table=docXml().split('<w:tbl>')[1].split('</w:tbl>')[0];
 for(const rule of rules){assert(exclusions.includes(rule),rule);assert(table.includes(rule),rule);}
 assert(!exclusions.includes('>Context:</strong>')&&!exclusions.includes('>Other:</strong>'));
 assert(!/>(Other|Context)</.test(table));
 assert(!/No explicit exclusion|See Description/.test(exclusions));
 const share=JSON.parse(storage.get('aimstep-eligibility-summary:synthetic-project'));
 for(const rule of rules){
  assert(share.exclusions.some(item=>item.text.includes(rule)));
  assert(share.screeningCriteria.exclusions.some(item=>item.text.includes(rule)));
 }
 const edited='Studies conducted outside the delivery room.';
 // The displayed Context exclusion follows Population and Other, while its
 // underlying source row is between them.
 edit([node(2,'exclude',0,edited)]);assert(api.savePreviewEdits());
 assert.equal(api.get().machineCriteria[1].uncertain,edited);
 assert.equal(api.get().machineCriteria[0].uncertain,rules[0]);
 assert.equal(api.get().machineCriteria[2].uncertain,rules[2]);
 assert(docXml().split('<w:tbl>')[1].split('</w:tbl>')[0].includes(edited));
}

// Search embeds the actual preview; raw input and polished display must not diverge.
const previewContext={...ctx,location:{...ctx.location,search:'?projectId=synthetic-project&embedded=search-criteria-preview'},document:{...ctx.document,documentElement:{classList:{add(){}}}},window:{addEventListener(){},AimstepEligibilityLibrary:require('../app/eligibility-library.js'),AimstepEligibilityReset:require('../app/eligibility-reset.js'),AIMSTEPEligibilityMethodology:require('../app/eligibility/methodology.js')}};
previewContext.window.AIMSTEPProjectAccess={run:fn=>fn()};
vm.runInNewContext(source,previewContext);
const embedded=previewContext.window.aimstepCriteriaPreview;
for(const mode of ['manual','machine']){
 const sample=setup(mode);
 sample.finalCriteria=null;sample.pendingDecisions={};sample.resolvedPending=[];
 api.set(sample);
 const originalHtml=el('preview').innerHTML,beforeStorage=JSON.stringify([...storage]);
 embedded.load(JSON.parse(JSON.stringify(sample)));
 assert.equal(el('preview').innerHTML,originalHtml,'embedded preview must use exactly the first-tool renderer');
 el('preview').querySelectorAll=selector=>selector==='[data-criteria-row]'?[node(0,'include',0,'Synthetic synchronized exact wording.')]:[];
 el('preview').handlers.input({target:{closest:()=>true}});
 const prepared=embedded.read();
 assert.match(prepared.workspace[mode==='machine'?'machineCriteria':'criteria'][0].condition,/synchronized exact wording/);
 assert(prepared.summary.includes.some(row=>row.text.includes('synchronized exact wording')));
 assert.equal(JSON.stringify([...storage]),beforeStorage,'embedded edits must stay isolated until parent commits');
}
console.log('PASS: identical standalone/embedded previews in both modes, prepared summary, isolated editing');
const isolated=embedded.read().workspace,storedBefore=JSON.stringify([...storage]);
previewContext.window.AIMSTEPCriteriaRelease=require('../app/eligibility-release.js');
isolated.machineRefinement.sourceConfirmations=[{backgroundIssue:true,issue_id:'older-snapshot',status:'suggested',domain:'Population',side:'include',text:'Which boundary applies?',options:[],evidence:[{quote:'Older participants'}]}];
embedded.load(isolated);
const markup=el('preview').innerHTML;
assert(markup.includes('Which boundary applies?')&&markup.includes('Older participants'));
assert.match(markup,/eligibility\.html\?projectId=synthetic-project&amp;appVersion=\d+-criteria-release-\d+" target="_blank"/);
assert(!markup.includes('data-source-confirm=')&&!markup.includes('data-source-answer='));
assert.equal(JSON.stringify([...storage]),storedBefore,'Previewing an independent draft must not change the current project');
console.log('PASS embedded snapshots display source questions with a project-scoped link to the authoritative editor.');
