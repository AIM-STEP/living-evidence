const test=require('node:test'),assert=require('node:assert/strict'),M=require('../app/protocol-manual.js');
const title='Exercise interventions for adults living with fibromyalgia';
test('covers the ordered form with unique fields and no assumed answers',()=>{
 assert.deepEqual(M.sections.map(section=>section.id),['basic','eligibility','timeline','protocol','searching','collection','outcomes','synthesis','living','stage','team','additional']);
 assert.equal(new Set(M.fields.map(field=>field.id)).size,M.fields.length);
 for(const id of ['reviewTitle','originalTitle','rationale','objectives','countries','populationInclude','populationExclude','interventionInclude','interventionExclude','hasComparator','studyDesignInclude','studyDesignExclude','protocolStatus','publicationSources','languageRestriction','dateRestriction','screeningProcess','extractionSources','assessRiskOfBias','assessReportingBias','assessCertainty','mainOutcomes','additionalOutcomes','formalSynthesis','livingReview','teamMembers','guarantorEmail','contactEmail','fundingStatus','peerReviewed','otherRegistration','revisionNote'])assert(M.fields.some(field=>field.id===id),id);
 const draft=M.format({reviewTitle:title});assert(!draft.includes('No conflict of interest declared'));assert(!draft.includes('Randomized studies\n'));
 assert.deepEqual(M.validate({reviewTitle:title}),[]);
});
test('migrates every old input without guessing how to split combined notes',()=>{
 const old={question:title,framework:'PICO',type:'Systematic Review',eligibility:'Population and intervention notes',outcomes:'Primary and secondary notes',search:'Earlier search plan',methods:'Earlier methods',team:'Earlier team and dates',other:'Other earlier notes'};
 const migrated=M.migrate(null,old);assert.equal(migrated.reviewTitle,title);assert.equal(migrated.populationInclude,undefined);assert.equal(migrated.mainOutcomes,undefined);
 assert.equal(migrated.reviewType,old.type);for(const value of Object.values(old))assert(M.format(migrated).toLowerCase().includes(value.toLowerCase()),value);
 assert.equal(M.migrate({reviewTitle:''},old).reviewTitle,'');
});
test('conditional sections keep data while excluding inapplicable content from the document',()=>{
 const values={reviewTitle:title,livingReview:'no',livingMethods:'Old living plan',formalSynthesis:'no',quantitativeSynthesis:'yes',effectMeasures:'Stale pooled effects',hasComparator:'no',comparatorInclude:'Stale comparator',dateRestriction:'no',searchStart:'2026-12-01',searchEnd:'2020-01-01'};
 const output=M.format(values);for(const text of ['Old living plan','Stale pooled effects','Stale comparator'])assert(!output.includes(text));assert(!M.validate(values).some(message=>message.includes('Publication-date')));
 assert.equal(values.effectMeasures,'Stale pooled effects');
 const living=M.snapshot({...values,livingReview:'yes'});assert(living.some(section=>section.title==='Living review methods'));
});
test('validates supplied word ranges, placeholders, email, ORCID and date order',()=>{
 assert(M.validate({reviewTitle:'Too short'}).some(error=>error.includes('5 words')));
 assert(M.validate({reviewTitle:title,rationale:'N/A'}).some(error=>error.includes('explanation')));
 assert(M.validate({reviewTitle:title,startDate:'2026-12-01',endDate:'2026-01-01'}).some(error=>error.includes('end must not precede')));
 assert(M.validate({reviewTitle:title,contactEmail:'invalid'}).some(error=>error.includes('valid email')));
 assert(M.validate({reviewTitle:title,teamMembers:[{firstName:'Lee',email:'invalid',orcid:'invalid'}]}).some(error=>error.includes('ORCID')));
 assert.deepEqual(M.validate({reviewTitle:title,teamMembers:[{firstName:'Lee',email:'lee@example.org',orcid:'https://orcid.org/0000-0002-1825-0097'}]}),[]);
});
test('formats all people and truthful stage choices without defaults or stale disclosures',()=>{
 const values={reviewTitle:title,teamMembers:[{firstName:'Lee',lastName:'Chen',email:'lee@example.org',role:'team',interests:'no',interestDetails:'Old disclosure'},{firstName:'Ana',lastName:'Silva',role:'collaborator',interests:'yes',interestDetails:'Relevant consultancy'}],stage_pilot:'completed',stage_searching:'not-started',fundingStatus:'none'};
 const output=M.format(values);for(const text of ['Lee','Chen','Ana','Silva','Collaborator','Relevant consultancy','Completed','Not started','No funding or agreed institutional support'])assert(output.includes(text),text);
 assert(!output.includes('Old disclosure'));assert(output.indexOf('Review title')<output.indexOf('Main outcomes'));
});
