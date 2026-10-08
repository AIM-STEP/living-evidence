/* Local-only import of extraction items and their definitions. */
(function(root){
'use strict';
const sections={baseline:'Baseline information',participant:'Participant',intervention:'Intervention',continuous:'Continuous outcomes',dichotomous:'Dichotomous outcomes',other:'Other information'};
const key=s=>String(s??'').trim().toLowerCase().replace(/[\s_\-]+/g,' ');
function section(s){const k=key(s);return Object.keys(sections).find(x=>key(x)===k||key(sections[x])===k)||({participants:'participant',population:'participant',comparison:'intervention',comparator:'intervention','continuous outcome':'continuous','dichotomous outcome':'dichotomous','binary outcomes':'dichotomous','基本信息':'baseline','受试者':'participant','干预':'intervention','连续结局':'continuous','二分类结局':'dichotomous','其他信息':'other'})[k]||'other';}
function csv(text,delimiter=','){
 const rows=[];let row=[],v='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){v+='"';i++;}else if(quoted||!v)quoted=!quoted;else v+=c;}else if(!quoted&&c===delimiter){row.push(v);v='';}else if(!quoted&&(c==='\n'||c==='\r')){if(c==='\r'&&text[i+1]==='\n')i++;row.push(v);rows.push(row);row=[];v='';}else v+=c;}
 if(quoted)throw Error('An uploaded table contains an unclosed quoted cell.');if(v||row.length){row.push(v);rows.push(row);}return rows;
}
function table(rows,name){
 rows=rows.filter(r=>r.some(x=>String(x??'').trim()));if(!rows.length)return [];
 const heads=rows[0].map(key),index=aliases=>heads.findIndex(x=>aliases.includes(x));
 const item=index(['item','items','field','variable','item name','条目','项目','变量']),def=index(['definition','items definition','item definition','description','定义','条目定义']),sec=index(['section','domain','部分','分组']);
 const make=(label,definition,group)=>({label:String(label??'').trim(),definition:String(definition??'').trim(),hasDefinition:definition!==undefined,section:section(group||name)});
 if(item>=0)return rows.slice(1).filter(r=>r[item]?.trim()).map(r=>make(r[item],def>=0?r[def]:undefined,sec>=0?r[sec]:name));
 // Vertical templates (including AIM-STEP exports): first column contains item names.
 if(def>=0||rows.length>=3&&key(rows[0][0])==='id'&&key(rows[1][0])==='author'&&key(rows[2][0])==='year')return rows.slice(def>=0?1:0).filter(r=>r[0]&&!/ · Source (quotation|passage)$/.test(r[0])&&!['review status','report','codes','arm','result source quotation','result source passage'].includes(key(r[0]))).map(r=>make(r[0],def>=0?r[def]:undefined,name));
 // A two-column Item / Definition list may omit headings.
 if(rows.every(r=>r.length<=2))return rows.map(r=>make(r[0],r[1],name));
 // Conventional blank extraction tables: column headings are the items, not the data below.
 return rows[0].filter(x=>String(x).trim()).map(label=>make(label,undefined,name));
}
function dedupe(items){const out=[],seen=new Map();for(const f of items){if(!f.label?.trim())continue;if(f.label.length>300||f.definition.length>20000)throw Error('An item name or definition is too long.');const id=f.section+'|'+key(f.label),old=seen.get(id);if(old){if(f.hasDefinition&&old.hasDefinition&&f.definition!==old.definition)throw Error('Conflicting definitions for '+f.label+'. Import the files separately or remove the duplicate.');if(f.hasDefinition){old.definition=f.definition;old.hasDefinition=true;}}else{const next={...f};seen.set(id,next);out.push(next);}}if(out.length>1000)throw Error('Import at most 1,000 items at a time.');return out;}
async function unzip(file){
 const data=new Uint8Array(await file.arrayBuffer()),view=new DataView(data.buffer),decoder=new TextDecoder();let end=-1;
 for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw Error('This is not a valid modern Office file. Use .xlsx or .docx.');
 const entries=view.getUint16(end+10,true);if(entries>3000)throw Error('The Office file contains too many entries.');let pos=view.getUint32(end+16,true),total=0;const files={};
 for(let i=0;i<entries;i++){if(view.getUint32(pos,true)!==0x02014b50)throw Error('Invalid Office archive.');const flags=view.getUint16(pos+8,true),method=view.getUint16(pos+10,true),size=view.getUint32(pos+20,true),expanded=view.getUint32(pos+24,true),n=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true),offset=view.getUint32(pos+42,true),name=decoder.decode(data.slice(pos+46,pos+46+n));pos+=46+n+extra+comment;
  if(flags&1)throw Error('Password-protected files are not supported.');if(!/^(xl|word)\/.*\.xml$/.test(name)&&name!=='xl/_rels/workbook.xml.rels')continue;total+=expanded;if(total>50*1024*1024)throw Error('The expanded Office file is too large.');
  if(view.getUint32(offset,true)!==0x04034b50)throw Error('Invalid Office entry.');const start=offset+30+view.getUint16(offset+26,true)+view.getUint16(offset+28,true);if(start+size>data.length)throw Error('Truncated Office file.');let bytes=data.slice(start,start+size);
  if(method===8){if(typeof DecompressionStream==='undefined')throw Error('This browser cannot read compressed Office files. Use CSV or an up-to-date browser.');const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),parts=[];let length=0;while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>expanded||length>50*1024*1024){await reader.cancel();throw Error('Invalid expanded Office size.');}parts.push(value);}bytes=new Uint8Array(length);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}}
  else if(method!==0)throw Error('Unsupported Office compression. Save as .xlsx or .docx again.');if(bytes.length!==expanded)throw Error('Invalid Office entry size.');files[name]=decoder.decode(bytes);
 }return files;
}
function xml(s){if(!s)throw Error('A required Office document part is missing.');const d=new DOMParser().parseFromString(s,'application/xml');if(d.getElementsByTagName('parsererror').length)throw Error('Invalid Office XML.');return d;}
const elements=(node,name)=>Array.from(node.getElementsByTagNameNS('*',name));
const text=node=>elements(node,'t').map(x=>x.textContent).join('');
function spreadsheet(files,raw=false){
 const book=xml(files['xl/workbook.xml']),rels=elements(xml(files['xl/_rels/workbook.xml.rels']),'Relationship'),shared=files['xl/sharedStrings.xml']?elements(xml(files['xl/sharedStrings.xml']),'si').map(text):[];let items=[];
 for(const sh of elements(book,'sheet')){const id=sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'),rel=rels.find(r=>r.getAttribute('Id')===id);if(!rel||rel.getAttribute('TargetMode')==='External')throw Error('Invalid worksheet reference.');const path=rel.getAttribute('Target'),file=path.startsWith('/')?path.slice(1):'xl/'+path.replace(/^\.\//,'');if(!/^xl\/worksheets\/[^/]+\.xml$/.test(file))throw Error('Unsupported worksheet path.');const rows=elements(xml(files[file]),'row').map(row=>{const a=[];for(const c of elements(row,'c')){let col=0;for(const char of (c.getAttribute('r')||'A').replace(/\d/g,''))col=col*26+char.charCodeAt(0)-64;const type=c.getAttribute('t'),v=elements(c,'v')[0]?.textContent||'';a[Math.max(0,col-1)]=type==='s'?shared[Number(v)]||'':type==='inlineStr'?text(c):v;}return Array.from(a,x=>x||'');});if(raw)items.push({sheet:sh.getAttribute('name'),rows});else items.push(...table(rows,sh.getAttribute('name')));}
 return items;
}
function word(files){
 const doc=xml(files['word/document.xml']),body=elements(doc,'body')[0];let items=[],group='other',current=null;
 for(const node of body.children){if(node.localName==='tbl'){items.push(...table(elements(node,'tr').map(r=>Array.from(r.children).filter(c=>c.localName==='tc').map(c=>elements(c,'p').map(text).join('\n'))),group));continue;}if(node.localName!=='p')continue;const t=text(node).trim();if(!t)continue;const heading=section(t.replace(/\s*·\s*Items definition$/i,''));if(heading!=='other'||key(t)==='other information'){group=heading;current=null;continue;}if(/^items? definitions?$/i.test(t))continue;
  const colon=t.match(/^([^:：]{1,150})[:：]\s*(.*)$/);if(colon){current={section:group,label:colon[1],definition:colon[2],hasDefinition:true};items.push(current);}
  else if(elements(node,'b').length||elements(node,'pStyle').some(s=>/heading/i.test(s.getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main','val')||''))){current={section:group,label:t,definition:'',hasDefinition:true};items.push(current);}
  else if(current)current.definition+=(current.definition?'\n':'')+t;
 }return items;
}
async function read(file,options={}){if(!options.permissive&&file.size>10*1024*1024)throw Error('Each form file must be 10 MB or smaller.');const ext=file.name.split('.').pop().toLowerCase();let items;
 if(ext==='xlsx'||ext==='docx'){const files=await unzip(file);items=ext==='xlsx'?spreadsheet(files):word(files);}
 else if(['csv','tsv','txt'].includes(ext)){const t=(await file.text()).replace(/^\ufeff/,'');items=table(csv(t,ext==='tsv'||t.split(/\r?\n/)[0].includes('\t')?'\t':','),file.name.replace(/\.[^.]+$/,''));}
 else if(ext==='json'){const data=JSON.parse(await file.text()),rows=Array.isArray(data)?data:data.fields||data.items;if(!Array.isArray(rows))throw Error('JSON must contain an items or fields array.');items=rows.map(f=>({label:String(f.label||f.item||f.name||''),section:section(f.section),definition:String(f.definition??''),hasDefinition:Object.hasOwn(f,'definition')}));}
 else throw Error('Use .xlsx, .docx, .csv, .tsv, .txt or .json.');
 items=options.permissive?items.filter(f=>f.label?.trim()):dedupe(items);if(!items.length)throw Error('No items were found. Use columns Section, Item and Definition, or a Word item-definition table.');return items;
}
function build(form,items,mode,id,options={}){
 const next=JSON.parse(JSON.stringify(form));items=options.allowDuplicates?items:dedupe(items);if(!items.length&&!options.allowDuplicates)throw Error('Add at least one item.');const fields=mode==='replace'?[]:[...next.fields];
 for(const f of items){const existing=next.fields.find(x=>x.section===f.section&&key(x.label)===key(f.label));const field={...existing,id:existing?.id||id(),section:f.section,label:f.label};if(f.hasDefinition)field.definition=f.definition;else if(options.preserveMissing)field.definition='';else if(!existing)field.definition='Extract '+f.label+' exactly as reported. Use NR if not reported and NA only if not applicable. Provide the supporting quotation and passage.';
  if(f.section==='baseline'){const baseline=({'id':'systemId','system id':'systemId','author':'firstName','year':'year','doi':'doi','journal':'journal'})[key(f.label)];if(baseline)field.baselineKey=baseline;}
  if(f.section==='intervention'&&key(f.label)==='number of arm')field.piooKey='intervention.armCount';
  const at=fields.findIndex(x=>x.id===field.id);if(at<0)fields.push(field);else fields[at]=field;
 }
 next.fields=fields;next.sections=mode==='replace'?[...new Set(fields.map(f=>f.section))]:[...new Set([...next.sections,...fields.map(f=>f.section)])];
 if(mode==='replace')next.outcomes=[];
 next.baselineVersion=3;next.piooVersion=1;next.tidierVersion=2;next.picdoVersion=1;return next;
}
async function sourceText(file){
 const ext=file.name.split('.').pop().toLowerCase();
 if(['txt','md','csv','tsv','json'].includes(ext))return file.text();
 if(ext==='docx'){const files=await unzip(file);return elements(xml(files['word/document.xml']),'p').map(text).join('\n');}
 if(ext==='xlsx')return JSON.stringify(spreadsheet(await unzip(file),true));
 throw Error('Upload PDF, Word (.docx), Excel (.xlsx), text, Markdown, CSV, TSV or JSON source materials.');
}
function combine(items){const result=[];for(const item of items){const matches=result.filter(f=>f.section===item.section&&key(f.label)===key(item.label));const same=matches.find(f=>!f.definition.trim()||!item.definition.trim()||f.definition===item.definition);if(same){if(item.definition.trim()){same.definition=item.definition;same.hasDefinition=item.hasDefinition;}}else result.push({...item});}return result;}
function mount(api){
 const $=id=>document.getElementById(id);let reading=false;
 const status=(message,isError=false)=>{$('form-import-status').textContent=message;$('form-import-status').hidden=!message;$('form-import-status').className=isError?'notice error':'hint';};
 $('import-local-form').addEventListener('click',()=>{if(reading||api.busy())return;$('form-import-files').value='';$('form-import-files').click();});
 $('form-import-files').addEventListener('change',async e=>{const selected=[...e.target.files];if(!selected.length||reading||api.busy())return;reading=true;api.lock(true);$('import-local-form').disabled=true;status('Importing…');let id;
  try{const items=[],unparsed=[],warnings=[];for(const file of selected){try{items.push(...await read(file,{permissive:true}));}catch(error){try{const text=/\.pdf$/i.test(file.name)?(await api.pdf.readPdf(file)).doc.fullText:await sourceText(file);if(text.trim())unparsed.push({name:file.name,text});else warnings.push(file.name+': no readable text was found.');}catch(e){warnings.push(file.name+': '+e.message);}}}
   for(const f of items.filter(f=>f.section==='other')){const groups=[...new Set(items.filter(x=>x.section!=='other'&&key(x.label)===key(f.label)).map(x=>x.section))];if(groups.length===1)f.section=groups[0];}
   id=await api.apply(combine(items),selected.map(f=>f.name),selected,unparsed,warnings);status('');
  }catch(e){status('Could not save the imported form: '+e.message,true);}finally{reading=false;api.lock(false);$('import-local-form').disabled=false;}
  if(id)api.review(id);
 });
}
const api={sections,table,csv,dedupe,read,build,sourceText,combine,mount};if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepExtractionFormImport=api;
})(globalThis);
