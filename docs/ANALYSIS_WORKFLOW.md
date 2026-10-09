# Analysis workflow

The page has exactly three panels: **Data sources**, **Analysis Requirements**, and **Analysis results**. All interface copy is English. Project data, source snapshots, checks, confirmations and completed runs persist in the `aimstep-analysis` IndexedDB `projects` store, keyed by project ID. Existing legacy local Analysis imports migrate as unconfirmed working data; the legacy store is retained. Original uploaded files and Extraction records are not overwritten.

## Sources and data review

- From Extraction reads the current project's actual saved extraction results (including reviewer edits and separately reported time points) using `AimstepExtractionResults.fromStudy`. It does not substitute the requested form time point. Report IDs are preserved. Draft extraction is clearly flagged. Entirely unreported outcome results are omitted with notes, rather than converted to numeric zeros.
- Local imports: CSV, TSV, XLSX, JSON and text tables. Standard long-format arm data and the vertical outcome sheets from AIM-STEP Extraction exports are recognised deterministically. Expected fields: study, outcome, timepoint, treat, type, n, event OR mean/sd; continuous data also require unit and endpoint/change. The working table is directly editable.
- Import triggers AI inspection in batches of 35 rows. Only issue summaries are accepted from the model; AI never supplies or rewrites numerical cells. AI errors/invalid JSON leave data unconfirmed and recoverable. Deterministic checks cover finite numbers, integer denominators/counts, missing markers, duplicates and unsupported correlated raw designs.
- Confirm data is available only after the current data's AI check has completed and errors have been resolved. Warnings remain visible for human review. Edits revoke review and both confirmations. A changed upstream Extraction snapshot is detected before confirmation or analysis, requiring reimport and review.

## Requirements and confirmation

Requirements can be typed or imported from TXT, Markdown, DOCX or readable PDF. The text is editable. After data confirmation, AI generates a structured, editable plan with a summary, suggestions, per-dataset settings, explicit exclusions and unsupported requests. Uploaded requirements are treated as data, not executable code or higher-priority instructions. The actual request is sent to the existing authenticated AI service; local pages use the existing local backend.

The user confirms the plan. Data/requirements signatures and plan settings are bound to the confirmations. Editing plan settings revokes plan confirmation; editing original requirements requires a new AI review. Every dataset needs either an analysis or an explicitly explained exclusion. The Worker independently rechecks the gates; Start cannot bypass them. No machine-generated code is executed.

## Supported execution and limits

- Descriptive arm/study counts, frequentist common-effect or generalized DerSimonian–Laird random-effects synthesis, and Bayesian random-effects normal-contrast network synthesis. Two-treatment networks give pairwise synthesis; connected networks permit multiple treatments.
- RR and OR for binary outcomes; MD and two-arm Hedges' g for continuous outcomes. Exact gamma-based Hedges correction replaces the previous small-sample approximation. Multi-arm SMD is blocked pending a separately validated implementation.
- Multi-arm covariance is retained for supported measures. Back-calculated direct/indirect shares are withheld for multi-arm networks. The new page does not populate GRADE judgements or absolute risks.
- Bayesian heterogeneity uses a finite 400-point grid, not exact integration. The prior, seed, draw count and approximation are stated in the plan/methods. Frequentist confidence intervals are normal-based, not Knapp–Hartung. REML, subgroup/meta-regression, survival/IPD, funnel/publication-bias tests and binomial Bayesian models are not silently substituted; unsupported requests block confirmation.
- At most 10,000 imported arm rows and 40 treatments per pooled dataset in this browser engine. Raw cluster, crossover, paired or matched data require an appropriate statistical workflow and cannot be analysed as independent parallel arms.
- Computation uses a Web Worker. Stop terminates the active calculation, keeps prior completed runs and does not save a partial run as complete. AI failures do not enable confirmation.

## Results and export

Each completed run contains its own confirmed input and plan snapshots. Online tabs show results/figures, interpretation and methods. Network and forest plots, league tables and ranking tables are included as applicable. Interpretation is generated deterministically from computed values so the model cannot invent numerical results. Previous runs remain viewable and are labelled stale after changes. The matching Clear button beside Export asks for confirmation, then deletes all saved runs and their results/figures/documents in this project and resets progress. Working data, requirements and their confirmations are preserved. Clear is disabled during active work; a failed save leaves results intact.

Export downloads a new ZIP with:
- `results.html` (offline report and figures), `results.json`, `results.xlsx`;
- standalone SVG figures;
- `interpretation.docx` / `.txt`, `methods.docx` / `.txt`;
- `working-data.csv`, `confirmed-plan.json`, `audit.json`;
- the exact numerical `engine.cjs` and `reproduce.cjs` (`node reproduce.cjs` reproduces and compares outputs).

The exported bundle includes project source snapshots and checks. Save/share it as project data. No original local file is overwritten.

## Research and verification

Research decisions and primary sources: [research report](../.claude/context/artifacts/research-reports/ai-analysis-research-2026-10-09.md).

Commands:
```
node tools/test_analysis.cjs
Rscript tools/test_analysis_reference.R
python3 ../scripts/check_inline_scripts.py --repo .
```
Synthetic tests cover strict NR/NA handling, parsing, duplicates, time-point isolation, supported methods, signature invalidation, network connectivity, escaping and deterministic Bayesian draws. Independent R metafor 4.8.0 checks cover RR/OR pooled estimates, SE, DL tau² and Q (1e-10 tolerance), MD/SMD estimates, SE and tau² (1e-8), and correlated three-arm network estimates/covariance through rma.mv (1e-9). These are numerical regression checks, not claims of clinical validation.

Browser checks use separate synthetic project IDs: real local-model data review and plan creation; confirmation gates; Worker results and progress; source/requirements editing; failed/stopped AI jobs; reload persistence; Extraction IDs and actual time points; ZIP download and independent replay; desktop/mobile layouts. No real patient or review data is used in tests.
