'use strict';
const assert=require('node:assert/strict');
const {t,el,context,html,documentHandlers,windowHandlers}=require('./fixtures/screening-page.cjs')();
const records=['yes','maybe','no','conflict'].map(uid=>({uid,title:'Synthetic '+uid,abstract:'Adults received treatment.',authors:['Synthetic Author'],year:'2026',journal:'Synthetic',doi:'',pmid:'',url:'',volume:'',issue:'',pages:'',provenance:[{db:'pubmed',runId:'synthetic'}]}));
t.setup(records,{rows:[{title:'Population',condition:'Adults'}]});t.bindSave(async()=>{});
const state=t.get(),answer=(decision,judgment)=>({decision,stageSig:t.stageSig(),criteriaSig:'synthetic-criteria',model:'synthetic-model',criteria:[{dimension:'Population',judgment,quote:judgment==='unclear'?'':'Adults received treatment.',reason:'Synthetic judgment.'}]});
for(const r of records){state.full.ai[r.uid]=answer(r.uid==='no'||r.uid==='conflict'?'no':r.uid,r.uid==='no'||r.uid==='conflict'?'not met':r.uid==='yes'?'met':'unclear');state.full.ai2[r.uid]=r.uid==='conflict'?answer('yes','met'):structuredClone(state.full.ai[r.uid]);}
let downloads=[];t.bindDownload((name,mime,contents)=>downloads.push({name,mime,contents}));
const button=el('export-results'),menu=el('results-export-menu'),attrs={};el('source-export-menu').hidden=true;menu.hidden=true;
button.setAttribute=(key,value)=>attrs[key]=value;button.getBoundingClientRect=()=>({left:900,top:640,bottom:670});button.focus=()=>{context.document.activeElement=button};menu.offsetWidth=240;menu.offsetHeight=210;context.window.innerWidth=1024;context.window.innerHeight=700;
const formats=['ris','revman','csv','bib','json'],items=formats.map(format=>({dataset:{resultsExport:format},focus(){context.document.activeElement=this}}));menu.querySelectorAll=()=>items;
const event=key=>({key,preventDefault(){this.prevented=true},stopPropagation(){}});
async function globalEvent(handlers,type,e){for(const fn of handlers[type]||[])await fn(e)}
(async()=>{
 assert(!html.includes('id="export-format"'));assert(!html.includes('for="export-format"'));assert(html.includes('id="results-export-menu"'));assert(html.includes('aria-controls="results-export-menu"'));
 for(const format of formats)assert(html.includes('data-results-export="'+format+'"'));
 el('export-option').value='include';t.updateExportCount();assert(!button.disabled);
 await button.fire('click');assert(!menu.hidden);assert.equal(downloads.length,0,'Opening Export must not immediately download');assert.equal(attrs['aria-expanded'],'true');assert.equal(context.document.activeElement,items[0]);assert.equal(menu.style.left,'772px');assert.equal(menu.style.top,'426px');
 await menu.fire('keydown',event('End'));assert.equal(context.document.activeElement,items[4]);await menu.fire('keydown',event('ArrowDown'));assert.equal(context.document.activeElement,items[0]);await menu.fire('keydown',event('ArrowUp'));assert.equal(context.document.activeElement,items[4]);await menu.fire('keydown',event('Home'));assert.equal(context.document.activeElement,items[0]);
 await globalEvent(documentHandlers,'keydown',event('Escape'));assert(menu.hidden);assert.equal(attrs['aria-expanded'],'false');assert.equal(context.document.activeElement,button);
 await button.fire('keydown',event('ArrowUp'));assert.equal(context.document.activeElement,items[4]);await menu.fire('keydown',event('Tab'));assert(menu.hidden);
 for(const format of formats){
  await button.fire('click');const item=items.find(i=>i.dataset.resultsExport===format);await menu.fire('click',{target:{closest:()=>item}});assert(menu.hidden);assert.equal(context.document.activeElement,button);const last=downloads.at(-1);assert(last.name.endsWith('.'+({revman:'ris'}[format]||format)));assert(last.contents.includes('Synthetic yes'));assert(last.contents.includes('Synthetic maybe'));assert(!last.contents.includes('Synthetic no'));assert(!last.contents.includes('Synthetic conflict'));
 }
 assert.equal(downloads.length,5);const json=JSON.parse(downloads.at(-1).contents);assert.deepEqual(json.records.map(r=>r.uid),['yes','maybe']);
 await button.fire('click');await globalEvent(documentHandlers,'click',{target:{closest:()=>null}});assert(menu.hidden);
 await button.fire('click');await globalEvent(windowHandlers,'resize',{});assert(menu.hidden);
 await button.fire('click');await globalEvent(windowHandlers,'scroll',{});assert(menu.hidden);
 await button.fire('click');el('export-option').value='exclude';await el('export-option').fire('change');assert(menu.hidden);assert.equal(el('export-count').textContent,'1 record · 1 still without a decision');
 await button.fire('click');await menu.fire('click',{target:{closest:()=>items[4]}});assert.deepEqual(JSON.parse(downloads.at(-1).contents).records.map(r=>r.uid),['no']);
 const before=downloads.length;t.exportResults('invalid');assert.equal(downloads.length,before);
 t.setup([],{rows:[{title:'Population',condition:'Adults'}]});t.updateExportCount();assert(button.disabled);await button.fire('click');assert(menu.hidden);assert.equal(downloads.length,before);
 console.log('PASS Export dropdown, keyboard/outside/resize dismissal, viewport bounds, five real formats, selected decision scope and disabled empty exports');
})().catch(e=>{console.error(e);process.exitCode=1});
