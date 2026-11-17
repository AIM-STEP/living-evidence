/* Shared, deterministic checks. Model review complements these checks; it is not a proof. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AIMSTEPCriteriaGrounding=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const VERSION='original-source-v2';
  const clean=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
  function segments(sources){
    const result=[];
    for(const [index,source] of sources.entries()){
      const text=String(source.text||''),sourceId=source.id||'D'+String(index+1).padStart(3,'0');
      const boundaries=[...text.matchAll(/[.!?](?=\s|$)|[。！？]/g)].map(match=>match.index+match[0].length);
      // Preserve complete sentences, condition chains, exact offsets and document tails.
      for(let start=0;start<text.length;){
        let end=Math.min(start+1400,text.length);
        if(end<text.length)end=boundaries.filter(at=>at>start&&at<=end).at(-1)||boundaries.find(at=>at>end)||text.length;
        if(end-start>6000)throw new Error('A source sentence is too long to check without splitting its conditions. Use a focused source excerpt and try again.');
        const fragment=text.slice(start,end);
        if(fragment.trim())result.push({id:'S'+String(result.length+1).padStart(3,'0'),documentId:sourceId,name:source.name||'Source',page:source.page||null,start,end,text:fragment,side:'both',kind:source.kind||'text',verification:source.verification||'original-text'});
        start=end;
      }
    }
    return result;
  }
  function operator(prefix,suffix){
    if(/(?:>=|≥|at least|no (?:less|fewer) than|not less than|minimum(?: of)?|至少|不少于|不低于)\s*$/i.test(prefix)||/^\s*(?:years?|months?|weeks?|days?|岁|年|个?月|周|天)?\s*(?:or (?:older|more|above|greater)|及以上|以上)/i.test(suffix))return '>=';
    if(/(?:<=|≤|at most|no more than|not more than|up to|maximum(?: of)?|至多|不超过|不高于)\s*$/i.test(prefix)||/^\s*(?:years?|months?|weeks?|days?|岁|年|个?月|周|天)?\s*(?:or (?:younger|less|below)|及以下|以下)/i.test(suffix))return '<=';
    if(/(?:>|more than|greater than|older than|over|超过|大于|高于)\s*$/i.test(prefix))return '>';
    if(/(?:<|less than|fewer than|younger than|under|below|小于|低于|不足)\s*$/i.test(prefix))return '<';
    return '=';
  }
  function role(prefix){
    const matches=[...prefix.matchAll(/\b(age[d]?|follow[ -]?up|duration|dose|dosage)\b|年龄|随访|持续|剂量/gi)];
    const last=matches.at(-1)?.[0]?.toLowerCase()||'';
    return /age|年龄/.test(last)?'age':/follow|随访/.test(last)?'follow-up':/duration|持续/.test(last)?'duration':/dose|dosage|剂量/.test(last)?'dose':'';
  }
  function constraints(value){
    const text=clean(value),out=[];
    const units={year:'year',years:'year',yr:'year',yrs:'year',岁:'year',年:'year',month:'month',months:'month',mo:'month',mos:'month',月:'month',个月:'month',week:'week',weeks:'week',wk:'week',wks:'week',周:'week',day:'day',days:'day',天:'day',日:'day',hour:'hour',hours:'hour',小时:'hour',mg:'mg',g:'g','%':'%'};
    const pattern=/\d+(?:\.\d+)?/g;
    for(const match of text.matchAll(pattern)){
      const at=match.index,prefix=text.slice(Math.max(0,at-85),at),suffix=text.slice(at+match[0].length,at+match[0].length+70);
      const unitMatch=suffix.match(/^\s*(years?|yrs?|months?|mos?|weeks?|wks?|days?|hours?|mg\b|g\b|%|岁|年|个月|月|周|天|日|小时)(?=\b|\s|[.,;)。！？]|$|[\u3400-\u9fff])/i);
      const op=operator(prefix,suffix);
      const temporal=(suffix.match(/\b(before|after|since|prior to|following)\b|之前|之后|以来/i)||prefix.match(/\b(before|after|since|prior to|following)\b|之前|之后|以来/i))?.[0]||'';
      const anchor=/before|prior|之前/i.test(temporal)?'before':/after|following|之后/i.test(temporal)?'after':temporal?'since':'';
      if(unitMatch||op!=='=')out.push({value:match[0],operator:op,unit:units[unitMatch?.[1]?.toLowerCase()]||'',role:role(prefix),anchor});
    }
    return out;
  }
  function differences(candidate,sources,complete=false){
    const original=sources.map(clean).join(' '),known=constraints(original),issues=[];
    for(const c of constraints(candidate)){
      if(!known.some(k=>k.value===c.value&&k.operator===c.operator&&k.unit===c.unit&&k.anchor===c.anchor&&(!k.role||!c.role||k.role===c.role)))issues.push('a threshold, comparison direction, unit, time anchor or scope differs from the source');
    }
    const numbers=value=>[...clean(value).matchAll(/\d+(?:\.\d+)?/g)].map(m=>m[0]);
    if(numbers(candidate).some(n=>!numbers(original).includes(n)))issues.push('a number is absent from the source');
    if(complete&&numbers(original).some(n=>!numbers(candidate).includes(n)))issues.push('a source number or threshold was omitted');
    if(complete&&known.some(k=>!constraints(candidate).some(c=>k.value===c.value&&k.operator===c.operator&&k.unit===c.unit&&k.anchor===c.anchor)))issues.push('a source constraint was omitted or changed');
    const hasOr=value=>/\bor\b|或者|或是|或(?=[\u3400-\u9fff])/i.test(value.replace(/\bor (?:older|younger|more|less|above|below|greater)\b/gi,''));
    // Removing an alternative is unsafe. More nuanced logic is checked in the separate review pass.
    if(hasOr(original)!==hasOr(candidate))issues.push('an alternative was added or removed');
    const hasAnd=value=>/\band\b|并且|以及|且(?=[\u3400-\u9fff])/i.test(value);
    if(hasAnd(original)&&!hasAnd(candidate))issues.push('a required combination may have been removed');
    const negated=value=>/\b(?:not|without|never|no)\b|无既往|未接受|不伴|没有/i.test(value.replace(/\b(?:no (?:more|less|fewer)|not (?:more|less)) than\b/gi,''));
    if(!/\b(?:include|exclude|eligible|eligibility)\b/i.test(original)&&negated(original)!==negated(candidate))issues.push('negation differs from the source');
    if(/\b(?:except|unless)\b|除外|除非|但不包括/i.test(original)&&!/\b(?:except|unless|exception)\b|除外|除非|但不包括/i.test(candidate))issues.push('an exception may have been removed');
    return [...new Set(issues)];
  }
  function reviewMap(response,ids){
    const result=new Map(),duplicates=new Set();
    for(const item of Array.isArray(response?.items)?response.items:[]){
      if(!ids.includes(item?.id))continue;
      if(result.has(item.id))duplicates.add(item.id);
      result.set(item.id,{status:['supported','contradicted','uncertain'].includes(item.status)?item.status:'uncertain',reason:clean(item.reason).slice(0,400)});
    }
    for(const id of ids)if(!result.has(id)||duplicates.has(id))result.set(id,{status:'uncertain',reason:'The review did not return one unambiguous assessment.'});
    return result;
  }
  function batches(items,maxCharacters=8000,maxItems=8){
    const result=[];let batch=[],size=0;
    for(const item of items){
      const length=JSON.stringify(item).length;
      if(length>maxCharacters)throw new Error('A source rule has too much context for reliable checking. Use a focused source excerpt and try again.');
      if(batch.length&&(size+length>maxCharacters||batch.length>=maxItems)){result.push(batch);batch=[];size=0;}
      batch.push(item);size+=length;
    }
    if(batch.length)result.push(batch);
    return result;
  }
  async function hashText(text){
    if(!globalThis.crypto?.subtle)return null;
    const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
  }
  async function manifest(sources){
    return Promise.all(sources.map(async(source,index)=>{
      const sha256=await hashText(source.text||'');
      return {id:source.id||'D'+String(index+1).padStart(3,'0'),name:source.name,page:source.page||null,kind:source.kind||'text',verification:source.verification||'original-text',text:source.text||'',sha256};
    }));
  }
  return {VERSION,clean,segments,constraints,differences,reviewMap,batches,hashText,manifest};
});
