# Automated Payment System Project Manifest

Status: Reconciled frontend prototype and approved backend implementation scope
Manifest version: 1.1
Last updated: 2026-08-19  
Primary functional specification: `FSD-Automated-Payment-System-v1.2.docx`

## Purpose

This manifest records the intended implementation scope for the Automated Payment System. The current repository contains a comprehensive front-end prototype and a minimal FastAPI/PostgreSQL scaffold. The backend capabilities below are approved roadmap items and must be treated as requirements when the prototype is converted into a persistent, backend-enabled system.

Roadmap items are not complete unless explicitly identified as implemented. Completion status must be updated only after code, migrations, tests, and documentation have been reviewed.

## Frontend repository and handoff state

- Canonical folder: `F:/My Files/Documents/ChatGPT/Automated Payment System/front-end development`.
- Maintained branch: `codex/frontend-only-prototype`.
- Published base: `3e4b30d` (`Synchronize frontend deployment shell`).
- The earlier local branch was safely reconciled onto that published base; overlapping changes in `index.html`, `package.json`, `src/App.jsx`, and `src/prototype.js` were resolved.
- A recovery stash named `reconcile-frontend-2026-08-19` remains available until the reconciliation commit is created and pushed.
- Obsolete GitHub branches `codex/aps-feedback-phases-1-5` and `feature/payment-form-dashboard-updates` were deleted after verification that they contained no unique remote commits.
- The only maintained development branches are `codex/frontend-only-prototype` and `codex/backend-integration`; `main` remains the stable release branch.

## Frontend updates completed

- Adopted the LifeOS boilerplate shell and dark-mode implementation while preserving the payment workflows and responsive behavior.
- Added `src/boilerplate-shell.css` as the isolated shell/theme override layer.
- Added `src/data-source.js` with `mock`, `hybrid`, and `api` modes; `hybrid` remains runnable when the backend is unavailable.
- Added `.env.example` defaults for the data-source mode and API base URL.
- Added a backend connection/fallback indicator to the deployed static runtime.
- Preserved the synchronized React build entry and TypeScript/Vite configuration from the latest published frontend commit.
- Added `*.tsbuildinfo` to `.gitignore` so incremental build output is not committed.
- Synchronized the validated static runtime into `codex/backend-integration` for its GitHub Pages preview.

Validation completed on 2026-08-19:

- TypeScript project build passed.
- Vite 7.0.7 production build passed.
- The backend-branch embedded frontend passed the same production build.
- Runtime files shared with the backend branch were verified byte-for-byte identical after synchronization.
- No unresolved merge markers or Git index conflicts remain.

Pending delivery:

- Commit and push the staged frontend reconciliation.
- Commit and push Phase 00 on `codex/backend-integration`.
- Verify the stable Pages site at `/payment-mod/` and backend preview at `/payment-mod/backend-preview/`.

## Current baseline

- Front end demonstrates role-based workflows, request forms, approvals, Finance validation, vouchers, notifications, dashboards, tracking, and reports using prototype data.
- The backend Phase 00 working tree now includes `/healthz`, `/readyz`, `/api`, and `/api/v1/system/status`.
- PostgreSQL connectivity, environment configuration, Alembic scaffolding, and Docker Compose are present.
- Phase 00 includes the reversible `system_settings` migration, seed command, standardized errors/logging/request IDs, tests, Docker startup, and CI/CD foundation. Business entities, authorization, uploads, workflow services, notifications, reports, and domain APIs remain to be implemented.

## Target architecture

- FastAPI REST API with versioned routes.
- PostgreSQL as the system of record.
- SQLAlchemy for persistence and Alembic for schema migrations.
- Service-layer business rules and an explicit workflow state machine.
- Adapter interfaces for Life OS identity, document storage, email, procurement/P.O., ERP, and banking.
- Philippine Time (`Asia/Manila`) for business timestamps, returned with UTC+08:00 offsets.
- Docker-based local development with repeatable migrations and seed data.

## Backend feature inventory

### BE-01 — Identity and role-based access

Implement acting-user resolution, demonstration identities or Life OS-ready claims, roles, department access, request ownership, workflow assignment, endpoint authorization, delegated authority, and segregation of payment preparation from authorization.

Acceptance gate: protected endpoints reject unauthenticated or unauthorized actions; role and department boundary tests pass.

### BE-02 — Master and configuration data

Implement users, roles, departments, cost centers, vendors/payees, approval assignments, payment methods, document rules, tax codes, aging rules, numbering sequences, notification templates, and effective-dated configuration history.

Acceptance gate: configuration can be seeded deterministically and historical requests retain the policy version used at submission.

### BE-03 — Payment request lifecycle

Implement draft creation, auto-save, retrieval, update, deletion, submission, request-number generation, cancellation, correction, resubmission, versioning, authorized unlocking, and immutable status history for Reimbursement, Liquidation, Cash Advance, P.O. Payment, and General Payment.

Acceptance gate: each request type can complete its valid lifecycle and invalid transitions are rejected server-side.

### BE-04 — Expense lines, allocations, and currencies

Implement expense lines, merchant/vendor fields, references, attachments, expense accounts, currency, totals, and one-to-many department/cost-center allocations. Enforce that line totals equal the request total and allocation totals equal their line amount.

Acceptance gate: rounding, multi-line, multi-allocation, PHP, USD, EUR, and custom-currency tests pass.

### BE-05 — Request-type business rules

Implement required fields and documents by type, Cash Advance event/liquidation dates and limits, outstanding-advance checks, Liquidation linkage and Proof of Return, approved P.O. reference and conditional BIR 2303 rules, General Payment documents, and Reimbursement/Liquidation line requirements.

Acceptance gate: boundary and failure tests exist for every configured rule.

### BE-06 — Secure document service

Implement authorized upload, download, replacement, removal where permitted, file versions, hashes, format/size restrictions, request-level and line-level links, hard/soft-copy status, Finance review decisions, and storage abstraction. Use local protected storage for development; do not store file binaries in PostgreSQL.

Acceptance gate: unauthorized access is blocked, replaced files retain history, and required-document checks operate on persisted metadata.

### BE-07 — Workflow and approval engine

Implement policy-snapshotted routes, current assignments, queue queries, sequential controls, approve, return, decline, delegate, reroute, comment requirements, threshold boundaries, and audit events for Department Head, Finance Associate, Finance Manager, COO, President, Board Member, and Authorized Signatory.

Acceptance gate: budgeted and unbudgeted threshold routes—including Board approval above PHP 1,000,000—pass automated tests.

### BE-08 — Finance validation

Implement document and line decisions, VAT classification, EWT code/rate/amount, Total Sales, VAT, Net of VAT, EWT, final payable amount, No EWT rules, receipt-copy status, tax snapshots, debit/credit entries, balanced-entry enforcement, reviewer notes, and system completion timestamp.

Acceptance gate: validation cannot complete with missing documents, invalid tax data, or unbalanced entries.

### BE-09 — Voucher lifecycle

Implement voucher numbering, creation after final approval, request/tax/accounting snapshots, printing data, payment method, optional Check Number, Transaction Number, digital approval certification, posting, voiding, and replacement history.

Acceptance gate: voucher creation is idempotent, unauthorized creation fails, and void/replacement operations preserve history.

### BE-10 — Payment and authorization lifecycle

Implement payment attempts, Check/Bank Transfer (DigiBanker)/Cash methods, preparation, authorized-signatory assignments and decisions, processing references, available-for-pick-up, release, clearing, completion, failure, voiding, and replacement checks/transfers.

Acceptance gate: multiple attempts can be recorded without overwriting earlier attempts; preparation and authorization duties remain separated.

### BE-11 — Notifications

Implement durable notification jobs for submission, approval, validation, return, decline, voucher, authorization, processing, pick-up, release, and completion. Record recipient, template, payload, request link, queued/sent/retry/failed state, attempts, timestamps, and idempotency key. Use a development mailbox/log until production email is approved.

Acceptance gate: retrying a business operation does not create duplicate notifications.

### BE-12 — Dashboards, tracker, search, and reports

Implement role-scoped metrics, approval queues, live requests, request detail, workflow timelines, department/status/type filters, pagination, sorting, aging and overdue calculations, payment tracker, unclaimed checks, completed payments, archive search, Excel-compatible CSV, and print-ready report data.

Acceptance gate: query permissions and report totals match source transactions; large-result queries are paginated.

### BE-13 — Immutable audit trail

Record actor/system identity, action, entity, request version, reason, before/after values when appropriate, correlation ID, IP/client metadata where approved, and Philippine Time for material request, document, workflow, Finance, voucher, payment, notification, configuration, and permission events.

Acceptance gate: audit records cannot be edited or deleted through normal business APIs.

### BE-14 — Transactions and idempotency

Use database transactions, optimistic or explicit concurrency controls, unique processing keys, and idempotency keys for submission, approval decisions, voucher creation, payment attempts, integration commands, exports where needed, and notification creation.

Acceptance gate: repeated identical commands do not create duplicate financial records or conflicting workflow events.

### BE-15 — API operations and security

Implement versioned routes, Pydantic schemas, standardized validation/problem responses, safe error identifiers, query limits, secure configuration, secret management, financial-data masking, structured logs, correlation IDs, health/readiness endpoints, and OpenAPI documentation. Never store bank passwords, PINs, OTPs, or signing credentials.

Acceptance gate: secrets and full sensitive bank data do not appear in logs or ordinary API responses.

### BE-16 — Database delivery and recovery

Create complete migrations, referential constraints, indexes, seeds, demonstration records, backup/restore procedures, migration rollback guidance, and safe local reset procedures. Normal APIs must not hard-delete submitted financial or audit history.

Acceptance gate: a clean database can be migrated and seeded, and a backup can be restored in a documented test.

### BE-17 — Automated testing

Implement unit, repository, API integration, permission, workflow, threshold-boundary, validation, idempotency, reporting, and end-to-end tests. Include failure paths such as missing files, unbalanced entries, stale versions, duplicate commands, failed notifications, failed transfers, and voided checks.

Acceptance gate: required tests run in a repeatable local or CI environment and block regressions in financial controls.

### BE-18 — External integration adapters

Define replaceable interfaces for Life OS SSO/users, vendor and P.O. master data, object/document storage, email, ERP/accounting posting, and banking/DigiBanker. Provide safe development adapters and contract tests. External failures must not corrupt internal workflow state.

Acceptance gate: a development adapter can be replaced by a contract-compatible provider without changing core workflow services.

## Delivery sequence

1. Foundation: schema, migrations, identity context, RBAC, master data, audit framework, logging, errors, and seeds.
2. Requests: drafts, request types, expense lines, allocations, validations, uploads, submission, and versioning.
3. Approvals: route generation, assignments, queues, decisions, returns, declines, resubmission, and notifications.
4. Finance: document review, VAT/EWT, accounting entries, and validation completion.
5. Vouchers and payments: voucher snapshots, authorization, attempts, pick-up/release, completion, voids, and replacements.
6. Reporting: dashboards, tracker, aging, archive search, CSV, print datasets, and unclaimed checks.
7. Production integrations: Life OS SSO, email, external storage, procurement/P.O., ERP, and banking.

## Decisions required before production integration

- Real login versus demonstration personas during the backend prototype.
- Local development storage versus an approved external document-storage provider.
- Ownership and source of vendor, P.O., department, and cost-center master data.
- Whether one request may create multiple vouchers or partial/multiple releases.
- Live email delivery versus a development mailbox/log during prototyping.
- Multi-company or multi-branch requirements.
- Foreign-exchange rate source, approval, and accounting treatment.
- Authority to cancel, void, reopen, reroute, delegate, or urgently unlock records.
- Record and document retention periods.
- Required segregation-of-duties combinations.
- Production recovery objectives and infrastructure ownership.

## Definition of backend completion

A backend feature is complete only when its migration, persistence model, service rules, authorization, API contract, audit behavior, automated tests, error handling, and developer documentation are present. A front-end mock or hard-coded sample is not considered backend implementation.
