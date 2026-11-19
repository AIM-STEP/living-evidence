/* Keep Criteria deep links, editor frames and releases in sync. */
(function(root){
  'use strict';
  const commonJS=typeof module==='object'&&module.exports;
  const current=commonJS?require('./eligibility-release.json').version:new URL(document.currentScript.src).searchParams.get('v');
  // The standalone route generator embeds this pure function in its tiny entry page.
  function newest(current,requested){
    const pattern=/^(\d{8})-criteria-release-(\d{1,6})$/;
    const next=pattern.exec(requested||''),local=pattern.exec(current||'');
    if(!next)return current;
    return !local||next[1]>local[1]||(next[1]===local[1]&&Number(next[2])>Number(local[2]))?requested:current;
  }
  function tool(file){
    return ['eligibility.html','search-strategy.html','title-abstract-screening.html','full-text-screening.html'].includes(file);
  }
  function editorURL(url,requested){
    const target=new URL(url);
    const version=newest(newest(current,target.searchParams.get('appVersion')),requested);
    target.searchParams.set('appVersion',version);
    target.searchParams.delete('criteriaPreviewVersion');
    return target;
  }
  function watch(env,onUpdate){
    let checking=false,scheduled=0;
    async function check(){
      const now=Date.now();
      if(checking||env.document.visibilityState==='hidden'||now<scheduled)return;
      checking=true;scheduled=now+60000;
      try{
        const url=new URL('app/eligibility-release.json',env.location.href);
        url.searchParams.set('check',String(Math.floor(now/60000)));
        const response=await env.fetch(url,{cache:'no-store',referrerPolicy:'no-referrer'});
        if(!response.ok)return;
        const available=newest(current,(await response.json()).version);
        if(available!==current)onUpdate(available);
      }catch(_){}finally{checking=false;}
    }
    env.addEventListener('pageshow',check);
    env.addEventListener('focus',check);
    env.document.addEventListener('visibilitychange',check);
    env.setInterval(check,120000);
    check();
  }
  const api={current,newest,tool,editorURL,watch};
  if(commonJS)module.exports=api;else root.AIMSTEPCriteriaRelease=api;
})(typeof window==='object'?window:globalThis);
