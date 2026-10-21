const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function setup(){
 const rows=[{title:'Exercise for pain',archived:false},{title:'中文疼痛综述',archived:false},{title:'Exercise archive',archived:true}].map(row=>({...row,dataset:{},hidden:false}));
 const grid={hidden:false,querySelectorAll:()=>rows};
 const tab=()=>({setAttribute(){}}),env={currentTab:tab(),archivedTab:tab(),showingArchived:false,projectSearch:{value:''},listEmpty:{hidden:false,textContent:''},list:{querySelectorAll:selector=>selector==='.pw-card'?rows:[grid],querySelector:()=>null},titleOf:row=>row.title,isArchived:row=>row.archived,translateActions(){},window:{AIMSTEP:{t:key=>key}}};
 env.document={dispatchEvent(){}};env.CustomEvent=class {};
 vm.createContext(env);const start=html.indexOf('        function selectProjectTab('),end=html.indexOf('        function enhanceCard(',start);assert(start>0&&end>start);vm.runInContext(html.slice(start,end),env);
 return {env,rows,grid,select:archived=>env.selectProjectTab(archived)};
}
test('search combines with current and archived tabs and clearing restores the selected view',()=>{
 const {env,rows,grid,select}=setup();select(false);assert.deepEqual(rows.map(row=>row.hidden),[false,false,true]);
 env.projectSearch.value='  EXERCISE ';select(false);assert.deepEqual(rows.map(row=>row.hidden),[false,true,true]);
 select(true);assert.deepEqual(rows.map(row=>row.hidden),[true,true,false]);
 env.projectSearch.value='中文';select(false);assert.deepEqual(rows.map(row=>row.hidden),[true,false,true]);
 env.projectSearch.value='absent';select(false);assert(rows.every(row=>row.hidden));assert(grid.hidden);assert(!env.listEmpty.hidden);assert.equal(env.listEmpty.textContent,'pw_no_matches');
 env.projectSearch.value='';select(false);assert.deepEqual(rows.map(row=>row.hidden),[false,false,true]);assert(!grid.hidden);assert(env.listEmpty.hidden);
});
test('empty current and archived views show the corresponding localized message',()=>{
 const {env,rows,select}=setup();rows.forEach(row=>row.archived=true);select(false);assert.equal(env.listEmpty.textContent,'pw_empty_current');assert(!env.listEmpty.hidden);
 rows.forEach(row=>row.archived=false);select(true);assert.equal(env.listEmpty.textContent,'pw_empty_archived');assert(!env.listEmpty.hidden);
});

test('loading, sign-in and storage errors retain their source messages',()=>{
 const {env,rows,select}=setup();rows.length=0;
 env.list.querySelector=()=>({textContent:'Sign in to see your projects.'});select(false);assert.equal(env.listEmpty.textContent,'Sign in to see your projects.');
 env.list.querySelector=()=>({textContent:'Project load failed.'});select(false);assert.equal(env.listEmpty.textContent,'Project load failed.');
 env.list.querySelector=()=>null;env.list.childElementCount=0;select(false);assert.equal(env.listEmpty.textContent,'pw_loading');
});
