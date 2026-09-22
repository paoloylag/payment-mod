# Phase 02 — Master Data

Date prepared: 2026-08-28  
Last decision update: 2026-09-22
Status: Ready for validation
Depends on: Phase 01 — Authentication and RBAC

## Implementation progress — 2026-09-03

Implemented locally:

- Reversible PostgreSQL migration `20260903_0005` and SQLAlchemy models for the Phase 02 persisted master data.
- Granular seeded permissions, audited services, and API routes.
- Deterministic department/cost-center, currency, payment-method, and document-type seeds.
- Replaceable vendor adapter using the supplied representative payload, excluding bank-account fields.
- Uniform administration pages for the seven retained Master Data areas.
- API-backed department/cost-center, vendor, account, currency, and payment-method sources with hybrid/mock fallback.
- Backend test coverage for deterministic seeds, synchronized department/cost-center changes, authorization, and vendor field filtering.

Historical 2026-09-03 baseline: Ruff, Python compilation/import, OpenAPI route generation, Alembic offline upgrade/downgrade SQL generation, frontend production build, and browser walkthrough of the then-current Master Data routes and request dropdown fallbacks passed. Live PostgreSQL 17 migrations reached `20260903_0005` on isolated development and test databases, and the backend suite passed with 33 tests. The retired bank-account area was present at that time; current evidence is in `docs/phase-02-validation.md`. Docker Desktop 4.89 encountered a host-level Windows Unix-socket error, so local database validation uses the loopback-only native PostgreSQL service on port `5434`; this does not alter production configuration.

2026-09-22 approval-free follow-up: master-data list endpoints now use bounded pages (maximum 100 records) while the frontend loads all pages needed for its lists and dropdowns. Automated tests cover page ordering/filtering, duplicate and cyclic chart accounts, safe deletion, and mock vendor search. See `docs/phase-02-validation.md` for current command results and remaining gates.

2026-09-22 removal: the Company Bank Accounts page, routes, model, encryption code, and special permissions have been retired. Migration `20260922_0007` removes the empty table and permissions but refuses to drop an account table containing records. Vendor bank fields are excluded entirely. Historical `20260903_0005` is retained because it has already been applied; the follow-up migration changes the current schema.

2026-09-22 scope decision: QuickBooks-specific mapping/export and authoritative QuickBooks account imports are deferred. Retain stable internal account codes and names so a later, separately approved export adapter can map them without changing historical requests. There will be no bank connection of any kind. A future cash-release record will identify the releasing bank for documentation only; it will not send instructions, authenticate to a bank, or confirm settlement electronically.

## Confirmed decisions

The project owner confirmed the following on 2026-09-03:

- Each cost center belongs to exactly one department and includes code, name, description, active state, and optional effective dates.
- The initial catalog contains eight departments. Each department is also its own cost center, using the same official code and display name. All initial records are active, and cost-center approval routes through Finance staff.
- Authorized administrators can add future departments and their corresponding cost centers; the initial catalog is not a fixed enumeration.
- The chart of accounts is hierarchical and includes code, name, account type, optional parent account, posting/summary classification, normal balance, and active state.
- Initial supported currencies are PHP, USD, and EUR. Initial payment methods are Check, Bank Transfer/DigiBanker, and Cash. Final Finance-approved tax codes and rates remain required.
- Vendors are owned by an external system. The Payment Module will consume them through a replaceable vendor API adapter after the project owner provides the provider contract; it will not become the vendor system of record.

## Organizational-chart findings

The project owner authorized review of `LCI Org Chart ao Sep 1.pdf` from the supplied Google Chat conversation. On 2026-09-03, the project owner approved the following initial department and cost-center catalog:

| Display name | Official code | Initial state | Finance owner/approver |
|---|---|---|---|
| Office of the College President | `OCP` | Active | Finance staff |
| People & Culture | `PNC` | Active | Finance staff |
| Office of Growth | `OOG` | Active | Finance staff |
| Technology / Digital Transformation | `DT` | Active | Finance staff |
| Academics / Residential Campus | `ACAD` | Active | Finance staff |
| Operations | `OPS` | Active | Finance staff |
| Finance | `FIN` | Active | Finance staff |
| Marketing | `MKTG` | Active | Finance staff |

The chart also identifies leadership and reporting relationships. The approved rule is one initial cost center per department; subordinate teams do not receive separate initial cost centers. Department and cost-center administration must nevertheless support future additions. Each request line is one item charged to exactly one cost center; a single line is not split across cost centers. The initial effective-from date remains unset until Finance supplies one.

### Remaining cost-center information required

- Effective-from date and, for retired codes, effective-to date.
- Whether requestors may allocate across departments or only within their assigned department.
- Whether requestors may charge another department remains open. Split allocation within a line is out of scope by owner decision; different cost centers require separate lines.

The organizational chart can seed a review worksheet, but Finance must approve the final accounting mapping before migration seed data is treated as authoritative.

## Objective

Replace prototype reference data with persisted, audited API data that payment requests and later processing phases can safely reuse.

## Scope

- Extend departments and add cost centers, vendors, vendor contacts, chart of accounts, tax codes, currencies, payment methods, and document types.
- Standardize UUIDs, codes, active/inactive states, timestamps, search, filtering, sorting, pagination, and safe deactivation.
- Exclude vendor bank-account fields from the local adapter and seed deterministic development and test reference data without banking information.
- Add granular master-data permissions and audited mutations.

## Planned data model

### Departments and cost centers

- Extend the Phase 01 department record without replacing its identifiers or existing user relationships.
- Store cost-center code, name, description, owning department, active state, and optional effective dates.
- Require every active department to have exactly one corresponding active cost center, using the same official code and display name for the initial model.
- Make department creation an authorized administration workflow that creates the corresponding cost center atomically; a failure must not leave only one side of the pair.
- Allow later editing and safe deactivation while preserving referential and audit history.
- Prevent department deletion while users, cost centers, requests, or accounting records reference it.

### Vendors and contacts

- Define a replaceable external vendor adapter for search, retrieve, status, contacts, default currency, and default payment method.
- Treat the external vendor service as the source of truth; do not provide local vendor create/edit/delete administration.
- Preserve the external vendor identifier and a transaction-time vendor snapshot when a payment request is submitted so later upstream changes do not alter historical records.
- Use deterministic mock vendor fixtures in tests and frontend-only mode until the provider API contract and sandbox are available.
- Decide cache duration, availability behavior, and synchronization only after reviewing the provider contract.

### Financial reference data

- Chart of accounts: code, name, account type, optional parent, posting/summary flag, normal balance, and active state.
- Tax codes: code, description, VAT classification, EWT rate, effective dates, and active state.
- Currencies: ISO code, display name, symbol, decimal precision, and active state.
- Payment methods: code, display name, method category, required-reference rules, and active state.
- The bank-account administration feature is removed. A later manual cash-release record may contain a releasing bank name/reference, but no account number or bank connection.
- Document types: code, name, description, allowed request types, hard/soft-copy behavior, and active state.

## Business and validation rules

- Codes are trimmed, normalized consistently, and unique without relying on letter case.
- Department and corresponding cost-center codes and display names remain synchronized under the one-to-one model.
- Records already used by transactions are deactivated rather than physically deleted.
- Effective-dated records cannot overlap where only one active definition is allowed.
- Parent/child account relationships cannot contain cycles.
- Currency precision is applied consistently to later calculations; exchange rates are outside this phase.
- Tax percentages use fixed-precision decimals and cannot be negative or exceed the approved range.
- All create, edit, activate, deactivate, reveal, and permitted delete operations produce audit events.

## Authorization model

Planned permissions include `master_data.read`, `master_data.manage`, `vendors.read`, `accounts.read`, and `accounts.manage`.

- System Administrator: ordinary master-data administration.
- Finance Manager: financial reference-data administration, subject to final ownership confirmation.
- Finance Associate: read access and any explicitly approved external-vendor lookup capability.
- Requestors and approvers: read only the active values needed for permitted forms and decisions.

## API behavior

- List endpoints support search, active-state filtering, stable sorting, and bounded pagination.
- Retrieve endpoints distinguish nonexistent records from records the caller is not permitted to see.
- Mutations use standard problem responses, request IDs, CSRF protection, and permission checks.
- Duplicate codes return conflict responses; validation failures identify safe field-level details.
- Deactivation is idempotent. Delete is allowed only for never-referenced records when policy permits it.

## Frontend pages and integration

- Add Master Data navigation for Cost Centers, Vendors, Chart of Accounts, Tax Codes, Currencies, Payment Methods, and Document Types.
- Reuse the Phase 01 administration list, search, add-button, modal, and three-dot action-menu patterns.
- Provide loading, empty, validation, duplicate, forbidden, conflict, referenced-record, and API-unavailable states.
- Confirm mobile containment, keyboard order, focus restoration, labels, menu positioning, and confirmation dialogs.
- Populate prototype forms through the data-source abstraction so API, hybrid, and frontend-only mock modes stay functional.

## Security and operational requirements

- Ensure vendor-provider bank-account fields do not enter ordinary responses, logs, exports, fixtures, or audit payloads.
- Use indexed lookup columns and bounded list responses to avoid unbounded administration queries.

## Delivery sequence

1. Confirm fields, ownership, uniqueness rules, effective dates, and record-retention behavior.
2. Add reversible migrations, models, constraints, and indexes.
3. Add schemas, services, permission checks, audit events, and CRUD/list APIs.
4. Create deterministic seeds and isolated database tests.
5. Build uniform administration lists, action menus, and add/edit modals.
6. Replace prototype dropdown fixtures with API-backed data while preserving mock mode.
7. Run regression, security, responsive, accessibility, Docker, and CI gates.

## Planned API areas

`/departments`, `/cost-centers`, `/vendors`, `/chart-of-accounts`, `/tax-codes`, `/currencies`, `/payment-methods`, and `/document-types` under `/api/v1`. The `/vendors` area is a Payment Module facade over the external vendor adapter, not a local vendor CRUD service.

## Acceptance gates

- Every master-data type is persisted, validated, searchable, and safely administered.
- Duplicate codes, invalid relationships, and destructive deletion of referenced records are rejected.
- Bank-account administration routes and navigation are absent; removed routes return 404 and do not appear in OpenAPI.
- Required prototype dropdowns use API data; standalone mock mode remains runnable.
- Migrations, deterministic seeds, authorization, audit, coverage, dependency audits, builds, Docker checks, and CI pass.

## Test and validation matrix

- Migration upgrade, downgrade, replay, constraint, and index validation on the isolated test database.
- Idempotent seed execution and stable reference identifiers.
- CRUD, activate/deactivate, safe-delete, duplicate-code, effective-date, hierarchy-cycle, and referenced-record tests.
- Initial-catalog tests for all eight approved code/name pairs and atomic department/cost-center creation, synchronization, and rollback.
- Permission tests for every list, retrieve, and mutation path, including explicit deny precedence.
- Removed-route, permission, OpenAPI, migration guard, and vendor bank-field exclusion tests.
- Vendor adapter contract tests for lookup, unavailable provider, timeout, invalid payload, inactive vendor, mock fallback, and transaction snapshot preservation.
- Pagination, sorting, filtering, and search determinism with larger datasets.
- Integrated browser walkthrough of every administration page and API-backed dropdown.
- Standalone mock regression, responsive layouts, accessible naming, production build, dependency audit, Docker health, and CI packaging.

## Expected evidence

- Reversible migration and model references.
- OpenAPI routes and representative problem responses.
- Seed command output and deterministic-count comparison.
- Automated test and coverage report.
- Security audit and sensitive-data redaction results.
- Browser screenshots or recorded walkthrough results for desktop and narrow layouts.
- Updated development/test register, manifest status, reviewed commit, release archive, checksum, and CI run.

## Remaining decisions and external inputs

- The remaining cost-center policy information listed above: initial effective-from date and cross-department charging. One item and one cost center per line is already confirmed.
- Finance-approved internal chart-of-account records are needed only before those records are used for authoritative accounting. QuickBooks-specific codes, import, and export are deferred; the existing account-code structure is the future mapping point.
- Finance-approved tax codes, VAT/EWT classifications, rates, and effective dates.
- A representative vendor payload was supplied on 2026-09-03 and is covered by the mock adapter contract. Its bank fields are discarded entirely. Base URL, authentication, pagination/filtering, error/rate-limit behavior, timeout/SLA expectations, and sandbox credentials remain required.

## Exclusions

Payment-request transactions, document binaries, approval routing, vouchers, and live external integrations belong to later phases.
