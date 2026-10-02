# Finance-owned configuration

Date implemented: 2026-10-02
Applies to: local development for Phases 02–04

## Architecture

Finance-owned rules use typed API contracts, server-side validation and enforcement, explicit defaults, permission-restricted updates, and audit events. Finance Associates may read the settings. Finance Managers and System Administrators may update them through **Administration → Request Settings**. Browser values are never trusted as enforcement inputs.

Changes apply to future submission or resubmission checks. They do not renumber requests, rewrite historical snapshots, recalculate submitted amounts, or silently change completed records. Production activation still requires Finance approval of the chosen values and an effective date.

## Configurable rules and important notes

| Configuration | Default | Behavior and notes | Validation coverage |
|---|---:|---|---|
| Academic-year numbering start | July | Controls the year segment and annual sequence reset for new submissions only. Existing request and voucher numbers remain immutable. | Boundary, authorization, persistence, and seed-preservation API tests. |
| Reimbursement batch cutoffs | 15 and 30 | Calendar-day cutoffs; missing dates use month-end. Late submissions move to the next batch. Already assigned requests retain their saved batch date. | Cutoff, month rollover, February, authorization, API persistence, and browser role tests. |
| Cash Advance limit | PHP 40,000.00 | Amount and currency are configured together. The cap is enforced only for the configured currency; this is not currency conversion or currency-based assignment. | Schema bounds, role controls, audit event, and configured-limit submission rejection. |
| One outstanding Cash Advance | Enabled | When enabled, a requestor must submit the linked Liquidation before another Cash Advance can be submitted. Disabling it permits multiple outstanding advances but does not alter existing records. | Enabled behavior regression plus configuration persistence and disabled-state API/browser tests. |
| Cash Advance liquidation deadline | 15 calendar days | The submitted due date must equal the event-end date plus the configured number of calendar days. Holidays and business calendars are not applied. | Default and changed-deadline submission tests plus bounds validation. |
| Reimbursement invoice age | 30 calendar days | Age is measured at submission in Asia/Manila. `warning` accepts and records Finance-verification evidence, `block` rejects submission, and `none` performs no age check. | Warning evidence, blocking behavior, action enumeration, bounds, and API/browser role tests. |
| Required documents | Type- and scope-specific | Managed separately under **Request Requirements**. Rules may be request-level or line-level and required or conditional. Rules should not be used to represent Procurement documents until stable external identifiers are available. | Phase 04 rule CRUD, submission enforcement, five-role browser flow, and multi-line document tests. |
| Master data | Record-specific | Cost centers, accounts, tax codes, currencies, payment methods, and document types remain auditable records rather than free-form policy settings. Used records should be deactivated instead of deleted when historical references exist. | Phase 02 CRUD, authorization, reference-integrity, and browser tests. |

## Decisions that configuration cannot replace

Configuration can store an approved rule; it cannot supply missing business facts or external contracts. Finance or the external-system owner must still provide:

- official Chart of Accounts codes and effective dates;
- authoritative VAT/EWT codes, rates, calculation bases, and worked examples;
- Procurement/Vendor endpoint, authentication, stable identifiers, status semantics, and document references;
- the conditions that make Delivery Receipt or Business Permit applicable;
- approval-role authority and routing consequences for returned or materially changed requests;
- offline cash-release and returned-cash completion responsibilities;
- mandatory manual document attestations and waiver authority;
- production retention, security, accessibility, and operational ownership.

QuickBooks, bank connectivity, currency conversion, currency-based assignment, payroll deductions, Cash Advance exception approvals, and Petty Cash routing remain outside this configuration. No bank connection is planned.

## Test commands

Run browser click-through first, followed by API and build checks:

```text
pnpm test:e2e -- tests/e2e/request-settings.spec.js
pytest -q tests/test_payment_requests.py -k "finance_request_policies or reimbursement_batch or academic_year"
pnpm run build
```

Automated tests must use the dedicated `_test` PostgreSQL database. Browser acceptance uses the disposable E2E database and restores changed values before teardown.
