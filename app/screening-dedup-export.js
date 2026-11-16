/* Row-oriented deduplication details for the shared project Excel writer. */
(function(root){
  'use strict';
  function sheets(audit,{project='',exportedAt=''}={}){
    const groups=audit.groups||[],members=new Map(),possibleGroups=new Set(),longRows=[];
    for(const g of groups)for(const m of g.members)members.set(m.memberId,m);
    for(const p of audit.possiblePairs||[]){possibleGroups.add(p.leftRecordId);possibleGroups.add(p.rightRecordId);}
    // Excel cells hold at most 32,767 characters. Preserve longer values in parts.
    function cell(value,recordId,field){
      if(typeof value!=='string'||value.length<=32767)return value??'';
      for(let i=0;i<value.length;){let end=Math.min(i+32000,value.length);if(end<value.length&&/[\uD800-\uDBFF]/.test(value[end-1]))end--;longRows.push([recordId,field,longRows.filter(r=>r[0]===recordId&&r[1]===field).length+1,value.slice(i,end)]);i=end;}
      return value.slice(0,32000)+' [continued in Long text]';
    }
    const records=[['Group ID','Original record ID','Title','Authors','Year','Journal','Volume','Issue','Pages','DOI','PMID','Abstract','Databases','Import batch','Source record role','Possible duplicate retained','Selected fields','Member ID']];
    for(const g of groups)g.members.forEach((m,index)=>{
      const r=m.record||{},databases=[...new Set((r.provenance||[]).map(p=>p.db).filter(Boolean))].join('; ');
      const values=[g.recordId,r.uid,r.title,(r.authors||[]).join('; '),r.year,r.journal,r.volume,r.issue,r.pages,r.doi,r.pmid,r.abstract,databases,m.batchKey,index===0?'Retained representative':'Automatically merged duplicate',possibleGroups.has(g.recordId)?'Yes':'No',Object.entries(g.fieldSources||{}).filter(([,id])=>id===m.memberId).map(([key])=>key).join('; '),m.memberId];
      records.push(values.map((v,c)=>cell(v,m.memberId,records[0][c])));
    });
    const matches=[['Relationship','Left group ID','Right group ID','Left record ID','Right record ID','Left title','Right title','Left DOI','Right DOI','Left PMID','Right PMID','Reason','Title similarity','Author similarity','Abstract similarity','Left member ID','Right member ID']];
    function match(left,right,leftGroup,rightGroup,kind,reason,scores={}){
      const a=members.get(left)?.record||{},b=members.get(right)?.record||{};
      matches.push([kind,leftGroup,rightGroup,a.uid,b.uid,a.title,b.title,a.doi,b.doi,a.pmid,b.pmid,reason,scores.title??'',scores.author??'',scores.abstract??'',left,right].map((v,c)=>cell(v,left+' | '+right,matches[0][c])));
    }
    for(const g of groups)for(const m of g.merges||[])match(m.left,m.right,g.recordId,g.recordId,'Automatically merged',m.reason,m.scores);
    for(const p of audit.possiblePairs||[])match(p.left,p.right,p.leftRecordId,p.rightRecordId,'Possible duplicate retained',p.reason,p.scores);
    const summary=[['Project','Algorithm version','Original records','Retained records','Duplicates removed','Possible pairs retained','Policy','Exported at','Source fingerprint'],[project,audit.version,audit.imported,audit.retained,audit.duplicates,(audit.possiblePairs||[]).length,audit.policy,exportedAt,audit.sourceSig]];
    const result=[{name:'Records',layout:'table',rows:records,widths:[22,22,60,36,12,32,12,12,18,32,18,65,24,24,32,24,35,30]},
      {name:'Matches',layout:'table',rows:matches,widths:[30,22,22,22,22,60,60,32,32,18,18,32,20,20,20,30,30]},
      {name:'Summary',layout:'table',rows:summary,widths:[24,24,20,20,22,25,24,28,24]}];
    if(longRows.length)result.push({name:'Long text',layout:'table',rows:[['Record or pair ID','Field','Part','Text'],...longRows],widths:[30,24,12,65]});
    return result;
  }
  const api={sheets};if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepDedupExport=api;
})(globalThis);
