/* Actual tool markup and startup scripts, with synthetic projects and an isolated DOM. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),gate=read('app/project-access.js');
const pages=['eligibility','search-strategy','title-abstract-screening','full-text-screening','extraction','risk-of-bias','analysis','certainty-of-evidence','build-protocol','drafting-manuscript'];
const scripts={analysis:'analysis-ui','certainty-of-evidence':'coe-workspace','build-protocol':'protocol-workspace','drafting-manuscript':'manuscript-workspace'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(page,query='',registry={projects:[{id:'A'},{id:'B'}]}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));
 const dom=new JSDOM(read(page+'.html'),{url:'https://aimsetp.com/'+page+'.html'+query,runScripts:'outside-only',virtualConsole:vc});
 const w=dom.window,requests=[],registrations=[];
 w.AIMSTEP={projectController:{state:()=>registry},registerToolProject:file=>registrations.push(file)};
 w.sessionStorage.setItem('aimstep-active-project',JSON.stringify({id:'A',name:'Prior project'}));
 w.localStorage.setItem('aimstep-eligibility:default','PRIVATE LEGACY DATA');
 w.localStorage.setItem('aimstep-search-summary:A',JSON.stringify({unique:920}));
 Object.defineProperty(w,'indexedDB',{value:{open(){throw Error('Preview must not open a task database');}}});
 w.fetch=async(...args)=>{requests.push(args);throw Error('Preview must not call a model');};
 return {dom,w,errors,requests,registrations,registry};
}
(async()=>{
 for(const page of pages){
  const t=setup(page),{w}=t;
  const snapshot=JSON.stringify({...w.localStorage});w.eval(gate);
  const entry=scripts[page]?read('app/'+scripts[page]+'.js'):[...read(page+'.html').matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  assert.match(entry,/^\s*window\.AIMSTEPProjectAccess\?\.run\(function\(\)\{/);
  assert(read(page+'.html').indexOf('app/project-access.js')<read(page+'.html').indexOf('app/secure-origin.js'));
  w.eval(entry);await tick();
  assert.equal(await w.AIMSTEPProjectAccess.ready(),false,page);assert.equal(w.document.documentElement.dataset.projectAccess,'preview');
  assert.equal(JSON.stringify({...w.localStorage}),snapshot,page+' leaves legacy and project data unchanged');assert.equal(t.requests.length,0);
  const controls=[...w.document.querySelectorAll('main button,main input,main select,main textarea')];assert(controls.length,page+' preview keeps controls');
  assert(controls.every(el=>!el.disabled));
  let executed=0;controls[0].addEventListener('click',()=>executed++);controls[0].click();
  assert.deepEqual(t.registrations,[page+'.html']);assert.equal(executed,0,'registration intercepts before task handlers');assert.equal(t.errors.length,0,t.errors.map(e=>e.message).join('\n'));
  w.close();
 }
 console.log('PASS all ten unscoped tools stay empty, skip actual runtimes/model/database calls, preserve saved data and redirect the first operation to registration');
 for(const query of ['?projectId=A','?project=A','?id=A']){
  const t=setup('eligibility',query);t.w.eval(gate);let ran=0;await t.w.AIMSTEPProjectAccess.run(()=>ran++);
  assert.equal(ran,1);assert.equal(new URL(t.w.location.href).searchParams.get('projectId'),'A');assert.equal(t.w.document.documentElement.dataset.projectAccess,'ready');t.w.close();
 }
 for(const query of ['?projectId=missing','?projectId=default','?projectId=A&project=B','?projectId=A&projectId=B','?projectId=%20']){
  const t=setup('analysis',query);t.w.eval(gate);let ran=0;await t.w.AIMSTEPProjectAccess.run(()=>ran++);assert.equal(ran,0,query);t.w.close();
 }
 {
  const registry={projects:null},t=setup('analysis','?projectId=B',registry);t.w.eval(gate);let ran=0;const result=t.w.AIMSTEPProjectAccess.run(()=>ran++);
  await tick();assert.equal(ran,0);assert.equal(t.w.document.documentElement.dataset.projectAccess,'pending');
  registry.projects=[{id:'B'}];t.w.document.dispatchEvent(new t.w.CustomEvent('aimstep:project-registry'));await result;assert.equal(ran,1);
  t.w.document.dispatchEvent(new t.w.CustomEvent('aimstep:project-registry'));assert.equal(ran,1);t.w.close();
 }
 {
  const registry={projects:[],loadError:true},t=setup('analysis','?projectId=A',registry);t.w.eval(gate);let ran=0;const result=t.w.AIMSTEPProjectAccess.run(()=>ran++);await tick();assert.equal(ran,0);
  registry.projects=[{id:'A'}];registry.loadError=null;t.w.document.dispatchEvent(new t.w.CustomEvent('aimstep:project-registry'));await result;assert.equal(ran,1);t.w.close();
 }
 {
  const t=setup('analysis','?projectId=A');t.w.localStorage.setItem('aimstep-project-deleted:A','deleted');t.w.eval(gate);let ran=0;await t.w.AIMSTEPProjectAccess.run(()=>ran++);assert.equal(ran,0);t.w.close();
 }
 {
  const t=setup('eligibility'),outer=t.w,frame=outer.document.createElement('iframe');frame.src='https://aimsetp.com/eligibility.html?projectId=B';outer.document.body.append(frame);const child=frame.contentWindow;
  child.document.open();child.document.write('<!doctype html><html><head></head><body><main></main></body></html>');child.document.close();child.eval(gate);assert.equal(await child.AIMSTEPProjectAccess.ready(),true,'nested criteria editor resolves the shell registry');t.w.close();
 }
 console.log('PASS registered ids and legacy aliases, unknown/deleted/conflicting scopes, slow/recovered registry and nested editors');
})().catch(e=>{console.error(e);process.exitCode=1});
