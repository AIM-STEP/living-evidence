# Extraction included studies

Updated 2026-10-08.

- Included studies synchronizes from the current project's `aimstep-rob-input` hand-off on page load and after focus/visibility/storage updates. Only the included records published by Full-text assess are consumed. Existing extraction values remain in `state.studies` even if an upstream record is subsequently removed.
- The Full-text assess hand-off now preserves the original record metadata, stable source number and PDF filename. Older hand-offs are enriched from the same project's saved full-text workspace.
- Records use the preceding tool's card layout: stable number, first author given name/year, title, authors, journal/volume/issue/pages, linked DOI, Abstract and Full text. Full text opens initially; the two sections close one another. The original PDF file name opens the original Blob in the PDF reader. Each card has only a delete (×) action on the right; the status, Extract action and AI/reviewer toolbar were removed. Deleted UIDs are saved per extraction project and filtered from later upstream syncs. PDFs and extraction data stay stored; explicit re-upload of a local PDF restores that local record.
- Import from local opens a multiple-PDF file picker. Bundled pdf.js reads text and metadata on the user's device. Titles fall back to the file name when metadata is absent; unknown bibliographic fields are not invented. Scanned PDFs are retained for manual extraction without pretending text was extracted or automatically running OCR.
- PDF bytes and extracted chunks are stored in the existing `aimstep-fulltext-docs` IndexedDB under the project scope and an `extraction-local-<SHA256>` UID. Local records are persisted in `aimstep-extraction`, marked `extractionOrigin: local`, and cannot be removed by upstream synchronization. Local display numbers carry an L prefix to distinguish them from upstream numbers.
- Exact duplicate PDFs are skipped, including PDFs already saved for upstream included reports. Per-file failures are reported; successful files stay available. Uploads and synchronization do not start an AI call.
- Browser-local storage behavior is unchanged: refresh retains records and PDF bytes; other devices do not share this storage automatically.

Validation: synthetic source merge tests; inline script parsing; full-text stage-save regression; isolated browser upload of a valid one-page synthetic PDF; bibliography/number display; original PDF opens; duplicate upload skipped; refresh persists; an empty upstream selection leaves the local PDF intact; Extract opens the extraction form. Mobile layout screenshot reviewed.

## Extraction form sections

The form is organized as Baseline information, Participant, Intervention and Outcome. Existing fields keep their IDs and saved extraction values; legacy labels are categorized without deleting fields. The first three sections support adding/removing fields independently, and Outcome retains typed outcome and time-point configuration. Tests cover legacy classification and custom section preservation; the browser add-field flow and compact mobile layout were checked.

The form now also includes Other information. One shared Question framework row (PICO, PECO, PCC, PICo, Other) and Clear / Add section sit above all five sections. Framework selection is saved and included in extraction prompt context; it does not silently rename or remove the five information sections. Each section has a remove ×; its schema is archived and can be restored with Add section, keeping IDs and extraction values. Clear requires confirmation and removes all active sections; an explicitly empty section list persists across reload and is not repopulated by upstream synchronization.

The Network dataset panel and its node mapping/export controls have been removed from Extraction. The existing background hand-off to Analysis and stored extraction data remain intact.
