
## 2026-11-03 — Dark surface token parity
- Coverage: implemented in boilerplate; app override drift corrected.
- Source: payment module shared theme, `src/boilerplate-shell.css`.
- Evidence: tenant boilerplate `src/styles.css` `.app.dark` and `.signed-out.dark` define charcoal #111318, panels #191d25/#202632, text #f8fafc and muted #a5adba.
- Action: reuse these existing tokens for pages, notifications, fields and body-mounted dialogs. No new shared component required. Preserve semantic status colors and responsive layouts.

## 2026-11-10 — Recoverable async form lifecycle
- Coverage: app-only behavior candidate; existing inline-error controls are implemented in boilerplate. Shared async save/retry/input-retention lifecycle coverage is unverified, not a confirmed missing component.
- Source: Payment Module administration, master-data, login and Finance setup; `src/prototype.js` (`submitRecoverableForm`, `bindIdentityForms`, `bindMasterData`, `bindRequestSettings`).
- Evidence: tenant boilerplate `src/App.tsx` form/dialog examples and upload-error role alerts; `src/styles.css` theme/error styles. Payment Module shared error-page candidate is already documented in `docs/boilerplate-ui-alignment.md`.
- Reuse candidate: save lifecycle wrapper retaining live fields, preventing concurrent submits, focusing an accessible inline error and restoring controls after failure. Keep values in memory/DOM; never persist passwords. Domain write, stale-version and idempotency rules remain app-owned.
- Requirements: light/dark contrast, wrapped long errors, mobile/tablet modal scrolling and keyboard recovery. Next step: verify shared lifecycle coverage before proposing extraction; this audit changes only Payment Module.
