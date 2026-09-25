/**
 * The project workspace on the Overview page: list what you can open, and
 * create a new one.
 *
 * The backend is injected (see backend.js), so this file never imports the
 * Firebase SDK and the whole create path can be driven in a test against an
 * in-memory double. Email-link sign-in cannot be automated, so without that
 * seam the most important flow on the site would never be exercised.
 *
 * THE BUG THIS REPLACES. The previous version, on the Workflow page, did:
 *
 *     show("done");   // reveal the "project created" panel
 *     load();         // …which calls show("list") and hides it again
 *
 * in the same tick, so the confirmation never appeared: a project was created
 * correctly and the user was told nothing. The fix is structural rather than a
 * reordering — success feedback is no longer one of the mutually exclusive
 * views. The banner is its own region, so refreshing the list cannot clobber
 * it, and no future reordering can reintroduce the fault.
 */

import { explainError } from "./backend.js";

const A = () => window.AIMSTEP || { t: k => k, lang: () => "zh" };
const t = k => A().t(k);
const $ = id => document.getElementById(id);

/**
 * Remembers that someone asked to create a project before signing in.
 *
 * localStorage, not sessionStorage: the sign-in link arrives by email and is
 * often opened in a different tab, where sessionStorage would be empty. The
 * timestamp keeps a forgotten intent from reopening the form days later.
 */
const INTENT_KEY = "aimstep-intent-create";
const INTENT_TTL = 30 * 60 * 1000;

function rememberIntent() {
  try { localStorage.setItem(INTENT_KEY, String(Date.now())); } catch (e) {}
}
function takeIntent() {
  try {
    const raw = localStorage.getItem(INTENT_KEY);
    localStorage.removeItem(INTENT_KEY);
    return !!raw && Date.now() - Number(raw) < INTENT_TTL;
  } catch (e) { return false; }
}

export function initProjects(options) {
  const opts = options || {};
  const auth = opts.auth || (window.AIMSTEP && window.AIMSTEP.auth);
  const makeBackend = opts.backend;          // (api) => backend
  if (!auth || !makeBackend) return null;

  const els = {
    start: $("pw-start"),
    form: $("pw-form"),
    list: $("pw-list"),
    status: $("pw-status"),
    banner: $("pw-banner"),
    submit: null,
    cancel: $("pw-cancel")
  };
  if (!els.start || !els.form || !els.list) return null;
  els.submit = els.form.querySelector('button[type="submit"]');

  const fields = {
    name: { input: $("pf-name"), field: els.form.querySelector('[data-key="name"]'), required: true },
    type: { input: $("pf-type"), field: els.form.querySelector('[data-key="type"]'), required: true },
    dataset: { input: $("pf-dataset"), field: els.form.querySelector('[data-key="dataset"]'), required: true },
    question: { input: $("pf-question"), field: els.form.querySelector('[data-key="question"]'), required: true },
    area: { input: $("pf-area"), field: els.form.querySelector('[data-key="area"]'), required: false }
  };

  let backend = null;
  let backendPending = null;
  let projects = null;          // null = loading, [] = none, [...] = rows
  let loadError = null;
  let view = "list";
  let saving = false;
  let loadToken = 0;

  /* ------------------------------------------------------------- rendering */

  function setStatus(key, extra) {
    if (!els.status) return;
    els.status.hidden = !key;
    els.status.dataset.key = key || "";
    els.status.dataset.extra = extra || "";
    els.status.textContent = key ? t(key) + (extra || "") : "";
  }

  /**
   * The success banner. Deliberately outside the list/form switch: it is what
   * tells the user the project exists, and nothing that repaints the list may
   * be able to remove it.
   */
  function showBanner(project) {
    if (!els.banner) return;
    els.banner.textContent = "";
    els.banner.hidden = false;

    const msg = document.createElement("p");
    msg.className = "pw-banner-msg";
    msg.textContent = t("pw_created") + project.name;
    els.banner.appendChild(msg);

    const row = document.createElement("p");
    row.className = "pw-banner-actions";
    const go = document.createElement("a");
    go.className = "btn btn-primary";
    go.href = "eligibility.html?project=" + encodeURIComponent(project.id);
    go.textContent = t("pw_open_eligibility");
    row.appendChild(go);

    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "btn btn-secondary";
    dismiss.textContent = t("pw_dismiss");
    dismiss.addEventListener("click", hideBanner);
    row.appendChild(dismiss);

    els.banner.appendChild(row);
  }

  function hideBanner() {
    if (!els.banner) return;
    els.banner.hidden = true;
    els.banner.textContent = "";
  }

  function note(key) {
    const p = document.createElement("p");
    p.className = "pw-note";
    p.textContent = t(key);
    return p;
  }

  function projectCard(p) {
    const card = document.createElement("article");
    card.className = "card pw-card";

    const h = document.createElement("h3");
    h.className = "pw-card-title";
    h.textContent = p.name || t("pw_untitled");
    card.appendChild(h);

    // Synthetic projects are labelled, so a teaching or test project can never
    // be mistaken at a glance for one holding real study data.
    if (p.dataset_kind === "synthetic") {
      const tag = document.createElement("span");
      tag.className = "pw-tag";
      tag.textContent = t("badge_synth");
      h.appendChild(tag);
    }

    const meta = document.createElement("p");
    meta.className = "pw-meta";
    meta.textContent = [
      labelFor(fields.type.input, p.project_type),
      labelFor(fields.question.input, p.question_type),
      labelFor(fields.area.input, p.area_of_research)
    ].filter(Boolean).join(" · ");
    card.appendChild(meta);

    const open = document.createElement("a");
    open.className = "pw-open";
    open.href = "eligibility.html?project=" + encodeURIComponent(p.id);
    open.textContent = t("pw_open");
    card.appendChild(open);
    return card;
  }

  /** Reads an option's translated label, so the card matches the form. */
  function labelFor(select, value) {
    if (!select || !value) return "";
    const opt = select.querySelector('option[value="' + value + '"]');
    if (!opt) return value;
    const key = opt.getAttribute("data-i18n");
    return key ? t(key) : opt.textContent;
  }

  function renderList() {
    els.list.textContent = "";
    const user = auth.user();

    if (!user) { els.list.appendChild(note("pw_signin")); return; }
    if (loadError) { els.list.appendChild(note("pw_load_failed")); return; }
    if (projects === null) { els.list.appendChild(note("pw_loading")); return; }
    if (!projects.length) { els.list.appendChild(note("pw_empty")); return; }

    const grid = document.createElement("div");
    grid.className = "pw-grid";
    projects.forEach(p => grid.appendChild(projectCard(p)));
    els.list.appendChild(grid);
  }

  function render() {
    els.form.hidden = view !== "form";
    els.list.hidden = view === "form";
    els.start.hidden = view === "form";
    if (view === "list") renderList();
    if (els.status && els.status.dataset.key) setStatus(els.status.dataset.key, els.status.dataset.extra);
    if (els.submit) els.submit.textContent = saving ? t("pw_saving") : t("pw_create");
  }

  /* ----------------------------------------------------------------- form */

  function clearErrors() {
    Object.keys(fields).forEach(k => {
      const f = fields[k].field;
      if (!f) return;
      f.classList.remove("is-invalid");
      const e = f.querySelector(".error");
      if (e) e.hidden = true;
    });
    setStatus(null);
  }

  function openForm() {
    clearErrors();
    hideBanner();
    Object.keys(fields).forEach(k => { if (fields[k].input) fields[k].input.value = ""; });
    [fields.type, fields.dataset, fields.question, fields.area].forEach(f => {
      if (f.input) f.input.classList.add("is-empty");
    });
    view = "form";
    render();
    if (fields.name.input) fields.name.input.focus();
    els.form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function closeForm() {
    view = "list";
    clearErrors();
    render();
    els.start.focus();
  }

  function validate() {
    let firstBad = null;
    Object.keys(fields).forEach(k => {
      const f = fields[k];
      if (!f.required || !f.field) return;
      const bad = !(f.input.value || "").trim();
      f.field.classList.toggle("is-invalid", bad);
      const e = f.field.querySelector(".error");
      if (e) e.hidden = !bad;
      if (bad && !firstBad) firstBad = f.input;
    });
    if (firstBad) firstBad.focus();
    return !firstBad;
  }

  /* -------------------------------------------------------------- loading */

  /**
   * Bring up the backend, once, and only when it is actually needed.
   *
   * auth.ready() pulls in the Firestore SDK — 436 KB — so calling it on load
   * made every signed-out visitor to the home page download a database client
   * they were never going to use. Nothing here needs it until someone is
   * signed in or has asked to create something.
   */
  function ensureBackend() {
    if (backend) return Promise.resolve(backend);
    if (!backendPending) {
      backendPending = auth.ready().then(api => { backend = makeBackend(api); return backend; });
      backendPending.catch(() => {});
    }
    return backendPending;
  }

  function load() {
    const token = ++loadToken;
    const user = auth.user();
    loadError = null;
    if (!user) { projects = []; render(); return Promise.resolve(); }
    if (!backend) {
      projects = null;
      render();
      return ensureBackend().then(load, () => { loadError = true; projects = []; render(); });
    }
    projects = null;
    render();
    return backend.listProjects(user.uid)
      .then(rows => { if (token === loadToken) { projects = rows; render(); } })
      .catch(() => { if (token === loadToken) { projects = []; loadError = true; render(); } });
  }

  /* --------------------------------------------------- the two-write gap */

  // A project whose membership row is missing is unreachable, because
  // projects/ cannot be listed. The id is parked locally and retried on the
  // next load; only if that also fails is it shown to the user so it is not
  // lost.
  const PENDING = "aimstep-pending-membership";

  function retryPending() {
    const user = auth.user();
    let pid = null;
    try { pid = localStorage.getItem(PENDING); } catch (e) {}
    if (!pid || !user || !backend) return Promise.resolve();
    return backend.addMembership(pid, user.uid)
      .then(() => { try { localStorage.removeItem(PENDING); } catch (e) {} })
      .catch(() => {});
  }

  /* --------------------------------------------------------------- create */

  function submit(ev) {
    if (ev) ev.preventDefault();
    if (saving) return Promise.resolve();       // guards a double click
    clearErrors();
    if (!validate()) return Promise.resolve();

    const user = auth.user();
    if (!user) { rememberIntent(); auth.signIn(); return Promise.resolve(); }
    if (!backend) {
      // First write of the session: bring the SDK up, then come back here.
      return ensureBackend().then(() => submit(), () => { setStatus("err_offline"); });
    }

    const payload = {
      name: fields.name.input.value.trim(),
      projectType: fields.type.input.value,
      questionType: fields.question.input.value,
      areaOfResearch: fields.area.input.value,
      datasetKind: fields.dataset.input.value
    };
    const pid = backend.newId();

    saving = true;
    if (els.submit) { els.submit.disabled = true; els.submit.textContent = t("pw_saving"); }

    return backend.createProject(pid, user.uid, payload)
      .then(() => {
        try { localStorage.setItem(PENDING, pid); } catch (e) {}
        return backend.addMembership(pid, user.uid)
          .then(() => { try { localStorage.removeItem(PENDING); } catch (e) {} })
          .catch(() => { setStatus("err_partial", pid); });
      })
      .then(() => {
        view = "list";
        render();
        // Banner first, then the refresh. Their order does not matter any
        // more — that is the point of keeping them apart.
        showBanner({ id: pid, name: payload.name });
        return load();
      })
      .catch(err => {
        const key = explainError(err, user);
        setStatus(key || "err_generic", key ? "" : (err && (err.code || err.message)) || "");
      })
      .then(() => {
        saving = false;
        if (els.submit) { els.submit.disabled = false; els.submit.textContent = t("pw_create"); }
      });
  }

  /* ----------------------------------------------------------------- wire */

  els.start.addEventListener("click", () => {
    if (!auth.user()) { rememberIntent(); auth.signIn(); return; }
    openForm();
  });
  els.form.addEventListener("submit", submit);
  if (els.cancel) els.cancel.addEventListener("click", closeForm);

  [fields.type, fields.dataset, fields.question, fields.area].forEach(f => {
    if (!f.input) return;
    f.input.addEventListener("change", () => f.input.classList.toggle("is-empty", !f.input.value));
  });

  document.addEventListener("aimstep:lang", render);

  document.addEventListener("aimstep:auth", () => {
    // Someone asked to create before signing in; give them back what they
    // asked for instead of making them find the button again.
    const wanted = auth.user() && takeIntent();
    if (!auth.user()) { projects = []; render(); return; }
    ensureBackend().then(retryPending).then(load)
      .then(() => { if (wanted) openForm(); })
      .catch(() => { loadError = true; projects = []; render(); });
  });

  // Signed out, this does nothing but paint the "sign in" note — no SDK, no
  // network. Everything heavier waits until there is a user.
  if (auth.user()) {
    ensureBackend().then(retryPending).then(load).catch(() => {
      loadError = true; projects = []; render();
    });
  }

  render();

  // Exposed for the tests, which drive the same functions the buttons do.
  return { submit, openForm, closeForm, load, render, state: () => ({ view, saving, projects, loadError }) };
}
