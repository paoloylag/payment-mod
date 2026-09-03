# Phase 03 — Payment Requests

Date prepared: 2026-08-28  
Status: Not started  
Depends on: Phase 02 — Master Data

## Objective

Persist the complete request lifecycle for Reimbursement, Cash Advance, Liquidation, P.O. Payment, and General Payment.

## Scope

- Draft creation, autosave, retrieval, editing, deletion, submission, cancellation, reopening, returning, and resubmission.
- Request numbering, immutable versions and status history, optimistic locking, and idempotent commands.
- Type-specific extension data, line items, department/cost-center allocations, currencies, totals, and rounding.
- Ownership and department visibility using Phase 01 identities and Phase 02 reference data.
- Duplicate invoice/reference checks and outstanding Cash Advance/Liquidation relationships.

## Planned data model

- Payment request root with UUID, type, lifecycle status, owner, department, currency, payee/vendor, purpose, totals, submission data, and current version.
- Immutable request versions containing the business fields used for review and later snapshots.
- Request-type extension tables for Reimbursement, Cash Advance, Liquidation, P.O. Payment, and General Payment.
- Line items with description, merchant/vendor reference, dates, expense account, quantity/rate where applicable, amount, and tax hints.
- One-to-many allocations per line across departments and cost centers.
- Numbering sequence, status-history, idempotency-command, and duplicate-reference records.
- Liquidation-to-Cash-Advance and P.O.-to-request relationships without copying external-system authority into the local database.

## Lifecycle and business rules

- Drafts are editable by their owner or explicitly authorized administrators; submitted content is versioned and locked except through controlled return/reopen paths.
- Delete applies only to eligible drafts. Submitted records retain immutable history and use cancellation instead.
- Autosave uses optimistic locking and rejects stale versions with a conflict response containing the current safe version identifier.
- Submission performs complete server-side validation, generates the request number once, and is idempotent.
- Request totals equal the sum of lines; allocation totals equal their line amount using currency-specific precision.
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

1. Confirm lifecycle states, numbering formats, editable fields, and type-specific requirements.
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

## Decisions required before implementation

- Numbering format and reset period.
- Autosave interval and draft-retention rules.
- Type-specific required fields, amount limits, and duplicate-invoice matching criteria.
- Foreign-currency conversion source and snapshot policy.

## Exclusions

File storage, approval execution, Finance validation, voucher generation, and payment settlement are introduced in Phases 04–07.
