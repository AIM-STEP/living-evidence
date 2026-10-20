/* Route regressions for the combined project workflow and Toolset dashboard. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const routeWindow={};routeWindow.top={};routeWindow.self={};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/secure-origin.js'),'utf8'),{window:routeWindow,URL,location:{href:'https://aimsetp.com/'}});
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
function source(name, next) {
  const start = html.indexOf('        function ' + name + '(');
  const end = html.indexOf('        function ' + next + '(', start);
  assert(start >= 0 && end > start);
  return html.slice(start, end);
}
function element() {
  const attrs = {};
  return {hidden: true, dataset: {}, attrs,
    setAttribute(k,v) { attrs[k] = v; },
    getAttribute(k) { return attrs[k]; },
    removeAttribute(k) { delete attrs[k]; },
    toggleAttribute(k,v) { if(v) attrs[k]=''; else delete attrs[k]; }};
}
function setup(query = '') {
  const nodes = Object.fromEntries(['pw-form','pw-create-title','projects'].map(id => [id, element()]));
  const classes = new Set();
  const toolNav = element(); toolNav.dataset.pageHref = 'workflow.html';
  const env = {URL, URLSearchParams, console, location: new URL('https://aimsetp.com/index.html' + query),
    home: new URL('https://aimsetp.com/index.html'), projectRoute: '/workflow/project',
    activeProject: {id: 'synthetic-dashboard', name: 'Synthetic dashboard'},
    page: element(), otherPage: element(), toolset: element(), frame: element(), projectName: element(),
    document: {title:'', body:{classList:{toggle(k,v){if(v)classes.add(k);else classes.delete(k);}}},
      getElementById(id) {return nodes[id];}, querySelectorAll() {return [];}},
    window: {AIMSTEP_ROUTES:routeWindow.AIMSTEP_ROUTES,AIMSTEP:{t:k=>k}, scrollTo(){}},
    history: {state:null,pushState(state,_,url){this.state=state;this.url=url;},replaceState(state,_,url){this.state=state;this.url=String(url);}},
    renderSetupStatus(){},refreshProject(){},readContext(){return null;},
    rememberProject(id,name){env.activeProject={id,name};},
    sitePage(value){return value ? new URL(value,env.home) : null;}
  };
  vm.createContext(env);
  vm.runInContext(source('isProjectRoute','routeUrl') + source('routeUrl','isToolsetPage') +
    source('isToolsetPage','renderProjectLink') + source('setView','sitePage') +
    source('sitePage','restoreRoute') + source('restoreRoute','followLink'), env);
  return {env,nodes,classes,toolNav};
}
for (const query of ['', '?view=toolset', '?view=project&projectId=synthetic-dashboard', '?view=new-project']) {
  const {env,nodes,classes,toolNav} = setup(query);
  env.restoreRoute();
  assert(classes.has('toolset-mode'), query);
  assert.equal(env.toolset.hidden,false,query);
  assert.equal(env.otherPage.hidden,true,query);
  assert.equal(env.page.hidden,!query.includes('view=project'),query);
  assert.equal(nodes['pw-form'].hidden,!query.includes('new-project'),query);
}
{
  const {env,nodes,classes}=setup();
  env.setView('new-project',null,true);
  assert(classes.has('project-create-mode'));
  env.setView('page',new URL('https://aimsetp.com/extraction.html'),true);
  assert(classes.has('project-page-mode'));
  assert(!classes.has('toolset-mode'));
  assert(!classes.has('project-create-mode'));
  assert(nodes['pw-form'].hidden);
  assert.equal(new URL(env.frame.src).searchParams.get('projectId'),'synthetic-dashboard');
  assert(env.toolset.hidden);
  env.setView('toolset',null,true);
  assert(!env.toolset.hidden);
  assert(env.otherPage.hidden);
  assert(env.history.url.includes('projectId=synthetic-dashboard'));
  env.setView('page',new URL('https://aimsetp.com/workflow.html'),false);
  assert(!env.toolset.hidden);
  assert(!classes.has('project-page-mode'));
}
{
  const {env}=setup('?view=new-project');
  env.restoreRoute();
  env.location=new URL('https://aimsetp.com/index.html?view=toolset');
  env.restoreRoute();
  assert(env.document.getElementById('pw-form').hidden);
  env.location=new URL('https://aimsetp.com/index.html?view=new-project');
  env.restoreRoute();
  assert(!env.document.getElementById('pw-form').hidden);
}
console.log('PASS: home, Toolset, project selection, create/back/forward, full-page tools, project context and legacy Workflow routing');
{
  const {env}=setup('?view=toolset');
  env.activeProject=null;
  env.restoreRoute();
  assert(!env.toolset.hidden);
  assert(env.page.hidden);
  env.setView('page',new URL('https://aimsetp.com/analysis.html'),false);
  assert(!env.otherPage.hidden);
  assert.equal(new URL(env.frame.src).searchParams.has('projectId'),false);
}
{
  const legacy=fs.readFileSync(path.join(__dirname,'../workflow.html'),'utf8');
  const redirect=legacy.match(/<script>\s*\/\/ Keep bookmarked workflow links[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g,'');
  let destination;
  const location={href:'https://aimsetp.com/workflow.html?projectId=synthetic-dashboard&lang=zh#tool-search',search:'?projectId=synthetic-dashboard&lang=zh',hash:'#tool-search',replace(url){destination=new URL(url);}};
  vm.runInNewContext(redirect,{URL,location});
  assert.equal(destination.pathname,'/index.html');
  assert.equal(destination.searchParams.get('view'),'toolset');
  assert.equal(destination.searchParams.get('projectId'),'synthetic-dashboard');
  assert.equal(destination.searchParams.get('lang'),'zh');
  assert.equal(destination.hash,'#tool-search');
}
console.log('PASS: signed-out dashboard and legacy redirect preserve project, language and anchor');

for (const [file,slug] of Object.entries(routeWindow.AIMSTEP_ROUTES)) {
 const {env}=setup();
 env.setView('page',new URL('https://aimsetp.com/'+file+'?projectId=synthetic-dashboard&lang=zh'),true);
 assert.equal(new URL(env.history.url,'https://aimsetp.com').pathname,'/'+slug+'/');
 assert(!env.history.url.includes('index.html'));
 env.location=new URL('https://aimsetp.com/'+slug+'/?projectId=synthetic-dashboard&lang=zh');
 env.restoreRoute();
 assert.equal(new URL(env.frame.src).pathname,'/'+file);
 assert.equal(new URL(env.frame.src).searchParams.get('projectId'),'synthetic-dashboard');
 const entry=fs.readFileSync(path.join(__dirname,'..',slug,'index.html'),'utf8');
 let destination;
 vm.runInNewContext(entry.match(/<script>(.*?)<\/script>/s)[1],{URL,location:{href:env.location.href,search:env.location.search,hash:'#saved',replace(url){destination=new URL(url);}}});
 assert.equal(destination.pathname,'/');
 assert.equal(destination.searchParams.get('page'),file);
 assert.equal(destination.searchParams.get('lang'),'zh');
 assert.equal(destination.hash,'#saved');
 const old=setup('?view=page&page='+file+'&project=legacy-project&lang=zh');old.env.restoreRoute();
 assert.equal(new URL(old.env.history.url).pathname,'/'+slug+'/');
 assert.equal(new URL(old.env.frame.src).searchParams.get('project'),'legacy-project');
}
console.log('PASS: all ten clean tool routes, static reload entries, legacy links and project/language context');
