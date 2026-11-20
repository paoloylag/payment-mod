# Local workflow samples — 17 November 2026

Replaced all 59 previous requests with 38 explicitly fictional samples. Accounts, roles, cost centers and Finance setup were preserved. Full database backup: `outputs/backups/aps-before-demo-refresh-20261117.dump`.

Open http://127.0.0.1:5176/. Use the development role selector at sign-in. Requestor is Mara Reyes; Department Head is Elena Cruz; Finance Associate is Nina Santos; Finance Manager is Carlo Mendoza. Every approver has three pending requests.

## Finding a stage

Use My Dashboard (Requestor) or Finance Overview / All Requests (Finance). Set Rows per page to 50 or search the request number. Drafts appear under New Request. Role-specific Approval Queue shows requests currently assigned to that role.

| Stage | Request | Type | Scenario |
|---|---|---|---|
| Draft / request entry | Draft: Draft - supplier and account selection | general | Draft - supplier and account selection |
| Document preparation | Draft: Document preparation - travel reimbursement | reimbursement | Document preparation - travel reimbursement |
| Department Head approval | GEN-2026-970003 | general | Department Head review - scenario 1 |
| Department Head approval | RMB-2026-970004 | reimbursement | Department Head review - scenario 2 |
| Department Head approval | PC-2026-970005 | pettyCash | Department Head review - scenario 3 |
| Finance Associate validation | GEN-2026-970006 | general | Finance Associate review - scenario 1 |
| Finance Associate validation | RMB-2026-970007 | reimbursement | Finance Associate review - scenario 2 |
| Finance Associate validation | CA-2026-970008 | cashAdvance | Finance Associate review - scenario 3 |
| Finance Manager approval | GEN-2026-970009 | general | Finance Manager review - scenario 1 |
| Finance Manager approval | PO-2026-970010 | poPayment | Finance Manager review - scenario 2 |
| Finance Manager approval | CA-2026-970011 | cashAdvance | Finance Manager review - scenario 3 |
| COO approval | GEN-2026-970012 | general | Coo review - scenario 1 |
| COO approval | GEN-2026-970013 | general | Coo review - scenario 2 |
| COO approval | GEN-2026-970014 | general | Coo review - scenario 3 |
| President approval | GEN-2026-970015 | general | President review - scenario 1 |
| President approval | GEN-2026-970016 | general | President review - scenario 2 |
| President approval | GEN-2026-970017 | general | President review - scenario 3 |
| Board approval | GEN-2026-970018 | general | Board Member review - scenario 1 |
| Board approval | GEN-2026-970019 | general | Board Member review - scenario 2 |
| Board approval | GEN-2026-970020 | general | Board Member review - scenario 3 |
| Returned to requestor | RMB-2026-970021 | reimbursement | Return to requestor - replace receipt |
| Returned to Finance Associate | GEN-2026-970022 | general | Return to Finance Associate - clarify EWT |
| Declined | GEN-2026-970023 | general | Fully declined - duplicate purchase |
| Approved / accounting next | GEN-2026-970024 | general | Approved - mixed 1% and 2% EWT, accounting next |
| Voucher draft / certification | PO-2026-970025 | poPayment | PO approved - net payable and voucher certification |
| Voucher issued / payment preparation | GEN-2026-970026 | general | Voucher issued - prepare payment lines |
| Payment prepared / release pending | GEN-2026-970027 | general | Payment prepared - release with evidence |
| Partially released | PO-2026-970028 | poPayment | PO partial release - balance outstanding |
| Released / clearing pending | RMB-2026-970029 | reimbursement | Released reimbursement - clearing next |
| Cleared | GEN-2026-970030 | general | Cleared payment - reconciliation |
| Completed / archived | GEN-2026-970031 | general | Completed request - archived audit trail |
| Recovered / replacement pending | PO-2026-970032 | poPayment | Recovered PO payment - prepare replacement |
| Released advance / liquidation source | CA-2026-970033 | cashAdvance | Released advance - ready for liquidation |
| Approved / accounting next | LIQ-2026-970034 | liquidation | Liquidation - excess over original advance |
| Full fund return / verification pending | CA-2026-970035 | cashAdvance | Unused advance - Manager verifies full return |
| Full fund return verified | CA-2026-970036 | cashAdvance | Verified full fund return - settled advance |
| Petty Cash / voucher creation pending | PC-2026-970037 | pettyCash | Petty Cash approved - Associate creates voucher |
| Petty Cash / voucher issued | PC-2026-970038 | pettyCash | Petty Cash voucher - tax free and complete |

## Coverage and limits

All six request types are represented. Samples include mixed 1%/2% EWT, PO gross/VAT/EWT/net amounts, posted journals, vouchers, payment evidence, partial releases, clearing, recovery, full advance returns, liquidation offsets, mentions and Petty Cash vouchers. Petty Cash remains PHP-only, below PHP 3,000, with Finance Associate final approval and voucher creation.

PO records are fictional local adapter data. Six integration events are pending locally; no live Procurement delivery or emails were sent. There is no active Signatory gate in the current workflow, so no Signatory approval sample is fabricated.

Finance configuration currently has no cash/bank asset account. Full fund-return states are visible as illustrative history, but completing another return verification needs Finance to configure a valid receiving cash/bank account. Existing vendor proposals were retained along with vendor master data.

## Validation

| Check | Result |
|---|---|
| Old requests replaced | Pass: 59 removed, 38 created |
| Existing identity and Finance rows preserved | Pass: before/after checksums match |
| Submitted stage visibility | Pass: actual browser dashboard shows all 36 submitted samples, including all approval and financial states |
| Finance Manager queue | Pass: actual browser shows 3 pending requests |
| Partial PO and voucher | Pass: actual browser displays PHP 112,000 gross, PHP 2,000 EWT, PHP 110,000 net; PHP 60,000 released / PHP 50,000 remaining; voucher preview opens |
| Automated seed / master data regressions | Pass: 10 tests, 2 warnings in isolated database |
| Frontend build | Pass; existing bundle-size warning |
| Every role completing each approval/payment action | Not run: samples retained at their seeded stages for acceptance testing |

The sample utility is explicit and local/test-only. API startup does not reset requests; the legacy sample seed is suppressed once this catalog exists.
