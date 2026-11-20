
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

### 2026-11-12 follow-up — request attachment failure recovery
- UI engineer reviewed upload feedback at the user's request. Existing boilerplate upload validation and inline alert controls are implemented; no missing base component identified.
- APS now adds filename/slot context, accepted-format hints, inline recovery and partial-save feedback. Failed pending files are retained for remove/replace and unchanged failures do not repeat automatic save attempts. Client picker checks supplement strict server media/content checks.
- Reuse candidate remains the existing recoverable async lifecycle: shared persistent failed-file state, explicit retry and accurate partial-success messaging. This extension is app-only; shared lifecycle coverage remains unverified. Source: `src/document-upload.js`, `src/prototype.js`, document router.

## 2026-11-12 — Supplier summary card parity
- Coverage: underlying patterns implemented in tenant boilerplate; APS presentation aligned. No missing base component identified.
- Evidence: tenant `src/styles.css` ops-card (2924ff), upload-document-row (2294ff); `src/App.tsx` document checklist (1200). APS reuses its shared preview-detail-list/status-pill/button tokens and adapts the existing card/checklist hierarchy for a request-bound supplier summary.
- Result: header with Edit action and saved state; mobile-first metadata grid; Attached/Missing document rows and concise footer. Domain validation remains in APS. No changes to the boilerplate are required.

## 2026-11-12 — Approved APS Finance workspace variants
- Coverage: underlying tabs, disclosures, dialogs, badges and document viewer are implemented in tenant boilerplate. Rounded tinted Finance tabs and bold crimson bordered accordion headers are intentionally app-only variants approved by the user; they are not missing base controls or defects requiring reversion.
- Source: APS request detail Finance workspace; `src/boilerplate-shell.css:2685–2722`, Tax & Withholding / Accounting / Voucher & Payment / Approval & History.
- Boilerplate evidence: `src/App.tsx:1266–1276` UI Lab tabs/accordion (labelled Baseline); `src/styles.css:2698` lab-tabs, `:2748` lab-accordion. Existing sticky modal/body/footer at2408–2418 and status-badge at1640 cover the encountered reusable primitives.
- Reuse candidate: if desired, document an optional bordered disclosure and tinted tab variant in the boilerplate with light/dark, selected/focus/disabled, nested disclosure,375px horizontal tab scrolling and768px coverage. Do not promote APS workflow or accounting logic.
- Audit result: expanded Finance sections and voucher preview were inspected in the actual browser; remaining app-level spacing, status and metadata drift is listed in [parity audit](boilerplate-parity-audit-2026-11-12.md). No shared boilerplate implementation was changed and no gap was marked resolved by this sweep.

## 2026-11-20 � Request select open-menu parity

The tenant boilerplate already implements themed custom-select trigger/menu/selected states in src/App.tsx (Program control) and src/styles.css (.custom-select). APS previously styled only native select fields; their operating-system option popup remained unthemed. This is an APS adoption gap, not a missing boilerplate component. Request-form selects now use src/themed-select.js, retaining native values/events for existing workflows and applying the shared light/dark tokens, with arrow/Home/End/typeahead/Escape/Tab behavior and disabled options. Other application surfaces retain native selects and are outside this focused request-form change. Keyboard implementation is an app DOM adapter to the existing visual pattern.

## 2026-11-20 � Accessible information tooltip

Boilerplate src/App.tsx UI Lab and styles.css .lab-tooltip provide a hover-only baseline. APS Date to Liquidate uses the same informational pattern with an icon button, aria-describedby, focus/tap opening and Escape/blur dismissal. This is an app-local keyboard/touch adaptation; shared parity remains partial until that behavior is adopted and showcased in the boilerplate. Reuse candidate: field-help icon tooltip, theme tokens, narrow-screen positioning.
