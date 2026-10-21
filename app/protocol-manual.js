/* Manual protocol intake, checked against PROSPERO's public application on
 * 2026-10-21: https://www.crd.york.ac.uk/PROSPERO/
 * Word ranges follow the corresponding current editor, not a registration check.
 */
(function(root){
'use strict';
const yesNo=[['yes','Yes'],['no','No']];
const process=[['independent','At least two people, independently, with disagreement resolution'],['checked','One person or machine, checked by another person'],['single','One person or machine only'],['other','Another process']];
const field=(id,label,hint='',options={})=>({id,label,hint,type:'textarea',...options});
const choice=(id,label,options,hint='',extra={})=>field(id,label,hint,{type:'select',options,...extra});
const when=(id,values)=>data=>[].concat(values).includes(data[id]);
const earlier=(id,label)=>field(id,label,'Earlier information is kept here. Move it into the specific fields above when ready.',{when:data=>!!data[id]});
const sections=[
 {id:'basic',title:'Review title and basic details',fields:[
  field('reviewTitle','Review title','Use a clear English title describing the population, intervention or exposure, and review purpose.',{type:'text',required:true,minWords:5,maxWords:30}),
  field('originalTitle','Original-language title','Optional, when the original title is not in English.',{type:'text',maxWords:30}),
  choice('reviewType','Review type',[['Systematic Review','Systematic review'],['Network/Meta-analysis','Systematic review with meta-analysis / network meta-analysis'],['Diagnostic Review','Diagnostic accuracy review'],['Prognostic Review','Prognostic review'],['Qualitative Review','Qualitative evidence synthesis'],['Scoping Review','Scoping review'],['Other Review','Other review']],'Describe the actual review design. Registry eligibility depends on the review type.'),
  choice('framework','Question framework',[['PICO','PICO'],['PECO','PECO'],['PICo','PICo'],['PCC','PCC'],['Other','Other']],'Use the framework that fits your question.'),
  field('conditionDomain','Condition or domain','Define the condition, health problem or domain of interest.',{maxWords:200}),
  field('rationale','Rationale','Explain why the review is needed and what gap it addresses.',{required:true,minWords:5,maxWords:250}),
  field('objectives','Review objectives / questions','State the questions the review will answer.',{required:true,minWords:10,maxWords:200}),
  field('keywords','Keywords','List searchable topic terms, separated by semicolons.',{type:'text'}),
  field('countries','Countries','List the countries where the review team is based.',{type:'text'}),
  choice('similarReviewExists','Similar reviews identified',yesNo,'Consider existing registrations and publications on the same question.'),
  field('similarReviewDetails','Similar reviews and why this review is needed','Give the relevant citations or links and explain the difference.',{when:when('similarReviewExists','yes'),minWords:10,maxWords:200}),
  choice('sameReviewAuthors','Does this team also author the related review?',yesNo,'',{when:when('similarReviewExists','yes')})
 ]},
 {id:'eligibility',title:'Eligibility criteria',fields:[
  field('populationInclude','Population — inclusion','Define participants, age, diagnosis and other eligibility thresholds.',{required:true,minWords:5,maxWords:200}),
  field('populationExclude','Population — exclusion','Specify excluded populations and the handling of mixed groups.',{maxWords:200}),
  field('interventionInclude','Intervention / exposure — inclusion','Describe eligible interventions, exposures, delivery, dose and duration as relevant.',{maxWords:200}),
  field('interventionExclude','Intervention / exposure — exclusion','Describe explicit exclusions.',{maxWords:200}),
  choice('hasComparator','Does the review use a comparator?',yesNo),
  field('comparatorInclude','Comparator — inclusion','Describe eligible controls or comparison groups.',{when:when('hasComparator','yes'),maxWords:200}),
  field('comparatorExclude','Comparator — exclusion','Describe ineligible comparison groups.',{when:when('hasComparator','yes'),maxWords:200}),
  choice('studyTypes','Eligible study types',[['randomized','Randomized studies'],['nonrandomized','Nonrandomized studies'],['both','Both randomized and nonrandomized studies']]),
  field('studyDesignInclude','Study design — inclusion','Specify eligible designs and essential design features.',{maxWords:250}),
  field('studyDesignExclude','Study design — exclusion','Specify designs to exclude.',{maxWords:150}),
  field('context','Context / setting','Describe relevant settings, geography and other contextual limits.',{minWords:5,maxWords:250}),
  field('otherEligibility','Other eligibility rules','Record additional restrictions, exceptions or rules for mixed samples.'),
  earlier('legacyEligibility','Earlier combined eligibility notes')
 ]},
 {id:'timeline',title:'Timeline of the review',fields:[
  field('startDate','Review start date','Use the review start date, not a publication-date search limit.',{type:'date'}),
  field('endDate','Anticipated completion date','Use the expected completion date of the review.',{type:'date'}),
  choice('livingReview','Will this be a living systematic review?',yesNo,'Selecting Yes opens the living-review methods section below.')
 ]},
 {id:'protocol',title:'Availability of the full protocol',fields:[
  choice('protocolStatus','Full protocol status',[['not-written','Not yet written'],['published','Written and published'],['prepared-upload','Written; a file is prepared for upload'],['not-public','Written but not publicly available'],['other','Other arrangements']]),
  field('protocolReference','Protocol DOI / URL','Provide the DOI or a stable link to the published protocol.',{type:'text',when:when('protocolStatus','published')}),
  field('protocolFilename','Protocol attachment filename','Record the PDF filename to prepare for registration.',{type:'text',when:when('protocolStatus','prepared-upload')}),
  choice('protocolRelease','When may the protocol be made available?',[['immediate','Immediately'],['after-review','After the review is completed']],'',{when:when('protocolStatus','prepared-upload')}),
  field('protocolExplanation','Protocol availability details','Explain unavailable access or other publication arrangements.',{when:when('protocolStatus',['not-public','other']),minWords:5,maxWords:50})
 ]},
 {id:'searching',title:'Searching and screening',fields:[
  choice('publicationSources','Publication status of studies sought',[['published','Published studies'],['unpublished','Unpublished studies'],['both','Both published and unpublished studies']]),
  field('databases','Main databases and platforms','Name each database and the platform used to search it.'),
  field('otherSources','Other information sources','List other sources to be searched.',{maxWords:50}),
  choice('languageRestriction','Will searches be limited by language?',yesNo),
  field('searchLanguages','Eligible search languages','List the languages to include and explain the restriction.',{when:when('languageRestriction','yes')}),
  choice('dateRestriction','Will searches have publication-date limits?',yesNo),
  field('searchStart','Publication-date limit — from','Leave blank if there is no lower limit.',{type:'date',when:when('dateRestriction','yes')}),
  field('searchEnd','Publication-date limit — through','Leave blank if there is no upper limit.',{type:'date',when:when('dateRestriction','yes')}),
  field('searchDateReason','Reason for date restrictions','Explain the choice of search dates.',{when:when('dateRestriction','yes')}),
  choice('searchStrategyStatus','Search strategy availability',[['link','Available at a DOI / URL'],['prepared-upload','A file is prepared for upload'],['not-ready','Not yet available']]),
  field('searchStrategyReference','Search strategy link / attachment filename','Provide the link or the filename being prepared for registration.',{type:'text',when:when('searchStrategyStatus',['link','prepared-upload'])}),
  field('otherIdentification','Other study-identification methods','Describe citation searching, reference checks, registries or author contact, if planned.',{maxWords:50}),
  choice('screeningProcess','Selection process',process,'Describe the actual human / machine roles.'),
  field('screeningOther','Other selection process','Describe the process used when the listed options do not fit.',{when:when('screeningProcess','other'),minWords:1,maxWords:50}),
  field('screeningDisagreements','Resolving screening disagreements','Explain how conflicting decisions will be resolved.'),
  field('screeningAutomation','Automation in searching or screening','Describe any tools, human checks and decision responsibilities.'),
  field('screeningAdditional','Additional searching and screening information','Include search updates and data-management details.',{maxWords:250}),
  earlier('legacySearch','Earlier combined search notes')
 ]},
 {id:'collection',title:'Data collection process',fields:[
  choice('extractionSources','Sources of review data',[['reports','Published articles and reports'],['ipd','Study datasets / individual participant data'],['both','Both reports and study datasets']]),
  choice('extractionProcess','Data extraction process',process),
  field('extractionOther','Other data extraction process','Explain how extraction will be conducted.',{when:when('extractionProcess','other'),minWords:5,maxWords:50}),
  field('dataItems','Data to extract','Specify study, participant, intervention, outcome and other variables.'),
  field('extractionDisagreements','Resolving extraction disagreements','Explain checking and adjudication.'),
  choice('contactAuthors','Contact investigators for missing data?',yesNo),
  field('ipdAccess','Study datasets / individual participant data plan','Describe access, transfer and management of datasets.',{when:when('extractionSources',['ipd','both']),maxWords:50}),
  choice('assessRiskOfBias','Will risk of bias / study quality be assessed?',yesNo),
  field('robRandomized','Tools for randomized studies','Name the tool and version, where applicable.',{when:when('assessRiskOfBias','yes'),maxWords:50}),
  field('robNonrandomized','Tools for nonrandomized studies','Name the tool and version, where applicable.',{when:when('assessRiskOfBias','yes'),maxWords:50}),
  choice('robProcess','Risk-of-bias assessment process',process,'',{when:when('assessRiskOfBias','yes')}),
  choice('robContactAuthors','Ask investigators to clarify missing risk-of-bias information?',yesNo,'',{when:when('assessRiskOfBias','yes')}),
  field('robUse','Use of risk-of-bias judgments','Explain disagreement resolution and how judgments will inform the review.',{when:when('assessRiskOfBias','yes')}),
  field('robReason','Reason for not assessing risk of bias','Explain the decision.',{when:when('assessRiskOfBias','no')}),
  choice('assessReportingBias','Will reporting bias be assessed?',yesNo),
  field('reportingBias','Reporting-bias assessment method','Describe the assessment or explain why it will not be performed.',{when:when('assessReportingBias',['yes','no']),maxWords:50}),
  choice('assessCertainty','Will certainty of evidence be assessed?',yesNo),
  field('certainty','Certainty assessment method','Specify the approach and how it will be applied.',{when:when('assessCertainty','yes'),minWords:5,maxWords:250}),
  field('certaintyReason','Reason for not assessing certainty','Explain the decision.',{when:when('assessCertainty','no')}),
  earlier('legacyMethods','Earlier combined review-methods notes')
 ]},
 {id:'outcomes',title:'Outcomes to be analysed',fields:[
  field('mainOutcomes','Main outcomes','For each primary outcome specify its definition, measurement instrument, time points and planned effect measure.',{minWords:5,maxWords:250}),
  field('additionalOutcomes','Additional outcomes','For each additional outcome include its definition, measurement instrument, time points and effect measure.',{maxWords:300}),
  earlier('legacyOutcomes','Earlier combined outcome notes')
 ]},
 {id:'synthesis',title:'Planned data synthesis',fields:[
  choice('formalSynthesis','Is formal data synthesis planned?',yesNo),
  field('synthesis','Overall synthesis plan','Describe how study results will be combined, or the conditions required for synthesis.',{when:when('formalSynthesis','yes'),minWords:30,maxWords:500}),
  field('noSynthesisReason','Plan when studies will not be combined','Describe how findings will be presented.',{when:when('formalSynthesis','no')}),
  choice('quantitativeSynthesis','Will a meta-analysis be undertaken?',yesNo,'',{when:when('formalSynthesis','yes')}),
  field('effectMeasures','Summary effect measures','Specify the measures for each relevant outcome type.',{when:when('quantitativeSynthesis','yes')}),
  field('metaModels','Statistical models and software','Specify pooling models, estimators and software.',{when:when('quantitativeSynthesis','yes')}),
  field('heterogeneity','Heterogeneity and inconsistency','Describe assessment and planned handling.',{when:when('quantitativeSynthesis','yes')}),
  field('missingData','Missing data and transformations','Describe planned assumptions, conversions and handling of missing data.',{when:when('formalSynthesis','yes')}),
  field('subgroups','Subgroup / subset analyses','Prespecify groups, effect modifiers and their rationale.',{when:when('formalSynthesis','yes'),maxWords:250}),
  field('sensitivity','Sensitivity analyses','Specify the assumptions or decisions to be examined.',{when:when('formalSynthesis','yes')}),
  field('narrativeSynthesis','Qualitative / narrative synthesis','Describe the approach where pooling is inappropriate or a qualitative synthesis is planned.',{when:when('formalSynthesis','yes')})
 ]},
 {id:'living',title:'Living review methods',when:when('livingReview','yes'),fields:[
  field('livingRationale','Rationale for a living review','Explain why continuing updates are needed.',{minWords:50,maxWords:250}),
  field('livingMethods','Living-review methods','Describe surveillance frequency, update triggers, screening and analysis updates, versioning and stopping criteria.',{minWords:20,maxWords:250})
 ]},
 {id:'stage',title:'Current review stage',fields:[
  ...[['pilot','Pilot work'],['searching','Formal searching / study identification'],['screening','Screening against eligibility criteria'],['extraction','Data extraction / receipt of participant data'],['bias','Risk-of-bias / quality assessment'],['synthesis','Data synthesis']].map(([id,label])=>choice('stage_'+id,label,[['not-started','Not started'],['started','Started'],['completed','Completed']],'Record the actual stage, not the planned next stage.')),
  choice('reviewStatus','Overall review status',[['planned','Planned'],['ongoing','Ongoing'],['completed','Completed'],['discontinued','Discontinued']]),
  choice('publishResults','Do you intend to publish the review results?',yesNo),
  field('publicationLanguages','Publication language(s)','List the languages planned for the report.',{type:'text',when:when('publishResults','yes')}),
  field('dissemination','Publication / dissemination plans','Describe the planned publication or explain why results will not be published.',{when:when('publishResults',['yes','no']),minWords:5,maxWords:50})
 ]},
 {id:'team',title:'Review affiliation, funding and peer review',fields:[
  field('teamMembers','Review team and collaborators','Add each person separately, including contact details, institution, country, ORCID if known, and individual interests.',{type:'team'}),
  field('guarantorEmail','Review guarantor email','Use the email address of the team member responsible for the record.',{type:'email'}),
  field('contactEmail','Named contact email','Use the email address of the team member to contact about the review.',{type:'email'}),
  field('contactAddress','Contact postal address','Provide an institutional address where appropriate.'),
  field('affiliation','Organisational affiliation','Name the institution responsible for the review.',{type:'text',minWords:1,maxWords:20}),
  choice('fundingStatus','Funding / support',[['external','External funding'],['institutional','No specific external funding; institutional support'],['none','No funding or agreed institutional support']]),
  field('fundersNoncommercial','Noncommercial funders','Name the public, charitable or other noncommercial organisations.',{when:when('fundingStatus','external'),maxWords:50}),
  field('fundersCommercial','Commercial funders','Name commercial organisations, if relevant.',{when:when('fundingStatus','external'),maxWords:50}),
  field('grantNumbers','Grant / award numbers','Include all known identifiers.',{type:'text',when:when('fundingStatus','external')}),
  field('funderRole','Role of the funder / sponsor','State the role in planning, conducting or reporting the review.',{when:when('fundingStatus','external'),maxWords:50}),
  choice('additionalConflicts','Additional review-level conflicts of interest?',yesNo,'Individual interests are recorded with each team member.'),
  field('conflicts','Review-level interests','Describe the interests and their management.',{when:when('additionalConflicts','yes'),minWords:10,maxWords:200}),
  choice('peerReviewed','Has this protocol been peer reviewed?',yesNo),
  field('peerReview','Peer-review details','Describe who reviewed the protocol and the review process.',{when:when('peerReviewed','yes'),minWords:10,maxWords:200}),
  earlier('legacyTeam','Earlier combined team and timeline notes')
 ]},
 {id:'additional',title:'Additional information',fields:[
  field('otherRegistration','Other registration details','Provide registry names and identifiers, if this review is registered elsewhere.',{maxWords:50}),
  field('mesh','Medical Subject Headings','Optional: provide known controlled-vocabulary terms.',{type:'text'}),
  field('additionalInformation','Additional information','Include relevant details not covered above.',{maxWords:250}),
  choice('amendingRecord','Is this an amendment to an existing record?',yesNo),
  field('existingRecord','Existing record identifier / link','Identify the record being amended.',{type:'text',when:when('amendingRecord','yes')}),
  field('revisionNote','Changes and reasons','Explain the protocol changes and why they are being made.',{when:when('amendingRecord','yes'),minWords:5,maxWords:250}),
  earlier('legacyOther','Earlier rationale and additional notes')
 ]}
];
const teamFields=[
 {id:'firstName',label:'First name'},{id:'lastName',label:'Last name'},
 {id:'email',label:'Email',type:'email'},{id:'orcid',label:'ORCID'},
 {id:'institution',label:'Institution'},{id:'country',label:'Country'},
 {id:'role',label:'Role',type:'select',options:[['team','Review team member'],['collaborator','Collaborator']]},
 {id:'interests',label:'Potential conflicts of interest',type:'select',options:yesNo},
 {id:'interestDetails',label:'Individual interests and their management',type:'textarea'}
];
const fields=sections.flatMap(section=>section.fields.map(value=>({...value,section:section.id})));
const text=value=>String(value??'').trim();
function migrate(saved,legacy={}){
 if(saved&&typeof saved==='object'&&!Array.isArray(saved))return {...saved};
 return {reviewTitle:text(legacy.question),framework:text(legacy.framework),reviewType:text(legacy.type),legacyEligibility:text(legacy.eligibility),legacyOutcomes:text(legacy.outcomes),legacySearch:text(legacy.search),legacyMethods:text(legacy.methods),legacyTeam:text(legacy.team),legacyOther:text(legacy.other)};
}
function active(field,values){
 const section=sections.find(section=>section.id===field.section);
 if(section?.when&&!section.when(values))return false;
 if(field.when&&!field.when(values))return false;
 // Hide meta-analysis subfields when formal synthesis is deselected.
 if(['effectMeasures','metaModels','heterogeneity'].includes(field.id)&&values.formalSynthesis!=='yes')return false;
 return true;
}
function wordCount(value){return text(value).split(/\s+/).filter(Boolean).length;}
function fieldErrors(field,value){
 const content=text(value);if(!content)return [];
 const count=wordCount(content),errors=[];
 if(field.minWords&&count<field.minWords)errors.push('Use at least '+field.minWords+' words.');
 if(field.maxWords&&count>field.maxWords)errors.push('Use no more than '+field.maxWords+' words.');
 if(/^(?:n\/?a|none|not applicable|-)$/i.test(content)&&field.maxWords)errors.push('Give an explanation or leave the draft field blank.');
 if(field.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content))errors.push('Enter a valid email address.');
 return errors;
}
function validate(values){
 const errors=[];
 if(!text(values.reviewTitle))errors.push('Enter a review title before generating.');
 for(const item of fields){if(item.type==='team'||!active(item,values))continue;for(const error of fieldErrors(item,values[item.id]))errors.push(item.label+': '+error);}
 for(const [start,end,label]of [['startDate','endDate','Review dates'],['searchStart','searchEnd','Publication-date limits']]){
  if(start==='searchStart'&&values.dateRestriction!=='yes')continue;
  if(values[start]&&values[end]&&values[start]>values[end])errors.push(label+': the end must not precede the start.');
 }
 const members=Array.isArray(values.teamMembers)?values.teamMembers:[];
 for(const [index,member]of members.entries()){
  for(const item of teamFields)for(const error of fieldErrors(item,member[item.id]))errors.push('Team member '+(index+1)+' — '+item.label+': '+error);
  if(text(member.orcid)&&!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(text(member.orcid).replace(/^https?:\/\/orcid\.org\//,'')))errors.push('Team member '+(index+1)+': use a valid ORCID format.');
 }
 return errors;
}
function display(item,value){
 if(item.type==='select')return item.options.find(([id])=>id===value)?.[1]||text(value);
 if(item.type==='team')return (Array.isArray(value)?value:[]).filter(member=>Object.values(member).some(value=>text(value))).map((member,index)=>'Person '+(index+1)+'\n'+teamFields.filter(field=>field.id!=='interestDetails'||member.interests==='yes').map(field=>field.label+': '+display(field,member[field.id])).join('\n')).join('\n\n');
 return text(value);
}
function snapshot(values){
 return sections.filter(section=>!section.when||section.when(values)).map(section=>({title:section.title,fields:section.fields.filter(item=>active({...item,section:section.id},values)).map(item=>({id:item.id,label:item.label,text:display(item,values[item.id])}))}));
}
function format(values){return snapshot(values).map((section,index)=>(index+1)+'. '+section.title.toUpperCase()+'\n\n'+section.fields.map(field=>field.label+'\n'+field.text).join('\n\n')).join('\n\n');}
const api={sections,fields,teamFields,migrate,active,wordCount,fieldErrors,validate,snapshot,format};
if(typeof module==='object'&&module.exports)module.exports=api;else root.AimstepProtocolManual=api;
})(globalThis);
