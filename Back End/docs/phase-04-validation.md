# Phase 04 — Validation record

Date: 2026-10-07
Status: Validated for local development. The local document workflow and confirmed document matrix passed API, storage, browser, responsive, and regression checks. Production storage/security/lifecycle activation remains Phase 09 work.

## Evidence

| Area | Result |
|---|---|
| Migration | Reversible revisions `20260923_0008` and `20260923_0009` created document roots, immutable versions, removal/cleanup state, requirement rules, hard-copy events, and review decisions on PostgreSQL 16. A live `0009 -> 0008 -> 0009` cycle passed. |
| Static checks | Ruff passed across `api`, `migrations`, and `tests`; Python compilation passed. |
| Focused tests | On 2026-09-29, `pytest -q tests/test_documents.py` completed against the isolated Docker PostgreSQL test database with **6 passed, 1 warning in 16.44 seconds**. The suite covers the corrected per-line-only Reimbursement rule, General Payment requirements, upload, listing, preview, replacement, removal, duplicate warning, requirement evaluation, Finance histories, submitted locking, and unauthorized access. |
| Complete regression | `pytest -q`: **73 passed, 2 warnings** against the isolated Docker PostgreSQL 16 test database on 2026-09-28. Migration, deterministic seed and Python compilation also passed. Ruff awaits the hosted CI package environment because its wheel was unavailable from the configured local package source. |
| Docker/MinIO | The current image, PostgreSQL 16, and private versioned MinIO bucket started successfully. A synthetic PDF uploaded, listed, streamed inline with an exact SHA-256 match, and was replaced; the response and database both retained two versions. Exact synthetic records and object prefixes were removed after validation. |
| Limits and integrity | Configuration enforces 50 MB per file and 100 MB active content per request. Request-row locking protects concurrent aggregate checks. Extension, declared MIME, signature, empty content, and traversal filename checks are implemented. |
| Authorization | Read routes require `documents.read` plus owning-request visibility. Upload/replacement require `documents.manage_own`, ownership, and `draft` or `returned` status. |
| Removal and cleanup | Draft/returned removal requires the owner and a reason, excludes the item from active listings, retains metadata/audit history, and records retryable object cleanup attempts. |
| Requirement rules | Finance managers/administrators can configure request- or line-level rules. The seed installs nine active rules for Reimbursement, P.O. Payment, and General Payment, including per-line Reimbursement Proof of Payment and conditional Delivery Receipt and Business Permit rules for P.O. Payment. General Payment always requires Billing / SOA / Quotation and dynamically requires BIR 2303 when marked as a new supplier. Required records block submit/resubmit; conditional records remain visible but non-blocking. Cash Advance and Liquidation are intentionally non-blocking for uploads. |
| Finance histories | Authorized Finance users can append hard-copy states and accepted/rejected/replacement-required decisions. Waivers and non-accept decisions require notes. |
| Frontend | JavaScript syntax checks and `pnpm run build` passed. The runtime adapter and document view support API upload, preview, replacement, removal, requirements, duplicate warnings, hard-copy state, and reviews while retaining standalone sample behavior. On 2026-09-28, request-level, line-level, single-file, multiple-file, add and replace controls were standardized on the accessible line-item upload icon pattern; the combined production build passed. |
| Five-role browser acceptance | `pnpm test:e2e -- tests/e2e/phase-04-documents.spec.js`: the original five-role scenario passed again in headed Google Chrome on 2026-09-29. Separate Requestor, Department Head, Finance Associate, Finance Manager, and System Administrator sessions used a real Docker PostgreSQL/MinIO record. The run verified configured requirements, upload, preview affordance, returned-request replacement, immutable version 2 history, role-limited review controls, hard-copy receipt, accepted Finance review, persisted cross-role state, and the Request Requirements administration view. |
| Multi-line Reimbursement browser acceptance | The focused suite includes an API-backed two-line Reimbursement scenario. Google Chrome displayed a separate required Proof of Payment upload for each persisted line, accepted different files for lines 1 and 2, verified that no separate request-level Invoice or Billing / Quotation / SOA requirement appeared, and submitted successfully. Together with the five-role scenario: **2 passed in 24.7 seconds**. |
| Responsive/accessibility UI | The same browser run verified accessible upload/replace labels and no document-workspace horizontal overflow at 1440×900, 768×900, and 390×844. Role-specific controls were located by accessible name or stable semantic control. |
| Running stack | Rebuilt app image is healthy at port `58002`; PostgreSQL is healthy at `55434`; MinIO remains private at `59000/59001`; readiness reports `database=connected`; new routes appear in OpenAPI. |
| QA register | Phase 04 development items, ten test cases, current execution records, and three acceptance gates are recorded in the consolidated development/test register. `TC-P04-010` and `RUN-20260929-001` record the multi-line Reimbursement browser closeout; `RUN-20260929-002` records the fresh-database focused backend run; `TC-P04-009` and `RUN-20260928-004` record the responsive/unified-upload closeout; `RUN-20260928-001` records the current full regression. |
| 2026-10-07 closeout | Browser-first document and role checks were followed by **99 passed, 1 warning, 90% coverage**, reversible migration replay, deterministic seed, Ruff, dependency audits, production build, and six headed Playwright scenarios. The Phase 04 five-role workflow and multi-line Reimbursement cases passed against disposable PostgreSQL/MinIO records. |

## Accepted local limitations

- Approved P.O. and Quotation/Contract data remain assigned to the future Procurement integration.
- A formal full assistive-technology review remains a Phase 09 production-readiness gate.

## Deferred to Phase 09 — production readiness

- Production AWS bucket, IAM/workload identity, encryption, monitoring, and staging validation.
- Malware-provider integration and approved fail-open/fail-closed behavior.
- Formal retention, archival, legal-hold, and S3 lifecycle policy activation.

Phase 04 is **Validated for local development**. The Phase 09 production-readiness work does not block that local status.
