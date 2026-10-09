'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),U=require('../app/coe-units.js');
const doc={querySelectorAll:()=>[],getElementById:()=>({}),};
let js=fs.readFileSync(require.resolve('../app/coe-workspace.js'),'utf8');
js=js.replace('load();bind();bindUnits();render();','globalThis.test={FIELDS,STAGES,LOGGED,derive,checks,missing,parseVal,shown,workbookSheets,recordsFromJSON,blankRecord,applyCalc,setState:v=>ws=v};').replace(/window.addEventListener\('storage',[\s\S]*?\);\n\}\)\(\);/, '})();');
const context={AimstepCoeUnits:U,URLSearchParams,URL,location:{search:'?projectId=synthetic-test',href:'http://localhost/certainty-of-evidence.html'},document:doc,sessionStorage:{getItem:()=>null},localStorage:{setItem:()=>{}},structuredClone,console};vm.createContext(context);vm.runInContext(js,context);const T=context.test;
const rules=Object.fromEntries(Object.entries(T.LOGGED).map(([k,v])=>[k,{...v,approved:true}]));
function setup(type='binary'){const r=T.blankRecord(1);Object.assign(r,{intervention:'Synthetic A',control:'Synthetic B',direct_rr:{point:1.2,ci_lower:1.1,ci_upper:1.3},indirect_rr:'NA',final_source:'1',n_rct:1,n_intervention:100,n_control:100,rob:'ns',inconsistency:'Not assessable',indirectness:'ns',publication_bias:'undetected',rob_high_re_weight:0,x_baseline_risk_per_1000:200});r.x_unit={framework:'PICO',population:'Synthetic adults',outcome:'Synthetic result',timepoint:'12 weeks',type,scale:'points',direction:'higher',mid:50,midSource:'Synthetic threshold',baselineSource:'Synthetic risk',design:'RCT'};
 const state={rules,real:{dataset_kind:'real',records:[r],audit:[]},synthetic:{dataset_kind:'synthetic',records:[],audit:[]},active:'real'};T.setState(state);return {r,state};}
let {r,state}=setup();let c=T.derive(r,state.real,rules);assert.equal(c[65].value.point,39.99999999999999);assert.equal(c[66].value,'serious');
r.x_unit.mid=60;c=T.derive(r,state.real,rules);assert.equal(c[66].value,'ns'); // floating-point noise at the MID boundary stays in the middle zone
assert.deepEqual(U.zones({point:0,ci_lower:-50,ci_upper:50},r.x_unit={...r.x_unit,mid:50}),['little/no important effect']);
assert.deepEqual(U.zones({point:0,ci_lower:-51,ci_upper:51},r.x_unit),['important harm','little/no important effect','important benefit']);
assert.deepEqual(U.zones({point:100,ci_lower:60,ci_upper:120},{...r.x_unit,direction:'lower'}),['important harm']);
r.x_unit.mid=null;c=T.derive(r,state.real,rules);assert.equal(c[66].state,'waiting');assert.equal(c[68].state,'waiting');
r.x_unit.mid=50;r.x_baseline_risk_per_1000=null;assert.equal(T.derive(r,state.real,rules)[65].state,'waiting');
assert.equal(U.absolute({point:2,ci_lower:1,ci_upper:3},500),null);
({r,state}=setup('continuous'));r.x_direct_md={point:-3,ci_lower:-5,ci_upper:-1};r.direct_rr=null;r.x_unit.mid=2;r.x_unit.direction='lower';r.x_baseline_risk_per_1000=null;r.x_unit.baselineSource='';
c=T.derive(r,state.real,rules);assert.equal(c[65].value.point,-3);assert.equal(c[66].value,'serious');assert.equal(U.issues(r).length,0);assert.equal(T.parseVal(U.spec(r,T.FIELDS.find(f=>f.no===8)),'-3 (-5, -1)').value.point,-3);
T.applyCalc(r);assert.equal(r.final_rr,null);assert.equal(r.x_final_md.point,-3);assert.equal(r.final_rd_per_1000,null);
r.x_unit.mid=null;T.applyCalc(r);assert.equal(r.x_absolute_md,null);assert.equal(r.final_coe,null);
assert.equal(T.FIELDS.length,68);const sheets=T.workbookSheets();assert(sheets.some(x=>x.name==='MD extensions'));assert.equal(sheets.filter(x=>/^[1-4]\. /.test(x.name)).length,4);assert(sheets.some(x=>x.name==='Codebook 68'&&x.rows.length===71));
console.log('PASS: per-unit MID, boundary zones, effect direction, baseline risk, continuous MD isolation, invalidation, workflow workbook.');
// A direct-only RCT route must finish without an invented NMA estimate.
({r,state}=setup());for(const f of T.FIELDS){if(f.no<4)continue;r[f.key]=f.na?'NA':null;}
const put=(no,v)=>r[T.FIELDS.find(f=>f.no===no).key]=v;
for(const [no,v] of [[4,1],[5,['SYNTH-1']],[6,100],[7,100],[8,{point:1.1,ci_lower:1.05,ci_upper:1.15}],[10,'Not assessable'],[19,0],[25,'ns'],[26,'All low RoB studies'],[27,'ns'],[32,'Not performed: k < 10'],[33,'undetected'],[35,'NA'],[40,'No'],[49,null],[57,'Only direct evidence'],[58,'Not assessable'],[59,'No indirect evidence'],[61,'1'],[62,'Only direct evidence available'],[67,'CI within the MID; information size considered.']])put(no,v);
state.rules['D-008']={approved:true,choice:'documented'};state.rules['D-010']={approved:true,choice:'core'};T.applyCalc(r);c=T.derive(r,state.real,state.rules);
assert.equal(c[68].value,'high');assert(T.checks(r,c,state.real,state.rules,'real').some(x=>x.rule==='M39'&&x.sev==='blocked'));state.rules['D-007']={approved:true,choice:'manual'};c=T.derive(r,state.real,state.rules);const issues=T.checks(r,c,state.real,state.rules,'real');assert.deepEqual(JSON.parse(JSON.stringify(issues.filter(x=>x.sev!=='warning'))),[]);assert.equal([1,2,3,4].flatMap(s=>T.missing(r,c,s)).length,0);assert.equal(r.nma_rr,null);
console.log('PASS: direct-only completed route does not require invented NMA data.');
