# Build a protocol

Implemented 2026-10-09. This workspace generates a PROSPERO-aligned preparation document; it does not register a review or reproduce the authenticated registry submission form.

## Methods reviewed

- PROSPERO, https://www.crd.york.ac.uk/prospero/ (accessed 2026-10-09).
- University of York, 2025-03-07 relaunch announcement: https://www.york.ac.uk/crd/about/news/2025/prosperoupdate/. The redesigned registry requires author checking/approval; website draft confirmation is not registry submission.
- PROSPERO current record layout: https://www.crd.york.ac.uk/PROSPERO/view/CRD420261489828 (used only for section organization, not its clinical methods).
- PRISMA-P: https://www.prisma-statement.org/protocols, and Moher et al., 2015, https://doi.org/10.1186/2046-4053-4-1. Covers administrative details, rationale/objectives, eligibility, sources/searches, selection/data collection, outcomes, bias, synthesis and confidence in evidence. The main PRISMA 2020 checklist is not a replacement for the protocol checklist.
- CoreSR: https://coresr.ai/ and the authors' TITAN-SR publication https://www.sciencedirect.com/science/article/pii/S0895435626003902. Public materials establish an integrated evidence-synthesis workflow; they do not disclose a validated protocol-generation algorithm. No claim to reproduce CoreSR's proprietary implementation or its screening performance is made.

## Behavior

Three stacked sections: Import a protocol; Create a protocol; Review and export. Local model through the existing authenticated online bridge on the public domain; no keys in the browser. DOCX/PDF/text/Markdown are parsed in the browser. Scanned PDFs require an OCR text layer; empty extraction is reported, not silently accepted. Overlong input is rejected, never silently truncated.

Imported source text is retained with its filename, including on AI failure. AI maps explicit inclusion/exclusion rules to source quotations; each quotation must match normalized source text. Negation and numeric qualifiers stay verbatim. Missing or proposed rules are not settled criteria. Imported grounded rules automatically populate the next tools. Generated drafts require human editing and confirmation before mapping. Mapping is rerun on the exact edited draft, not a stale original AI output.

The create form collects question/framework/type, criteria, outcomes, searches, methods, team/timeline and additional information. Fourteen protocol sections cover the reviewed guidance. Missing facts remain explicitly missing; methodology suggestions are marked proposed. Scoping-review drafts must not claim eligibility for PROSPERO.

Project-specific storage: `aimstep-protocol:<project>`. Handoff writes `aimstep-eligibility:<project>` and `aimstep-search-strategy:<project>`, using their existing schemas. Previous full states are kept in `aimstep-protocol-backups:<project>`. Stale search words/queries are cleared from the active draft; search-run result databases are untouched. Raw search-plan quotes are supplied as context to later keyword and Boolean planning. Supported named databases are preselected; other named sources remain in protocol context. Explicit limits remain verbatim for review, rather than guessing parsed dates or languages. Draft review type is retained.

Handoff detects concurrent changes and rolls back storage writes on failure. Editing revokes confirmation. Stopping or AI failure retains the previous draft. Clear affects the protocol workspace only and requires confirmation. Word and text exports create new files. Protocol state, including source text, is stored in this browser's project workspace, not a new cloud file service. Future exact registry-field updates should be checked against the authenticated live PROSPERO form.


## 2026-10-21: Proposal pipeline recovery

Generate processes every long-material packet, plans the review, writes at most two sections per request (the current local server caps model output at 4096 tokens), then builds and stores the PDF. Summaries and planning use a shared bounded structured-response retry helper; chapter generation preserves valid sections and repairs only missing ones. No verbatim quotation checks apply to proposal drafting. Material reduction stops after at most eight passes rather than looping indefinitely.

A source-keyed in-memory checkpoint retains verified summaries, the plan, batches and partial sections. Retrying Generate after a model or storage failure reuses completed work if the collected inputs are identical. Source changes invalidate the checkpoint; successful PDF storage clears it. Checkpoints survive internal navigation through retained iframes, but not tab refresh/closure. Storage rollback and source-change checks still apply. Connection errors remain visible and retryable; automatic response retries do not silently change providers.

Validation: 37 proposal tests passed, including multilingual long-input recovery through PDF storage, malformed JSON/schema replies at multiple stages, missing chapters, source invalidation, PDF/metadata rollback and retry reuse, Stop, duplicate starts, transport timeout and navigation document retention. Tests use synthetic model responses and a simulated browser DOM/canvas. The optional `AIMSTEP_REAL_PROPOSAL=1 node --test --test-name-pattern='real local model' tests/proposal-workspace-generation.test.cjs` test is included; it was attempted but could not connect from the restricted Node execution environment. Real-model end-to-end acceptance and real-browser navigation verification are not claimed.

## Current browser configuration — 2026-10-21 (no service restart)

Supersedes the earlier two-section serial pipeline: three fixed-key chapter groups, at most two concurrent model calls, no separate model-written plan. `AimstepProposalDrafting.settings.workers` configures the browser concurrency. Source preparation uses a conservative 7,000-token estimate for direct input and 5,000-token packets when reduction is needed; all original author input/criteria remain available in appendices. Same-source checkpoints, Stop, source-change checks and PDF storage rollback remain in place.

This release uses the existing local service and model without restarting or modifying them. It passes the chapter JSON schema in `format` and at the end of the user data; the common system prompt stays identical between chapter groups. Native timing metadata is not available through the unchanged bridge. Research, smoke-test evidence and limits: `.claude/context/artifacts/research-reports/proposal-generation-research-2026-10-21.md`.
