# Full-system QA — 11 November 2026

## Outcome

Completed the full pytest suite and all 29 Playwright specifications identified in the 11 November audit. Two existing frontend Node test files were missed in that inventory; their subsequent independent verification is recorded in the dated correction below. Backend: **299 unique pytest cases passed** (2 warnings). Browser initial run: **49 passed, 1 failed, 0 skipped across 29 specifications**; 28 specifications were clean. The exact failed lifecycle case passed on an unchanged focused rerun. Thus every one of the **50 unique browser cases has an observed passing execution**, but the initial intermittent failure remains open for investigation and is not a verified fix.

Behavior-unit tally: **20 Pass, 1 Fail, 1 Blocked** (22 units). The failed unit is broad lint/maintenance verification; the blocked unit is the independent manual upload-to-voucher continuation. These units are not test-case counts. A Pass applies only to the listed executed checks; it does not imply unexecuted independent manual coverage. Manual statuses are separately itemized below. No blanket all-pass or release-readiness certification is made.

## Environment and ownership

- Checkout: `staging` at `ae647352eb8b46277d7df551b8305880dc2862fa` plus the pre-existing uncommitted vendor/onboarding changes. App root is `Back End` within the `backend-integration` worktree. Product code was not changed during this audit; no commit/push.
- Dedicated databases: `payment_module_test` for pytest; `payment_module_e2e` recreated per browser specification; separate owned `payment_module_qa_20261111_test` for independent CUA. Normal `payment_module` demo database was not reset or seeded.
- User-facing localhost5176/API58002 were preserved. Automated browser used5178/58003; independent manual preview used5179/58004. Mail/payments/external integrations stayed local or fake.
- Inventory:38 backend test modules and29 Playwright specifications. Pytest includes both policy unit tests and API/database integration tests; it would be inaccurate to call all299 pure unit tests. There is no package.json unit-test script, but two existing frontend files use Node’s built-in node:test runner: tests/tracker-status.test.js and tests/tracker-table.test.js. They were missed in this audit’s original inventory. The 11 November frontend evidence was TypeScript compilation, browser checks and visual review; see the 12 November correction for the separate Node test run.

## Test-unit matrix

| ID / unit | Expected behavior / check | Method / role / variants | Result / evidence | Fix / retest |
| --- | --- | --- | --- | --- |
| T01 Authentication, sessions and error recovery | Login/logout, expiry, restoration and recoverable errors | Backend + browser; requestor and staff | **Pass** — pytest; session-restoration (3), error-recovery (6) | None observed in executed cases |
| T02 User and role administration | Role assignment, authorization boundaries and persistence | Backend + browser; administrator/non-admin | **Pass** — test_identity; user-role-assignment | None observed |
| T03 Master data and cost-center approvers | CRUD, validation, assignment and current approver routing | Backend + browser; Finance/admin | **Pass** — test_master_data; test_cost_center_approvals; cost-center-approver; manual Finance administration | None observed |
| T04 Finance setup and activation | Initial wizard, readiness gate, configuration version/activation | Backend + browser + independent CUA Finance Manager | **Pass** — finance-initial-setup; finance-activation; finance-setup; manual saved and activated all types, reloaded | Setup copy finding F03 remains; transaction passed |
| T05 Requests and drafts | Create/save/reload/submit supported types with validation | Backend + browser; requestor/Finance | **Pass** — test_payment_requests; all-type-payments; request-click-through; petty-cash | Manual General form entry only; full manual submission blocked T22 |
| T06 Documents and validation | Uploads, replacements, required files, line flags and originals | Backend + browser; requestor/Finance | **Pass** — test_documents; test_finance_validation; phase-04-documents; request-click-through | Actual automated MinIO uploads passed; independent CUA upload blocked T22 |
| T07 Vendors and supplier onboarding | Pending files, Finance/admin directory and source isolation | Backend + browser; requestor/Finance/admin | **Pass** — test_supplier_onboarding; test_vendor_crud; vendor-crud (3); expanded supplier click-through | No new functional finding |
| T08 Approval matrix and foreign currency | Threshold routes, cost-center assignment and request FX | Backend + browser; all approvers | **Pass** — test_workflow_policy boundary cases; workflow approvals; lifecycle FX case; full-route-voucher | No new functional finding |
| T09 Return, decline and information loops | Correct destinations, preserved approvals and resubmission | Backend + browser; requestor/approvers | **Pass** — Initial lifecycle case failed; exact unchanged retest passed; request-click-through9/9 passed | F01 intermittent initial input-loss/timing observation remains unresolved; no fix claimed |
| T10 Approval exceptions | Delegation/reassignment/recovery/on-behalf authorization and audit | Backend + browser; Finance Manager | **Pass** — test_workflow_exceptions; approval-coverage; workflow-exceptions | No new functional finding |
| T11 Conversations and mentions | Reached-participant visibility, chat and tagging | Backend + browser; requestor/approvers | **Pass** — test_request_conversation; conversation-mentions; conversation-participants | No new functional finding |
| T12 Notifications and email scaffold | Recipients, read/unread, local queue and disabled delivery | Backend + browser; local delivery only | **Pass** — test_notifications_phase08; test_email_delivery; test_mention_email; phase08-notifications | Live SMTP and production provider delivery excluded |
| T13 Tax calculations | Configured VAT/EWT and request/line overrides | Backend + browser; Finance | **Pass** — test_finance_tax; finance-tax | No new functional finding |
| T14 Accounting | Balanced coding/posting/corrections and immutability | Backend + browser; Finance | **Pass** — test_finance_accounting; finance-accounting; finance-closeout | Coverage gaps in validation/error branches remain |
| T15 Vouchers | Creation, issuance, view/print, void/replacement and Petty Cash | Backend + browser; Finance | **Pass** — test_finance_vouchers; test_petty_cash; full-route-voucher; petty-cash; issued-voucher screenshot inspected | Signatory policy/copy consistency needs confirmation F03 |
| T16 Payments | Multiple lines, release evidence, clearing and type-specific limits | Backend + browser; Finance | **Pass** — test_all_type_payments; test_payment_execution; all-type-payments; finance-closeout | No bank transactions executed |
| T17 Fund returns and recoveries | Full-return/recovery verification and replacement balances | Backend + browser; Finance | **Pass** — test_fund_returns_recovery; fund-returns-recovery; recovery-responsive | Recovery phone screenshot inspected; real bank evidence excluded |
| T18 Reports and dashboards | Status/filter/sort/export/reconciliation and currency totals | Backend + browser; Finance/staff | **Pass** — test_finance_reports; test_phase08_reports; finance-reconciliation; phase08-reports | No operational volume benchmark claimed |
| T19 Guides | Role-specific in-app and offline guide generation | Browser + guide build | **Pass** — system-guide; pnpm guides:build | Setup workflow instruction mismatch separately recorded F03 |
| T20 Responsive and keyboard UI | Phone/tablet/desktop, themes, overflow, focus and dialogs | Chrome viewports + screenshots + partial CUA | **Pass** — responsive-current-devices; recovery-responsive; vendor views; seven current screenshots visually inspected | Physical devices and software keyboard excluded; manual later flow blocked T22 |
| T21 Maintenance and deployment safeguards | Environment validation, cleanup and release configuration/lint/build | Backend + lint/build; no deployment | **Fail** — Backend safeguard tests/build passed; broad Ruff fails10 old migration style violations | F02 needed; current api/tests and new migrations lint clean |
| T22 Independent manual end-to-end continuation | Request upload, return, approval and voucher through independent visible browser | CUA Chrome; separate QA database/API | **Blocked** — Manual chooser call stalled676.6s and was interrupted; request line entry occurred but upload outcome unverified | Tool capability blockage; not evidence of an application upload failure |

## Findings and classification

### F01 — Initial return dialog lost/failed to retain the entered reason (intermittent; cause unconfirmed)

- Unit T09; initial automated scenario: `five-role-lifecycle.spec.js`, “five roles click through return, resubmit, cancel and reopen for all request types”. Department Head opens the first Reimbursement request (`PR-2026-000001`), chooses Return to Requestor, fills a reason, then confirms. Expected: reason remains entered, confirmation enables and `/reject` is submitted. Actual initial screenshot: textarea empty and Confirm Reject disabled; no reject response, then timeout.
- Evidence: `outputs/system-qa-20261111/browser/five-role-lifecycle.spec/run.log`, its preserved trace and `artifacts/five-role-lifecycle-five-r-1bfcf-eopen-for-all-request-types-Google-Chrome/test-failed-2.png`. Screenshots were actually viewed.
- Exact focused rerun (same code and test, after other isolated suites): **Pass**, including return/resubmit/cancel/reopen for Reimbursement, Cash Advance, Liquidation, PO and General. The broader request-click-through suite also passed9/9. Evidence: `outputs/system-qa-20261111/lifecycle-retest.log`.
- Classification: open intermittent UI/automation timing observation, **not confirmed as a persistent product defect and not silently dismissed as harness-only**. Root cause remains unproven. Next action: investigate rendering/event timing around `openActionPrompt`/`bindActionPrompt` and assert reason persistence before submission. No implementation or test was edited to obtain the pass.

### F02 — Broad Ruff check fails10 historical migration style checks (confirmed, pre-existing)

- Unit T21; command `ruff check api tests migrations` fails. `ruff check api tests migrations/versions/20261111_0033_shared_vendor_ownership.py migrations/versions/20261111_0034_supplier_documents.py` passes. The four older migration files are unchanged in this working tree.
- `20261030_0029_cost_center_approver.py`: I001 imports, E501 line12.
- `20261030_0030_petty_cash.py`: I001 imports; E501 lines10,11,15,18.
- `20261030_0031_remove_signatory_gate.py`: I001 imports.
- `20261103_0032_petty_cash_voucher.py`: I001 imports; E501 line13.
- Impact: broad quality check is not clean; no transaction failure was caused by these formatting findings. Fix status: Needed, unmodified. Evidence: `outputs/system-qa-20261111/ruff.log`.

### F03 — Initial setup contains workflow/scope wording inconsistent with current implementation (confirmed copy mismatch; policy clarification needed)

- Units T04/T15/T19. Independent CUA: Finance Manager → Administration → Request Settings → Start/resume initial setup →4.Voucher controls. Text says “Each payment line has one assigned signatory.” Current system status and implemented no-signatory flow describe the separate signatory gate as retired; automated no-signatory tests pass. Source: `src/finance-initial-setup-ui.js:15`.
- Earlier user history included a one-signatory direction. This audit does **not** infer a later accepted business policy solely from code. Finance/owner should confirm intended policy, then align setup instructions and flow accordingly.
- The same wizard activation screen shows All request types as scope but initially labels its action “Activate saved General setup” (`src/prototype.js:2042`); activating did successfully persist All request types on reload. Correct scope wording would avoid confusion.
- Impact: misleading Finance setup instructions; no blocked configuration transaction. Fix/policy clarification: Needed. Manual screenshot was visually inspected inline; unlike automated screenshots, no persistent CUA screenshot file was available.

## Automated commands and results

| Check | Result | Evidence |
| --- | --- | --- |
| `pytest -q --junitxml=...` |299 passed,2 warnings;252.84s | `outputs/system-qa-20261111/pytest.log`, `pytest.xml` |
| `pytest -q --cov=payment_module --cov-branch ...` |299 passed,2 warnings;330.16s; coverage below | `coverage.log`, `coverage.json`, `coverage.xml` in same folder |
| All29 `pnpm test:e2e:isolated <spec>` invocations | Initial49 pass/1 fail; no skipped; every spec attempted | `browser-summary.json`, `browser-case-counts.json`, per-spec logs/artifacts |
| Exact failed lifecycle case rerun |1 passed unchanged | `lifecycle-retest.log`, `lifecycle-retest.exit` |
| `pnpm build` |Pass; existing bundle-size advisory | `build.log` |
| `pnpm guides:build` |Pass | `guides-build.log` |
| Broad Ruff |Fail10 existing migration style violations | `ruff.log` |
| Application/tests + changed migration Ruff |Pass | Command output recorded in audit |
| `git diff --check` |Pass | `diff-check.log` |

### Browser specification results

| Specification | Initial pass | Initial fail | Latest focused rerun |
| --- | --- | --- | --- |
| all-type-payments.spec.js | 1 | 0 | Not repeated |
| approval-coverage.spec.js | 1 | 0 | Not repeated |
| conversation-mentions.spec.js | 1 | 0 | Not repeated |
| conversation-participants.spec.js | 1 | 0 | Not repeated |
| cost-center-approver.spec.js | 1 | 0 | Not repeated |
| error-recovery.spec.js | 6 | 0 | Not repeated |
| finance-accounting.spec.js | 1 | 0 | Not repeated |
| finance-activation.spec.js | 1 | 0 | Not repeated |
| finance-closeout.spec.js | 1 | 0 | Not repeated |
| finance-initial-setup.spec.js | 1 | 0 | Not repeated |
| finance-reconciliation.spec.js | 1 | 0 | Not repeated |
| finance-setup.spec.js | 1 | 0 | Not repeated |
| finance-tax.spec.js | 1 | 0 | Not repeated |
| five-role-lifecycle.spec.js | 2 | 1 | Failed case passed unchanged |
| full-route-voucher.spec.js | 1 | 0 | Not repeated |
| fund-returns-recovery.spec.js | 1 | 0 | Not repeated |
| petty-cash.spec.js | 1 | 0 | Not repeated |
| phase-04-documents.spec.js | 2 | 0 | Not repeated |
| phase08-notifications.spec.js | 1 | 0 | Not repeated |
| phase08-reports.spec.js | 1 | 0 | Not repeated |
| recovery-responsive.spec.js | 1 | 0 | Not repeated |
| request-click-through.spec.js | 9 | 0 | Not repeated |
| request-settings.spec.js | 2 | 0 | Not repeated |
| responsive-current-devices.spec.js | 1 | 0 | Not repeated |
| session-restoration.spec.js | 3 | 0 | Not repeated |
| system-guide.spec.js | 1 | 0 | Not repeated |
| user-role-assignment.spec.js | 1 | 0 | Not repeated |
| vendor-crud.spec.js | 3 | 0 | Not repeated |
| workflow-exceptions.spec.js | 1 | 0 | Not repeated |

## Coverage and meaningful gaps

Combined statement/branch coverage is **85.47%**: statements **88.39%** (6126/6931), branches **76.17%** (1656/2174). There are805 uncovered executable statements and518 uncovered branches. Three excluded lines are the `EmailTransport` Protocol declaration/body in `email_delivery.py:34–36`; they are not a business-rule waiver. The coverage run instruments Python during pytest only; Playwright, frontend JavaScript, live AWS and physical-device coverage are not included.

Lowest areas include three local seed/repair utilities at0%, S3 storage adapter29.41%, workflow visibility61.29%, notification worker66.41%, cost-center approvals71.43%, document router76.26%, workflow router78.32%, accounting81.10%, and supplier onboarding83%. An aggregate percentage does not establish all business scenarios.

Priority uncovered branches identified from measured missing lines and source:

- Supplier onboarding: invalid profile length/type rejection, edits/reuse of already validated request-bound vendors, blank-name partial draft behavior, and some stale/missing accepted-document paths (`vendor_onboarding.py:49,54–61,120,143`).
- Workflow access: returned/declined event lookup and cancelled workflow reached-stage reconstruction (`workflow_visibility.py:21–37`). These deserve direct permission-regression cases even though general participant browser tests pass.
- Legacy pending-route activation endpoint and some idempotency/error branches (`routers/workflow.py:769–798`); current browser FX approval passes but does not cover that entire administrative path.
- Documents: specific missing-record/permission/invalid-context and cleanup/error branches remain uncovered (`routers/documents.py` missing lines listed in coverage.json). Browser tests do exercise actual MinIO uploads, but AWS/KMS behavior is unverified.
- Accounting: original advance asset expiry/mapping correction rejection, multiple advance asset accounts and out-of-calculation correction keys (`finance_accounting.py:91,94,112,118`).
- Storage adapter Python coverage is low because pytest uses fakes for much I/O. Real local MinIO browser paths passed; production object-store failures, IAM/KMS and provider availability remain separate.

## Independent manual browser and visual checks

CUA used a dedicated new Chrome QA tab because IAB was unavailable to this child session. Completed visible checks: Finance Manager login; navigation to Cost Centers and Request Settings; initial setup tax choices, account mappings and voucher controls; save; activation to All request types; reload and verify active version/settings; account-menu logout; Requestor login; General request navigation; existing vendor selection and line entry attempt. Only synthetic local QA data was used.

The next filechooser call stalled676.6s and was interrupted. The upload result and subsequent independent manual return/approval/voucher workflow were **not verified**. This is a computer-use tool blockage, not proof the product upload failed. Automated browser upload/approval paths passed independently. This limitation is retained as T22 Blocked.

Current-run automated screenshots actually viewed: initial Finance setup phone; issued voucher; vendor verification375/768/1440 light and desktop dark; payment-recovery review phone; plus all five initial lifecycle-failure role screenshots. Seven meaningful current-run visuals were copied into `outputs/system-qa-20261111/visual-evidence/`. No horizontal overflow was observed in these inspected states. Long unbroken synthetic recovery content wraps, but makes history very tall; no clipping defect is asserted. An older403 screenshot was also viewed but is not claimed as current-run evidence.

Automated responsive checks include representative phone portrait/landscape, foldable/tablet-like sizes and desktop; vendor-specific375/768/1440 light and desktop dark. Actual iPhone/iPad Safari, touch hardware, software keyboards, and all-route/all-theme combinations remain unverified.


### Independent manual status (distinct from automated cases)

| Manual check | Result | Observed outcome |
| --- | --- | --- |
| M01 Finance Manager login and navigation | Pass | Login, Cost Centers and Request Settings opened through visible controls |
| M02 Finance wizard save and activation | Pass | Tax/account/voucher settings saved; All request types activated; active version persisted after reload |
| M03 Logout and Requestor login | Pass | Account menu sign-out and Requestor sign-in completed |
| M04 General request navigation | Pass | Form, existing APS vendor option, automatic account labels and upload controls visibly present |
| M05 Actual manual file upload | Blocked | CUA filechooser call stalled and was interrupted; preceding line-entry actions may be partial, upload outcome unverified |
| M06 Manual return/approval/voucher continuation | Not run | Could not continue the independent request after M05; automated equivalents passed separately |

Manual tally:4 Pass,1 Blocked,1 Not run. These six checks are a separate evidence breakdown and are not added to the22 behavior units or50 automated browser cases.
## Exclusions and handoff

No live SMTP email, AWS deployment, real banking, LifeOS SSO or live Procurement/ERP backend integration was tested. Finance institutional policy/business acceptance remains outstanding. No production data was changed and no commit/push was made.

Next work: investigate intermittent return-dialog note loss/timing (F01), clean historical migration lint (F02), confirm signatory policy and align initial-setup wording (F03), and finish independent manual upload-to-voucher plus physical-device acceptance when browser/device capability is available. Test-only services/databases are removed on cleanup; user local preview is preserved.

## Correction — 12 November 2026: existing frontend unit tests

The earlier wording that all available suites had been run and that no frontend unit-test runner existed was too broad. The repository already contains two frontend unit-test files using Node’s built-in `node:test`: `tests/tracker-status.test.js` and `tests/tracker-table.test.js`. A missing package.json unit-test script does not mean those tests are absent.

The independent UI engineer review ran:

```text
node --test tests/tracker-status.test.js tests/tracker-table.test.js
```

Reported result: **8 passed, 0 failed, 0 skipped**. Its inventory identified these two additional test files; the other non-spec JavaScript under tests/e2e consists of fixtures, helpers and setup. This result is attributed to that review, not a rerun performed by this QA agent. See the [12 November UI review](ui-review-2026-11-12.md) for its evidence and recommendations.

The original 299 pytest cases, initial 49/50 browser result plus unchanged focused retry, 22 behavior-unit matrix, manual limitations and Python-only coverage numbers remain dated 11 November evidence. The 8 frontend cases are separate evidence and do not change the measured Python coverage or imply comprehensive frontend coverage. No product or test code was changed for this correction.
