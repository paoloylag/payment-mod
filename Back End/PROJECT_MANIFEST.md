# Automated Payment System Project Manifest

Status: Approved phased backend implementation scope
Manifest version: 2.0
Last updated: 2026-08-19
Primary functional specification: `FSD-Automated-Payment-System-v1.2.docx`

## Purpose

This manifest records the intended implementation scope for the Automated Payment System. The current repository contains a comprehensive front-end prototype and a minimal FastAPI/PostgreSQL scaffold. The backend capabilities below are approved roadmap items and must be treated as requirements when the prototype is converted into a persistent, backend-enabled system.

This file does not assert that an item is implemented. Completion status must be updated only after code, migrations, tests, and documentation have been reviewed.

This manifest is also the handoff document for continuing the work in a later Codex task or development session. A new contributor should read the current-state, delivery, validation, and continuation sections before editing code.

## Workspace and repository layout

The workspace currently contains two distinct working areas:

```text
Automated Payment System/
├── Back End/                  # FastAPI/PostgreSQL scaffold and backend design
└── front-end development/     # Canonical runnable prototype and separate Git checkout
```

Important repository context:

- The parent repository is on `codex/backend-integration` at merge commit `505097a` and includes the latest `main` merged on 2026-08-19.
- The backend project was moved under `Back End/`; the parent repository therefore currently reports the former root paths as deleted and `Back End/` as untracked. Do not reset or discard these changes without first deciding how the repository should permanently represent this directory move.
- The canonical frontend is `../front-end development/`, relative to this manifest.
- The frontend is a separate Git checkout on `codex/aps-feedback-phases-1-5` at commit `59d4bbd` with uncommitted prototype and boilerplate-shell changes.
- The obsolete `Back End/front-end development/` duplicate was removed after its valid Git checkout and project files were consolidated into the canonical root frontend folder.
- The folders `tmp/` and `worktrees/` exist at the workspace root and must not be treated as application source without inspection.

## Work completed before backend implementation

- Fetched and checked out `codex/backend-integration` from `paoloylag/payment-mod`.
- Merged the latest `origin/main` into the backend branch.
- Confirmed that the backend currently has no implemented authentication, user management, role enforcement, business models, or business APIs.
- Audited `dcbj-lai/lifeos-tenant-boilerplate` for reusable UI and authentication patterns.
- Adopted the LifeOS boilerplate as the prototype shell and dark-mode basis where practical.
- Added a gradient application sidebar, sticky translucent topbar, search placeholder, notification placeholder, theme control, avatar-based user chip, mobile navigation behavior, and system-theme detection.
- Preserved the existing payment request, approval, document, voucher, tracker, reporting, email, and persona simulations.
- Corrected the prototype entry to use an ES module so Vite bundles the JavaScript in production.
- Added `src/boilerplate-shell.css` to the canonical frontend as an isolated final override layer so existing feedback-phase styles remain intact.
- Verified a Vite 8.1.4 production build in the canonical frontend.
- No local prototype server was running when the frontend folders were consolidated.

Current frontend files with uncommitted changes include:

```text
index.html
src/App.jsx
src/prototype.js
src/responsive.css
src/styles.css
src/boilerplate-shell.css   # new
```

The deployed runtime remains `src/prototype.js`. `src/App.jsx` is maintained for React parity but is not the current production entry point.

## Current baseline

- Front end demonstrates role-based workflows, request forms, approvals, Finance validation, vouchers, notifications, dashboards, tracking, and reports using prototype data.
- FastAPI currently exposes `/api` and `/healthz` only.
- PostgreSQL connectivity, environment configuration, Alembic scaffolding, and Docker Compose are present.
- Business entities, migrations, repositories, workflow services, authorization, uploads, notifications, reports, and business APIs remain to be implemented.

Current backend endpoints:

```text
GET /healthz
GET /api
```

Current backend stack:

- Python and FastAPI 0.116.1
- SQLAlchemy 2.0.42
- Psycopg 3.2.9
- Alembic 1.16.4
- PostgreSQL through Docker Compose
- Pydantic Settings 2.10.1

There are no domain migrations under `migrations/versions/` yet.

## Target architecture

- FastAPI REST API with versioned routes.
- PostgreSQL as the system of record.
- SQLAlchemy for persistence and Alembic for schema migrations.
- Service-layer business rules and an explicit workflow state machine.
- Adapter interfaces for Life OS identity, document storage, email, procurement/P.O., ERP, and banking.
- Philippine Time (`Asia/Manila`) for business timestamps, returned with UTC+08:00 offsets.
- Docker-based local development with repeatable migrations and seed data.

Recommended package layout:

```text
api/payment_module/
├── main.py
├── config.py
├── database.py
├── auth/
├── users/
├── master_data/
├── requests/
├── documents/
├── workflows/
├── approvals/
├── finance/
├── vouchers/
├── payments/
├── notifications/
├── reports/
├── audit/
└── integrations/
```

Each domain should normally contain its models, Pydantic schemas, routes, service-layer rules, persistence/repository logic, authorization checks, and tests.

## Continuously runnable delivery model

Backend work must be delivered phase by phase without losing the ability to demonstrate the prototype.

The frontend should use an explicit data-source adapter:

```text
Frontend screen
  -> domain service or hook
    -> real API adapter for completed functionality
    -> mock adapter for unfinished functionality
```

Supported frontend modes should be:

```env
VITE_DATA_SOURCE=mock
VITE_DATA_SOURCE=hybrid
VITE_DATA_SOURCE=api
```

- `mock`: the standalone prototype uses only sample data.
- `hybrid`: completed phases use the API while unfinished domains continue using mocks. This is the default during implementation.
- `api`: all supported functionality uses backend persistence and authorization.

Every phase must end with a locally runnable frontend and backend. A phase is not complete merely because its backend endpoints exist.

## Phase validation cycle

For every implementation phase:

1. Finalize the phase API contract and permission rules.
2. Add database migrations and seed changes.
3. Implement domain models, repositories, services, routes, and audit behavior.
4. Add unit, integration, authorization, and failure-path tests.
5. Connect only the affected frontend screens through the real API adapter.
6. Retain mock adapters for unfinished domains.
7. Exercise loading, empty, success, validation, conflict, unauthorized, and server-error states.
8. Run backend tests and the frontend production build.
9. Launch the complete prototype locally and validate the phase checklist.
10. Record validation approval and create a stable commit or tag before starting the next phase.

Suggested phase tags:

```text
phase-00-foundation
phase-01-auth-rbac
phase-02-master-data
phase-03-payment-requests
phase-04-documents
phase-05-workflow-approvals
phase-06-finance-vouchers
phase-07-payment-execution
phase-08-notifications-reporting
phase-09-admin-integrations
```

## Phased implementation roadmap

### Phase 00 — Foundation

- Introduce `/api/v1` routing.
- Define standard errors, pagination, filtering, sorting, correlation IDs, logging, CORS, and Philippine Time helpers.
- Establish transaction conventions, test fixtures, migration checks, and deterministic seed commands.
- Add readiness in addition to liveness/health checks.

Prototype validation: show API/database status without blocking mock workflows.

### Phase 01 — Authentication and RBAC

- Local development login, logout, and session endpoint.
- Users, roles, permissions, user roles, permission overrides, departments, activation, and suspension.
- Server-side authorization dependencies and audited permission changes.
- Initial roles: Requestor, Department Head, Finance Associate, Finance Manager, COO, President, Board Member, Authorized Signatory, and System Administrator.

Prototype validation: login screen, authenticated user chip, role-driven navigation, and unauthorized states. Keep a safe development-login path until Life OS SAML is ready.

### Phase 02 — Master data

- Departments, cost centers, vendors, vendor contacts, chart of accounts, tax codes, currencies, payment methods, company bank accounts, and document types.
- Encrypt and mask sensitive bank details.

Prototype validation: replace form dropdown mocks and administration reference lists with API data.

### Phase 03 — Payment requests

- Draft create, autosave, retrieve, edit, delete, submit, cancel, reopen, return, and resubmit.
- Request numbering, request versions, optimistic locking, request-type extension data, line items, allocations, currency rules, totals, and duplicate invoice checks.
- Request types: Reimbursement, Cash Advance, Liquidation, P.O. Payment, and General Payment.

Prototype validation: create and persist each request type, reload it, submit it, list it, filter it, and enforce ownership/department visibility.

### Phase 04 — Documents

- Private upload/download, metadata, checksums, versions, replacements, required-document rules, request- and line-level links, and hard/soft-copy status.
- Storage adapter with protected local development storage first.
- Malware-scanning integration point for production.

Prototype validation: upload, replace, preview, download, and review document requirements against persisted requests.

### Phase 05 — Workflow and approvals

- Generate a policy-snapshotted approval route at submission.
- Role or identity assignments, queues, sequential controls, approve, return, decline, delegate, reassign, reroute, and authorized unlocking.
- Immutable workflow events and idempotent transition commands.

Prototype validation: each persona sees only its assigned queue and the request advances or returns according to backend decisions.

### Phase 06 — Finance validation and vouchers

- Document and line decisions, VAT/EWT classification, tax snapshots, No EWT rule, receipt status, accounting entries, balanced-entry enforcement, and completion timestamp.
- Voucher numbering, request/tax/accounting snapshots, payment method, check/transaction references, digital approval certification, printing data, posting, voiding, and replacement history.

Prototype validation: Finance completes validation and generates a persisted printable voucher only after required approvals.

### Phase 07 — Payment execution

- Payment attempts and partial settlements.
- Check, Bank Transfer/DigiBanker, and Cash methods.
- Preparation, signatory assignment, authorization, processing reference, pickup availability, release, clearing, failure, retry, voiding, and replacement.
- Enforce segregation between preparation and authorization.

Prototype validation: prepare, authorize, release, and track payment attempts without overwriting history.

### Phase 08 — Notifications, dashboards, and reports

- Transactional outbox, durable notification jobs, templates, recipient resolution, retries, idempotency keys, and delivery history.
- Development mailbox/log before production email.
- Role-scoped dashboards, global search, queues, aging, payment tracker, unclaimed checks, completed payments, CSV exports, print datasets, pagination, and sorting.

Prototype validation: show in-app notification state and reconcile dashboard/report totals with persisted transactions.

### Phase 09 — Administration and integrations

- User/permission administration, configurable/versioned approval and tax policies, retention, monitoring, and audit access.
- Life OS SAML, private object storage, P.O./procurement, ERP/accounting, production email, banking, webhooks, and reconciliation jobs through replaceable adapters.

Prototype validation: administer approved configuration safely and demonstrate development adapters before any production connection is enabled.

## Initial API surface

The final route names should be confirmed phase by phase, but the expected shape is:

```text
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/auth/session

GET    /api/v1/users
POST   /api/v1/users
PATCH  /api/v1/users/{id}
GET    /api/v1/roles
PUT    /api/v1/users/{id}/roles
PUT    /api/v1/users/{id}/permissions

GET    /api/v1/departments
GET    /api/v1/cost-centers
GET    /api/v1/vendors
GET    /api/v1/chart-of-accounts
GET    /api/v1/tax-codes

GET    /api/v1/requests
POST   /api/v1/requests
GET    /api/v1/requests/{id}
PATCH  /api/v1/requests/{id}
POST   /api/v1/requests/{id}/submit
POST   /api/v1/requests/{id}/cancel
POST   /api/v1/requests/{id}/reopen
POST   /api/v1/requests/{id}/resubmit

POST   /api/v1/requests/{id}/documents
GET    /api/v1/documents/{id}
POST   /api/v1/documents/{id}/reviews

GET    /api/v1/approvals/queue
POST   /api/v1/approvals/{id}/decisions

POST   /api/v1/requests/{id}/finance-validation
POST   /api/v1/requests/{id}/vouchers
GET    /api/v1/vouchers/{id}

POST   /api/v1/vouchers/{id}/payments
POST   /api/v1/payments/{id}/authorizations
POST   /api/v1/payments/{id}/release

GET    /api/v1/notifications
GET    /api/v1/dashboard
GET    /api/v1/reports/payment-tracker
GET    /api/v1/audit
```

Mutation endpoints must support appropriate idempotency and concurrency controls. Exact request and response schemas belong in OpenAPI and phase-specific API contract documentation.

## MVP boundary

The first usable backend release includes:

1. Foundation and migrations.
2. Users, roles, permissions, and local authentication.
3. Departments, cost centers, and vendors.
4. Draft and submitted payment requests.
5. Line items, allocations, and document uploads.
6. Approval routing and decisions.
7. Finance validation and accounting entries.
8. Voucher generation and printing data.
9. Audit history.
10. Development notification delivery.

Production SAML, live bank integration, ERP/P.O. synchronization, configurable policies, and production email are post-MVP unless a stakeholder explicitly reprioritizes them.

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

For a phase-level completion decision, all of the following must also be true:

- Migrations succeed against a clean PostgreSQL database.
- Seed data is deterministic and safe for local development.
- New endpoints have positive, validation, authorization, conflict, and failure-path tests.
- Authorization is enforced by the backend, not only by hidden frontend controls.
- Audit records exist for every privileged or financially significant mutation.
- Repeated commands do not create duplicate requests, decisions, vouchers, payments, or notifications.
- The canonical frontend runs in `hybrid` mode and demonstrates the completed phase.
- Unfinished screens still work through explicit mock adapters.
- Loading, empty, error, stale-version, and unauthorized states are visible.
- Backend tests and the frontend production build pass.
- The validation checklist and any newly discovered decisions are recorded in this manifest or linked documentation.
- A stable commit or tag identifies the reviewed phase.

## Recommended defaults until stakeholders decide otherwise

- Use local development authentication first; keep Life OS SAML behind an identity adapter for a later phase.
- Use PostgreSQL as the authoritative workflow, financial-record, and audit database.
- Use protected local file storage for development and an S3-compatible private object-storage adapter for production.
- Keep approval thresholds coded but version-identified for the MVP; add administrator-configurable policies only after workflow behavior is validated.
- Use a development mailbox or notification log before enabling live email.
- Treat vendors, departments, and cost centers as local master data until an ERP or procurement owner is confirmed.
- Support multiple payment attempts for a voucher; do not overwrite failed, voided, or replaced attempts.
- Do not allow submitted financial records or audit records to be hard-deleted through ordinary APIs.
- Store absolute instants in PostgreSQL `timestamptz` and render business timestamps in `Asia/Manila`.
- Never store bank passwords, PINs, OTPs, or signing credentials.

These are implementation defaults, not permanent business-policy decisions. Record stakeholder changes explicitly before altering schema or workflow behavior.

## Immediate continuation checklist

When backend development resumes:

1. Read this manifest, `docs/database-design.md`, `docs/database-design-readable.md`, and `FSD-Automated-Payment-System-v1.2.docx`.
2. Inspect both Git worktrees and preserve all uncommitted changes.
3. Resolve the parent repository's intended `Back End/` directory move before committing unrelated backend code.
4. Confirm Docker and PostgreSQL availability.
5. Copy `.env.example` to a local ignored `.env` if one does not already exist.
6. Start PostgreSQL and verify `/healthz` reports `database: connected`.
7. Create a dedicated branch for Phase 00 if the current branch should remain a consolidation branch.
8. Implement Phase 00 only; do not begin business models until the API, migration, transaction, test, error, and seed conventions are reviewed.
9. Add the frontend data-source adapter and `mock`, `hybrid`, and `api` configuration before connecting the first real domain.
10. Run the canonical frontend from `../front-end development/` and preserve its existing prototype behavior.
11. Update the status section below at the end of every phase.

## Phase status ledger

| Phase | Status | Validation reference |
|---|---|---|
| 00 — Foundation | Not started | — |
| 01 — Authentication and RBAC | Not started | — |
| 02 — Master data | Not started | — |
| 03 — Payment requests | Not started | — |
| 04 — Documents | Not started | — |
| 05 — Workflow and approvals | Not started | — |
| 06 — Finance validation and vouchers | Not started | — |
| 07 — Payment execution | Not started | — |
| 08 — Notifications, dashboards, and reports | Not started | — |
| 09 — Administration and integrations | Not started | — |

Allowed status values are `Not started`, `In progress`, `Ready for validation`, `Validated`, and `Blocked`. Do not mark a phase `Validated` without recording the test/build commands, validation date, reviewer, and any accepted limitations.
