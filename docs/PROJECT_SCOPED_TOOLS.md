# Project-scoped tools (2026-11-17)

All ten tools remain scoped to a registered project. Project navigation lists Proposal and Report first, followed by the original eight workflow tools: Eligibility criteria, Search strategy, Title and abstract screening, Full-text assess, Extraction, Risk of bias, Analysis and Certainty of evidence. Report is the display name of the existing manuscript/evidence-summary tool. Its `drafting-manuscript.html` URL and saved manuscript storage keys are unchanged.

## Entry and registration

- The global Toolset dropdown and standalone writing links have been removed. The header retains branding, language and account controls. Proposal and Report appear only inside the selected project; the tool selector hides them until its project is verified. A legacy/direct tool URL without an explicit project still shows empty controls, even if a previous project is remembered in the session. Task startup scripts are not executed, so the preview does not read or create a task workspace or request model work.
- Clicking or editing a preview control opens `index.html?view=new-project&returnTo=<tool file>`. The return destination is restricted to the ten known tool files. Registration creates a project through the existing authenticated project service (or the existing local-only fallback where installed); success opens the requested tool in that new project. No original operation is executed automatically.
- Project workspace links, tool-to-tool links and the Projects backlink explicitly carry `projectId`. Legacy `project` and `id` aliases are normalised; conflicting ids, blank ids and the old reserved `default` workspace are rejected.
- `app/project-access.js` checks the explicit id against the shell's settled project registry before starting a task. A slow registry or connection failure is not treated as an empty list. Nested criteria editors use the same top-level registry. Unknown or deleted projects cannot start task code.
- Opening a project card opens its summary, including in a new tab. Project ids remain in scoped public URLs so refresh and new tabs do not depend on a remembered session selection.

## Tool independence

No project completion counter or preceding tool unlocks another tool. All ten project actions and the tool selector remain available in any order. Existing direct imports and manual editors remain available. Tool-local input validation still applies: an analysis needs data, screening needs records and saved rules, and a formal AI screening run retains its own Pilot approval checks. Those checks do not require a different tool to be completed.

The project name appears once, in its original project card, with an inline progress bar. The former Project Summary / Project tools headings and duplicate project-name line have been removed. The ten tool rows sit immediately below the selected project, with Proposal and Report above the eight core tools. The `n/10` counter counts displayed tools with saved work, not completed research tasks; writing activity is included. Each tool row shows its name and a compact status. Expanded descriptions, dashboards and tables have been removed from project navigation. Clicking the tool name, status or arrow directly enters its project-scoped operation page; there is no intermediate expanded panel. Opening a page alone does not mark a research task complete.

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

The checks execute the actual ten tool preview/startup scripts, shell router and project creation controller in isolated synthetic DOMs, and verify registry waits/recovery, nested editors, safe registration returns, free tool order, task counts, scoped URLs, legacy aliases, data isolation, readonly storage and failure reporting. Additional checks cover all ten direct tool-name destinations, absence of expanded navigation content, periodic and save-event progress updates, paused hidden-list scans and preservation of the running tool frame. Layout checks also cover the inline project-name progress bar, one shared progress widget, ten-tool counting, project switching, title search, collapse and registry-list replacement without losing the tool list or progress widget. Writing-entry checks cover project-only visibility before registration, the Proposal/Report-first order, the removed global menus, Report localisation and preservation of existing draft data. Existing navigation, project menu, screening conflict/export, prompt/clear/source, full-text AI review, eligibility editor, extraction, risk-of-bias, analysis, proposal creation and certainty checks were also run.

Browser connection was unavailable in this environment; no live visual or real-account interaction verification is claimed. Two older suites (`test_protocol_imports.cjs`, `test_eligibility_confirmed_rules.cjs`) still have assertion failures, reproduced with the unchanged pre-update runtime sources: imported analysis state `failed` vs `pending`, and an outdated literal `Description` heading assertion. They are not used as passing checks for this release.
