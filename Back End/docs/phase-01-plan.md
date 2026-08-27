# Phase 01 — Authentication and RBAC plan

Date: 2026-08-26
Branch: `codex/backend-integration`
Status: Complete
Reviewed commit: `a796a43a8654a6992ae1a423b87b18f15479da80`

## Confirmed decisions

- Local email/password authentication is permanent and must remain available after LifeOS SAML is introduced.
- Browser authentication uses database-backed, revocable sessions with HTTP-only cookies and CSRF protection.
- Sessions have a one-hour inactivity timeout and an eight-hour absolute lifetime.
- Logout revokes the current session. Suspension or deactivation revokes every active session for that user.
- A user initially has one primary department; the authorization design may be extended for additional department access.
- Explicit user permission denials take precedence over role permission grants.
- System Administrators may manage users, roles, permission overrides, activation, suspension, and departments, but may not edit audit records.
- Initial departments are DT, Operations, Marketing, Finance, Academics, and P&C. New departments can be added through an audited API and administration page.
- The frontend retains `mock`, `hybrid`, and `api` data-source modes.
- Identity-related frontend additions are developed on this branch and must be reviewed before synchronization to `codex/frontend-only-prototype`.

## Delivery slices

### 01A — Identity persistence

- Migration `20260825_0002` for departments, users, roles, permissions, role grants, overrides, sessions, and audit events.
- Deterministic UUIDs for reference identities and access-control records.
- Reversible upgrade/downgrade and repeatable seed behavior.

### 01B — Local authentication and sessions

- Salted scrypt password hashing.
- Login, logout, and current-session endpoints.
- HTTP-only session cookie, separate CSRF token, server-side revocation, idle expiry, and absolute expiry.
- Inactive and suspended account rejection.
- Local authentication remains an independent provider when SAML is added later.
- Automated tests remove only the sessions they create. A disabled-by-default maintenance command can remove invalid
  sessions after 30 days in local/test environments and hard-refuses staging and production.

### 01C — Authorization and administration

- Current-user and permission dependencies for protected endpoints.
- Initial nine-role catalog and stable permission catalog.
- User listing/creation/update, role replacement, permission overrides, role listing, and department listing/creation.
- Server-side enforcement remains authoritative; frontend visibility is not an authorization control.

### 01D — Audit controls

- Append-only events for department creation and user, role, permission, activation, and suspension changes.
- Actor, entity, before/after values, request ID, and Philippine-time database timestamp.
- No ordinary update or delete route for audit events.

### 01E — Frontend identity pages

- Login and session-restoration page.
- Authenticated user chip and logout action.
- Role-driven navigation and unauthorized states.
- User Administration page.
- Roles & Permissions page.
- Departments page with future department creation.
- Preserve standalone mock mode and safe hybrid behavior.

## Current verification

- Ruff: passed.
- Backend suite: 23 passed; 90.46% statement coverage (85% required).
- Migration downgrade/replay: passed against PostgreSQL 16.
- Deterministic identity seed: passed.
- Live Docker login, session, six-department listing, and logout: passed.
- Vite 7.0.7 production build: passed.
- Login page DOM, visual layout, and console: passed.
- Session cleanup dry run, active-session preservation, batching, audit event, test teardown, and production refusal:
  passed.
- Authenticated administration walkthrough, list/menu/modal alignment, and desktop horizontal-overflow audit: passed.
- Reviewed release archive generated from the exact commit: `payment-module-phase-01-a796a43.zip`.
- Release archive SHA-256: `1504EDA3258F646A9D92A4ECAA42B664EBA872223987A31441A36AD0B33F7172`.
- Commit published to `origin/codex/backend-integration`: passed.

## Accepted limitations and follow-up validation

- Observe and record GitHub CI and Docker packaging for reviewed commit `a796a43`.
- Provision and exercise a dedicated database through `TEST_DATABASE_URL`; per-test session teardown already prevents
  additional session accumulation in the current local database.
- Complete physical mobile-device, cross-browser, accessibility, load/concurrency, penetration, and production
  proxy/HTTPS validation before production promotion.
- Phase 01 development items, 22 repeatable test scripts, 22 execution records, and eight acceptance gates are
  recorded in `outputs/development-test-register/APS-Development-and-Test-Register-Phase-01.xlsx`.

Phase 01 is locally validated. No automatic staging or production deployment is enabled, and retained-session cleanup
hard-refuses both environments.
