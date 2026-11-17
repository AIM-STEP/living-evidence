/* Shell + project registration integration; no real account or network is used. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8'),html=read('index.html'),tasks=require('../app/project-task-status.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(url,seed=[{id:'A',name:'Alpha'},{id:'B',name:'Beta'}]){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));
 const dom=new JSDOM(html,{url:'https://aimsetp.com/'+url,runScripts:'outside-only',virtualConsole:vc}),w=dom.window,d=w.document;
 w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.ResizeObserver=class{observe(){}};
 // This test does not load remote iframe resources or the Firebase SDK.
 w.indexedDB={databases:async()=>[],open(){throw Error('Should not create databases for summaries');}};
 w.AIMSTEP={lang:()=> 'en',t:k=>k};w.AIMSTEPProjectTasks=tasks;
 w.sessionStorage.setItem('aimstep-active-project',JSON.stringify({id:'B',name:'Previously selected'}));
 w.localStorage.setItem('aimstep-screen-summary:default',JSON.stringify({sourceCount:99999,screened:99999}));
 w.localStorage.setItem('aimstep-search-summary:A',JSON.stringify({unique:12,runs:[],databases:1}));
 w.localStorage.setItem('aimstep-search-summary:B',JSON.stringify({unique:71,runs:[],databases:2}));
 w.localStorage.setItem('aimstep-screen-summary:A',JSON.stringify({sourceCount:924,screened:920,pending:4,conflicts:5,conflictsResolved:3,conflictsPending:2}));
 w.eval(read('app/secure-origin.js'));
 const auth={user:()=>({uid:'synthetic',emailVerified:true}),ready:async()=>({}),signIn(){throw Error('Already signed in');}};
 const records=seed.slice();let created=0;
 const backend={newId:()=> 'new-project',listProjects:async()=>records.slice(),createProject:async(id,uid,p)=>{created++;records.push({id,name:p.name,project_type:p.projectType,question_type:p.questionType,dataset_kind:p.datasetKind});},addMembership:async()=>{}};
 const projectSource=read('app/projects.js').replace('import { explainError } from "./backend.js";', 'const explainError = () => null;').replace('export function initProjects','window.initProjects = function initProjects');
 w.eval(projectSource);w.AIMSTEP.auth=auth;w.AIMSTEP.projectController=w.initProjects({auth,backend:()=>backend});
 const router=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function restoreRoute()'))[1];w.eval(router);
 w.document.dispatchEvent(new w.CustomEvent('aimstep:projects-ready'));
 return {w,d,dom,errors,created:()=>created};
}
function click(w,selector){const el=w.document.querySelector(selector);assert(el,selector);el.click();return el;}
(async()=>{
 for(const [file,slug] of Object.entries({analysis:'analysis',extraction:'extraction','build-protocol':'build-the-proposal','title-abstract-screening':'title-and-abstract-screening'})){
  const t=setup('?view=page&page='+file+'.html');await tick();assert(t.d.body.classList.contains('project-page-mode'));
  assert.equal(new URL(t.d.querySelector('#project-page iframe:not([hidden])').src).searchParams.has('projectId'),false,'direct entry ignores prior project');
  t.w.AIMSTEP.registerToolProject(file+'.html');assert(t.d.body.classList.contains('project-create-mode'));assert(!t.d.getElementById('pw-form').hidden);
  assert.equal(new URL(t.w.location.href).searchParams.get('returnTo'),file+'.html');
  for(const [id,value] of Object.entries({'pf-name':'New synthetic project','pf-type':'systematic','pf-dataset':'synthetic','pf-question':'effectiveness','pf-area':'med'}))t.d.getElementById(id).value=value;
  await t.w.AIMSTEP.projectController.submit();await tick();
  assert.equal(t.created(),1);const target=new URL(t.d.querySelector('#project-page iframe:not([hidden])').src);
  assert.equal(target.pathname,'/'+file+'.html');assert.equal(target.searchParams.get('projectId'),'new-project');
  assert.equal(new URL(t.w.location.href).searchParams.get('projectId'),'new-project');assert.equal(t.errors.length,0,t.errors.map(e=>e.message).join('\n'));
  await tick();t.w.close();
 }
 console.log('PASS empty direct tool → project registration → one real project creation → requested tool scoped to the new project');
 {
  const t=setup('?view=project&projectId=A');await tick();
  for(const link of t.d.querySelectorAll('[data-workspace-tool]'))assert.equal(new URL(link.href).searchParams.get('projectId'),'A');
  assert.equal(t.d.querySelectorAll('[data-task-status]').length,10);
  const label=t.d.querySelector('[data-task-status="search-strategy.html"]');assert.match(label.textContent,/12 records/);
  const conflict=t.d.querySelector('#tool-title-abstract .workspace-stat:nth-child(2) strong');assert.equal(conflict.textContent,'2');
  for(const link of t.d.querySelectorAll('.header-products a[data-tool]'))assert.equal(new URL(link.href).searchParams.has('projectId'),false,'global tools browse empty');
  // A later tool can be opened before the earlier tools contain any work.
  click(t.w,'[data-workspace-tool="grade"]');assert.equal(new URL(t.d.querySelector('#project-page iframe:not([hidden])').src).pathname,'/certainty-of-evidence.html');assert.equal(new URL(t.w.location.href).searchParams.get('projectId'),'A');
  click(t.w,'.header-products a[data-tool="nma"]');assert.equal(new URL(t.d.querySelector('#project-page iframe:not([hidden])').src).searchParams.has('projectId'),false);
  click(t.w,'.pw-card:nth-child(2) .pw-open');await tick();assert.match(label.textContent,/71 records/);assert.equal(conflict.textContent,'0','project B does not inherit project A conflicts');
  click(t.w,'[data-workspace-tool="protocol"]');assert.equal(new URL(t.d.querySelector('#project-page iframe:not([hidden])').src).searchParams.get('projectId'),'B');
  assert.equal(t.errors.length,0,t.errors.map(e=>e.message).join('\n'));await tick();t.w.close();
 }
 {
  const t=setup('?view=new-project&returnTo=https://attacker.example');await tick();
  t.w.AIMSTEP.registerToolProject('https://attacker.example');assert.equal(new URL(t.w.location.href).searchParams.has('returnTo'),false);await tick();t.w.close();
 }
 {
  const t=setup('?view=project&projectId=A');await tick();const delayed={A:[],B:[]};
  t.w.AIMSTEPProjectTasks={...tasks,collect:id=>new Promise(resolve=>delayed[id].push(resolve))};
  t.w.dispatchEvent(new t.w.Event('focus'));click(t.w,'.pw-card:nth-child(2) .pw-open');
  assert.equal(delayed.A.length,1);assert.equal(delayed.B.length,1);
  delayed.B[0]({data:{search:{unique:71}},errors:[]});await tick();
  const label=t.d.querySelector('[data-task-status="search-strategy.html"]');assert.match(label.textContent,/71 records/);
  delayed.A[0]({data:{search:{unique:12}},errors:[]});await tick();assert.match(label.textContent,/71 records/,'late project A cannot overwrite selected project B');
  assert.equal(t.errors.length,0);await tick();t.w.close();
 }
 console.log('PASS all ten project task actions/statuses, free tool order, explicit project URLs, global blank navigation, project isolation and safe return destinations');
})().catch(e=>{console.error(e);process.exitCode=1});
