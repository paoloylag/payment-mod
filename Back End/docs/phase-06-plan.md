# Phase 06 — Finance Validation and Vouchers

Date prepared: 2026-08-28  
Status: Not started  
Depends on: Phase 05 — Workflow and Approvals

## Objective

Persist Finance review, tax/accounting decisions, and auditable voucher generation after required approvals.

## Scope

- Document and line decisions, reviewer notes, receipt-copy status, and completion timestamps.
- VAT/EWT classification, No EWT, tax snapshots, VAT-inclusive calculations, and amount-due calculation.
- Debit/credit accounting entries and balanced-entry enforcement.
- Voucher numbering, request/tax/accounting snapshots, printing data, payment method, references, digital certification, posting, voiding, and replacement history.
- Preserve the PHP 200,000 TOJUST Construction request as a business-validation fixture.

## Planned data model

- Finance-validation header with assigned/completing reviewer, state, notes, completion time, and source request/workflow versions.
- Per-document and per-line review decisions with reason and supporting metadata.
- Immutable tax snapshots recording selected tax code, VAT/EWT classification, rate, bases, calculated amounts, rounding, and source configuration version.
- Accounting batches and debit/credit lines with account, department/cost center, currency, amount, description, and balance state.
- Voucher header, immutable request/tax/accounting snapshots, number, certification, print data, posting state, void reason, and replacement links.

## Calculation and validation rules

- Use fixed-precision decimal arithmetic; binary floating point is prohibited for money and tax calculations.
- For the confirmed VAT-inclusive rule, calculate net-of-VAT/EWT base as `gross / 1.12`, VAT as `gross - base`, EWT as `base × selected rate`, and amount due as `gross - EWT`, subject to stakeholder confirmation and approved rounding.
- No EWT is an explicit classification, not an absent value.
- Every calculated field stores both its result and the configuration/rule snapshot used.
- Finance completion requires all required documents and lines to have final decisions and accounting entries to balance by approved dimensions.
- Voucher creation is allowed only once per eligible completed/approved source state and uses an atomic numbering sequence.
- Posting, voiding, and replacement are separate commands; no operation overwrites historical voucher data.

## Authorization and controls

- Finance Associate/Manager capabilities are separated according to the confirmed review and posting matrix.
- Requestors and department approvers receive safe read-only outcomes, not unrestricted accounting details.
- Voucher create, post, void, replace, and certification actions have distinct permissions and required reasons.
- System Administrator cannot bypass tax, balance, or lifecycle invariants.
- All mutations are CSRF-protected, version-checked, idempotent where repeat submission is possible, and audited.

## API and frontend behavior

- Finance work queue filters by readiness, assignment, aging, department, request type, and validation state.
- Validation APIs support document/line decisions, tax selection/calculation, accounting drafts, balance checks, and completion.
- Voucher APIs support create, retrieve, print dataset, post, void, and replacement history.
- The frontend displays calculation breakdowns, source configuration version, missing requirements, balance differences, certification, and immutable history.
- Print output derives from persisted server data and must not calculate authoritative values in the browser.

## Security and operational requirements

- Mask restricted bank/payment references according to permission and context.
- Prevent formula injection in exported/printable free-text fields.
- Index Finance queue state, request, voucher number, posting state, and completion/posting timestamps.
- Backup/restore validation must preserve numbering, snapshots, accounting balance, and replacement history.

## Delivery sequence

1. Confirm tax rules, account mappings, voucher format, posting authority, and certification wording.
2. Add Finance review, tax snapshot, accounting entry, voucher, posting, void, and replacement models.
3. Implement decimal-safe calculation, balance validation, completion, numbering, and idempotent creation services.
4. Add Finance validation, accounting, voucher, print-data, post, void, and replace APIs.
5. Connect Finance workbench, validation forms, accounting entry UI, and printable voucher view.
6. Add tax-boundary, rounding, balance, authorization, idempotency, and snapshot tests.

## Acceptance gates

- Validation cannot complete with missing required documents, invalid tax data, or unbalanced entries.
- Tax calculations and snapshots reproduce approved examples exactly.
- A voucher can be created only after final approval and is idempotent per eligible request.
- Posting, voiding, and replacement preserve all historical vouchers and certifications.
- Printable data reconciles to the request, tax snapshot, and accounting entries.

## Test and validation matrix

- Approved tax examples, including TOJUST Construction PHP 200,000, with exact expected intermediate and final amounts.
- Zero, negative, large, fractional-cent, rounding-boundary, VAT/EWT/No-EWT, and foreign-currency scenarios.
- Missing/returned documents, rejected lines, invalid tax data, incomplete reviews, and unbalanced entries.
- Voucher-number concurrency, repeated creation/idempotency, unauthorized creation, posting, void, and replacement.
- Snapshot immutability after master-data/tax policy changes.
- Print/export reconciliation, escaping/formula-injection protection, permissions, audit, migration replay, backup/restore, browser layouts, build, Docker, and CI.

## Expected evidence

- Approved calculation specification and fixtures, balanced-entry samples, voucher lifecycle demonstration, print render review, automated/security results, QA register entries, reviewed archive/checksum, and CI run.

## Decisions required before implementation

- Approved VAT/EWT formulas, rates, rounding, and effective-date behavior.
- Chart-of-account mappings and who may override them.
- Voucher numbering, layout, certification text, and posting/void authority.
- Treatment of foreign-currency vouchers.

## Exclusions

Bank/check processing, release, clearing, and settlement attempts are delivered in Phase 07.
