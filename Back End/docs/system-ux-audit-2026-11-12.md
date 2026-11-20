# APS system UX and workflow review — 12 November 2026

Review of staging `83fbca3` plus existing uncommitted form refinements. No application fixes were made. This review is not Finance acceptance or production certification.

## Browser validation requirement

Actual browser click-through is mandatory in [Testing and validation workflow](testing-validation-workflow.md). The QA agent was explicitly instructed to exercise visible controls, confirm outcomes and distinguish fixture/API setup from UI execution. Automated and source checks below do not substitute for browser validation.

Normal Requestor audit used http://127.0.0.1:5176. Approval/Finance writes used isolated localhost:5179/API58004 and `payment_module_qa_review_20261112`; the normal database was not reset. Only fictional audit drafts were created in the normal app. Live mail, banking, AWS, SSO and Procurement integrations were excluded.

## Priority findings

| Priority | Finding and impact | Evidence and next action |
|---|---|---|
| P1 | New Cash Advance and Liquidation contain July dates in November, marked valid | Browser reproduced actual values. Initialize fresh dates correctly, derive due dates from selected event/advance; retain existing draft dates. |
| P1 | General has no usable department selector and does not show the inherited center; source fallback is Marketing for most personas | Browser confirmed dead-end instruction; non-Marketing server misrouting remains unproven. Resolve authenticated department or require explicit cost center; verify mapped Department Head with two departments. |
| P1 | Budget flag survives switching request types; Liquidation guidance changes after opening an unbudgeted General draft | Browser preview inconsistency plus source corroboration; actual submitted route not tested. Centralize fresh-draft state initialization and test persisted route inputs. |
| P2 | Editable non-General account choices can be overwritten by active Finance configuration | Source-confirmed mismatch, persistence reproduction pending. Preserve allowed selections or make assigned values read-only. |
| P2 | Reimbursement guidance asks for invoice and proof but only offers a typed proof upload | Browser control gap and source-confirmed mapping. Default proof-only rules are not a demonstrated blocker; configured invoice requirement cannot be satisfied via this control. Provide explicit document categories. |
| P2 | PO top-level inherited values conflict with blank editable PO/supplier/amount fields | Browser reproduced. Require explicit PO selection, inherit identity consistently and explain allocation totals. Live integration remains outside this finding. |
| P2 | Deleting a line does not remap upload-error state | Source-inferred edge case; browser reproduction pending. Use stable line IDs or remap all file/error maps together. |
| P2 | Existing zero-line draft opens without basic item inputs | Browser reproduced. Normalize empty drafts to one blank integrated item. |
| P2 | Expense Account offers liabilities, tax and advance control accounts | Browser observed; eligibility is a Finance policy choice. Provide a Finance-managed requestor allowlist enforced by API. |
| P3 | Draft list lacks purpose/vendor preview, making similar drafts hard to identify | Browser audit could not confidently reopen its own draft. Add a short identifying preview/search and rerun persistence checks. |
| P3 | Conversation fetch is unbounded | Source scalability concern, no measured performance failure. Add cursor pagination if long histories are expected. |

## Coverage

Request creation: **26 manual units: 18 passed, 5 failed, 3 not run**. All six forms opened; Add another item → Remove worked for every type. General vendor modal/save-summary/Escape and representative 375/768/1440 layouts were exercised. Only General received those responsive variants; this does not certify every form on mobile.

Shared controls: **7 additional browser units passed**: tracker sorting, search/reset, inbox open/close, conversation collapse/reopen, mention highlighting/newest-first order, fixed composer while scrolling, and keyboard mention selection/removal. No posting or notification read-state action was performed in these units.

Approval/Finance: see the specialist report for exact visible actions, fixture setup, outcomes and remaining coverage. Do not infer a full six-type lifecycle from successful creation checks.

Automated: **302 backend tests passed (2 warnings), 24 frontend unit tests passed, Ruff clean, production build passed** with the existing bundle-size warning. These results do not invalidate the browser findings.

## Limitations and retest

Own-draft save/reopen persistence, unsupported-file and server-upload recovery in the UI, physical devices/Safari/software keyboards, comprehensive keyboard/screen-reader behavior, all-role access boundaries, all six complete financial lifecycles and live integrations are not certified by this review. Detailed coverage belongs in each specialist matrix. Existing pending Signatory authorization is separate from newly found defects.

After fixes, rerun the linked failing units, verify account/department persistence with non-default selections, reproduce indexed upload failures after deleting a preceding line, submit under a configured invoice requirement, and repeat representative desktop/phone views. No fixes, commits or pushes were performed as part of the audit.

## Specialist reports

- [Request creation: click paths, 26-unit matrix and screenshots](request-creation-ux-audit-2026-11-12.md)
- [Approval and Finance: browser writes and automated regressions](approval-finance-qa-audit-2026-11-12.md)
- [Workflow: source findings and 7 shared-control browser units](workflow-integration-audit-2026-11-12.md)

## Approval and Finance browser closeout

The QA agent clicked FM final approval, FM Return to Finance Associate with a required reason, FM voucher certification, View Voucher, FA payment-line preparation, and FA release with a fictional PDF selected through the browser file chooser. Release visibly reached Payment Released / Clearing Pending with1100released,0remaining and one evidence file. Earlier approvals were retained on the return; FA response/resumption and FM clearing were not clicked in this pass.

The QA matrix contains18units:12Pass,1Fail,5Not run, including4automated validation units. Its14browser-scenario rows contain8Pass,1Fail,5Not run. Combined with creation26 and shared controls7, the audit records **47 browser-scenario units:33Pass,6Fail,8Not run**. Some Not run rows group multiple branches, so this is a coverage inventory, not an exhaustive button count. One row includes partial PO coverage but is conservatively Not run for complete all-type payment flows.

Additional browser findings:

- **P2 — contradictory seeded validation:** FM summary says1attached/0missing while document checks show no uploads and0/4complete. Existing seeded FA approvals explain why FM can still approve; a real validation bypass was not demonstrated. Seed complete documents/reviews or clearly mark sample records.
- **P2 — stale next-action guidance:** after returning to FA, route text still says FM can approve; owner/action controls correctly change. Make guidance follow current handoff.
- **P3 — inconsistent stage labels:** Finance Budget Review, Final payment approval and Final Payment Approval describe the same request stage; FA subtitle remains Document Validation after release. Separate request approval, workspace role and payment state clearly.
- **Known pending Signatory gate:** this browser path went directly to Ready For Finance Release and allowed FA release. The requested one-click Signatory authorization remains pending and must be implemented/tested before claiming that acceptance coverage.

Next browser pass must cover actual FA document acceptance/flagging and response, full decline, executive information request, clearing, recovery/replacement, cash-advance fund returns, Liquidation settlement variants, PO payment and Petty Cash FA-only voucher. Automated coverage is recorded separately and does not mark these UI scenarios passed.
