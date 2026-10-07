const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../search-strategy.html'),'utf8');
const db=html.slice(html.indexOf('const DB={'),html.indexOf('\nconst params=',html.indexOf('const DB={')));
const compiler=html.slice(html.indexOf('const PROXIMITY='),html.indexOf('\nconst wait='));
const ctx={state:{limits:{apply:true,start:'2020-01-01',end:'2026-12-31',language:'english',other:''}},lines:v=>String(v||'').split('\n').filter(Boolean),dq:v=>'"'+v.replace(/"/g,'')+'"',isRctDesign:()=>false,now:()=>'',draftHash:()=>''};
vm.createContext(ctx);vm.runInContext(db+compiler+'\nglobalThis.databases=DB;',ctx);
const concepts=[{label:'Population',terms:'fibromyalgia\n纤维肌痛',mesh:'Fibromyalgia'},{label:'Intervention',terms:'exercise',mesh:''}];
for(const id of ['cochrane','cinahl','psycinfo','cnki','wanfang','vip','sinomed']){
 const q=ctx.compileQuery(id,concepts);assert(q.text.includes('AND'));assert(q.text.includes('fibromyalgia'));assert(!q.text.includes('[MeSH Terms]'));assert(q.notes.some(n=>n.includes('limits in the database interface')));assert.equal(ctx.databases[id].direct,false);
 if(ctx.databases[id].chinese){assert(q.text.includes('纤维肌痛'));assert(q.notes.some(n=>n.includes('not a verified command-line query')))}
 if(id==='cochrane')assert(q.text.includes(':ti,ab,kw'));
 if(['cinahl','psycinfo'].includes(id))assert(q.text.includes('TI "exercise" OR AB "exercise"'));
}
assert.equal(Object.keys(ctx.databases).length,13);
const renderer=html.slice(html.indexOf('function renderDatabaseChoices()'),html.indexOf('\nfunction draftHash()'));
assert(!renderer.includes('<small>'));
console.log('PASS: all added databases compile drafts; external access, bilingual terms, limit guidance and hidden subtitles');

const embase=ctx.compileQuery('embase',concepts);assert(!embase.text.includes('/exp'));assert(embase.notes.some(n=>n.includes('MeSH is not Emtree')));
