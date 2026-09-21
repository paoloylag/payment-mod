# Phase 02 — Approval-free validation record

Date: 2026-09-22
Status: Technical checks passed; Phase 02 remains **In progress** pending Finance data and the external vendor contract.
Scope: Current request-documentation rollout. No real company bank-account numbers or direct bank connection are in scope.

## Completed without new business approval

| Area | Evidence | Result |
|---|---|---|
| Reference-list scale | Master-data list APIs return stable, bounded pages of at most 100 records, with `X-Total-Count`, `X-Page`, and `X-Page-Size`. Frontend lists and dropdowns fetch subsequent pages while retaining mock fallback. | Passed automated pagination, search, active-filter, and ordering tests. |
| Master-data integrity | Department/cost-center seed and synchronization, duplicate codes, account-parent cycle, referenced-record deletion, and deactivation. | Passed focused API tests. |
| Vendor mock safety | Search, missing-vendor response, masked account identifier, and clear-number omission. | Passed focused API tests; live provider contract is not available. |
| Protected bank-code safety | Synthetic account-number encryption/redaction, wrong-key failure, and Finance Manager revocation of administrator sensitive access. | Passed focused tests. This is code assurance, **not** approval to store real bank details. |
| Frontend compatibility | Production Vite build with API, hybrid, and standalone mock data-source branches retained. | Passed production build. Mock-mode desktop browser walkthrough confirmed Cost Centers, Chart of Accounts, and read-only Vendors; Chart of Accounts modal now moves focus to the first field and restores it to the Add button on Cancel. Narrow-screen and full assistive-technology walkthrough remain to be recorded. |
| Migration | Alembic offline upgrade through `20260903_0005` and downgrade to `20260826_0004`. | SQL generated successfully; no live database downgrade was performed. |
| Regression | Dedicated `_test` PostgreSQL database; `pytest -q` and Ruff. | Full backend suite passed; command output recorded below. |

## Commands and results

- `..\.venv\Scripts\python.exe -m pytest -q` — **59 passed, 1 warning** on 2026-09-22.
- `..\.venv\Scripts\python.exe -m pytest tests/test_master_data.py -q` — **8 passed, 1 warning**.
- `..\.venv\Scripts\ruff.exe check api tests` — **passed**.
- `pnpm run build` — **passed**.
- `..\.venv\Scripts\alembic.exe upgrade 20260903_0005 --sql` — **passed**.
- `..\.venv\Scripts\alembic.exe downgrade 20260903_0005:20260826_0004 --sql` — **passed**.

The warning is emitted by the existing test/runtime dependency stack; it did not fail the suite. Automated tests refuse a database whose name does not end in `_test` and clean up test-created sessions and payment requests.

## Still open without a Finance decision

- Complete a fresh mobile-width, keyboard, screen-reader-label, and API-unavailable walkthrough of every Master Data administration page after the pagination change. A desktop mock-mode browser walkthrough covered Cost Centers, Chart of Accounts, and Vendors on 2026-09-22; the Chart of Accounts modal's initial and return focus were verified. Existing 2026-09-03 browser evidence predates this change.
- Record a current CI run, dependency audit, and production-proxy/HTTPS validation before release. Local results alone are not a release approval.
- Confirm whether existing protected bank-account endpoints should be disabled or omitted from the first production deployment. They remain permission-guarded in code but are not approved for real bank data in this rollout.

## Inputs still required for authoritative business data or live integration

- Finance's initial cost-center effective date and cross-department charging policy. One item and exactly one cost center per line is already confirmed; no split allocation within a line.
- Finance-approved QuickBooks account codes/names or a sample export, plus tax codes, VAT/EWT classifications, rates, and effective dates.
- External vendor provider URL, authentication, pagination/filtering behavior, error and rate-limit contract, and sandbox access. Deterministic mock lookup remains in place until then.
- Only if a later rollout stores real company bank-account numbers: encryption-key ownership/mechanism and sensitive-access minimum-owner or break-glass policy.

Do not change Phase 02 to **Validated** until the remaining applicable gates have an evidence date, reviewer, and accepted limitations recorded in the development/test register.
