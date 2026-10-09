<!-- Agent: Codex | Task: Analysis workflow | Session: 2026-10-09 -->
# Reviewable AI-assisted analysis

## Summary
Use AI for data inspection and a structured analysis plan; execute a constrained, reproducible statistical engine only after two explicit user confirmations. Preserve numerical inputs, findings, settings, source snapshots and exact outputs. Do not run arbitrary model-generated code or let language-model prose supply effect estimates.

## Research method
Four queries covered 2025–2026 agent reproducibility, Cochrane meta-analysis guidance, metafor model documentation, and netmeta multi-arm covariance. No internal research cache or report template exists in this repository. Reviewed existing Analysis, Extraction/results/importer, Risk of bias workflow and authenticated online transport.

## Sources and findings
- AIRepr (EMNLP Findings 2025; revised November 2025): explicit analysis workflows and inspector review improve reproducibility; evidence for structured plan-and-check architecture, not proof of clinical validity. https://arxiv.org/abs/2502.16395
- SciAgentArena (June 2026 preprint): agents perform better on well-specified data-analysis tasks; open-ended scientific autonomy remains unreliable. Treat as emerging evidence. https://arxiv.org/abs/2606.12736
- Cochrane Handbook, chapter 10 (current page, chapter updated November 2024): suitable outcome measures, heterogeneity, missing data and planned analyses matter before pooling. https://training.cochrane.org/handbook/current/chapter-10
- Cochrane Handbook, chapter 11: network connectivity, transitivity and within-study dependence are prerequisites; rankings alone do not support clinical recommendations. https://training.cochrane.org/handbook/current/chapter-11
- metafor official documentation: explicit estimators and tests, including REML and Knapp–Hartung, rather than an unspecified random-effects label. https://wviechtb.github.io/metafor/reference/rma.uni.html
- netmeta official reference: correlated contrasts from multi-arm studies require joint treatment. https://guido-s.r-universe.dev/netmeta/doc/manual.html

## Existing patterns
- analysis.html: browser frequentist GLS/DL and Bayesian normal-contrast grid engines, network/forest/league/rank plots. Existing claims of exact Bayesian sampling require correction: the tau integral uses a finite grid.
- extraction.html + app/extraction-results.js: project-scoped current results, reviewer edits, additional time points and NR/NA values; plain numeric coercion of missing values is unsafe.
- risk-of-bias.html: neutral compact controls, collapsible sections, purple progress, explicit human review.
- app/online-model.js: authenticated public AI requests; use it rather than public-browser loopback requests.

## Decisions
| Decision | Rationale/source | Alternative |
| --- | --- | --- |
| Three sections and two signature-bound confirmations | User request; AIRepr structured review | One autonomous Run |
| AI inspects complete data in batches; returns issues, never rewrites numbers | AIRepr; Cochrane ch10 | AI-generated numeric dataset |
| Deterministic table/Extraction import with editable cells and missing markers | Cochrane ch10; current extraction format | Empty strings coerced to zero |
| Explicit editable per-outcome/time-point plans, unsupported requests block confirmation | SciAgentArena; Cochrane ch10/11 | Silently substitute another analysis |
| Preserve and independently test existing GLS/DL engine; disclose estimator, CI and grid approximation | netmeta; metafor docs | Unverified new engine or claim REML |
| Worker executes supported models; Stop terminates it; source/settings changes invalidate results | Reproducibility and existing progress UI | Main-thread blocking compute |
| Online views + export raw results, figures, interpretation and methods, inputs, plan, runnable engine | AIRepr reproducibility | Image-only results |
| No automated GRADE, clinical recommendations or unsupported absolute-risk conversions | Project workflow/codebook | Invent missing methodology |

## Risks and mitigations
- AI hallucination (high impact): deterministic value validation, bounded schemas, source snapshots, mandatory confirmation.
- Stale confirmation or cross-project mixing (high): project-scoped IndexedDB, full content signatures, upstream check before Start, invalidate upon edit.
- Statistical misspecification (high): separated outcomes/time points, consistent direction/units, multi-arm covariance, disconnected-network errors, engine bounds and independent R checks. Unsupported analyses are named, not silently run.
- Sparse binary data and Bayesian approximation (medium/high): show dropped studies and zero-cell correction; label normal likelihood and finite grid; no claim of exact binomial analysis.
- Interrupted work/storage failure (medium): persist checks and completed run atomically; do not mark confirmed/completed when save fails.

## Implementation and verification
P0: deterministic import/check state, AI review, requirements plan, strict confirmation gates, Worker computation.
P1: online charts/documents and complete downloadable bundle; compatibility with Extraction exports and existing project navigation.
P2: regression tests for NR/NA, duplicates, confirmation invalidation, unsupported plans, stop/error/reload; numerical comparisons against installed R metafor and matrix references, synthetic browser tests, live deployment checks.

Quality gate: four queries; >=3 primary sources; >=2 existing artifacts; alternatives and risks documented; no new external dependency or arbitrary generated-code execution needed.
