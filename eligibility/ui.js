/**
 * Eligibility Criteria Builder — the DOM layer.
 *
 * Everything that decides anything lives in frameworks.js, templates.js,
 * generate.js and storage.js, all of which are pure and tested. This file only
 * renders them and wires events, so the module holds no medical judgement a
 * reader would have to dig through markup to find.
 *
 * No network. No model. The page works with the machine offline, which is both
 * the prompt's requirement and the reason it can ship on GitHub Pages with no
 * key to leak.
 *
 * RE-RENDER DISCIPLINE. Typing never re-renders the inputs — it updates state
 * and repaints only the results panel. Rebuilding a field while someone is in
 * it throws away the caret and the IME composition buffer, which is unusable
 * for Chinese input in particular.
 */

import {
  FRAMEWORKS, LIMITERS, getFramework, recommendFramework,
  applyExclusivity, validateYearRange
} from "./frameworks.js";
import {
  normalizeState, emptyState, buildResult, toPlainText, toMarkdown, toCSV,
  toDocxData, safeFilename
} from "./generate.js";
import { load, save, clear, demoState } from "./storage.js";

const A = () => window.AIMSTEP || { t: k => k, lang: () => "zh" };
const lang = () => (A().lang() === "en" ? "en" : "zh");
const t = k => A().t(k);
const pick = d => (d ? d[lang()] || d.en || d.zh || "" : "");

const $ = id => document.getElementById(id);

/* --------------------------------------------------------- project context */

let projectMeta = { id: "", name: "", projectType: "", questionType: "", areaOfResearch: "" };
let state = normalizeState(emptyState());
let saveTimer = null;
let recommended = null;

function store() {
  try { return window.localStorage; } catch (e) { return null; }
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(projectMeta.id, state, store()), 200);
}

function flush() {
  clearTimeout(saveTimer);
  save(projectMeta.id, state, store());
}

export function setProjectMeta(meta) {
  projectMeta = {
    id: meta && meta.id ? String(meta.id) : "",
    name: meta && meta.name ? String(meta.name) : "",
    projectType: (meta && meta.projectType) || "",
    questionType: (meta && meta.questionType) || "",
    areaOfResearch: (meta && meta.areaOfResearch) || ""
  };
  const saved = load(projectMeta.id, store());
  state = normalizeState(saved || emptyState());
  recommended = recommendFramework(projectMeta.questionType);
  if (!saved && recommended) state.frameworkId = recommended;
  renderAll();
}

export function exportForNextModule() {
  const s = normalizeState(state);
  const fw = getFramework(s.frameworkId);
  const result = buildResult(s, lang());
  return {
    version: 1,
    project: { ...projectMeta },
    framework: s.frameworkId,
    elements: fw.elements.map(el => ({
      key: el.key,
      label: pick(el.label),
      value: (s.byFramework[s.frameworkId][el.key].value || "").trim(),
      exclude: (s.byFramework[s.frameworkId][el.key].exclude || "").trim()
    })),
    limits: {
      design: s.limiters.design.slice(),
      year: { ...s.limiters.year },
      language: s.limiters.language.slice(),
      pubtype: s.limiters.pubtype.slice(),
      other: s.limiters.other.slice(),
      designCustom: s.limiters.designCustom,
      languageCustom: s.limiters.languageCustom,
      pubtypeCustom: s.limiters.pubtypeCustom,
      otherCustom: s.limiters.otherCustom
    },
    question: result.question.text,
    inclusion: result.inclusion.map(r => r.text),
    exclusion: result.exclusion.map(r => r.text)
  };
}

/* ------------------------------------------------------------------ pills */

function pillButton(label, selected, onClick, extra) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "ec-pill" + (selected ? " is-on" : "");
  b.setAttribute("aria-pressed", selected ? "true" : "false");
  b.textContent = label;
  if (extra) b.appendChild(extra);
  b.addEventListener("click", onClick);
  return b;
}

/* -------------------------------------------------------- step 1 framework */

function renderFrameworks() {
  const box = $("ec-frameworks");
  box.textContent = "";
  for (const fw of FRAMEWORKS) {
    const isRec = recommended === fw.id;
    let tag = null;
    if (isRec) {
      tag = document.createElement("span");
      tag.className = "ec-rec";
      tag.textContent = t("ec_recommended");
    }
    const b = pillButton(pick(fw.label), state.frameworkId === fw.id, () => {
      if (state.frameworkId === fw.id) return;
      state.frameworkId = fw.id;
      persist();
      renderAll();
    }, tag);
    b.title = pick(fw.note);
    box.appendChild(b);
  }
}

/* --------------------------------------------------------- step 2 elements */

function renderElements() {
  const box = $("ec-elements");
  box.textContent = "";
  const fw = getFramework(state.frameworkId);
  const cells = state.byFramework[state.frameworkId];

  for (const el of fw.elements) {
    const cell = cells[el.key];
    const field = document.createElement("div");
    field.className = "field ec-field";

    const label = document.createElement("label");
    label.setAttribute("for", `ec-in-${el.key}`);
    const key = document.createElement("b");
    key.className = "ec-key";
    key.textContent = el.key;
    label.appendChild(key);
    label.appendChild(document.createTextNode(" " + pick(el.label)));
    field.appendChild(label);

    const input = fw.freeform ? document.createElement("textarea") : document.createElement("input");
    if (!fw.freeform) input.type = "text";
    else input.rows = 3;
    input.id = `ec-in-${el.key}`;
    input.value = cell.value;
    input.placeholder = pick(el.hint);
    input.autocomplete = "off";
    input.addEventListener("input", () => {
      cell.value = input.value;
      persist();
      renderResult();
    });
    field.appendChild(input);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "ec-exclude-toggle";
    toggle.setAttribute("aria-expanded", cell.excludeOpen ? "true" : "false");
    toggle.setAttribute("aria-controls", `ec-ex-${el.key}`);
    toggle.textContent = (cell.excludeOpen ? "－ " : "＋ ") + t("ec_add_exclusion");

    const exWrap = document.createElement("div");
    exWrap.className = "ec-exclude";
    exWrap.id = `ec-ex-${el.key}`;
    exWrap.hidden = !cell.excludeOpen;

    const exInput = document.createElement("input");
    exInput.type = "text";
    exInput.value = cell.exclude;
    exInput.placeholder = t("ec_exclusion_ph");
    exInput.setAttribute("aria-label", `${pick(el.label)} — ${t("ec_add_exclusion")}`);
    exInput.addEventListener("input", () => {
      cell.exclude = exInput.value;
      persist();
      renderResult();
    });
    exWrap.appendChild(exInput);

    toggle.addEventListener("click", () => {
      cell.excludeOpen = !cell.excludeOpen;
      exWrap.hidden = !cell.excludeOpen;
      toggle.setAttribute("aria-expanded", cell.excludeOpen ? "true" : "false");
      toggle.textContent = (cell.excludeOpen ? "－ " : "＋ ") + t("ec_add_exclusion");
      persist();
      if (cell.excludeOpen) exInput.focus();
    });

    field.appendChild(toggle);
    field.appendChild(exWrap);
    box.appendChild(field);
  }
}

/* --------------------------------------------------------- step 3 limiters */

/**
 * The custom input key for a limiter group.
 * design → designCustom, language → languageCustom, etc.
 */
function customKey(limiterId) {
  return limiterId + "Custom";
}

function renderLimiters() {
  const box = $("ec-limiters");
  box.textContent = "";

  for (const lim of LIMITERS) {
    const group = document.createElement("div");
    group.className = "ec-limit-group";

    const h = document.createElement("h3");
    h.className = "ec-limit-label";
    h.id = `ec-lim-${lim.id}`;
    h.textContent = pick(lim.label);
    group.appendChild(h);

    if (lim.type === "range") {
      group.appendChild(renderYear(lim));
      box.appendChild(group);
      continue;
    }

    if (lim.type === "text") {
      group.appendChild(renderCustom(lim, h.id));
      box.appendChild(group);
      continue;
    }

    // multi type: pills + optional custom input
    const row = document.createElement("div");
    row.className = "ec-pills";
    row.setAttribute("role", "group");
    row.setAttribute("aria-labelledby", h.id);
    for (const opt of lim.options) {
      const on = state.limiters[lim.id].includes(opt.id);
      row.appendChild(pillButton(pick(opt.pill || opt.label), on, () => {
        const cur = state.limiters[lim.id];
        const next = on ? cur.filter(x => x !== opt.id) : cur.concat([opt.id]);
        state.limiters[lim.id] = applyExclusivity(lim.id, next, opt.id);
        persist();
        renderLimiters();
        renderResult();
      }));
    }
    group.appendChild(row);

    // Per-group custom input field
    if (lim.customInput) {
      const ck = customKey(lim.id);
      const wrap = document.createElement("div");
      wrap.className = "ec-group-custom";

      const input = document.createElement("input");
      input.type = "text";
      input.id = `ec-gc-${lim.id}`;
      input.className = "ec-group-custom-input";
      input.value = state.limiters[ck] || "";
      input.placeholder = pick(lim.customHint);
      input.autocomplete = "off";
      input.setAttribute("aria-label", pick(lim.customHint));
      input.addEventListener("input", function () {
        state.limiters[ck] = input.value;
        persist();
        renderResult();
      });
      wrap.appendChild(input);
      group.appendChild(wrap);
    }

    box.appendChild(group);
  }
}

/**
 * The free-text limit (the standalone "Custom limit" group).
 */
function renderCustom(lim, labelId) {
  const wrap = document.createElement("div");
  wrap.className = "ec-custom";

  const input = document.createElement("input");
  input.type = "text";
  input.id = "ec-custom";
  input.className = "ec-custom-input";
  input.value = state.limiters.custom || "";
  input.placeholder = pick(lim.hint);
  input.autocomplete = "off";
  input.setAttribute("aria-labelledby", labelId);
  input.addEventListener("input", function () {
    state.limiters.custom = input.value;
    persist();
    renderResult();
  });
  wrap.appendChild(input);
  return wrap;
}

function renderYear(lim) {
  const wrap = document.createElement("div");
  wrap.className = "ec-year";

  const mk = (which, labelKey) => {
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.maxLength = 7;
    input.className = "ec-year-input";
    input.id = `ec-year-${which}`;
    input.value = state.limiters.year[which];
    input.placeholder = which === "from" ? "2024-01" : "2025-12";
    input.setAttribute("aria-label", `${pick(lim.label)} — ${t(labelKey)}`);
    input.addEventListener("input", () => {
      state.limiters.year[which] = input.value.trim();
      persist();
      showYearError();
      renderResult();
    });
    return input;
  };

  const from = mk("from", "ec_year_from");
  const to = mk("to", "ec_year_to");
  const dash = document.createElement("span");
  dash.className = "ec-year-dash";
  dash.textContent = "–";

  wrap.appendChild(from);
  wrap.appendChild(dash);
  wrap.appendChild(to);

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = pick(lim.hint);
  wrap.appendChild(hint);

  const err = document.createElement("p");
  err.className = "error";
  err.id = "ec-year-error";
  err.hidden = true;
  wrap.appendChild(err);

  from.setAttribute("aria-describedby", "ec-year-error");
  to.setAttribute("aria-describedby", "ec-year-error");
  return wrap;
}

function showYearError() {
  const err = $("ec-year-error");
  if (!err) return;
  const key = validateYearRange(state.limiters.year.from, state.limiters.year.to);
  err.hidden = !key;
  err.textContent = key ? t("ec_" + key) : "";
  const from = $("ec-year-from"), to = $("ec-year-to");
  if (from) from.classList.toggle("is-invalid", key === "year_from_format" || key === "year_order");
  if (to) to.classList.toggle("is-invalid", key === "year_to_format" || key === "year_order");
}

/* ----------------------------------------------------------- step 4 result */

function renderResult() {
  const result = buildResult(state, lang());

  const q = $("ec-question");
  if (q) {
    q.textContent = "";
    for (const seg of result.question.segments) {
      if (seg.type === "text") {
        q.appendChild(document.createTextNode(seg.text));
      } else {
        const span = document.createElement("span");
        span.className = seg.type === "slot" ? "ec-slot" : "ec-filled";
        span.textContent = seg.text;
        q.appendChild(span);
      }
    }
  }

  const fill = (listId, emptyId, rows) => {
    const ol = $(listId);
    ol.textContent = "";
    for (const r of rows) {
      const li = document.createElement("li");
      li.textContent = r.text;
      ol.appendChild(li);
    }
    ol.hidden = rows.length === 0;
    $(emptyId).hidden = rows.length !== 0;
  };
  fill("ec-inclusion", "ec-inclusion-empty", result.inclusion);
  fill("ec-exclusion", "ec-exclusion-empty", result.exclusion);
}

function renderAll() {
  renderFrameworks();
  renderElements();
  renderLimiters();
  showYearError();
  renderResult();
  const name = $("ec-project-name");
  if (name) {
    name.textContent = projectMeta.name || t("ec_no_project");
    name.classList.toggle("ec-muted", !projectMeta.name);
  }
}

/* ---------------------------------------------------------------- actions */

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.remove("show"), 2200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (err) {
      return false;
    }
  }
}

function download(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** docx library lazy-loaded from CDN. Cached after first load. */
let _docxPromise = null;
function loadDocx() {
  if (_docxPromise) return _docxPromise;
  _docxPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/docx@9.1.1/build/index.umd.min.js";
    script.onload = () => {
      if (window.docx) resolve(window.docx);
      else reject(new Error("docx not found after script load"));
    };
    script.onerror = () => {
      _docxPromise = null;
      reject(new Error("Failed to load docx library"));
    };
    document.head.appendChild(script);
  });
  return _docxPromise;
}

async function downloadDocx() {
  const r = buildResult(state, lang());
  const data = toDocxData(r, { projectName: projectMeta.name });

  try {
    const { Document, Paragraph, TextRun, Packer, HeadingLevel } = await loadDocx();

    const children = [
      new Paragraph({ text: data.title, heading: HeadingLevel.TITLE }),
      new Paragraph({ children: [
        new TextRun({ text: data.framework.label + ": ", bold: true }),
        new TextRun({ text: data.framework.value })
      ]}),
      new Paragraph({}),
      new Paragraph({ text: data.question.heading, heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: data.question.text }),
      new Paragraph({}),
      new Paragraph({ text: data.inclusion.heading, heading: HeadingLevel.HEADING_1 }),
      ...data.inclusion.items.map((text, i) =>
        new Paragraph({ text: `${i + 1}. ${text}` })
      ),
      new Paragraph({}),
      new Paragraph({ text: data.exclusion.heading, heading: HeadingLevel.HEADING_1 }),
      ...data.exclusion.items.map((text, i) =>
        new Paragraph({ text: `${i + 1}. ${text}` })
      )
    ];

    const doc = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(doc);
    download(safeFilename(projectMeta.name, "docx"), blob);
    toast(t("ec_docx_ok"));
  } catch (e) {
    console.error("DOCX generation failed:", e);
    toast(t("ec_docx_fail"));
  }
}

function wireActions() {
  $("ec-copy").addEventListener("click", async () => {
    const ok = await copyText(toPlainText(buildResult(state, lang())));
    toast(t(ok ? "ec_copied" : "ec_copy_failed"));
  });

  $("ec-dl-docx").addEventListener("click", downloadDocx);

  $("ec-dl-csv").addEventListener("click", () => {
    const r = buildResult(state, lang());
    download(safeFilename(projectMeta.name, "csv"), toCSV(r), "text/csv;charset=utf-8");
  });

  $("ec-demo").addEventListener("click", () => {
    if (!window.confirm(t("ec_demo_confirm"))) return;
    state = normalizeState(demoState(FRAMEWORKS, "PICO"));
    persist();
    renderAll();
    toast(t("ec_demo_filled"));
  });

  $("ec-clear").addEventListener("click", () => {
    if (!window.confirm(t("ec_clear_confirm"))) return;
    state = normalizeState(emptyState(recommended || "PICO"));
    clear(projectMeta.id, store());
    persist();
    renderAll();
    toast(t("ec_cleared"));
  });

  document.addEventListener("aimstep:lang", renderAll);

  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush();
  });
}

/* ------------------------------------------------------------------- boot */

export function init() {
  wireActions();
  setProjectMeta({ id: "", name: "", questionType: "" });
}
