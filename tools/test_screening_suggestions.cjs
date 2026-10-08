const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const S=require('../app/screening-stages.js'),G=require('../app/screening-criteria-suggestions.js');
const criteria={framework:'PICO',rows:[{title:'Population',condition:'Adults aged 18 years or older',uncertain:'Animal studies'}]},seeds=S.seed(criteria);
const result={elements:seeds.map(e=>({id:e.id,inclusion:'Adults; age >=18 years',exclusion:'Animal-only research',rationale:'Keep age threshold'}))};
assert.equal(G.validate(result,seeds)[0].title,'Population');
assert.equal(G.validate(result.elements,seeds)[0].inclusion,result.elements[0].inclusion);
assert.throws(()=>G.validate({elements:[]},seeds));
assert.throws(()=>G.validate({elements:[{...result.elements[0],id:'unknown'}]},seeds));
assert.throws(()=>G.validate({elements:[{...result.elements[0],inclusion:''}]},seeds));
const html=fs.readFileSync(path.join(__dirname,'../title-abstract-screening.html'),'utf8');
const code=html.slice(html.indexOf('function reusableStageSuggestion()'),html.indexOf("$('generate-stages').addEventListener"));
function context(){
 const nodes=new Map(),ctx={AimstepScreeningSuggestions:G,AimstepScreeningStages:S,source:{criteria,criteriaSig:'current'},workspace:{},stagesDraft:[],stagesFramework:'PICO',stagesSaving:false,stagesController:null,busy:'',stagesDialog:{open:true},stagesDirty:()=>false,clearActionsBlocked:()=>false,structuredClone,AbortController,DOMException,setTimeout,clearTimeout,LOCAL_SERVER:'http://127.0.0.1:8765',window:{AIMSTEPOnlineModel:{online:true,base:'https://ai.aimsetp.com/api/eligibility'}},fingerprint:()=> 'prompt',now:()=> 'time',render(){},renderStageRows(){},renderClearActions(){},renderStageButton(){},toast(){},confirm:()=>true,isUnreachable:()=>false,save:async()=>{},$:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)}};
 ctx.localFetch=async(url,options)=>{assert.equal(url,'https://ai.aimsetp.com/api/eligibility/model');const body=JSON.parse(options.body);assert.equal(body.provider,'local');assert(body.messages[0].content.includes('Missing')||body.messages[0].content.includes('missing'));return {ok:true,json:async()=>({model:'synthetic-local',message:{content:JSON.stringify(result)}})}};
 vm.createContext(ctx);vm.runInContext(code,ctx);return ctx;
}
(async()=>{
 let c=context();await c.generateStageSuggestions();assert.equal(c.stagesDraft[0].inclusion,result.elements[0].inclusion);assert.equal(c.workspace.screeningStages,undefined);assert(c.reusableStageSuggestion());assert.equal(c.workspace.screeningStagesSuggestion.model,'synthetic-local');assert.equal(c.busy,'');
 c.source.criteriaSig='changed';assert.equal(c.reusableStageSuggestion(),null);
 c=context();c.localFetch=async()=>{c.source.criteriaSig='changed';return {ok:true,json:async()=>({message:{content:JSON.stringify(result)}})}};await c.generateStageSuggestions();assert.equal(c.workspace.screeningStagesSuggestion,undefined);assert.equal(c.$('stages-error').hidden,false);
 c=context();c.save=async()=>{throw Error('storage full')};await c.generateStageSuggestions();assert.equal(c.workspace.screeningStagesSuggestion,undefined);assert.equal(c.stagesDraft.length,0);
 c=context();c.localFetch=async()=>{c.stagesController.abort();throw new DOMException('Stopped','AbortError')};await c.generateStageSuggestions();assert.equal(c.workspace.screeningStagesSuggestion,undefined);assert.equal(c.stagesSaving,false);
 c=context();c.stagesDirty=()=>true;c.confirm=()=>false;await c.generateStageSuggestions();assert.equal(c.workspace.screeningStagesSuggestion,undefined);
 console.log('PASS: local provider over online gateway, draft-only persistence, cache invalidation, malformed results, upstream change, rollback, cancellation and replacement guard');
})().catch(e=>{console.error(e);process.exitCode=1});
