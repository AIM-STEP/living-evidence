const assert=require('node:assert/strict'),S=require('../app/extraction-sources.js');
let x=S.merge([],[{uid:'a',sourceNumber:12,title:'Included'},{uid:'b',sourceNumber:35,title:'Also included'}]);
assert.deepEqual(x.records.map(r=>r.sourceNumber),[12,35]);
x=S.merge([...x.records,{uid:'local',extractionOrigin:'local',title:'Uploaded'}],[{uid:'a',sourceNumber:12,title:'Updated'}],x.numbers);
assert.deepEqual(x.records.map(r=>r.uid),['a','local']);const local=x.records[1].sourceNumber;
assert.equal(x.records[0].title,'Updated');
x=S.merge(x.records,[],x.numbers);assert.equal(x.records.length,1);assert.equal(x.records[0].uid,'local');assert.equal(x.records[0].sourceNumber,local);
x=S.merge(x.records,[{uid:'a',sourceNumber:12}],x.numbers);assert.equal(x.records[1].sourceNumber,local);
console.log('PASS: upstream fixed numbers, automatic additions/removals, local upload preservation and stable numbering');
