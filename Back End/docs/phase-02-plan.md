# Phase 02 — Master Data

Date prepared: 2026-08-28  
Last decision update: 2026-09-03  
Status: In progress  
Depends on: Phase 01 — Authentication and RBAC

## Implementation progress — 2026-09-03

Implemented locally:

- Reversible PostgreSQL migration `20260903_0005` and SQLAlchemy models for the Phase 02 persisted master data.
- Granular seeded permissions, Finance-controlled sensitive bank access, audited services and API routes.
- Deterministic department/cost-center, currency, payment-method, and document-type seeds.
- Replaceable vendor adapter using the supplied representative payload with bank-account redaction.
- Uniform administration pages for all eight Master Data areas.
- API-backed department/cost-center, vendor, account, currency, and payment-method sources with hybrid/mock fallback.
- Backend test coverage for deterministic seeds, synchronized department/cost-center changes, authorization, vendor masking, encryption, and Finance Manager revocation of System Administrator bank access.

Passed so far: Ruff, Python compilation/import, OpenAPI route generation, Alembic offline upgrade/downgrade SQL generation, frontend production build, encryption/redaction checks, and browser walkthrough of all Master Data routes and request dropdown fallbacks. Live migration and database-dependent pytest execution remain pending because Docker Desktop 4.83 exits before starting PostgreSQL due to its local inference socket error.

## Confirmed decisions

The project owner confirmed the following on 2026-09-03:

- Each cost center belongs to exactly one department and includes code, name, description, active state, and optional effective dates.
- The initial catalog contains eight departments. Each department is also its own cost center, using the same official code and display name. All initial records are active, and cost-center approval routes through Finance staff.
- Authorized administrators can add future departments and their corresponding cost centers; the initial catalog is not a fixed enumeration.
- The chart of accounts is hierarchical and includes code, name, account type, optional parent account, posting/summary classification, normal balance, and active state.
- Initial supported currencies are PHP, USD, and EUR. Initial payment methods are Check, Bank Transfer/DigiBanker, and Cash. Final Finance-approved tax codes and rates remain required.
- Company bank-account access is separately governed. Finance Managers can grant or revoke sensitive bank-account access, including revoking that access from System Administrators, without receiving authority to change unrelated System Administrator permissions.
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

The chart also identifies leadership and reporting relationships. The approved rule is one initial cost center per department; subordinate teams do not receive separate initial cost centers. Department and cost-center administration must nevertheless support future additions. The initial effective-from date remains unset until Finance supplies one.

### Remaining cost-center information required

- Effective-from date and, for retired codes, effective-to date.
- Whether requestors may allocate across departments or only within their assigned department.
- Whether a line item may be split across multiple cost centers.

The organizational chart can seed a review worksheet, but Finance must approve the final accounting mapping before migration seed data is treated as authoritative.

## Objective

Replace prototype reference data with persisted, audited API data that payment requests and later processing phases can safely reuse.

## Scope

- Extend departments and add cost centers, vendors, vendor contacts, chart of accounts, tax codes, currencies, payment methods, company bank accounts, and document types.
- Standardize UUIDs, codes, active/inactive states, timestamps, search, filtering, sorting, pagination, and safe deactivation.
- Encrypt company bank details at rest and mask them in ordinary API and UI responses.
- Seed deterministic development and test reference data without real vendor or bank information.
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
- Company bank accounts: bank name, account name, encrypted account number, masked display value, currency, branch, and active state.
- Document types: code, name, description, allowed request types, hard/soft-copy behavior, and active state.

## Business and validation rules

- Codes are trimmed, normalized consistently, and unique without relying on letter case.
- Department and corresponding cost-center codes and display names remain synchronized under the one-to-one model.
- Records already used by transactions are deactivated rather than physically deleted.
- Effective-dated records cannot overlap where only one active definition is allowed.
- Parent/child account relationships cannot contain cycles.
- Currency precision is applied consistently to later calculations; exchange rates are outside this phase.
- Tax percentages use fixed-precision decimals and cannot be negative or exceed the approved range.
- Bank-account clear text is accepted only on authorized create/change operations and never returned by list endpoints.
- All create, edit, activate, deactivate, reveal, and permitted delete operations produce audit events.

## Authorization model

Planned permissions include `master_data.read`, `master_data.manage`, `vendors.read`, `accounts.read`, `accounts.manage`, `bank_accounts.read`, `bank_accounts.manage_sensitive`, and `bank_accounts.manage_access`.

- System Administrator: full ordinary master-data administration; sensitive bank-account access is separately revocable.
- Finance Manager: financial reference-data administration, subject to final ownership confirmation.
- Finance Manager with `bank_accounts.manage_access`: grant or revoke `bank_accounts.manage_sensitive` for eligible users or roles, including System Administrators, without changing their unrelated permissions.
- Finance Associate: read access and any explicitly approved external-vendor lookup capability.
- Requestors and approvers: read only the active values needed for permitted forms and decisions.
- Only identities with the sensitive bank-account permission may create, change, or reveal protected values.
- Every bank-access grant/revocation requires a reason and immutable audit record. The implementation must prevent accidental loss of all authorized bank-access managers through a documented break-glass or minimum-owner rule.

## API behavior

- List endpoints support search, active-state filtering, stable sorting, and bounded pagination.
- Retrieve endpoints distinguish nonexistent records from records the caller is not permitted to see.
- Mutations use standard problem responses, request IDs, CSRF protection, and permission checks.
- Duplicate codes return conflict responses; validation failures identify safe field-level details.
- Deactivation is idempotent. Delete is allowed only for never-referenced records when policy permits it.
- Bank-account responses contain masked identifiers and safe metadata only.

## Frontend pages and integration

- Add Master Data navigation for Cost Centers, Vendors, Chart of Accounts, Tax Codes, Currencies, Payment Methods, Company Bank Accounts, and Document Types.
- Reuse the Phase 01 administration list, search, add-button, modal, and three-dot action-menu patterns.
- Provide loading, empty, validation, duplicate, forbidden, conflict, referenced-record, and API-unavailable states.
- Confirm mobile containment, keyboard order, focus restoration, labels, menu positioning, and confirmation dialogs.
- Populate prototype forms through the data-source abstraction so API, hybrid, and frontend-only mock modes stay functional.

## Security and operational requirements

- Obtain encryption material from environment or an approved secrets provider; never use a committed default key.
- Ensure logs, exceptions, audit before/after values, exports, fixtures, screenshots, and tests do not expose bank-account clear text.
- Use indexed lookup columns and bounded list responses to avoid unbounded administration queries.
- Backups must contain encrypted bank values, and restore testing must confirm they remain decryptable only with the correct key.

## Delivery sequence

1. Confirm fields, ownership, uniqueness rules, effective dates, and record-retention behavior.
2. Add reversible migrations, models, constraints, indexes, and encryption configuration.
3. Add schemas, services, permission checks, audit events, and CRUD/list APIs.
4. Create deterministic seeds and isolated database tests.
5. Build uniform administration lists, action menus, and add/edit modals.
6. Replace prototype dropdown fixtures with API-backed data while preserving mock mode.
7. Run regression, security, responsive, accessibility, Docker, and CI gates.

## Planned API areas

`/departments`, `/cost-centers`, `/vendors`, `/chart-of-accounts`, `/tax-codes`, `/currencies`, `/payment-methods`, `/company-bank-accounts`, and `/document-types` under `/api/v1`. The `/vendors` area is a Payment Module facade over the external vendor adapter, not a local vendor CRUD service.

## Acceptance gates

- Every master-data type is persisted, validated, searchable, and safely administered.
- Duplicate codes, invalid relationships, and destructive deletion of referenced records are rejected.
- Bank details are encrypted, masked, permission-controlled, and never written to logs or audit payloads in clear text.
- Required prototype dropdowns use API data; standalone mock mode remains runnable.
- Migrations, deterministic seeds, authorization, audit, coverage, dependency audits, builds, Docker checks, and CI pass.

## Test and validation matrix

- Migration upgrade, downgrade, replay, constraint, and index validation on the isolated test database.
- Idempotent seed execution and stable reference identifiers.
- CRUD, activate/deactivate, safe-delete, duplicate-code, effective-date, hierarchy-cycle, and referenced-record tests.
- Initial-catalog tests for all eight approved code/name pairs and atomic department/cost-center creation, synchronization, and rollback.
- Permission tests for every list, retrieve, and mutation path, including explicit deny precedence.
- Bank-access administration tests proving that an authorized Finance Manager can revoke System Administrator bank access but cannot modify unrelated administrator permissions.
- Last-authorized-manager/break-glass safeguards, required reason, and complete access-change audit tests.
- Encryption round-trip, wrong-key failure, masking, log/audit redaction, and unauthorized reveal tests.
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

- The remaining cost-center policy information listed above: initial effective-from date, cross-department allocation, and split-allocation rules.
- Initial chart-of-account records and official account codes; the structure is confirmed.
- Finance-approved tax codes, VAT/EWT classifications, rates, and effective dates.
- Named encryption-key owner and approved local/staging/production secrets mechanism.
- A representative vendor payload was supplied on 2026-09-03 and is covered by the mock adapter contract. Its `bankAccountNumber` field is sensitive: ordinary lookup exposes only a masked value and must never log or return the clear value. Base URL, authentication, pagination/filtering, error/rate-limit behavior, timeout/SLA expectations, and sandbox credentials remain required.
- Bank-access minimum-owner or break-glass rule to prevent permanent administrative lockout.

## Exclusions

Payment-request transactions, document binaries, approval routing, vouchers, and live external integrations belong to later phases.
