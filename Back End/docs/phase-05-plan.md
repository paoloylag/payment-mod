# Phase 05 — Workflow and Approvals

Date prepared: 2026-08-28  
Status: In progress — provisional PHP approval route, queue, and decisions implemented; unresolved rules remain pending
Depends on: Phases 03–04 — Requests and Documents

## Prototype-policy trial — 2026-09-29

Owner direction is to implement and test the approval matrix currently shown in the prototype, then adjust rules based on test and reviewer findings. `api/payment_module/workflow_policy.py` now computes a version-identified PHP route and `/api/v1/workflow/preview/{request_id}` exposes a read-only, permission-scoped preview. The preview does not assign approvers or advance a request. Threshold and API-access tests are in `tests/test_workflow_policy.py`. See `docs/phase-05-policy-trial.md` for the exact matrix, results, and unresolved behavior.

On 2026-09-29, the owner confirmed the unbudgeted PHP route above 1,000,000 as COO → President → Board Member. On 2026-10-08, the owner confirmed that foreign-currency requests use a configured PHP conversion rate and the same PHP thresholds.

## Development update — 2026-10-07

- Submission now stores the route policy version, submitted request values, ordered stages, and current stage in `workflow_instances`. `workflow_events` retains the route snapshot and each transition; `workflow_commands` makes approval retries idempotent.
- Foreign-currency submissions without a configured PHP-per-unit rate enter `policy_pending` with no assignment or approval action. On 2026-10-08 the owner directed that all approval thresholds use the PHP equivalent from a configured per-currency rate. The rate and exact PHP amount are frozen in the route snapshot at submission.
- `/api/v1/workflow/queue` lists current assignments by reviewer role, with Department Head access confined to the request department and no self-approval. `/api/v1/workflow/{request_id}` exposes route progress and history to an authorized owner or current reviewer. `/approve` requires a workflow version and idempotency key, locks the request, advances one stage, and records an audit event.
- At the first active Department Head stage, the reviewer selects Return to Requestor or Fully Decline from a reject dropdown and provides a required reason. Return changes the request to `returned`; the requestor can edit and resubmit, which starts a fresh route snapshot. Fully Decline changes it to terminal `declined`; the requestor can read the reason but cannot edit or resubmit. Decision, stage, actor, and reason are recorded in request history, workflow events, and audit history. Returns or declines from later stages remain pending separate rules.
- Finance Manager can set `php_per_unit` on a currency through the Currencies screen/API. An already submitted `policy_pending` request can then be activated through `POST /api/v1/workflow/{request_id}/activate` by a user with `master_data.manage`; activation freezes the current rate and PHP equivalent, creates the assignment, and is idempotent. Configuring a rate does not silently change existing active routes.
- Migration `20261007_0011` was applied in isolated test schema `phase05_trial`. Focused tests cover the full COO → President → Board sequence, retry/stale decision behavior, role handoff, and foreign-currency pending state.

Remaining Phase 05 work: decide later-stage return/decline destinations, delegation/reassignment/reroute/unlock authority, SLA/escalation rules, and permitted Finance validation action; then implement those transitions and connect the remaining frontend persona screens. These actions are not enabled by the current API.

## Development update — 2026-10-09

- The approval queue now includes the assigned request summary, allowing reviewer roles to see work assigned by the backend even when their general request list does not include that request. The frontend uses the saved current stage for queue and review displays.
- Department Head, Finance Manager, COO, President, and Board approval buttons now submit versioned, idempotent decisions to the backend. The first-stage Return/Fully Decline control remains available only at the active Department Head stage.
- Later-stage Return/Fully Decline is rejected by the API until its destination and authority are confirmed. The Finance Associate validation screen is explicitly held for Phase 06 rather than advancing from prototype-only controls.
- Focused workflow tests passed (5 tests). The frontend build passed. Headless Chrome checks found no horizontal overflow on dashboard and approval screens at 390px, 768px, and 1280px. These checks cover the current queue shell; a multi-role action walkthrough remains required before Phase 05 acceptance.

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

- Existing request, document, and approval screens retain their working layout and behavior; new workflow views pass mobile-first checks at mobile, tablet, and desktop widths with no clipped controls or horizontal page overflow.

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
