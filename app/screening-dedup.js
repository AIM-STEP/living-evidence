/* Report-level deduplication. Original imports are immutable; no model calls. */
(function(root){
  'use strict';
  const VERSION='report-dedup-v3';
  const clean=v=>String(v??'').trim();
  const norm=v=>clean(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
  function doi(v){let s=clean(v).replace(/^doi:\s*/i,'').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'');try{s=decodeURIComponent(s)}catch(e){}s=s.trim().toLowerCase();return /^10\.\d{4,9}\/\S+$/.test(s)?s:'';}
  const pmid=v=>/^\d+$/.test(clean(v))?clean(v).replace(/^0+(?=\d)/,''):'';
  function jw(a,b){
    if(a===b)return a?1:0;if(!a||!b)return 0;
    const w=Math.max(0,Math.floor(Math.max(a.length,b.length)/2)-1),aa=new Uint8Array(a.length),bb=new Uint8Array(b.length);let m=0,t=0,k=0;
    for(let i=0;i<a.length;i++)for(let j=Math.max(0,i-w);j<Math.min(b.length,i+w+1);j++)if(!bb[j]&&a[i]===b[j]){aa[i]=bb[j]=1;m++;break;}
    if(!m)return 0;for(let i=0;i<a.length;i++)if(aa[i]){while(!bb[k])k++;if(a[i]!==b[k])t++;k++;}
    const j=(m/a.length+m/b.length+(m-t/2)/m)/3;let p=0;while(p<4&&p<a.length&&p<b.length&&a[p]===b[p])p++;return j+p*.1*(1-j);
  }
  function fields(r){
    const abstract=norm(r.abstract),words=new Set(abstract.split(' ').filter(Boolean));
    return {title:norm(r.title),abstract,words,author:norm((r.authors||[]).join(' ')).replace(/^(UNKNOWN|ANONYMOUS)$/,''),journal:norm(r.journal),year:clean(r.year).match(/\b\d{4}\b/)?.[0]||'',volume:norm(r.volume),issue:norm(r.issue),pages:norm(r.pages),doi:doi(r.doi),pmid:pmid(r.pmid)};
  }
  function dice(a,b){if(!a.size||!b.size)return 0;let n=0;for(const w of a)if(b.has(w))n++;return 2*n/(a.size+b.size);}
  function role(t){return /\b(PROTOCOL|ERRATUM|CORRECTION|RETRACTION|COMMENTARY)\b/.exec(t)?.[1]||'';}
  function compare(a,b){
    const title=jw(a.title,b.title),author=jw(a.author,b.author),abstract=dice(a.words,b.words);
    const scores={title,author,abstract};
    const sameDoi=!!a.doi&&a.doi===b.doi,samePmid=!!a.pmid&&a.pmid===b.pmid;
    const related=sameDoi||samePmid||(title>=.85&&(author>=.75||(a.journal&&a.journal===b.journal)||abstract>=.8));
    if(!related)return {status:'distinct',reason:'insufficient-similarity',scores};
    const maybe=reason=>({status:'possible',reason,scores});
    if(a.doi&&b.doi&&a.doi!==b.doi)return maybe('different-doi');
    if(a.pmid&&b.pmid&&a.pmid!==b.pmid)return maybe('different-pmid');
    if(a.year&&b.year&&Math.abs(Number(a.year)-Number(b.year))>1)return maybe('different-year');
    if(role(a.title)!==role(b.title))return maybe('different-report-type');
    if(a.title&&b.title&&JSON.stringify(a.title.match(/\d+|\b[IVX]+\b/g)||[])!==JSON.stringify(b.title.match(/\d+|\b[IVX]+\b/g)||[]))return maybe('different-title-numbers');
    if(samePmid||sameDoi)return {status:'duplicate',reason:samePmid?'exact-pmid':'exact-doi',scores};
    for(const key of ['volume','issue','pages'])if(a[key]&&b[key]&&a[key]!==b[key])return maybe('different-'+key);
    const common=a.year&&a.year===b.year&&a.journal&&a.journal===b.journal&&author>=.95;
    const publication=a.pages&&a.pages===b.pages&&a.volume&&a.volume===b.volume;
    const fullAbstract=a.abstract.length>=160&&b.abstract.length>=160&&a.words.size>=20&&b.words.size>=20&&abstract>=.98;
    if(common&&((title>=.97&&publication)||(a.title&&a.title===b.title&&fullAbstract)))return {status:'duplicate',reason:publication?'title-author-publication':'exact-title-full-abstract',scores};
    return maybe('insufficient-corroboration');
  }
  function keys(f){
    const out=[];if(f.doi)out.push('d|'+f.doi);if(f.pmid)out.push('p|'+f.pmid);
    if(f.title){out.push('t|'+f.title,'t40|'+f.title.slice(0,40),'tw|'+f.title.split(' ').slice(0,4).join(' '));}
    if(f.author&&f.year)out.push('ay|'+f.author.split(' ')[0]+'|'+f.year);
    if(f.journal&&f.volume&&f.pages)out.push('jvp|'+f.journal+'|'+f.volume+'|'+f.pages);
    if(f.year&&f.volume&&f.pages)out.push('yvp|'+f.year+'|'+f.volume+'|'+f.pages);
    return out;
  }
  const pairKey=(a,b)=>JSON.stringify([a,b].sort());
  function hash(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(16);}
  function run(batches){
    const entries=[],stats=new Map();
    for(const batch of [...batches].sort((a,b)=>clean(a.at).localeCompare(clean(b.at))||a.key.localeCompare(b.key))){
      stats.set(batch.key,{total:0,duplicates:0});
      for(const [ordinal,raw] of batch.records.entries()){if(!raw||(!raw.title&&!raw.doi&&!raw.pmid))continue;
        const record=structuredClone(raw),content=JSON.stringify(record);
        // Batch and source ordinal are unique; the checksum detects source edits.
        entries.push({id:JSON.stringify([batch.key,ordinal,record.uid,hash(content)]),batchKey:batch.key,record,fields:fields(record)});stats.get(batch.key).total++;
      }
    }
    // Candidate generation uses all immutable originals: enrichment never leaves stale indexes.
    const index=new Map(),edges=[];
    entries.forEach((entry,i)=>{const candidates=new Set();for(const key of keys(entry.fields))for(const j of index.get(key)||[])candidates.add(j);
      for(const j of candidates){const result=compare(entry.fields,entries[j].fields);if(result.status!=='distinct')edges.push({a:j,b:i,key:pairKey(entries[j].id,entry.id),...result});}
      for(const key of keys(entry.fields)){if(!index.has(key))index.set(key,[]);index.get(key).push(i);}
    });
    const parent=entries.map((_,i)=>i),members=entries.map((_,i)=>[i]),history=[];
    const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i]}return i;};
    const rank=e=>e.reason==='exact-pmid'?1:e.reason==='exact-doi'?2:3;
    edges.sort((a,b)=>rank(a)-rank(b)||a.key.localeCompare(b.key));
    for(const edge of edges){
      const x=find(edge.a),y=find(edge.b);if(x===y||edge.status!=='duplicate')continue;
      // Complete-link guards prevent A~B~C chains from merging contradictory reports.
      let safe=true;
      for(const a of members[x])for(const b of members[y]){
        if(compare(entries[a].fields,entries[b].fields).status!=='duplicate')safe=false;
      }
      if(!safe){edge.status='possible';edge.reason='group-conflict';continue;}
      const keep=Math.min(x,y),drop=Math.max(x,y);parent[drop]=keep;members[keep]=[...members[keep],...members[drop]].sort((a,b)=>a-b);
      history.push({...edge});
    }
    const records=[],groups=[],rootIds=new Map(),usedUids=new Set();
    for(let i=0;i<entries.length;i++)if(find(i)===i){
      const list=members[i].map(n=>entries[n]),record=structuredClone(list[0].record),fieldSources={};
      for(const key of ['title','abstract','authors','year','journal','doi','pmid','url','volume','issue','pages']){
        // Most informative available field wins; stable member identity breaks ties.
        const ranked=[...list].filter(e=>key==='authors'?e.record[key]?.length:clean(e.record[key])).sort((a,b)=>{
          const av=key==='authors'?a.record[key].join('; '):a.record[key],bv=key==='authors'?b.record[key].join('; '):b.record[key];
          const aq=(key==='doi'?!!doi(av):key==='pmid'?!!pmid(av):true),bq=(key==='doi'?!!doi(bv):key==='pmid'?!!pmid(bv):true);
          return Number(bq)-Number(aq)||bv.length-av.length||a.id.localeCompare(b.id);
        });
        if(ranked.length){record[key]=structuredClone(ranked[0].record[key]);fieldSources[key]=ranked[0].id;}
      }
      record.provenance=[];const seen=new Set();for(const e of list)for(const p of e.record.provenance||[]){const key=JSON.stringify(p);if(!seen.has(key)){record.provenance.push(p);seen.add(key);}}
      if(usedUids.has(record.uid)){const base='dedup-'+hash(list[0].id)+'-'+i;record.uid=base;let suffix=1;while(usedUids.has(record.uid))record.uid=base+'-'+suffix++;}usedUids.add(record.uid);rootIds.set(i,record.uid);
      const group={recordId:record.uid,members:list.map(e=>({memberId:e.id,batchKey:e.batchKey,record:e.record})),fieldSources,merges:history.filter(e=>find(e.a)===i).map(e=>({left:entries[e.a].id,right:entries[e.b].id,reason:e.reason,scores:e.scores}))};
      record.dedup={version:VERSION,memberIds:list.map(e=>e.id),fieldSources};records.push(record);groups.push(group);
      for(const e of list.slice(1))stats.get(e.batchKey).duplicates++;
    }
    const pairs=edges.filter(e=>find(e.a)!==find(e.b)).map(e=>({key:e.key,left:entries[e.a].id,right:entries[e.b].id,leftRecordId:rootIds.get(find(e.a)),rightRecordId:rootIds.get(find(e.b)),reason:e.reason,scores:e.scores}));
    return {version:VERSION,records,groups,pairs,stats,total:entries.length,duplicates:entries.length-records.length,possible:pairs.length,policy:'retain-possible'};
  }
  const api={VERSION,norm,doi,pmid,fields,compare,keys,pairKey,run};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepDedup=api;
})(typeof globalThis==='undefined'?this:globalThis);
