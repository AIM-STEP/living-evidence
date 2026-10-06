const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
(async()=>{
 const eligibility=read('eligibility.html');
 assert(!eligibility.includes('id="api-key"'));
 const code=eligibility.slice(eligibility.indexOf('async function findLocalBackend('),eligibility.indexOf('async function findLocalBackend(')+4000);
 const fn=code.slice(0,code.indexOf('\n}',0)+2);
 const c=vm.createContext({URL,LOCAL_SERVER:'http://127.0.0.1:8765',location:{href:'http://127.0.0.1:8765/eligibility.html'},localFetch:async()=>({ok:true,json:async()=>({service:'aimstep-local-eligibility',model:'synthetic-local',api:{ready:true,model:'synthetic-api'}})})});
 vm.runInContext(fn,c);const model=await c.findLocalBackend(new AbortController().signal);assert.equal(model.source,'local');assert.equal(model.name,'synthetic-local');
 assert(read('search-strategy.html').includes("model.provider==='backend'?{messages,format:schema,provider:'local'}"));
 for(const file of ['title-abstract-screening.html','full-text-screening.html']){
  const html=read(file),start=html.indexOf('async function resolvePilotModel('),end=html.indexOf('\nfunction isUnreachable',start);
  let fetches=0;
  const ctx=vm.createContext({typesafeKey:'',typesafeBackend:'',workspace:{screeningProvider:'local',screeningModel:'old-local'},localFetch:()=>{fetches++;throw Error('No local fallback allowed')}});
  vm.runInContext(html.slice(start,end),ctx);
  await assert.rejects(ctx.resolvePilotModel(),/TypeSafe key/);assert.equal(fetches,0);
  ctx.typesafeKey='synthetic-key';ctx.typesafeBackend='/backend';ctx.workspace={screeningProvider:'typesafe',screeningModel:'synthetic-typesafe'};
  const selected=await ctx.resolvePilotModel();assert.equal(selected.provider,'typesafe');assert.equal(selected.name,'TypeSafe: synthetic-typesafe');assert.equal(fetches,0);
  assert(html.includes('id="screen-model-source" disabled><option value="typesafe">TypeSafe</option>'));
 }
 console.log('PASS: local generation routing and TypeSafe-only screening; missing keys cannot trigger local fallback');
})().catch(e=>{console.error(e);process.exitCode=1});
