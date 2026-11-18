# Eligibility generation: background methodology and established English interface

The full supplied specification is preserved in [eligibility-spec.md](eligibility-spec.md). The established input and criteria interface is the production frontend. The implementation retains the project's static HTML, JavaScript/CSS, browser project storage, and existing Python/Ollama or authenticated online model transport.

## User workflow

Open a registered project's Eligibility criteria tool. The previous layout and controls are retained: Machine/Manual generate, research question, document/image attachments, voice input, Generate/Stop, Review topic, Inclusion, Exclusion, Description, inline editing, Save/Clear and Word export.

The interface and newly generated criteria use **English**. The existing language selection is set to English when the tool loads. Source material is preserved in its original language in the background.

Generate now invokes the versioned methodology through `app/eligibility/background.js`; it does not mount a separate technical workspace. The adapter runs source-backed extraction, framework mapping, normalization, independent semantic review and program validation, then projects the result into the established criteria preview. It keeps explicit exclusions separate and preserves logical alternatives. Multiple subquestions retain their branch-specific qualification logic.

Clear information becomes criteria directly. Only necessary scope decisions appear in the existing “Confirm unclear criteria” section. Neutral choices are offered where available. An Answer action accepts a specific answer when an operational boundary is genuinely missing; there are no technical field tables or fill-in templates. A confirmed answer rebuilds the criteria and Description immediately, saving the source, Decision and new revision in the background. Optional restrictions do not prevent completion.

Original excerpts, automatic check notes, framework registries, normalized element states, logic trees and version/audit data remain internal. They are not appended to the generated prose or Word export. Custom frameworks and methodology profiles are maintained as configuration, rather than additional frontend panels.

## Start and connect

From the repository:

```sh
python3 tools/local_model_server.py
```

Open `http://127.0.0.1:8765/`, select or create a project, and enter Eligibility criteria. A direct URL requires an existing registered project:

```text
http://127.0.0.1:8765/eligibility.html?projectId=<registered-project-id>
```

The existing default local model is `gemma4:31b-it-q8_0`. A running Ollama installation with the selected model is required. Existing configuration remains supported:

```sh
AIMSTEP_MODEL=<installed-model> python3 tools/local_model_server.py
python3 tools/local_model_server.py --model <installed-model> --ollama http://127.0.0.1:11434
```

`OLLAMA_HOST_URL` also configures the Ollama address. Health and model endpoints remain `/api/eligibility/health` and `/api/eligibility/model`. The public site retains its authenticated `AIMSTEPOnlineModel.request` transport. No new API key is required for the already working local connection; secrets are not stored in project records.

The established generation cancellation and ten-minute request limit remain. Model structure and answer interpretation have bounded retries. A stale result cannot overwrite newer project or editor revisions. A failed persistence operation rolls back both the existing criteria store and the background project state.

## Background modules and configuration

| File | Responsibility |
| --- | --- |
| `app/eligibility/background.js` | Headless integration with the established editor, English projection, necessary confirmations, atomic storage and author-edit provenance |
| `app/eligibility/registries.js` | Independent framework/profile registries and case-sensitive alias handling |
| `app/eligibility/methodology.js` | Source-grounded analysis/data roles, retained age qualifiers, dimension-preserving English prose and analysis objectives |
| `app/eligibility/domain.js` | Stable IDs, enums, Unicode source positions, numeric/role/exception checks and logical structures |
| `app/eligibility/engine.js` | Versioned input, Elements, clarification detection, Decisions, criteria, validation and snapshots |
| `app/eligibility/model.js` | Extraction, separate semantic review and natural-language answer interpretation |
| `config/eligibility-frameworks.json` | Framework slots, definitions, examples, aliases, relationships, check rules and sources |
| `config/eligibility-review-profiles.json` | Applicable dimensions, required decisions, evidence units and scoped methodological rules |

Framework IDs are `pico`, `peco`, `peo`, `pcc`, `pico_qualitative`, `cocopop`, `pird`, and `spider`. PICO and PICo remain distinct. The maintained alias `pECO` maps to PECO. Ambiguous lowercase `pico` is resolved by meaning when possible; otherwise a necessary confirmation is retained. Framework fields do not automatically become mandatory restrictions or authorize study-design defaults.

Add a framework through the registry configuration or `register_framework` API, providing `framework_id`, `display_name`, `version`, aliases and slots with full semantic IDs and definitions. Undefined custom fields require clarification. Additional source-defined dimensions are preserved even when outside a framework.

Framework `check_rules` support `core_scope`, `dimension`, `evidence_unit`, and nonblocking `advice`. Conditional `when` fields support methods, question types and present/absent dimensions. New specialized executable checks require corresponding implementation and tests; unrecognized rule names are not an authorization to invent restrictions.

Methods, question types, frameworks and evidence units are stored separately. Generic systematic/scoping reviews do not receive implicit RCT, language, date or full-text restrictions. Umbrella reviews require a clear evidence unit. Cochrane-specific checks apply only to the explicit corresponding profile. Model-inferred review methods remain candidates rather than silently activating specialized methodological decisions.

Built-in `authorized_defaults` are empty. A team-authorized scope rule must specify its name, content, version and explicit project/question/method/type scope. Methodological advice is separate from authorization. The configuration files record methodological sources and access versions, including JBI, Cochrane chapter 3, PECO and SPIDER.

## Persistence and manual revisions

The established `aimstep-eligibility:<projectId>` store and criteria library remain the frontend's working records. The headless engine uses `aimstep-eligibility-v3:<projectId>`. Original input, imported documents, effective previous human decisions, subsequent answers and snapshots remain traceable. Generated technical workbench assets have been removed from the production implementation.

Source positions are zero-based Unicode code points with an exclusive end, validated against the exact source revision. Information status, decision status, semantic role and scope status are separate. Snapshots retain the previous validated structured states; Criteria link their source Elements, Decisions and authorized rules.

The existing inline editor continues to save author revisions immediately. Such edits are recorded as explicit human revisions in the background. The previous structured snapshot is retained rather than falsely asserted to describe a changed free-text clause; reanalysis uses the current authored scope and cannot overwrite the newer editor revision. Clearing criteria clears the active methodology output while retaining historical sources and snapshots.

Persistence remains browser-local; this change does not add a cross-device cloud database. Existing Word export remains available without technical audit appendices. Complete internal project records can be accessed through the background service/store for research audit or developer export.

## Checks actually run

```sh
node tests/eligibility/acceptance.cjs
node tests/eligibility/invariants.cjs
node tests/eligibility/classic.cjs
```

The first two suites cover the specification's 32 program acceptance cases and 19 additional boundary/invariant cases. Semantic fixture outputs are synthetic and do not demonstrate real model accuracy.

`classic.cjs` runs the established frontend functions with the real background adapter and engine and simulated model responses. It checks English output, generation, source review, necessary age clarification, immediate criterion/Description updates, explicit Exclusion output, restoration, author-edit provenance and stale-result protection. It also verifies that static markup and styles match frontend commit `d1b208d`, excluding script code, cache versions and blank lines. This is not a screenshot/real-browser rendering test.

The 16 existing related regression suites were also run. The prior technical workspace DOM test is archived in the earlier evaluation record; that workspace and its test have been removed and replaced by the production integration test.

Recorded real-model development observations and failures remain in [eligibility-evaluation/README.md](eligibility-evaluation/README.md). The frontend restoration has program/integration validation; it does not add new real-model accuracy claims. The earlier PCC real-model evaluation was incomplete because the verification HTTP client timed out, and real-browser visual verification remains unavailable because the browser tool could not write its runtime directory. Expert-adjudicated real review cases are still needed for an independent methodology benchmark.

Real-model evaluation can be repeated with:

```sh
node tools/evaluate_eligibility_v3.cjs --case all --output /tmp/eligibility-real
```

Use `AIMSTEP_ELIGIBILITY_MODEL_BASE` or `--base` for the existing backend. `--exchange-dir` supports external HTTP execution in a restricted test environment; `--resume` preserves input IDs, and `--replay` verifies unchanged request hashes before replaying recorded responses. Synthetic tests, historical real outputs, metadata corrections, transport failures and independent expert validation must remain separately reported.

## Nutrition / IPD-NMA correction (2026-11-18)

The user-provided objective is covered by `tests/eligibility/fixtures/nutrition-ipd-nma.json`, `nutrition.cjs` and `nutrition-frontend.cjs`. These tests deliberately reproduce the reported bad semantic candidates, rather than supplying only ideal inputs: a dropped older qualifier, an IPD eligibility condition, an unresolved comparator antecedent and a topic without analysis objectives.

The engine preserves “older people” while its numeric age boundary remains pending. IPD/NMA/ranking are saved as source-backed analysis information; a separate, explicit data-availability eligibility rule remains effective. Within-dimension alternatives stay under Comparison or their corresponding framework slot. The topic covers the clinical scope and explicit analysis objectives. Description retains outcomes of interest and analysis purposes, including after a human age decision or inline edit. Word export uses the same preview output.

Only the necessary age boundary is requested for this case. No RCT, language, nutritional-intervention subtype or numeric age restriction is added by default. The interface layout is unchanged. Existing saved outputs are retained; Generate must be run again to apply the new method to them.

Current engine version: `eligibility-v3.1.1`; review-profile configuration: `1.1.0`. Program/integration results are in `docs/eligibility-evaluation/nutrition-methods-tests.json`; the reference output is explicitly labeled as a simulated-candidate program regression. The new live-model verification attempt did not obtain a complete response within the external test client's 30-second window and is not counted as passed. These fixes address the reported conversions and are not a claim of independent validation of all research-method requirements.

## Progress display correction

Progress reflects completed extraction/review batches and validation/save stages, rather than assigning 65% to every model step. The existing status region displays the current English stage and elapsed response-wait time. Percentages do not increase merely because time passes; this does not accelerate model inference. The established Stop control and ten-minute deadline can release the interface even if an upstream transport fails to acknowledge cancellation. Existing criteria remain saved. See `docs/eligibility-evaluation/progress-display-tests.json` for the targeted checks. Model instructions, schemas and request payloads are unchanged by this correction.


### 18 November 2026: concise English criteria presentation

Review topics now name the clinical question without an introductory review sentence or analysis methods. Criteria display source-grounded phrases. Comparative alternatives are mapped to Comparison, including source-defined reciprocal intervention comparisons. Description uses concise, active protocol prose; analysis plans remain distinct from study eligibility. Style reference: [The BMJ house style](https://www.bmj.com/about-bmj/resources-authors/house-style).

Human checks appear under the corresponding inclusion/exclusion element, with check/cross controls and explicit action labels. For an undefined older-people boundary, the author may retain the source's qualitative restriction without inventing an age threshold, or explicitly remove that restriction. The retained qualitative definition and its unresolved numeric precision remain recorded separately from a numeric age cutoff. Decisions update criteria, prose and provenance. No age cutoff is supplied automatically.

Model completion time is unknown: the progress bar therefore shows activity, the current real processing step/batch and elapsed model wait, rather than a fabricated percentage. It shows 100% only after saving the completed result. Existing Stop and timeout controls remain available.

This release was published without running tests or live-model evaluation, at the user's explicit request. Earlier evaluation artifacts describe earlier versions and do not validate this release.
