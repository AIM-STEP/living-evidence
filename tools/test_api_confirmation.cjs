// UI event contract with a simulated backend; no real credentials or network.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../eligibility.html'),'utf8');
const start=html.indexOf('function clearApiConfirmation()');
const end=html.indexOf("$('start-machine').addEventListener",start);
const elements={};
function $(id){return elements[id]??=( {value:'',textContent:'',disabled:false,hidden:true,events:{},addEventListener(event,fn){this.events[event]=fn}});}
const context=vm.createContext({$,AbortController,setTimeout,clearTimeout,TypeError,Error,
 stopMachineGeneration(){},stopManualRefinement(){},setMachineStatus(){},setManualStatus(){},
 async findLocalBackend(signal,key){assert.equal(key,'synthetic-key');return {name:'test-model'}},
 async callCriteriaJson(){return {status:'ok'}}});
vm.runInContext('let confirmedApiKey="",apiConfirmationController=null;'+html.slice(start,end),context);
(async()=>{
 $('model-source').value='api';$('model-source').events.change();assert.equal($('api-settings').hidden,false);
 await $('confirm-api').events.click();assert.match($('api-status').textContent,/Paste/);
 $('api-key').value='synthetic-key';await $('confirm-api').events.click();
 assert.match($('api-status').textContent,/Connected/);assert.equal($('api-key').value,'');
 assert.equal(vm.runInContext('confirmedApiKey',context),'synthetic-key');
 $('api-key').events.input();assert.equal(vm.runInContext('confirmedApiKey',context),'');
 $('model-source').value='local';$('model-source').events.change();assert.equal($('api-settings').hidden,true);
 context.callCriteriaJson=async()=>({status:'invalid'});
 $('model-source').value='api';$('api-key').value='synthetic-key';await $('confirm-api').events.click();
 assert.match($('api-status').textContent,/expected JSON/);assert.equal(vm.runInContext('confirmedApiKey',context),'');
 console.log('PASS: API visibility, empty key, confirmation, reset, and invalid response');
})().catch(e=>{console.error(e);process.exitCode=1});
