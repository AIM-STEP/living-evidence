const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../../app/eligibility/engine.js');
const M=require('../../app/eligibility/model.js');

async function extract(text,quote,coordinates={}){
 const state=E.save_input(E.create_project('citation-typography'),{research_question:text,question_framework:'PICO',output_language:'en'}).state;
 const source=state.sources.find(s=>s.input_kind==='research_question');
 const candidate={candidate_id:'p',dimension_id:'population',normalized_text:quote,structured_value:null,
  information_status:'explicit',scope_status:'restricted',semantic_role:'eligibility_condition',disposition:'include',
  source_refs:[{source_id:source.source_id,source_revision:source.revision,quote,...coordinates}]};
 const fixture={request:async()=>({questions:[{question_id:state.questions[0].question_id,framework_candidates:['pico'],elements:[candidate],issues:[],logic:null}]})};
 const result=await M.extract_elements(state,E.environment(),fixture,{retries:0});
 return result.questions[0].elements[0];
}

test('typographic equivalents retain literal source characters and Unicode code-point positions',async()=>{
 const literal='coﬀee‑drinking\u00a0adults',prefix='📋 研究记录。';
 const e=await extract(prefix+literal+'.','coffee-drinking adults');
 const r=e.source_refs[0];
 assert.equal(r.quote,literal);assert.equal(r.start,Array.from(prefix).length);
 assert.equal(r.end,r.start+Array.from(literal).length);
});

test('exact and equivalent occurrences in opposing sections require an identified source location',async()=>{
 const a='coffee-drinking adults',b='coﬀee‑drinking adults',input='Include '+a+'. Exclude '+b+'.';
 const e=await extract(input,a);
 assert.equal(e.source_occurrence_alternatives.length,2);
 assert.deepEqual(e.source_occurrence_alternatives.map(c=>c.match_quote),[a,b]);
 const start=input.indexOf(b);
 const located=await extract(input,a,{start,end:start+b.length});
 assert.equal(located.source_occurrence_alternatives,undefined);assert.equal(located.source_refs[0].quote,b);
 await assert.rejects(extract(input,a,{start:5000,end:5021}),{code:'QUOTE_OFFSET_MISMATCH'});
});

test('typographic grounding cannot change digits, units, ranges, signs, paragraph boundaries or parts of ligatures',async()=>{
 for(const [source,quote] of [['m²','m2'],['−18','-18'],['18‐25','18-25'],['18–25','18-25'],
  ['1\u202f000','1 000'],['coﬀee\n\nadults','coffee adults'],['coﬀee drinkers','fee drinkers'],['long term','longterm']])
  await assert.rejects(extract(source,quote),{code:'QUOTE_NOT_FOUND'});
});
