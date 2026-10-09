/* Outcome-specific GRADE parameters. No clinical thresholds are inferred. */
(function(root){'use strict';
const frameworks={PICO:['Population','Intervention','Comparator','Outcome'],PECO:['Population','Exposure','Comparator','Outcome'],PCC:['Population','Concept','Context'],PICo:['Population','Phenomenon of Interest','Context'],Other:['Question']};
const clean=v=>String(v??'').trim(),num=v=>typeof v==='number'&&Number.isFinite(v),ci=v=>v&&['point','ci_lower','ci_upper'].every(k=>num(v[k])),ordered=v=>ci(v)&&v.ci_lower<=v.point&&v.point<=v.ci_upper;
const mdKeys={8:'x_direct_md',20:'x_low_rob_md',21:'x_high_rob_md',35:'x_indirect_md',49:'x_nma_md',63:'x_final_md',64:'x_absolute_md',65:'x_absolute_md'};
function continuous(r){return r.x_unit?.type==='continuous';}
function key(r,f){return continuous(r)&&mdKeys[f.no]||f.key;}
function spec(r,f){if(continuous(r)&&mdKeys[f.no])return {...f,key:mdKeys[f.no],name:f.no===64||f.no===65?'Absolute mean difference (95% CI)':f.name.replace(/RR/g,'MD'),type:'rd_ci',rule:'Mean difference and 95% CI in the outcome’s original scale; intervention minus control. No per-1000 rescaling.'};if(f.no===66)return {...f,name:'Imprecision against the unit-specific MID',rule:'Use the MID and effect direction entered for this assessment unit. Assess imprecision once, on the final absolute effect.'};return f;}
function unit(r,meta={}){return {framework:'PICO',population:'',outcome:meta.outcome||'',timepoint:'',type:'binary',scale:'',direction:'',mid:null,midSource:'',baselineSource:'',ois:null,oisSource:'',participants:null,studies:null,design:'',...r.x_unit};}
function issues(r,meta){const u=unit(r,meta),out=[];for(const [k,label] of [['population','Population'],['outcome','Outcome'],['timepoint','Time point'],['design','Study design']])if(!clean(u[k]))out.push(label+' is required.');if(!clean(r.intervention)||!clean(r.control))out.push('A directed intervention/exposure and comparator are required.');
 if(!['binary','continuous'].includes(u.type))out.push('Select an outcome type.');
 if(!['higher','lower'].includes(u.direction))out.push('Select whether a higher or lower outcome is better.');
 if(u.mid!==null&&u.mid!==''&&(!num(u.mid)||u.mid<=0||(u.type==='binary'&&u.mid>1000)))out.push('Enter a positive MID'+(u.type==='binary'?' no greater than 1000 per 1000.':' in the original scale.'));
 if(u.type==='binary'&&r.x_baseline_risk_per_1000!=null&&r.x_baseline_risk_per_1000!==''&&(!num(r.x_baseline_risk_per_1000)||r.x_baseline_risk_per_1000<0||r.x_baseline_risk_per_1000>1000))out.push('Enter the control-group baseline risk (0–1000 per 1000).');
 if(u.type==='continuous'&&!clean(u.scale))out.push('Enter the outcome scale/unit for the MD and MID.');
 if(u.ois!==null&&(!Number.isInteger(u.ois)||u.ois<=0||!clean(u.oisSource)))out.push('OIS must be a positive whole number with its assumptions/source.');
 for(const k of ['participants','studies'])if(u[k]!==null&&(!Number.isInteger(u[k])||u[k]<1))out.push('Number of '+k+' must be a positive whole number.');
 if(!['RCT','Randomized controlled trials'].includes(u.design))out.push('This approved workflow starts randomized evidence at high certainty. Other designs need a separate approved rating method.');
 return out;
}
function zones(v,u){if(!ordered(v)||!num(u.mid)||u.mid<=0||!['higher','lower'].includes(u.direction))return null;const xs=[v.ci_lower,v.ci_upper].map(x=>u.direction==='lower'?-x:x).sort((a,b)=>a-b),at=x=>x< -u.mid-1e-12*Math.max(1,u.mid)?0:x>u.mid+1e-12*Math.max(1,u.mid)?2:1;return ['important harm','little/no important effect','important benefit'].slice(at(xs[0]),at(xs[1])+1);}
function absolute(rr,br){if(!ordered(rr)||rr.ci_lower<=0||!num(br)||br<0||br>1000)return null;const values=Object.values(rr);if(values.some(x=>br*x>1000))return null;return Object.fromEntries(['point','ci_lower','ci_upper'].map(k=>[k,br*(rr[k]-1)]));}
function parameterRows(r,meta){const u=unit(r,meta);return [['ID',r.id],['Question framework',u.framework],['Population',u.population],['Intervention / exposure',r.intervention],['Comparator',r.control],['Outcome',u.outcome],['Time point',u.timepoint],['Study design',u.design],['Other framework components',JSON.stringify(u.extra||{})],['Outcome type',u.type],['Effect measure',u.type==='continuous'?'MD':'RR'],['Scale / unit',u.type==='continuous'?u.scale:'per 1000'],['Higher / lower is better',u.direction],['MID',u.mid],['MID source',u.midSource],['Control baseline risk per 1000',u.type==='binary'?r.x_baseline_risk_per_1000:'NA'],['Baseline risk source',u.type==='binary'?u.baselineSource:'NA'],['OIS',u.ois],['OIS assumptions / source',u.oisSource],['Participants in final estimate',u.participants],['Studies in final estimate',u.studies],['Source',u.source||'Manual'],['Source feedback',u.feedback||'']];}
const api={frameworks,continuous,key,spec,unit,issues,zones,absolute,parameterRows,mdKeys,ordered};if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepCoeUnits=api;
})(globalThis);
