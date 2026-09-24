/**
 * Sentence templates that turn framework elements into one research question.
 *
 * ONLY PICO IS SOURCED. The rest are provisional — see below.
 *
 * Neither source document gives these templates.
 * CLAUDE_ELIGIBILITY_BUILDER_PROMPT.md asks for "每个框架使用明确、可测试的本地
 * 句式模板" without supplying them, and 纳排标准构建_工作流说明.docx only says the
 * question is 按所选框架的句式自动拼写. The one concrete instance anywhere in the
 * three inputs is in interface-reference.png, which renders PICO as:
 *
 *     在成人慢性失眠患者中，与常规治疗相比，数字化 CBT-I 对睡眠质量（PSQI）的影响如何？
 *
 * so PICO's Chinese template below is read off that image and is authoritative.
 * The other seven are written here. They follow each framework's conventional
 * phrasing, but no source states them, and the team may well word them
 * differently — 表 5 议题 9 (术语中文定名) is open precisely on this kind of
 * wording.
 *
 * Replacing them is a one-file change: every template lives here, nothing else
 * hard-codes a sentence, and the tests check structure rather than wording.
 *
 * A slot is written {KEY} where KEY is an element key of that framework.
 * Braces delimit, so {C} and {Cx} in PCC cannot be confused for one another.
 *
 * One invariant survives any rewording, and the tests hold it: each template
 * references every element of its framework exactly once. A template that
 * silently dropped an element would produce a question missing something the
 * user had filled in.
 */

/** Frameworks whose wording is not backed by a source document. */
export const PROVISIONAL_TEMPLATES = ["PECO", "PEO", "SPIDER", "PIRD", "CoCoPop", "PCC"];

export const QUESTION_TEMPLATES = {
  // From interface-reference.png. Do not reword without a new reference.
  PICO: {
    zh: "在{P}中，与{C}相比，{I}对{O}的影响如何？",
    en: "In {P}, what is the effect of {I} compared with {C} on {O}?"
  },
  PECO: {
    zh: "在{P}中，与{C}相比，{E}是否与{O}相关？",
    en: "In {P}, is {E} compared with {C} associated with {O}?"
  },
  PEO: {
    zh: "在{P}中，{E}与{O}之间有何关联？",
    en: "In {P}, how is {E} associated with {O}?"
  },
  SPIDER: {
    zh: "在{S}中，{R}（{D}）如何呈现{PI}的{E}？",
    en: "Among {S}, how do {R} using {D} describe {E} of {PI}?"
  },
  PIRD: {
    zh: "在{P}中，以{R}为参考标准，{I}诊断{D}的准确性如何？",
    en: "In {P}, what is the accuracy of {I} for diagnosing {D} against {R} as the reference standard?"
  },
  CoCoPop: {
    zh: "在{Cx}的{Pop}中，{Co}的患病率或发病率是多少？",
    en: "What is the prevalence or incidence of {Co} among {Pop} in {Cx}?"
  },
  PCC: {
    zh: "在{Cx}中，关于{P}的{C}存在哪些证据？",
    en: "What evidence exists on {C} among {P} in {Cx}?"
  },
  CUSTOM: {
    // Free-text: whatever the user wrote is the question. No sentence is built
    // around it, because any wrapper would be putting words in their mouth.
    zh: "{Q}",
    en: "{Q}"
  }
};

/** Every slot key a template refers to, in order of appearance. */
export function slotsOf(template) {
  return [...template.matchAll(/\{([A-Za-z]+)\}/g)].map(m => m[1]);
}
