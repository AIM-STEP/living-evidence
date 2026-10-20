/* DOM integration test. Run with jsdom available on NODE_PATH. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pages=['eligibility','search-strategy','build-protocol','title-abstract-screening','full-text-screening','extraction','risk-of-bias','analysis','certainty-of-evidence','drafting-manuscript'];
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
(async()=>{
 for(const [index,page] of pages.entries()) {
  const dom=new JSDOM(read(page+'.html'),{url:'https://aimsetp.com/'+page+'.html?projectId=synthetic%20project',runScripts:'outside-only'}),w=dom.window,d=w.document;
  const nav=d.querySelector('.tool-flow');
  assert(nav,page+' navigation');assert.equal(d.querySelector('.crumb'),null,page+' breadcrumb removed');
  assert.equal(d.querySelector('header nav'),null,page+' duplicate header menu removed');
  assert.equal(d.querySelectorAll('header .brand-main').length,1,page+' common brand');
  assert.equal(d.querySelectorAll('link[href^="app/tool-shell.css"]').length,1);
  assert.equal(d.querySelectorAll('script[src^="app/tool-shell.js"]').length,1);
  const ids=[...d.querySelectorAll('[id]')].map(el=>el.id);assert.equal(new Set(ids).size,ids.length,page+' unique IDs');
  const fallbackNames=[...nav.querySelectorAll('option')].map(option=>option.textContent);
  fallbackNames.forEach(name=>assert.doesNotMatch(name,/^\d/,page+' fallback has no number prefix'));
  const studyField=d.querySelector('textarea');if(studyField)studyField.value='Synthetic original research text';
  w.localStorage.setItem('aimstep-lang','zh');w.localStorage.setItem('synthetic-original','unchanged');
  w.eval(read('app/tool-i18n-catalog.js'));w.eval(read('app/tool-i18n.js'));await tick();
  let savedByOriginalNext=0;
  if(page==='eligibility')d.getElementById('next-search-strategy').addEventListener('click',()=>savedByOriginalNext++);
  w.eval(read('app/tool-shell.js'));
  const next=nav.querySelector('[data-flow-next]'),prev=nav.querySelector('[data-flow-previous]'),picker=nav.querySelector('select');
  const checkProject=link=>assert.equal(new URL(link.href).searchParams.get('projectId'),'synthetic project');
  assert.equal(picker.options.length,10);assert.equal(picker.value,page+'.html');
  [...picker.options].forEach(option=>assert.doesNotMatch(option.textContent,/^\d/,page+' Chinese has no number prefix'));
  assert.match(picker.selectedOptions[0].textContent,/[\u4e00-\u9fff]/,page+' translated step');
  assert.equal(nav.querySelector('[data-flow-position]').textContent,(index+1)+' / 10');
  assert.equal(new URL(next.href).pathname,'/'+(index===9?'index':pages[index+1])+'.html');checkProject(next);
  if(index) { assert.equal(new URL(prev.href).pathname,'/'+pages[index-1]+'.html');checkProject(prev); }
  else { assert.equal(prev.hasAttribute('href'),false);assert.equal(prev.getAttribute('aria-disabled'),'true'); }
  checkProject(nav.querySelector('[data-flow-home]'));
  const destinations=[];
  d.addEventListener('click',event=>{const a=event.target.closest('a[href]');if(a&&!event.defaultPrevented){destinations.push(a.href);event.preventDefault();}});
  if(index<9) {picker.value=pages[index+1]+'.html';picker.dispatchEvent(new w.Event('change'));assert.equal(destinations.at(-1),next.href);}
  if(page==='eligibility')assert.equal(savedByOriginalNext,1,'existing next/save handler retained');
  picker.value=pages[(index+5)%10]+'.html';picker.dispatchEvent(new w.Event('change'));
  assert.equal(new URL(destinations.at(-1)).pathname,'/'+pages[(index+5)%10]+'.html');assert.equal(picker.value,page+'.html');
  let before=0;d.addEventListener('aimstep:before-tool-navigation',e=>{before++;e.preventDefault();});
  const prior=destinations.length;nav.querySelector('[data-flow-home]').click();assert.equal(before,1);assert.equal(destinations.length,prior,'failed-save cancellation respected');
  w.AIMSTEP.setLanguage('en');assert.deepEqual([...picker.options].map(option=>option.textContent),fallbackNames);assert.equal(prev.textContent,'Previous');
  assert.equal(w.localStorage.getItem('synthetic-original'),'unchanged');
  if(studyField)assert.equal(studyField.value,'Synthetic original research text');
  console.log('PASS:',page,'project context, adjacent steps, jumps, cancellation, locale and original data');
  w.close();
 }
 for(const alias of ['project','id']){
  const dom=new JSDOM(read('search-strategy.html'),{url:'https://aimsetp.com/search-strategy.html?'+alias+'=legacy-project',runScripts:'outside-only'});
  dom.window.eval(read('app/tool-shell.js'));
  assert.equal(new URL(dom.window.document.querySelector('[data-flow-next]').href).searchParams.get('projectId'),'legacy-project');dom.window.close();
 }
 const home=new JSDOM(read('index.html')).window.document;
 assert.deepEqual([...home.querySelectorAll('#toolset [data-tool]')].map(a=>a.getAttribute('href').replace('.html','')),pages,'homepage and navigation order match');
 console.log('PASS: legacy project aliases and homepage ten-step order');
})().catch(e=>{console.error(e);process.exitCode=1;});
