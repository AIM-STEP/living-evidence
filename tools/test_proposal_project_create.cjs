const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../app/projects.js'),'utf8');
const start=source.indexOf('  async function createFromProposal('),end=source.indexOf('  /* ----------------------------------------------------------------- wire */',start);
const payload={name:'Synthetic test title',projectType:'systematic',datasetKind:'synthetic',questionType:'effectiveness',areaOfResearch:'med'};
const fields=Object.fromEntries([['type','systematic'],['dataset','synthetic'],['question','effectiveness'],['area','med']].map(([k,v])=>[k,{input:{options:[{value:v}]}}]));
const data=new Map();let creates=0,memberships=0,loads=0,signedIn=true,failMembership=true;
const context={fields,auth:{user:()=>signedIn?{uid:'user'}:null},localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},ensureBackend:async()=>({newId:()=> 'project123',createProject:async(id,uid,p)=>{creates++;assert.equal(id,'project123');assert.equal(uid,'user');assert.equal(p.name,payload.name)},addMembership:async()=>{memberships++;if(failMembership){failMembership=false;throw Error('Temporary membership failure')}}}),load:async()=>{loads++}};
vm.runInNewContext(source.slice(start,end),context);
(async()=>{
 await assert.rejects(context.createFromProposal(payload,'file-1'),/membership/);assert.equal(creates,1);
 const result=await context.createFromProposal(payload,'file-1');assert.equal(result.id,'project123');assert.equal(creates,1);assert.equal(memberships,2);assert.equal(loads,1);
 await context.createFromProposal(payload,'file-1');assert.equal(creates,1);
 await assert.rejects(context.createFromProposal({...payload,name:'x'.repeat(201)},'bad'),/title/);
 await assert.rejects(context.createFromProposal({...payload,datasetKind:'invalid'},'bad'),/classification/);
 signedIn=false;await assert.rejects(context.createFromProposal(payload,'signed-out'),/Sign in/);
 console.log('PASS authenticated project creation, enum/title validation, stable retry id, membership recovery and duplicate protection');
})().catch(e=>{console.error(e);process.exitCode=1});
