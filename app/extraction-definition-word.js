(function(root){
'use strict';
// Native Office Open XML, using the same stored-ZIP format as criteria export.
function xmlEscape(value){return String(value==null?'':value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return(crc^0xffffffff)>>>0}
function concatBytes(parts){const length=parts.reduce((total,part)=>total+part.length,0),result=new Uint8Array(length);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length}return result}
function makeStoredZip(files){const encoder=new TextEncoder(),localParts=[],centralParts=[];let offset=0;for(const file of files){const name=encoder.encode(file.name),data=encoder.encode(file.content),crc=crc32(data),local=new Uint8Array(30+name.length),lv=new DataView(local.buffer);lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,name.length,true);local.set(name,30);localParts.push(local,data);const central=new Uint8Array(46+name.length),cv=new DataView(central.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);central.set(name,46);centralParts.push(central);offset+=local.length+data.length}const centralOffset=offset,central=concatBytes(centralParts),end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,central.length,true);ev.setUint32(16,centralOffset,true);return concatBytes([...localParts,central,end])}

function paragraph(text,kind){
 const heading=kind==='title'||kind==='item';
 const runs=String(text??'').split(/\r\n|\r|\n/).map((line,i)=>'<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>'+(heading?'<w:b/>':'')+'<w:sz w:val="'+(kind==='title'?32:22)+'"/></w:rPr>'+(i?'<w:br/>':'')+'<w:t xml:space="preserve">'+xmlEscape(line)+'</w:t></w:r>').join('');
 return '<w:p><w:pPr>'+(heading?'<w:keepNext/>':'')+'<w:spacing w:before="'+(kind==='item'?160:0)+'" w:after="80" w:line="264" w:lineRule="auto"/></w:pPr>'+runs+'</w:p>';
}
function create(section,items,subtitle='Items definition'){
 const body=paragraph(section,'title')+paragraph(subtitle)+items.map(item=>paragraph(item.label,'item')+paragraph(item.definition)).join('');
 const documentXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>';
 return makeStoredZip([
 {name:'[Content_Types].xml',content:'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'},
 {name:'_rels/.rels',content:'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'},
 {name:'word/document.xml',content:documentXml}
 ]);
}
const api={create,mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
if(typeof module==='object'&&module.exports)module.exports=api;
else root.AimstepDefinitionWord=api;
})(typeof globalThis!=='undefined'?globalThis:this);
