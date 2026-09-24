/**
 * Eligibility Criteria Builder — framework, field and limiter definitions.
 *
 * Pure data. No DOM, no network, no model. The UI renders whatever is declared
 * here, so adding a framework or a limiter means editing this file and nothing
 * else — the alternative, a page template per framework, drifts the moment one
 * copy is edited and the other seven are not.
 *
 * PROVENANCE, per item, because the three sources do not cover the same ground:
 *
 *   element keys and 中文名
 *       纳排标准构建_工作流说明.docx, 表 1 (all frameworks) and 表 2 (PICO in
 *       detail). Where the two disagree, 表 2 wins for PICO because it is the
 *       detailed table and the interface reference agrees with it: PICO's P is
 *       "研究人群 / 问题", not the shorter "研究人群" of 表 1.
 *   placeholder hints
 *       表 2 gives them for PICO ONLY. The other six frameworks' hints are
 *       written here and marked `invented: true`. They are grey input
 *       placeholders that no export path can read, but they are still text a
 *       user sees, so they are flagged rather than blended in.
 *   limiter categories and options
 *       表 3, verbatim, including the nine study designs.
 *   pill short labels
 *       interface-reference.png, which shows RCT / 类实验 / 队列 / 病例对照 /
 *       横断面 / 质性 on the buttons while the generated criteria spell the
 *       names out. Full names are what land in a protocol, so `label` is the
 *       docx name and `pill` is the button caption.
 *   recommendation mapping
 *       表 1, column 适用的问题类型（自动推荐依据）.
 *
 * Every user-visible string carries zh and en. The site is bilingual and its
 * language toggle is global; a module that answered only in Chinese would flip
 * half the page and leave this half behind. Chinese is the source language
 * here — the English is a translation of it, not the other way round.
 */

export const FRAMEWORKS = [
  {
    id: "PICO",
    label: { zh: "PICO", en: "PICO" },
    note: { zh: "干预性研究", en: "Intervention studies" },
    elements: [
      { key: "P", label: { zh: "研究人群 / 问题", en: "Population / problem" },
        hint: { zh: "成人慢性失眠患者", en: "Adults with chronic insomnia" } },
      { key: "I", label: { zh: "干预措施", en: "Intervention" },
        hint: { zh: "数字化 CBT-I 应用", en: "A digital CBT-I application" } },
      { key: "C", label: { zh: "对照", en: "Comparator" },
        hint: { zh: "常规治疗或等待对照", en: "Usual care or a waiting-list control" } },
      { key: "O", label: { zh: "结局指标", en: "Outcome" },
        hint: { zh: "8 周时睡眠质量（PSQI）", en: "Sleep quality at 8 weeks (PSQI)" } }
    ]
  },
  {
    id: "PECO",
    label: { zh: "PECO", en: "PECO" },
    note: { zh: "病因（危害 / 因果）", en: "Aetiology (harm / causation)" },
    elements: [
      { key: "P", label: { zh: "研究人群", en: "Population" }, invented: true,
        hint: { zh: "学龄期儿童", en: "School-age children" } },
      { key: "E", label: { zh: "暴露因素", en: "Exposure" }, invented: true,
        hint: { zh: "长期暴露于细颗粒物", en: "Long-term fine particulate exposure" } },
      { key: "C", label: { zh: "对照", en: "Comparator" }, invented: true,
        hint: { zh: "低暴露水平", en: "Lower exposure levels" } },
      { key: "O", label: { zh: "结局指标", en: "Outcome" }, invented: true,
        hint: { zh: "哮喘新发", en: "Incident asthma" } }
    ]
  },
  {
    id: "PEO",
    label: { zh: "PEO", en: "PEO" },
    note: { zh: "预后（预测）", en: "Prognosis (forecast)" },
    elements: [
      { key: "P", label: { zh: "研究人群", en: "Population" }, invented: true,
        hint: { zh: "急性心肌梗死出院患者", en: "Patients discharged after acute myocardial infarction" } },
      { key: "E", label: { zh: "暴露或预后因素", en: "Exposure or prognostic factor" }, invented: true,
        hint: { zh: "基线抑郁症状", en: "Depressive symptoms at baseline" } },
      { key: "O", label: { zh: "结局指标", en: "Outcome" }, invented: true,
        hint: { zh: "1 年内再入院", en: "Readmission within one year" } }
    ]
  },
  {
    id: "SPIDER",
    label: { zh: "SPIDER", en: "SPIDER" },
    note: { zh: "质性（意义）", en: "Qualitative (meaning)" },
    elements: [
      { key: "S", label: { zh: "样本", en: "Sample" }, invented: true,
        hint: { zh: "社区护理人员", en: "Community nurses" } },
      { key: "PI", label: { zh: "关注的现象", en: "Phenomenon of Interest" }, invented: true,
        hint: { zh: "对远程随访的体验", en: "Experiences of remote follow-up" } },
      { key: "D", label: { zh: "研究设计", en: "Design" }, invented: true,
        hint: { zh: "半结构化访谈", en: "Semi-structured interviews" } },
      { key: "E", label: { zh: "评价内容", en: "Evaluation" }, invented: true,
        hint: { zh: "可接受性与障碍", en: "Acceptability and barriers" } },
      { key: "R", label: { zh: "研究类型", en: "Research type" }, invented: true,
        hint: { zh: "质性研究", en: "Qualitative studies" } }
    ]
  },
  {
    id: "PIRD",
    label: { zh: "PIRD", en: "PIRD" },
    note: { zh: "诊断", en: "Diagnosis" },
    elements: [
      { key: "P", label: { zh: "研究人群", en: "Population" }, invented: true,
        hint: { zh: "疑似深静脉血栓的成人", en: "Adults with suspected deep vein thrombosis" } },
      { key: "I", label: { zh: "待评价试验", en: "Index test" }, invented: true,
        hint: { zh: "床旁超声", en: "Point-of-care ultrasound" } },
      { key: "R", label: { zh: "参考标准", en: "Reference standard" }, invented: true,
        hint: { zh: "静脉造影", en: "Venography" } },
      { key: "D", label: { zh: "目标疾病", en: "Target condition" }, invented: true,
        hint: { zh: "近端深静脉血栓", en: "Proximal deep vein thrombosis" } }
    ]
  },
  {
    id: "CoCoPop",
    label: { zh: "CoCoPop", en: "CoCoPop" },
    note: { zh: "患病率 / 发病率", en: "Prevalence / incidence" },
    elements: [
      { key: "Co", label: { zh: "疾病或状况", en: "Condition" }, invented: true,
        hint: { zh: "妊娠期糖尿病", en: "Gestational diabetes" } },
      { key: "Cx", label: { zh: "研究场景", en: "Context" }, invented: true,
        hint: { zh: "城市三级医院产科门诊", en: "Urban tertiary antenatal clinics" } },
      { key: "Pop", label: { zh: "研究人群", en: "Population" }, invented: true,
        hint: { zh: "初产妇", en: "Primiparous women" } }
    ]
  },
  {
    id: "PCC",
    label: { zh: "PCC", en: "PCC" },
    note: { zh: "证据图谱、范围综述", en: "Evidence maps and scoping reviews" },
    elements: [
      { key: "P", label: { zh: "研究人群", en: "Population" }, invented: true,
        hint: { zh: "青少年", en: "Adolescents" } },
      { key: "C", label: { zh: "核心概念", en: "Concept" }, invented: true,
        hint: { zh: "数字心理健康素养", en: "Digital mental-health literacy" } },
      { key: "Cx", label: { zh: "研究场景", en: "Context" }, invented: true,
        hint: { zh: "中低收入国家的学校", en: "Schools in low- and middle-income countries" } }
    ]
  },
  {
    id: "CUSTOM",
    label: { zh: "自定义", en: "Custom" },
    note: { zh: "方法学、其他", en: "Methodology and other" },
    // One free-text box, deliberately not split: 表 1 says 单栏自由填写（不拆要素）.
    freeform: true,
    elements: [
      { key: "Q", label: { zh: "研究问题", en: "Research question" }, invented: true,
        hint: { zh: "请直接写出完整的研究问题", en: "Write the research question in full" } }
    ]
  }
];

/**
 * Upstream question_type → recommended framework.
 *
 * The keys are the exact option values the project form stores on
 * projects/{pid}.question_type, not a parallel vocabulary: a mapping keyed on
 * anything else silently stops recommending the moment that form is edited.
 * The ten values below are every option the form offers, so no case is
 * unmapped — a test holds that true against UPSTREAM_QUESTION_TYPES.
 */
export const RECOMMENDED_BY_QUESTION_TYPE = {
  effectiveness: "PICO",
  prevention: "PICO",
  etiology: "PECO",
  prognosis: "PEO",
  qualitative: "SPIDER",
  diagnosis: "PIRD",
  prevalence: "CoCoPop",
  mapping: "PCC",
  methodology: "CUSTOM",
  other: "CUSTOM"
};

/** Every question_type the upstream project form can store. */
export const UPSTREAM_QUESTION_TYPES = [
  "effectiveness", "mapping", "prevention", "etiology", "diagnosis",
  "prognosis", "qualitative", "prevalence", "methodology", "other"
];

/**
 * Limiters, from 表 3. Nothing is selected by default — the table says 不勾选 /
 * 不限 for every row, and a pre-ticked limiter would quietly narrow someone's
 * review without their having chosen it.
 */
export const LIMITERS = [
  {
    id: "design",
    label: { zh: "研究设计", en: "Study design" },
    type: "multi",
    options: [
      { id: "rct", label: { zh: "随机对照试验", en: "Randomised controlled trials" },
        pill: { zh: "RCT", en: "RCT" } },
      { id: "quasi", label: { zh: "类实验研究", en: "Quasi-experimental studies" },
        pill: { zh: "类实验", en: "Quasi-exp." } },
      { id: "cohort", label: { zh: "队列研究", en: "Cohort studies" },
        pill: { zh: "队列", en: "Cohort" } },
      { id: "casecontrol", label: { zh: "病例对照研究", en: "Case-control studies" },
        pill: { zh: "病例对照", en: "Case-control" } },
      { id: "crosssectional", label: { zh: "横断面研究", en: "Cross-sectional studies" },
        pill: { zh: "横断面", en: "Cross-sectional" } },
      { id: "casereport", label: { zh: "病例报告或系列", en: "Case reports or series" },
        pill: { zh: "病例报告", en: "Case report" } },
      { id: "qualitative", label: { zh: "质性研究", en: "Qualitative studies" },
        pill: { zh: "质性", en: "Qualitative" } },
      { id: "srma", label: { zh: "系统评价或 Meta 分析", en: "Systematic reviews or meta-analyses" },
        pill: { zh: "系统评价 / Meta", en: "SR / MA" } },
      { id: "modelling", label: { zh: "模型研究", en: "Modelling studies" },
        pill: { zh: "模型研究", en: "Modelling" } }
    ]
  },
  {
    id: "year",
    label: { zh: "发表年份", en: "Publication year" },
    type: "range",
    // A hint only. 表 3 shows 如"2015 年及以后" as an illustration of the format,
    // and the prompt adds 不得作为默认真实值.
    hint: { zh: "例如 2015 年及以后", en: "e.g. 2015 onwards" }
  },
  {
    id: "language",
    label: { zh: "语种", en: "Language" },
    type: "multi",
    // 表 3: 选"不限"自动取消其他.
    exclusive: "any",
    options: [
      { id: "en", label: { zh: "英文", en: "English" } },
      { id: "zh", label: { zh: "中文", en: "Chinese" } },
      { id: "any", label: { zh: "不限语种", en: "Any language" } }
    ]
  },
  {
    id: "pubtype",
    label: { zh: "文献类型", en: "Publication type" },
    type: "multi",
    options: [
      { id: "peer", label: { zh: "同行评议论文", en: "Peer-reviewed articles" } },
      { id: "preprint", label: { zh: "预印本", en: "Preprints" } },
      { id: "abstract", label: { zh: "会议摘要", en: "Conference abstracts" } },
      { id: "thesis", label: { zh: "学位论文", en: "Theses and dissertations" } },
      { id: "grey", label: { zh: "灰色文献或报告", en: "Grey literature or reports" } }
    ]
  },
  {
    id: "other",
    label: { zh: "其他限定", en: "Other limits" },
    type: "multi",
    options: [
      { id: "human", label: { zh: "仅人类受试者", en: "Human subjects only" } },
      { id: "fulltext", label: { zh: "可获取全文", en: "Full text available" } }
    ]
  }
];

/** Lookups, so callers never re-scan the arrays by hand. */
export function getFramework(id) {
  return FRAMEWORKS.find(f => f.id === id) || null;
}

export function getLimiter(id) {
  return LIMITERS.find(l => l.id === id) || null;
}

export function recommendFramework(questionType) {
  return RECOMMENDED_BY_QUESTION_TYPE[questionType] || null;
}

/**
 * Apply the language rule: 不限语种 and a specific language cannot both be on.
 * Returns a new array rather than mutating, so the caller can diff it.
 *
 * `justToggled` matters. Without it the rule is ambiguous — if the selection
 * already holds both, which one wins? With it the answer is always "the one the
 * user just touched", which is what makes the control feel predictable.
 */
export function applyExclusivity(limiterId, selected, justToggled) {
  const limiter = getLimiter(limiterId);
  if (!limiter || !limiter.exclusive) return selected.slice();
  const ex = limiter.exclusive;
  if (!selected.includes(justToggled)) return selected.slice();
  return justToggled === ex ? [ex] : selected.filter(id => id !== ex);
}

/**
 * Year validation. Returns null when acceptable, otherwise an error key the UI
 * resolves through its own i18n — this module emits no user-facing prose.
 *
 * Both ends empty means 不限, which is valid; one end alone is valid too
 * (表 3: 可只填其一).
 */
export function validateYearRange(from, to) {
  const clean = v => (v === null || v === undefined ? "" : String(v).trim());
  const f = clean(from), t = clean(to);
  if (!f && !t) return null;
  const four = /^\d{4}$/;
  if (f && !four.test(f)) return "year_from_format";
  if (t && !four.test(t)) return "year_to_format";
  if (f && t && Number(f) > Number(t)) return "year_order";
  return null;
}
