const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const stages=require('../app/screening-stages.js');
const html=fs.readFileSync(require('node:path').join(__dirname,'../title-abstract-screening.html'),'utf8');
const extract=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
const criteria={question:'Adults with fibromyalgia, 12-week treatment',rows:[
 {title:'Population',condition:'1. Adults. 2. Fibromyalgia.'},
 {title:'Intervention',condition:'Exercise or cognitive behavioural therapy.'},
 {title:'Duration',condition:'At least 12 weeks.'}
]};
const original=JSON.stringify(criteria),items=stages.items(criteria);
assert.equal(items.length,4);assert.equal(items[2].text,'Exercise or cognitive behavioural therapy.');
assert.deepEqual(stages.parts('1. Exercise or CBT. 2. Medication.'),['1. Exercise or CBT. 2. Medication.']);
assert.deepEqual(stages.parts('Dose 1.5 mg. Participants aged 18 years.'),['Dose 1.5 mg. Participants aged 18 years.']);
assert.equal(stages.items({rows:[{title:'P',condition:'1. Adults. 2. Fibromyalgia.',definition:'Both must apply.'}]}).length,1);
const assignments=Object.fromEntries(items.map(i=>[i.id,i.dimension==='Duration'?'fulltext':'abstract']));
const config={sourceSig:'criteria-v1',assignments};
assert(stages.valid(config,criteria,'criteria-v1'));assert(!stages.valid(config,criteria,'criteria-v2'));
assert(!stages.valid({...config,assignments:{}},criteria,'criteria-v1'));
assert.equal(stages.active(criteria,config).rows.length,3);
const changed=structuredClone(criteria);changed.rows[0].condition='1. Adults. 2. Another disease.';
assert.equal(stages.items(changed)[0].id,items[0].id);assert.notEqual(stages.items(changed)[1].id,items[1].id);
assert.equal(JSON.stringify(criteria),original);
const ctx={AimstepScreeningStages:stages,source:{criteria,criteriaSig:'criteria-v1'},workspace:{screeningStages:config,full:{ai:{},ai2:{}},pilot:{}},calibrationEngine:require('../app/screening-calibration.js'),text:(v,n)=>String(v??'').slice(0,n),squash:v=>String(v||'').toLowerCase().replace(/\s+/g,' ').trim(),Map,Set};
vm.createContext(ctx);
vm.runInContext(extract('function screeningStagesReady()', 'function readySource()')+
 extract('function pilotPrompt(', 'const squash=')+
 extract('function pilotDecision(', 'async function screenPilotRecord(')+
 extract('function fullAI(', 'const isConflict='),ctx);
const record={uid:'synthetic',title:'Adults with fibromyalgia',abstract:'Exercise lasted six weeks.'};ctx.recordById=new Map([[record.uid,record]]);
const prompt=JSON.parse(ctx.pilotPrompt(record,0));assert.equal(prompt.criteria.length,3);assert(!prompt.criteria.some(c=>c.dimension.includes('Duration')));assert(prompt.stagePolicy.includes('deferred'));
const active=stages.active(criteria,config).rows;
let answer={decision:'exclude',criteria:[{dimension:items[3].label,judgment:'not met',quote:'Exercise lasted six weeks.'}]};
assert.equal(ctx.pilotDecision(answer,record).decision,'maybe');assert.equal(ctx.pilotDecision(answer,record).criteria.length,0);
answer={criteria:[{dimension:active[0].title,judgment:'not met',quote:'invented'}]};assert.equal(ctx.pilotDecision(answer,record).decision,'maybe');
answer={criteria:[{dimension:active[0].title,judgment:'not met',quote:'Adults with fibromyalgia'}]};assert.equal(ctx.pilotDecision(answer,record).decision,'no');
const reading={...ctx.pilotDecision(answer,record),criteriaSig:'criteria-v1',stageSig:stages.signature(config)};
ctx.workspace.full.ai.synthetic=reading;ctx.workspace.full.ai2.synthetic={...reading,criteria:[{...reading.criteria[0],judgment:'met'}],decision:'yes'};
assert.equal(ctx.aiPair('synthetic'),'conflict');ctx.workspace.full.ai2.synthetic=reading;assert.equal(ctx.aiPair('synthetic'),'no');
ctx.workspace.screeningStages={...config,assignments:{...assignments,[items[0].id]:'fulltext'}};assert.equal(ctx.fullAI('synthetic'),null);
console.log('PASS: stage configuration, safe splitting, alternatives, upstream changes, active prompt, exclusion gate, exact evidence, conflicts and stale results');
