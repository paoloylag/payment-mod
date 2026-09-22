# Phase 03 — Payment Requests

Date prepared: 2026-08-28  
Last decision update: 2026-09-21
Status: In progress
Depends on: Phase 02 — Master Data

2026-09-22 approval-independent validation: the 21 focused request API tests and full 58-test backend regression passed against the dedicated PostgreSQL test database; the production frontend build passed. API-connected Requestor draft save/reload and incomplete-submit feedback passed. All five API-connected form routes rendered; all five standalone forms fit a 390 × 844 viewport without page-level horizontal overflow. Standalone mock drafts now survive reload. The full five-type browser lifecycle remains open. See `docs/phase-03-validation.md` and the development/test register for evidence.

## Implementation progress — 2026-09-20

- All five request forms now map their visible shared fields, type-specific fields, line details, master-data IDs,
  currency/amount pairs, references, acknowledgements, and document filenames into the request API contract.
- Submission-time validation is type-specific and returns field-scoped errors; incomplete drafts remain eligible for
  autosave and later completion.
- Reimbursement validates merchant, invoice date/number, account, cost center, amount, receipt, and proof of payment.
- Cash Advance validates event and liquidation dates, positive lines, and accountability acknowledgement without
  enforcing the still-unapproved amount, outstanding-advance, or deadline policies.
- Liquidation validates its Cash Advance reference, dates, advance amount, detailed expense lines, receipts, and proof
  of return when the advance exceeds recorded expenses.
- P.O. Payment validates the P.O. reference, supplier, account/cost-center treatment, amount, and approved-P.O. support.
- General Payment has no request-level `Particulars of Payment` field. Particulars are entered in the request breakdown;
  untouched rows stay optional, while every started row must be complete before submission.
- Ruff, 13 focused request API tests, the complete `46 passed` backend regression, production frontend build, and
  live browser inspection of all five forms passed. Automated tests now refuse non-`_test` databases.
- Concurrent numbering, simultaneous edits, duplicate submissions, exact four-decimal line-total reconciliation,
  excess-precision rejection, bounded pagination, constant-query list loading, and a 130-record performance fixture pass.
- Role-scoped server-side search, filters, stable sorting, pagination metadata, API-backed frontend filters, and the
  retained standalone/hybrid fallback are implemented.
- Draft responses expose their archival deadline and warning state. A disabled-by-default maintenance command supports
  dry runs and audited, batched archival after 90 days without deleting submitted or audit-relevant records.
- PHP, USD, and EUR exact four-decimal persistence, zero/negative submission rejection, maximum supported amounts,
  manager/direct-report visibility, explicit permission denial, unauthorized lifecycle actions, and audited privileged
  administrator reads are covered.
- The complete backend regression passes with `54 passed`; Ruff and the Vite 7.3.6 production build pass. Live browser
  verification confirmed development-role login and the API-connected dashboard without a separate session-loading page.
- The current request API contract and draft-retention operation are documented in `docs/phase-03-api.md`.
- The confirmed model is one item per line and exactly one cost center per line. If an expense applies to different cost
  centers, the requestor records separate lines. Split allocation is not a Phase 03 requirement or completion blocker.

## Confirmed decisions — 2026-09-08

- Submitted requests use `PR-{ACADEMIC_YEAR_START}-{six-digit sequence}`, for example `PR-2026-000001` for academic year 2026–2027. The sequence resets at the start of each academic year, defaults to July, and is generated exactly once during an idempotent submission. Finance users can change the reset month through an audited setting; existing request numbers never change.
- Drafts autosave two seconds after the last edit. Drafts are retained for 90 days; the system warns before archival and does not silently destroy audit-relevant submitted records.
- Every persisted monetary value is represented by an amount column and an ISO currency-code column. This applies to request totals, line amounts, Cash Advance and Liquidation balances, and any later tax or settlement values. Queries and calculations must retrieve the pair together.
- A request is single-currency in the initial implementation. Each line currency must match the request currency. Cross-currency calculations are rejected rather than implicitly converted; exchange rates and PHP-equivalent values are deferred until an approved conversion policy exists.
- Each line represents one item and has exactly one cost center. Expenses chargeable to different cost centers must be entered as separate lines; split allocation within a line is out of scope.
- Type-specific validation follows the source Google Sheet, `Automated Payment System`, supplied on 2026-09-08. Explicit decisions recorded later in this plan take precedence where the source contains an ambiguity or an older rule.

## Source business rules — 2026-09-08

Source: `https://docs.google.com/spreadsheets/d/1jgfaA-KFPBO3rwEUrxlUr3IKt2gSw-lxz1kC1CzJp0c/`

`Sheet1!A1:J19` establishes these Phase 03 request rules:

- A request requires a requestor, payment-request type, and system-provided submission date. Request forms must be printable.
- Reimbursement requires an event/purpose and one or more departments/cost centers. Its repeatable lines contain invoice date, invoice number, vendor/merchant, particulars/details, amount plus currency, and one uploaded invoice/receipt per line. The system computes the total.
- Cash Advance requires an event/purpose and one or more departments/cost centers. Its repeatable lines contain particulars and amount plus currency. The system computes the total.
- P.O. Payment requires an approved P.O., particulars, and one or more departments/cost centers.
- General Payment requires a billing document or invoice and one or more departments/cost centers. The source's mandatory-field text says `Particulars of P.O. payment`; this is treated as an unresolved copy/paste ambiguity, not silently enforced as a General Payment label.
- The Department Head receives the submitted request details and attachments for review. Return-for-information permits the requestor to edit, comment, add required documents where applicable, and resubmit to the returning reviewer.
- Disapproval requires a reason and notifications to the roles already involved. Comments/notes are permitted at review steps.

`Sheet2!A1:C6` defines these document rules:

- Reimbursement: Invoice; Billing / Quotation / SOA when available; Proof of Payment.
- P.O. Payment: BIR 2303 for a new supplier; Billing / Quotation / SOA; Invoice when available.
- General Payment: BIR 2303 for a new supplier; Billing / Quotation / SOA; Invoice when available.

The source also records later-phase approval, notification, payment, tracking, archiving, and accounting-posting behavior. Those rules remain authoritative inputs to Phases 04–08 rather than expanding Phase 03 implementation scope.

### Source discrepancies requiring confirmation

- `Sheet1` omits Liquidation, but the owner subsequently confirmed and implemented it as the fifth request type.
- General Payment uses complete request-breakdown rows instead of a request-level particulars field. Its final document rules remain pending Finance confirmation because the source sheet contains ambiguous P.O. wording.
- `Sheet3` lists Cash Advance guidelines and policies as outstanding work. The source does not approve an amount limit, one-outstanding-advance rule, or liquidation deadline; those policies must not be enforced as authoritative until separately confirmed.
- `Sheet2` does not specify Cash Advance or Liquidation documents. Confirm their required-document lists before Phase 04.
- The source mentions auto-numbering during document upload. The later confirmed rule governs implementation: the permanent `PR-{YEAR}-{sequence}` number is assigned exactly once on successful submission.

## Objective

Persist the complete request lifecycle for Reimbursement, Cash Advance, Liquidation, P.O. Payment, and General Payment.

## Scope

- Draft creation, autosave, retrieval, editing, deletion, submission, cancellation, reopening, returning, and resubmission.
- Request numbering, immutable versions and status history, optimistic locking, and idempotent commands.
- Type-specific extension data, line items with one cost center each, currencies, totals, and rounding.
- Ownership and department visibility using Phase 01 identities and Phase 02 reference data.
- Duplicate invoice/reference checks and outstanding Cash Advance/Liquidation relationships.

## Planned data model

- Payment request root with UUID, type, lifecycle status, owner, department, currency, payee/vendor, purpose, totals, submission data, and current version. Each total stores `amount` and `currency_code` together.
- Immutable request versions containing the business fields used for review and later snapshots.
- Request-type extension tables for Reimbursement, Cash Advance, Liquidation, P.O. Payment, and General Payment.
- Line items with description, merchant/vendor reference, dates, expense account, quantity/rate where applicable, `amount`, `currency_code`, and tax hints.
- Each line stores one department/cost-center reference and an `amount` plus `currency_code` constrained to the parent request currency.
- Numbering sequence, status-history, idempotency-command, and duplicate-reference records.
- Liquidation-to-Cash-Advance and P.O.-to-request relationships without copying external-system authority into the local database.

## Lifecycle and business rules

- Drafts are editable by their owner or explicitly authorized administrators; submitted content is versioned and locked except through controlled return/reopen paths.
- Delete applies only to eligible drafts. Submitted records retain immutable history and use cancellation instead.
- Autosave uses optimistic locking and rejects stale versions with a conflict response containing the current safe version identifier.
- Submission performs complete server-side validation, generates the request number once, and is idempotent.
- Request totals equal the sum of lines using exact four-decimal precision. Amounts with different currency codes must never be summed or compared directly.
- Duplicate checks consider the approved combination of vendor/payee, invoice/reference number, amount, date, and request state.
- Cash Advance and Liquidation rules validate event dates, due dates, outstanding advances, linked advance balances, and Proof of Return requirements.
- P.O. Payment validates the approved P.O. reference and conditional supplier/BIR requirements without trusting browser-supplied approval claims.

## Authorization and visibility

- Requestors see and mutate only their own eligible requests.
- Managers and Department Heads see only authorized department requests and cannot silently assume request ownership.
- Finance and later approver roles receive read access only when the lifecycle/policy grants it.
- System Administrator access is audited and does not bypass business-state invariants.
- Every material lifecycle action records actor, reason, version, request ID, and correlation ID.

## API contract requirements

- List endpoints support role-scoped search, type/status/department/date filters, stable sorting, and bounded pagination.
- Draft creation and command endpoints accept idempotency keys where duplicate submission is possible.
- Read and mutation responses include a version token for optimistic concurrency.
- Validation errors use safe field-level problem details; conflicts distinguish stale versions, duplicates, and invalid transitions.
- Calculated totals are authoritative server outputs, not trusted client inputs.

## Frontend implementation

- Connect New Request, dashboard lists, request detail, workflow preview, search, and filters to persisted APIs.
- Provide type-specific forms while retaining shared request, payee, currency, line, cost-center, and document-placeholder components.
- Show autosave state, stale-version conflicts, validation summaries, duplicate warnings, and unsaved-change protection.
- Preserve frontend-only fixtures with the same shapes and lifecycle outcomes needed for independent UI work.

## Security and performance

- Prevent mass assignment by mapping only explicitly supported fields.
- Apply request and department authorization within query construction, not only after records are loaded.
- Index owner, department, status, type, request number, submission time, and approved duplicate-check fields.
- Avoid exposing confidential request details through search suggestions, errors, logs, or unauthorized counts.

## Delivery sequence

1. Confirm lifecycle states and editable fields, then reconcile type-specific requirements against the reattached source workbook. Numbering, autosave, retention, and initial currency behavior are confirmed.
2. Add request, version, line, extension, and history migrations/models.
3. Implement calculation, validation, locking, duplicate-detection, and authorization services.
4. Add draft, autosave, submit, cancel, reopen, return, resubmit, list, and detail APIs.
5. Connect request forms, dashboard lists, filters, and detail views to persisted data.
6. Add concurrency, boundary, visibility, and lifecycle tests for every request type.

## Planned API areas

`/requests`, `/requests/{id}`, `/requests/{id}/submit`, `/cancel`, `/reopen`, `/return`, and `/resubmit`, with version tokens on mutations.

## Acceptance gates

- Each request type completes its valid lifecycle and invalid transitions fail server-side.
- Line totals reconcile exactly to the request total across PHP, USD, EUR, and configured currencies.
- Concurrent edits return a clear conflict instead of silently overwriting data.
- Ownership, role, and department visibility tests pass.
- Persisted requests reload accurately and prototype list/search/filter views use API data.

## Test and validation matrix

- Migration rollback/replay, deterministic request fixtures, and numbering-sequence concurrency.
- Valid and invalid lifecycle paths for all five request types.
- Autosave and simultaneous-edit conflicts, idempotent submission, and duplicate-request races.
- Decimal rounding, multi-line, PHP/USD/EUR, zero/negative amount, and reconciliation boundaries.
- Ownership, manager association, department scope, explicit deny, and administrator audit tests.
- Outstanding Cash Advance, Liquidation linkage, P.O. reference, conditional-document, cancel/reopen/return/resubmit rules.
- API list/filter/sort/pagination and larger-data performance checks.
- Integrated and standalone browser form, reload, list, filter, responsive, accessibility, build, Docker, and CI validation.

## Expected evidence

- State-transition and data-model references, OpenAPI examples, migration output, automated results/coverage, calculation fixtures, concurrency results, browser validation, QA register updates, reviewed commits, package checksum, and CI run.

## Decisions still required before implementation

- Confirm lifecycle-state names and which fields may be edited after return or authorized reopen.
- Resolve the remaining source discrepancies listed above, particularly the General Payment particulars and document rules.
- Confirm duplicate-invoice matching criteria. The source requires invoice numbers and per-line invoices for Reimbursement but does not define exact duplicate behavior.
- Foreign-currency conversion is out of the initial implementation. Before conversion is enabled, Finance must approve the rate source, rate timestamp/date, rounding, base currency, and immutable exchange-rate snapshot policy.

## Exclusions

File storage, approval execution, Finance validation, voucher generation, and payment settlement are introduced in Phases 04–07.
