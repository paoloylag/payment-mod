# Phase 07 payment line execution validation

Date: 2026-10-13, Asia/Manila
Branch: `codex/phase07-payment-execution`
Dependency: `codex/phase06-voucher-lifecycle`, commit `25f3985`
Reviewer: Codex implementation and local verification; Finance business acceptance remains open.

Local results: 184 backend tests passed; seven visible Chrome workflow/regression tests passed; migration 0025 rollback/replay and backend lint passed. The actual issued voucher was exported to A4, rendered with Poppler and visually reviewed: two pages, all payment lines, matching balances, repeated voucher/request references and page numbers. Frontend production build passed.

## Implemented scope

Issued General vouchers support multiple payment lines, separately assigned authorization, Check pickup readiness, Finance Associate release, Finance Manager clearing, and failed/voided unreleased payment replacements. Each release and clearing requires its own uploaded evidence. No external banking operation is performed.

## Browser click path and register

| Check | Role and action | Expected result |
| --- | --- | --- |
| Accounting regression | Finance Associate saves and corrects EWT/accounting; Finance Manager approves and posts; Associate prepares voucher | Balanced source preserved; posting unavailable before final approval |
| Voucher certification | Finance Manager issues voucher; simulate failed save and retry using keyboard | Reason retained; one issued voucher |
| Split preparation | Finance Associate adds Bank Transfer and Check line items | Individual references/signatories; total capped at payable amount |
| Failure and replacement | Finance Manager marks Check failed; Associate prepares linked replacement | Failed record retained; replacement needs fresh authorization |
| Authorization visibility | Assigned Authorized Signatory opens queue and authorizes both pending lines | Request absent before assignment; separate decisions and consolidated queue |
| Release retry | Finance Associate uploads evidence and records each release; simulate failed release response | Evidence association retained; retry records one release; partial and final balances correct |
| Check pickup | Finance Associate marks Check ready for pickup before release | Check cannot skip readiness |
| Clearing | Finance Manager uploads clearing evidence and confirms each payment | Released/cleared balances reconcile; voucher cannot be voided after release |
| Persistence and print | Reload details; print actual issued voucher | Payment status and all line items persist; printed balances match saved records |
| Responsive and keyboard | Repeat affected flow at 390, 768 and 1280 pixels; keyboard submission | No horizontal overflow or clipped selects; shared 42px select minimum preserved |

## Verification commands

- Backend: `ruff check api tests migrations`; `pytest -q` in the dedicated Docker test database.
- Migration: `alembic downgrade 20261013_0024` and `alembic upgrade head` on the dedicated test database. CI also verifies rollback to base and replay on a clean database.
- Frontend: `pnpm build`.
- Visible Chrome: `finance-accounting.spec.js` with `voucher-lifecycle-flow.js`; regressions for conversation visibility, Finance activation, EWT and existing request lifecycle.
- Browser evidence: `outputs/phase07-payment-execution-mobile.png`, `outputs/phase07-authorization-mobile.png`, and actual print HTML under `outputs/phase07-voucher-preview.html`.

## Protected behavior

- Request row locks serialize concurrent allocations and releases. Concurrent preparation tests allow one winner and reject the stale competing command; totals cannot exceed payable amount.
- Idempotency replays return the original decision; changed payloads fail. Both current request and payment line versions are checked.
- Only an independently assigned Authorized Signatory authorizes. Finance Associate releases; Finance Manager clears and controls unreleased exceptions. Explicit permission denials remain enforced.
- Evidence must belong to the exact payment line and action, be available, and retain its file hash. Clearing cannot predate release. Unavailable storage and upload limits use the existing document safeguards.
- Original failed/voided payment references remain unique. Replacement links and prior authorizations cannot be rewritten or reused as new authorization.
- Released/cleared payment lines cannot be failed or voided; vouchers with releases cannot reverse posted accounting through voucher void.
- Existing single-instruction API behavior is regression tested. The new UI uses line actions; amount/currency/sequence are backfilled for legacy instructions.

## Remaining scope

Other request-type voucher applicability, post-release failure/fund-return policy, amount-based multi-signatory rules, production voucher acceptance, scheduled notices and broader reconciliation reporting remain pending. These do not prevent exercising the confirmed General voucher payment flow locally.
