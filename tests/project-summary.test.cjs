const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function source(name,next){const start=html.indexOf('        function '+name+'('),end=html.indexOf('        function '+next+'(',start);assert(start>0&&end>start);return html.slice(start,end);}
function setup(){
 const link=()=>({attrs:{},setAttribute(k,v){this.attrs[k]=v;}});
 const cards=['A','B'].map(id=>{const open=link();return {dataset:{projectId:id},hidden:false,title:'Project '+id,querySelector:()=>open,link:open};});
 const classes=new Set(),name={textContent:''},env={expandedProjectId:null,activeProject:null,page:{hidden:true},list:{querySelectorAll:()=>cards},document:{body:{classList:{toggle(k,v){if(v)classes.add(k);else classes.delete(k);}}},getElementById:()=>name},currentProjectId:(link,card)=>card.dataset.projectId,currentProjectName:card=>card.title};
 env.rememberProject=(id,title)=>{env.activeProject={id,name:title};env.dataOwner=id;};
 env.setView=view=>{env.expandedProjectId=view==='project'?env.activeProject.id:null;env.renderProjectSummary();};
 vm.createContext(env);vm.runInContext(source('renderProjectSummary','refreshProject')+source('toggleProjectSummary','openStep'),env);
 return {env,cards,name,classes,click:index=>env.toggleProjectSummary(cards[index].link,cards[index])};
}
test('each project click expands its own summary and a second click collapses it',()=>{
 const {env,cards,name,click}=setup();env.renderProjectSummary();assert(env.page.hidden);
 click(0);assert(!env.page.hidden);assert.equal(name.textContent,'Project A');assert.equal(cards[0].link.attrs['aria-expanded'],'true');assert.equal(env.dataOwner,'A');
 click(0);assert(env.page.hidden);assert.equal(cards[0].link.attrs['aria-expanded'],'false');
 click(1);assert(!env.page.hidden);assert.equal(name.textContent,'Project B');assert.equal(env.dataOwner,'B');
 click(0);assert.equal(name.textContent,'Project A');assert.equal(cards[1].link.attrs['aria-expanded'],'false');assert.equal(env.dataOwner,'A');
 click(0);assert(env.page.hidden);
});
test('no projects, deleted projects and filtered-out selections never display a summary',()=>{
 const {env,cards,classes,click}=setup();click(0);cards[0].hidden=true;env.renderProjectSummary();assert(env.page.hidden);assert(!classes.has('project-workspace-mode'));
 cards[0].hidden=false;env.renderProjectSummary();assert(!env.page.hidden);
 cards.length=0;env.renderProjectSummary();assert(env.page.hidden);assert(!classes.has('project-workspace-mode'));
});
