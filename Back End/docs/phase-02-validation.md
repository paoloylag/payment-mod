# Phase 02 — Validation record

Date: 2026-09-22
Status: In progress. Local checks are recorded below; Finance reference-data and live vendor integration remain open.

## Current scope

- Seven Master Data views: Cost Centers, Vendors, Chart of Accounts, Tax Codes, Currencies, Payment Methods, and Document Types.
- QuickBooks-specific mapping/import/export is deferred. Stable internal account codes remain for a possible future adapter.
- No bank connection is planned. Phase 07 will record only the releasing bank name/reference and manual cash-release evidence.
- The protected Company Bank Accounts page, API routes, model, special permissions, encryption code, and vendor bank fields are removed. Migration `20260922_0007` removes the empty table and permission rows, and refuses to drop a table containing records. Historical migration `20260903_0005` remains immutable.

## Evidence

| Area | Result |
|---|---|
| Master Data | Bounded list pages and frontend aggregation; deterministic seeds, department/cost-center synchronization, duplicate and account-cycle rejection, safe delete/deactivation, vendor search and field exclusion covered by tests. |
| Removed bank administration | Removed endpoints return 404, do not appear in OpenAPI, and bank permissions are absent from administration. Migration applied to development and isolated test databases after confirming zero account records. On the disposable test database, a single synthetic row caused upgrade to refuse the table drop; the revision stayed at `20260908_0006` and the row survived. After deleting only that fixture, upgrade to `20260922_0007` succeeded. Historical audit events, if any, remain immutable. |
| Frontend | Production build passed after the mobile correction. Desktop mock-mode walkthrough confirmed the remaining tabs exclude Bank Accounts; the legacy bank-account URL redirects to Cost Centers. At 390 × 844, all seven tabs rendered with no document horizontal overflow. Mobile navigation opens and closes. A legacy stylesheet override that kept the closed sidebar visible was corrected in `boilerplate-shell.css`. At 768 × 900, the document also had no horizontal overflow. |
| API unavailable and keyboard | Hybrid mode with its API URL pointed to an unavailable local port displayed the mock fallback and a backend-unavailable alert while Cost Centers still rendered. In the Tax Code dialog, focus entered the Code field; Escape closed it and restored focus to `+ Tax Code`. These are focused checks, not a full assistive-technology audit. |
| Dependencies | `pnpm audit --audit-level high` and `pip-audit -r requirements.txt` reported no known vulnerabilities on 2026-09-22. The unused `cryptography` dependency was removed with the feature. |
| Backend | `pytest -q`: **58 passed, 1 warning** after removal and again after the mobile check. Focused identity/master-data tests: **20 passed, 1 warning**. Ruff and `git diff --check` passed. Alembic offline upgrade/downgrade SQL generated. |
| Local container configuration | `docker compose config --quiet` passed. No Docker Desktop installation, service, or daemon was found on this device, so this is configuration validation only; the isolated PostgreSQL-backed tests above did run against the local test database. |
| CI configuration | The repository-root `.github/workflows/backend-ci-cd.yml` already runs PostgreSQL-backed backend tests and builds a Docker image artifact. A frontend build job was added on 2026-09-22. No hosted run for these uncommitted changes exists yet. |

The previous baseline had 59 passing tests. One bank-specific test was retired and replaced with removed-route/field-exclusion assertions. The first post-removal run exposed two obsolete test expectations; both were corrected and the full suite passed.

## Validation still required

- Complete a full keyboard and screen-reader walkthrough of all seven Master Data pages, including CRUD flows and error states. The 2026-09-22 mobile/hybrid checks and focused dialog-keyboard check do not establish assistive-technology compatibility. Repeat hybrid fallback checks across all seven tabs if this is a release gate; Cost Centers was the explicitly observed unavailable-API state.
- Hosted CI, production-proxy/HTTPS, release artifact, and cross-browser/accessibility evidence remain production gates. The workflow is present at the repository root, but its next run requires these changes to be committed and pushed or submitted as a pull request. The CI Docker-image artifact cannot substitute for a production-like deployment check.
- Before authoritative accounting data is used: Finance's initial cost-center effective date, cross-department charging policy, approved internal accounts, and VAT/EWT definitions. One item has exactly one cost center per line.
- For live vendor lookup: provider URL, authentication, pagination/filtering and error/rate-limit contract, and sandbox access. The deterministic mock remains in place.

Phase 02 should not be marked **Validated** until the applicable gates have evidence dates, reviewers, and accepted limitations in the development/test register.
