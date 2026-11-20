/* Keep Criteria deep links, editor frames and releases in sync. */
(function(root){
  'use strict';
  const commonJS=typeof module==='object'&&module.exports;
  const scriptURL=commonJS?null:new URL(document.currentScript.src);
  const current=commonJS?require('./eligibility-release.json').version:scriptURL.searchParams.get('v');
  let latest=current;
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
    let known=latest;
    // A long-lived workspace can open a fresh editor without reloading itself.
    if(!commonJS&&root.top!==root)try{known=newest(known,root.top.AIMSTEPCriteriaRelease?.latest);}catch(_){}
    const version=newest(newest(known,target.searchParams.get('appVersion')),requested);
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
        // The workspace can expose a nested public route via history.pushState.
        const url=scriptURL?new URL('eligibility-release.json',scriptURL):new URL('app/eligibility-release.json',env.location.href);
        url.searchParams.set('check',String(Math.floor(now/60000)));
        const response=await env.fetch(url,{cache:'no-store',referrerPolicy:'no-referrer'});
        if(!response.ok)return;
        latest=newest(latest,(await response.json()).version);
        if(latest!==current)onUpdate?.(latest);
      }catch(_){}finally{checking=false;}
    }
    env.addEventListener('pageshow',check);
    env.addEventListener('focus',check);
    env.document.addEventListener('visibilitychange',check);
    env.setInterval(check,120000);
    check();
  }
  const api={current,get latest(){return latest;},newest,tool,editorURL,watch};
  if(commonJS)module.exports=api;
  else{
    root.AIMSTEPCriteriaRelease=api;
    if(root.top===root&&/(?:\/|\/index\.html)$/i.test(root.location.pathname))watch(root);
  }
})(typeof window==='object'?window:globalThis);
