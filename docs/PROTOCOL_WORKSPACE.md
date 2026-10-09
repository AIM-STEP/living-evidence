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
