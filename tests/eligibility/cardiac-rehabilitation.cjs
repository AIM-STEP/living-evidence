const assert = require('node:assert/strict');
const E = require('../../app/eligibility/engine');
const M = require('../../app/eligibility/model');
const B = require('../../app/eligibility/background');
const {setup} = require('../../tools/test_eligibility_grounding.cjs');

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
  assert.equal(view.reviewTopic,'Clinical and cost-effectiveness of exercise-based cardiac rehabilitation in adults with coronary heart disease');
  assert.match(view.manuscriptParagraph,/compared with no exercise/i);
  assert.equal(field('Comparison'),'no exercise');
  const comparison=saved.elements.find(e=>e.active!==false&&e.dimension_id==='comparator');
  assert(comparison.source_refs.some(r=>r.quote==="'no exercise' control"&&Array.from(sourceText).slice(r.start,r.end).join('')===r.quote));
  assert.match(field('Population'),/^adults with coronary heart disease/i);
  assert.match(field('Intervention'),/exercise training alone or combined with psychosocial\/educational interventions/i);
  assert.match(field('Study design'),/six months or longer/i);
  assert.equal(field('Outcomes'),undefined);
  const [primary,secondary]=view.descriptionContext.outcome_groups;
  assert.equal(primary.label,'Primary');assert.equal(primary.items.length,4);
  assert.match(primary.items[2],/CABG.+PCI/);
  assert.equal(secondary.label,'Secondary');assert.equal(secondary.items.length,2);
  assert.match(secondary.items[0],/quality of life \(HRQoL\)/i);
  assert.doesNotMatch(view.manuscriptParagraph,/required outcome|adults or people/i);
  for(const term of [/randomised controlled trials/i,/six months|6 months/i,/primary outcomes/i,/secondary outcomes/i,
    /myocardial infarction/i,/quality of life/i,/cost[‐‑-]effectiveness/i]){
    assert.match(view.manuscriptParagraph,term);
  }
  assert((view.manuscriptParagraph.match(/We will include/gi)||[]).length<=1);
  assert.deepEqual(view.sourceConfirmations,[]);
  const page=setup();
  const state=page.api.state();
  const machineCriteria=view.rows.map(row=>({title:row.dimension,condition:row.include.join('\n'),uncertain:row.exclude.join('\n')}));
  Object.assign(state,{question:sourceText,framework:view.framework,generationMethodChoice:'machine',activeGenerator:'machine',
    machineCriteria,machineRun:{question:sourceText,reviewType:state.reviewType},
    machineRefinement:{...view,signature:page.api.signature(sourceText,state.reviewType,0,machineCriteria)}});
  page.api.fill();
  const html=page.el('preview').innerHTML;
  const sections=[...html.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map(m=>m[1]);
  assert.deepEqual(sections,['Inclusion','Description']);
  function inOrder(text,labels){
    let last=-1;
    for(const label of labels){
      const index=text.indexOf(label,last+1);
      assert(index>last,'Missing or misplaced '+label);
      last=index;
    }
  }
  const outcomeList=[...primary.items,...secondary.items].map((item,index)=>(index+1)+'.'+item).join('；');
  inOrder(html,['Review topic:','Framework:','>Inclusion<','Population:','Intervention:','Comparison:','>no exercise<','Outcomes:',
    outcomeList,'Study design:','>Description<']);
  assert.doesNotMatch(html.slice(html.indexOf('Outcomes:'),html.indexOf('Study design:')),/primary|secondary/i);
  assert.doesNotMatch(html,/<strong>(?:Context|Other):/i);
  const file=Buffer.from(page.api.export()).toString('utf8');
  const xml=file.slice(file.indexOf('<w:document'),file.indexOf('</w:document>'));
  const table=xml.slice(xml.indexOf('<w:tbl>'),xml.indexOf('</w:tbl>'));
  inOrder(table,['>Include<','>Population<','>Intervention<','>Comparison<','>no exercise<','>Outcomes<',outcomeList,'>Study design<']);
  assert.doesNotMatch(table.slice(table.indexOf('>Outcomes<'),table.indexOf('>Study design<')), /primary|secondary/i);
  inOrder(xml,['Review topic:','Framework:','<w:tbl>','</w:tbl>','>Description<']);
  // The framework still contains an Outcomes slot when the source supplies none.
  delete page.api.state().machineRefinement.descriptionContext.outcome_groups;
  page.api.fill();
  assert.doesNotMatch(page.el('preview').innerHTML,/<strong>Outcomes:<\/strong>/);
  assert.doesNotMatch(Buffer.from(page.api.export()).toString('utf8'),/>Outcomes</);
}

replay().catch(error=>{console.error(error);process.exitCode=1;});
