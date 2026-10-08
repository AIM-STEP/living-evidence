const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../extraction.html'),'utf8');const c=vm.createContext({});vm.runInContext(html.slice(html.indexOf('const FIELD_SECTIONS='),html.indexOf('let ws=null')),c);
const fields=[{id:'country',label:'Country'},{id:'age',label:'Mean age (years)'},{id:'n',label:'Number randomised'},{id:'therapy',label:'Background therapy'},{id:'custom',label:'My field',section:'intervention'}];const grouped=c.groupFormFields(fields);
assert.deepEqual(Array.from(grouped,f=>f.section),['baseline','participant','participant','intervention','intervention']);assert.deepEqual(Array.from(grouped,f=>f.id),fields.map(f=>f.id));assert.equal(fields[0].section,undefined);
for(const name of ['Baseline information','Participant','Intervention','Outcome'])assert(html.includes('>'+name+'</h3>'));
assert(!html.includes('id="field-chips"'));assert(!html.includes('>Study fields</h3>'));console.log('PASS: four sections, legacy field migration, IDs and custom section preservation');
