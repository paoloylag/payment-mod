# Approval, Finance and payment audit — 12 November 2026

## Scope and environment

Audited staging `83fbca3` with pending `index.html`, `src/prototype.js`, and `src/boilerplate-shell.css` changes preserved. Actual checkout: `.worktrees/backend-integration/Back End`. No application source was changed by this audit.

Automated backend tests used verified isolated `payment_module_test` in `payment-module-phase08-tests`. Browser actions used `http://localhost:5179`, API `127.0.0.1:58004`, and dedicated `payment_module_qa_review_20261112`. Normal `127.0.0.1:5176`, API58002, database `payment_module`, and notification worker were preserved. Different localhost hostname separated browser authentication cookies.

Fixture preparation: fictional local development requests/configuration were seeded into the dedicated review database. An adapted `tests/e2e/finance-closeout-fixtures.js` prepared two General requests with uploaded PDF fixtures, accepted documentation, saved calculation, posted accounting and prepared vouchers through API calls. These preparation steps are NOT claimed as browser coverage. All approval/return/certification/payment actions below were actual visible UI clicks. No money moved or external messages were sent.

## Transparent test-unit inventory

| ID | Expected behavior / role / variant | Method | Browser observed | Automated corroboration | Result / evidence |
|---|---|---|---|---|---|
| T07.01 | FM queue exposes assigned current approvals | UI click Approval Queue, open PO review | Yes | Workflow suite included in full run | Pass:3 assigned records, Review Budget and Approve opens PO-2026-900005 |
| T07.02 | Return to FA requires outcome/reason, preserves prior approvals and pauses FM | UI Reject, choose Return to Finance Associate, enter reason, Confirm Reject | Yes | Full backend suite | Pass:disabled confirmation initially; success toast; owner Finance Associate responding to Finance Manager;2/3 prior stages retained; FM approval action removed |
| T07.03 | General final approval confirms and advances queue | UI General-2026-900020 Approve→Approve Request | Yes | Full backend suite | Pass:confirmation shown; Decision recorded toast; request leaves assigned queue; tracker Approved |
| T07.04 | Fully Decline / Requestor return / executive RMI outcomes | Backend suite only this pass | No | Full backend suite passed | Not run in browser; dropdown options seen, outcomes not submitted |
| T07.05 | FA correction response returns to suspended FM stage | Backend suite only this pass | No | Full backend suite passed | Not run in browser |
| T08.01 | Tax/accounting totals on approved General request are understandable | UI inspect prepared PR-2026-000002 | Yes | Full backend suite | Pass:Saved calculation gross1120/VAT120/EWT20/due1100;Posted accounting debit/credit1120, difference0 |
| T08.02 | FA document/line acceptance, tax save, accounting draft/post | API fixture preparation only | No | Full backend suite passed; fixture succeeded | Not run in browser; do not infer UI pass |
| T08.03 | Validation indicators reflect actual supporting documentation | UI inspect seeded PO-900005/General-900020 | Yes | No dedicated assertion | Fail:summary says1attached/0missing while validation says no uploaded documents, missing Billing/SOA and0/4checks; seed artifact creates contradictory demo presentation |
| T09.01 | FM certifies prepared voucher | UI Reason + Issue and certify voucher | Yes | Full backend suite | Pass:Saved toast and Voucher Issued; PV-2026-00000002 |
| T09.02 | View Voucher opens readable preview and closes | UI View Voucher→inspect iframe→Close | Yes; screenshot visually inspected | Full backend suite | Pass:readable modal, complete voucher heading/payee/tax totals/accounting/approval certification; no clipping observed at default1265×712 desktop |
| T09.03 | FA prepares payment line against issued voucher | UI expand Add payment line items; enter description1100Cash/reference/reason; Prepare | Yes | Full backend suite | Pass:Ready For Finance Release;amount1100;reference retained |
| T09.04 | FA records release with required supporting evidence | UI expand Record payment release; enter date/office/recipient/reason; filechooser upload fictionalPDF; submit | Yes | Full backend suite | Pass:Payment Released·Clearing Pending;Released1100;Remaining0;Supporting evidence(1);payment history(2) |
| T09.05 | FM clearing, recovery, fund-return verification, replacement | Backend suite only | No | Full backend suite passed | Not run in browser this pass |
| T09.06 | Reimbursement,CA,Liquidation,PO,Petty Cash specific voucher/payment end states | Backend suite only;PO approval return UI above | Partial PO only | Full backend suite passed | Not run as complete browser flows; Petty FA-only voucher exception requires dedicated follow-up |
| A01 | All backend tests pass on current mounted source | python -m pytest tests -q | N/A |302passed,2warnings,202.51s | Pass;outputs/qa-nov12-full-pytest.log |
| A02 | API/tests/migrations lint | ruff check api tests migrations | N/A |All checks passed | Pass |
| A03 | Frontend helper unit regressions | pnpm test:unit | N/A |24/24passed | Pass |
| A04 | Type checking and production build | pnpm build | N/A |tsc+Vite7.3.6 success | Pass;bundle-size warning above500kB remains |

Matrix totals:18 units,12Pass,1Fail,5Not run. Backend302 and frontend24 test cases are separate automated case counts, not extra browser units. No real-device/iPad/Safari result is claimed. Responsive request creation was separately assigned to the UI agent.

## Findings and recommended improvements

1. **Medium — seeded demo validation contradictions (T08.03).** FM sees1attached/0missing in request summary, but document panel has no actual uploaded documents and checklist0/4. Seeded FA approval history already exists, so FM final approval can succeed. This does not establish a live validation bypass: the contradictory seeded state needs complete real document/review fixtures or an explicit sample-data marker. Reproduce: FM→Approval Queue→PO-2026-900005 or General-2026-900020.
2. **Medium — stale stage guidance after handoff.** After returning PO to FA, Routing still says Finance Manager can approve and route to voucher creation, although the owner panel correctly says FA is responding and no FM action is required. After voucher issue/release, the same guidance remains. Replace it with stage-aware owner/next-action guidance and retain route explanation as historical context.
3. **Low — inconsistent stage vocabulary.** Queue says Finance Budget Review, action heading says Final payment approval, and progress says Final Payment Approval. These can be mistaken for payment release authorization. Use one request-approval label across these surfaces, keeping payment execution separate.
4. **Low — stale workspace subtitle.** FA request details still shows Document Validation beneath the page heading while voucher is Payment Released·Clearing Pending. Role workspace context should not look like the current request stage.
5. **Existing known gap, not implemented/retested here — Signatory gate.** Prepared payment became Ready For Finance Release directly and FA could record release; no one-click Signatory authorization appeared in this actual UI path. Coordinate with the already documented pending Signatory workflow before describing acceptance as including that gate.
6. **Low — approval return dialog wording.** FM selection is Return to Finance Associate, but outcome badge/history uses Information Requested/Request More Information. The handoff is functionally correct; one consistent action name would make it clearer.

## Evidence and limitations

Actual screenshots were visually inspected in the browser tool: returned PO overview/owner handoff; voucher preview showing full-width readable document; released payment card with1100released/0remaining. They are tool-session evidence, not saved screenshot artifacts. Browser upload tool took152seconds before returning, but the uploaded filename and final release outcome were visible. No application error was inferred from that automation delay.

The full automated suite reported2warnings without detail in `-q` output; no suppressed warning category is claimed. Build emitted large-chunk warning. A combined shell exit1 earlier came from reading absent optional docker-compose.test.yml after successful frontend tests/build, not a failed build.

Follow-up browser priorities: FA actual document accept/flag and correction response; FM clearing; complete Reimbursement physical-document gate; CA full fund return and FM verification; Liquidation excess/equal/unused settlement; Petty FA-only voucher; PO payment; executive RMI and Fully Decline persistence. These remain explicitly Not run above even though automated suite passed.

`docs/testing-validation-workflow.md` already requires browser click-through first, exact click paths, roles and persistence evidence. No duplicate runbook or global skill edits are needed. Test role instructions also explicitly require actual visible navigation, clicks, keyboard interaction and screenshot inspection.

Temporary services for reproduction: review VitePID53324, payment-module-review-api, dedicated review database above. No ordinary service was stopped. New fixture/evidence helper files are under ignored outputs; only this report is the intended tracked audit change.

