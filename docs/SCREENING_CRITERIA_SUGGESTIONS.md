# Local-model title/abstract screening cues

Research and implementation: 2026-10-08.

## Sources reviewed

- [Cochrane Handbook chapter 4, updated March 2025](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-04), section 4.6: title/abstract selection should be inclusive; remove clearly irrelevant reports and assess potentially eligible reports further. Application: missing reporting or absent keywords cannot establish exclusion.
- [Development and evaluation of prompts for a large language model to screen titles and abstracts in a living systematic review, BMJ Mental Health (2025)](https://doi.org/10.1136/bmjment-2025-301762). Publisher search abstract reviewed; full page returned 403. The study supports testing and refining prompts grounded in eligibility semantics; results are context-specific. Application: reviewer checks the draft and the existing pilot remains necessary; no claim of a universally best word list.
- [Understanding LLMs in Title-Abstract Screening: From Disagreements to Recommendations (June 2026)](https://arxiv.org/abs/2606.17588). Preprint, not treated as established guidance. Identifies ambiguous boundaries, keyword overemphasis and incorrect topic inference. Application: compact phrases retain logical relationships and decision boundaries, rather than literal word-matching exclusion.

These findings inform the prompt shipped with the application. The runtime local model does not browse or independently verify current literature or controlled vocabularies.

## Existing patterns and decisions

- `app/screening-stages.js` already models editable elements, inclusion/exclusion, framework and saved source signatures. Suggestions retain every source element, IDs and titles; human Save continues through the existing validation, archive and pilot reset path.
- `app/online-model.js` and Search strategy already route local generation through the authenticated online gateway. This feature explicitly sends `provider: local` to that gateway on the public site, or the local helper on local pages. The screening provider remains TypeSafe.
- `app/screening-criteria-suggestions.js` contains versioned research-informed prompt, output schema and strict element validation. A direct array response is accepted from local models, but missing/duplicate/unknown elements and empty required rule sides are rejected.
- First open without saved screening criteria generates a draft; a successful suggestion is cached per project and eligibility signature. Draft storage is separate from active screening criteria. Existing saved human criteria are never automatically rewritten.
- Generated phrases remain editable under Inclusion/Exclusion. They preserve alternatives, conjunctions, negation, exceptions, thresholds and units by prompt instruction. Such semantic fidelity is not provable by schema checks; reviewer checking and pilot validation remain required.
- Local model failure or cancellation shows a retryable error and does not populate copied original sentences as a fallback. Generate/Stop are available during initial drafting; Generate can replace an unsaved draft only after confirmation.
- Source snapshot, generated elements/rationale, local model, prompt hash/version and timestamp are stored with the workspace as `screeningStagesSuggestion`. Original eligibility criteria remain intact. Cache is ignored after the eligibility signature or prompt version changes.
- Pilot and formal TypeSafe prompts carry a stage policy: semantic cues, OR alternatives, preserve AND/negation/thresholds; keyword absence is not exclusion evidence.

## Verification

- Synthetic local inference: `gemma4:31b-it-q8_0` returned all three elements with condensed cues, alternatives and age threshold. Initial response was a fenced direct JSON array; parser normalization was added and the same response passed validation. This checks connectivity/format, not clinical screening accuracy.
- `node tools/test_screening_suggestions.cjs`: schema boundaries, forced local provider via public gateway, draft-only persistence, cache invalidation, upstream changes, storage rollback, cancellation and replacement guard.
- `node tools/test_screening_stages_save.cjs`: existing save/archive/pilot reset and rollback.
- Isolated browser project: first-open auto-generation, editable populated fields, Save, and reopen without another model call or overwritten edits.
