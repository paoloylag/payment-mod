# Phase 07 — Payment Execution

Date prepared: 2026-08-28  
Status: Confirmed payment flow and Finance work queue implemented for all request types. Finance acceptance remains open; fund returns and post-release reversals remain deferred.

Current closeout: [Phase 05 to 07 development closeout](phase-05-07-closeout.md). Dated increments below retain their delivery history; their earlier pending statements are superseded by the current closeout.
Depends on: Phase 06 — Finance Validation and Vouchers

## Objective

Record payment preparation, authorization, release, and settlement attempts without overwriting financial history.

## Scope

- Multiple payment attempts and partial settlements per voucher.
- Check, Bank Transfer/DigiBanker, and Cash methods.
- Preparation, signatory assignment, authorization, processing reference, pickup availability, release, clearing, failure, retry, voiding, and replacement.
- Segregation of duties between payment preparation and authorization.
- Immutable state history, idempotency, reconciliation identifiers, and remaining-balance calculation.

## Planned data model

- Payment attempt with voucher, method, amount, currency, sequence, preparer, current state, and idempotency key.
- Method-specific details for check, bank transfer/DigiBanker, and cash without storing unnecessary sensitive credentials.
- Signatory assignments and immutable authorization decisions.
- Processing, pickup, release, clearing/settlement, failure, retry, void, and replacement events.
- Voucher settlement summary derived from attempts rather than stored as an independently editable total.

## Payment state and balance rules

- Each method has an explicit state machine and permitted transitions.
- The sum of non-void settled/released amounts cannot exceed the voucher payable amount.
- Partial payments leave a calculated remaining balance and do not mark the voucher complete prematurely.
- Failure/retry creates or links a new attempt as defined by policy; earlier attempts remain immutable.
- Replaced checks/transfers link predecessor and successor attempts and require a reason.
- Processing, transaction, check, release, and clearing references follow method-specific uniqueness and format rules.
- Commands that may be repeated use idempotency keys and version checks.

## Segregation and authorization

- The payment preparer cannot authorize the same attempt when segregation is required.
- Signatory eligibility is determined from active assignments, permissions, method, amount, and effective dates.
- Release/pickup roles and authorization roles are separately permissioned.
- Administrative correction cannot rewrite financial events; it uses controlled void/replacement operations.
- Sensitive references are masked according to role and are excluded from ordinary logs and broad list responses.

## API and frontend behavior

- APIs cover attempt preparation, method details, signatory assignment, authorization, processing, pickup availability, release, clearing, failure, retry, void, and replacement.
- Queue/list APIs support method, state, signatory, department, date, amount, aging, stable sorting, and pagination.
- Payment Tracker displays attempt history, remaining balance, current responsibility, and safe method references.
- Authorized Signatory and release views expose only permitted commands with reason/confirmation dialogs.
- Frontend-only mode uses realistic multi-attempt and partial-payment fixtures.

## Operational and reconciliation requirements

- Record manually entered bank, check, transfer, and reconciliation references with actor, time, and supporting evidence. Bank selection is documentation, not an instruction to a bank.
- Require controlled correction and duplicate-reference checks for manually recorded transfers; no bank response, callback, or electronic settlement confirmation is expected.
- Index active queues, voucher, method, state, external reference, and lifecycle timestamps.
- Preserve enough evidence for later automated reconciliation and audit access.

## Delivery sequence

1. Confirm payment state machines, method-specific fields, partial-payment policy, and signatory matrix.
2. Add attempt, authorization, release, settlement, failure, void, and replacement models.
3. Implement state guards, balance controls, segregation checks, retries, and idempotency.
4. Add preparation, authorization, processing, pickup, release, clearing, failure, retry, and void APIs.
5. Connect payment tracker, signatory queue, check pickup, and settlement history UI.
6. Test partials, overpayment prevention, concurrent authorization, failure recovery, and history preservation.

## Acceptance gates

- Existing request, approval, and Finance flows remain usable; payment preparation, signatory, tracker, and pickup views pass mobile-first checks at mobile, tablet, and desktop widths.

- Multiple and partial attempts reconcile to the voucher without exceeding the payable balance.
- The preparer cannot authorize the same payment where segregation is required.
- Failed, voided, retried, and replacement attempts remain visible and immutable.
- Method-specific references and release/clearing evidence are validated.
- Tracker states and balances reconcile exactly with payment history.

## Test and validation matrix

- Full valid and invalid transition coverage for Check, DigiBanker/Bank Transfer, and Cash.
- Single, split, partial, final, zero, negative, overpayment, and currency mismatch cases.
- Preparer/signatory segregation, ineligible/expired assignment, explicit deny, self-authorization, and release permissions.
- Concurrent authorization/release, duplicate idempotency keys, duplicate manual references, correction, retry, void, and replacement.
- Unique references, balance reconciliation, immutable history, audit completeness, migration replay, backup/restore.
- Browser queues/tracker/pickup/signatory views, responsive/accessibility review, build, security audit, Docker, and CI.

## Expected evidence

- Approved state diagrams and signatory matrix, attempt/reconciliation fixtures, concurrency/failure results, tracker reconciliation, audit samples, browser evidence, QA register updates, reviewed archive/checksum, and CI run.

## Decisions required before implementation

- Authorized-signatory matrix and amount thresholds.
- Policies for payment failures or fund returns after release.
- Reconciliation exceptions and amount-based multi-signatory rules.

## Exclusions

No banking connection is planned in Phase 07 or any later phase. Cash release will record the selected releasing bank and manual payment evidence only; it will not transmit bank instructions or query settlement status.


## Initial payment authorization increment — 2026-10-13

- Finance Associate records one full-amount payment instruction against an issued General voucher, selecting an active Check, Bank Transfer/DigiBanker or Cash method, a transaction/check reference, and one active Authorized Signatory. The amount and currency come from the voucher. Method/reference uniqueness prevents recording the same reference twice for the same method, including references retained after a void.
- The signatory must be different from the requestor, voucher preparer, payment preparer, voucher certifier and journal poster. Current role, active/suspended state and authorization permission are checked when assigning and authorizing. Explicit permission denial and an inactive payment method block authorization.
- Only the assigned signatory gains request, voucher, approval-trail, document and conversation access when the instruction is prepared. Other signatories and future approval roles remain excluded. The assigned user's pending payment queue is visible in the Signatory Approval Queue. Reached access is retained for authorization/void history.
- Authorization appends a decision with the instruction, signatory, reason and time, and marks release pending. It neither releases funds nor marks settlement. Voiding the voucher records invalidation of an authorization; the original decision stays in history.
- This first increment covers one full instruction and one explicitly selected signatory. Amount-based multi-signatory policy, split/partial attempts, processing/release, pickup/clearing, retries/replacements and settlement reconciliation still require later implementation and confirmed rules. No external bank operation is performed by these endpoints.

## Multiple payment line increment — 2026-10-13

The user confirmed one voucher with multiple payment line items, Finance Associate release with evidence, and Finance Manager clearing.

- A voucher contains multiple payment lines, each with description, amount, method, transaction/check reference and an independent assigned Authorized Signatory. Finance can prepare several lines together or add further lines within the unallocated payable balance. Currency and amount precision follow the voucher's currency.
- Each line is authorized separately. Check payments must be marked ready for pickup before release. Bank Transfer and Cash payments can proceed from authorization to release. Finance Associate records release date, releasing bank/cash office, recipient, reason and uploaded evidence. Finance Manager records clearing date, reason and separate uploaded clearing evidence.
- Draft, authorized, pickup-ready, released and cleared lines all reserve their amount. Failed or voided unreleased lines stop reserving their amount. Released and cleared amounts remain reserved; a voucher cannot be voided or a payment failed/voided after release.
- Finance Manager can mark an unreleased line failed or voided. Finance Associate can prepare a replacement of the same amount with a new reference and a link to the predecessor. One predecessor can have only one direct replacement. The replacement requires new authorization; earlier records remain intact.
- Request locks serialize balance changes. Every financial action uses a version and idempotency key. Payment reference uniqueness applies across retained failed/voided records. Evidence uploads are committed with their payment association and retain file hashes and audit records.
- Assigned signatories gain request/conversation visibility upon assignment, including all signatories assigned to different lines. Authorization queues consolidate a request and remain pending while any of that user's lines awaits authorization. Future approvers and unassigned signatories remain excluded.
- Request lists, dashboard and tracker carry the recorded payment state after reload. Details and printed vouchers show individual payment states and allocated, released, cleared and remaining balances.
- Existing single-instruction vouchers remain supported; migration 0025 backfills their amount, currency and sequence without discarding history. Downgrade refuses to discard newly recorded payment history.

This increment covers issued General vouchers. Other request types, payment reversals/fund returns after release, amount-based multi-signatory policy, scheduled notices and detailed reconciliation reporting remain subsequent work. Validation is recorded in `phase-07-payment-validation.md`.

## All request types and confirmed policy — 2026-10-13

User confirmation supersedes the General-only applicability above:

- General, Reimbursement, PO Payment, Cash Advance and Liquidation use the same Finance preparation, posting, certification and payment controls. Each payment line has one independently assigned signatory; additional signatory thresholds are not part of the current policy.
- Reimbursement and PO Payment inherit General VAT/EWT and accounting defaults. Finance Associate can override EWT per request/line and correct draft coding. Reimbursement proof of payment and physical-original requirements remain enforced.
- Cash Advance records gross amounts against a posting advance asset account and configured credit account, without VAT/EWT deductions. Corrections remain restricted to asset accounts, with one advance asset account per request.
- Liquidation records gross expenses and credits the asset account and cost center from the original released advance. The original advance must belong to the same requestor, use the same currency, match the declared amount, and be fully released. Only expenses exceeding the advance create a new payable amount. Account names and cost-center references come from the original posted snapshot.
- Equal expenses require no new payment. Unused funds remain an outstanding advance awaiting the deferred cash-return process. Liquidation can be submitted without falsely claiming an offline return, and submitting a liquidation alone does not close the one-outstanding-advance check.
- Source advance locks and a posted-liquidation check prevent settling an advance twice. Reversed liquidation accounting does not mark an advance settled.
- Finance Manager or System Administrator selects **All request types** during versioned setup activation. Activation requires General defaults plus active posting Cash Advance asset/credit accounts. Old General-only activations retain their scope; new other-type Finance calculations require All activation.
- Tracker approval and payment states come from stored workflow/payment records. Tracker navigation refreshes those records. Newly assigned request links refresh accessible requests instead of opening the request creation form.

Fund returns and post-release reversals remain deferred. Scheduled notifications and detailed reconciliation reporting remain Phase 08 work. See `phase-07-all-types-validation.md` for the implementation and validation register.
