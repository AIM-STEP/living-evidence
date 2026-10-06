/* Reviewer-confirmed calibration memory. No network calls or model-generated rules. */
(function(root){
  'use strict';
  const VERSION='reviewer-calibration-v1';
  const clean=v=>String(v??'').trim();
  function hash(value){let h=2166136261;for(const c of JSON.stringify(value)){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');}
  function build(pilot,records,criteria,criteriaSig,before=Infinity){
    const byId=new Map(records.map(r=>[r.uid,r])),names=new Set((criteria?.rows||[]).map(r=>r.title));
    const lessons=[],pending=[];
    for(let i=0;i<Math.min(before,pilot.rounds.length);i++){
      const round=pilot.rounds[i];if(!round.revealedAt||round.criteriaSig&&round.criteriaSig!==criteriaSig)continue;
      for(const id of round.ids){
        const ai=pilot.ai[id],human=pilot.human[id],record=byId.get(id);
        if(!ai||!human||!record)continue;
        const reviewed=human.reviewMode==='ai-first-v1'&&['agree','mistake'].includes(human.review);
        if(ai.decision===human.decision&&!reviewed)continue;
        const criterion=clean(human.calibrationCriterion),guidance=reviewed&&human.review==='agree'?'Reviewer confirmed this decision for this record. Use the cited criterion evidence as an example; do not infer new eligibility rules.':clean(human.note||human.exclusionReason),quote=clean(human.calibrationQuote);
        let issue='';
        if(criterion!=='*'&&!names.has(criterion))issue='Select the criterion to correct.';
        else if(!guidance)issue='Explain the correction for future records.';
        else if(quote&&!((record.title||'')+' '+(record.fullText||record.abstract||'')).includes(quote))issue='The supporting quote must be copied exactly from this record.';
        if(issue){pending.push({recordId:id,round:i+1,title:record.title,issue});continue;}
        lessons.push({id:'round-'+(i+1)+'-'+id,recordId:id,round:i+1,criterion,
          aiDecision:ai.decision,reviewerDecision:human.decision,correction:guidance,...(reviewed?{review:human.review}:{}),
          exclusionReason:clean(human.exclusionReason),supportingQuote:quote,
          title:record.title||'',abstract:record.abstract||'',...(record.fullText?{fullTextExcerpt:record.fullText.slice(0,3000),fullTextTruncated:record.fullText.length>3000}:{}),
          originalJudgments:(ai.criteria||[]).map(c=>({dimension:c.dimension,judgment:c.judgment,quote:c.quote||''}))});
      }
    }
    return {version:VERSION,criteriaSig,lessons,pending,hash:hash({version:VERSION,criteriaSig,lessons,pending})};
  }
  const stop=new Set('the and for with this that from were was are not study trial patients records criterion review'.split(' '));
  function tokens(s){return new Set(clean(s).toLowerCase().match(/[a-z0-9]{3,}/g)?.filter(t=>!stop.has(t))||[]);}
  function select(bundle,record,{maxLessons=12,maxExamples=4,maxChars=20000}={}){
    if(!bundle)return {version:VERSION,hash:'',totalLessons:0,selectedLessonIds:[],rules:[],examples:[]};
    const target=tokens((record.title||'')+' '+(record.abstract||''));
    const ranked=bundle.lessons.map((lesson,index)=>{
      const words=tokens(lesson.title+' '+lesson.correction+' '+lesson.supportingQuote+' '+lesson.abstract);
      let score=(record.uid===lesson.recordId?100000:0)+(lesson.review==='mistake'?20:0);for(const word of words)if(target.has(word))score++;
      return {lesson,index,score};
    }).sort((a,b)=>b.score-a.score||b.lesson.round-a.lesson.round||a.index-b.index);
    const selected={version:bundle.version,hash:bundle.hash,totalLessons:bundle.lessons.length,selectedLessonIds:[],rules:[],examples:[]};
    for(const {lesson} of ranked){
      if(selected.rules.length>=maxLessons)break;
      const rule={lessonId:lesson.id,sourceTitle:lesson.title,criterion:lesson.criterion,correction:lesson.correction,...(lesson.review?{review:lesson.review}:{}),reviewerDecision:lesson.reviewerDecision,supportingQuote:lesson.supportingQuote};
      selected.rules.push(rule);selected.selectedLessonIds.push(lesson.id);
      if(JSON.stringify(selected).length>maxChars){selected.rules.pop();selected.selectedLessonIds.pop();continue;}
    }
    // Rules have priority over examples. Explicitly label any excerpt as partial.
    for(const {lesson} of ranked){
      if(selected.examples.length>=maxExamples)break;
      if(!selected.selectedLessonIds.includes(lesson.id))continue;
      selected.examples.push({lessonId:lesson.id,title:lesson.title,abstract:lesson.abstract.slice(0,3000),
        abstractTruncated:lesson.abstract.length>3000,...(lesson.review?{review:lesson.review}:{}),aiDecision:lesson.aiDecision,reviewerDecision:lesson.reviewerDecision,
        criterion:lesson.criterion,correction:lesson.correction,supportingQuote:lesson.supportingQuote,...(lesson.fullTextExcerpt?{fullTextExcerpt:lesson.fullTextExcerpt,fullTextTruncated:lesson.fullTextTruncated}:{})});
      if(JSON.stringify(selected).length>maxChars)selected.examples.pop();
    }
    return selected;
  }
  const api={VERSION,build,select};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.AimstepCalibration=api;
})(typeof globalThis==='undefined'?this:globalThis);
