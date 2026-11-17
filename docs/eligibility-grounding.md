# Eligibility generation: original-source checks

Method version: `original-source-v2` (2026-11-17).

## Behaviour

The preliminary model pass organizes the framework and asks up to four scope questions. Its proposed rules are retained for audit only and never used as source evidence. Extraction reads the original question and complete extracted document text in bounded chunks; the previous 3,000-character context truncation is removed. PDF page numbers, document identifiers and exact chunk offsets are retained. An `Other` domain can carry explicit report restrictions without inventing a study-design restriction.

An extracted proposition must quote a source passage, retain its numeric constraints, and pass a separate semantic review against both that passage and its surrounding original context. Recognizable source constraints that were not converted are flagged for human review. A second semantic review checks rewritten wording, including its logical scope and possible conflicts. If polishing omits an already reviewed required or prohibited atom, its unchanged proposition can be rendered directly with its source link. Rejected, uncertain, allowed and image-derived claims do not qualify for that recovery path. Both calls use the selected model: they are separate checks, **not statistically independent reviewers**.

Deterministic checks compare common numerical values, bounds, units, temporal direction and roles, and detect selected AND/OR, negation and exception changes. They also check that cited propositions' numerical constraints are not omitted. These checks supplement semantic review; they are not a complete clinical language parser or a formal equivalence proof. Supported unit conversions and unusually expressed conditions can conservatively require human clarification.

Synthesis uses a compact JSON Schema through the existing model endpoint, checks response structure in the application, and retries a malformed structure at most once using the original atoms. Missing dimensions are filled only by empty arrays; reviewed atomic wording provides the omission recovery described above, never invented filler.

Final rules retain their atom links in `ruleEvidence`; atoms retain original source names, page information, offsets and quotations. Surrounding context can be reconstructed from the saved snapshots and offsets, without duplicating every source chunk in storage. Missing or duplicate semantic review results become uncertain. Conflicting identical inclusion/exclusion rules are removed from both sides and flagged. Oversized context fails with a request for a focused excerpt rather than silently losing text or evidence.

The generated topic and Description are derived from accepted rules. Automatic Description updates after rule edits or clarification decisions use the current effective rules. An explicit user edit to Description remains an author decision and is logged rather than labelled as automatically checked.

## Human decisions and images

New clarifications distinguish:

- **Questions:** the author must enter a concrete rule (or explicitly state no restriction) before choosing its inclusion/exclusion treatment.
- **Unconfirmed suggestions:** inactive until the author chooses to use them. Ignoring one never creates a complementary exclusion. Adoption preserves its proposed inclusion/exclusion side.
- **Review notices:** acknowledgement does not turn the diagnostic notice into a criterion.

Outcome interests are not automatically outcome-reporting eligibility requirements. Missing population, central concept or study-design scope is queried rather than filled with invented limits. Pending new-method decisions prevent a completed task status, while navigation remains available.

Image inputs are first transcribed with the selected vision model. Unreadable or uncertain transcription stops generation and preserves the saved draft. Transcribed rules remain inactive suggestions until the author checks the quotation against the original image and explicitly adopts them. A transcript is never labelled as verified original text.

## Records, compatibility and publication

The saved refinement includes original extracted text snapshots and their SHA-256 hashes when Web Crypto is available, method version, resolved model names, requested temperature, prompt/response hashes, rule assessments and author decisions. Actual server sampling settings are labelled as unreported when the response does not provide them; temperature zero is not represented as a reproducibility guarantee. API keys, authorization headers and image base64 payloads are not added to this audit record.

Source excerpts are available in the preview and Word export. Existing saved drafts remain intact and show that the new checks require regeneration. Original attachment files must be reattached after a browser reload before regenerating an attachment-based draft; Clear explicitly permits starting again from text alone. The existing Save, Clear, generation-method lock, embedded editors and downstream handoff are preserved.

The normal GitHub Pages main-branch deployment ships the HTML and shared JavaScript changes. No backend configuration or model change is required.

## Verification and limits

`node tools/test_eligibility_grounding.cjs` exercises the actual page code with a controlled model transport, including forged source quotations, omitted constraints, reversed bounds, changed units, temporal direction, scope swaps, logical combinations, uncertainty, image adoption, suggestion dismissal, save/reload and Description consistency. Its fixture has separate development/test sections and a SHA-256 lock to make subsequent changes explicit. These are synthetic regression cases developed alongside the implementation, **not an untouched independent test set or an expert-validated clinical benchmark**.

Live testing also exposed a syntactically valid but structurally incomplete synthesis response. Schema-constrained synthesis, application-level structure checks and unchanged-atom recovery address this failure; recorded live outputs are replayed through the updated pipeline in addition to controlled-transport tests.

On 2026-11-17, targeted live checks with `gemma4:31b-it-q8_0` accepted the correct age/follow-up paraphrase and rejected the reversed age bound and changed follow-up unit. This small check is not full end-to-end clinical validation; an initial three-rule request exceeded a 30-second verification-client timeout. Production retains its existing ten-minute generation limit. Browser visual verification and the jsdom-dependent routing test were unavailable in this environment (jsdom is not installed).

A separate, expert-adjudicated evaluation across real review topics remains necessary before making accuracy or workload-reduction claims. Freeze those projects before prompt tuning, keep development and evaluation topics separate, repeat model runs, record disagreements and measure downstream false exclusions as well as rule correctness and omissions. Do not publish synthetic regression pass rates as clinical accuracy.

The broader `test_protocol_imports.cjs` check still fails its pending-background-import assertion in the unchanged Proposal workspace code; this is separate from eligibility generation. Relevant eligibility, embedded-editor, clearing, task-status and screening prompt checks are run for this change.

## Research informing the change

- Parkington et al. (2026), task-specific GPT-5 evaluation, including eligibility criteria development: https://doi.org/10.1371/journal.pdig.0001666
- Behrouzian et al. (2026), linguistic polarity and screening architecture: https://doi.org/10.3390/info17050449
- ISPOR Special Task Force (2026), good practices for GenAI-assisted reviews: https://doi.org/10.1016/j.jval.2026.08.007
- Lai et al. (2026), reporting and reproducibility safeguards: https://doi.org/10.1016/j.jclinepi.2026.112383
- Datta et al. (2024), extraction of existing clinical trial criteria, rather than validation of de novo review criteria: https://doi.org/10.1093/jamia/ocad218
