/* Shared, deterministic checks. Model review complements these checks; it is not a proof. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AIMSTEPCriteriaGrounding=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const VERSION='original-source-v2';
  const clean=value=>String(value||'').normalize('NFKC').replace(/[˂˃]/gu,sign=>sign==='˂'?'<':'>').replace(/\s+/g,' ').trim();
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
  function operator(prefix,suffix,unit){
    if(/(?:>=|≥|at least|no (?:less|fewer) than|not less than|minimum(?: of)?|至少|不少于|不低于)\s*$/i.test(prefix)||/^\s*(?:(?:or|and) (?:older|more|above|greater|over)\b|及以上|以上)/i.test(suffix))return '>=';
    if(/(?:<=|≤|at most|no (?:more|greater) than|not more than|up to|maximum(?: of)?|至多|不超过|不高于)\s*$/i.test(prefix)||/^\s*(?:(?:or|and) (?:younger|less|below|under)\b|及以下|以下)/i.test(suffix))return '<=';
    if(/(?:>|more than|greater than|older than|over|超过|大于|高于)\s*$/i.test(prefix))return '>';
    if(/(?:<|less than|fewer than|younger than|under|below|小于|低于|不足)\s*$/i.test(prefix))return '<';
    if(['minute','hour','day','week','month','year'].includes(unit)&&(/\bwithin\s*$/i.test(prefix)||/^\s*(?:以内|内)/u.test(suffix)))return '<=';
    return '=';
  }
  function role(prefix){
    const matches=[...prefix.matchAll(/\b(age[d]?|follow[ -]?up|duration|dose|dosage)\b|年龄|随访|持续|剂量/gi)];
    const last=matches.at(-1)?.[0]?.toLowerCase()||'';
    return /age|年龄/.test(last)?'age':/follow|随访/.test(last)?'follow-up':/duration|持续/.test(last)?'duration':/dose|dosage|剂量/.test(last)?'dose':'';
  }
  const unitAliases={
    year:'year',years:'year',yr:'year',yrs:'year',岁:'year',年:'year',month:'month',months:'month',mo:'month',mos:'month',月:'month',个月:'month',
    week:'week',weeks:'week',wk:'week',wks:'week',周:'week',day:'day',days:'day',天:'day',日:'day',
    hour:'hour',hours:'hour',hr:'hour',hrs:'hour',h:'hour',小时:'hour',minute:'minute',minutes:'minute',min:'minute',mins:'minute',分钟:'minute',
    mg:'mg',g:'g',µg:'mcg',μg:'mcg',mcg:'mcg','%':'%'
  };
  const unitPattern=/^\s*[-‐‑]?\s*(years?|yrs?|months?|mos?|weeks?|wks?|days?|hours?|hrs?|h|minutes?|mins?|mg|mcg|μg|μw(?=\s*\/)|g|%|岁|年|个月|月|周|天|日|小时|分钟)(?![a-z])/i;
  function unitName(unit){
    const key=clean(unit).toLowerCase().replace(/\s*\/\s*/g,'/');
    return unitAliases[key]||key;
  }
  // Store the event when it is adjacent to the direction. A different event may
  // use exactly the same duration (e.g. 24 hours after birth or after discharge).
  const eventPattern=/^\s+(?:the\s+)?((?:(?:hospital|ICU|study)\s+)?(?:birth|delivery|admission|discharge|surgery|randomi[sz]ation|enroll?ment|diagnosis|treatment|intervention|baseline|screening)\b(?:\s+(?:initiation|cessation|completion|discontinuation|onset))?)/i;
  const chineseEvent={'出生':'birth','分娩':'delivery','入院':'admission','出院':'discharge','手术':'surgery','干预':'intervention','治疗':'treatment'};
  const timeDirection=/^(before|prior to|after|following|since)\b/i;
  function temporalAnchor(value){
    const text=clean(value).toLowerCase().replace(/[_‐‑–-]/g,' ').trim();
    const direction=text.match(timeDirection);
    if(!direction)return chineseEvent[text]||text;
    const word=direction[0],after=text.slice(word.length);
    const event=after.trim().replace(/^the\s+/,'');
    return [word==='prior to'?'before':word==='following'?'after':word,event].filter(Boolean).join(' ');
  }
  function timeAt(prefix,suffix){
    const direction=suffix.trimStart().match(timeDirection);
    if(direction){
      const after=suffix.trimStart().slice(direction[0].length);
      const event=after.match(eventPattern)?.[0]||after.match(/^\s+(?:the\s+)?[a-z]+(?:[-‐‑][a-z]+)*/i)?.[0]||'';
      return temporalAnchor(direction[0]+event);
    }
    const zh=prefix.match(/(出生|分娩|入院|出院|手术|干预|治疗)(之?[前后])(?:至多|至少|不超过|超过|约|的)?\s*$/u);
    if(zh)return (zh[2].endsWith('前')?'before ':'after ')+chineseEvent[zh[1]];
    return '';
  }
  function constraints(value){
    const text=clean(value),out=[];
    // A range shares its unit between its two endpoints. Resolve that relation
    // only for adjacent quantities, so independent constraints keep their roles.
    const amounts=[...text.matchAll(/\d+(?:\.\d+)?/g)].map(m=>{
      const after=m.index+m[0].length,unit=text.slice(after).match(unitPattern);
      let name=unitName(unit?.[1]),end=after+(unit?.[0].length||0);
      const per=name&&text.slice(end).match(/^(?:\s*\/\s*[a-zA-Zμ]+\d*)+/);
      if(per){name+=per[0].replace(/\s/g,'').toLowerCase();end+=per[0].length;}
      return {at:m.index,end,number:m[0],unit:name};
    });
    for(let i=0;i<amounts.length;i++){
      const cur=amounts[i],next=amounts[i+1];
      const before=text.slice(Math.max(0,cur.at-85),cur.at).split(/[;；。!?！？\n]|\.(?=\s)/u).at(-1);
      const interval=next&&text.slice(cur.end,next.at).trim();
      const range=next&&next.unit&&(!cur.unit||cur.unit===next.unit)&&
        (/^(?:[-‐‑‒–—]|to|through|至|到)$/i.test(interval)||/^and$/i.test(interval)&&/\bbetween\s*$/i.test(before));
      const suffix=text.slice((range?next:cur).end,(range?next:cur).end+75);
      const anchor=timeAt(before,suffix),scope=role(before);
      // ASCII hyphen before a quantity is a sign unless consumed as a range separator.
      const sign=/(?:^|[\s(<>=≤≥])[-−]$/u.test(before)?'-':'';
      const prefix=sign?before.slice(0,-1):before;
      if(range){
        const lower=operator(prefix,'',next.unit);
        out.push({value:sign+cur.number,operator:lower==='='?'>=':lower,unit:next.unit,role:scope,anchor},
          {value:next.number,operator:'<=',unit:next.unit,role:scope,anchor});
        i++;continue;
      }
      const op=operator(prefix,suffix,cur.unit);
      if(cur.unit||op!=='=')out.push({value:sign+cur.number,operator:op,unit:cur.unit,role:scope,anchor});
    }
    return out;
  }
  function differences(candidate,sources,complete=false,atomic=false){
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
    if(!atomic&&hasAnd(original)&&!hasAnd(candidate))issues.push('a required combination may have been removed');
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
      const reason=clean(item.reason).slice(0,400),issueType=['none','source_conflict','ambiguous_source','unsupported_rewrite','missing_scope','optional_detail'].includes(item.issueType)?item.issueType:/\b(?:sources|source requirements|original requirements)\b.{0,30}\b(?:conflict|contradict each other)|\bconflicting (?:source|original) (?:requirements|criteria)\b/i.test(reason)?'source_conflict':'unclassified';
      const alternatives=(Array.isArray(item.alternatives)?item.alternatives:[]).filter(option=>typeof option?.text==='string'&&['include','exclude'].includes(option.side)).slice(0,2).map(option=>({text:clean(option.text).slice(0,500),side:option.side}));
      result.set(item.id,{status:['supported','contradicted','uncertain'].includes(item.status)?item.status:'uncertain',reason,issueType,alternatives});
    }
    for(const id of ids)if(!result.has(id)||duplicates.has(id))result.set(id,{status:'uncertain',reason:'The review did not return one unambiguous assessment.'});
    return result;
  }
  // Generation produces an editable draft, never a compulsory decision workflow.
  // Keep the compatibility API for saved drafts; their diagnostics remain in the audit.
  function decisions(){return [];}
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
  return {VERSION,clean,segments,unitName,temporalAnchor,constraints,differences,reviewMap,decisions,batches,hashText,manifest};
});
