const assert=require('node:assert/strict'),T=require('../app/project-task-status.js');
const blank=T.build({});assert.equal(Object.keys(blank).length,10);assert(Object.values(blank).every(task=>!task.active&&task.label==='Not started'));
const data={eligibility:{generationMethodChoice:'manual',criteria:[{condition:'Adults'}]},search:{unique:12,runs:[{}]},screen:{sourceCount:924,screened:920,pending:4,conflicts:5,conflictsResolved:3},full:{sought:7,decided:5,pending:2},extraction:{records:[{uid:'a'},{uid:'b'}],studies:{a:{done:{by:'Reviewer'}}},form:{outcomes:[{}]}},rob:{records:[{}],assess:{a:{confirmed:'date'},b:{confirmed:null}}},analysis:{rows:[{}],runs:[{},{}]},coe:{comparisons:3,complete:2},protocol:{text:'Saved plan',imports:[{}]},manuscript:{text:'Saved evidence summary',confirmedAt:'date'}};
const summary=T.build(data);assert(Object.values(summary).every(task=>task.active));assert.match(summary['title-abstract-screening.html'].label,/920 screened · 4 pending · 2 unresolved/);assert.match(summary['extraction.html'].label,/1 \/ 2/);assert.match(summary['analysis.html'].label,/2 saved runs/);assert.match(summary['certainty-of-evidence.html'].label,/2 \/ 3/);assert.equal(summary['drafting-manuscript.html'].label,'Confirmed draft');assert.match(T.build(data,true)['title-abstract-screening.html'].label,/2 项待解决冲突/);
assert.equal(T.build({eligibility:{generationMethodChoice:'',criteria:[{condition:'Old cleared rule'}]}})['eligibility.html'].active,false,'cleared eligibility does not reappear as saved work');
const grounded={generationMethodChoice:'machine',activeGenerator:'machine',machineCriteria:[{condition:'Adults with fibromyalgia'}],machineRefinement:{audit:{version:'original-source-v2'},uncertainties:['Clarify study designs']}};
assert.equal(T.build({eligibility:grounded})['eligibility.html'].completed,false);
assert.match(T.build({eligibility:grounded},true)['eligibility.html'].label,/1 项待澄清/);
assert(T.build({eligibility:{...grounded,resolvedPending:['Clarify study designs']}})['eligibility.html'].completed);
// Completion is separate from activity: visits, default scaffolds and inputs produce no completed tools.
const configured={eligibility:{question:'A review question',generationMethodChoice:'manual',activeGenerator:'manual',criteria:[{condition:'Adults with the condition or population of interest',definition:'Define age threshold, diagnosis and how mixed populations are handled.'},{condition:'Eligible study designs',definition:'Specify design features; distinguish design from report format.'}]},searchDraft:{concepts:[{text:'search terms'}]},screen:{sourceCount:2,screened:0,pending:2},screenState:{screeningStages:{elements:[{}]}},full:{sought:2,retrieved:2,assessed:2,decided:0,pending:2},extraction:{records:[{uid:'a'}],form:{outcomes:[{}]},studies:{a:{fields:{},done:null}}},rob:{records:[{uid:'a'}],outcomes:['Pain'],assess:{'a|0':{confirmed:null}}},analysis:{rows:[{}],requirements:'Analyse pain',planConfirmed:{at:'date'},runs:[{}]},coe:{comparisons:0,complete:0},coeState:{real:{records:[]},rules:{default:{approved:true}}},protocol:{manualProtocolInputs:{reviewTitle:'My review'},imports:[{name:'Input.pdf'}]},manuscript:{instructions:'Write a report',history:[{text:'Old cleared draft'}]}};
for(const state of Object.values(configured))state.visited=true;
assert(Object.values(T.build(configured)).every(task=>!task.completed),'opening/configuring all ten tools does not complete any');
assert(Object.values(T.build({})).every(task=>!task.completed));
const finished={eligibility:{generationMethodChoice:'manual',criteria:[{condition:'Adults with PTSD'}]},search:{unique:12,runs:[{status:'Complete'}]},screen:{sourceCount:2,screened:2,pending:0,conflictsPending:0,humanCheck:1,humanChecked:1,completed:true},full:{assessed:2,decided:2,pending:0,conflicts:1,conflictsResolved:1,humanCheck:1,humanChecked:1,completed:true},extraction:{records:[{uid:'a'},{uid:'b'}],studies:{a:{done:{at:'date'}},b:{done:{at:'date'}}}},rob:{records:[{uid:'a'}],outcomes:['Pain','PTSD'],assess:{'a|0':{confirmed:{at:'date'}},'a|1':{confirmed:{at:'date'}}}},analysis:{runs:[{results:[{dataset:{name:'Pain'},estimate:0.3}]}]},coe:{comparisons:2,complete:2,errors:0,blocked:0,incomplete:0},coeState:{real:{records:[{},{}]}},protocol:{text:'Saved proposal document'},manuscript:{text:'Saved report',confirmedAt:'date'}};
assert(Object.values(T.build(finished)).every(task=>task.completed),'all ten completed outputs count');
function notComplete(file,change){const input=structuredClone(finished);change(input);assert.equal(T.build(input)[file].completed,false,file+' reverts when output is missing/incomplete');}
notComplete('eligibility.html',d=>{d.eligibility.criteria=[];d.eligibility.history=[{criteria:[{condition:'Old result'}]}];});
notComplete('search-strategy.html',d=>{d.search={unique:0,runs:[{status:'Failed'}]};d.searchDraft={queries:{pubmed:{text:'Old strategy',wordsChanged:true}}};});
notComplete('title-abstract-screening.html',d=>{d.screen.pending=1;d.screen.screened=1;});
notComplete('title-abstract-screening.html',d=>{d.screen.conflictsPending=1;});
notComplete('title-abstract-screening.html',d=>{d.screen.humanChecked=0;});
notComplete('title-abstract-screening.html',d=>{d.screen.sourceCount=0;d.screen.screened=0;});
notComplete('full-text-screening.html',d=>{d.full.conflictsResolved=0;});
notComplete('full-text-screening.html',d=>{d.full.decided=1;d.full.pending=1;});
notComplete('extraction.html',d=>{d.extraction.studies.b.done=null;d.extraction.studies.orphan={done:{at:'date'}};});
notComplete('risk-of-bias.html',d=>{d.rob.assess['a|1'].confirmed=null;d.rob.assess['orphan|1']={confirmed:{at:'date'}};});
notComplete('analysis.html',d=>{d.analysis.runs=[{results:[]}];});
notComplete('certainty-of-evidence.html',d=>{d.coe.complete=1;});
notComplete('certainty-of-evidence.html',d=>{d.coeState.real.records=[];});
notComplete('build-protocol.html',d=>{d.protocol.text='';d.protocol.history=[{text:'Old proposal'}];});
notComplete('drafting-manuscript.html',d=>{d.manuscript.confirmedAt=null;});
notComplete('drafting-manuscript.html',d=>{d.manuscript.text='';});
assert(T.build({searchDraft:{queries:{pubmed:{text:'PTSD AND trial',wordsChanged:false}}}})['search-strategy.html'].completed,'saved usable strategy is an output');
assert(T.build({searchResults:{records:[],runs:[{status:'Complete',query:'PTSD AND trial'}]}})['search-strategy.html'].completed,'successful zero-hit searches still produce a real result');
console.log('PASS completed outputs for ten tools; visits/configuration/default examples/partial reviews/empty results/cleared drafts never count as completed');
const opened=[],reads=[],transactions=[],existing=new Map([['aimstep-extraction',{A:{state:data.extraction},B:{state:{records:[],form:{outcomes:[]}}}}],['aimstep-analysis',{A:{state:data.analysis}}]]);
const indexedDB={
 databases:async()=>[...existing.keys()].map(name=>({name})),
 open(name){
  opened.push(name);const req={};
  setImmediate(()=>{
   req.result={
    objectStoreNames:{contains:n=>n==='projects'},
    transaction(store,mode){
     transactions.push({store,mode});
     return {objectStore(){return {get(id){
      reads.push({name,id});const q={};
      setImmediate(()=>{q.result=existing.get(name)[id];q.onsuccess();});return q;
     }}}};
    },
    close(){}
   };
   req.onsuccess();
  });
  return req;
 }
};
const values=new Map([['aimstep-screen-summary:A',JSON.stringify(data.screen)],['aimstep-screen-summary:B',JSON.stringify({sourceCount:2,screened:1,pending:1})],['aimstep-screen-summary:default',JSON.stringify({sourceCount:99999,screened:99999})]]),lsReads=[];
const storage={getItem(key){lsReads.push(key);return values.get(key)||null;},setItem(){throw Error('Summary must not write');}};
(async()=>{
 const a=await T.collect('A',storage,indexedDB),b=await T.collect('B',storage,indexedDB);
 assert.equal(a.errors.length,0);assert.equal(b.errors.length,0);assert.match(T.build(a.data)['title-abstract-screening.html'].label,/920/);assert.match(T.build(b.data)['title-abstract-screening.html'].label,/1 screened/);assert.equal(T.build(b.data)['extraction.html'].active,false);assert(opened.every(name=>existing.has(name)));assert(transactions.every(t=>t.mode==='readonly'));assert(reads.every(r=>['A','B'].includes(r.id)));assert(lsReads.every(key=>!key.endsWith(':default')));
 await assert.rejects(T.collect('',storage,indexedDB),/registered project/);await assert.rejects(T.collect('default',storage,indexedDB),/registered project/);
 values.set('aimstep-eligibility:A','{corrupted');const broken=await T.collect('A',storage,indexedDB);assert(broken.errors.includes('eligibility'),'corrupted tasks are reported instead of presented as empty');
 console.log('PASS ten truthful task states, pending conflicts, cleared criteria, bilingual counts, readonly existing databases, no anonymous storage, project isolation and explicit read errors');
})().catch(e=>{console.error(e);process.exitCode=1});
