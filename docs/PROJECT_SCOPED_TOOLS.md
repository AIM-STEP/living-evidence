# Project-scoped tools (2026-11-17)

All ten tools remain scoped to a registered project. Project navigation lists Proposal first, then the original eight workflow tools, and Report last. The eight workflow tools are: Eligibility criteria, Search strategy, Title and abstract screening, Full-text assess, Extraction, Risk of bias, Analysis and Certainty of evidence. Report is the display name of the existing manuscript/evidence-summary tool. Its `drafting-manuscript.html` URL and saved manuscript storage keys are unchanged.

## Entry and registration

- The original Toolset dropdown is restored in its original header position with its original eight tools, order, icons and interactions. Standalone writing links remain removed. The header also retains branding, language and account controls. Global Toolset entries browse empty unscoped tools; project rows retain their explicit project context. Proposal and Report appear only inside the selected project; the tool selector hides them until its project is verified. A legacy/direct tool URL without an explicit project still shows empty controls, even if a previous project is remembered in the session. Task startup scripts are not executed, so the preview does not read or create a task workspace or request model work.
- Clicking or editing a preview control opens `index.html?view=new-project&returnTo=<tool file>`. The return destination is restricted to the ten known tool files. Registration creates a project through the existing authenticated project service (or the existing local-only fallback where installed); success opens the requested tool in that new project. No original operation is executed automatically.
- Project workspace links, tool-to-tool links and the Projects backlink explicitly carry `projectId`. Legacy `project` and `id` aliases are normalised; conflicting ids, blank ids and the old reserved `default` workspace are rejected.
- `app/project-access.js` checks the explicit id against the shell's settled project registry before starting a task. A slow registry or connection failure is not treated as an empty list. Nested criteria editors use the same top-level registry. Unknown or deleted projects cannot start task code.
- Opening a project card opens its summary, including in a new tab. Project ids remain in scoped public URLs so refresh and new tabs do not depend on a remembered session selection.

## Tool independence

No project completion counter or preceding tool unlocks another tool. All ten project actions and the tool selector remain available in any order. Existing direct imports and manual editors remain available. Tool-local input validation still applies: an analysis needs data, screening needs records and saved rules, and a formal AI screening run retains its own Pilot approval checks. Those checks do not require a different tool to be completed.

Every registered project's tool selector and Previous/Next buttons follow the same order as its project list: Proposal → Eligibility criteria → Search strategy → Title and abstract screening → Full-text assess → Extraction → Risk of bias assessment → Analysis → Certainty of evidence → Report. Proposal has no previous tool; Report's next button returns to the project. Both writing pages use the same navigation. Adjacent and direct jumps retain the explicit project id, and Eligibility's existing save/cancellation handler remains in place. Before project verification, previews expose only the original eight tools; verification refreshes the selector and adjacent links together. The legacy certainty workspace no longer owns the shared Next link, so delayed task startup cannot overwrite its Report destination.

The project name appears once, in its original project card, with a plain `x/10` completed-tools counter; the project progress bar is removed. The former Project Summary / Project tools headings and duplicate project-name line have been removed. The ten tool rows sit immediately below the selected project, with Proposal first, the eight core tools next and Report last. The `x/10` counter counts only tools with actual saved outputs meeting their completion rule. Opening a tool, creating its default workspace, setting options or entering input alone does not complete it. Activity and completion are separate values. The row checkmark uses the same completion rule as the counter; unfinished work keeps its detailed progress text. Each tool row shows its name and a compact status. Expanded descriptions, dashboards and tables have been removed from project navigation. Clicking the tool name, status or arrow directly enters its project-scoped operation page; there is no intermediate expanded panel. Opening a page alone does not mark a research task complete.


Completion rules:

| Tool | Required saved result |
| --- | --- |
| Proposal | Nonempty saved proposal document text; form settings or upload metadata alone do not count. |
| Eligibility criteria | At least one usable saved rule according to the existing criteria-library validator; untouched example rules are excluded. |
| Search strategy | A saved usable strategy, retrieved/imported records, or a successfully completed search with its executed query (including zero hits). Dirty/stale query drafts and failed runs alone do not count. |
| Title and abstract screening | Native completed flag, every source record decided, no pending conflicts and all required human checks saved. |
| Full-text assess | Native completed flag, all assessed reports decided, no unresolved conflicts and all required human checks saved. Reports not retrieved remain handled by the tool's existing PRISMA policy. |
| Extraction | At least one current report, with confirmed extraction for every current report. Orphaned or historical confirmations are ignored. |
| Risk of bias | At least one current report/outcome assessment, with every current assessment confirmed. Orphaned or historical confirmations are ignored. |
| Analysis | The selected/latest saved run contains calculation results. Imported input rows, a plan, an empty run stub or a completed-progress animation do not count. |
| Certainty of evidence | At least one comparison, all comparisons complete, no errors/blocked/incomplete items, and the saved real-data record count agrees with the summary when present. |
| Report | Nonempty saved report text with its native confirmation marker. Instructions, an unconfirmed draft or cleared-draft history do not count. |

The counter is recomputed from stored results on each refresh; it does not write completion flags on visits. Clearing results, reopening required reviews or withdrawing report confirmation removes the corresponding completed count. Unreadable task data is excluded and the row displays a read error. A total read failure displays `—/10` rather than inventing a numeric completion count.

While project navigation is visible, progress refreshes every two seconds and after saved-work events (coalesced for 100 ms). The current label stays visible while it refreshes. Storage scans pause while a tool operation page is visible; that page keeps its native live progress. Returning from the project list to the same mounted tool does not reload its iframe or restart its task. Refreshing progress does not start model calls.

## Status and storage

`app/project-task-status.js` reads the selected project's existing localStorage summaries and IndexedDB records. Counts cover saved criteria, search results/runs, screened/pending reports and unresolved conflicts, full-text decisions, confirmed extraction reports, confirmed risk-of-bias assessments, saved analysis runs, certainty assessments and writing drafts. Corrupt or unreadable storage is reported rather than presented as an empty task; absent task data means Not started.

IndexedDB reads use readonly transactions. Opening the project overview does not create missing databases, initialise other tasks, call models or alter saved decisions. Concurrent reads are shared; a response for a previously selected project cannot replace the current project's summary. These statuses describe data available in the current browser, consistent with the tools' existing storage; this change does not add cross-device result synchronisation.

Existing registered project keys, saved results, model policies and Pilot approval versions are unchanged. Legacy anonymous/default data is retained on the device and is not silently assigned to an arbitrary project. No research records are deleted or rescreened by this change.

## Verification

New checks:

```sh
NODE_PATH=<directory containing jsdom> node tools/test_project_task_access.cjs
NODE_PATH=<directory containing jsdom> node tools/test_project_task_routing.cjs
node tools/test_project_task_status.cjs
```

The checks execute the actual ten tool preview/startup scripts, shell router and project creation controller in isolated synthetic DOMs, and verify registry waits/recovery, nested editors, safe registration returns, free tool order, task counts, scoped URLs, legacy aliases, data isolation, readonly storage and failure reporting. Additional checks cover all ten direct tool-name destinations, absence of expanded navigation content, periodic and save-event progress updates, paused hidden-list scans and preservation of the running tool frame. Completion checks cover all ten positive output cases, visited/configured/default-only workspaces, partial reviews, unresolved conflicts, empty calculations, cleared results, unconfirmed reports and read failures. Layout checks also cover the inline plain project-name completion counter, one shared counter widget, ten-tool counting, project switching, title search, collapse and registry-list replacement without losing the tool list or progress widget. Writing-entry checks cover project-only visibility before registration, the Proposal-first / Report-last order, the restored eight-tool Toolset menu, hidden global writing entries, Report localisation and preservation of existing draft data. Existing navigation, project menu, screening conflict/export, prompt/clear/source, full-text AI review, eligibility editor, extraction, risk-of-bias, analysis, proposal creation and certainty checks were also run.

Browser connection was unavailable in this environment; no live visual or real-account interaction verification is claimed. Two older suites (`test_protocol_imports.cjs`, `test_eligibility_confirmed_rules.cjs`) still have assertion failures, reproduced with the unchanged pre-update runtime sources: imported analysis state `failed` vs `pending`, and an outdated literal `Description` heading assertion. They are not used as passing checks for this release.
