/**
 * Per-project local persistence for the Eligibility Criteria Builder.
 *
 * Browser storage only — no login, no server, as the prompt requires. The
 * store is injected rather than reached for, so the tests exercise the real
 * code against a fake instead of a mock of it.
 *
 * SCOPED BY PROJECT. The key carries the project id, so two projects open in
 * the same browser cannot overwrite one another ("状态按项目ID或稳定项目键隔离").
 * A project with no id — the module opened without an upstream project — gets
 * its own draft slot rather than silently sharing one with a real project.
 *
 * Every call is wrapped: localStorage throws outright in a private window with
 * site data blocked, and a builder that cannot save is still a builder that
 * should let you type.
 */

const PREFIX = "aimstep-eligibility";
const DRAFT = "__draft__";

/** The storage key for a project. Stable, and safe for an id with a colon. */
export function storageKey(projectId) {
  const id = typeof projectId === "string" && projectId.trim() ? projectId.trim() : DRAFT;
  return `${PREFIX}:${encodeURIComponent(id)}`;
}

/** Reads saved state. Returns null when absent, unreadable, or corrupt. */
export function load(projectId, store) {
  if (!store) return null;
  try {
    const raw = store.getItem(storageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (e) {
    // Corrupt or unreadable: treated as absent. Deleting it here would throw
    // away a state the user might still recover by hand.
    return null;
  }
}

/** Writes state. Returns whether it was actually stored. */
export function save(projectId, state, store) {
  if (!store) return false;
  try {
    store.setItem(storageKey(projectId), JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

/** Removes a project's saved state. Returns whether the removal went through. */
export function clear(projectId, store) {
  if (!store) return false;
  try {
    store.removeItem(storageKey(projectId));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * The demo state behind 填入示例.
 *
 * Marked `demo: true` so nothing downstream can mistake it for research the
 * user entered, and built from the framework hints rather than from a second
 * copy of the same strings — a copy would drift from 表 2 the first time that
 * table changed.
 *
 * The prompt is firm that this must not blend into real work
 * ("不得与用户真实项目状态混淆"), which is why filling it is a deliberate action
 * with its own confirmation in the UI, never something that happens on load.
 */
export function demoState(frameworks, frameworkId = "PICO") {
  const fw = frameworks.find(f => f.id === frameworkId);
  const byFramework = {};
  for (const f of frameworks) {
    byFramework[f.id] = {};
    for (const el of f.elements) {
      byFramework[f.id][el.key] = { value: "", exclude: "", excludeOpen: false };
    }
  }
  if (fw) {
    for (const el of fw.elements) {
      byFramework[fw.id][el.key] = {
        value: el.hint && el.hint.zh ? el.hint.zh : "",
        exclude: "",
        excludeOpen: false
      };
    }
  }
  return {
    demo: true,
    frameworkId,
    byFramework,
    limiters: {
      design: ["rct", "quasi"],
      year: { from: "2015", to: "" },
      language: ["en", "zh"],
      pubtype: ["peer"],
      other: ["human"],
      custom: ""
    }
  };
}
