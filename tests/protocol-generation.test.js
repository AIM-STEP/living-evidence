const test=require('node:test'),assert=require('node:assert/strict'),G=require('../app/protocol-generation.js');
const manual={generationMethodChoice:'manual',activeGenerator:'manual',question:'Exercise for adults with fibromyalgia',reviewType:'Systematic Review',framework:'PICO',criteria:[{title:'Population',condition:'Adults with fibromyalgia.',uncertain:'Exclude children.',definition:'Mixed populations require separate adult data.'},{title:'Intervention',condition:'Exercise for at least 12 weeks.'},{title:'Outcomes',condition:'Pain is measured.'}],machineCriteria:[{title:'Population',condition:'Unrelated machine draft.'}],language:'English',dateRange:{start:{year:'2020',month:'01',day:'01'},end:{year:'2026'}}};
const response=()=>({fields:G.fields.map(([id])=>({id,text:'',evidence:[]})),issues:[]});
test('uses only the active saved criteria and rejects unselected templates',()=>{
 const input=G.source(manual);assert.equal(input.rows.length,3);assert(!JSON.stringify(input).includes('Unrelated'));
 const machine=G.source({...manual,generationMethodChoice:'machine',activeGenerator:'machine'});assert.equal(machine.rows[0].inclusion,'Unrelated machine draft.');assert(!machine.evidence.some(item=>item.id==='language'));
 assert.equal(G.source({...manual,generationMethodChoice:''}).rows.length,0);
 assert.equal(G.source({criteria:[{title:'Population',condition:'Adults with the condition or population of interest',definition:'Define age threshold, diagnosis and how mixed populations are handled.'},{title:'Study design',condition:'Eligible study designs'}]}).rows.length,0);
 assert.equal(G.source(null).rows.length,0);
});
test('retains exact inclusion, exclusion, qualifiers and outcome priority',()=>{
 const result=G.validate(response(),G.source(manual)),field=id=>result.fields.find(item=>item.id===id).text;
 assert.equal(field('population'),'Inclusion: Adults with fibromyalgia.\nExclusion: Exclude children.\nOther: Mixed populations require separate adult data.');
 assert.equal(field('interventions'),'Inclusion: Exercise for at least 12 weeks.');
 assert.equal(field('outcomeEligibility'),'Inclusion: Pain is measured.');assert.equal(field('mainOutcomes'),'');
 assert.equal(field('startDate'),'');assert.equal(field('endDate'),'');assert(field('searchLimits').includes('publication date start: 2020-01-01'));
});
test('unsupported dates, team, methods and placeholder values stay blank',()=>{
 const raw=response();for(const item of raw.fields){item.text='Invented reviewers and methods';item.evidence=[{sourceId:'row-0-inclusion',quote:'Adults with fibromyalgia.'}];}
 raw.fields.find(item=>item.id==='reviewTitle').text='Not specified — to confirm';
 raw.fields.find(item=>item.id==='reviewObjectives').evidence=[];
 const result=G.validate(raw,G.source(manual));
 for(const id of ['team','contact','startDate','riskOfBias','synthesis','funding','registration','reviewTitle'])assert.equal(result.fields.find(item=>item.id===id).text,'',id);
 const rendered=G.text(result.fields);assert(!rendered.includes('Invented reviewers'));assert(!rendered.includes('Not specified'));
 assert(rendered.includes('REVIEW TITLE AND BASIC DETAILS'));assert(rendered.includes('TIMELINE OF THE REVIEW'));
});
test('title or objective needs exact supporting evidence and all fields occur once',()=>{
 const input=G.source(manual),raw=response(),title=raw.fields.find(item=>item.id==='reviewTitle');
 title.text='Exercise for adults with fibromyalgia';title.evidence=[{sourceId:'question',quote:manual.question}];
 assert.equal(G.validate(raw,input).fields[0].text,title.text);
 title.evidence[0].quote='Invented quote';assert.equal(G.validate(raw,input).fields[0].text,'');
 raw.fields.pop();assert.throws(()=>G.validate(raw,input),/omitted or duplicated/);
 const duplicate=response();duplicate.fields.push(duplicate.fields[0]);assert.throws(()=>G.validate(duplicate,input),/omitted or duplicated/);
});
