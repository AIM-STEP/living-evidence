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
const prompt=JSON.parse(ctx.pilotPrompt(record,0));assert.equal(prompt.criteria.length,3);assert(!prompt.criteria.some(c=>c.dimension.includes('Duration')));assert(prompt.stagePolicy.includes('Disabled and deleted'));
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

// Version 2 is an independent, editable element list.
const edited=stages.editable(criteria,null);
assert.equal(edited.length,3);assert.equal(edited[0].inclusion,'1. Adults. 2. Fibromyalgia.');
edited[0].inclusion='Adults or adolescents with fibromyalgia.';edited[0].exclusion='Animal studies.';edited[1].enabled=false;edited.splice(2,1);
const v2={version:2,sourceSig:'criteria-v1',elements:edited};
assert(stages.valid(v2,criteria,'criteria-v1'));assert(stages.draftValid([]));assert(!stages.valid({...v2,elements:[]},criteria,'criteria-v1'));
const projection=stages.active(criteria,v2);assert.equal(projection.rows.length,1);assert.equal(projection.rows[0].condition,edited[0].inclusion);assert.equal(projection.rows[0].uncertain,'Animal studies.');
assert.equal(JSON.stringify(criteria),original);assert.deepEqual(stages.editable(criteria,v2),edited);
const migrated=stages.editable(criteria,config);assert.equal(migrated[2].enabled,false);
ctx.workspace.screeningStages=v2;
const editedPrompt=JSON.parse(ctx.pilotPrompt(record,0));assert.equal(editedPrompt.criteria.length,1);assert.equal(editedPrompt.criteria[0].inclusionRule,edited[0].inclusion);
assert.equal(ctx.pilotDecision({decision:'exclude',criteria:[{dimension:'Intervention',judgment:'not met',quote:'Exercise lasted six weeks.'}]},record).decision,'maybe');
console.log('PASS: editable inclusion/exclusion, disabled/deleted elements, empty save gating, legacy migration and prompt isolation');
