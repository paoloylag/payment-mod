# Phase 04 — Validation record

Date: 2026-09-23
Status: In progress. The first four document API capabilities are implemented and validated; the remaining Phase 04 slice is deferred as listed below.

## Evidence

| Area | Result |
|---|---|
| Migration | Reversible revision `20260923_0008` created document roots and immutable versions on PostgreSQL 16. Upgrade to head passed. |
| Static checks | Ruff passed across `api`, `migrations`, and `tests`; Python compilation passed. |
| Focused tests | `pytest -q tests/test_documents.py`: **2 passed, 1 warning**. Upload, listing, preview, replacement, duplicate warning, version history, unsupported format, submitted locking, and unauthorized access are covered. |
| Complete regression | `pytest -q`: **62 passed, 1 warning** against the isolated Docker PostgreSQL database. |
| Docker/MinIO | The current image, PostgreSQL 16, and private versioned MinIO bucket started successfully. A synthetic PDF uploaded, listed, streamed inline with an exact SHA-256 match, and was replaced; the response and database both retained two versions. Exact synthetic records and object prefixes were removed after validation. |
| Limits and integrity | Configuration enforces 50 MB per file and 100 MB active content per request. Request-row locking protects concurrent aggregate checks. Extension, declared MIME, signature, empty content, and traversal filename checks are implemented. |
| Authorization | Read routes require `documents.read` plus owning-request visibility. Upload/replacement require `documents.manage_own`, ownership, and `draft` or `returned` status. |

## Deferred to the next Phase 04 slice

- Draft document removal and retryable object cleanup.
- Persisted required-document rules and evaluation.
- Finance hard-copy state/history APIs.
- Finance/reviewer document-decision APIs.
- Frontend wiring for the implemented and deferred document operations.
- Malware-provider integration and production AWS environment validation.

Phase 04 remains `In progress`; this record validates only the explicitly bounded first slice.
