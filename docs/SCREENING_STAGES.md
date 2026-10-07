# Title and abstract screening stages

The full eligibility snapshot remains authoritative and is handed to Full-text assess unchanged. Each condition is assigned to abstract or fulltext; there is no ignore option. At least one condition must be active for title/abstract screening. Assignments are project-scoped in the screening IndexedDB workspace, not written to upstream eligibility or search strategy storage.

Only explicitly sequential numbered lists are split. Alternative/exception clauses and rules with qualifying definitions remain grouped. Unnumbered prose is not split by a language model. Inclusion and exclusion conditions retain their original text and roles. Users choose stages and Save before starting a pilot.

The same active projection is used for both pilot and formal prompts, correction memory, exclusion validation and export reasons. Only an active, named, explicitly unmet condition with a verified source quote permits automated exclusion. Missing information goes forward and does not alone create a Check task. Conflicts retain the existing review path. Exclusion-only rules explicitly distinguish matching an exclusion from satisfying an inclusion.

Settings changes archive existing pilot/formal assessments, retain all source records (including earlier exclusions), reset current assessments and approval, and require a fresh pilot. Source fingerprints and per-assessment stage signatures prevent stale results from being reused. New or changed conditions require assignment; unchanged text retains its selection. Saving refreshes upstream criteria and rejects concurrent changes. Failed storage writes restore the prior workspace. Clear actions retain the configuration; Reset restores the first saved choices for unchanged conditions, and does not apply until Save.

Full-text handoff includes the complete criteria plus separate screeningStages and deferredCriteria metadata. Final JSON export includes settings. Historical runs remain in screeningStageArchives; original assessment content is preserved.

## Methodological basis

- Cochrane Handbook chapter 4, updated March 2025: over-inclusive title/abstract selection followed by full-text eligibility assessment. https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-04
- Cochrane Handbook chapter 3: absence of reported outcomes is not equivalent to failure to measure outcomes. https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-03
- PRISMA 2020 expanded checklist: report how automation is used in study selection. https://www.prisma-statement.org/s/PRISMA_2020_expanded_checklist-yc78.pdf

The stage-assignment interface is an implementation choice, not a prescribed guideline interface or a claim of validated screening accuracy.
