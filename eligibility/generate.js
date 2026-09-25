/**
 * Eligibility Criteria Builder — deterministic generation and export.
 *
 * Pure functions over a plain state object. No DOM, no network, no model:
 * the same input always gives the same output, which is what makes the result
 * reviewable by a second person.
 *
 * ONE generator, not two. What the right-hand panel shows and what the .md and
 * .csv contain all come from buildResult(); the exporters only format what it
 * returns. The prompt asks for this directly ("显示内容和导出内容共用同一个结构化
 * 生成函数"), and the reason is that a separate export path is exactly where a
 * preview and a downloaded file quietly stop agreeing.
 *
 * Placeholder hints never reach output. A hint lives in FRAMEWORKS[].hint and
 * is read only by the UI as an input placeholder; nothing here can see it.
 */

import { FRAMEWORKS, LIMITERS, LEGACY_OPTIONS, getFramework, getLimiter, migrateYearValue } from "./frameworks.js";
import { QUESTION_TEMPLATES, slotsOf } from "./templates.js";

/* ------------------------------------------------------------------ state */

/**
 * Element values are stored per framework, not in one shared bag. Switching
 * from PICO to PECO and back has to return what was typed
 * ("用户切换框架后再切回时，先前填写的内容不得丢失"), and PICO's C and PECO's C
 * are not the same field even though they share a letter.
 */
export function emptyState(frameworkId = "PICO") {
  return {
    frameworkId,
    byFramework: {},
    limiters: {
      design: [], year: { from: "", to: "" }, language: [], pubtype: [], other: [], custom: "",
      // Per-group custom input text fields
      designCustom: "", languageCustom: "", pubtypeCustom: "", otherCustom: ""
    }
  };
}

/** Repairs anything missing, so a state saved by an older version still loads. */
export function normalizeState(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== "object") return base;
  const fid = getFramework(raw.frameworkId) ? raw.frameworkId : base.frameworkId;
  const byFramework = {};
  for (const fw of FRAMEWORKS) {
    const src = (raw.byFramework && raw.byFramework[fw.id]) || {};
    const out = {};
    for (const el of fw.elements) {
      const cell = src[el.key] || {};
      out[el.key] = {
        value: typeof cell.value === "string" ? cell.value : "",
        exclude: typeof cell.exclude === "string" ? cell.exclude : "",
        excludeOpen: cell.excludeOpen === true || (typeof cell.exclude === "string" && cell.exclude !== "")
      };
    }
    byFramework[fw.id] = out;
  }
  const rawLim = raw.limiters || {};
  const pick = (id) => {
    const lim = getLimiter(id);
    const allowed = new Set((lim && lim.options ? lim.options : []).map(o => o.id));
    const gone = new Set(LEGACY_OPTIONS[id] || []);
    const got = Array.isArray(rawLim[id]) ? rawLim[id] : [];
    return got.filter(v => allowed.has(v) && !gone.has(v));
  };
  const year = rawLim.year && typeof rawLim.year === "object" ? rawLim.year : {};
  return {
    frameworkId: fid,
    byFramework,
    limiters: {
      design: pick("design"),
      year: {
        from: migrateYearValue(year.from),
        to: migrateYearValue(year.to)
      },
      language: pick("language"),
      pubtype: pick("pubtype"),
      other: pick("other"),
      custom: typeof rawLim.custom === "string" ? rawLim.custom.trim() : "",
      // Per-group custom inputs
      designCustom: typeof rawLim.designCustom === "string" ? rawLim.designCustom.trim() : "",
      languageCustom: typeof rawLim.languageCustom === "string" ? rawLim.languageCustom.trim() : "",
      pubtypeCustom: typeof rawLim.pubtypeCustom === "string" ? rawLim.pubtypeCustom.trim() : "",
      otherCustom: typeof rawLim.otherCustom === "string" ? rawLim.otherCustom.trim() : ""
    }
  };
}

/** The element cells for the framework currently selected. */
export function currentCells(state) {
  const s = normalizeState(state);
  return s.byFramework[s.frameworkId];
}

/* -------------------------------------------------------------- formatting */

function t(dict, lang) {
  if (!dict) return "";
  return dict[lang] || dict.en || dict.zh || "";
}

/**
 * Year-month text for display and export. Accepts YYYY-MM values.
 */
function yearText(year, lang) {
  const from = (year.from || "").trim(), to = (year.to || "").trim();
  if (!from && !to) return "";
  if (from && to) return lang === "zh" ? `${from} 至 ${to}` : `${from} to ${to}`;
  if (from) return lang === "zh" ? `${from} 及以后` : `${from} onwards`;
  return lang === "zh" ? `${to} 及以前` : `up to ${to}`;
}

const JOIN = { zh: "、", en: ", " };

/**
 * The custom input key for a limiter group id.
 * design → designCustom, language → languageCustom, etc.
 */
function customKey(limiterId) {
  return limiterId + "Custom";
}

const CJK_CHAR = /[㐀-䶿一-鿿぀-ヿ]/;
const LATIN_TAIL = /[A-Za-z0-9)\]]$/;
const LATIN_HEAD = /^[A-Za-z0-9(]/;

function needsSpace(left, right) {
  if (!left || !right) return false;
  const l = left[left.length - 1], r = right[0];
  if (l === " " || r === " ") return false;
  if (LATIN_TAIL.test(l) && CJK_CHAR.test(r)) return true;
  if (CJK_CHAR.test(l) && LATIN_HEAD.test(r)) return true;
  return false;
}

function spaceSegments(segments) {
  const out = [];
  let prevType = null;
  for (const seg of segments) {
    const prev = out.length ? out[out.length - 1].text : "";
    const bracketed = seg.type === "slot" || prevType === "slot";
    if (!bracketed && needsSpace(prev, seg.text)) out.push({ type: "text", text: " " });
    out.push(seg);
    prevType = seg.type;
  }
  return out;
}

/* -------------------------------------------------------------- generation */

export function buildQuestion(state, lang = "zh") {
  const s = normalizeState(state);
  const fw = getFramework(s.frameworkId);
  const cells = s.byFramework[s.frameworkId];
  const tpl = (QUESTION_TEMPLATES[s.frameworkId] || {})[lang]
    || (QUESTION_TEMPLATES[s.frameworkId] || {}).en || "";

  const segments = [];
  let last = 0;
  for (const m of tpl.matchAll(/\{([A-Za-z]+)\}/g)) {
    if (m.index > last) segments.push({ type: "text", text: tpl.slice(last, m.index) });
    const key = m[1];
    const el = fw.elements.find(e => e.key === key);
    const value = (cells[key] && cells[key].value || "").trim();
    if (value) {
      segments.push({ type: "filled", key, text: value });
    } else {
      segments.push({ type: "slot", key, text: `[${t(el && el.label, lang)}]` });
    }
    last = m.index + m[0].length;
  }
  if (last < tpl.length) segments.push({ type: "text", text: tpl.slice(last) });

  const spaced = lang === "zh" ? spaceSegments(segments) : segments;
  return {
    segments: spaced,
    text: spaced.map(x => x.text).join(""),
    complete: spaced.every(x => x.type !== "slot")
  };
}

/**
 * Inclusion criteria: the filled elements in framework order, then the
 * limiters that were actually selected or filled.
 */
export function buildInclusion(state, lang = "zh") {
  const s = normalizeState(state);
  const fw = getFramework(s.frameworkId);
  const cells = s.byFramework[s.frameworkId];
  const sep = JOIN[lang] || JOIN.en;
  const colon = lang === "zh" ? "：" : ": ";
  const rows = [];

  for (const el of fw.elements) {
    const value = (cells[el.key] && cells[el.key].value || "").trim();
    if (value) {
      rows.push({ source: "element", key: el.key, label: t(el.label, lang),
                  value, text: `${t(el.label, lang)}${colon}${value}` });
    }
  }

  for (const lim of LIMITERS) {
    if (lim.type === "range") {
      const text = yearText(s.limiters.year, lang);
      if (text) {
        rows.push({ source: "limiter", key: lim.id, label: t(lim.label, lang),
                    value: text, text: `${t(lim.label, lang)}${colon}${text}` });
      }
      continue;
    }
    if (lim.type === "text") {
      const text = (s.limiters[lim.id] || "").trim();
      if (text) {
        rows.push({ source: "limiter", key: lim.id, label: t(lim.label, lang),
                    value: text, text: `${t(lim.label, lang)}${colon}${text}` });
      }
      continue;
    }
    // multi type
    const chosen = s.limiters[lim.id] || [];
    const ck = customKey(lim.id);
    const customVal = (s.limiters[ck] || "").trim();
    const names = chosen
      .map(id => lim.options.find(o => o.id === id))
      .filter(Boolean)
      .map(o => t(o.label, lang));
    if (customVal) names.push(customVal);
    if (!names.length) continue;
    rows.push({ source: "limiter", key: lim.id, label: t(lim.label, lang),
                value: names.join(sep), text: `${t(lim.label, lang)}${colon}${names.join(sep)}` });
  }
  return rows;
}

export function buildExclusion(state, lang = "zh") {
  const s = normalizeState(state);
  const fw = getFramework(s.frameworkId);
  const cells = s.byFramework[s.frameworkId];
  const colon = lang === "zh" ? "：" : ": ";
  const rows = [];
  for (const el of fw.elements) {
    const text = (cells[el.key] && cells[el.key].exclude || "").trim();
    if (text) {
      rows.push({ key: el.key, label: t(el.label, lang), value: text,
                  text: `${t(el.label, lang)}${colon}${text}` });
    }
  }
  return rows;
}

/** Everything the panel and all exporters read. */
export function buildResult(state, lang = "zh") {
  const s = normalizeState(state);
  const fw = getFramework(s.frameworkId);
  return {
    frameworkId: fw.id,
    frameworkLabel: t(fw.label, lang),
    question: buildQuestion(s, lang),
    inclusion: buildInclusion(s, lang),
    exclusion: buildExclusion(s, lang),
    lang
  };
}

/* ----------------------------------------------------------------- exports */

const STR = {
  zh: { question: "研究问题", inclusion: "纳入标准", exclusion: "排除标准",
        none: "（未填写排除标准）", framework: "框架", project: "项目",
        element: "要素", incl: "纳入", excl: "排除" },
  en: { question: "Research question", inclusion: "Inclusion criteria",
        exclusion: "Exclusion criteria", none: "(no exclusion criteria entered)",
        framework: "Framework", project: "Project",
        element: "Element", incl: "Inclusion", excl: "Exclusion" }
};

/** Plain text for the clipboard. */
export function toPlainText(result) {
  const S = STR[result.lang] || STR.en;
  const out = [`${S.question}`, result.question.text, "", `${S.inclusion}`];
  result.inclusion.forEach((r, i) => out.push(`${i + 1}. ${r.text}`));
  out.push("", `${S.exclusion}`);
  if (result.exclusion.length) result.exclusion.forEach((r, i) => out.push(`${i + 1}. ${r.text}`));
  else out.push(S.none);
  return out.join("\n");
}

export function toMarkdown(result, meta = {}) {
  const S = STR[result.lang] || STR.en;
  const name = (meta.projectName || "").trim();
  const out = [];
  out.push(`# ${name || S.project}`);
  out.push("");
  out.push(`- ${S.framework}: ${result.frameworkLabel}`);
  out.push("");
  out.push(`## ${S.question}`);
  out.push("");
  out.push(result.question.text);
  out.push("");
  out.push(`## ${S.inclusion}`);
  out.push("");
  result.inclusion.forEach((r, i) => out.push(`${i + 1}. ${r.text}`));
  if (!result.inclusion.length) out.push(S.none);
  out.push("");
  out.push(`## ${S.exclusion}`);
  out.push("");
  if (result.exclusion.length) result.exclusion.forEach((r, i) => out.push(`${i + 1}. ${r.text}`));
  else out.push(S.none);
  out.push("");
  return out.join("\n");
}

/** RFC 4180 quoting: double the quotes, wrap anything with , " CR or LF. */
function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV with a UTF-8 BOM. Excel reads a BOM-less UTF-8 file as the system code
 * page and turns every Chinese label into mojibake, so the BOM is what the
 * requirement "确保中文在常用表格软件中正常显示" actually comes down to.
 */
export function toCSV(result) {
  const S = STR[result.lang] || STR.en;
  const rows = [[S.element, S.incl, S.excl]];
  const exclusionFor = key => {
    const hit = result.exclusion.find(e => e.key === key);
    return hit ? hit.value : "";
  };
  for (const r of result.inclusion) {
    rows.push([r.label, r.value, r.source === "element" ? exclusionFor(r.key) : ""]);
  }
  for (const e of result.exclusion) {
    if (!result.inclusion.some(r => r.source === "element" && r.key === e.key)) {
      rows.push([e.label, "", e.value]);
    }
  }
  return "\uFEFF" + rows.map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/**
 * Build DOCX data as a structured object for the UI to pass to the docx library.
 * Returns { title, framework, sections[] } where each section has a heading and items.
 */
export function toDocxData(result, meta = {}) {
  const S = STR[result.lang] || STR.en;
  const name = (meta.projectName || "").trim() || S.project;

  return {
    title: name,
    framework: { label: S.framework, value: result.frameworkLabel },
    question: { heading: S.question, text: result.question.text },
    inclusion: {
      heading: S.inclusion,
      items: result.inclusion.map(r => r.text)
    },
    exclusion: {
      heading: S.exclusion,
      items: result.exclusion.length ? result.exclusion.map(r => r.text) : [S.none]
    }
  };
}

/**
 * A filename built from the project name. Strips what Windows, macOS and Linux
 * disagree about, plus control characters, and refuses to produce a name that
 * is empty, all dots, or a reserved Windows device name.
 */
export function safeFilename(projectName, extension) {
  let base = String(projectName === null || projectName === undefined ? "" : projectName)
    .replace(/[\\/:*?"<>|]/g, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "");
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)) base = "";
  if (!base) base = "eligibility-criteria";
  if (base.length > 80) base = base.slice(0, 80).trim();
  return `${base}.${extension}`;
}

/** Every slot key used by the templates, for the tests. */
export { slotsOf };
