# Phase 03 — Payment Requests

Date prepared: 2026-08-28  
Last decision update: 2026-09-08
Status: In progress
Depends on: Phase 02 — Master Data

## Confirmed decisions — 2026-09-08

- Submitted requests use `PR-{YEAR}-{six-digit sequence}`, for example `PR-2026-000001`. The sequence resets each calendar year and is generated exactly once during an idempotent submission.
- Drafts autosave two seconds after the last edit. Drafts are retained for 90 days; the system warns before archival and does not silently destroy audit-relevant submitted records.
- Every persisted monetary value is represented by an amount column and an ISO currency-code column. This applies to request totals, line amounts, allocation amounts, Cash Advance and Liquidation balances, and any later tax or settlement values. Queries and calculations must retrieve the pair together.
- A request is single-currency in the initial implementation. Each line and allocation currency must match the request currency. Cross-currency calculations are rejected rather than implicitly converted; exchange rates and PHP-equivalent values are deferred until an approved conversion policy exists.
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

- `Sheet1` lists Reimbursement, Cash Advance, P.O. Payment, and General Payment, but the approved project plan also includes Liquidation. Confirm that Liquidation remains a fifth request type.
- General Payment is retained exactly as currently implemented, including the `Particulars of Payment` label. Its final detailed validation and document rules remain pending Finance confirmation because the source sheet contains ambiguous P.O. wording.
- `Sheet3` lists Cash Advance guidelines and policies as outstanding work. The source does not approve an amount limit, one-outstanding-advance rule, or liquidation deadline; those policies must not be enforced as authoritative until separately confirmed.
- `Sheet2` does not specify Cash Advance or Liquidation documents. Confirm their required-document lists before Phase 04.
- The source mentions auto-numbering during document upload. The later confirmed rule governs implementation: the permanent `PR-{YEAR}-{sequence}` number is assigned exactly once on successful submission.

## Objective

Persist the complete request lifecycle for Reimbursement, Cash Advance, Liquidation, P.O. Payment, and General Payment.

## Scope

- Draft creation, autosave, retrieval, editing, deletion, submission, cancellation, reopening, returning, and resubmission.
- Request numbering, immutable versions and status history, optimistic locking, and idempotent commands.
- Type-specific extension data, line items, department/cost-center allocations, currencies, totals, and rounding.
- Ownership and department visibility using Phase 01 identities and Phase 02 reference data.
- Duplicate invoice/reference checks and outstanding Cash Advance/Liquidation relationships.

## Planned data model

- Payment request root with UUID, type, lifecycle status, owner, department, currency, payee/vendor, purpose, totals, submission data, and current version. Each total stores `amount` and `currency_code` together.
- Immutable request versions containing the business fields used for review and later snapshots.
- Request-type extension tables for Reimbursement, Cash Advance, Liquidation, P.O. Payment, and General Payment.
- Line items with description, merchant/vendor reference, dates, expense account, quantity/rate where applicable, `amount`, `currency_code`, and tax hints.
- One-to-many allocations per line across departments and cost centers, each with its own `amount` and `currency_code` constrained to the parent request currency.
- Numbering sequence, status-history, idempotency-command, and duplicate-reference records.
- Liquidation-to-Cash-Advance and P.O.-to-request relationships without copying external-system authority into the local database.

## Lifecycle and business rules

- Drafts are editable by their owner or explicitly authorized administrators; submitted content is versioned and locked except through controlled return/reopen paths.
- Delete applies only to eligible drafts. Submitted records retain immutable history and use cancellation instead.
- Autosave uses optimistic locking and rejects stale versions with a conflict response containing the current safe version identifier.
- Submission performs complete server-side validation, generates the request number once, and is idempotent.
- Request totals equal the sum of lines; allocation totals equal their line amount using currency-specific precision. Amounts with different currency codes must never be summed or compared directly.
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
- Provide type-specific forms while retaining shared request, payee, currency, line, allocation, and document-placeholder components.
- Show autosave state, stale-version conflicts, validation summaries, duplicate warnings, and unsaved-change protection.
- Preserve frontend-only fixtures with the same shapes and lifecycle outcomes needed for independent UI work.

## Security and performance

- Prevent mass assignment by mapping only explicitly supported fields.
- Apply request and department authorization within query construction, not only after records are loaded.
- Index owner, department, status, type, request number, submission time, and approved duplicate-check fields.
- Avoid exposing confidential request details through search suggestions, errors, logs, or unauthorized counts.

## Delivery sequence

1. Confirm lifecycle states and editable fields, then reconcile type-specific requirements against the reattached source workbook. Numbering, autosave, retention, and initial currency behavior are confirmed.
2. Add request, version, line, allocation, extension, and history migrations/models.
3. Implement calculation, validation, locking, duplicate-detection, and authorization services.
4. Add draft, autosave, submit, cancel, reopen, return, resubmit, list, and detail APIs.
5. Connect request forms, dashboard lists, filters, and detail views to persisted data.
6. Add concurrency, boundary, visibility, and lifecycle tests for every request type.

## Planned API areas

`/requests`, `/requests/{id}`, `/requests/{id}/submit`, `/cancel`, `/reopen`, `/return`, and `/resubmit`, with version tokens on mutations.

## Acceptance gates

- Each request type completes its valid lifecycle and invalid transitions fail server-side.
- Line totals and allocations reconcile exactly across PHP, USD, EUR, and configured currencies.
- Concurrent edits return a clear conflict instead of silently overwriting data.
- Ownership, role, and department visibility tests pass.
- Persisted requests reload accurately and prototype list/search/filter views use API data.

## Test and validation matrix

- Migration rollback/replay, deterministic request fixtures, and numbering-sequence concurrency.
- Valid and invalid lifecycle paths for all five request types.
- Autosave and simultaneous-edit conflicts, idempotent submission, and duplicate-request races.
- Decimal rounding, multi-line, multi-allocation, PHP/USD/EUR, zero/negative amount, and reconciliation boundaries.
- Ownership, manager association, department scope, explicit deny, and administrator audit tests.
- Outstanding Cash Advance, Liquidation linkage, P.O. reference, conditional-document, cancel/reopen/return/resubmit rules.
- API list/filter/sort/pagination and larger-data performance checks.
- Integrated and standalone browser form, reload, list, filter, responsive, accessibility, build, Docker, and CI validation.

## Expected evidence

- State-transition and data-model references, OpenAPI examples, migration output, automated results/coverage, calculation fixtures, concurrency results, browser validation, QA register updates, reviewed commits, package checksum, and CI run.

## Decisions still required before implementation

- Confirm lifecycle-state names and which fields may be edited after return or authorized reopen.
- Resolve the source discrepancies listed above, particularly Liquidation scope and the General Payment particulars label.
- Confirm duplicate-invoice matching criteria. The source requires invoice numbers and per-line invoices for Reimbursement but does not define exact duplicate behavior.
- Foreign-currency conversion is out of the initial implementation. Before conversion is enabled, Finance must approve the rate source, rate timestamp/date, rounding, base currency, and immutable exchange-rate snapshot policy.

## Exclusions

File storage, approval execution, Finance validation, voucher generation, and payment settlement are introduced in Phases 04–07.
