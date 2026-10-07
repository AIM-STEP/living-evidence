const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('search-strategy.html','utf8');
const code=html.slice(html.indexOf('function renderWordTerms('),html.indexOf('function renderConcepts('));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ctx=vm.createContext({document:{querySelectorAll:()=>[]},esc,lines:v=>v.split('\n').filter(Boolean),state:{queries:{pubmed:{text:'old query'}}},now:()=> 'synthetic',saveDraft(){},renderSelectedWords(){},renderStrategies(){}});vm.runInContext(code,ctx);
const c={label:'Population',terms:'fibromyalgia\n<script>synthetic</script>',mesh:'Fibromyalgia\nCustom heading',wordAudit:{finalHeadings:['Fibromyalgia']}};
const words=ctx.renderWordTerms(c,'terms','Words'),headings=ctx.renderWordTerms(c,'mesh','MeSH');assert.equal((words.match(/data-remove-term=/g)||[]).length,2);assert(!words.includes('<script>'));assert(words.includes('&lt;script&gt;'));assert.equal((headings.match(/class="term-unverified"/g)||[]).length,1);assert(headings.includes('data-add-term="mesh"'));
ctx.wordsEdited(c);assert.equal(c.searchWordsEdited,true);assert.equal(ctx.state.queries.pubmed.wordsChanged,true);assert.equal(c.wordAudit.manualEditedAt,'synthetic');
const d={};ctx.wordsEdited(d,false);assert.equal(d.searchWordsEdited,undefined);
const predicate=html.match(/function isRctDesign\(c\)\{[^\n]+/)[0];vm.runInContext(predicate,ctx);assert.equal(ctx.isRctDesign({role:'design',label:'Randomized trials',terms:''}),true);assert.equal(ctx.isRctDesign({role:'design',label:'Randomized trials',searchWordsEdited:true}),false);
console.log('PASS: complete editable inventory, safe HTML, individual removal, heading provenance and stale-query invalidation');

const inputConcept={keywords:'new seed',terms:'existing output',mesh:'Existing heading'};ctx.wordsEdited(inputConcept,true,'keywords');assert.equal(inputConcept.expansionStale,true);assert.equal(inputConcept.terms,'existing output');assert.equal(inputConcept.mesh,'Existing heading');
