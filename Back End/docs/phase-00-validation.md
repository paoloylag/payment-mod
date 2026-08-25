# Phase 00 validation record

Date: 2026-08-25
Branch: `codex/backend-integration`
Commit: `4ddd199`
Status: Validated
Reviewer: Codex local audit with GitHub Actions verification

## Implemented

- Versioned `/api/v1` system routing, standardized problem responses, request IDs, structured request logging, and CORS.
- Separate liveness and database readiness endpoints.
- SQLAlchemy transaction rollback convention and PostgreSQL readiness check.
- Plural `system_settings` foundation table with reversible Alembic migration.
- Deterministic, idempotent foundation seed command.
- Backend fixtures and smoke tests.
- Docker-first startup that migrates and seeds before serving.
- CI checks for lint, migration upgrade, seed, rollback/replay, tests, Docker image build, and artifact packaging.
- Frontend `mock`, `hybrid`, and `api` data-source modes; hybrid mode preserves the prototype when the backend is down.

## Validation evidence

- `python -m ruff check --no-cache api migrations tests` — passed locally on 2026-08-25.
- `python -m compileall -q api migrations tests` — passed locally.
- `pytest tests/test_system.py -k "liveness or api_root or not_found" -q` — 3 tests passed locally.
- `alembic heads` and `alembic history` — one valid head, `20260819_0001`.
- JavaScript syntax checks for `src/prototype.js` and `src/data-source.js` — passed locally.
- `pnpm build` — TypeScript and Vite 7.0.7 production build passed locally.
- GitHub Actions run [`32719293106`](https://github.com/paoloylag/payment-mod/actions/runs/32719293106) — passed for commit `4ddd199` on 2026-08-24.
- GitHub `test` job — lint, PostgreSQL migration, deterministic seed, rollback/replay, readiness coverage, backend tests, and coverage completed successfully.
- GitHub `package` job — Docker image build and deployable image artifact packaging completed successfully.
- WSL 2.7.12 and Docker Desktop engine 29.6.2 — installed and running locally on 2026-08-25.
- `docker compose up --build -d` — built the FastAPI image and started healthy PostgreSQL 16 and API containers locally.
- Live PostgreSQL validation — migration `20260819_0001`, `Asia/Manila` session timezone, and four deterministic `system_settings` rows confirmed.
- Live API validation — `/healthz`, `/readyz`, `/api`, and `/api/v1/system/status` returned HTTP 200 with request IDs; readiness and system status reported `database: connected`.
- Local migration downgrade/replay and double seed — passed against PostgreSQL 16.
- Full local backend suite — 6 tests passed with 89% statement coverage.
- Integrated frontend — rendered at `http://127.0.0.1:5175/#/dashboard`, displayed `API connected`, and produced no browser console errors.
- Request-ID propagation — a supplied `phase-00-propagation-test` header was returned unchanged and recorded in the structured request log.
- Structured request logging — method, path, status, duration in milliseconds, and request ID were confirmed in container logs.
- Hybrid fallback — with the API container stopped, the dashboard remained usable, displayed `Hybrid · mock fallback`, and produced no browser console errors; the API was restarted and returned to healthy readiness afterward.

## Local environment validation

The workstation now has WSL 2.7.12 and a functioning Docker Desktop engine. The repository's Compose stack was built and
launched locally, including PostgreSQL 16 and the FastAPI service. Database readiness, migration state, deterministic
seed data, Philippine timezone configuration, rollback/replay, the full backend test suite, and the hybrid frontend API
indicator were all verified successfully.

The backend-branch GitHub Pages preview was deferred after GitHub rejected the branch deployment at the Pages
environment gate. The stable `main` Pages workflow is retained, and hybrid/mock operation remains available locally.

## Phase 00 approval

Phase 00 is approved as `Validated`. Re-run all gates after changes to configuration, database foundations, middleware,
migrations, seed behavior, Docker packaging, or system endpoints.
