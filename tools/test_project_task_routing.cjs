/* Shell + project registration integration; no real account or network is used. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8'),html=read('index.html'),tasks=require('../app/project-task-status.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(url,seed=[{id:'A',name:'Alpha'},{id:'B',name:'Beta'}],enhance=false){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));
 const dom=new JSDOM(html,{url:'https://aimsetp.com/'+url,runScripts:'outside-only',virtualConsole:vc}),w=dom.window,d=w.document;
 const polls=[];w.setInterval=(fn,delay)=>{polls.push({fn,delay});return polls.length;};w.clearInterval=()=>{};
 w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.ResizeObserver=class{observe(){}};
 // This test does not load remote iframe resources or the Firebase SDK.
 w.indexedDB={databases:async()=>[],open(){throw Error('Should not create databases for summaries');}};
 w.AIMSTEP={lang:()=> 'en',t:k=>k};w.AIMSTEPProjectTasks=tasks;
 w.sessionStorage.setItem('aimstep-active-project',JSON.stringify({id:'B',name:'Previously selected'}));
 w.localStorage.setItem('aimstep-screen-summary:default',JSON.stringify({sourceCount:99999,screened:99999}));
 w.localStorage.setItem('aimstep-search-summary:A',JSON.stringify({unique:12,runs:[],databases:1}));
 w.localStorage.setItem('aimstep-search-summary:B',JSON.stringify({unique:71,runs:[],databases:2}));
 w.localStorage.setItem('aimstep-protocol:A',JSON.stringify({text:'Existing writing draft'}));
 w.localStorage.setItem('aimstep-screen-summary:A',JSON.stringify({sourceCount:924,screened:920,pending:4,conflicts:5,conflictsResolved:3,conflictsPending:2}));
 w.eval(read('app/secure-origin.js'));
 const auth={user:()=>({uid:'synthetic',emailVerified:true}),ready:async()=>({}),signIn(){throw Error('Already signed in');}};
 const records=seed.slice();let created=0;
 const backend={newId:()=> 'new-project',listProjects:async()=>records.slice(),createProject:async(id,uid,p)=>{created++;records.push({id,name:p.name,project_type:p.projectType,question_type:p.questionType,dataset_kind:p.datasetKind});},addMembership:async()=>{}};
 const projectSource=read('app/projects.js').replace('import { explainError } from "./backend.js";', 'const explainError = () => null;').replace('export function initProjects','window.initProjects = function initProjects');
 w.eval(projectSource);w.AIMSTEP.auth=auth;w.AIMSTEP.projectController=w.initProjects({auth,backend:()=>backend});
 if(enhance)w.eval([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('var storageKey = "aimstep-archived-projects"'))[1]);
 const router=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function restoreRoute()'))[1];w.eval(router);
 w.document.dispatchEvent(new w.CustomEvent('aimstep:projects-ready'));
 return {w,d,dom,errors,polls,created:()=>created};
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
  assert.equal(t.d.querySelectorAll('#project-workspace details,#project-workspace .workspace-panel,#project-workspace table').length,0,'navigation has no expandable task content');
  assert.equal(t.d.querySelectorAll('#workspace-steps > a.project-tool-row').length,10);
  assert.equal(t.d.querySelector('#workspace-summary-title,#workspace-summary-project,#workspace-title'),null,'duplicate headings and project name are removed');
  const card=t.d.querySelector('.pw-card:first-child'),nameRow=card.querySelector('.project-name-progress-row');
  assert(nameRow);assert.equal(nameRow.querySelector('.pw-card-title').textContent,'Alpha');
  assert.equal(nameRow.querySelector('.workspace-progressbar').getAttribute('aria-valuemax'),'10');
  assert.equal(nameRow.querySelector('.workspace-progress-label').textContent,'3/10');
  assert.equal(card.nextElementSibling,t.d.getElementById('project-workspace'),'writing and workflow rows sit immediately beneath their project');
  assert.equal(t.d.querySelectorAll('.workspace-progress-group').length,1);

  const label=t.d.querySelector('[data-task-status="search-strategy.html"]');assert.match(label.textContent,/12 records/);
  const conflict=t.d.querySelector('[data-task-status="title-abstract-screening.html"]');assert.match(conflict.textContent,/2 unresolved conflicts/);
  assert.equal(t.d.querySelector('.header-products,#toolset-trigger,#toolset'),null,'global Toolset and writing entries are removed');
  assert.equal(t.d.querySelector('.project-tool-row:first-child .workspace-step-name').textContent,'Proposal');
  assert.equal(t.d.querySelector('.project-tool-row:last-child .workspace-step-name').textContent,'Report');
  assert.match(t.d.querySelector('[data-task-status="build-protocol.html"]').textContent,/Draft saved/);
  assert.equal(JSON.parse(t.w.localStorage.getItem('aimstep-protocol:A')).text,'Existing writing draft');
  // A later tool can be opened before the earlier tools contain any work.
  click(t.w,'[data-workspace-tool="grade"]');assert.equal(new URL(t.d.querySelector('#project-page iframe:not([hidden])').src).pathname,'/certainty-of-evidence.html');assert.equal(new URL(t.w.location.href).searchParams.get('projectId'),'A');
  click(t.w,'.site-header .brand');assert(t.d.getElementById('project-page').hidden);
  click(t.w,'.pw-card:nth-of-type(2) .pw-open');await tick();assert.match(label.textContent,/71 records/);assert.equal(conflict.textContent,'Not started','project B does not inherit project A conflicts');
  click(t.w,'[data-workspace-tool="extract"]');assert.equal(new URL(t.d.querySelector('#project-page iframe:not([hidden])').src).searchParams.get('projectId'),'B');
  assert.equal(t.errors.length,0,t.errors.map(e=>e.message).join('\n'));await tick();t.w.close();
 }
 {
  const t=setup('?view=new-project&returnTo=https://attacker.example');await tick();
  t.w.AIMSTEP.registerToolProject('https://attacker.example');assert.equal(new URL(t.w.location.href).searchParams.has('returnTo'),false);await tick();t.w.close();
 }
 {
  const t=setup('?view=project&projectId=A');await tick();const delayed={A:[],B:[]};
  t.w.AIMSTEPProjectTasks={...tasks,collect:id=>new Promise(resolve=>delayed[id].push(resolve))};
  t.w.dispatchEvent(new t.w.Event('focus'));click(t.w,'.pw-card:nth-of-type(2) .pw-open');
  assert.equal(delayed.A.length,1);assert.equal(delayed.B.length,1);
  delayed.B[0]({data:{search:{unique:71}},errors:[]});await tick();
  const label=t.d.querySelector('[data-task-status="search-strategy.html"]');assert.match(label.textContent,/71 records/);
  delayed.A[0]({data:{search:{unique:12}},errors:[]});await tick();assert.match(label.textContent,/71 records/,'late project A cannot overwrite selected project B');
  assert.equal(t.errors.length,0);await tick();t.w.close();
 }
 console.log('PASS Proposal/Report and eight workflow actions/statuses, free tool order, explicit project URLs, global blank navigation, project isolation and safe return destinations');
 {
  const t=setup('?view=project&projectId=A');await tick();
  const tools=[...t.d.querySelectorAll('.project-tool-row')].map(a=>({key:a.dataset.workspaceTool,file:new URL(a.href).pathname}));
  for(const tool of tools){
   click(t.w,'.project-tool-row[data-workspace-tool="'+tool.key+'"] .workspace-step-name');
   assert(t.d.body.classList.contains('project-page-mode'));
   assert.equal(new URL(t.d.querySelector('#project-page iframe:not([hidden])').src).searchParams.get('projectId'),'A');
   assert.equal(new URL(t.w.location.href).pathname,tool.file,'clicking the tool name directly enters its operation page');
   click(t.w,'.pw-card:first-child .pw-open');await tick();
  }
  const label=t.d.querySelector('[data-task-status="title-abstract-screening.html"]'),poll=t.polls.find(p=>p.delay===2000);assert(poll);
  const write=screened=>t.w.localStorage.setItem('aimstep-screen-summary:A',JSON.stringify({sourceCount:924,screened,pending:924-screened,conflictsPending:2}));
  write(921);poll.fn();await tick();assert.match(label.textContent,/921 screened/,'visible project progress refreshes without navigation');
  write(922);t.w.dispatchEvent(new t.w.StorageEvent('storage',{key:'aimstep-screen-summary:A'}));await new Promise(resolve=>setTimeout(resolve,130));await tick();assert.match(label.textContent,/922 screened/,'saved progress events refresh the compact row');
  const currentUrl=t.w.location.href,filesBefore=t.d.querySelectorAll('iframe').length;
  t.w.dispatchEvent(new t.w.CustomEvent('aimstep:screening-updated'));await new Promise(resolve=>setTimeout(resolve,130));await tick();
  assert.equal(t.w.location.href,currentUrl);assert.equal(t.d.querySelectorAll('iframe').length,filesBefore,'progress updates do not reopen or restart tools');
  click(t.w,'[data-workspace-tool="screen"]');const frame=t.d.querySelector('#project-page iframe:not([hidden])'),src=frame.src;frame.syntheticRunningTask={progress:39};
  let scans=0;t.w.AIMSTEPProjectTasks={...tasks,collect:async()=>{scans++;return {data:{},errors:[]};}};poll.fn();await tick();assert.equal(scans,0,'the hidden project list does not scan storage during tool operation');
  click(t.w,'.pw-card:first-child .pw-open');await tick();click(t.w,'[data-workspace-tool="screen"]');assert.equal(frame.src,src);assert.equal(frame.syntheticRunningTask.progress,39,'returning to the same tool keeps its running frame');
  assert.equal(t.errors.length,0,t.errors.map(e=>e.message).join('\n'));await tick();t.w.close();
 }
 {
  const t=setup('?view=project&projectId=A',undefined,true);await tick();await tick();
  const progress=t.d.getElementById('project-task-progress');
  assert.equal(progress.previousElementSibling.textContent,'Alpha');
  assert.equal(t.d.getElementById('project-workspace').previousElementSibling.querySelector('.pw-card-title').textContent,'Alpha');
  const search=t.d.getElementById('pw-search');search.value='Alpha';search.dispatchEvent(new t.w.Event('input'));await tick();
  assert.equal(t.d.querySelector('.pw-card:nth-of-type(1)').hidden,false,'progress fraction does not pollute project title search');
  search.value='';search.dispatchEvent(new t.w.Event('input'));click(t.w,'.pw-card:nth-of-type(2) .pw-open');await tick();
  assert.equal(progress.previousElementSibling.textContent,'Beta');assert.equal(progress.querySelector('.workspace-progress-label').textContent,'1/10');
  assert.equal(t.d.getElementById('project-workspace').previousElementSibling.querySelector('.pw-card-title').textContent,'Beta');
  assert.equal(t.d.querySelectorAll('.project-name-progress-row .pw-card-title').length,2);
  assert.equal(t.d.querySelectorAll('.workspace-progress-group').length,1,'a single progress bar follows the selected project');
  click(t.w,'.pw-card:nth-of-type(2) .pw-open');await tick();assert.equal(progress.hidden,true);assert.equal(t.d.getElementById('project-workspace').hidden,true);
  click(t.w,'.pw-card:nth-of-type(1) .pw-open');await tick();
  // The project registry can replace its list after a load or account refresh.
  await t.w.AIMSTEP.projectController.load();await tick();await tick();
  assert.equal(t.d.getElementById('project-task-progress'),progress,'list reload reattaches the existing progress widget');
  assert.equal(t.d.getElementById('project-workspace').previousElementSibling.querySelector('.pw-card-title').textContent,'Alpha');
  assert.equal(t.errors.length,0,t.errors.map(e=>e.message).join('\n'));await tick();t.w.close();
 }
 {
  const t=setup('',[]);await tick();
  assert.equal(t.d.getElementById('project-workspace').hidden,true,'before project registration both writing actions remain hidden');
  assert.equal(t.d.querySelector('.site-header a[href*="build-protocol"],.site-header a[href*="drafting-manuscript"],#toolset-trigger'),null);
  assert.equal(JSON.parse(t.w.localStorage.getItem('aimstep-protocol:A')).text,'Existing writing draft','hidden writing data is retained');
  assert.equal(t.created(),0,'viewing the homepage never creates a project automatically');
  assert.equal(t.errors.length,0);await tick();t.w.close();
 }
 console.log('PASS one project name with inline 10-tool progress, immediate tool placement, title search, project switching, collapse and registry reload');
 console.log('PASS flat tool-name navigation, all ten direct destinations, two-second progress refresh, save-event updates and preserved running tool frames');
})().catch(e=>{console.error(e);process.exitCode=1});
