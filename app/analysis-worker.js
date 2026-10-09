'use strict';
importScripts('analysis-core.js?v=2','analysis-engine.js?v=1');
onmessage=({data})=>{
 try{
  const C=AimstepAnalysisCore,ws=data.state;if(!C.canRun(ws))throw Error('Confirm the current data and analysis requirements before starting.');
  const sets=C.datasets(ws.rows),results=[];
  for(const [index,plan]of ws.plan.analyses.entries()){
   const dataset=sets.find(d=>d.id===plan.datasetId);postMessage({type:'progress',value:10+Math.round(75*index/ws.plan.analyses.length),label:'Analysing '+dataset.name});
   const result={dataset,plan,descriptive:{studies:new Set(dataset.rows.map(r=>r.study)).size,arms:dataset.rows.length,participants:dataset.rows.reduce((n,r)=>n+r.n,0)}};
   if(plan.method!=='descriptive'){
    const options={measure:plan.measure,reference:plan.reference,model:plan.model,smallBetter:plan.smallBetter};
    if(['frequentist','both'].includes(plan.method))result.fr=AimstepAnalysisEngine.frequentist(dataset.rows,options);
    if(['bayesian','both'].includes(plan.method))result.by=AimstepAnalysisEngine.bayesian(dataset.rows,{...options,prior:plan.prior==='uniform'?{type:'uniform',max:plan.priorMax}:{type:'halfnormal',scale:plan.priorScale},draws:plan.draws,seed:plan.seed});
   }
   const finite=x=>{if(typeof x==='number'&&!Number.isFinite(x))throw Error('Numerical instability in '+dataset.name+'. Review data and model assumptions.');if(x&&typeof x==='object')Object.values(x).forEach(finite);};finite(result);
   results.push(result);
  }postMessage({type:'done',results});
 }catch(e){postMessage({type:'error',message:e.message});}
};
