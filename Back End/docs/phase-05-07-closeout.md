# Phase 05 to 07 development closeout

Date: 2026-10-14 (Asia/Manila)
Branch: `codex/phase05-07-closeout`, based on `codex/phase07-all-request-types` at `1fe07a3`.
Reviewer: Codex development and local verification. Finance business acceptance is separate.

The confirmed approval, Finance and payment flows are implemented. The closeout adds explicit replacement links and a Finance work queue. Actual Finance configuration and a named business review are required before operational acceptance. This work does not enable production email, banking connections or production deployment.

## Delivered scope

| Phase | Current development scope |
| --- | --- |
| 05 | Confirmed amount matrix; PHP equivalent and Finance Manager request rate; returns/declines/information response; reached-participant conversation visibility; delegation, reassignment and controlled recovery |
| 06 | Accepted documents and line reviews; reimbursement physical originals; activated defaults and EWT overrides; balanced accounting and controlled corrections; final-approval posting; official voucher numbering, certification, printing, void/reversal and replacement links |
| 07 | All request types; multiple payment lines; one independent signatory per line; evidence-backed Finance Associate release and Finance Manager clearing; pickup; unreleased failure/void/replacement; durable balances/history; Finance work queue |

Reimbursement and PO Payment inherit General defaults. Cash Advance uses an asset account without VAT/EWT deductions. Liquidation credits the original released advance and pays only a positive excess. Equal expenses need no new payment. Unused advance remains outstanding pending the deferred fund-return process.

## Voucher replacement

Finance Manager links a voided voucher to one independently approved replacement request. The replacement must have the same requestor, department, request type and currency, completed final approval, posted accounting and a prepared voucher draft. Link before issuing the replacement voucher. Its amount may differ to reflect a correction; the reason is mandatory.

The link does not copy approvals, alter the original snapshots or reuse its voucher number. Both voucher views and issued print data retain the link and reason. Original/replacement request uniqueness, stable request locks, source versions and idempotent retries prevent duplicate or conflicting links. Finance Manager permission `vouchers.replace` is required; explicit denials and self-request restrictions apply. A System Administrator role alone cannot perform the action.

## Finance work queue

Open **Tracker and Reports → Finance work queue** as Finance Associate or Finance Manager. The queue respects reached Finance roles and excludes the current Finance user's own requests. Search request/payee, filter department, request type, work phase, or a contained payment-line state. Contains payment line means at least one line matches; other lines may be at different states.

Pagination is server controlled, with stable submission-date/request-ID ordering and a maximum page size of 100. The shown due, released, cleared and remaining amounts come from stored vouchers/payment events. Current-page voucher totals exclude voided vouchers and separate currencies; they are not whole-system or filtered-report totals. Draft vouchers contribute their recorded due. Age is elapsed days since submission, not an SLA or overdue decision. Refreshing tracker navigation reloads the queue.

## Finance setup and acceptance

1. In **Administration → Request Settings**, select General tax defaults, expense/payable, Input VAT/EWT mappings, Cash Advance asset and credit accounts, and voucher prefix/numbering/certification. Check active posting accounts and effective department cost centers.
2. Save the setup, select **All request types**, enter a reason and activate the saved version/effective date. Old General-only trial activations keep their scope. All-type financial calculations require All activation; the trial path is not an All-type operating configuration.
3. Exercise one complete request of each type. Verify Finance document acceptance, flagged-line correction, required reimbursement physical originals, EWT overrides, accounting, certification, signatory, release and clearing evidence.
4. Exercise Liquidation with expenses above, equal to and below the original advance. Verify only the excess is payable, equality needs no payment, and unused funds remain outstanding.
5. Review a voided original and its independently approved replacement. Confirm different official numbers and both link directions.
6. Review the approved amount routes, Finance Manager foreign-rate rerouting and return/information-response behavior. Confirm production voucher wording/layout with Finance.
7. Record Finance reviewer's name, date, accepted scenarios and any correction needed. Codex test results do not constitute Finance's acceptance.

The TOJUST Construction PHP 200,000 configuration example has an exact regression fixture for VAT-inclusive 12% VAT, 2% EWT on the net-of-VAT base and half-up rounding: base 178,571.43; VAT 21,428.57; EWT 3,571.43; due 196,428.57. This tests the configured example, not the selection of Finance's actual tax treatment.

## Verification

- Manual browser click-through: isolated test API; Finance Manager chose a replacement, entered its reason, saved, reloaded and followed the reverse link. Mobile queue search used Enter; the voided original was excluded from page totals.
- Backend: full regression passed (195 tests before the final configuration-example/explicit-denial additions); all five closeout tests passed after the final permission change. Hosted CI runs the full final suite.
- Chrome: the complete isolated regression passed: 16 tests across all 12 specifications. This covers documents, request settings, approvals/returns, executive information requests, foreign-rate routing, conversation visibility, assignment exceptions, Finance activation/setup/EWT/accounting, all-type payments, replacement linking and current-device responsiveness. Run `pnpm test:e2e:isolated`; each specification receives a fresh dedicated test database.
- Migration `20261014_0026`: upgrade and rollback/replay in the dedicated test database. Downgrade refuses to discard saved replacement history.
- Build, backend lint, source whitespace and migration rollback/replay passed. Hosted CI is the final delivery gate.
- Print: two A4 pages inspected; original replacement reference and payable amount verified; approval trail grouped to prevent a split.
- Local evidence: `outputs/phase05-07-finance-queue-mobile.png` and `outputs/phase05-07-replacement-voucher-preview.html`.

## Deferred or later scope

- Owner-deferred Phase 05 SLA deadlines, reminders and escalation.
- Owner-deferred unused-advance fund returns and post-release reversals.
- Phase 08 notification processing/delivery, detailed reconciliation reports, exports, aging/report definitions and reporting performance acceptance.
- Phase 09 deployment, production security/providers, backup/recovery acceptance and live integration enablement.
