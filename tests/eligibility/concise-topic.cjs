const assert=require('node:assert/strict');
const Methods=require('../../app/eligibility/methodology.js');

const item=(dimension_id,normalized_text,extra={})=>({dimension_id,normalized_text,information_status:'explicit',...extra});
const question=(id,original_text='')=>({framework_mapping:{framework_id:id},original_text});
const topic=(id,items,source)=>Methods.topic(question(id,source),items);
assert.equal(topic('picos',[
 item('population','adults with asthma'),item('intervention','budesonide'),item('comparator','salbutamol'),
 item('population','adults with emphysema',{disposition:'exclude'}),item('analysis_method','network meta-analysis'),
 item('population','children',{source_occurrence_pending:true}),item('context','hospital outpatient clinics')
]),'Budesonide versus salbutamol in adults with asthma');
assert.equal(topic('pico_qualitative',[item('phenomenon_of_interest','lived experience of recovery'),item('population','stroke survivors'),item('context','rehabilitation wards')]),'Lived experience of recovery in stroke survivors');
assert.equal(topic('pird',[item('index_test','lung ultrasound'),item('target_condition','pneumonia'),item('population','children')],'What is the diagnostic accuracy of lung ultrasound?'),'Diagnostic accuracy of lung ultrasound for pneumonia in children');
assert.equal(topic('cocopop',[item('condition','asthma'),item('population','children')],'What is the prevalence of asthma in children?'),'Prevalence of asthma in children');
assert.equal(topic('peco',[item('exposure','wood smoke'),item('outcome','asthma'),item('population','children')]),'Wood smoke and asthma in children');
assert.equal(topic('pecos',[item('exposure','wood smoke'),item('outcome','asthma'),item('population','children')]),'Wood smoke and asthma in children');
const neonatalAim='To assess the benefits and harms of air compared with supplemental oxygen for resuscitation of term or late preterm infants at birth in reducing rates of mortality and long‐term neurodevelopmental impairment (NDI)';
const neonatalQuestion={...question('picos',neonatalAim+'. To assess whether the benefits and harms differ by gestational age. We included trials comparing air with any supplemental oxygen.'),review_topic:'Interventions in term or late preterm infants'};
const neonatalGroup=[item('population','term or late preterm infants'),item('population','received respiratory support at birth'),item('population','delivery room')];
const neonatalTitle='Air versus supplemental oxygen for resuscitation of term or late preterm infants at birth';
assert.equal(Methods.topic(neonatalQuestion,[...neonatalGroup,item('intervention','air'),item('comparator','any supplemental oxygen')]),neonatalTitle);
assert.equal(Methods.topic(neonatalQuestion,[...neonatalGroup,item('intervention',neonatalAim),item('comparator',neonatalAim)]),neonatalTitle);
const reported={...neonatalQuestion,original_text:neonatalAim+'. We included randomised trials in term and late preterm infants who received respiratory support at birth comparing air with any supplemental oxygen.',review_topic:'Interventions compared with supplemental oxygen in term and late preterm infants or infants'};
const group=[item('population','term and late preterm infants who received respiratory support at birth')];
for(const [i,c] of [[neonatalAim,'supplemental oxygen'],['air',neonatalAim],['air','any supplemental oxygen']]){
 assert.equal(Methods.topic(reported,[...group,item('intervention',i),item('comparator',c)]),neonatalTitle);
}
assert.equal(Methods.topic(reported,[...group,item('intervention','unverified treatment',{review_pending:true}),item('comparator','unverified control',{review_pending:true})]),neonatalTitle);
const proposed='Air compared with supplemental oxygen for resuscitation of term or late preterm infants at birth';
assert.equal(Methods.topic({...reported,review_topic:proposed},[...group,item('intervention','air'),item('comparator','any supplemental oxygen')]),proposed);
assert.equal(Methods.topic(neonatalQuestion,[item('population','term or late preterm infants who received respiratory support at birth'),item('intervention','air'),item('comparator','any supplemental oxygen')]),neonatalTitle);
assert.equal(Methods.topic(neonatalQuestion,[item('population','adults',{decision_status:'confirmed_by_user'}),item('intervention','air'),item('comparator','supplemental oxygen')]),'Air versus supplemental oxygen in adults');
assert.equal(Methods.topic(neonatalQuestion,[item('population','adults',{decision_status:'confirmed_by_user'}),item('intervention','air'),item('comparator','high-flow oxygen',{explicit_revision:true})]),'Air versus high-flow oxygen in adults');
assert.equal(topic('pico',[item('intervention','high-dose aspirin'),item('comparator','aspirin'),item('population','adults')]),'High-dose aspirin versus aspirin in adults');
assert.equal(topic('pico',[item('intervention','saline'),item('comparator','gel'),item('population','adults')],'To compare saline with gel for prevention of oral ulcers in adults. To compare the interventions for symptom control in children.'),'Saline versus gel for prevention of oral ulcers in adults');
assert.equal(topic('pico',[item('intervention','saline'),item('comparator','gel'),item('population','adults')],'To compare saline with gel in adults. To compare saline with gel for symptom control in children.'),'Saline versus gel in adults');
const longArms=Array.from({length:20},(_,i)=>item('intervention','intervention '+(i+1)));
const bounded=topic('picos',[...longArms,item('comparator','medical therapy'),item('population','adults with asthma who were enrolled at specialised respiratory clinics in hospitals across five regions')]);
assert.equal(bounded,'Interventions compared with medical therapy in adults with asthma');
assert(!/…|\b(?:and|or|with)$/i.test(topic('pico',[item('intervention','exercise and'),item('population','adults')])));
const arms=[item('intervention','exercise',{element_id:'a'}),item('intervention','education',{element_id:'b'}),item('population','adults')];
const alternatives={...question('pico'),logic:{op:'any_of',children:['a','b'].map(element_id=>({op:'predicate',element_id}))}};
assert.equal(Methods.topic(alternatives,arms),'Exercise or education in adults');
const longPopulation='adults with fibromyalgia experiencing recurrent widespread pain for at least three years despite ongoing multidisciplinary rehabilitation';
const longScope=[item('population',longPopulation),item('intervention','exercise')];
assert.equal(Methods.topic({...question('pico'),review_topic:'Exercise in adults with fibromyalgia'},longScope),'Exercise in adults with fibromyalgia');
assert.equal(Methods.topic({...question('pico'),review_topic:'Exercise in adults with COPD'},longScope),'Exercise in adults with fibromyalgia');
const titles=['Exercise in children','Exercise in children','Workplace exposures in adults'].map(objective=>({objective}));
assert.equal(Methods.projectTopic(titles),'Exercise in children · Workplace exposures in adults');
const other={objective:'Continuous blood glucose monitoring for adults with newly diagnosed type 2 diabetes'};
assert.equal(Methods.projectTopic([...titles,other]),'Exercise in children (+2 other topics)');
console.log('PASS: short source-based topics cover named contrasts, alternative interventions, qualitative, diagnostic, prevalence and exposure questions.');
