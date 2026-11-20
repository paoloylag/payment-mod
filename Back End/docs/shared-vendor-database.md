# Shared vendor master — APS and Procurement

Prepared: 11 November 2026. Target database engine: the existing APS PostgreSQL database. This prepares the canonical shared table and APS behavior; it does not connect the current Procurement UI prototype to PostgreSQL.

## Data model

| Field | Contract |
| --- | --- |
| vendor_records.id | Global stable vendor identifier, primary key; both applications reference the same row ID. Names are not integration keys. |
| vendor_records.source_system | Non-null `aps` or `procurement`; check-constrained, indexed and immutable in place by a PostgreSQL trigger. |
| vendor_records.payload | Existing profile/document metadata, status, version and deletion marker. API presentation maps source_system to source; JSON source or ID cannot override canonical columns. Bank fields are excluded from APS's safe projection. |

One shared table replaces the earlier UI-only source derivation. Do not build another independent vendor table in Procurement and synchronize copies. Independently created records for the two ownership scopes can have the same legal/display name and distinct IDs; no name-based automatic merge occurs.

## Ownership and use

- General Payment requestors create APS supplier proposals within their own request; proposals remain inactive until Finance Associate accepts the three supplier documents and approves. Finance maintenance APIs retain their existing restricted access. Clients cannot submit/patch ownership metadata. APS duplicate-name checks apply within APS ownership.
- APS can view Procurement-owned records for POs but cannot edit, deactivate or delete them through its API. General/non-PO requests reject Procurement vendors.
- Procurement's future backend must create Procurement-owned rows and maintain only that ownership scope. Shared storage does not grant all users or applications universal write permission.
- Use one migration owner for this table: APS Alembic. Do not let Drizzle create a second master or independently alter the existing table.
- Add least-privilege service access and inverse Procurement-side authorization before connecting its backend. Database ownership constraints are not a substitute for authentication, grants or row-level authorization. No new database accounts, grants or live credentials were created here.
- Future persisted Procurement POs should reference vendor_records.id with a foreign key. Existing APS vendor references/snapshots are retained; this migration does not invent missing legacy vendor rows or add an unverified foreign key over historical external IDs.
- All writers must preserve versions and audit history, enforce duplicate rules and retain referenced records/tombstones. Do not bypass application lifecycle checks with raw writes merely because storage is shared.

## Migration 20261111_0033

Adds the owner column and index/check, backfills prior explicit Procurement source metadata and the known VEND-DEMO-001/003 Procurement fixtures, and leaves other existing rows APS-owned. IDs, JSON payloads, versions and payment/request snapshots are not rewritten. Local/test seed inserts missing sample rows with their declared ownership, never overwriting existing profiles or tombstones. Deployed reads suppress sample rows; no production sample insertion is enabled.

Downgrade refuses while any Procurement-owned row exists, preventing silent loss of ownership. An APS-only database can roll back/replay; test evidence is in outputs/shared-vendor-migration.log. Plan an explicit reviewed reconciliation if reversing a real shared deployment.

## Procurement integration still required

The provided Procurement repository currently has an empty domain schema and no vendor/PO business API. Its backend needs a PostgreSQL connection (or an authorized service layer over the same master), authenticated vendor lifecycle operations and document access. Cloudflare D1 is SQLite-based and cannot serve as a second authoritative copy of this PostgreSQL table. No connection, data import, external synchronization or vendor onboarding implementation is claimed here.

## Verification

Focused backend run: 77 cases passed, two warnings. Database constraint/JSON-spoof/seed-preservation cases and vendor/PO snapshot regressions included. Migration rehearsal used a newly created, uniquely named disposable PostgreSQL test database and removed only that database after checks. Full backend regression: 295 passed, two warnings; vendor browser suite: three cases passed. Database units T06–T08 all passed. Ruff and whitespace checks passed. Evidence: outputs/shared-vendor-full-tests.log, outputs/shared-vendor-focused-tests.log, outputs/shared-vendor-browser.log and outputs/shared-vendor-migration.log. No real emails or financial transactions were sent.

## Request-bound onboarding

Pending payload metadata includes onboarding_request_id and created_by_user_id. The canonical ID derives from the originating request, so retries reuse one proposal. Successful Finance Associate approval records validated_at, validated_by_user_id and accepted supplier document references/versions in the same transaction. Generic edits cannot mark pending proposals complete. Required uploads are BIR_2303, BUSINESS_REGISTRATION and BUSINESS_PERMIT; migration 0034 enables General upload eligibility without changing optional Finance rules.
