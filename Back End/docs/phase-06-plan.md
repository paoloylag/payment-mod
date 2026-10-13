# Phase 06 — Finance Validation and Vouchers

Date prepared: 2026-08-28  
Status: In progress — General configuration activation, automatic account assignment, and EWT snapshots implemented; balanced accounting entries and vouchers remain pending.

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

### General configuration activation and automatic coding — 2026-10-13

- Finance Manager or System Administrator with request-settings management permission can activate a saved, complete General tax/account configuration. Activation requires a reason, matching draft/previous activation versions, and an idempotency key. Immutable activation history includes the actor, source version, effective date, account references, and default tax rates.
- Activation validates the General tax bases, rounding/date choices, active effective tax code, and distinct active posting debit/credit accounts. Department-specific activation and VAT-exclusive additions to the approval amount are not supported. Other request types and voucher settings remain draft.
- Before the first activation, existing behavior remains available. After activation, General creation/editing and submission use the effective active version. Missing/expired tax codes, invalid posting accounts, and missing/expired department cost centers block the affected request. A first activation scheduled for the future blocks General requests until its effective date; a previously active version remains usable while a later version is scheduled.
- The active debit account and request department's cost center are assigned automatically to each line. The credit account is retained in the immutable coding snapshot. Request forms show these fields as automatic. Every create/edit/submission version records the configuration, account names/codes, currency, and line amounts; new draft configuration edits cannot rewrite an earlier submitted snapshot. Returned requests use the currently effective version when edited/resubmitted.
- General EWT reads the request's bound configuration and frozen default tax rates. Already-saved EWT snapshots remain intact. Legacy submitted requests that predate account activation retain their historical request data; automatic coding is applied when they are edited or resubmitted.
- UI: Request Settings → Activate General request setup; request details → Automatic account assignment. No real Finance configuration was activated automatically during development; the feature awaits Finance selecting the accounts and activating its saved setup.
- Validation: 169 backend tests passed; activation browser workflow passed at 390/768/1280px including error/retry, keyboard activation, immutable coding display, and automatic request fields. Five existing Finance/EWT/approval browser workflows also passed. Migration 0022 rollback/replay, lint, build, and diff check passed. Evidence: `outputs/phase06-activation-mobile.png`.
- Next: accounting workbench and balanced VAT/EWT/payable entries, controlled per-request coding corrections, and vouchers. No journal posting or voucher generation is implied by account assignment.

### General request EWT — 2026-10-13

- Owner confirmed General requests use configured tax defaults, with Finance Associate assigning EWT at request level and overriding individual lines. A line can explicitly select No EWT; selecting an EWT code never changes the default VAT classification/rate.
- Request details show a default preview, a request EWT dropdown, inheriting/overriding line dropdowns, calculation totals and breakdown, and immutable saved history. Only the currently assigned Finance Associate (including an assigned information/correction response) may save; reached participants may view.
- Saving records a reason, actor, request version, configuration version and date basis, rates/classifications, line amounts, decimal rounding, EWT bases/results, VAT and amount due. Repeated commands are idempotent; stale versions and foreign request lines are rejected. The request is locked with its workflow while saving.
- When a General tax default is configured, Finance Associate approval requires a saved calculation for the current request version. Editing/resubmitting a request invalidates its previous calculation; historical snapshots remain intact. Previously unconfigured requests retain the existing flow until Finance supplies the General tax default. Full configuration activation and the creation/submission gate remain separate work.
- Calculations honor currency precision, configured half-up/half-even rounding, gross/net-of-VAT EWT bases, and configured rule date. Gross must equal the request amount. VAT-exclusive additions that increase the approved amount are blocked rather than silently changing the approval basis.
- Account mappings, balanced entries, and voucher operations remain pending. Other request types are not included in this EWT increment.
- Validation: 165 backend tests passed; five Chrome workflows passed, including General EWT at 390/768/1280px, error/retry, keyboard save, persistence, and existing approvals. Migration 0021 downgrade/replay, backend lint, and frontend build passed. Mobile evidence: `outputs/phase06-general-ewt-mobile.png`.

### Readiness implementation — 2026-10-13

- Request Settings now displays a live Finance readiness checklist, including missing choices, current tax/account reference validity, effective dates, distinct debit/credit accounts, department cost centers, and nonblank voucher certification. Saving or reloading recomputes the report from current master data.
- Draft completeness is distinct from activation. The report explicitly keeps activation pending the vendor/line applicability and mapping rules. No tax rates or accounts are silently activated.
- Request creation/editing reject inactive departments, non-posting or ineffective accounts, and ineffective or cross-department cost centers. Submission rechecks current master data so older drafts cannot bypass deactivation/expiry.
- Validation: 52 focused backend tests passed, including seven new readiness cases. Five Chrome workflows passed: Finance setup/readiness at 390/768/1280px with keyboard interaction, all-request-type approval lifecycle, executive information/messages, foreign-rate confirmation, and assignment exceptions. Build and backend lint passed. Existing Finance document, line, and physical-original approval gates remain in force.
- Next: confirm vendor/line applicability and mapping exceptions, implement versioned activation/sign-off and the complete request readiness gate, then automatic tax/account snapshots and vouchers.

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
