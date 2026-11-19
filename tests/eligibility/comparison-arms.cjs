// Exercise the usual extraction and review route with a recorded failure shape.
const assert = require('node:assert/strict');
const E = require('../../app/eligibility/engine.js');
const M = require('../../app/eligibility/model.js');
const Methods = require('../../app/eligibility/methodology.js');

const objective = 'To assess the benefits and harms of air compared with supplemental oxygen for resuscitation of term or late preterm infants at birth in reducing rates of mortality and long‐term neurodevelopmental impairment (NDI).';
const eligibility = 'We included term and late preterm infants who received respiratory support at birth comparing air with any supplemental oxygen.';
const state = E.save_input(E.create_project('comparison-arms'), {
  research_question: [objective, eligibility].join(' '), question_framework: 'PICOS', output_language: 'en'
}).state;
const question = state.questions[0];
const source = state.sources.find(s => s.input_kind === 'research_question');
function element(id, dimension, quote) {
  return {candidate_id: id, dimension_id: dimension, normalized_text: quote, structured_value: null,
    source_refs: [E.ref(source, quote)], information_status: 'explicit', semantic_role: 'eligibility_condition',
    scope_status: 'restricted', disposition: 'include'};
}
const copied = () => [element('i','intervention',objective), element('c','comparator',objective)];
const expected = ['air', 'any supplemental oxygen'];

async function run() {
  const steps = [];
  const adapter = {async request(step, state, payload) {
    steps.push(step);
    if (step === 'extract_elements') return {questions: [{
      question_id: question.question_id, review_topic: '', framework_candidates: ['picos'], issues: [],
      elements: copied(), logic: {op:'all_of', children:['i','c'].map(element_id => ({op:'predicate',element_id}))}
    }]};
    assert.equal(step, 'review_normalization');
    assert.deepEqual(payload.items.map(e => e.normalized_text), expected);
    for (const item of payload.items) {
      const ref = item.source_quotes.find(ref => ref.quote === 'comparing air with any supplemental oxygen');
      assert(ref);
      assert.equal(Array.from(source.original_text).slice(ref.start, ref.end).join(''), ref.quote);
    }
    return {items: payload.items.map(e => ({id:e.id,status:'supported',issue_type:'none',reason:'Confirmed from source.',
      semantic_role:e.semantic_role,scope_status:e.scope_status,disposition:e.disposition,information_status:'explicit'}))};
  }};
  const result = await M.analyze(state,E.environment(),adapter,{retries:0});
  assert.deepEqual(steps, ['extract_elements', 'review_normalization']);
  assert.deepEqual(result.candidates.questions[0].elements.map(e => e.normalized_text), expected);
  const legacy = copied();
  Methods.normalizeComparators(legacy, question.source_refs);
  assert.deepEqual(legacy.map(e => e.normalized_text), expected);
  const once = structuredClone(legacy);
  Methods.normalizeComparators(legacy, question.source_refs);
  assert.deepEqual(legacy, once);
  const human = {...copied()[1], decision_status:'confirmed_by_user'};
  Methods.normalizeComparators([human], question.source_refs);
  assert.equal(human.normalized_text, objective);
  const simple = 'To evaluate the effects of paracetamol compared with placebo on mortality in adults.';
  const standalone = copied().map(e => ({...e, normalized_text:simple,
    source_refs:[{source_id:'standalone',source_revision:1,quote:simple,start:0,end:simple.length}]}));
  Methods.normalizeComparisonArms(standalone);
  assert.deepEqual(standalone.map(e => e.normalized_text), ['paracetamol','placebo']);

  const reversed = 'comparing placebo with an active drug';
  const reversedRef = {source_id:'reverse',source_revision:1,quote:reversed,start:0,end:reversed.length};
  const reverseArms = copied().map(e => ({...e, normalized_text:reversed, source_refs:[reversedRef]}));
  Methods.normalizeComparators(reverseArms,[reversedRef]);
  assert.deepEqual(reverseArms.map(e => [e.dimension_id,e.normalized_text]), [['intervention','placebo'],['comparator','an active drug']]);

  const compound = 'Treatment A combined with B versus placebo or rescue therapy when indicated';
  const ambiguous = {...copied()[0],normalized_text:compound,source_refs:[{...question.source_refs[0],quote:compound}]};
  Methods.normalizeComparisonArms([ambiguous]);
  assert.equal(ambiguous.normalized_text, compound);
  console.log('PASS: separately sourced comparison arms reach the existing independent review.');
}
run().catch(error => { console.error(error); process.exitCode=1; });
