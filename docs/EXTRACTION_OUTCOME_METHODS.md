# PICDO outcome extraction

Reviewed 8 October 2026. PICDO is the requested application label for Participant, Intervention, Continuous outcomes, Dichotomous outcomes and Other information. Baseline information remains separate. This does not assert that PICDO is a standard reporting guideline.

## Sources and design decisions

- [Cochrane Handbook, current Chapter 6](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-06), version 6.5 (2024), chapter updated August 2023. Distinguishes data types, arm summaries and effect measures. Continuous extraction retains metric, mean, SD and the associated sample size; binary extraction retains people with events and the matching denominator. Alternative statistics keep their original labels. The app does not automatically apply Handbook conversion/imputation methods: those need assumptions, documented inputs and separate review.
- [Cochrane Handbook, current Chapter 5](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-05), version 6.5 (2024), chapter updated October 2019. Structured definitions, study/report linkage and outcome-specific extraction support reviewable records. Independent outcome checking is methodologically important; the current app provides AI draft provenance and reviewer checks, not a new independent dual-review workflow.
- [CONSORT 2025 explanation and elaboration](https://www.bmj.com/content/389/bmj-2024-081124), particularly item 26. Outcome/time-specific analyzed and observed-data sample sizes may differ. Preserve arm summaries, comparative estimates and precision; binary outcomes include relative and absolute measures. Harms distinguish people affected from recurrent events. This is reporting guidance used to design extraction fields, not an extraction accuracy validation study.

The current primary sources were searched in three focused queries. Indexed source text was available; direct opens returned temporary errors/403. No newer general replacement for these outcome-extraction principles was identified in this targeted search. Earlier project evidence on AI extraction limitations remains relevant (see EXTRACTION_PIOO_METHODS.md).

## Interface and operational definitions

Both outcome sections have 12 default fields, editable Items definition, confirmed Clear/Save, removable/addable fields and typed outcome targets. Targets retain name, requested time and acceptable window. Continuous and dichotomous target creation assigns its data type explicitly. Definitions sent to AI cover:

- Continuous: identity/timing/population/dependence; instrument and units; endpoint versus change; mean, SD and N; alternative summaries; comparative effects and precision; missingness/discrepancies.
- Dichotomous: identity/timing/population/dependence; event threshold; people with events and matched denominator; explicit zero versus absence of reporting; reported percentages; effects and precision; harms ascertainment; missingness/discrepancies.

A reported SD of zero is retained as data (downstream estimability still requires review). Participant counts must be integers; event counts cannot exceed denominators. Rounded percentages never automatically become event counts. SE/CI/IQR are not SD, randomized N is not automatically analyzed N, and endpoint SD is not change SD. Cluster, paired and repeated-event information remains labeled and is not treated as independent binary/continuous data. Numerical grid capabilities remain arm-level mean/SD/N and events/total; alternative summaries and effects are descriptive records, not automatically converted analysis inputs.

## Compatibility and validation

Existing target IDs and extracted values are preserved. Known targets route to their matching section; unknown types remain in a temporary classification table. Shared legacy descriptive fields remain labeled `Previous outcome` in Other information; the old continuous/binary summary fields stay with their corresponding section. Definitions and original field IDs are retained. Removed legacy Outcome sections migrate into separate restorable archives; unclassified targets and shared fields are recovered on restoration. Each new section can be removed/restored independently. A one-time migration prevents re-adding deleted defaults.

Regression tests exercise fresh/legacy/removed forms, custom/empty definitions, target IDs, independent archives, unclassified targets, integer counts and true zero values. The actual AI prompt is checked for all 62 non-ID fields and both target types. Browser tests use isolated synthetic projects. Any synthetic local-model check is a regression check, not an accuracy benchmark or a claim of general clinical validation.

Validation on 8 October 2026: regression suites and inline syntax checks passed. Browser checks passed for 24 defaults, definition editing/save/reload, typed target creation and independent section removal/restoration. A rapid-dialog-switch close-event race was found and fixed. Local `gemma4:31b-it-q8_0` correctly returned fictional pain means 4.2/5.5 with Exercise SD missing (SE 0.3 only), Control SD 1.2, and N 28/27; separate response results were 0/28 and 3/27. It wrote an explicit “not reported” funding value and omitted some missing fields; model output completeness and source correctness still need review.
