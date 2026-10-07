# Editable title and abstract screening criteria

Screening criteria is a project-scoped editor separate from the original eligibility criteria. Each element has an editable name, Inclusion, Exclusion, a delete button and no outer frame. Initial text comes from the complete eligibility rows. An empty exclusion remains empty rather than inventing restrictions. Add criteria sits beside the close button and opens a picker of framework and source elements. Question framework offers PICO, PECO, PCC, PICo and Other, matching Search strategy. Framework changes update available choices without automatically adding or deleting existing elements. Custom element is not offered. Clear empties the draft after confirmation; Save applies it. Empty configurations can be saved but cannot start a pilot.

The editor stores version 2 elements in the screening workspace. It never writes edited text back to upstream eligibility or search strategy storage. Full-text handoff continues to carry the unchanged complete eligibility criteria, without stage-assignment metadata. The visible interface has no full-text stage controls or help popover; the explanatory text is hidden developer content.

Pilot, formal screening, calibration and exclusion validation use the listed elements and their saved edited rules. Deleted elements cannot justify exclusion. Legacy disabled elements remain inactive and are omitted from the editor; they can be added explicitly from the picker. Missing information is retained rather than treated as contradictory evidence. Exclusion still requires a known criterion and an exact source quote.

Changed settings archive current pilot/formal assessments, retain all records for re-screening and reset approval. Original criteria changes require a new Save but do not overwrite custom edited elements. Save checks for concurrent upstream changes; storage failures restore the prior workspace. Section Clear actions preserve saved screening criteria. JSON results include the screening configuration.

Legacy version 1 stage assignments remain readable until saved through the new editor. Migration groups them by original element, fills complete original Inclusion/Exclusion text, and enables an element when any of its old conditions was active. Saving confirms the change and archives dependent results.

## Methodological basis

- Cochrane Handbook chapter 4: over-inclusive title/abstract selection followed by full-text assessment. https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-04
- Cochrane Handbook chapter 3: absent outcome reporting does not establish absence of measurement. https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-03
- PRISMA 2020 expanded checklist: report automation in study selection. https://www.prisma-statement.org/s/PRISMA_2020_expanded_checklist-yc78.pdf

This interface is a product design choice, not a prescribed guideline interface or a claim of validated accuracy.
