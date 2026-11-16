'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const D=require('../app/screening-dedup.js'),E=require('../app/screening-dedup-export.js'),R=require('../app/extraction-results.js');
const long='Synthetic abstract <tag> & evidence. '.repeat(1400)+'😀';
const base={title:'Exercise therapy for pain',authors:['Smith J'],year:'2024',journal:'Pain',volume:'1',issue:'1',pages:'1-9',doi:'10.1000/a',pmid:'000123',provenance:[{db:'pubmed',runId:'test'}]};
const d=D.run([{key:'test',at:'test',records:[{...base,uid:'0001',abstract:long},{...base,uid:'0002',abstract:'Short abstract'},{...base,uid:'=1+1',doi:'10.1000/b',pmid:'456',abstract:'Different report'}]}]);
const audit={...d,imported:d.total,retained:d.records.length,possiblePairs:d.pairs,sourceSig:'synthetic'};
const sheets=E.sheets(audit,{project:'test',exportedAt:'2026-11-16'});
assert.deepEqual(sheets.map(s=>s.name),['Records','Matches','Summary','Long text']);
assert.equal(sheets[0].rows.length,4);assert.equal(sheets[1].rows.length,4);assert.equal(sheets[2].rows[1][2],3);assert.equal(sheets[2].rows[1][3],2);
assert(sheets[0].rows[0].includes('Title'));assert(sheets[0].rows[0].includes('Abstract'));assert(sheets[0].rows[0].includes('Source record role'));
assert.equal(sheets[3].rows.slice(1).map(r=>r[3]).join(''),long);for(const sheet of sheets)for(const row of sheet.rows)for(const value of row)if(typeof value==='string')assert(value.length<=32767);
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'aimstep-dedup-excel-')),file=path.join(folder,'synthetic.xlsx');
try{
 fs.writeFileSync(file,R.workbook(sheets));
 const check=spawnSync('python3',['-c',`
import sys,zipfile,xml.etree.ElementTree as ET
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 for name in z.namelist():
  if name.endswith(('.xml','.rels')): ET.fromstring(z.read(name))
 for i in range(1,5):
  sheet=ET.fromstring(z.read('xl/worksheets/sheet%d.xml'%i))
  assert len(sheet.find('s:sheetData/s:row',ns))>1
  pane=sheet.find('s:sheetViews/s:sheetView/s:pane',ns)
  assert pane.get('ySplit')=='1' and pane.get('topLeftCell')=='B2'
  assert sheet.find('s:autoFilter',ns) is not None
  assert not sheet.findall('.//s:f',ns)
 records=ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
 cells={c.get('r'):c for c in records.findall('.//s:c',ns)}
 assert cells['B2'].get('t')=='inlineStr' and cells['B2'].find('s:is/s:t',ns).text=='0001'
 assert cells['K2'].get('t')=='inlineStr' and cells['K2'].find('s:is/s:t',ns).text=='000123'
 assert cells['B4'].get('t')=='inlineStr' and cells['B4'].find('s:is/s:t',ns).text=='=1+1'
 summary=ET.fromstring(z.read('xl/worksheets/sheet3.xml'))
 counts={c.get('r'):c for c in summary.findall('.//s:c',ns)}
 assert counts['C2'].get('t')=='n' and counts['C2'].find('s:v',ns).text=='3'
print('PASS: real XLSX ZIP/XML, first-row headers, frozen header, filters, typed counts, identifiers and formula-like text')
`,file],{encoding:'utf8'});assert.equal(check.status,0,check.stderr);process.stdout.write(check.stdout);
}finally{fs.rmSync(folder,{recursive:true,force:true});}
console.log('PASS: records, automatic/possible matches, summary and lossless long-text continuation');
