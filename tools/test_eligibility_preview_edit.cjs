const assert=require('node:assert/strict');
const {test}=require('node:test');
const Reset=require('../app/eligibility-reset.js');
const Library=require('../app/eligibility-library.js');
const {setup}=require('./test_eligibility_grounding.cjs');

const project='synthetic-grounding',keys=Reset.projectKeys(project);
const question='Exercise in adults';
const originalRows=[
 {id:'INC-01',title:'Population',condition:'Adults.',uncertain:'Children.'},
 {id:'INC-05',title:'Study design',condition:'Randomised trials.',uncertain:'Case reports.'},
];
function savedCopy(mode){
 return {question,activeGenerator:mode,generationMethodChoice:mode,generationMode:mode,framework:'PICOS',
  reviewType:'Systematic Review',criteria:mode==='manual'?structuredClone(originalRows):[],
  machineCriteria:mode==='machine'?structuredClone(originalRows):[],
  machineRun:mode==='machine'?{question,reviewType:'Systematic Review',sourceRevision:0}:null,
  finalCriteria:{decisions:[{domain:'Study design',decision:'fails',rule:'Case reports.'}]}};
}
function open(mode,storage=new Map([[keys.legacy,JSON.stringify(savedCopy(mode))]])){
 return setup(storage,{windowOverrides:{AimstepEligibilityReset:Reset,AimstepEligibilityLibrary:Library}});
}
function edit(page,body){
 const editor={childNodes:[
  {nodeType:1,tagName:'DIV',hasAttribute:attribute=>attribute==='data-criteria-control',childNodes:[{nodeType:3,nodeValue:'Ignore this context note.'}]},
  {nodeType:3,nodeValue:body},
 ]};
 page.el('preview').querySelector=selector=>selector==='[data-criteria-document]'?editor:null;
 page.el('preview').handlers.input({target:{closest:selector=>selector==='[data-criteria-document]'?editor:null}});
}
const contents=(population,note='Author-written text.')=>[
 'Inclusion','Population: '+population,'Study design: Randomised trials.',
 'Exclusion','Population: Children.','Study design: Case reports.','Description',note
].join('\n');

for(const mode of ['machine','manual'])test(mode+' legacy criteria support editing, saved exclusions, and recovery after storage failure',async()=>{
 const page=open(mode),stored=()=>JSON.parse(page.storage.get(keys.legacy)),preview=page.el('preview');
 assert.match(preview.innerHTML,/Case reports/);
 edit(page,contents('Adults with active fibromyalgia.'));
 assert(await page.el('save-criteria').handlers.click());
 const field=mode==='machine'?'machineCriteria':'criteria';
 assert.match(stored()[field][0].condition,/active fibromyalgia/);
 assert.equal(stored().finalCriteria.decisions[0].rule,'Case reports.');
 assert.match(Buffer.from(page.api.export()).toString(),/active fibromyalgia[\s\S]*Case reports/);
 assert.match(open(mode,page.storage).el('preview').innerHTML,/Author-written text/);

 const committed=page.storage.get(keys.legacy),write=page.ctx.localStorage.setItem;
 edit(page,contents('Adults with stable symptoms.'));
 page.ctx.localStorage.setItem=()=>{throw Error('Synthetic quota failure')};
 assert.equal(await page.el('save-criteria').handlers.click(),false);
 assert.equal(page.storage.get(keys.legacy),committed);
 page.ctx.localStorage.setItem=write;
 assert(await page.el('save-criteria').handlers.click());
 assert.match(stored()[field][0].condition,/stable symptoms/);

 edit(page,contents('Adults.','<b>Plain author text.</b>'));
 assert(await page.el('save-criteria').handlers.click());
 assert.match(preview.innerHTML,/&lt;b&gt;Plain author text\.&lt;\/b&gt;/);
 assert(!preview.innerHTML.includes('Ignore this context note'));
});

test('draft text from an older preview cannot overwrite changed source rows',async()=>{
 const page=open('machine');
 edit(page,contents('Unsaved replacement.'));
 page.api.state().machineCriteria[0].condition='New source criterion.';
 assert.equal(await page.el('save-criteria').handlers.click(),false);
 assert.equal(page.api.state().machineCriteria[0].condition,'New source criterion.');
});


test('embedded criteria preserve the standalone display and isolate edits until the parent saves',()=>{
 for(const mode of ['machine','manual']){
  const standalone=open(mode),prior=standalone.storage.get(keys.legacy);
  const embedded=setup(standalone.storage,{embedded:'search-criteria-preview',
   windowOverrides:{AimstepEligibilityReset:Reset,AimstepEligibilityLibrary:Library}});
  const frame=embedded.ctx.window.aimstepCriteriaPreview;
  frame.load(JSON.parse(prior));
  assert.equal(embedded.el('preview').innerHTML,standalone.el('preview').innerHTML);
  edit(embedded,contents('Adults with stable symptoms.'));
  const {workspace,summary}=frame.read();
  const rows=mode==='machine'?workspace.machineCriteria:workspace.criteria;
  assert.match(rows[0].condition,/stable symptoms/);
  assert(summary.includes.some(row=>row.text.includes('stable symptoms')));
  assert.equal(standalone.storage.get(keys.legacy),prior);
 }
});
