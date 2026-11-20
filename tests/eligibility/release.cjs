const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {test}=require('node:test');
const release=require('../../app/eligibility-release.js');
const html=fs.readFileSync('eligibility.html','utf8'),future='20991231-criteria-release-12';

test('public entry and old .html deep links forward the newer release, project and language',()=>{
 const shim=fs.readFileSync('app/secure-origin.js','utf8');
 for(const slug of ['eligibility','search-strategy','title-and-abstract-screening','full-text-assess']){
  const entry=fs.readFileSync(slug+'/index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const location=new URL('https://aimsetp.com/'+slug+'/?appVersion='+future+'&projectId=p&lang=zh#criteria');
  let dest;location.replace=value=>dest=new URL(value);
  vm.runInNewContext(entry,{URL,location});
  const file=dest.searchParams.get('page');
  assert.equal(dest.searchParams.get('appVersion'),future);
  const page=new URL(file+location.search+location.hash,location.origin);
  page.replace=value=>dest=new URL(value);
  const window={AIMSTEPCriteriaRelease:release};window.top=window.self=window;
  vm.runInNewContext(shim,{URL,location:page,window});
  assert.equal(dest.searchParams.get('appVersion'),future);
  assert.equal(dest.searchParams.get('projectId'),'p');
  assert.equal(dest.searchParams.get('lang'),'zh');assert.equal(dest.hash,'#criteria');
 }
 assert.equal(release.newest('20261119-criteria-release-10','20261119-criteria-release-9'),'20261119-criteria-release-10');
 assert.equal(release.newest(release.current,'old'),release.current);
 for(const file of ['index','eligibility','search-strategy','title-abstract-screening','full-text-screening']){
  assert(fs.readFileSync(file+'.html','utf8').includes('app/eligibility-release.js?v='+release.current));
 }
});

test('search and both screening pages pass the same release into editing and preview frames',()=>{
 for(const file of ['search-strategy','title-abstract-screening','full-text-screening']){
  const page=fs.readFileSync(file+'.html','utf8'),link=page.match(/function pageLink\(file,view\)\{[\s\S]*?\n\}/)[0];
  const location=new URL('https://aimsetp.com/'+file+'.html?projectId=q&appVersion='+future);
  const href=vm.runInNewContext(link+";pageLink('eligibility.html')",{URL,location,projectId:'q',window:{AIMSTEPCriteriaRelease:release}});
  assert.equal(new URL(href).searchParams.get('appVersion'),future);
  assert.equal(new URL(href).searchParams.get('projectId'),'q');
  assert.doesNotMatch(page,/editorVersion|criteriaPreviewVersion/);
 }
});

test('release discovery is background-only, rate limited and carries no project data',async()=>{
 const events={};let calls=0,reported;
 const env={location:new URL('https://aimsetp.com/eligibility.html?projectId=private'),
  document:{visibilityState:'visible',addEventListener:(name,fn)=>events[name]=fn},
  setInterval(fn){events.interval=fn;},addEventListener:(name,fn)=>events[name]=fn,
  fetch:async(url,opts)=>{
   calls++;
   assert.equal(url.pathname,'/app/eligibility-release.json');
   assert.equal(url.searchParams.has('projectId'),false);assert.equal(opts.cache,'no-store');
   return {ok:true,json:async()=>({version:future})};
  }};
 release.watch(env,v=>reported=v);events.focus();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(reported,future);assert.equal(calls,1);
 await events.visibilitychange();await events.interval();assert.equal(calls,1);
});

test('idle Criteria updates silently without saving or applying a decision',()=>{
 assert.doesNotMatch(html,/Load updated Criteria|update-criteria-version/i);
 const source=html.slice(html.indexOf('if(!embeddedManual&&!embeddedPreview&&window.AIMSTEPCriteriaRelease){',html.indexOf('let composingQuestion=false;')),html.indexOf("$('question').addEventListener('compositionstart'"));
 let check,applied=0;
 const env={embeddedManual:false,embeddedPreview:false,document:{querySelectorAll:()=>[]},
  generationController:null,manualRefinementController:null,confirmationQueue:null,pendingBackgroundStage:null,lastWorkspaceSaveFailed:false,
  voiceRecognition:null,composingQuestion:false,attachedFiles:[],previewDirty:false,
  location:{href:'https://aimsetp.com/eligibility.html?projectId=p',replace(url){
   assert.equal(new URL(url).searchParams.get('appVersion'),future);assert.equal(new URL(url).searchParams.get('projectId'),'p');applied++;
  }},window:{AIMSTEPCriteriaRelease:{...release,watch(_,fn){check=()=>fn(future);}}}};
 vm.runInNewContext(source,env);
 for(const key of ['generationController','manualRefinementController','confirmationQueue','pendingBackgroundStage','voiceRecognition','composingQuestion','previewDirty','lastWorkspaceSaveFailed']){
  env[key]=true;check();env[key]=false;
 }
 env.attachedFiles.push({});check();env.attachedFiles.pop();
 env.document.activeElement={matches:()=>true};check();env.document.activeElement=null;
 env.document.querySelectorAll=()=>[{value:'unsaved answer'}];check();env.document.querySelectorAll=()=>[];
 assert.equal(applied,0);
 check();assert.equal(applied,1);
});
