/* Non-destructive, project-scoped study/report linkage. No model or network calls. */
(function(root){
'use strict';
const VERSION='study-links-v1',clean=v=>String(v??'').trim(),norm=v=>clean(v).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const list=v=>Array.isArray(v)?v:v?[v]:[];
function hash(value){let a=2166136261,b=3339675911;for(const c of String(value)){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b^c.charCodeAt(0),2246822519);}return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
function ids(text){return [...new Set([...String(text||'').matchAll(/\b(?:NCT[\s-]*\d{8}|ISRCTN[\s-]*\d{8})\b/gi)].map(m=>m[0].replace(/[\s-]/g,'').toUpperCase()))];}
function doi(v){return clean(v).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'').replace(/[.,;]+$/,'').toLowerCase();}
function features(text,source,record={}){
 const body=String(text||'').split(/(?:^|\n)\s*(?:references|bibliography|literature cited)\s*(?:\n|$)/i)[0];
 const sentences=body.split(/(?<=[.!?])\s+|\n+/).filter(Boolean),owned=[],mentions=[],relations=[];
 for(const sentence of sentences){
  const found=ids(sentence);for(const id of found)if(!mentions.includes(id))mentions.push(id);
  const contextual=/\b(?:trial registration|registration number|registration identifier|registered (?:at|with|in|under)|clinicaltrials\.gov\s*(?:identifier|number)|isrctn\s*number)\b|\b(?:clinicaltrials\.gov|isrctn)\s*:/i.test(sentence)||/\b(?:follow[- ]up|secondary analysis|subgroup analysis|extension) of\b.*\b(?:trial|study)\b/i.test(sentence);
  const other=/\b(?:previous|prior|other|earlier) (?:studies|study|trials|trial)\b|\b(?:systematic review|meta-analysis|meta analysis)\b/i.test(sentence);
  if(contextual&&!other&&!/\b(?:systematic review|meta-analysis|meta analysis)\b/i.test(record.title||''))for(const id of found)owned.push({id,source,quote:sentence.trim()});
  if(/\b(?:follow[- ]up|secondary analysis|subgroup analysis|extension) of\b.*\b(?:reported|published|described) (?:in|at)\b/i.test(sentence)&&!other){
   for(const m of sentence.matchAll(/\b10\.\d{4,9}\/[-._;()/:a-z0-9]+/gi))relations.push({doi:doi(m[0]),source,quote:sentence.trim()});
  }
 }
 for(const value of [...list(record.trialRegistration),...list(record.registrationNumber),...list(record.registryIds)])for(const id of ids(typeof value==='object'?value.id:value))owned.push({id,source:'imported registration field',quote:typeof value==='object'?clean(value.id):clean(value)});
 const title=norm(record.title),intro=norm(body.slice(0,2000));
 const reportType=/\bprotocol\b/.test(title)?'protocol':/\b(?:follow up|long term|extension)\b/.test(title)?'follow-up':/\b(?:secondary|subgroup|post hoc)\b/.test(title)?'secondary analysis':/\b(?:erratum|correction|retraction)\b/.test(title)?'notice':/\bresults\b/.test(title)||/\bresults\b/.test(intro)?'results':'report';
 const words=[...new Set(norm(record.title).split(' ').filter(w=>w.length>2&&!new Set(['the','and','for','with','trial','study','results','protocol','analysis','follow']).has(w)))].slice(0,256);
 const sites=list(record.studySites).map(norm).filter(Boolean),interventions=list(record.interventions).map(norm).filter(Boolean);
 for(const m of body.matchAll(/\b(?:at|from|in)\s+([A-Z][A-Za-z -]{2,70}(?:Hospital|Medical Center|Medical Centre))\b/g))sites.push(norm(m[1]));
 const recruitment=clean(record.recruitmentStart)&&clean(record.recruitmentEnd)?norm(record.recruitmentStart+' '+record.recruitmentEnd):(body.match(/\b(?:recruited|enrolled)\s+(?:between|from)\s+([A-Za-z0-9 ,/-]{4,40})\s+(?:and|to)\s+([A-Za-z0-9 ,/-]{4,40})(?=[.;\n])/i)?.[0]||'');
 return {owned,mentions,relations,reportType,words,sites:[...new Set(sites)],interventions:[...new Set(interventions)],recruitment:norm(recruitment)};
}
function combine(a,b){return {owned:[...(a?.owned||[]),...(b?.owned||[])],mentions:[...new Set([...(a?.mentions||[]),...(b?.mentions||[])])],relations:[...(a?.relations||[]),...(b?.relations||[])],reportType:a?.reportType&&a.reportType!=='report'?a.reportType:b?.reportType||'report',words:a?.words||[],sites:[...new Set([...(a?.sites||[]),...(b?.sites||[])])],interventions:[...new Set([...(a?.interventions||[]),...(b?.interventions||[])])],recruitment:b?.recruitment||a?.recruitment||''};}
function overlap(a,b){const set=new Set(b);return a.filter(x=>set.has(x));}
function reconcile(records,previous={entries:{}},documents={}){
 const entries=Object.assign(Object.create(null),structuredClone(previous.entries||{}));
 for(const r of records){
  const entry=entries[r.uid]||{},record={uid:r.uid,title:r.title||'',authors:r.authors||[],year:r.year||'',doi:r.doi||'',pmid:r.pmid||''};
  const signature=hash(JSON.stringify([record,r.abstract,r.trialRegistration,r.registrationNumber,r.registryIds,r.studySites,r.interventions,r.recruitmentStart,r.recruitmentEnd]));
  const abstract=entry.signature===signature?entry.abstract:features((r.title||'')+'\n'+(r.abstract||''),'title/abstract',r);
  let fulltext=entry.fulltext||null;
  if(Object.hasOwn(documents,r.uid)){
   const doc=documents[r.uid];if(!doc)fulltext=null;
   else{const text=doc.fullText||doc.chunks?.map(c=>c.text).join('\n')||'',sig=doc.hash||hash(text);if(fulltext?.signature!==sig)fulltext={signature:sig,data:features(text,'full text',record)};}
  }
  entries[r.uid]={record,signature,abstract,fulltext,reportId:'R-'+hash(r.uid)};
 }
 const all=Object.keys(entries).sort(),f=new Map(all.map(uid=>[uid,combine(entries[uid].abstract,entries[uid].fulltext?.data)])),parent=new Map(all.map(uid=>[uid,uid]));
 const find=uid=>{while(parent.get(uid)!==uid)uid=parent.get(uid);return uid;};
 const own=uid=>[...new Set(f.get(uid).owned.map(x=>x.id))];
 const doiIndex=new Map();for(const uid of all){const key=doi(entries[uid].record.doi);if(key){if(!doiIndex.has(key))doiIndex.set(key,[]);doiIndex.get(key).push(uid);}}
 const explicit=[],uncertain=[];
 for(const uid of all)for(const relation of f.get(uid).relations){
  const targets=doiIndex.get(relation.doi)||[];
  if(targets.length!==1||targets[0]===uid)continue;
  const target=targets[0],a=find(uid),b=find(target);if(a===b)continue;
  const component=all.filter(id=>[a,b].includes(find(id))),registrations=[...new Set(component.flatMap(own))];
  if(registrations.length>1){uncertain.push({left:uid,right:target,reason:'conflicting-registration',evidence:[relation]});continue;}
  parent.set(a>b?a:b,a>b?b:a);explicit.push({left:uid,right:target,reason:'explicit-report-relationship',evidence:[relation]});
 }
 const components=new Map();for(const uid of all){const key=find(uid);if(!components.has(key))components.set(key,[]);components.get(key).push(uid);}
 const assignments=new Map();for(const component of components.values()){
  const registrations=[...new Set(component.flatMap(own))];
  const studyIds=registrations.length?registrations.map(id=>'S-'+id).sort():['S-'+hash(component[0])];
  for(const uid of component)assignments.set(uid,studyIds);
 }
 const byStudy=new Map();for(const uid of all)for(const id of assignments.get(uid)){if(!byStudy.has(id))byStudy.set(id,[]);byStudy.get(id).push(uid);}
 const annotated=records.map(r=>{const e=entries[r.uid],feature=f.get(r.uid),studyIds=assignments.get(r.uid),related=[...new Set(studyIds.flatMap(id=>byStudy.get(id)||[]))].filter(uid=>uid!==r.uid).map(uid=>({...entries[uid].record,reportId:entries[uid].reportId,reportType:f.get(uid).reportType,studyIds:assignments.get(uid)}));const evidence=[...feature.owned,...explicit.filter(p=>p.left===r.uid).flatMap(p=>p.evidence.map(e=>({...e,id:'DOI: '+e.doi})))];return {...r,reportId:e.reportId,studyIds,reportType:feature.reportType,studyLinkEvidence:evidence,relatedReports:related,studyLinkVersion:VERSION};});
 const active=new Set(records.map(r=>r.uid)),groupsMap=new Map();
 for(const r of annotated)for(const id of r.studyIds){if(!groupsMap.has(id))groupsMap.set(id,{studyId:id,registryId:id.startsWith('S-NCT')||id.startsWith('S-ISRCTN')?id.slice(2):'',reports:[],relatedReports:[]});groupsMap.get(id).reports.push({uid:r.uid,reportId:r.reportId,title:r.title,reportType:r.reportType,evidence:r.studyLinkEvidence});}
 for(const r of annotated)for(const id of r.studyIds)for(const related of r.relatedReports)if(!active.has(related.uid)&&related.studyIds.includes(id)&&!groupsMap.get(id).relatedReports.some(x=>x.uid===related.uid))groupsMap.get(id).relatedReports.push(related);
 const groups=[...groupsMap.values()].sort((a,b)=>a.studyId.localeCompare(b.studyId));
 for(const g of groups){g.reports.sort((a,b)=>a.reportId.localeCompare(b.reportId));const priority={results:0,report:1,'follow-up':2,'secondary analysis':3,protocol:4,notice:5};g.primaryReportId=[...g.reports].sort((a,b)=>(priority[a.reportType]??9)-(priority[b.reportType]??9)||a.reportId.localeCompare(b.reportId))[0].reportId;}
 const candidates=uncertain.filter(p=>active.has(p.left)&&active.has(p.right)),candidateKeys=new Set(candidates.map(p=>[p.left,p.right].sort().join('|'))),index=new Map();
 for(const r of annotated){const feature=f.get(r.uid),authorNames=(r.authors||[]).map(a=>norm(a).split(' ')[0]).filter(Boolean),block=[...feature.mentions.map(id=>'id|'+id),...authorNames.map(a=>'author|'+a)];const peers=new Set(block.flatMap(key=>index.get(key)||[]));
  for(const uid of peers){if(overlap(r.studyIds,assignments.get(uid)).length)continue;const other=entries[uid].record,b=f.get(uid),authors=overlap(authorNames,other.authors.map(a=>norm(a).split(' ')[0]));const words=overlap(feature.words,b.words),score=2*words.length/Math.max(1,feature.words.length+b.words.length),mentioned=overlap(feature.mentions,b.mentions),site=overlap(feature.sites,b.sites),intervention=overlap(feature.interventions,b.interventions),recruitment=feature.recruitment&&feature.recruitment===b.recruitment;
   if(!mentioned.length&&!(authors.length&&score>=.45&&(site.length||intervention.length||recruitment)))continue;
   const key=[uid,r.uid].sort().join('|');if(candidateKeys.has(key))continue;candidateKeys.add(key);
   candidates.push({left:uid,right:r.uid,reason:mentioned.length?'registration-mentioned-without-own-trial-evidence':'cohort-features',evidence:{registrationIds:mentioned,authors,sites:site,interventions:intervention,recruitment:recruitment?feature.recruitment:'',titleSimilarity:score}});
  }
  for(const key of block){if(!index.has(key))index.set(key,[]);index.get(key).push(r.uid);}
 }
 return {version:VERSION,records:annotated,groups,candidates,links:explicit.filter(p=>active.has(p.left)&&active.has(p.right)),memory:{version:VERSION,entries}};
}
function metadata(r){return {...Object.fromEntries(['trialRegistration','registrationNumber','registryIds','studySites','interventions','recruitmentStart','recruitmentEnd'].filter(k=>r[k]!=null).map(k=>[k,structuredClone(r[k])])),reportId:r.reportId||'',studyIds:r.studyIds||[],reportType:r.reportType||'report',studyLinkEvidence:r.studyLinkEvidence||[],relatedReports:r.relatedReports||[],studyLinkVersion:VERSION};}
function sync(projectId,records,documents={}){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('aimstep-study-links',1);request.onupgradeneeded=()=>request.result.createObjectStore('projects',{keyPath:'id'});request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{const db=request.result,tx=db.transaction('projects','readwrite'),store=tx.objectStore('projects'),read=store.get(projectId);let result;
   read.onsuccess=()=>{try{result=reconcile(records,read.result?.memory,documents);if(JSON.stringify(result.memory)!==JSON.stringify(read.result?.memory))store.put({id:projectId,memory:result.memory});}catch(e){tx.abort();reject(e);}};
   tx.oncomplete=()=>{db.close();resolve(result)};tx.onerror=()=>{db.close();reject(tx.error)};tx.onabort=()=>{db.close();reject(tx.error||new Error('Study-link save was cancelled.'))};
  };
 });
}
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function html(result){
 if(!result?.records.length)return '';
 const linked=result.groups.filter(g=>g.reports.length>1||g.relatedReports?.length);
 const evidence=items=>items.length?'<details><summary>Link evidence</summary>'+items.map(e=>'<p>'+escape(e.id)+' · '+escape(e.source)+'<br>'+escape(e.quote)+'</p>').join('')+'</details>':'';
 const groups=linked.slice(0,50).map(g=>'<details style="margin:8px 0"><summary>'+escape(g.studyId)+' · '+g.reports.length+' reports in this step'+(g.relatedReports?.length?' · '+g.relatedReports.length+' related reports in other steps':'')+'</summary><ul>'+g.reports.map(r=>'<li><strong>'+escape(r.reportId)+'</strong> · '+escape(r.reportType)+' · '+escape(r.title)+(g.primaryReportId===r.reportId?' <em>(suggested primary report)</em>':'')+evidence(r.evidence)+'</li>').join('')+'</ul>'+(g.relatedReports?.length?'<details><summary>Related reports in other steps (not additional analysis rows)</summary><ul>'+g.relatedReports.map(r=>'<li>'+escape(r.reportId)+' · '+escape(r.reportType)+' · '+escape(r.title)+'</li>').join('')+'</ul></details>':'')+'</details>').join('');
 const byUid=new Map(result.records.map(r=>[r.uid,r])),reasons={'conflicting-registration':'The explicit relationship has conflicting trial registrations.','registration-mentioned-without-own-trial-evidence':'The same registration is mentioned, without sufficient evidence that both reports describe that trial.','cohort-features':'Authors, titles and cohort features overlap; this is insufficient to assign the same study.'};
 const candidates=result.candidates.slice(0,50).map(c=>'<li>'+escape(byUid.get(c.left)?.title)+'<br>'+escape(byUid.get(c.right)?.title)+'<p class="hint">'+escape(reasons[c.reason]||c.reason)+'</p></li>').join('');
 return '<p class="hint">'+result.records.length+' reports · '+result.groups.length+' provisional study groups · '+linked.length+' groups with linked reports · '+result.candidates.length+' candidate relationships retained. Each report is screened separately.</p><details><summary>Study and report links</summary>'+groups+(linked.length?'':'<p class="hint">No confirmed multi-report groups yet.</p>')+(linked.length>50?'<p class="hint">Showing the first 50 linked groups. Export JSON for all source relationships.</p>':'')+(candidates?'<details><summary>Candidate relationships (all reports retained)</summary><ul>'+candidates+'</ul>'+(result.candidates.length>50?'<p class="hint">Showing the first 50 candidates. Export JSON for all source relationships.</p>':'')+'</details>':'')+'<p class="hint">Candidate links do not merge reports or remove records. Full-text information may update these associations. A suggested primary report is for display, not automatic selection of outcome data.</p></details>';
}
function collate(rows,records,{sources={},assignments={},targetTimepoint=''}={}){
 const byUid=new Map(records.map(r=>[r.uid,r])),groups=new Map(),conflicts=[],choices=[],seenMulti=new Set();
 for(const row of rows){const r=byUid.get(row.uid),ids=r?.studyIds||[];let studyId=ids[0]||'S-'+hash(row.uid);
  if(ids.length>1){const chosen=assignments[row.uid];if(!seenMulti.has(row.uid)){choices.push({reason:'multiple-studies-in-report',uid:row.uid,studyIds:ids,selected:ids.includes(chosen)?chosen:''});seenMulti.add(row.uid);}if(!ids.includes(chosen)){conflicts.push({reason:'multiple-studies-in-report',uids:[row.uid],studyIds:ids});continue;}studyId=chosen;}
  const key=JSON.stringify([studyId,norm(targetTimepoint)||'outcome']);if(!groups.has(key))groups.set(key,[]);groups.get(key).push({...row,study:studyId,studyId,reportId:r?.reportId||'R-'+hash(row.uid)});
 }
 const output=[];
 for(const [key,group] of groups){
  const reportGroups=new Map();for(const row of group){if(!reportGroups.has(row.uid))reportGroups.set(row.uid,[]);reportGroups.get(row.uid).push(row);}
  const sets=[...reportGroups.values()],signature=set=>JSON.stringify(set.map(r=>({treat:norm(r.treat),label:norm(r.label),timepoint:norm(r.timepoint),n:r.n,...('event'in r?{event:r.event}:{mean:r.mean,sd:r.sd})})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
  let selected=sets.sort((a,b)=>a[0].reportId.localeCompare(b[0].reportId))[0],sourceReports=[...reportGroups.keys()];
  if(sets.length>1&&new Set(sets.map(signature)).size>1){
   const chosen=sources[key],valid=reportGroups.has(chosen);choices.push({reason:'different-results-for-same-study-timepoint',key,studyId:group[0].studyId,uids:[...reportGroups.keys()],timepoint:group[0].timepoint,selected:valid?chosen:''});
   if(!valid){conflicts.push({reason:'different-results-for-same-study-timepoint',key,studyId:group[0].studyId,uids:[...reportGroups.keys()],timepoint:group[0].timepoint});continue;}
   selected=reportGroups.get(chosen);sourceReports=[chosen];
  }
  for(const row of selected)output.push({...row,sourceReports});
 }
 return {rows:output,conflicts,choices};
}
const api={VERSION,ids,features,reconcile,sync,html,collate,hash,metadata};if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepStudyLinks=api;
})(globalThis);
