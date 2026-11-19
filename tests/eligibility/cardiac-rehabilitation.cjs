const assert = require('node:assert/strict');
const E = require('../../app/eligibility/engine');
const M = require('../../app/eligibility/model');
const B = require('../../app/eligibility/background');

const sourceText = "To assess the clinical and cost‐effectiveness of exercise‐based CR (exercise training alone or combined with psychosocial/educational interventions) compared with 'no exercise' control, on mortality, morbidity and health‐related quality of life (HRQoL) in people with Coronary heart disease (CHD). We included randomised controlled trials (RCTs) of exercise‐based CR, compared with 'no exercise' control, with follow‐up of six months or longer, in adults with CHD. Primary outcomes included mortality (all‐cause and cardiovascular), fatal and non‐fatal myocardial infarction (MI), revascularisation (coronary artery bypass graft (CABG) and percutaneous coronary intervention (PCI)), and hospitalisation (all‐cause and cardiovascular). Secondary outcomes included HRQoL and cost‐effectiveness. We categorised follow‐up as short‐term (6 to 12 months), medium‐term (> 12 to 36 months), and long‐term (> 36 months).";
const sentences = sourceText.split(/(?<=\.) /u);
const project = E.save_input(E.create_project('cardiac-review'), {
  research_question:sourceText, question_type:'intervention_effect', output_language:'en'
}).state;
const question = project.questions[0], source = project.sources.find(s=>s.input_kind==='research_question');

async function replay() {
  const records = [
    ['population','adults or people with coronary heart disease',sourceText],
    ['intervention','exercise-based cardiac rehabilitation (exercise training alone or combined with psychosocial/educational interventions)',sentences[0]],
    ['comparator',sentences[0].slice(0,-1),sourceText],
    ['study_design','randomised controlled trials',sentences[1]],
    ['outcome',sentences[2],sentences[2]],
    ['outcome',sentences[3],sentences[3]]
  ];
  const leaf = i=>({op:'predicate',element_id:'e'+i});
  const adapter = {async request(step,state,payload) {
    if(step==='extract_elements')return {questions:[{question_id:question.question_id,
      review_topic:'People with coronary heart disease', framework_candidates:['picos'], issues:[],
      elements:records.map(([dimension_id,normalized_text,quote],i)=>({candidate_id:'e'+i,dimension_id,normalized_text,
        source_refs:[E.ref(source,quote)],information_status:'explicit',semantic_role:'eligibility_condition',
        scope_status:'restricted',disposition:'include',structured_value:null})),
      logic:{op:'all_of',children:[leaf(0),leaf(1),leaf(2),leaf(3),{op:'any_of',children:[leaf(4),leaf(5)]}]}
    }]};
    assert.equal(step,'review_normalization');
    return {items:payload.items.map(i=>({...i,status:'supported',issue_type:'none',reason:'Matches the cited source.'}))};
  }};
  const {candidates}=await M.analyze(project,E.environment(),adapter,{retries:0});
  const saved=E.ingest_candidates(project,candidates).state, view=B.projectToClassic(saved);
  const field=name=>view.rows.find(row=>row.dimension===name)?.include.join(' ');
  assert.match(view.reviewTopic,/exercise-based cardiac rehabilitation/i);
  assert.match(view.reviewTopic,/adults with coronary heart disease/i);
  assert.deepEqual(field('Comparison'),"'no exercise' control");
  assert.match(field('Population'),/^adults with coronary heart disease/i);
  assert.match(field('Intervention'),/exercise training alone or combined with psychosocial\/educational interventions/i);
  assert.match(field('Study design'),/six months or longer/i);
  assert.equal(field('Outcomes'),undefined);
  const [primary,secondary]=view.descriptionContext.outcome_groups;
  assert.equal(primary.label,'Primary');assert.equal(primary.items.length,4);
  assert.match(primary.items[2],/CABG.+PCI/);
  assert.equal(secondary.label,'Secondary');assert.equal(secondary.items.length,2);
  assert.match(secondary.items[0],/quality of life \(HRQoL\)/i);
  assert.doesNotMatch(view.manuscriptParagraph,/required outcome|to assess the clinical|adults or people/i);
  assert.deepEqual(view.sourceConfirmations,[]);
}

replay().catch(error=>{console.error(error);process.exitCode=1;});
