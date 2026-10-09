/* Protocol drafts and source-grounded handoff. Shared by browser and tests. */
(function(root){
'use strict';
const sections=[['title','Review title and basic details'],['rationale','Rationale and objectives'],['eligibility','Eligibility criteria'],['outcomes','Main and additional outcomes'],['search','Searching and screening'],['extraction','Data collection process'],['bias','Risk of bias and reporting bias'],['synthesis','Strategy for data synthesis'],['certainty','Certainty assessment'],['timeline','Timeline and current review stage'],['team','Review team, affiliations and contact'],['funding','Funding and conflicts of interest'],['availability','Protocol availability, registration and dissemination'],['amendments','Protocol amendments']];
const string={type:'string'},strings={type:'array',items:string};
const draftSchema={type:'object',properties:{sections:{type:'array',items:{type:'object',properties:{id:{type:'string',enum:sections.map(x=>x[0])},text:string},required:['id','text']}},issues:strings},required:['sections','issues']};
const handoffSchema={type:'object',properties:{question:string,reviewType:{type:'string',enum:['Systematic Review','Network/Meta-analysis','Scoping Review','Other Review']},framework:{type:'string',enum:['PICO','PECO','PCC','PICo','Other']},rows:{type:'array',items:{type:'object',properties:{title:string,inclusionQuotes:strings,exclusionQuotes:strings},required:['title','inclusionQuotes','exclusionQuotes']}},databases:strings,searchQuotes:strings,limitQuotes:strings,issues:strings},required:['question','reviewType','framework','rows','databases','searchQuotes','limitQuotes','issues']};
const norm=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();
function validateDraft(value){if(!Array.isArray(value?.sections)||!Array.isArray(value.issues))throw Error('Incomplete AI protocol. Try again.');const result=sections.map(([id,label])=>{const matches=value.sections.filter(s=>s.id===id);if(matches.length!==1||typeof matches[0].text!=='string')throw Error('AI omitted or duplicated a protocol section: '+label);return {id,label,text:matches[0].text};});return {sections:result,issues:value.issues.map(String)};}
function text(sections){return sections.map(s=>s.label+'\n'+s.text).join('\n\n');}
function validateHandoff(value,source){
 if(!Array.isArray(value?.rows)||!Array.isArray(value.databases)||!Array.isArray(value.issues)||!['PICO','PECO','PCC','PICo','Other'].includes(value.framework))throw Error('Incomplete AI mapping. Try again.');
 const content=norm(source),quotes=a=>{if(!Array.isArray(a))throw Error('Missing source quotations.');return a.map(q=>{if(typeof q!=='string'||!norm(q)||!content.includes(norm(q)))throw Error('A proposed rule could not be traced to the protocol. Review the protocol and try again.');return q.trim();});};
 const criterionNames={comparator:'Comparison',comparators:'Comparison',participants:'Population',population:'Population',intervention:'Intervention',comparison:'Comparison',outcome:'Outcomes',outcomes:'Outcomes','study design':'Study design'};const criterionIds={Population:'INC-01',Intervention:'INC-02',Comparison:'INC-03',Outcomes:'INC-04','Study design':'INC-05'};
 const rows=value.rows.map((r,i)=>{if(typeof r.title!=='string'||!r.title.trim())throw Error('Missing criterion name.');const title=criterionNames[r.title.toLowerCase()]||r.title;return {id:criterionIds[title]||'PRO-'+(i+1),title,condition:quotes(r.inclusionQuotes).join('\n'),uncertain:quotes(r.exclusionQuotes).join('\n'),definition:'',purpose:'Eligibility',stage:'',source:'protocol'};}).filter(r=>r.condition||r.uncertain);
 if(!rows.length)throw Error('No explicit eligibility rules were found. Add them to the protocol before submitting.');
 const databases=value.databases.map(String).filter(d=>content.toLowerCase().includes(norm(d).toLowerCase()));
 return {reviewType:['Systematic Review','Network/Meta-analysis','Scoping Review','Other Review'].includes(value.reviewType)?value.reviewType:mapping.reviewType||'Systematic Review',question:String(value.question||''),framework:value.framework,rows,databases,searchQuotes:quotes(value.searchQuotes),limitQuotes:quotes(value.limitQuotes),issues:value.issues.map(String)};
}
const dbMap={pubmed:'pubmed','medline (ovid)':'ovid','europe pmc':'europepmc',cinahl:'cinahl',psycinfo:'psycinfo',embase:'embase','cochrane library':'cochrane',scopus:'scopus','web of science':'wos',cnki:'cnki',wanfang:'wanfang',vip:'vip',sinomed:'sinomed'};
function fingerprint(v){let h=2166136261;for(const c of JSON.stringify(v)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(16);}
function prepare(mapping,previous={},search={},stamp=new Date().toISOString()){
 const limits={apply:true,start:'',end:'',language:'',other:mapping.limitQuotes.join('\n')};
 const eligibility={...previous,question:mapping.question,framework:mapping.framework,reviewType:mapping.reviewType||'Systematic Review',generationMethodChoice:'manual',activeGenerator:'manual',generationMode:'manual',criteria:mapping.rows,machineCriteria:[],manualRefinement:null,machineRefinement:null,previewEdits:null,confirmed:false,dateRange:{start:{year:'',month:'',day:''},end:{year:'',month:'',day:''}},language:'',limitsOther:limits.other,protocolSource:{date:stamp,searchQuotes:mapping.searchQuotes}};
 const snapshot={rows:mapping.rows.map(({id,title,condition,uncertain,definition})=>({id,title,condition,uncertain,definition})),question:mapping.question,framework:mapping.framework,reviewType:mapping.reviewType||'Systematic Review',limits,origin:'Protocol',importedAt:stamp};
 const comparable={rows:snapshot.rows,question:snapshot.question,framework:snapshot.framework,reviewType:snapshot.reviewType,limits};
 const databases=[...new Set(mapping.databases.map(d=>dbMap[d.toLowerCase()]).filter(Boolean))];
 const next={...search,version:1,source:'previous',criteriaSnapshot:snapshot,sourceHash:fingerprint(comparable),method:'machine',limits,concepts:[],dismissedCriteria:[],machineWords:null,modelRun:null,queries:{},databases:databases.length?databases:(search.databases||['pubmed']),activeDb:databases[0]||search.activeDb||'pubmed',protocolSource:{date:stamp,searchQuotes:mapping.searchQuotes,databases:mapping.databases}};
 return {eligibility,search:next};
}
function commit(storage,scope,mapping,source){
 const ek='aimstep-eligibility:'+scope,sk='aimstep-search-strategy:'+scope,summary='aimstep-eligibility-summary:'+scope,backup='aimstep-protocol-backups:'+scope;
 const keys=[ek,sk,summary,backup],before=keys.map(k=>storage.getItem(k));
 const parse=s=>s?JSON.parse(s):null,stamp=new Date().toISOString();
 const result=prepare(mapping,parse(before[0])||{},parse(before[1])||{},stamp);
 const history=parse(before[3])||[];history.push({date:stamp,source,eligibility:parse(before[0]),search:parse(before[1]),summary:parse(before[2])});
 try{storage.setItem(backup,JSON.stringify(history));storage.setItem(ek,JSON.stringify(result.eligibility));storage.setItem(sk,JSON.stringify(result.search));storage.removeItem(summary);}catch(e){keys.forEach((k,i)=>{try{before[i]===null?storage.removeItem(k):storage.setItem(k,before[i]);}catch(_){}});throw Error('Could not save the handoff. Existing work was restored; export a copy before continuing.');}
 return result;
}
const api={sections,draftSchema,handoffSchema,validateDraft,validateHandoff,text,prepare,commit};if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepProtocolCore=api;
})(globalThis);
