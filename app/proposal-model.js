/* Proposal requests prefer the model deployed on this device, including on the
 * public site. The authenticated site gateway remains a fallback when no local
 * service is reachable. A failed inference is never silently reissued elsewhere.
 */
(function(root){
'use strict';
function create({fetch,location,online,setTimeout,clearTimeout}){
 let backend=null;
 async function timed(work,signal,ms,label){
  const controller=new AbortController(),abort=()=>controller.abort(signal.reason);
  if(signal?.aborted)throw new DOMException('Stopped','AbortError');
  signal?.addEventListener('abort',abort,{once:true});
  let expired=false;const timer=setTimeout(()=>{expired=true;controller.abort();},ms);
  try{return await work(controller.signal);}catch(error){if(signal?.aborted)throw new DOMException('Stopped','AbortError');if(expired)throw Error(label);throw error;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
 async function find(signal){
  if(backend)return backend;
  const candidates=[],loopback=['localhost','127.0.0.1','[::1]','::1'];
  if(loopback.includes(location.hostname))candidates.push(new URL('/api/eligibility',location.href).href);
  const local='http://127.0.0.1:8765/api/eligibility';if(!candidates.includes(local))candidates.push(local);
  let localError='';
  for(const base of candidates){
   let reply;
   try{reply=await timed(async localSignal=>{const response=await fetch(base+'/health',{signal:localSignal,targetAddressSpace:'loopback'});return {ok:response.ok,body:await response.json()};},signal,7000,'The local AI service did not respond.');}
   catch(error){if(signal?.aborted)throw error;localError=error.message;continue;}
   if(!String(reply.body?.service||'').startsWith('aimstep-local-eligibility'))continue;
   if(!reply.ok)throw Error('The local AI service is running but its model is unavailable. '+String(reply.body.status||reply.body.error||'Start Ollama and check the configured model.'));
   backend={base,local:true};return backend;
  }
  if(online?.online&&typeof online.request==='function'){backend={base:online.base,local:false};return backend;}
  throw Error('Cannot connect to the local AI service at 127.0.0.1:8765. Start the AIM-STEP local model service and allow local network access for this site. '+localError);
 }
 async function request(body,signal){
  const target=await find(signal);
  try{return await timed(async requestSignal=>{
   const options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:requestSignal};
   const response=target.local?await fetch(target.base+'/model',{...options,targetAddressSpace:'loopback'}):await online.request(target.base+'/model',options);
   if(!response.ok){let message='AI service returned HTTP '+response.status;try{message=(await response.json()).error||message;}catch(_){}throw Error(message);}
   return await response.json();
  },signal,600000,'The model request exceeded 10 minutes. Check the local model service and try Generate again.');}
  catch(error){backend=null;if(signal?.aborted||error.name==='AbortError')throw error;if(error instanceof TypeError)throw Error(target.local?'Connection to the local model was interrupted. Check that the local service is running, then try Generate again.':'The online model service could not be reached. Start the local model service on 127.0.0.1:8765, or check the online service.');throw error;}
 }
 return {request};
}
if(typeof module==='object'&&module.exports)module.exports={create};else root.AimstepProposalModel=create({fetch:root.fetch.bind(root),location:root.location,online:root.AIMSTEPOnlineModel,setTimeout:root.setTimeout.bind(root),clearTimeout:root.clearTimeout.bind(root)});
})(globalThis);
