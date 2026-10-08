const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const S=require('../app/screening-stages.js');
const html=fs.readFileSync(require('node:path').join(__dirname,'../full-text-screening.html'),'utf8');
const start=html.indexOf('async function importTitleAbstractStages()');
const code=html.slice(start,html.indexOf("$('import-screening-stages').addEventListener",start));
function setup(config){
 const nodes=new Map();let closed=0,opened=0;
 const ctx={stagesSaving:false,stagesDraft:[{id:'original'}],stagesFramework:'PICO',clearActionsBlocked:()=>false,stagesDirty:()=>false,confirm:()=>true,
 $:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)},openDB:async name=>{assert.equal(name,'aimstep-title-abstract');opened++;return {close(){closed++}}},getProject:async()=>({state:{screeningStages:config}}),AimstepScreeningStages:S,structuredClone,renderStageRows(){},toast(){}};
 vm.createContext(ctx);vm.runInContext(code,ctx);return {ctx,closed:()=>closed,opened:()=>opened};
}
(async()=>{
 const config={version:2,framework:'PECO',elements:[{id:'p',title:'Population',inclusion:'Adults or adolescents',exclusion:'Animal studies',enabled:true},{id:'unused',title:'Duration',inclusion:'Any',exclusion:'',enabled:false}]};
 let t=setup(config);await t.ctx.importTitleAbstractStages();assert.equal(t.ctx.stagesDraft.length,1);assert.deepEqual(t.ctx.stagesDraft[0],config.elements[0]);assert.equal(t.ctx.stagesFramework,'PECO');t.ctx.stagesDraft[0].inclusion='Edited';assert.equal(config.elements[0].inclusion,'Adults or adolescents');assert.equal(t.closed(),1);assert.equal(t.ctx.stagesSaving,false);
 t=setup(null);await t.ctx.importTitleAbstractStages();assert.equal(t.ctx.stagesDraft[0].id,'original');assert.equal(t.ctx.$('stages-error').hidden,false);assert.equal(t.closed(),1);
 t=setup({...config,elements:[]});await t.ctx.importTitleAbstractStages();assert.equal(t.ctx.stagesDraft[0].id,'original');
 t=setup(config);t.ctx.stagesDirty=()=>true;t.ctx.confirm=()=>false;await t.ctx.importTitleAbstractStages();assert.equal(t.opened(),0);
 t=setup(config);t.ctx.getProject=async()=>{throw Error('storage unavailable')};await t.ctx.importTitleAbstractStages();assert.equal(t.closed(),1);assert.equal(t.ctx.$('save-stages').disabled,false);
 console.log('PASS: imported rules and framework, independent draft, empty/missing source, cancellation and storage failure');
})().catch(e=>{console.error(e);process.exitCode=1});
