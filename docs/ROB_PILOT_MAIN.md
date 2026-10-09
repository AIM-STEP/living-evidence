# Risk of bias assessment workflow

Below Included studies, a separate collapsible Outcome and time point panel holds target results. Assessment tools follows it and shows 24 unique selectable tool cards in a responsive three-column grid (two/one on narrower screens), with brief applicability text and full tool/version information on hover. Select one tool for the current assessment run; the separate Study/Design/Tool table is removed. The selected card is highlighted and controls AI prompts and answer codes directly. Changing tool archives prior main assessments, clears current results/progress and invalidates pilot approval. First-time workspaces default to the first tool.

Each target requires an outcome and a separate time point. Tool and result changes save automatically. Pilot is enabled when the tool, outcome and time point are complete; there is no separate Save button or trailing setup hint. Legacy outcomes retain their names but require the user to supply missing time points; no time point is inferred. The target outcome and time point are included explicitly in AI prompts, result titles and stage exports. Changing either invalidates prior pilot approval; affected main assessments are archived in the audit and removed from current results.

Applicability references checked during implementation:
- https://www.riskofbias.info/welcome/rob-2-0-tool
- https://www.riskofbias.info/welcome/home/read-more
- https://www.riskofbias.info/welcome/robins-e-tool
- https://www.bristol.ac.uk/population-health-sciences/projects/quadas/
- https://jbi.global/critical-appraisal-tools

Existing tool questions and judgement algorithms are retained. The interface does not create a common numerical quality score across incompatible tools. Selected tools remain fixed during AI runs; AI does not silently reclassify a study and replace the user's tool.

Pilot assess and Main assess follow the Extraction layout: header help, purple progress bars, optional further rounds, active round tabs, accuracy, Stop/Resume, Clear with confirmation and separate Excel exports. Assessments are result-specific (report × outcome). Pilot randomly samples readable results, displays the AI answers/reasons/verified quotations, and asks the reviewer to Agree or mark Mistake, correct allowed answer codes and save a reason. Accuracy is the proportion of sampled results marked Agree, not a validated model performance estimate.

Main requires a completed and approved pilot with the same records, outcomes, study designs and tool choices. Pilot corrections are supplied as prompt guidance only to the same tool in later rounds and Main. This is contextual guidance, not model fine-tuning. Corrections are not evidence about other studies. Main drafts remain subject to human review and confirmation. Confirmed assessments and manually edited values are preserved when resuming.

State lives in project-scoped `aimstep-rob`, including `robFlow`. A setting change invalidates approval via the workflow signature. Stop preserves completed work; Resume retries pending results. Failed draft persistence rolls back that draft/result. Clear resets the selected stage's progress, retaining study data and PDFs. Assessment tools has no Clear button. Assessment tools can be collapsed with its header toggle, and its state persists per project. The former Summary panel, charts and separate export controls have been removed; Pilot/Main exports remain available.

Both stages export new XLSX files with separate sheets for each tool: item answers, reasons, quotations/passages, review status, corrections, domain judgements and overall judgement where the tool defines one. Uploaded PDF files are never modified. Public pages use the authenticated online transport to the existing local-model backend; local pages retain the local backend.

Validation: unit tests cover pilot completion/approval, accuracy, correction transfer by tool, settings invalidation, sampling and source deletion rollback. Browser tests use synthetic PDFs and mocked model responses; they cover two pilot rounds, corrections reaching later prompts, Main gating, review access, Stop/Resume, refresh restoration and both exports. These tests verify software behaviour, not clinical validity of the existing assessment algorithms or model accuracy.


## Outcome intake sources

Outcome and time point supports AI from Extraction, Import from local, and manual Add. The first action reads only the current project's active extraction workspace and actual stored outcome results/values. Configured blank template targets are not treated as extracted results. All identified names/time points must appear in source text; missing or unsupported time points stay blank and block assessment until edited.

Local import reads XLSX, CSV, TSV, JSON, DOCX, TXT, Markdown and readable PDF. Structured outcome/time-point rows are saved before AI checking; unstructured text is sent in bounded batches for grounded identification. Source text and file provenance remain project-scoped. AI checks report row-specific issues without silently rewriting imported values. Feedback appears below each editable row; Check again rechecks the current list, and Stop preserves already imported rows. Model failures retain the imported rows for manual editing. Equal name/time-point pairs deduplicate; different time points remain distinct. Assessment tools Clear and its handler were removed.

Additional validation: parser/grounding tests and browser synthetic checks cover all three sources, missing time points, row editing, actual extracted results versus configured targets, and persistence after refresh.
