# Error handling audit — 10 November 2026

Scope: Payment Module frontend, using life-ui-fix and tracing the frontend/API error contract with life-integration-debug. Changes reuse current theme, inline alert, modal and error-page controls.

## Confirmed defects corrected

- Failed identity/master-data writes previously set page-level load errors. Rendering removed the editor and discarded unsaved input. Writes now retain live controls, provide focused inline feedback and restore submit availability; concurrent submits are guarded.
- Ordinary Finance setup, numbering, reimbursement schedule and Finance policy failed saves could rerender and erase selections. They now retain values and show an inline alert, as initial setup already did.
- Failed sign-in previously rebuilt the form and erased entered credentials. It now retains the live form for correction/retry; credentials are not persisted to browser storage.
- Identity, master-data and Finance settings load failures lacked retry controls. Retry is now available; obsolete load-failure toasts are cleared after successful recovery.
- Theme switching rerendered the page, dropping unsaved editor fields and error feedback. It now updates theme tokens, icon and accessibility state in place.
- API validation arrays and non-JSON failures could produce generic technical messages. Parsing now recognizes validation arrays and supplies concise status-specific fallback messages for 401, 403, 404, 409, 422, 429 and server errors. Unreadable successful responses warn the user to verify the outcome before retrying; valid JSON null and 204 responses remain supported.
- Request deep-link load failures always used a 500 presentation. They now retain the response status, using 503 for connection failures.
- Authenticated data-load failures could masquerade as sign-in failures. Session validation and subsequent data loading now have separate recovery outcomes.
- The expired-session page’s sign-in action previously navigated while retaining frontend authenticated state. It now clears that frontend state and opens sign-in; backend permissions remain unchanged.
- Server/timeout error pages no longer assert that no action occurred. They advise checking the latest record before retrying.

## Verification

- 26 Chrome browser tests across 11 isolated specifications passed after corrections and reruns. This combines the latest result per case; it was not one uninterrupted green invocation.
- Six new recovery tests passed, including schedule/policy failures and duplicate-cutoff correction.
- Eight tracker JavaScript tests passed.
- Production build and git diff whitespace checks passed.
- Reviewed generated mobile inline-error, user-editor, expired-session page and dark-mode error screenshots. Viewport coverage includes 375/390px phones, 768px tablet and 1440px desktop.
- Evidence: outputs/error-handling-regression.log, outputs/error-handling-final-rerun.log, outputs/error-handling-settings-final.log and outputs/error-handling-build.log. The initial outputs/error-handling-audit.log failed setup while Docker Desktop was stopped; those checks were rerun after startup.
- All browser fixtures used payment_module_e2e; no local demo database reset. No backend code changed; the 274-test backend suite from 8 November was not rerun for this frontend-only audit.

New fault-injection coverage exercises offline, validation, conflict, forbidden, expired-session, throttling, server outage and malformed-response cases, including retained editor values, duplicate-submit guarding, successful retry, load recovery and matching error pages. Existing relevant regressions cover request/approval/document flows, accounting/voucher/payment operations, reports, workflow exceptions and session restoration.

## Limits

Chrome viewport checks are not physical iPhone/iPad Safari or keyboard verification. This audit does not certify live email, production infrastructure, external integrations, every possible connection failure timing, or server-side financial/business acceptance. No automatic mutation retries were added. The existing backend authorization, approval and idempotency rules are unchanged.

Reusable form-lifecycle observation is recorded in docs/boilerplate-ui-gaps.md; shared boilerplate extraction is outside this change.
