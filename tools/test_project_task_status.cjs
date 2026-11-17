const assert=require('node:assert/strict'),T=require('../app/project-task-status.js');
const blank=T.build({});assert.equal(Object.keys(blank).length,10);assert(Object.values(blank).every(task=>!task.active&&task.label==='Not started'));
const data={eligibility:{generationMethodChoice:'manual',criteria:[{condition:'Adults'}]},search:{unique:12,runs:[{}]},screen:{sourceCount:924,screened:920,pending:4,conflicts:5,conflictsResolved:3},full:{sought:7,decided:5,pending:2},extraction:{records:[{uid:'a'},{uid:'b'}],studies:{a:{done:{by:'Reviewer'}}},form:{outcomes:[{}]}},rob:{records:[{}],assess:{a:{confirmed:'date'},b:{confirmed:null}}},analysis:{rows:[{}],runs:[{},{}]},coe:{comparisons:3,complete:2},protocol:{text:'Saved plan',imports:[{}]},manuscript:{text:'Saved evidence summary',confirmedAt:'date'}};
const summary=T.build(data);assert(Object.values(summary).every(task=>task.active));assert.match(summary['title-abstract-screening.html'].label,/920 screened · 4 pending · 2 unresolved/);assert.match(summary['extraction.html'].label,/1 \/ 2/);assert.match(summary['analysis.html'].label,/2 saved runs/);assert.match(summary['certainty-of-evidence.html'].label,/2 \/ 3/);assert.equal(summary['drafting-manuscript.html'].label,'Confirmed draft');assert.match(T.build(data,true)['title-abstract-screening.html'].label,/2 项待解决冲突/);
assert.equal(T.build({eligibility:{generationMethodChoice:'',criteria:[{condition:'Old cleared rule'}]}})['eligibility.html'].active,false,'cleared eligibility does not reappear as saved work');
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
