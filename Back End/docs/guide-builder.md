# LIFE College guide builder

Reviewed: 10 November 2026.

## Use in the app

Open **System Guide**. The existing role-filtered procedures remain searchable. **Download HTML** produces a portable LIFE College guide for the displayed audience; **Print / Save PDF** prints the same shared content with A4 styling. Export includes the entire role guide, independent of current search/disclosure state. Files contain instructions only, not request, account or user records. They are documentation, not authorization or Finance acceptance.

## Build offline guides

Run `pnpm guides:build` from Back End. The command writes an all-role handbook plus role-specific HTML files to outputs/LIFE-College-Payment-Module-*-Guide.html. These files embed the original LIFE College International logo and CSS, require no server or remote fonts, and include Print / Save as PDF. Nothing is uploaded or sent.

## Shared source and maintenance

- src/guide-data.js: revision, audience labels, procedure sections and stage summaries. The app, download, print and batch build read this same content.
- src/guide-builder.js: escaped standalone document renderer and browser download.
- src/guide-brand.js: embedded official red logo and approved guide CSS adapted from the life-college-guides skill assets. Original assets were preserved.
- src/guide-print.js: isolated A4 print frame using the shared renderer.
- scripts/build-guides.mjs: reproducible batch builder.

When a workflow changes, update guide-data.js and its revision, update current-system-status.md and the relevant phase summary, rebuild, and check in-app search, downloads, mobile layout and printing. Retain dated validation evidence as historical records. Do not replace source instructions with a separately edited generated HTML copy.

The guide uses the LIFE College guide-builder design for portable documents; the application keeps its existing UI styles. No application admin guide editor or screenshot recorder is introduced. This integration is a deterministic local builder, not a runtime call to a Codex skill. Current guides are text-based; no fabricated or unreviewed screenshots are included.

## Validation — 10 November 2026

Production build and generated-guide build passed. The isolated Chrome System Guide test passed: role content, no-results search, complete HTML download, embedded 2400px official logo, no remote src/href dependencies, 375/768/1440px layouts and print-frame content. Generated phone and A4 print-media screenshots were visually reviewed. The print check used browser print-media emulation, not physical printer or PDF pagination acceptance. No screenshots are embedded in the text guide; workflow screenshots can be added later after capture/review.

Evidence: outputs/guide-builder-browser.log, outputs/guide-builder-build.log and outputs/portable-guide-*.png. Tests used payment_module_e2e; no local demo data was reset. Earlier phase regression evidence remains dated and was not rerun for these documentation/guide-only changes.
