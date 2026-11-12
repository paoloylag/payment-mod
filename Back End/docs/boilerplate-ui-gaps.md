
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

## 2026-11-12 — Confirmation modal keyboard parity
- Coverage: existing native modal implementation in tenant boilerplate; APS shared action prompt has app-level behavior drift, not a missing base control.
- Source: APS src/prototype.js actionPromptModal/bindActionPrompt (around787–826); root-assisted manual Finance Manager Vendor Administration → Deactivate.
- Observation: Shift+Tab from Cancel reached background Delete; Escape closed prompt but focus returned to BODY. Native dialog examples in tenant boilerplate src/App.tsx1241–1245 use showModal().
- Reuse candidate: adopt existing native dialog semantics or a centralized equivalent providing inert background, Tab containment, opener restoration, retained draft/busy/error state and nested-modal handling. Keep domain authorization and approval rules app-owned.
- Requirements: phone/tablet scrolling, light/dark focus visibility, Escape and keyboard restoration; actual browser regression required. This review recommends only; no component was implemented. See docs/ui-review-2026-11-12.md R01/U04.

### 12 November follow-up — APS confirmation parity repaired

APS now uses the existing native dialog/showModal pattern with an inert background, explicit Tab wrapping and opener restoration. Prompt values, destination and caret/focus are captured across unrelated app renders. Responsive Actions menus are reopened before restoring their invoking button. Node helper tests and actual delayed-notification-refresh browser tests exercise this behavior at375/768/desktop, alongside returns/declines and nested supplier-document corrections. This repairs app-level parity; no new boilerplate control or shared-project implementation was introduced. See [fix verification](ui-fixes-2026-11-12.md).
