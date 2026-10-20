# Production preparation — 2026-10-19

Status: preparation in progress; not authorized or validated for live operation.
Planned production hostname: **payment.life.edu.ph**. An AWS account exists. DNS control, certificate,
AWS region, runtime, network boundaries, and operational owners still need verification/selection.

## Prepared locally

- Separate deployment API image runs as a non-root user, without migrations or seeding on startup.
- Web image builds the API frontend and serves it with a same-origin API reverse proxy.
- Standalone compose template keeps the API private and binds web access to loopback behind an HTTPS ingress.
- Staging/production settings reject insecure cookies, demo credentials, local storage endpoints/static keys,
  permissive hosts, insecure CORS origins, and database connections without verified TLS.
- Deployed environments exclude bundled sample vendors and purchase orders; local/test fixtures remain available.
- Interactive API documentation is disabled outside local/test. Deployment secrets are excluded from Git/build context.

These safeguards are a baseline, not an infrastructure deployment or a security certification.
The existing root Dockerfile and docker-compose.yml remain local-development tools.

## Before staging

1. Select AWS region, application runtime, private PostgreSQL, private document bucket and HTTPS ingress.
   Assign infrastructure, Finance, identity, security and support owners. Record expected costs and environment separation.
2. Obtain DNS access for payment.life.edu.ph and choose a separate staging hostname. Configure and validate
   certificates for each. Redirect HTTP to HTTPS at ingress; do not expose port 8002, databases or object storage publicly.
3. Create separate staging database/storage and least-privilege workload identity. Enable database backups/PITR,
   private bucket access, object versioning and encryption. Mount the verified database CA bundle.
4. Copy deploy/deployment.env.example to deployment.env outside source control. Set real hosts, bucket, database and
   release version; inject credentials using the selected secret manager. Configure bounded log retention and alerts.
5. Build images from repository root's Back End directory:

   ```sh
   docker build -f deploy/Dockerfile.api -t payment-api:RELEASE .
   docker build -f deploy/Dockerfile.web -t payment-web:RELEASE .
   ```

   Scan images/dependencies, push to a private registry and pin approved digests. Replace RELEASE with the exact commit.
   Set PAYMENT_API_IMAGE, PAYMENT_WEB_IMAGE and DATABASE_CA_FILE for the compose template. Validate using
   `docker compose -f deploy/compose.yml config --quiet` without printing resolved secret values.
6. Take a database backup. Run `alembic upgrade head` once as an isolated deployment task using the API image,
   its environment, CA mount and database network access. Do not run seed automatically. The current seed includes
   sample departments/accounts/settings and is not an approved production bootstrap.
7. Provision the first real administrator using a reviewed one-time bootstrap procedure. This procedure is still
   pending implementation; do not reuse demo users. Import approved departments, permissions, accounts and tax settings.
8. Start API/web behind HTTPS. The included nginx template expects the API at `api:8002`; adapt service discovery
   to the chosen runtime. For API health probes send a configured trusted Host header. `/readyz` checks database
   connectivity only; separately test document upload/download and storage permissions.

## Staging acceptance and launch blockers

- First-administrator bootstrap, password recovery, account provisioning and production login abuse controls.
- Finance-approved initial master data/setup, real role assignments and business acceptance across all request types.
- Live Procurement integration: sample POs are intentionally absent in deployment. Vendor CRUD can supply local
  vendor records, but vendor ownership/sync with Procurement must be agreed before connecting the two systems.
- Malware scanning/quarantine, document retention/deletion and audit access policies.
- Workflow notification workers/email and reporting/export scope (Phase 08); agree whether a limited pilot can omit these.
- LifeOS SSO contract/implementation if required for launch; local authentication already exists.
- Restore a staging database AND document versions from backup; record recovery time and data-loss targets.
- HTTPS/cookie/CSRF/authorization tests, dependency/container scans, penetration/security review,
  accessibility and supported-browser checks. Exercise mobile/tablet/desktop with no overflow.
- Full request → approvals → voucher → authorized payment, return/decline, foreign rate, fund return and recovery tests.
- Monitoring for availability, errors, database/storage failures and notification backlog; named incident/runbook owners.
- Formal staging acceptance and production promotion approval, with release digest, migration version and rollback evidence.

## Release and rollback

Freeze a tested commit and record API/web digests, database migration head, configuration version and acceptance evidence.
Back up before migration. Deploy once, run smoke checks with real test accounts and reconcile balances.
If smoke checks fail, stop traffic/financial writes and restore the previous images only when schema compatibility is
confirmed. Never blindly downgrade financial migrations or discard payment history. For incompatible changes, use a
reviewed recovery plan and reconcile any writes made since the backup. Remove staging/test records only by approved procedures.

No AWS resources, DNS records, firewall rules or live data were changed by this preparation.

## Verification on 2026-10-19

- Production frontend build passed; backend lint and source whitespace checks passed.
- 12 isolated deployment tests passed: unsafe settings are rejected; sample vendors/POs are absent in deployment;
  API docs are disabled and untrusted Host headers rejected. These tests do not connect to a live database.
- Docker Desktop Linux engine was unavailable. API/web image builds, nginx runtime checks, verified-TLS database/S3
  checks and database/browser regressions must run before staging acceptance. Prior vendor/workflow results are not
  a substitute for testing these deployment changes.
- Container tags in build templates are upstream defaults; record scanned immutable base/application digests for release.
- Ingress must add HSTS after HTTPS validation, set request/upload timeouts, and provide the matching trusted Host.
