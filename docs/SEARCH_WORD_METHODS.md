# Search-word generation — 7 October 2026

## Evidence reviewed

- [Cochrane Handbook, chapter 4, version 6.5.1](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-04): identify core search concepts; combine free text with controlled vocabulary; avoid unnecessarily restrictive comparator/outcome blocks; use validated design filters where appropriate.
- [Wang et al., SIGIR 2025](https://arxiv.org/abs/2505.07155): prompt design, output constraints and query validation affect automatic Boolean-query effectiveness. Results do not establish performance for this application's model or topics.
- [Wang et al., AutoBool, EACL 2026](https://aclanthology.org/2026.eacl-long.68/): retrieval-performance feedback can train smaller models for Boolean generation. This release does **not** install AutoBool weights or implement reinforcement learning; no equivalent accuracy claim is made.
- [Fang et al., JAMIA 2026, generative query expansion evaluation](https://academic.oup.com/jamia/article/33/6/1121/8571780): the abstract reports heterogeneous expansion effects, including differences by document type. Full text was not accessible during this review; only abstract-level findings inform the decision to constrain expansion and avoid assuming improvement.
- [NLM MeSH vocabulary](https://www.nlm.nih.gov/mesh/meshhome.html) and [entry terms](https://www.nlm.nih.gov/mesh/intro_entry.html): official descriptors and associated vocabulary are external evidence, not proof that every term fits a particular review.
- [PubMed User Guide](https://pubmed.ncbi.nlm.nih.gov/help/): field-tagged and truncated searches differ from automatic term mapping; wildcard prefixes require at least four characters.

## Implemented workflow

1. Local model generates core entities plus scoped free-text synonyms, established near-synonyms, abbreviations/full forms, spelling and historical variants. The active framework is passed explicitly; Chinese equivalents are requested when a Chinese database is selected. The application normalizes whitespace/case duplicates and rejects query syntax or unsafe short truncation from generated lists.
2. NLM ESearch/ESummary retrieves vocabulary for up to four core entities per concept. A descriptor must have a real MeSH identifier and an exact normalized match to its preferred or entry term. Automatic query translation alone no longer creates a supposedly verified heading. Supplementary concepts are not automatically treated as descriptors.
3. A second local-model stage reviews an ID-bound pool of model candidates, NLM descriptors and entry terms against the original rule and question. Descriptor scope notes accompany candidates. The model cannot introduce a term outside the pool. This is automated relevance review, not human confirmation.
4. PubMed title/abstract counts provide retrieval signals. Zero-hit terms are retained; unavailable/malformed responses are not recorded as zero. Chinese terms are explicitly marked untested against their target database. Counting does not prove synonym equivalence, recall or precision.
5. Store method version, seeds, source descriptors/URIs, decisions, rejected candidates, count results, timestamps and partial/failure status on each concept in project-scoped browser storage. Detailed notes stay off the page. Existing nonempty lists and edits made during verification are preserved; Clear cancels active generation.
6. Verified MeSH can enter PubMed/Europe PMC/Ovid drafts. MeSH is no longer copied into Embase as if it were Emtree; target-vocabulary mapping there remains manual. Existing RCT filter handling is preserved.

## Failure and resource policies

No vocabulary match leaves free text available. If contextual review fails or rejects every text candidate, keep the initial draft with an incomplete-review status and add no unreviewed headings. If NLM/PubMed is unavailable, preserve terms and record partial verification. Relevance reviews use batches of at most 24 candidates, with one retry for invalid/incomplete output. Per-run lookup/count caches avoid duplicate requests; the existing NCBI rate limiter remains in use. Expansion is bounded to 40 final terms per concept. Exact vocabulary matching deliberately leaves uncertain mappings unresolved. No embeddings, training, licensed thesaurus service, new API key or subscription is required.

## Validation and limits

Synthetic regression tests cover actual completion orchestration, semantic rejection, descriptor provenance, truncation, zero-hit retention, invalid API responses, review/network failures, in-flight edits and cancellation. Live testing with gemma4:31b-it-q8_0 completed a synthetic PIS case (fibromyalgia, pregabalin, randomized trials), including both model stages, NLM descriptors, PubMed counts and persisted audit. These are implementation checks, not a benchmark demonstrating improved recall. A representative, independently adjudicated reference set is still required to quantify retrieval quality. Previously generated or manually edited nonempty lists are not automatically rewritten; use Clear and Start to regenerate with this method.
