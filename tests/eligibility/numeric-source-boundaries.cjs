const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../../app/eligibility/domain.js');
const check=(source,wording,value=null,dimension='population')=>D.check_semantics(
  {dimension_id:dimension,normalized_text:wording,structured_value:value},
  (Array.isArray(source)?source:[source]).map(quote=>({quote})));
const bound=(operator,value,unit,anchor)=>({operator,value,unit,anchor});
test('age ranges, alternative bound notation and exact elapsed units match their own source',()=>{
  const range={operator:'between',lower:18,upper:65,unit:'years'};
  check('Participants aged 18–65 years.','Participants aged 18 to 65 years.',range,'population.age');
  check('Aged 18 years and older.','Age ≥18 years.',bound('gte',18,'yr'),'population.age');
  check('Within 24 h after birth.','Within 1 day following birth.',bound('lte',1,'day','birth'));
  check('Within 24 h after birth.','Within 1 day following birth.',bound('lte',1,'day','after'));
  check('Age ≥18 years; follow-up of 12 months.','Age ≥18 years and follow-up of 12 months.',bound('gte',18,'years'),'population.age');
  check(['follow-up of 12 months','24 hours after birth'],'follow-up of one year',bound('eq',1,'year'));
});
test('changed direction, units, range ends or time event remain unsupported',()=>{
  const code=e=>e.code==='NUMERIC_SCOPE_CHANGE'&&!!e.details.constraint;
  for(const [source,wording] of [
    ['Aged >18 years.','Aged ≥18 years.'],['Age 18–65 years.','Age 18–66 years.'],
    ['Within 24 h following birth.','Within 24 hours following discharge.'],
    ['Within 24 hours before birth.','Within 24 h after birth.'],
    ['Within 24 hours after birth.','Within 24 hours.'],
    ['Within 24 hours.','Within 24 hours after birth.'],
    ['A dose of 10 mg/kg.','A dose of 10 mg.'],
    ['6 months after admission.','180 days after admission.'],
    [['at least 18','years of follow-up'],'At least 18 years.']
  ])assert.throws(()=>check(source,wording),code,source+' / '+wording);
  assert.throws(()=>check('24 hours after birth.','24 hours after birth.',bound('eq',24,'hr','discharge')),e=>e.code==='TEXT_VALUE_MISMATCH'&&e.details.constraint.anchor==='discharge');
});
