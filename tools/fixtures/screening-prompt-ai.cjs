'use strict';
// Synthetic model output for request/response tests; no paid model calls.
module.exports=rules=>({
  role:'You are the systematic review reviewer assigned to assess each report using only its title and abstract and the supplied screening criteria.',
  rules:rules.map(rule=>({id:rule.id,interpretation:'For '+rule.dimension+', interpret the supplied inclusion and exclusion together, preserving AND/OR and qualifications. Mark unclear when the available text cannot resolve this condition.'})),
  howToUseRules:'Assess every criterion in its stated order. Match meaning rather than isolated keywords. Missing reporting is not exclusion evidence. Apply an exclusion-only criterion only when evidence resolves whether that explicit exclusion applies.',
  assessmentInstructions:'Return met, not met or unclear for each criterion, with a brief explanation and exact supporting words when available. Include when all criteria are met; exclude only for a clearly unmet criterion with source evidence; otherwise maybe. Never fabricate quotations or add conditions.'
});
