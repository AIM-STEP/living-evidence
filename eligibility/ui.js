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
  normalizeState, emptyState, buildResult, toPlainText, toMarkdown, toCSV, safeFilename
} from "./generate.js";
import { load, save, clear, demoState } from "./storage.js";

const A = () => window.AIMSTEP || { t: k => k, lang: () => "zh" };
const lang = () => (A().lang() === "en" ? "en" : "zh");
const t = k => A().t(k);
const pick = d => (d ? d[lang()] || d.en || d.zh || "" : "");

const $ = id => document.getElementById(id);

/* --------------------------------------------------------- project context */

/**
 * Upstream project metadata.
 *
 * The interface is deliberately small and replaceable: whoever calls
 * setProjectMeta decides where it came from. Today that is the Firestore
 * project named by ?project=<id>; with no id, or signed out, the module runs
 * on a local draft instead. Nothing here waits on it — the builder is fully
 * usable before, and without, any of it arriving.
 */
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

/**
 * Write now, cancelling the pending debounce.
 *
 * Without this, closing the tab within 200 ms of the last keystroke loses it:
 * the timer never fires. Both events below are needed — `pagehide` covers
 * navigation and closing, `visibilitychange` covers a phone being locked or the
 * app being switched away from, which on mobile may never fire `pagehide`.
 */
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
  // Only steer a project that has not been worked on yet. Overriding a saved
  // choice because the upstream type says otherwise would undo a decision the
  // user already made.
  if (!saved && recommended) state.frameworkId = recommended;
  renderAll();
}

/**
 * The data this module hands to the next one (检索策略构建). A stable shape, so
 * the search-strategy builder reads fields rather than re-parsing display text.
 */
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
      other: s.limiters.other.slice()
    },
    question: result.question.text,
    inclusion: result.inclusion.map(r => r.text),
    exclusion: result.exclusion.map(r => r.text)
  };
}

/* ------------------------------------------------------------------ pills */

/**
 * A pill button.
 *
 * `aria-pressed` carries the state for assistive technology, and the selected
 * look adds weight and an inner ring on top of the fill, so the difference does
 * not rest on colour alone.
 */
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
    // A hint, never a value: nothing reads placeholder text back out.
    input.placeholder = pick(el.hint);
    input.autocomplete = "off";
    input.addEventListener("input", () => {
      cell.value = input.value;
      persist();
      renderResult();
    });
    field.appendChild(input);

    // Exclusion, collapsed until asked for.
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
      // Collapsing hides the box; it never clears it. The prompt is explicit:
      // 用户删除或收起排除条件时不得误删已经输入的内容.
      persist();
      if (cell.excludeOpen) exInput.focus();
    });

    field.appendChild(toggle);
    field.appendChild(exWrap);
    box.appendChild(field);
  }
}

/* --------------------------------------------------------- step 3 limiters */

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
    box.appendChild(group);
  }
}

/**
 * The free-text limit.
 *
 * Its own element, created once per render of the limiter block and never
 * rebuilt while it has focus: typing calls renderResult(), not renderLimiters(),
 * so the caret and an in-flight IME composition survive. Rebuilding the group
 * on every keystroke would make Chinese input impossible to use.
 */
function renderCustom(lim, labelId) {
  const wrap = document.createElement("div");
  wrap.className = "ec-custom";

  const input = document.createElement("input");
  input.type = "text";
  input.id = "ec-custom";
  input.className = "ec-custom-input";
  input.value = state.limiters.custom || "";
  input.placeholder = pick(lim.hint);      // a hint; never read back as a value
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
    input.maxLength = 4;
    input.className = "ec-year-input";
    input.id = `ec-year-${which}`;
    input.value = state.limiters.year[which];
    input.placeholder = which === "from" ? "2015" : "2025";
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

  // The message is tied to both inputs, so a screen reader hears it on either.
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

  // The research question is no longer shown: the white preview box was
  // removed on request. It is still generated, because the copied text, the
  // .md, the .csv and the structured handover to the next module all carry it
  // — hiding a panel must not change what the data contains. The guard keeps
  // this working whether or not a page chooses to display it.
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
    // Clipboard API needs a secure context and a permission the browser may
    // refuse. The textarea fallback works where it does not.
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

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoked on the next tick: revoking immediately can beat the download in
  // some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function wireActions() {
  $("ec-copy").addEventListener("click", async () => {
    const ok = await copyText(toPlainText(buildResult(state, lang())));
    toast(t(ok ? "ec_copied" : "ec_copy_failed"));
  });

  $("ec-dl-md").addEventListener("click", () => {
    const r = buildResult(state, lang());
    download(safeFilename(projectMeta.name, "md"),
             toMarkdown(r, { projectName: projectMeta.name }),
             "text/markdown;charset=utf-8");
  });

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

  // Labels and generated text both follow the site language toggle.
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
