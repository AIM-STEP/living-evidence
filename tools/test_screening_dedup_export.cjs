'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const D=require('../app/screening-dedup.js'),E=require('../app/screening-dedup-export.js'),R=require('../app/extraction-results.js');
const base={title:'Exercise therapy <trial> & pain',authors:['Smith J','李明'],year:'2024',journal:'Pain',volume:'1',issue:'1',pages:'1-9',doi:'10.1000/a',pmid:'000123',provenance:[{db:'pubmed',runId:'test'}]};
const batch=records=>[{key:'test',at:'test',records}];
const d=D.run(batch([{...base,uid:'0001',abstract:'Original'},{...base,uid:'0002',abstract:'Short abstract'},{...base,uid:'=1+1',abstract:'Another original'},{...base,uid:'possible-only',doi:'10.1000/b',pmid:'456',abstract:'Different report'}]));
const sheets=E.sheets(d);
assert.equal(E.hasDuplicates(d),true);assert.equal(sheets.length,1);assert.equal(sheets[0].name,'Duplications');assert.equal(sheets[0].rows.length,d.duplicates+1);
assert.deepEqual(sheets[0].rows[0],['ID号','标题','作者','年份','重复理由']);assert(sheets[0].rows.every(row=>row.length===5));
assert.deepEqual(sheets[0].rows.slice(1).map(row=>row[0]),['0002','=1+1']);assert(sheets[0].rows.slice(1).every(row=>/PMID 相同/.test(row[4])&&/保留记录 0001/.test(row[4])));
const possible=D.run(batch([{...base,uid:'a'},{...base,uid:'b',doi:'10.1000/b',pmid:'456'}]));assert.equal(E.hasDuplicates(possible),false);assert.deepEqual(E.sheets(possible),[]);assert.deepEqual(E.sheets({groups:[]}),[]);
const metadata=D.run(batch([{...base,uid:'a',doi:'',pmid:''},{...base,uid:'b',doi:'',pmid:''}]));assert(E.sheets(metadata)[0].rows[1][4].includes('标题、作者'));
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'aimstep-duplications-excel-')),file=path.join(folder,'synthetic.xlsx');
try{
 fs.writeFileSync(file,R.workbook(sheets));
 const check=spawnSync('python3',['-c',`
import sys,zipfile,xml.etree.ElementTree as ET
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 for name in z.namelist():
  if name.endswith(('.xml','.rels')): ET.fromstring(z.read(name))
 assert len([n for n in z.namelist() if n.startswith('xl/worksheets/')])==1
 sheet=ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
 rows=sheet.findall('s:sheetData/s:row',ns)
 assert len(rows)==3 and all(len(r)==5 for r in rows)
 assert [c.find('s:is/s:t',ns).text for c in rows[0]]==['ID号','标题','作者','年份','重复理由']
 pane=sheet.find('s:sheetViews/s:sheetView/s:pane',ns)
 assert pane.get('ySplit')=='1' and pane.get('topLeftCell')=='B2'
 assert sheet.find('s:autoFilter',ns).get('ref')=='A1:E3'
 assert not sheet.findall('.//s:f',ns)
 cells={c.get('r'):c for c in sheet.findall('.//s:c',ns)}
 assert cells['A2'].get('t')=='inlineStr' and cells['A2'].find('s:is/s:t',ns).text=='0002'
 assert cells['A3'].get('t')=='inlineStr' and cells['A3'].find('s:is/s:t',ns).text=='=1+1'
 assert cells['B2'].find('s:is/s:t',ns).text=='Exercise therapy <trial> & pain'
 assert cells['C2'].find('s:is/s:t',ns).text=='Smith J; 李明'
print('PASS: one-sheet XLSX with five exact headers, duplicate-only rows, reasons, frozen header and filters')
`,file],{encoding:'utf8'});assert.equal(check.status,0,check.stderr);process.stdout.write(check.stdout);
}finally{fs.rmSync(folder,{recursive:true,force:true});}
console.log('PASS: unique and possible-only records excluded; IDs, Chinese authors and formula-like text preserved');
