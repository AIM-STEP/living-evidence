/* Durable download queue on the user's configured local helper. No model calls. */
(function(root){
'use strict';
function create({base='http://127.0.0.1:8765',token,fetchImpl=globalThis.fetch}={}){
  const endpoint=base.replace(/\/$/,'')+'/api/eligibility/fulltext',jobs=new Map();
  let available=null,checkedAt=0;
  const signature=r=>JSON.stringify([r.uid,r.doi||'',r.pmid||'',r.title||'',r.year||'',r.url||'']);
  async function request(body,signal,timeout=6000){
    const ctl=new AbortController(),abort=()=>ctl.abort();
    if(signal?.aborted)throw new DOMException('Stopped','AbortError');
    signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,timeout);
    try{
      const options={method:body?'POST':'GET',mode:'cors',credentials:'omit',signal:ctl.signal,cache:'no-store',referrerPolicy:'no-referrer',targetAddressSpace:'loopback'};
      if(body){options.headers={'Content-Type':'application/json'};options.body=JSON.stringify({...body,token});}
      const response=await fetchImpl(endpoint+(body?'':'/health'),options);
      if(!response.ok)throw new Error('Local download assistant unavailable');
      return await response.json();
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  async function health(signal){
    if(available!==null&&Date.now()-checkedAt<(available?60000:30000))return available;
    try{available=(await request(null,signal,2500)).service==='aimstep-fulltext-assistant';}
    catch(e){if(signal?.aborted)throw e;available=false;}
    checkedAt=Date.now();return available;
  }
  async function submit(records,{signal,force=false}={}){
    if(!records.length||!await health(signal))return false;
    try{
      for(let i=0;i<records.length;i+=128){
        const batch=records.slice(i,i+128),result=await request({action:'submit',force,records:batch.map(r=>({uid:r.uid,title:r.title,doi:r.doi,pmid:r.pmid,year:r.year,url:r.url}))},signal);
        for(let j=0;j<batch.length;j++)if(result.jobs?.[j]?.id)jobs.set(signature(batch[j]),result.jobs[j].id);
      }
      return true;
    }catch(e){if(signal?.aborted)throw e;available=false;checkedAt=Date.now();return false;}
  }
  async function retrieve(record,{signal,readPdf,readXml,pdfOnly=false,waitMs=0}={}){
    if(!await health(signal))return null;
    if(!jobs.has(signature(record))&&!await submit([record],{signal}))return null;
    const id=jobs.get(signature(record)),until=Date.now()+waitMs;
    if(!id)return null;
    let job;
    do{
      try{job=(await request({action:'result',ids:[id]},signal,15000)).jobs?.[0];}
      catch(e){if(signal?.aborted)throw e;available=false;checkedAt=Date.now();return null;}
      if(!job)return null;
      if(job.got&&(!pdfOnly||job.got.kind==='pdf')){
        const got=job.got,raw=Uint8Array.from(atob(got.data),c=>c.charCodeAt(0));
        try{
          if(got.sha256&&globalThis.crypto?.subtle){const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),v=>v.toString(16).padStart(2,'0')).join('');if(digest!==got.sha256)throw new Error('Cached file checksum mismatch');}
          let file,paras;
          if(got.kind==='pdf'){file=new Blob([raw],{type:'application/pdf'});paras=await readPdf(file,record);}
          else if(got.kind==='xml'&&readXml)paras=await readXml(new TextDecoder().decode(raw),record);
          else throw new Error('Unsupported full text');
          return {got:{kind:got.kind,filename:got.filename,source:got.source,url:got.url,file,paras},attempts:job.attempts||[],pending:job.state==='retry'};
        }catch(e){return {got:null,attempts:[...(job.attempts||[]),{source:'Local assistant',status:'not-readable',detail:String(e.message).slice(0,160)}],pending:false};}
      }
      if(!['queued','running'].includes(job.state)||Date.now()>=until)break;
      await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('Stopped','AbortError'));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},1000);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();});
    }while(true);
    return {got:null,attempts:[...(job.attempts||[]),{source:'Local assistant queue',status:job.state}],pending:['queued','running','retry'].includes(job.state)};
  }
  async function cancel(records){
    const ids=records.map(r=>jobs.get(signature(r))).filter(Boolean);
    for(let i=0;i<ids.length;i+=128)await request({action:'cancel',ids:ids.slice(i,i+128)});
  }
  return {health,submit,retrieve,cancel};
}
const api={create};root.AimstepFulltextAssistant=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
