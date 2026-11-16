/* Removed duplicate records only; five-column Excel export. */
(function(root){
  'use strict';
  const reasons={
    'exact-pmid':'PMID 相同',
    'exact-doi':'DOI 相同',
    'title-author-publication':'标题、作者、年份、期刊、卷号及页码符合重复匹配规则',
    'exact-title-full-abstract':'标题相同，完整摘要高度相似，且作者、年份和期刊一致'
  };
  function hasDuplicates(audit){return (audit?.groups||[]).some(g=>g.members?.length>1);}
  function sheets(audit){
    const rows=[['ID号','标题','作者','年份','重复理由']];
    for(const group of audit?.groups||[]){
      if(!group.members||group.members.length<2)continue;
      for(const member of group.members.slice(1)){
        const r=member.record||{},matches=(group.merges||[]).filter(m=>m.left===member.memberId||m.right===member.memberId);
        const labels=[...new Set(matches.map(m=>reasons[m.reason]||'符合自动去重规则'))];
        const reason=(labels.length?labels.join('；'):'符合自动去重规则')+'；已合并至保留记录 '+group.recordId;
        rows.push([String(r.uid||member.memberId||''),r.title||'',(r.authors||[]).join('; '),String(r.year||''),reason]);
      }
    }
    return rows.length>1?[{name:'Duplications',layout:'table',rows,widths:[26,65,36,12,65]}]:[];
  }
  const api={sheets,hasDuplicates};if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepDedupExport=api;
})(globalThis);
