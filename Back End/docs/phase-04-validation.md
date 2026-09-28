# Phase 04 — Validation record

Date: 2026-09-28
Status: In progress. The local document workflow and confirmed Reimbursement, P.O. Payment, and General Payment matrix are implemented. Cash Advance and Liquidation intentionally have no blocking upload rules. Remaining local and production work is separated below.

## Evidence

| Area | Result |
|---|---|
| Migration | Reversible revisions `20260923_0008` and `20260923_0009` created document roots, immutable versions, removal/cleanup state, requirement rules, hard-copy events, and review decisions on PostgreSQL 16. A live `0009 -> 0008 -> 0009` cycle passed. |
| Static checks | Ruff passed across `api`, `migrations`, and `tests`; Python compilation passed. |
| Focused tests | `pytest -q tests/test_seed.py tests/test_documents.py`: **5 passed, 2 warnings**. Deterministic document-type/rule seeding, condition guidance, upload, listing, preview, replacement, removal, duplicate warning, requirements, Finance histories, submitted locking, and unauthorized access are covered. |
| Complete regression | `pytest -q`: **73 passed, 2 warnings** against the isolated Docker PostgreSQL 16 test database on 2026-09-28. Migration, deterministic seed and Python compilation also passed. Ruff awaits the hosted CI package environment because its wheel was unavailable from the configured local package source. |
| Docker/MinIO | The current image, PostgreSQL 16, and private versioned MinIO bucket started successfully. A synthetic PDF uploaded, listed, streamed inline with an exact SHA-256 match, and was replaced; the response and database both retained two versions. Exact synthetic records and object prefixes were removed after validation. |
| Limits and integrity | Configuration enforces 50 MB per file and 100 MB active content per request. Request-row locking protects concurrent aggregate checks. Extension, declared MIME, signature, empty content, and traversal filename checks are implemented. |
| Authorization | Read routes require `documents.read` plus owning-request visibility. Upload/replacement require `documents.manage_own`, ownership, and `draft` or `returned` status. |
| Removal and cleanup | Draft/returned removal requires the owner and a reason, excludes the item from active listings, retains metadata/audit history, and records retryable object cleanup attempts. |
| Requirement rules | Finance managers/administrators can configure request- or line-level rules. The seed installs eleven active rules for Reimbursement, P.O. Payment, and General Payment, including conditional Delivery Receipt and Business Permit rules for P.O. Payment. General Payment always requires Billing / SOA / Quotation and dynamically requires BIR 2303 when marked as a new supplier. Required records block submit/resubmit; conditional records remain visible but non-blocking. Cash Advance and Liquidation are intentionally non-blocking for uploads. |
| Finance histories | Authorized Finance users can append hard-copy states and accepted/rejected/replacement-required decisions. Waivers and non-accept decisions require notes. |
| Frontend | JavaScript syntax checks and `pnpm run build` passed. The runtime adapter and document view support API upload, preview, replacement, removal, requirements, duplicate warnings, hard-copy state, and reviews while retaining standalone sample behavior. On 2026-09-28, request-level, line-level, single-file, multiple-file, add and replace controls were standardized on the accessible line-item upload icon pattern; the combined production build passed. |
| Running stack | Rebuilt app image is healthy at port `58002`; PostgreSQL is healthy at `55434`; MinIO remains private at `59000/59001`; readiness reports `database=connected`; new routes appear in OpenAPI. |
| QA register | Phase 04 development items, nine test cases, current execution records, and three acceptance gates are recorded in the consolidated development/test register. `TC-P04-009` and `RUN-20260928-004` record the responsive/unified-upload closeout; `RUN-20260928-001` records the current full regression. |

## Local validation still required

- Obtain Finance clarification on the unchanged Reimbursement Proof of Payment and conditional Billing / Quotation / SOA rules. Approved P.O. and Quotation/Contract data are assigned to the future Procurement integration. General Payment Billing / SOA / Quotation and new-supplier BIR 2303 rules are confirmed. See `docs/finance-orientation-findings-2026-09-25.md`.
- Full role-based browser walkthrough and accessibility review of the API-backed document workspace.

## Deferred to Phase 09 — production readiness

- Production AWS bucket, IAM/workload identity, encryption, monitoring, and staging validation.
- Malware-provider integration and approved fail-open/fail-closed behavior.
- Formal retention, archival, legal-hold, and S3 lifecycle policy activation.

Phase 04 remains `In progress` because its local gates are not complete. It may be marked **Validated for local development** after the local gates are resolved or formally accepted; the Phase 09 production-readiness work does not block that local status.
