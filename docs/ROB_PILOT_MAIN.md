# Risk of bias assessment workflow

Below Included studies, Assessment tools lists study designs with tool selectors and brief applicability/version descriptions. Each design defaults to its first available tool; saved choices remain. Study designs can be set separately for each report. Unknown designs must be resolved before AI assessment rather than silently treated as randomised trials.

Applicability references checked during implementation:
- https://www.riskofbias.info/welcome/rob-2-0-tool
- https://www.riskofbias.info/welcome/home/read-more
- https://www.riskofbias.info/welcome/robins-e-tool
- https://www.bristol.ac.uk/population-health-sciences/projects/quadas/
- https://jbi.global/critical-appraisal-tools

Existing tool questions and judgement algorithms are retained. The interface does not create a common numerical quality score across incompatible tools. Selected tools remain fixed during AI runs; AI does not silently reclassify a study and replace the user's tool.

Pilot assess and Main assess follow the Extraction layout: header help, purple progress bars, optional further rounds, active round tabs, accuracy, Stop/Resume, Clear with confirmation and separate Excel exports. Assessments are result-specific (report × outcome). Pilot randomly samples readable results, displays the AI answers/reasons/verified quotations, and asks the reviewer to Agree or mark Mistake, correct allowed answer codes and save a reason. Accuracy is the proportion of sampled results marked Agree, not a validated model performance estimate.

Main requires a completed and approved pilot with the same records, outcomes, study designs and tool choices. Pilot corrections are supplied as prompt guidance only to the same tool in later rounds and Main. This is contextual guidance, not model fine-tuning. Corrections are not evidence about other studies. Main drafts remain subject to human review and confirmation. Confirmed assessments and manually edited values are preserved when resuming.

State lives in project-scoped `aimstep-rob`, including `robFlow`. A setting change invalidates approval via the workflow signature. Stop preserves completed work; Resume retries pending results. Failed draft persistence rolls back that draft/result. Clear resets the selected stage's progress, retaining study data and PDFs. The existing confirmed-assessment Summary remains available.

Both stages export new XLSX files with separate sheets for each tool: item answers, reasons, quotations/passages, review status, corrections, domain judgements and overall judgement where the tool defines one. Uploaded PDF files are never modified. Public pages use the authenticated online transport to the existing local-model backend; local pages retain the local backend.

Validation: unit tests cover pilot completion/approval, accuracy, correction transfer by tool, settings invalidation, sampling and source deletion rollback. Browser tests use synthetic PDFs and mocked model responses; they cover two pilot rounds, corrections reaching later prompts, Main gating, review access, Stop/Resume, refresh restoration and both exports. These tests verify software behaviour, not clinical validity of the existing assessment algorithms or model accuracy.
