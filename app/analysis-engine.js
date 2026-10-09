/* AIM-STEP numerical engine; extracted from the existing Analysis page. */
(function(root){
'use strict';
const NMA=(()=>{
// ---- small dense linear algebra ----
const zeros=(r,c)=>Array.from({length:r},()=>new Array(c).fill(0));
function inv(A){const n=A.length,M=A.map((r,i)=>[...r,...Array.from({length:n},(_,j)=>i===j?1:0)]);
  for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;
    if(Math.abs(M[p][c])<1e-14)throw new Error('The network is not connected, or a treatment has no data.');
    [M[c],M[p]]=[M[p],M[c]];const d=M[c][c];for(let j=0;j<2*n;j++)M[c][j]/=d;
    for(let r=0;r<n;r++)if(r!==c&&M[r][c]){const f=M[r][c];for(let j=0;j<2*n;j++)M[r][j]-=f*M[c][j]}}
  return M.map(r=>r.slice(n));}
function chol(A){const n=A.length,L=zeros(n,n);for(let i=0;i<n;i++)for(let j=0;j<=i;j++){let s=A[i][j];for(let k=0;k<j;k++)s-=L[i][k]*L[j][k];if(i===j){if(s<=0)s=1e-300;L[i][i]=Math.sqrt(s)}else L[i][j]=s/L[j][j]}return L}
function logdet(A){const L=chol(A);let s=0;for(let i=0;i<L.length;i++)s+=2*Math.log(L[i][i]);return s}
const mm=(A,B)=>A.map(r=>B[0].map((_,j)=>r.reduce((s,v,k)=>s+v*B[k][j],0)));
const mv=(A,x)=>A.map(r=>r.reduce((s,v,k)=>s+v*x[k],0));
const tr=A=>A[0].map((_,j)=>A.map(r=>r[j]));
// ---- normal distribution ----
function pnorm(z){const t=1/(1+0.2316419*Math.abs(z)),d=0.3989422804014327*Math.exp(-z*z/2),p=d*t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));return z>0?1-p:p}
function erfc(x){const z=Math.abs(x),t=1/(1+0.5*z),r=t*Math.exp(-z*z-1.26551223+t*(1.00002368+t*(0.37409196+t*(0.09678418+t*(-0.18628806+t*(0.27886807+t*(-1.13520398+t*(1.48851587+t*(-0.82215223+t*0.17087277)))))))));return x>=0?r:2-r}
const Phi=z=>0.5*erfc(-z/Math.SQRT2);
const Z975=1.959963984540054;
function pchisq(q,df){if(df<=0||!(q>0))return q>0?0:1;return 1-gammainc(df/2,q/2)}
function gammainc(a,x){// regularised lower incomplete gamma P(a,x)
  if(x<a+1){let s=1/a,t=s;for(let n=1;n<500;n++){t*=x/(a+n);s+=t;if(Math.abs(t)<1e-15*Math.abs(s))break}return s*Math.exp(-x+a*Math.log(x)-lgamma(a))}
  let b=x+1-a,c=1e300,d=1/b,h=d;for(let i=1;i<500;i++){const an=-i*(i-a);b+=2;d=an*d+b;if(Math.abs(d)<1e-300)d=1e-300;c=b+an/c;if(Math.abs(c)<1e-300)c=1e-300;d=1/d;const del=d*c;h*=del;if(Math.abs(del-1)<1e-15)break}
  return 1-Math.exp(-x+a*Math.log(x)-lgamma(a))*h}
function lgamma(x){const g=[76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];let y=x,t=x+5.5;t-=(x+0.5)*Math.log(t);let s=1.000000000190015;for(const c of g)s+=c/++y;return -t+Math.log(2.5066282746310005*s/x)}

/* ---- arm-level data -> study contrasts ----
   measure: OR, RR, MD, SMD. Binary studies with a zero cell get 0.5 added
   to every cell of that study; studies with no events (or only events) in
   every arm carry no information and are left out (netmeta defaults). */
function contrasts(rows,measure){
  const by=new Map();for(const r of rows){if(!by.has(r.study))by.set(r.study,[]);by.get(r.study).push(r)}
  const studies=[],dropped=[];
  for(const [study,arms0] of by){
    const arms=arms0.filter(a=>a.treat&&Number.isFinite(a.n)&&a.n>0);
    if(new Set(arms.map(a=>a.treat)).size<2){dropped.push({study,why:'fewer than two treatments'});continue}
    if(new Set(arms.map(a=>a.treat)).size!==arms.length){dropped.push({study,why:'a treatment appears twice; combine those arms first'});continue}
    let est,v;
    if(measure==='OR'||measure==='RR'){
      if(arms.some(a=>!Number.isFinite(a.event)||a.event<0||a.event>a.n)){dropped.push({study,why:'events missing or out of range'});continue}
      if(arms.every(a=>a.event===0)||(measure==='OR'&&arms.every(a=>a.event===a.n))){dropped.push({study,why:arms.every(a=>a.event===0)?'no events in any arm':'all participants had the event in every arm'});continue}
      const zero=arms.some(a=>a.event===0||a.event===a.n),inc=zero?0.5:0; // any empty cell (as meta/netmeta)
      // OR: 0.5 added to events and non-events; RR: 0.5 added to events and to the total (as meta/netmeta)
      est=arms.map(a=>{const e=a.event+inc,n=a.n+(measure==='OR'?2:1)*inc;return measure==='OR'?Math.log(e/(n-e)):Math.log(e/n)});
      v=arms.map(a=>{const e=a.event+inc,n=a.n+(measure==='OR'?2:1)*inc;return measure==='OR'?1/e+1/(n-e):1/e-1/n});
    }else{
      if(arms.some(a=>!Number.isFinite(a.mean)||!(a.sd>0))){dropped.push({study,why:'mean or SD missing'});continue}
      if(measure==='MD'){est=arms.map(a=>a.mean);v=arms.map(a=>a.sd*a.sd/a.n)}
      else{// SMD (Hedges' g) against the pooled SD of the study
        const N=arms.reduce((s,a)=>s+a.n,0),sp=Math.sqrt(arms.reduce((s,a)=>s+(a.n-1)*a.sd*a.sd,0)/(N-arms.length)),J=Math.exp(lgamma((N-arms.length)/2)-0.5*Math.log((N-arms.length)/2)-lgamma((N-arms.length-1)/2));
        est=arms.map(a=>J*a.mean/sp);v=arms.map((a,i)=>1/a.n+0)/* variance of each arm's standardised mean */;
        // add the g^2 term to each contrast's variance below
        studies.push({study,treats:arms.map(a=>a.treat),est,v,smd:{N,J},n:arms.map(a=>a.n),zero:false});continue}
    }
    studies.push({study,treats:arms.map(a=>a.treat),est,v,n:arms.map(a=>a.n),event:arms.map(a=>a.event),zero:(measure==='OR'||measure==='RR')&&arms.some(a=>a.event===0||a.event===a.n)});
  }
  return {studies,dropped};
}

/* Build y, S (block diagonal) and P (tau^2 structure) for contrasts of each
   study's arms against its first arm. */
function design(studies,treats){
  const T=treats.length,idx=new Map(treats.map((t,i)=>[t,i]));
  const y=[],X=[],blocks=[];
  for(const s of studies){
    const k=s.treats.length,b={study:s.study,rows:[],S:zeros(k-1,k-1),P:zeros(k-1,k-1),treats:s.treats};
    for(let j=1;j<k;j++){
      let yj=s.est[j]-s.est[0];
      const row=new Array(T-1).fill(0),a=idx.get(s.treats[j]),c=idx.get(s.treats[0]);
      if(a>0)row[a-1]+=1;if(c>0)row[c-1]-=1;
      y.push(yj);X.push(row);b.rows.push(y.length-1);
    }
    for(let i=0;i<k-1;i++)for(let j=0;j<k-1;j++){
      if(s.smd){const gi=s.est[i+1]-s.est[0],gj=s.est[j+1]-s.est[0];b.S[i][j]=1/s.n[0]+(i===j?1/s.n[i+1]+gi*gi/(2*s.smd.N):gi*gj/(2*s.smd.N))}
      else b.S[i][j]=s.v[0]+(i===j?s.v[i+1]:0);
      b.P[i][j]=i===j?1:0.5;
    }
    blocks.push(b);
  }
  return {y,X,blocks,T};
}
function gls(D,tau2){// estimate with V = S + tau2 P, block by block
  const p=D.T-1,XtWX=zeros(p,p),XtWy=new Array(p).fill(0),Winv=[];
  for(const b of D.blocks){const V=b.S.map((r,i)=>r.map((v,j)=>v+tau2*b.P[i][j])),W=inv(V);Winv.push(W);
    for(let i=0;i<b.rows.length;i++)for(let j=0;j<b.rows.length;j++){const w=W[i][j],xi=D.X[b.rows[i]],xj=D.X[b.rows[j]];for(let a=0;a<p;a++){if(!xi[a])continue;XtWy[a]+=xi[a]*w*D.y[b.rows[j]];for(let c=0;c<p;c++)if(xj[c])XtWX[a][c]+=xi[a]*w*xj[c]}}}
  const C=inv(XtWX),theta=mv(C,XtWy);
  let Q=0;D.blocks.forEach((b,k)=>{const r=b.rows.map(i=>D.y[i]-D.X[i].reduce((s,v,a)=>s+v*theta[a],0));for(let i=0;i<r.length;i++)for(let j=0;j<r.length;j++)Q+=r[i]*Winv[k][i][j]*r[j]});
  return {theta,C,Q,W:Winv,XtWX};
}
// generalised DerSimonian-Laird (Jackson, White & Riley 2012): tau2 = (Q - df) / tr(A P), A = W - W X (X'WX)^-1 X' W
function tauDL(D,fit,df){
  const C=fit.C;let trace=0;
  // tr(A P) = sum_blocks tr(W_b P_b) - tr(C * sum_b X_b' W_b P_b W_b X_b)
  const p=D.T-1,M=zeros(p,p);
  D.blocks.forEach((b,k)=>{const W=fit.W[k],n=b.rows.length,WP=mm(W,b.P),WPW=mm(WP,W);for(let i=0;i<n;i++)trace+=WP[i][i];
    for(let i=0;i<n;i++)for(let j=0;j<n;j++){const xi=D.X[b.rows[i]],xj=D.X[b.rows[j]],w=WPW[i][j];for(let a=0;a<p;a++)if(xi[a])for(let c=0;c<p;c++)if(xj[c])M[a][c]+=xi[a]*w*xj[c]}});
  for(let a=0;a<p;a++)for(let c=0;c<p;c++)trace-=C[a][c]*M[c][a];
  return Math.max(0,(fit.Q-df)/trace);
}
function connected(studies,treats){const adj=new Map(treats.map(t=>[t,new Set()]));for(const s of studies)for(const a of s.treats)for(const b of s.treats)if(a!==b)adj.get(a).add(b);const seen=new Set([treats[0]]),q=[treats[0]];while(q.length){const t=q.pop();for(const u of adj.get(t))if(!seen.has(u)){seen.add(u);q.push(u)}}return treats.filter(t=>!seen.has(t))}
const effect=(theta,C,i,j)=>{// treat j vs treat i, both indices into treats (0 = reference)
  const e=(j?theta[j-1]:0)-(i?theta[i-1]:0),v=(j?C[j-1][j-1]:0)+(i?C[i-1][i-1]:0)-2*(i&&j?C[i-1][j-1]:0);return {est:e,se:Math.sqrt(Math.max(v,0))}};

/* ---- frequentist ---- */
function frequentist(rows,{measure,reference,model='random',smallBetter=false}){
  const {studies,dropped}=contrasts(rows,measure);
  if(!studies.length)throw new Error('No study has usable data for this outcome.');
  let treats=[...new Set(studies.flatMap(s=>s.treats))].sort((a,b)=>a.localeCompare(b));
  if(reference&&treats.includes(reference))treats=[reference,...treats.filter(t=>t!==reference)];
  const lost=connected(studies,treats);if(lost.length)throw new Error('The network is not connected: '+lost.join(', ')+' cannot be reached from '+treats[0]+'.');
  const D=design(studies,treats),nContr=D.y.length,df=nContr-(treats.length-1);
  const common=gls(D,0),tau2=df>0?tauDL(D,common,df):0,re=gls(D,tau2),fit=model==='random'?re:common;
  const T=treats.length,league=[];
  for(let i=0;i<T;i++){league.push([]);for(let j=0;j<T;j++)league[i].push(i===j?null:effect(fit.theta,fit.C,i,j))}
  // direct evidence for each pair: inverse-variance pooling of the study contrasts for that pair with the same tau^2
  const pairs=new Map();
  for(const s of studies)for(let a=0;a<s.treats.length;a++)for(let b=a+1;b<s.treats.length;b++){
    let [ta,tb,ea,eb,va,vb]=[s.treats[a],s.treats[b],s.est[a],s.est[b],s.v[a],s.v[b]];
    if(treats.indexOf(ta)>treats.indexOf(tb)){[ta,tb,ea,eb,va,vb]=[tb,ta,eb,ea,vb,va]}
    let y=eb-ea,v=va+vb;
    if(s.smd){y=eb-ea;v=1/s.n[s.treats.indexOf(ta)]+1/s.n[s.treats.indexOf(tb)]+y*y/(2*s.smd.N)}
    const k=ta+'\u0000'+tb;if(!pairs.has(k))pairs.set(k,{a:ta,b:tb,studies:[],y:[],v:[],multi:[]});const p=pairs.get(k);p.studies.push(s.study);p.y.push(y);p.v.push(v);p.multi.push(s.treats.length>2);
  }
  const tauUse=model==='random'?tau2:0;
  const split=[...pairs.values()].map(p=>{
    // Direct pair pooling; back-calculation below is exposed only for networks of two-arm trials.
    const w=p.y.map((_,i)=>1/(p.v[i]+tauUse));const sw=w.reduce((a,b)=>a+b,0),dir=w.reduce((s,wi,i)=>s+wi*p.y[i],0)/sw,vdir=1/sw;
    const i=treats.indexOf(p.a),j=treats.indexOf(p.b),nma=effect(fit.theta,fit.C,i,j),vn=nma.se**2;
    const prop=Math.min(1,vn/vdir);let ind=null,vind=null,z=null,pv=null;
    if(prop<0.999){vind=1/(1/vn-1/vdir);ind=vind*(nma.est/vn-dir/vdir);z=(dir-ind)/Math.sqrt(vdir+vind);pv=2*(1-Phi(Math.abs(z)))}
    return {a:p.a,b:p.b,k:p.studies.length,studies:p.studies,multi:p.multi.some(Boolean),direct:{est:dir,se:Math.sqrt(vdir)},indirect:ind===null?null:{est:ind,se:Math.sqrt(vind)},nma,propDirect:prop,z,p:pv};
  });
  // design-by-treatment decomposition of Q (common effect)
  const designs=new Map();for(const s of studies){const d=[...s.treats].sort().join(':');if(!designs.has(d))designs.set(d,[]);designs.get(d).push(s)}
  let Qwithin=0,dfWithin=0;const perDesign=[];
  for(const [d,ss] of designs){if(ss.length<2){continue}
    const order=d.split(':'),local=ss.map(s=>{const o=order.map(t=>s.treats.indexOf(t));return {...s,treats:o.map(i=>s.treats[i]),est:o.map(i=>s.est[i]),v:o.map(i=>s.v[i]),n:o.map(i=>s.n[i])}});
    const Dd=design(local,order),fd=gls(Dd,0),dfd=Dd.y.length-(order.length-1);Qwithin+=fd.Q;dfWithin+=dfd;perDesign.push({design:d.replace(/:/g,' vs '),studies:ss.length,Q:fd.Q,df:dfd,p:pchisq(fd.Q,dfd)})}
  const Qbetween=Math.max(0,common.Q-Qwithin),dfBetween=df-dfWithin;
  // P-scores (Ruecker & Schwarzer 2015)
  const sign=smallBetter?-1:1,pscore=treats.map((t,i)=>{let s=0;for(let j=0;j<T;j++)if(j!==i){const e=effect(fit.theta,fit.C,j,i);s+=e.se>0?Phi(sign*e.est/e.se):0.5}return s/(T-1)});
  return {measure,model,treats,reference:treats[0],studies:studies.map(s=>({study:s.study,treats:s.treats,n:s.n,event:s.event,zero:s.zero})),dropped,
    k:studies.length,nContr,df,Q:common.Q,pQ:pchisq(common.Q,df),tau2,tau:Math.sqrt(tau2),I2:df>0&&common.Q>0?Math.max(0,(common.Q-df)/common.Q):0,
    Qwithin,dfWithin,pWithin:pchisq(Qwithin,dfWithin),Qbetween,dfBetween,pBetween:pchisq(Qbetween,dfBetween),perDesign,
    league,split:studies.some(s=>s.treats.length>2)?[]:split,splitNote:studies.some(s=>s.treats.length>2)?'Back-calculated direct/indirect shares are not reported for multi-arm networks.':'',pscore,fit:{theta:fit.theta,C:fit.C}};
}

/* ---- Bayesian (normal likelihood, finite tau grid) ---- */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function bayesian(rows,{measure,reference,smallBetter=false,prior={type:'halfnormal',scale:1},draws=20000,seed=2026,priorSD=100}){
  const {studies,dropped}=contrasts(rows,measure);
  if(!studies.length)throw new Error('No study has usable data for this outcome.');
  let treats=[...new Set(studies.flatMap(s=>s.treats))].sort((a,b)=>a.localeCompare(b));
  if(reference&&treats.includes(reference))treats=[reference,...treats.filter(t=>t!==reference)];
  const lost=connected(studies,treats);if(lost.length)throw new Error('The network is not connected: '+lost.join(', ')+'.');
  const D=design(studies,treats),p=treats.length-1,T=treats.length;
  const upper=prior.type==='uniform'?prior.max:prior.scale*5,G=400,grid=[],logpost=[];
  const logprior=t=>prior.type==='uniform'?(t<=prior.max?0:-Infinity):-(t*t)/(2*prior.scale*prior.scale);
  // log marginal likelihood of tau: y ~ N(0, V_tau + X Sigma0 X'), evaluated through the GLS pieces:
  // log p(y|tau) = -1/2 [ log|V| + log|Sigma0| + log|X'V^-1X + Sigma0^-1| + y'V^-1y - b'(X'V^-1X+Sigma0^-1)^-1 b ] + const, b = X'V^-1y
  const prec0=1/(priorSD*priorSD);
  const piece=tau=>{const t2=tau*tau,A=zeros(p,p),b=new Array(p).fill(0);let ldV=0,yVy=0;
    for(const bl of D.blocks){const V=bl.S.map((r,i)=>r.map((v,j)=>v+t2*bl.P[i][j])),W=inv(V);ldV+=logdet(V);const n=bl.rows.length;
      for(let i=0;i<n;i++)for(let j=0;j<n;j++){const w=W[i][j],xi=D.X[bl.rows[i]],xj=D.X[bl.rows[j]],yj=D.y[bl.rows[j]];yVy+=D.y[bl.rows[i]]*w*yj;for(let a=0;a<p;a++){if(!xi[a])continue;b[a]+=xi[a]*w*yj;for(let c=0;c<p;c++)if(xj[c])A[a][c]+=xi[a]*w*xj[c]}}}
    for(let a=0;a<p;a++)A[a][a]+=prec0;
    const C=inv(A),m=mv(C,b),quad=b.reduce((s,v,a)=>s+v*m[a],0);
    return {lp:-0.5*(ldV+logdet(A)+yVy-quad),C,m}};
  for(let g=0;g<G;g++){const t=(g+0.5)/G*upper;grid.push(t);logpost.push(logprior(t)+piece(t).lp)}
  const mx=Math.max(...logpost),wts=logpost.map(l=>Math.exp(l-mx)),sw=wts.reduce((a,b)=>a+b,0),cdf=[];let acc=0;for(const w of wts){acc+=w/sw;cdf.push(acc)}
  const rnd=mulberry32(seed),gauss=()=>{let u=0,v=0;while(!u)u=rnd();v=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};
  const cache=new Map(),D_=[],taus=[];
  for(let s=0;s<draws;s++){
    const u=rnd();let g=cdf.findIndex(c=>c>=u);if(g<0)g=G-1;const tau=grid[g]+(rnd()-0.5)*upper/G;taus.push(Math.max(0,tau));
    if(!cache.has(g)){const pc=piece(grid[g]);cache.set(g,{m:pc.m,L:chol(pc.C)})}
    const {m,L}=cache.get(g),z=Array.from({length:p},gauss);D_.push(m.map((mi,a)=>mi+L[a].reduce((s2,l,c)=>s2+(c<=a?l*z[c]:0),0)));
  }
  const q=(arr,pr)=>{const s=[...arr].sort((a,b)=>a-b);const h=(s.length-1)*pr,l=Math.floor(h);return s[l]+(s[Math.min(l+1,s.length-1)]-s[l])*(h-l)};
  const d=(i,j,dd)=>(j?dd[j-1]:0)-(i?dd[i-1]:0);
  const league=[];for(let i=0;i<T;i++){league.push([]);for(let j=0;j<T;j++){if(i===j){league[i].push(null);continue}const v=D_.map(dd=>d(i,j,dd));league[i].push({median:q(v,0.5),lo:q(v,0.025),hi:q(v,0.975),mean:v.reduce((a,b)=>a+b,0)/v.length,pGt0:v.filter(x=>x>0).length/v.length})}}
  // rank probabilities: rank 1 = best
  const rankP=treats.map(()=>new Array(T).fill(0)),sign=smallBetter?1:-1;
  for(const dd of D_){const eff=treats.map((_,i)=>sign*(i?dd[i-1]:0));const order=eff.map((e,i)=>[e,i]).sort((a,b)=>a[0]-b[0]);order.forEach(([,i],r)=>rankP[i][r]++)}
  rankP.forEach(r=>r.forEach((c,k)=>r[k]=c/draws));
  const sucra=rankP.map(r=>{let cum=0,s=0;for(let k=0;k<T-1;k++){cum+=r[k];s+=cum}return T>1?s/(T-1):1});
  return {measure,treats,reference:treats[0],dropped,k:studies.length,league,rankP,sucra,
    tau:{median:q(taus,0.5),lo:q(taus,0.025),hi:q(taus,0.975)},prior,draws,seed,priorSD,
    note:'Normal likelihood on study contrasts (NICE DSU TSD2), Approximate sampling: tau from its finite grid posterior ('+G+' points), d given tau from its normal posterior.'};
}
return {contrasts,frequentist,bayesian,Phi,pchisq,Z975};
})();

if(typeof module==='object'&&module.exports)module.exports=NMA;else root.AimstepAnalysisEngine=NMA;
})(globalThis);
