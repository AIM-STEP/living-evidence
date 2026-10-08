# PIOO extraction configuration

Reviewed 8 October 2026. PIOO here preserves the project's four existing sections: Participant, Intervention, Outcome and Other information. It is a UI grouping, not a claim that this is a standard methodological acronym.

## Evidence and decisions

- [Cochrane Handbook, Chapter 5: Collecting data](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-05), current online handbook (v6.5, 2024; chapter last updated October 2019). Use explicit structured definitions; distinguish studies from reports; collect participants, interventions/comparators, design and outcomes. Outcome definition, instrument, metric, aggregation, timing and denominators must remain identifiable. Missing harms must not become zero harms.
- [TIDieR guideline](https://www.equator-network.org/reporting-guidelines/tidier/), 2014 foundational intervention reporting guidance. This motivates components, provider, delivery, dose/intensity, frequency, duration, tailoring and actual adherence/fidelity fields. The EQUATOR guideline entry was consulted; the BMJ full text was unavailable during this review.
- [Artificial Intelligence-Assisted Data Extraction With a Large Language Model: A Study Within Reviews](https://pubmed.ncbi.nlm.nih.gov/41183336/), 2025. Its evaluation supports an assisted, checked workflow; it does not establish performance of AIM-STEP or the local model.
- [Assessing data extraction in randomized clinical trials with large language models](https://pubmed.ncbi.nlm.nih.gov/41535766/), 14 January 2026. Reported extraction performance varied by data type, with continuous numerical data particularly challenging. This motivates preserving statistic labels and requiring human verification, rather than treating generated drafts as verified data.

## Configuration

Baseline's nine fields are retained. Participant has ten defaults, Intervention ten, Outcome nine descriptive defaults, and Other information eight. Each section has the same Items definition dialog, editable text, confirmed Clear and Save. Custom fields appear in that section's dialog. Explicitly cleared definitions stay empty. Legacy field IDs, custom definitions and extracted data are retained; previously removed sections remain removed. Defaults migrate once, so subsequent deletions persist.

The extraction prompt receives every active field's effective definition. It distinguishes arms, time points, analysis populations, endpoint/change scores and statistic types. It must not infer missing information or calculate unreported values. SE, CI, IQR and ranges are retained with their labels, never placed into SD cells. Descriptive fields accommodate effect estimates and alternative statistics; the existing numerical outcome grid supports binary events/total and continuous mean/SD/N only. Other designs or measures are not silently converted into that grid.

Outcome targets require an explicit data type and time point before model execution. Candidate evidence is selected in a balanced round-robin across field queries, tables and abstracts (up to 60 passages). A supporting quotation must match the claimed supplied passage. Numerical results map only to a unique exact normalized arm label. These checks do not establish that the value itself is correct: AI drafts still require human verification. Scanned PDFs without readable text need a separate OCR workflow.

## Validation

Automated tests cover defaults and aliases, field IDs/custom definitions, intentional deletions, removed-section archives and restoration, balanced retrieval, all-section prompt inclusion and passage-specific quotation checks. Adjacent source import/deletion, Baseline and definition-save tests are also run. Browser checks use an isolated synthetic project; model checks use a fictional two-arm report, never user study data. A small synthetic check is a regression check, not an accuracy benchmark.

On 8 October 2026, all six extraction test suites and inline JavaScript syntax checks passed. Browser validation confirmed all four dialogs (37 defaults), independent Save, reload persistence, confirmed Clear and Outcome section removal/restoration. A local `gemma4:31b-it-q8_0` run on the fictional report returned Exercise mean 4.2/N 28 with SD empty (the report supplied SE 0.3), and Control mean 5.5/SD 1.2/N 27. Unreported funding and harms stayed empty. The model also produced stitched arm quotations and a metadata-year quotation without a passage: these fail the quotation verifier and remain unsupported, unverified drafts. This observed limitation is why exact-source checks and human review remain necessary.

## TIDieR-specific revision (8 October 2026)

Intervention now follows the 12 ordered items of the requested [Hoffmann et al. original guide](https://www.bmj.com/content/348/bmj.g1687), its [Table 1](https://www.bmj.com/content/348/bmj.g1687/T1) and [EQUATOR entry](https://www.equator-network.org/reporting-guidelines/tidier/). The original article text and table were accessible through indexed HTML on this pass. The implementation uses original operational extraction instructions rather than reproducing the checklist prose.

Materials/procedures, planned personalization/study-level changes, and planned/observed fidelity are separate fields. The same questions apply to each comparator. Protocols cannot establish actual execution. Missing reporting remains blank; supported non-applicability is distinct. The form captures descriptions, not a TIDieR quality score.

New forms contain 12 Intervention defaults (39 PIOO defaults overall). Existing forms migrate once: compatible field IDs remain, explicit custom/empty definitions remain, and unmatched older fields stay as additional removable fields with their old definitions. Their data are never reassigned to a different concept. Removed sections remain hidden; archived Intervention fields receive the same migration. Subsequent user deletions persist. Tests cover these migration cases, the 12-item schema and AI prompt inclusion.
