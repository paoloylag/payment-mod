# Automated Payment System Project Manifest

Status: Approved phased backend implementation scope
Manifest version: 2.3
Last updated: 2026-08-26
Primary functional specification: `FSD-Automated-Payment-System-v1.2.docx`

## Purpose

This manifest records the intended implementation scope for the Automated Payment System. The current repository contains a comprehensive front-end prototype and a minimal FastAPI/PostgreSQL scaffold. The backend capabilities below are approved roadmap items and must be treated as requirements when the prototype is converted into a persistent, backend-enabled system.

This file does not assert that an item is implemented. Completion status must be updated only after code, migrations, tests, and documentation have been reviewed.

This manifest is also the handoff document for continuing the work in a later Codex task or development session. A new contributor should read the current-state, delivery, validation, and continuation sections before editing code.

## Workspace and repository layout

The local workspace currently contains two distinct Git worktrees:

```text
Payment Module/                                      # codex/frontend-only-prototype
└── .worktrees/backend-integration/                  # codex/backend-integration
    └── Back End/                                    # FastAPI/PostgreSQL app and synchronized prototype
```

Important repository context:

- The backend worktree is on `codex/backend-integration` with Phase 01 remediation commit `44e876e` and tracks
  `origin/codex/backend-integration`.
- The backend project is tracked under `Back End/`; repository-level CI and Pages workflows are stored in the workspace root `.github/workflows/` directory because GitHub does not discover nested workflows.
- The canonical frontend is the main `Payment Module/` worktree.
- The frontend is a separate Git checkout on `codex/frontend-only-prototype`, currently at published commit `57e7f3c`.
- Obsolete remote branches `codex/aps-feedback-phases-1-5` and `feature/payment-form-dashboard-updates` were verified to contain no unique remote commits and deleted on 2026-08-19.
- The obsolete `Back End/front-end development/` duplicate was removed after its valid Git checkout and project files were consolidated into the canonical root frontend folder.
- The folders `tmp/` and `worktrees/` exist at the workspace root and must not be treated as application source without inspection.

## Work completed before backend implementation

- Fetched and checked out `codex/backend-integration` from `paoloylag/payment-mod`.
- Merged the latest `origin/main` into the backend branch.
- Implemented Phase 01 local authentication, sessions, user administration, requestor-manager relationships,
  departments, roles, permissions, RBAC enforcement, and append-only audit events.
- Audited `dcbj-lai/lifeos-tenant-boilerplate` for reusable UI and authentication patterns.
- Adopted the LifeOS boilerplate as the prototype shell and dark-mode basis where practical.
- Added a gradient application sidebar, sticky translucent topbar, search placeholder, notification placeholder, theme control, avatar-based user chip, mobile navigation behavior, and system-theme detection.
- Preserved the existing payment request, approval, document, voucher, tracker, reporting, email, and persona simulations.
- Corrected the prototype entry to use an ES module so Vite bundles the JavaScript in production.
- Added `src/boilerplate-shell.css` to the canonical frontend as an isolated final override layer so existing feedback-phase styles remain intact.
- Verified the synchronized backend-branch prototype with TypeScript and Vite 7.3.6 production builds.
- No local prototype server was running when the frontend folders were consolidated.

Current frontend files staged after reconciliation include:

```text
index.html
src/App.jsx
src/prototype.js
src/responsive.css
src/styles.css
src/boilerplate-shell.css   # new
src/data-source.js          # new hybrid/mock/API adapter
.env.example                # new frontend mode and API URL defaults
.gitignore                  # ignores TypeScript incremental build output
```

The deployed runtime remains `src/prototype.js`. `src/App.jsx` is maintained for React parity but is not the current production entry point.

## Current baseline

- Front end demonstrates role-based workflows, request forms, approvals, Finance validation, vouchers, notifications, dashboards, tracking, and reports using prototype data.
- FastAPI exposes liveness, readiness, API discovery, system status, local authentication, current-session, user,
  department, role, and permission routes.
- PostgreSQL connectivity, environment configuration, Alembic scaffolding, and Docker Compose are present.
- Phase 01 identity/RBAC persistence and authorization are implemented. Payment-request, document, workflow, finance,
  payment, notification, and reporting persistence remain roadmap work.

Current Phase 00 backend endpoints:

```text
GET /healthz
GET /readyz
GET /api
GET /api/v1/system/status
```

Current backend stack:

- Python and FastAPI 0.116.1
- SQLAlchemy 2.0.42
- Psycopg 3.2.9
- Alembic 1.16.4
- PostgreSQL through Docker Compose
- Pydantic Settings 2.10.1

The reversible Phase 00 migration `20260819_0001` creates the plural `system_settings` table. Deterministic seed data is available through `python -m payment_module.seed`.

## Updates completed through Phase 00

- Added application settings, structured logging, request/correlation IDs, CORS, standardized problem responses, and transaction rollback conventions.
- Added database readiness checks separately from process liveness.
- Added the reversible `system_settings` migration, deterministic seed command, backend fixtures, and system endpoint tests.
- Made Docker Compose the required local backend setup; application startup migrates and seeds before serving.
- Added repository-level CI for lint, PostgreSQL migration, seed, rollback/replay, tests, Docker image build, and deployable artifact packaging.
- Kept the stable `main` GitHub Pages workflow at `/payment-mod/`. The backend-branch preview was attempted and then deferred after its Pages environment rejected the branch deployment; this does not affect backend CI or local prototype operation.
- Added frontend `mock`, `hybrid`, and `api` data-source modes. `hybrid` is the default and preserves the runnable static prototype when no backend is hosted.
- Reconciled the canonical frontend against `3e4b30d`, resolved overlapping shell changes, and synchronized the validated static runtime into this backend branch.
- Confirmed byte-identical synchronized copies of `index.html`, `prototype.js`, `styles.css`, `responsive.css`, `boilerplate-shell.css`, and `data-source.js`.
- Passed Ruff checks, database-independent API smoke tests, YAML parsing, TypeScript validation, and Vite production builds in both frontend locations.
- GitHub Actions run `32719293106` passed lint, PostgreSQL migration, deterministic seed, rollback/replay, backend tests, Docker image build, and deployable artifact packaging for commit `4ddd199` on 2026-08-24.
- A local audit on 2026-08-25 passed Ruff, Python compilation, database-independent API tests, Alembic head/history checks, JavaScript syntax checks, TypeScript validation, and the Vite production build.
- Phase 00 is validated. Local WSL 2, Docker Desktop 29.6.2, PostgreSQL 16, migrations, deterministic seed, rollback/replay, API readiness, backend tests, and the hybrid frontend connection were verified on 2026-08-25 in addition to the successful GitHub CI gates.

## Phase 01 release and validation

- Status: Phase 01 validated locally on 2026-08-28. Production promotion remains a separate controlled activity and
  still requires environment-specific proxy/HTTPS, penetration, Firefox, and Safari validation.
- Reviewed by the project owner with Codex-assisted execution.
- Reviewed implementation commit: `codex/backend-integration` at `44e876e`.
- Local release archive: `release-artifacts/payment-module-phase-01-44e876e.zip` (generated from the commit and
  intentionally ignored by Git).
- Archive SHA-256: `62391B98303C4AD9AE8732C896B77DC2F5CDDDFA0A58F43FE4B2E40E678B0952`.
- Validation passed: Ruff, 28 backend tests, 90.59% statement coverage (85% minimum), isolated PostgreSQL migration
  upgrade/downgrade/replay, deterministic seed, concurrent login/session revocation, 2,005-row cleanup batching,
  backup/restore comparison, API restart session continuity, Bandit static analysis, production frontend build,
  frontend/API proxy login/logout, CORS coverage for ports 5175/5176, test session teardown, and
  staging/production cleanup refusal.
- Development and QA evidence: `outputs/development-test-register/APS-Development-and-Test-Register-Phase-01.xlsx`
  records 14 Phase 01 development items, 36 repeatable test scripts and executions, and eight acceptance gates.
- Dependency remediation: FastAPI/Starlette/python-multipart, pytest, Vite, Nano ID, and PostCSS were upgraded; SheetJS
  0.20.3 is vendored from its official distribution. Both `pip-audit` and `pnpm audit` report no known vulnerabilities.
- Interactive validation: integrated and standalone modes passed in the in-app Chromium browser; standalone mode also
  passed in desktop Chrome with no console errors, overflow, unnamed buttons, or unlabeled controls. A Finance-filtered
  report downloaded as a valid XLSX containing Summary and Transactions sheets with two matching rows totaling
  PHP 113,850.
- Accepted limitations: Firefox and Safari are unavailable on this Windows validation host. They, penetration testing,
  production proxy/HTTPS validation, and CI observation for the evidence commit remain production-promotion gates.

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

### CI/CD across phases

- Every phase extends the required lint, migration, seed, rollback, and automated test gates before merge.
- Phase 00 establishes CI and produces a versioned Docker image artifact after tests pass.
- Later phases add domain-specific tests, security checks, and release verification to the same pipeline.
- Automated deployment is enabled only after the staging and production targets, secrets owner, approval gate, rollback
  procedure, and environment promotion policy are confirmed. Until then, CD stops at a deployable image artifact.

### Phase 00 — Foundation

Detailed validation document: `docs/phase-00-validation.md`.

- Introduce `/api/v1` routing.
- Define standard errors, pagination, filtering, sorting, correlation IDs, logging, CORS, and Philippine Time helpers.
- Establish transaction conventions, test fixtures, migration checks, and deterministic seed commands.
- Add readiness in addition to liveness/health checks.

Prototype validation: show API/database status without blocking mock workflows.

### Phase 01 — Authentication and RBAC

Detailed plan and validation document: `docs/phase-01-plan.md`.

- Local development login, logout, and session endpoint.
- Users, roles, permissions, user roles, permission overrides, departments, activation, and suspension.
- Server-side authorization dependencies and audited permission changes.
- Development/test-only retained-session cleanup with test teardown isolation, 30-day retention, supporting indexes,
  and hard refusal in staging and production.
- Initial roles: Requestor, Department Head, Finance Associate, Finance Manager, COO, President, Board Member, Authorized Signatory, and System Administrator.

Prototype validation: login screen, authenticated user chip, role-driven navigation, and unauthorized states. Keep a safe development-login path until Life OS SAML is ready.

### Phase 02 — Master data

Detailed plan: `docs/phase-02-plan.md`.

- Departments, cost centers, chart of accounts, tax codes, currencies, payment methods, company bank accounts, and document types.
- Consume vendors and vendor contacts from an external system through a replaceable adapter; preserve external identifiers and transaction-time snapshots rather than creating a local vendor system of record.
- Encrypt and mask sensitive bank details. Govern sensitive bank access separately so an authorized Finance Manager can revoke it from a System Administrator without changing unrelated administrator permissions.
- Seed the eight approved active department/cost-center pairs (`OCP`, `PNC`, `OOG`, `DT`, `ACAD`, `OPS`, `FIN`, and `MKTG`), with one cost center per department and approval through Finance staff. Preserve administration for future additions.

Prototype validation: replace form dropdown mocks and administration reference lists with API data.

### Phase 03 — Payment requests

Detailed plan: `docs/phase-03-plan.md`.

- Draft create, autosave, retrieve, edit, delete, submit, cancel, reopen, return, and resubmit.
- Request numbering, request versions, optimistic locking, request-type extension data, line items, allocations, currency rules, totals, and duplicate invoice checks.
- Request types: Reimbursement, Cash Advance, Liquidation, P.O. Payment, and General Payment.

Prototype validation: create and persist each request type, reload it, submit it, list it, filter it, and enforce ownership/department visibility.

### Phase 04 — Documents

Detailed plan: `docs/phase-04-plan.md`.

- Private upload/download, metadata, checksums, versions, replacements, required-document rules, request- and line-level links, and hard/soft-copy status.
- Storage adapter with protected local development storage first.
- Malware-scanning integration point for production.

Prototype validation: upload, replace, preview, download, and review document requirements against persisted requests.

### Phase 05 — Workflow and approvals

Detailed plan: `docs/phase-05-plan.md`.

- Generate a policy-snapshotted approval route at submission.
- Role or identity assignments, queues, sequential controls, approve, return, decline, delegate, reassign, reroute, and authorized unlocking.
- Immutable workflow events and idempotent transition commands.

Prototype validation: each persona sees only its assigned queue and the request advances or returns according to backend decisions.

### Phase 06 — Finance validation and vouchers

Detailed plan: `docs/phase-06-plan.md`.

- Document and line decisions, VAT/EWT classification, tax snapshots, No EWT rule, receipt status, accounting entries, balanced-entry enforcement, and completion timestamp.
- Voucher numbering, request/tax/accounting snapshots, payment method, check/transaction references, digital approval certification, printing data, posting, voiding, and replacement history.

Prototype validation: Finance completes validation and generates a persisted printable voucher only after required approvals.

### Phase 07 — Payment execution

Detailed plan: `docs/phase-07-plan.md`.

- Payment attempts and partial settlements.
- Check, Bank Transfer/DigiBanker, and Cash methods.
- Preparation, signatory assignment, authorization, processing reference, pickup availability, release, clearing, failure, retry, voiding, and replacement.
- Enforce segregation between preparation and authorization.

Prototype validation: prepare, authorize, release, and track payment attempts without overwriting history.

### Phase 08 — Notifications, dashboards, and reports

Detailed plan: `docs/phase-08-plan.md`.

- Transactional outbox, durable notification jobs, templates, recipient resolution, retries, idempotency keys, and delivery history.
- Development mailbox/log before production email.
- Role-scoped dashboards, global search, queues, aging, payment tracker, unclaimed checks, completed payments, Excel exports, print datasets, pagination, and sorting.

Prototype validation: show in-app notification state and reconcile dashboard/report totals with persisted transactions.

### Phase 09 — Administration and integrations

Detailed plan: `docs/phase-09-plan.md`.

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

Implement document and line decisions, VAT classification, EWT code/rate/amount, VAT-inclusive gross, net-of-VAT/EWT base (`gross / 1.12`), VAT component (`gross - base`), EWT (`base * selected rate`), amount due (`gross - EWT`), explicit No EWT classification, receipt-copy status, tax snapshots, debit/credit entries, balanced-entry enforcement, reviewer notes, and system completion timestamp. Preserve the PHP 200,000.00 TOJUST Construction request as a business-validation fixture.

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

Implement role-scoped metrics, approval queues, live requests, request detail, workflow timelines, department/status/type filters, pagination, sorting, aging and overdue calculations, payment tracker, unclaimed checks, completed payments, archive search, filtered Excel workbooks, and print-ready report data.

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
6. Reporting: dashboards, tracker, aging, archive search, filtered Excel workbooks, print datasets, and unclaimed checks.
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
- Treat departments and cost centers as local master data until another authoritative owner is confirmed. Vendors are externally owned and must be accessed through a replaceable adapter.
- Support multiple payment attempts for a voucher; do not overwrite failed, voided, or replaced attempts.
- Do not allow submitted financial records or audit records to be hard-deleted through ordinary APIs.
- Store absolute instants in PostgreSQL `timestamptz` and render business timestamps in `Asia/Manila`.
- Never store bank passwords, PINs, OTPs, or signing credentials.

These are implementation defaults, not permanent business-policy decisions. Record stakeholder changes explicitly before altering schema or workflow behavior.

## Immediate continuation checklist

When backend development resumes:

1. Read this manifest, `docs/database-design.md`, `docs/database-design-readable.md`, and `FSD-Automated-Payment-System-v1.2.docx`.
2. Inspect both Git worktrees and preserve all uncommitted changes.
3. Preserve uncommitted work and generated local directories before changing either maintained branch.
4. Start Docker Desktop and confirm the PostgreSQL and API containers are healthy before local end-to-end work.
5. Copy `.env.example` to a local ignored `.env` if one does not already exist.
6. Start the stack and verify `/healthz`, `/readyz`, `/api`, `/api/v1/system/status`, and `/docs`.
7. Keep `codex/frontend-only-prototype` and `codex/backend-integration` synchronized only through reviewed frontend asset updates.
8. Preserve the stable `main` Pages site; backend preview Pages validation remains deferred.
9. Retain workflow links and accepted limitations in `docs/phase-00-validation.md`.
10. Re-run the Phase 00 gates after any foundation change.
11. Phase 02 may use the reviewed Phase 01 baseline. Do not start production promotion until the external Firefox,
    Safari, penetration, and production proxy/HTTPS checks are recorded and approved.
12. Never enable the retained-session cleanup command in staging or production.
13. Before Phase 02 financial seed data is authoritative, obtain the initial cost-center effective date and allocation rules, chart-of-account records, tax definitions, the bank-access lockout safeguard, and the approved encryption-key ownership/mechanism. The vendor API may remain behind deterministic mocks until its provider contract and sandbox are supplied.

## Phase status ledger

| Phase | Status | Validation reference |
|---|---|---|
| 00 — Foundation | Validated | `docs/phase-00-validation.md` (2026-08-25; CI run `32719293106`) |
| 01 — Authentication and RBAC | Validated | `docs/phase-01-plan.md` (validated 2026-08-28; external production-promotion limitations recorded) |
| 02 — Master data | In progress | `docs/phase-02-plan.md` |
| 03 — Payment requests | Not started | `docs/phase-03-plan.md` |
| 04 — Documents | Not started | `docs/phase-04-plan.md` |
| 05 — Workflow and approvals | Not started | `docs/phase-05-plan.md` |
| 06 — Finance validation and vouchers | Not started | `docs/phase-06-plan.md` |
| 07 — Payment execution | Not started | `docs/phase-07-plan.md` |
| 08 — Notifications, dashboards, and reports | Not started | `docs/phase-08-plan.md` |
| 09 — Administration and integrations | Not started | `docs/phase-09-plan.md` |

Allowed status values are `Not started`, `In progress`, `Ready for validation`, `Validated`, and `Blocked`. Do not mark a phase `Validated` without recording the test/build commands, validation date, reviewer, and any accepted limitations.
