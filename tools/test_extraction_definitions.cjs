const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path'),B=require('../app/extraction-baseline.js');
for(const [key,label] of B.fields)assert(B.definition({baselineKey:key,label}).length>40);
assert.equal(B.definition({baselineKey:'country',definition:''}),'');
assert.equal(B.definition({baselineKey:'country',definition:'Custom rule'}),'Custom rule');
const html=fs.readFileSync(path.join(__dirname,'../extraction.html'),'utf8');
assert(html.includes('definition:AimstepExtractionBaseline.definition(f)'));assert(html.includes("fields.filter(f=>f.baselineKey!=='systemId').map"));
const code=html.slice(html.indexOf('async function saveItemDefinitions(){'),html.indexOf('function bind(){',html.indexOf('async function saveItemDefinitions(){')));
function setup(){const nodes=new Map(),c={itemDefinitionsSaving:false,busy:'',itemDefinitionsDraft:[{id:'country',label:'Country',definition:'Custom definition'}],itemDefinitionsInitial:'',ws:{form:{fields:[{id:'country',label:'Country',section:'baseline'}]}},fieldSection:f=>f.section,JSON,Map,saveChain:Promise.resolve(),putProject:async()=>{},store:{},scope:'synthetic',now:()=>'',showNotice(){},toast(){},$:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)}};vm.createContext(c);vm.runInContext(code,c);return c;}
(async()=>{let c=setup();await c.saveItemDefinitions();assert.equal(c.ws.form.fields[0].definition,'Custom definition');assert.equal(c.ws.form.fields[0].id,'country');
c=setup();c.itemDefinitionsDraft[0].definition='';await c.saveItemDefinitions();assert.equal(B.definition(c.ws.form.fields[0]),'');
c=setup();c.putProject=async()=>{throw Error('full')};await c.saveItemDefinitions();assert.equal(c.ws.form.fields[0].definition,undefined);assert.equal(c.itemDefinitionsSaving,false);
c=setup();c.ws.form.fields=[];await c.saveItemDefinitions();assert.equal(c.ws.form.fields.length,0);
console.log('PASS nine definitions, custom/empty values, prompt inclusion, Save, Clear, storage rollback and changed-field guard');})().catch(e=>{console.error(e);process.exitCode=1});
