# Supplier onboarding verification — 11 November 2026

Environment: staging working tree, isolated PostgreSQL payment_module_test and disposable payment_module_e2e; no normal demo database reset, no external email sent.

| ID / unit | Expected behavior / concrete check | Method / role / variants | Result and evidence | Fix / retest |
| --- | --- | --- | --- | --- |
| T01 Supplier drafts | New supplier remains one proposal across repeated saves; canonical payee uses entered name | API requestor; browser requestor save and reload | Pass | None outstanding |
| T02 Required uploads | Missing/removed supplier files block submission and Finance; actual request documents required | API plus browser real file uploads | Pass | None outstanding |
| T03 Pending access | Pending supplier excluded from selector and cannot be selected on another request; generic activation denied | API requestor/Finance Manager; browser selector | Pass | None outstanding |
| T04 Finance activation | Department Head does not activate; Finance accepts current documents then approves; duplicate action replay safe | API and browser Department Head/Finance Associate | Pass | None outstanding |
| T05 Existing/PO regression | Existing APS selection still submits; Procurement excluded from General; approval/return flows preserved | Full backend regression and request browser suite | Pass | None outstanding |
| T06 Responsive form | Existing/new switch, values and three upload controls usable without page overflow | Chrome automated 375/768/1440; visual screenshots; manual browser | Pass | Real-device Safari not covered |

Six behavior units passed; zero failed or blocked in the exercised variants. Automated cases: full backend suite 299 passed (two warnings); the eight existing request click-through scenarios passed, and the new supplier scenario passed on its focused final rerun. The strengthened supplier-only backend rerun passed all four cases. Lint, production build, and guide generation passed. Build retains the existing large-chunk advisory.

Evidence: outputs/supplier-full-tests.log; outputs/supplier-browser-regression.log (eight regression passes and an initial supplier-test selector failure); outputs/supplier-browser-final.log (corrected new supplier case passed). Supplier screenshots: outputs/supplier-form-375.png, supplier-form-768.png, supplier-form-1440.png and supplier-finance-review.png. Phone/tablet/desktop light-theme screenshots were viewed; desktop dark mode was inspected manually in the in-app browser. Real-device Safari and phone/tablet dark mode were not tested.

Initial supplier test attempts omitted the configured Finance accounting calculation, then used a hidden/inexact selector when starting the next request. The test now follows the existing accounting step and normal New Request type control. Both blockers were test-sequence issues; the final browser pass verifies activation and actual reuse. A manual preview hit service errors while the automated runner was resetting/tearing down its disposable API. A stable temporary preview resolved this environment conflict; manual Requestor save, reload, My Drafts → Continue Editing, restored supplier name, existing/new switching, and dark-mode inspection then passed. The manual preview and helper were stopped afterward; normal demo data was not reset.

No unresolved implementation defect was found in these checks. Procurement live backend integration remains outside this change. Changes are uncommitted.
