# Local Docker acceptance — 2026-09-23

Reviewer: Codex local audit
Environment: Docker Desktop 4.92.0, Engine 29.8.0, PostgreSQL 16, FastAPI application image built from the current worktree
Status: Local Docker gates passed. The non-local gates below remain deferred.

## Passed locally in Docker

- Built the current FastAPI image and started healthy application and PostgreSQL containers on loopback-only validation ports.
- Replayed the complete Alembic chain from an empty database to `20260922_0007`, downgraded to base, and upgraded to head again.
- Ran the deterministic seed twice. The resulting catalog contained five system settings, eight approved departments and cost centers, three currencies, nine users, and nine roles.
- Ran the complete backend suite against the isolated Docker PostgreSQL database: **60 passed, 1 warning**. This includes identity/session cleanup, RBAC, Master Data CRUD and pagination, all five request types, duplicate matching, optimistic locking, concurrent numbering and submission, simultaneous edits, large-list pagination, performance, and allocation/rounding boundaries.
- Verified live HTTP 200 responses and request IDs for `/healthz`, `/readyz`, `/api`, `/api/v1/system/status`, and `/docs`.
- Verified login, authenticated-session continuity across an application-container restart, logout, and rejection of the logged-out session.
- Verified live Master Data lists, pagination, vendor search/masking, removed bank routes returning 404, zero bank routes in OpenAPI, and zero vendor bank fields.
- Verified migration `20260922_0007` refuses to remove a populated historical `company_bank_accounts` table and leaves the prior revision and record intact. After deleting only the synthetic fixture, the migration completed and removed the table.
- Created and restored a PostgreSQL custom-format logical backup. Source and restore matched at 23 public tables, revision `20260922_0007`, and sampled user, department, cost-center, currency, and payment-request counts.

## Not solvable or not authoritative in local Docker

| Deferred gate | What is needed later |
|---|---|
| Production HTTPS and reverse proxy | A production-like deployed environment, real domain/certificate, proxy headers, secure cookies, HSTS, and deployment-owner review. |
| Production backup and disaster recovery | Approved backup storage, encryption, retention, RPO/RTO, restore credentials, and an operational restore exercise. The local logical restore proves application/database compatibility only. |
| Firefox and Safari | Access to the target browser/OS combinations and a documented cross-browser walkthrough. |
| Full accessibility review | Keyboard-only review of all flows, screen-reader testing, contrast/zoom checks, and remediation evidence. |
| Penetration/security assessment | An approved test environment, scope, credentials, and security reviewer/tooling. |
| LifeOS SAML | Identity-provider metadata, test tenant, claims/role mapping, certificate/key handling, and logout/session policy. Local email/password authentication remains required. |
| Live vendor integration | Provider URL, authentication, identifiers, pagination/filtering, error/rate-limit contract, and sandbox fixtures. The deterministic adapter mock remains active. |
| External P.O. lookup | Provider contract, authentication, schema, lifecycle/error behavior, and sandbox access. |
| Finance-owned Master Data | Approved cost-center effective dates and cross-department policy, authoritative chart of accounts, and final VAT/EWT codes, rates, and effective dates. QuickBooks work remains deferred while stable internal identifiers are retained. |
| Finance-owned Phase 03 policies | Cash Advance limits/outstanding/deadline rules, final General Payment documents, and return/reopen editability. |
| Full browser lifecycle acceptance | Complete `TC-P03-029` for all five request types in the integrated UI: edit, submit, return, resubmit, cancel, reopen, role visibility, and error states. Automated API coverage passed, but it is not a human UI sign-off. |

No bank connection is planned. Future cash-release functionality records the releasing bank as documentation only.
