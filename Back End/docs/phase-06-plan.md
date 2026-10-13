# Phase 06 — Finance Validation and Vouchers

Date prepared: 2026-08-28  
Status: In progress — Finance Associate line/document approval gate started 2026-10-11

Finance Setup Draft was added to Request Settings on 2026-10-13. It saves versioned tax calculation choices, request-type tax/account defaults, voucher controls, and proposed sign-off scope. See [Finance configuration readiness](phase-06-finance-readiness.md). These saved choices await detailed applicability rules and activation; they do not yet enforce readiness or calculate vouchers.
Depends on: Phase 05 — Workflow and Approvals

## Finance Associate validation decisions — 2026-10-10

- Finance Associate must accept every required document before approving the validation stage. An uploaded file alone is insufficient; pending, rejected, or replacement-required decisions block approval.
- Each request line receives its own review result. Finance Associate can flag an individual line with a required reason; all lines must be accepted before the request advances.
- For Reimbursements, Finance Associate records whether the physical original for each line has been received. Missing physical originals block validation approval even when the electronic proof of payment is present. A persistent per-line checkbox and approval gate are now implemented in the backend-backed Finance validation view.
- Finance Associate may Return to Requestor for correction or Fully Decline with a required reason, consistent with the owner's rule through Finance Manager. After the requestor corrects and resubmits, the approval resumes at Finance Associate; prior Department Head approval remains recorded and is not repeated. The system must preserve the flagged line/document targets and the before/after history.
- Finance must finish initial required configuration before users can create or submit a request of the affected type. The readiness check must identify missing settings and prevent an incomplete configuration from silently producing a route or validation result. The exact required-setting checklist is to be finalized with Finance.
- Finance's initial VAT/EWT and account-mapping setup applies automatically to each eligible request. Finance Associate does not manually choose tax rates or account codes as a condition of passing the document/line validation stage. The calculated classifications, mappings, and configuration versions remain visible for later Finance review and correction through controlled, audited actions. A missing applicable tax rule or account mapping is a configuration-readiness failure, not an implicit zero rate or uncoded line. Confirmed by owner on 2026-10-10.

## Development update — 2026-10-11

- Added immutable per-line Finance review records with an accepted/flagged decision, required reason for a flag, request version, reviewer, and per-line physical-original receipt for Reimbursements.
- Added a Finance validation summary API and a backend gate on Finance Associate approval. Every line must be accepted, every uploaded document must have an accepted review of its current version, active required-document rules must be met, and Reimbursement physical originals and line-level proof of payment must be received. Attachment references without reviewable uploaded documents block advancement.
- Connected a mobile-first Finance Associate review card to the saved backend assignment. It shows blockers, document decisions, line decisions, physical-original checkboxes, and an approval action that becomes available only when the server reports readiness.
- Migration `20261011_0016` was applied to the local development and dedicated test databases. Focused Finance tests cover the approval gate, flagged-line reasons, physical originals, reviewer permission, and invalidation of an accepted review after document replacement. The frontend build passed; a local Chrome check found no page overflow at 390px, 768px, or 1280px.
- Finance Associate Return/Fully Decline and requestor resubmission to Finance Associate are implemented. Finance Manager may also return to Finance Associate; a response resumes Finance Manager without repeating earlier approvals. The configuration-readiness checklist, automatic tax/account mapping, accounting workbench, and vouchers remain pending. The prototype's manual tax/accounting controls remain mock-only.

## Correction-target update — 2026-10-11

- Finance returns now snapshot the outstanding line decisions, document decisions, and validation blockers in the immutable workflow event before the request version changes. The requestor sees these targets beside the return reason and in approval history. Finance Associate sees them when Finance Manager sends a request back for correction.
- The correction target snapshot preserves the reason and exact line/document IDs across requestor edits and resubmission. Current review decisions still use the current request version. Finance configuration readiness, tax/account automation, accounting, and vouchers remain pending Finance's rule details.

## Configuration readiness checklist — 2026-10-13

The concrete checks, current enforcement, Finance decisions still needed, and implementation order are recorded in [phase-06-finance-readiness.md](phase-06-finance-readiness.md). The tax applicability and account-mapping matrix must be confirmed before a complete creation/submission gate can claim that automatic coding is ready.

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

- Existing request and approval flows remain usable; Finance and voucher views pass mobile-first checks at mobile, tablet, and desktop widths, including review forms and printable output.

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
