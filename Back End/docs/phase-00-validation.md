# Phase 00 validation record

Date: 2026-08-19
Branch: `codex/backend-integration`
Status: Ready for validation

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

- `python -m ruff check --no-cache api migrations tests` — passed.
- CORS comma-separated environment parsing — passed.
- `pytest tests/test_system.py -k "liveness or api_root or not_found" -q` — 3 tests passed.
- Python source compilation and JavaScript syntax checks — passed.

## Pending environment validation

Docker is required but was not installed or discoverable on the implementation workstation. GitHub CI successfully ran
PostgreSQL migration, deterministic seed, rollback/replay, readiness coverage, and the backend suite. Its first Docker
packaging job failed during the image build; the Dockerfile package-manager setup was corrected and still needs a green
rerun before Phase 00 can be marked `Validated`.

The backend-branch GitHub Pages preview was deferred after GitHub rejected the branch deployment at the Pages
environment gate. The stable `main` Pages workflow is retained, and hybrid/mock operation remains available locally.
