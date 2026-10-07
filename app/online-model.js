/* Public-site AI transport. Local pages keep their existing local backend.
 * Firebase tokens are obtained from the existing signed-in session, never URLs
 * or saved configuration. Only the fixed API origin receives these tokens.
 */
(() => {
  'use strict';
  const online = ['aimsetp.com', 'www.aimsetp.com'].includes(location.hostname);
  const origin = 'https://api.aimsetp.com', base = origin + '/api/eligibility';
  const unavailable = 'The online AI service is unavailable. Contact the AIM-STEP administrator; no local model or local network permission is required on this device.';
  const failure = message => Object.assign(new Error(message), {configuration:true, onlineModel:true});
  let authentication;
  async function user() {
    if (!authentication) authentication = (async () => {
      const sdk = 'https://www.gstatic.com/firebasejs/10.12.2/';
      const [apps, auth] = await Promise.all([import(sdk+'firebase-app.js'), import(sdk+'firebase-auth.js')]);
      const app = apps.getApps().length ? apps.getApp() : apps.initializeApp({
        apiKey:'AIzaSyD0ycw--fAzsSrz70RtbRM2t_KkIjW9okA',authDomain:'aim-step.firebaseapp.com',
        projectId:'aim-step',appId:'1:831378341950:web:e15e6146e23026979e116f'
      });
      const instance = auth.getAuth(app);
      await instance.authStateReady();
      return instance;
    })().catch(() => {authentication=null;throw failure('Could not load account verification. Check your connection and reload AIM-STEP.');});
    return (await authentication).currentUser;
  }
  async function signedFetch(url, options={}) {
    if(options.signal?.aborted)throw new DOMException('Stopped','AbortError');
    const account = await user();
    if(!account) {
      try { if(parent.location.origin===location.origin)parent.AIMSTEP?.auth?.signIn(); } catch(_) {}
      throw failure('Sign in to AIM-STEP before using AI tools.');
    }
    let token;
    try {token=await account.getIdToken();} catch(_) {throw failure('Your sign-in session could not be verified. Sign in again.');}
    const headers = new Headers(options.headers);headers.set('Authorization','Bearer '+token);
    const {targetAddressSpace, ...rest} = options;
    let response;
    try {response=await fetch(url,{...rest,headers,credentials:'omit',cache:'no-store',redirect:'error'});}
    catch(e){if(options.signal?.aborted)throw e;throw failure(unavailable);}
    if(!response.ok) {
      let message=unavailable;
      try{message=(await response.json()).error||message;}catch(_){}
      throw failure(message);
    }
    return response;
  }
  function delay(signal) {
    return new Promise((resolve,reject)=>{
      const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new DOMException('Stopped','AbortError'));};
      const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},1200);
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    });
  }
  async function request(url,options={}) {
    const parsed=new URL(url,location.href);
    if(!online||parsed.origin!==origin)return fetch(url,options);
    const response=await signedFetch(url,options);
    if(response.status!==202)return response;
    const job=await response.json();
    if(!/^[A-Za-z0-9_-]{20,80}$/.test(job.jobId||''))throw failure('Invalid online AI response.');
    const jobURL=base+'/jobs/'+job.jobId;
    try {
      while(true){
        await delay(options.signal);
        const poll=await signedFetch(jobURL,{signal:options.signal});
        const result=await poll.json();
        if(poll.status===202)continue;
        return new Response(JSON.stringify(result.result),{status:result.httpStatus,headers:{'Content-Type':'application/json'}});
      }
    } finally {
      signedFetch(jobURL,{method:'DELETE',signal:AbortSignal.timeout(5000)}).catch(()=>{});
    }
  }
  window.AIMSTEPOnlineModel = Object.freeze({online,base,origin,unavailable,request});
})();
