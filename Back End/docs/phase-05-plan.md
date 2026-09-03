# Phase 05 — Workflow and Approvals

Date prepared: 2026-08-28  
Status: Not started  
Depends on: Phases 03–04 — Requests and Documents

## Objective

Create a backend-authoritative approval engine that snapshots policy at submission and preserves every assignment and decision.

## Scope

- Versioned approval policies and policy snapshots attached to submitted requests.
- Role- or identity-based assignments and role-scoped queues.
- Sequential controls, approve, return, decline, delegate, reassign, reroute, and authorized unlocking.
- Immutable workflow events, comments/reasons, due dates, thresholds, and idempotent transitions.
- Department Head, Finance Associate, Finance Manager, COO, President, Board Member, and Authorized Signatory routes.

## Planned data model

- Versioned approval-policy definitions with effective dates and active state.
- Immutable policy snapshots attached to a submitted request version.
- Ordered route stages with assignment type, required role/identity, threshold condition, sequence, and completion rule.
- Current assignments, delegations, reassignments, decisions, comments, due dates, lock state, and immutable workflow events.
- Idempotency records for transition commands and an explicit current-workflow pointer for efficient queue queries.

## Routing and transition rules

- Route generation occurs server-side from the submitted request snapshot and approved policy version.
- Budgeted/unbudgeted, department, amount, request type, and exception conditions are evaluated deterministically.
- Sequential stages cannot be skipped; parallel stages, if approved, define whether all or any decisions are required.
- Approve, return, decline, delegate, reassign, reroute, and unlock each have explicit source states, target states, permissions, and required reasons.
- A return identifies the exact correction destination and preserves completed-stage history.
- Delegation is time-bounded, cannot create self-approval, and never changes the original policy snapshot.
- Concurrent or repeated decisions return the existing outcome or a conflict; they do not advance twice.

## Authorization and segregation

- Queue queries are derived from active assignments plus approved delegations and role/department boundaries.
- A requestor cannot approve their own request unless an explicitly approved policy says otherwise.
- Administrative reassignment/rerouting is exceptional, reason-required, and fully audited.
- Explicit permission denies continue to override role grants.
- Later payment-preparation/authorization segregation is anticipated but not executed in this phase.

## API and frontend behavior

- Queue API supports assigned-to-me, role, department, status, aging, type, amount, stable sort, and pagination.
- Decision commands require workflow/version tokens and idempotency keys.
- Request detail returns the current stage, permitted actions, safe assignee display, progress, and immutable timeline.
- Frontend persona views show only permitted queues/actions and provide accessible confirmation/comment dialogs.
- Returned work clearly identifies required corrections without exposing restricted reviewer-only data.
- Mock mode contains representative threshold routes for independent UI validation.

## Operational requirements

- Index active assignments, assignee identity/role, current stage, due date, and request status.
- Record correlation IDs and Philippine Time for every route, assignment, and transition event.
- Provide safe support diagnostics for stuck workflows without permitting silent database edits.

## Delivery sequence

1. Confirm route matrix, thresholds, delegation rules, service levels, and return destinations.
2. Add policy, snapshot, route, assignment, decision, and event migrations/models.
3. Implement route generation, queue queries, transition guards, authorization, and idempotency.
4. Add approval queue, decision, delegation, reassignment, reroute, and timeline APIs.
5. Connect persona queues, workflow progress, decision modals, and history UI.
6. Test every threshold boundary, invalid transition, race condition, and role/department boundary.

## Acceptance gates

- Submitted requests retain the exact policy and route version used at submission.
- Each persona sees only assigned work and permitted history.
- Sequential and threshold routes—including Board approval above PHP 1,000,000—pass automated tests.
- Duplicate or concurrent commands do not create duplicate decisions or advance twice.
- Returns, declines, delegation, reassignment, and authorized unlocking preserve immutable history.

## Test and validation matrix

- Policy version/effective-date selection and snapshot immutability.
- Boundary values immediately below, at, and above every approval threshold, including PHP 1,000,000 Board routing.
- Budgeted/unbudgeted and all request-type route variants.
- Queue visibility, role/department scope, explicit denies, self-approval prevention, and delegation expiry.
- Valid/invalid transitions, required comments, return destinations, unlock/relock, reroute, and reassignment.
- Concurrent decisions, repeated idempotency keys, stale workflow versions, rollback, and event-order integrity.
- Browser persona walkthroughs, keyboard/focus behavior, narrow layouts, dashboard count reconciliation, build, Docker, and CI.

## Expected evidence

- Approved route matrix and transition table, policy fixtures, automated boundary/concurrency output, queue reconciliation, audit-event samples, browser evidence, QA register updates, reviewed archive/checksum, and successful CI.

## Decisions required before implementation

- Final approval matrix and inclusive/exclusive threshold boundaries.
- Delegation duration, reassignment authority, and absence handling.
- Required comments and return destinations for each decision.
- SLA and escalation behavior.

## Exclusions

Finance accounting validation, voucher creation, and payment execution remain in Phases 06–07.
