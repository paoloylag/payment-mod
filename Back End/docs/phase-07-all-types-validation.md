# All request-type payment flow and formatting validation

Date: 2026-10-13, Asia/Manila
Branches: `codex/ui-finance-consistency` → `codex/phase07-all-request-types`
Formatting commit: `aaadb17`; hosted CI run 38403650393 passed.
Reviewer: Codex implementation and verification. Finance must select its actual accounts and activate the configuration; business acceptance remains open.

## Confirmed rules

All request types use the shared voucher/payment flow and one signatory per payment line. Reimbursement and PO Payment use General defaults. Cash Advance uses an advance asset account. Liquidation pays only expenses exceeding the original advance. Fund-return processing remains deferred.

## Formatting register

- Finance section headings follow the existing 17px panel heading style; payment card headings use 15px body-family headings. Controls and values use 14px body text and labels use 13px text. The app's existing body/heading font families and light/dark theme tokens are preserved.
- Finance forms use the shared spacing, border radius, focus states and 42px controls. Evidence uploads use the shared rectangular Upload Files control and icon, with the selected file tag above it and an accessible removal control.
- Format and payment click-through passed at 390/768/1280 pixels. The current-device regression covers narrow and landscape phone/tablet viewports, navigation, filters and administration.
- Completed payment statuses use the completed tone. Approval dates in the API-backed tracker are no longer prototype dates.

## Functional register

| Area | Verification |
| --- | --- |
| Configuration activation | Explicit All scope; current draft/previous activation versions; General defaults and Cash Advance asset/credit validation |
| Reimbursement | General calculations; required per-line proof and physical originals; posting, issued voucher, authorization, evidence release and clearing |
| PO Payment | Procurement-backed request submission; General defaults; all financial lifecycle actions |
| Cash Advance | Gross asset accounting without tax deductions; one asset account; shared payment lifecycle |
| Liquidation excess | Original released advance reference; original asset/cost center credited; only the positive difference payable |
| Liquidation equality | Balanced posting and issued voucher; zero additional payment; no payment preparation allowed |
| Unused advance | Cash return pending; no false offline-return requirement; advance remains outstanding until settled |
| Duplicate liquidation | Original-source locking; already-posted settlement rejected |
| Visibility and navigation | Assigned signatory only; newly assigned links refresh accessible records; hidden/unavailable requests show not-found feedback |
| Tracker persistence | Workflow approval state and payment summary from server; entry refresh sees clearing recorded by another user |
| Printing | Issued Liquidation print includes original advance, applied principal, pending return, accounting and payment totals |

## Evidence and commands

- `tests/test_all_type_payments.py` covers all added types, excess/equal/unused liquidation, declared amount mismatch, duplicate posting, and outstanding-advance submission behavior.
- `tests/e2e/all-type-payments.spec.js` clicks Finance activation, calculation, accounting, certification, authorization, release and clearing for Cash Advance, Reimbursement, PO Payment and Liquidation against the dedicated Docker browser-test API. It also verifies live tracker states, file tags and responsive widths.
- Existing General voucher, approval/return/reopen, conversation visibility, EWT, configuration and currency-routing regressions are retained.
- Backend lint: `ruff check api tests migrations`; regression: `pytest -q`.
- Frontend: `pnpm build`; visible Chrome tests use the repository Playwright configuration.
- Print evidence: actual issued HTML under `outputs/phase07-liquidation-voucher-preview.html`; A4 export/render verification uses the bundled Chrome and Poppler tools.

## Local setup to exercise the flow

Open Administration → Request Settings. Select a posting Cash Advance debit account classified as an asset and its credit account, alongside the General tax/account and voucher defaults. Save the draft, select **All request types**, enter the activation reason and activate the saved version. Previous posted records retain their original configuration.

No migration is needed for this increment: applicability, source references and settlement amounts are recorded in the existing versioned configuration, calculation, journal and voucher snapshots. Hosted CI still verifies migration rollback/replay.
