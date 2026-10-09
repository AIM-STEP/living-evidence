# Drafting the manuscript

Implemented 2026-10-09. Two sections: Drafting; Review and export. Generated text is an author-review draft using Cochrane Review organization, not an official Cochrane submission or an editorially approved review.

## Sources reviewed

- Cochrane, How to write a Cochrane review or update: https://www.cochrane.org/authors/how-write-cochrane-review-or-update (accessed 2026-10-09). Current focused-review structure; concise main text, structured abstract and plain language summary; overview of syntheses and included studies (OSIS), tables/figures and supplementary information.
- Cochrane Handbook, Chapter III, Reporting the review: https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-iii (accessed 2026-10-09). Consistency across methods, results, certainty, summaries and conclusions.
- The project GRADE workflow/codebook retain priority for certainty methods. The drafting tool does not calculate or replace evidence ratings.

## Sources and boundaries

Only the current project scope is read. Local storage: protocol, eligibility, search strategies, screening summaries, real certainty workspace and summary. Read-only IndexedDB project lookups: executed searches, title/abstract screening, full-text assessment, extraction, risk of bias, selected analysis run. Raw PDF files are not resent: the previously extracted structured data, source quotes, decisions and numeric results are used. Credentials, binary blobs, historical audit payloads and embedded code are excluded. The CoE demonstration/synthetic workspace is excluded even when selected in the CoE page.

The selected Analysis run supplies deterministic methods and effect interpretations using the existing numerical reporting code. Its signature is compared with current data/plan, and stale results are identified. GRADE values are reported as recorded values pending author verification; the manuscript module does not independently rerun the GRADE engine. Missing results, unresolved rules and unknown author/registration information must be marked, not invented. Planned protocol methods are not evidence of performed work.

Large source bundles are losslessly divided into packets. When needed, AI constructs an evidence digest from every packet; each quoted fact is checked against the source substring. Inputs are bounded for the current 16,384-token local model and its 4,096-token output limit. Oversized digests fail explicitly instead of dropping inputs silently. Sections are drafted in four groups (methods, results/discussion, summaries, declarations/supplements), each with supporting source IDs, followed by a final AI consistency pass in section groups. Missing saved results are not treated as proof that a procedure was never performed; proposed methods remain unconfirmed. References are built from actual project bibliographic metadata rather than invented by the model. Source mapping is an audit aid, not proof that all AI prose is accurate; author review remains required.

## Persistence and operations

New IndexedDB `aimstep-manuscript`, store `projects`, keyed by project scope. Saves draft, instructions, source snapshot, source fingerprint, per-section source IDs, any digests, AI model, review issues, generated/confirmed dates and previous draft history. Legacy local-storage manuscript drafts are migrated on first open. Input edits autosave and revoke confirmation. Generate retains the previous manuscript until a complete new draft is saved. Stop and failures preserve earlier work. Clear asks for confirmation and does not modify upstream tools. Confirmation checks for changed project materials. Word/text exports make new files, with draft/confirmed state and editorial review items.

## Verification

Pure tests cover stage collection, credential and synthetic-CoE exclusion, lossless packets, quoted-fact validation, section/source validation and real-reference deduplication. Browser tests cover project source discovery, local-model generation, editing/persistence/confirmation, export, Stop/error handling and responsive layout. Toolset removes all ripple CSS/listeners, increases desktop grid gap from 20 to 32 px and mobile gap from 12 to 20 px, preserving card dimensions and order.
