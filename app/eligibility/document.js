(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AIMSTEPEligibilityDocument=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const blockTags=new Set(['DIV','P','SECTION','H3','LI','UL','OL']);
function read(editor){
 const walk=node=>{
  if(node.nodeType===3)return node.nodeValue;
  if(node.nodeType!==1||node.hasAttribute('data-criteria-control'))return '';
  if(node.tagName==='BR')return '\n';
  const value=Array.from(node.childNodes,walk).join('');
  return blockTags.has(node.tagName)?'\n'+value+'\n':value;
 };
 return Array.from(editor.childNodes,walk).join('').replace(/\u00a0/g,' ').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
const sections={inclusion:'include','纳入':'include','纳入标准':'include',exclusion:'exclude','排除':'exclude','排除标准':'exclude',description:'description','描述':'description'};
const normalize=text=>text.replace(/\s+/g,' ').trim();
const fieldKey=text=>normalize(text).toLowerCase().replace(/\bcomparator\b/g,'comparison').replace(/\boutcome\b/g,'outcomes');
const rowKey=(side,heading)=>side+'|'+fieldKey(heading);
const placeholder=/^(?:not reporting|no explicit inclusion rules entered|尚无明确的纳入标准|未报告)[.。]?$/i;
function parse(text,fields,unlabelled){
 const known=new Map(fields.map(field=>[fieldKey(field.heading),field]));
 const rows=new Map(),description=[];
 let section='',current=null;
 for(const line of text.split(/\r?\n/)){
  const trimmed=line.trim();
  const label=trimmed.match(/^([^:：]+)[:：]\s*(.*)$/u);
  const sectionName=sections[(label?.[1]||trimmed).trim().toLowerCase()];
  if(sectionName){section=sectionName;current=null;if(label?.[2]&&section==='description')description.push(label[2]);continue;}
  if(section==='description'||!section){description.push(line);continue;}
  if(!trimmed||placeholder.test(trimmed))continue;
  if(label&&known.has(fieldKey(label[1]))){
   const field=known.get(fieldKey(label[1]));
   const key=rowKey(section,field.heading);
   current={...field,side:section,text:label[2]};
   const previous=rows.get(key);
   if(previous?.text)current.text=[previous.text,current.text].filter(Boolean).join('；');
   rows.set(key,current);
  }else if(label&&/^.{1,48}$/u.test(label[1])){
   throw Error('Use a field from the selected framework before “'+trimmed+'”.');
  }else{
   const unnamed=section==='exclude'&&(unlabelled.find(row=>normalize(row.text)===normalize(trimmed))||(!current&&unlabelled.length===1?unlabelled[0]:null));
   if(unnamed){rows.set(rowKey(section,unnamed.heading),{...unnamed,side:section,text:trimmed});continue;}
   if(!current)throw Error('Start each '+(section==='include'?'inclusion':'exclusion')+' rule with its framework field, for example “'+(fields[0]?.heading||'Population')+': …”.');
   current.text=[current.text,trimmed].filter(Boolean).join('；');
  }
 }
 if(text.trim()&&!section&&fields.some(field=>field.include?.length||field.exclude?.length))throw Error('Keep the Inclusion, Exclusion and Description headings so each change can be saved in the right section.');
 return {rows,paragraph:description.join('\n').trim()};
}
function clauses(text){
 if(!text?.trim())return [];
 const terms=[];
 let depth=0,start=0;
 for(let i=0;i<text.length;i++){
  if('(['.includes(text[i]))depth++;
  if(')]'.includes(text[i]))depth=Math.max(0,depth-1);
  if(!depth&&';；'.includes(text[i])){terms.push(text.slice(start,i));start=i+1;}
 }
 terms.push(text.slice(start));
 return terms.map(term=>term.trim()).filter(Boolean);
}
const ruleKey=text=>normalize(text).replace(/^[0-9]+(?:\)|\.(?![0-9]))\s*/,'').replace(/[.。]$/,'');
return {read,parse,clauses,normalize,rowKey,ruleKey};
});
