/* Stage assignments never change the original eligibility criteria. */
(function(root){
  'use strict';
  const clean=v=>String(v??'').trim();
  function hash(v){let h=2166136261;for(const c of JSON.stringify(v)){h=Math.imul(h^c.charCodeAt(0),16777619)}return (h>>>0).toString(16)}
  function parts(value){
    const text=clean(value);
    if(!text)return [];
    // Split only explicit sequential numbered lists, never prose, decimals or alternatives.
    if(/\b(or|either|unless|except)\b|或者|或|除非/i.test(text))return [text];
    const matches=[...text.matchAll(/(?:^|\s)(\d{1,2})[.)]\s*(?=[A-Za-z\u3400-\u9fff])/g)];
    if(matches.length<2||text.slice(0,matches[0].index).trim()||matches.some((m,i)=>Number(m[1])!==i+1))return [text];
    return matches.map((m,i)=>text.slice(m.index+m[0].length,matches[i+1]?.index??text.length).trim()).filter(Boolean);
  }
  function items(criteria){
    const out=[],seen=new Map();
    for(const row of criteria?.rows||[]){
      const dimension=clean(row.title)||'Criterion';
      // Definitions can qualify the whole inclusion rule: keep that group intact.
      const inclusion=clean(row.definition)?[clean(row.condition),clean(row.definition)].filter(Boolean).join('\n'):null;
      for(const [kind,values] of [['inclusion',inclusion?[inclusion]:parts(row.condition)],['exclusion',parts(row.uncertain)]]){
        values.forEach((text,index)=>{
          const base=hash([dimension,kind,text]),n=(seen.get(base)||0)+1;seen.set(base,n);
          out.push({id:base+'-'+n,dimension,kind,text,label:dimension+' · '+(kind==='inclusion'?'Inclusion':'Exclusion')+' '+(index+1)});
        });
      }
    }
    // Unique model-facing names even when upstream dimensions repeat.
    const names=new Map();
    return out.map(item=>{const n=(names.get(item.label)||0)+1;names.set(item.label,n);return {...item,label:item.label+(n>1?' ('+n+')':'')}});
  }
  function valid(config,criteria,sig){
    const list=items(criteria);
    return !!config&&config.sourceSig===sig&&list.length>0&&list.length<=100&&list.every(i=>['abstract','fulltext'].includes(config.assignments?.[i.id]))&&list.some(i=>config.assignments[i.id]==='abstract');
  }
  function active(criteria,config){
    return {...criteria,rows:items(criteria).filter(i=>config?.assignments?.[i.id]==='abstract').map(i=>({
      title:i.label,condition:i.kind==='inclusion'?i.text:'',uncertain:i.kind==='exclusion'?i.text:'',definition:'',stageItemId:i.id
    }))};
  }
  function signature(config){return config?hash([config.sourceSig,config.assignments]):''}
  const api={items,parts,valid,active,signature};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepScreeningStages=api;
})(typeof globalThis==='undefined'?this:globalThis);
