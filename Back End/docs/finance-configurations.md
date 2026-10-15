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

## Guided initial Finance setup

Open **Administration → Request Settings → Finance Setup Draft → Start / resume initial setup** as Finance Manager or System Administrator.

1. Prepare active posting accounts, tax codes, department cost centers, currencies, payment methods and request document requirements using the prerequisite links.
2. Select the tax calculation bases, rounding, effective date, sign-off scope and General default tax code.
3. Choose General expense/payable/VAT/EWT accounts and the Cash Advance asset/credit accounts. Reimbursement and PO Payment inherit General defaults; Liquidation offsets the original advance.
4. Set voucher numbering and certification wording. Finance Associate prepares; Finance Manager posts/certifies/voids.
5. Save progress, resolve saved-configuration blockers and activate **All request types** with a reason. Partial drafts can be saved and resumed after reload. Unsaved fields remain available while navigating within the guide; save before leaving or reloading.
6. Finance Manager exercises the document, approval, accounting, payment, Liquidation and voucher-print scenarios, checks all six review areas and records an acceptance note.

Acceptance records the activated version, Finance Manager identity, timestamp, review areas and note with an audit event. The record cannot be overwritten; an identical retry returns the same record. Draft changes need activation and a fresh review. Inactive or ineffective references block recording acceptance. Finance roles and System Administrators can view the record; other users cannot read the acceptance note.

The guide reuses existing activation and request enforcement. Its readiness checks prevent incomplete activation through the guide; it does not introduce a new business-acceptance gate for requests or payments. Recording acceptance is Finance's attestation after exercising the scenarios, not an automatic test result. SLA deadlines, reminders and escalation remain deferred.

## Fund returns and payment recovery

Finance Associate records the **full unused advance balance** on its issued Liquidation voucher, including receipt/deposit evidence, receipt reference/date, receiving office and an active posting cash/bank asset account distinct from the advance asset. Partial returns are rejected. Finance Manager independently verifies or rejects the receipt. Pending or rejected receipts leave the advance outstanding. Verification records balanced receipt entries (debit receiving asset, credit original advance asset), settles the returned balance, and retains the original expense/tax accounting. A rejected receipt can be recorded again with corrected evidence. Pending or verified returns prevent voucher voiding.

If the entire advance was unused, Finance can record its full return directly on the fully released Cash Advance without creating a zero-expense Liquidation. The receipt requires explicit confirmation that the entire amount is unused. This option is unavailable once Liquidation accounting is posted or payment recovery is pending. A pending or verified full return blocks Liquidation and separate payment recovery against the same funds. Only verification settles the advance and permits another advance under the outstanding-advance rule.

For a released or cleared payment line, Finance Associate records **full recovered funds** with evidence, receiving office/bank, returned-by name, amount, date and reason. Pending recovery retains the released/cleared balance and blocks further actions on that line. A different Finance Manager confirms reversal or rejects recovery. Rejection restores the prior payment state. Confirmation reduces the net released/cleared totals and makes that amount available for a linked replacement of the same amount on the same voucher. The replacement requires fresh independent signatory authorization. Request approvals, tax calculations and expense accounting remain recorded.

All amounts use the original request currency. The system records Finance's evidence of money already received; it does not move money through a bank connection. An advance with posted Liquidation accounting cannot be recovered as a payment; its existing settlement must be resolved first. Pending recovery also prevents new Liquidation accounting against that advance.

Receipt/recovery records, review decisions, evidence references, actors, timestamps, reasons and payment replacement links remain in their histories and audit events. Idempotency keys and request locks prevent duplicate settlement. Migration `20261015_0027` refuses a downgrade that would discard receipt or recovery history.

### Initial setup verification

Use `pnpm test:e2e:isolated` for browser regression, including `finance-initial-setup.spec.js`. The setup scenario uses only the disposable E2E database and verifies save/resume, blockers, error retries, All activation, acceptance, version changes, keyboard submission and mobile/tablet/desktop layouts. API tests are in `tests/test_finance_initial_setup.py`.

## Test commands

Run browser click-through first, followed by API and build checks:

```text
pnpm test:e2e -- tests/e2e/request-settings.spec.js
pytest -q tests/test_payment_requests.py -k "finance_request_policies or reimbursement_batch or academic_year"
pnpm run build
```

Automated tests must use the dedicated `_test` PostgreSQL database. Browser acceptance uses the disposable E2E database and restores changed values before teardown.
