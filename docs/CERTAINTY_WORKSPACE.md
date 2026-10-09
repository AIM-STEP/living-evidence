# Certainty of evidence workspace

Updated 2026-10-09. Authority: the current user request, the project's original GRADE_NMA_Workflow.docx and GRADE_NMA_Codebook.docx, and approved decisions in ../docs/DECISION_LOG.md. The two original documents and their 68 fields remain unchanged.

## Interface and intake

Three sections: Assessment source, Parameter Settings, Summary of findings. The next navigation label is Summary of evidence and retains the existing project-summary destination.

Assessment source supports From Extraction, Import from local (CSV, TSV, XLSX, JSON, DOCX, PDF, text/Markdown), and Add unit. Intake uses the configured authenticated model service and can be stopped. Only the active project's Extraction results are read. AI identifies framework components, outcome, time point and directed comparisons, with editable feedback; it does not generate GRADE judgments, effect estimates, MID or baseline risks. Outcome/treatment/time labels are checked against source text before acceptance. Repeated unit identities are deduplicated. A blank template is not extraction evidence. Codebook CSV/JSON imports retain original structured values and are validated deterministically; imported rule approvals are not adopted.

PICO, PECO, PCC, PICo and Other mirror Eligibility criteria. Additional framework components are editable. A quantitative directed effect/outcome/time point is still needed by this GRADE-NMA workflow; qualitative and nonrandomized rating systems are not silently substituted. Non-RCT units can be recorded but cannot finish under the existing RCT-at-high rule.

Each unit is stored as a Codebook record plus x_unit metadata. New identifiers are monotonic, including after deletion. Editing a unit's population/comparison/outcome/time/type/scale/design/framework invalidates its assessment inputs and thresholds, with the previous record retained in the audit. Parameter edits recalculate dependent results. Draft/blocked records never appear as final certainty in SoF. Records, source checks and audit are project-scoped in the existing aimstep-coe:<project> browser store.

## Parameters and calculations

Every unit requires a user-entered positive MID, its source/justification, and higher/lower-is-better direction. Binary outcomes require a user-entered control risk from 0 to 1000 per 1000 and its source. No model or extracted event rate fills these fields. Continuous outcomes require the original MD scale; their MID uses the same scale and no baseline risk is required.

Binary RR: RD per 1000 = baseline risk per 1000 × (RR − 1) for the point and both limits. Codebook #64 is percentage points; #65 is ten times #64. Impossible implied intervention risks above 1000 are not clipped or rated. Baseline risk is treated as fixed; its uncertainty is not propagated. OR, HR and SMD must not be entered as RR or MD; those transformations are not implemented.

Continuous: selected MD and its limits remain in natural units. Separate x_direct_md, x_low_rob_md, x_high_rob_md, x_indirect_md, x_nma_md, x_final_md and x_absolute_md fields follow the same four stages. The original RR/RD Codebook columns are preserved, exported as not applicable for continuous records, and never relabelled to disguise an MD. There is no per-1000 conversion of an MD.

The approved D-003 zone mapping is retained with the unit-specific MID. Direction is oriented toward benefit for clinical zone labels. Exact ±MID belongs to the middle zone; a 1e-12 × max(1, MID) comparison tolerance handles floating-point noise only. One/two/three covered zones correspond to ns/serious/very serious. Imprecision is applied once after incoherence (D-012). No universal ACR20 MID=200 or OIS=194 is applied to new units. Optional OIS and its assumptions/source are entered per unit and considered in the assessment rationale.

Missing parameters/invalid absolute effects block final computation even when an imported final rating exists. Missing required workflow entries, unapproved relevant rules and invalid values prevent a completed SoF rating. D-001, D-005–D-011, D-013 and other relevant unresolved decisions remain reviewer decisions. This UI change does not approve them.

## Excel / SoF

Export offers Workflow + SoF (Excel), SoF (Excel), and Dataset + audit (JSON). Each export is a new download, never a write over an imported file.

The workflow workbook contains Parameters, four stage worksheets, all 68 raw fields, original Codebook definitions, MD extensions, calculations with full-precision JSON and named formulas, method decisions, change history and SoF tables. Empty values mean missing; NA, Not assessable and Not performed remain distinct. Excel string cells are stored as inline text, not evaluated formulas.

SoF tables are grouped by population, framework/context and directed intervention/comparator, with at most seven outcome rows per table. Columns include outcome/time/scale, control risk/mean, intervention risk, absolute effect and CI, relative effect and CI (NA for MD), participants/studies, certainty, interpretation and explanations. Counts refer to the final effect, entered explicitly; only direct-source estimates may fall back to the entered direct-study counts. They are not inferred from overall network totals. Incomplete results are explicitly labelled. Reasons are expandable online and fully present in exports.

## References and interpretation

- Core GRADE 6: presenting evidence in summary of findings tables. BMJ 2025;389:e083866. https://www.bmj.com/content/389/bmj-2024-083866
- Core GRADE 1: overview of the Core GRADE approach. https://www.bmj.com/content/389/bmj-2024-081903
- Core GRADE 2: choosing the target of certainty rating and assessing imprecision. https://www.bmj.com/content/389/bmj-2024-081904
- Cochrane Handbook, Chapter 14, especially 14.1.3–14.1.6. https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-14

External sources support SoF presentation and outcome-specific absolute units; they do not replace project-approved rating algorithms. BMJ full HTML returned 403 during this session; primary indexed BMJ text and the accessible Cochrane chapter were used for the presentation check.

## Verification

Run `node tests/coe-units.test.js`, `node --check app/coe-workspace.js`, `node --check app/coe-units.js`, and `python3 ../scripts/check_inline_scripts.py --repo .`.

Synthetic tests cover MID boundaries, benefit direction, missing MID/baseline, impossible binary conversion, continuous MD isolation, stale derived-rating invalidation, original 68-field preservation, four-stage export and direct-only completion without a fabricated NMA estimate. Relevant unresolved source-selection rules still block before explicit reviewer approval. Browser QA uses isolated synthetic projects; no real clinical assessment is produced.

## Assessment source interaction alignment (2026-10-09)

Matches Risk of bias / Outcome and time point intake: From Extraction and Import from local in the header; Stop only while processing; Clear with confirmation; manual inline framework/component fields followed by Add (Enter also adds). No Add dialog or automatic jump to Parameter Settings. Added units appear immediately as compact editable rows with × removal. Duplicate identities are ignored, and manual inputs are cleared after adding. Dataset notes and counts are retained internally rather than displayed in this intake area.

Local import accepts multiple files. Recognized tables are appended before the AI check; unstructured material uses model identification first. Every imported batch and From Extraction batch receives a separate AI check with editable feedback. Stopping or a model failure preserves already imported units. Original source text and check responses remain in project storage/export. Manual Add does not call AI, matching the reference tool.

## Optional parameters and background rules (2026-10-09)

Method rules are no longer displayed; saved approvals, evaluation logic and audit/export remain active. No unresolved rule is automatically approved. Parameter Settings now directly lists each framework/population/outcome/time-point and directed comparison with optional MID and (for binary outcomes) control baseline risk inputs. Sources/justifications are optional. Values are stored independently for each unit/comparison, including explicit baseline risk zero. Blank values remain missing, not zero or inferred defaults; entered values are range-checked. This current user instruction supersedes the earlier mandatory-entry UI description above.

Without MID, an available absolute effect can still be presented, but MID-based imprecision and final certainty remain pending. Without binary baseline risk, relative effects remain available but absolute binary effects and final certainty remain pending. Continuous MD does not require baseline risk.
