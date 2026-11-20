# Phase 02 — Validation record

Date: 2026-10-07
Status: Validated for local development. Production activation and authoritative external reference data remain Phase 09 gates.

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
| Local Docker acceptance | Docker Desktop 4.92.0 / Engine 29.8.0 built and ran the current image with PostgreSQL 16. The complete 60-test suite passed against an isolated Docker database. Live Master Data lists and pagination passed; vendor results contained no bank fields; removed bank routes returned 404 and were absent from OpenAPI. A populated historical bank table correctly blocked migration `20260922_0007`, preserved the row and prior revision, and upgraded only after the synthetic fixture was removed. Full migration replay and logical backup/restore also passed. See `docs/local-docker-acceptance-2026-09-23.md`. |
| Hosted CI and Docker package | [Run 35691873675](https://github.com/paoloylag/payment-mod/actions/runs/35691873675) for commit `5060c20` completed successfully on 2026-09-22: frontend build, PostgreSQL-backed backend test/migration job, and Docker image build/package job all passed. GitHub reports uploaded artifact `payment-module-image-5060c204863cebe637907d8831fbb8d6b2383b35` (67,878,509 bytes; seven-day retention). This confirms image build, not a deployed container smoke test. |
| Cross-phase UI regression | The 2026-09-28 responsive sweep retained compact administration navigation, mobile list/card conversions and aligned panel content. The combined production frontend build passed. Full assistive-technology acceptance remains open. |
| 2026-10-07 closeout | Browser-first role checks covered all seven Master Data views without fetch errors or horizontal overflow. The complete suite passed with **99 tests, 1 warning, and 90% coverage** after a fresh migration/seed cycle. Ruff, reversible migration replay, deterministic seed, Python dependency audit, JavaScript dependency audit, and the production frontend build passed. |

The previous baseline had 59 passing tests. One bank-specific test was retired and replaced with removed-route/field-exclusion assertions. The first post-removal run exposed two obsolete test expectations; both were corrected and the full suite passed.

## Accepted local limitations

- A full assistive-technology and hosted cross-browser review is a Phase 09 production-readiness gate.
- Authoritative Finance reference values and the live vendor/Procurement contract are external activation inputs. The
  deterministic local catalogs and adapter boundary remain the accepted development behavior.

## Deferred to Phase 09 — production readiness

- Production proxy/HTTPS validation.
- Hosted cross-browser and production accessibility evidence.
- Live vendor credentials, environment activation, monitoring, and operational support controls.

Phase 02 is **Validated for local development**. The development/test register contains the evidence date, reviewer,
commands, and accepted limitations; deferred production gates do not change this status.
