const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
test('proposal document survives tool, dashboard and project navigation without reloading',()=>{
 const node=()=>({hidden:false,attrs:{},classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]||null;},removeAttribute(k){delete this.attrs[k];},appendChild(){},loads:0,set src(value){this.attrs.src=value;this.loads++;}});
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
 const defaultFrame=node(),proposalFrames=new Map(),otherPage=node();let bound=0;
 const ctx={URL,Map,defaultFrame,frame:defaultFrame,proposalFrames,otherPage,activeProject:{id:'first'},page:node(),toolset:node(),home:new URL('https://aimsetp.com/index.html'),isToolsetPage:()=>false,rememberProject(id){ctx.activeProject={id};defaultFrame.removeAttribute('src');},bindToolFrame(){bound++;},syncFrameLanguage(){},renderSetupStatus(){},renderProjectSummary(){},document:{body:node(),getElementById:get,createElement:node,querySelectorAll:()=>[]},window:{AIMSTEP:{t:x=>x},scrollTo(){}},history:{pushState(){}},routeUrl:()=>new URL('https://aimsetp.com/')};
 vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('function setView(view, target, push)'),html.indexOf('function sitePage(value)')),ctx);
 const open=(file,project='first')=>ctx.setView('page',new URL('https://aimsetp.com/'+file+'?projectId='+project),false);
 open('build-protocol.html');const original=ctx.frame;original.runningTask={progress:35};assert.equal(original.loads,1);
 open('eligibility.html');assert.equal(original.hidden,true);assert.equal(original.loads,1);assert.equal(ctx.frame,defaultFrame);
 ctx.setView('toolset',null,false);open('build-protocol.html');assert.equal(ctx.frame,original);assert.equal(original.hidden,false);assert.equal(original.runningTask.progress,35);assert.equal(original.loads,1);
 open('build-protocol.html','second');assert.notEqual(ctx.frame,original);assert.equal(original.loads,1);
 open('build-protocol.html');assert.equal(ctx.frame,original);assert.equal(original.loads,1);assert.equal(bound,2);
});
test('all classic inline scripts parse',()=>{for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){if(/src=|type\s*=/.test(match[1]))continue;new vm.Script(match[2]);}});
