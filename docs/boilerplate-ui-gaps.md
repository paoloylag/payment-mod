# Boilerplate UI gap register

## Isolated printable document layout

- **Observed:** 2026-10-30
- **Coverage:** App-only implementation; shared boilerplate coverage unverified.
- **Source:** Payment Module voucher print action in `src/voucher-print.js`.
- **Gap:** The application has multiple document types with different paper sizes, but a shared print-document helper is not available. Global `@page` rules can override one another.
- **Reusable behavior:** Clone a selected document into an isolated print frame, remove interactive controls, wait for fonts, and apply a document-specific paper size and margins.
- **Variants needed:** Letter/A4, portrait/landscape, light-theme print colors, and safe single-page overflow behavior across desktop browsers and iPad Safari.
- **Reuse candidate:** Extract `printVoucher` into a configurable tenant-boilerplate print helper after shared boilerplate and UI Lab coverage are inspected.
