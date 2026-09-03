# Phase 07 — Payment Execution

Date prepared: 2026-08-28  
Status: Not started  
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

- Record external references and reconciliation status without treating an external response as successful until verified by the approved rule.
- Provide safe retry/recovery for timeouts and unknown outcomes to prevent duplicate transfers.
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

- Multiple and partial attempts reconcile to the voucher without exceeding the payable balance.
- The preparer cannot authorize the same payment where segregation is required.
- Failed, voided, retried, and replacement attempts remain visible and immutable.
- Method-specific references and release/clearing evidence are validated.
- Tracker states and balances reconcile exactly with payment history.

## Test and validation matrix

- Full valid and invalid transition coverage for Check, DigiBanker/Bank Transfer, and Cash.
- Single, split, partial, final, zero, negative, overpayment, and currency mismatch cases.
- Preparer/signatory segregation, ineligible/expired assignment, explicit deny, self-authorization, and release permissions.
- Concurrent authorization/release, duplicate idempotency keys, repeated callbacks, timeouts, unknown outcome, retry, void, and replacement.
- Unique references, balance reconciliation, immutable history, audit completeness, migration replay, backup/restore.
- Browser queues/tracker/pickup/signatory views, responsive/accessibility review, build, security audit, Docker, and CI.

## Expected evidence

- Approved state diagrams and signatory matrix, attempt/reconciliation fixtures, concurrency/failure results, tracker reconciliation, audit samples, browser evidence, QA register updates, reviewed archive/checksum, and CI run.

## Decisions required before implementation

- Authorized-signatory matrix and amount thresholds.
- Partial-payment and split-method rules.
- Check pickup/release evidence requirements.
- DigiBanker processing references, clearing confirmation, and reconciliation ownership.

## Exclusions

No live banking connection is enabled; Phase 07 uses development adapters until Phase 09 integration approval.
