# Phase 05 — Workflow and Approvals

Date prepared: 2026-08-28  
Status: Approved exception scope implemented, locally verified, and hosted CI passed. Owner authorized progression to Phase 06; a separate Finance acceptance session remains available. SLA and escalation deferred on 2026-10-13.
Depends on: Phases 03–04 — Requests and Documents

## Approved exception scope — 2026-10-13

The owner authorized the recommended delegation, reassignment, controlled route correction, and stuck-assignment recovery rules. SLA, reminders, and escalation are deferred.

- Delegation covers the selected request's current approval or information-response assignment. An eligible original reviewer can appoint a different eligible reviewer of the same role and department scope. Dates, a reason, and time zones are required. During the coverage interval only the substitute may decide; responsibility returns automatically at expiry. The original reviewer or an authorized administrator may revoke early. Delegation chains and self-approval are prohibited.
- System Administrators with `workflow.exceptions.manage` can manage assignments at every stage. Finance Managers with that permission can manage Finance Associate/Finance Manager assignments, including Finance Associate information responses. Administrative authority does not confer approval authority. All replacement reviewers must have effective `workflow.review`, the stage's role, active/non-suspended status, and the Department Head's department eligibility when applicable.
- Reassignment transfers only the current assignment to a named eligible reviewer. It clears temporary coverage and preserves the current stage and earlier decisions. Existing role-pool assignments remain unchanged until an explicit assignment action is performed.
- Recovery replaces an unavailable named assignee at the same stage. It requires that the effective reviewer is inactive, suspended, no longer eligible, or explicitly denied review permission. It cannot unlock request fields, bypass approvals, revive terminal workflows, or repair data with silent edits. If no eligible replacement exists, an administrator must first maintain the user/role configuration.
- Material changes to amount, budget status, department, request type, or currency use Return for approval-route correction. The requestor edits the returned request and resubmits. All approvals are repeated from Department Head because their approval basis may have changed. Original route snapshots and decisions remain in immutable event history; named assignments are cleared for the new route. A foreign-currency request returns to the confirmed Finance Manager rate process.
- Every exception requires a reason, workflow version, and idempotency key. The request and workflow are locked in the same order as approval commands. Concurrent approval/assignment commands cannot both commit against one version. Events and audit records retain the administrator, acting reviewer, original reviewer, scope, dates, and changes.
- Request details expose the permitted controls under **Assignment and recovery controls**. Unavailable or future-stage reviewers cannot acquire authority through these controls. Conversations retain the confirmed reached-participant rules. Reviewer dashboard pending counts now reconcile with their backend assignment queue.

API: `POST /api/v1/workflow/{request_id}/exceptions`, with actions `delegate`, `revoke`, `reassign`, `recover`, or `material-correction`. Workflow detail returns eligible choices and permitted controls. Migration: `20261013_0020`.

Local evidence: [Phase 05 validation](phase-05-validation.md) records 153 passing backend tests, the successful browser runs, mobile/tablet/desktop checks, lint/build, migration rollback/replay, and the remaining acceptance gates.

## Prototype-policy trial — 2026-09-29

Owner direction is to implement and test the approval matrix currently shown in the prototype, then adjust rules based on test and reviewer findings. `api/payment_module/workflow_policy.py` now computes a version-identified PHP route and `/api/v1/workflow/preview/{request_id}` exposes a read-only, permission-scoped preview. The preview does not assign approvers or advance a request. Threshold and API-access tests are in `tests/test_workflow_policy.py`. See `docs/phase-05-policy-trial.md` for the exact matrix, results, and unresolved behavior.

On 2026-09-29, the owner confirmed the unbudgeted PHP route above 1,000,000 as COO → President → Board Member. On 2026-10-08, the owner confirmed that foreign-currency requests use a PHP conversion rate and the same PHP thresholds. The rate source was updated to a request-specific Finance Manager decision on 2026-10-10.

On 2026-10-10, the owner confirmed the full amount-tier matrix previously used for prototype testing. The exact tiers and inclusive/exclusive boundaries are recorded in `docs/phase-05-finance-confirmation.md`. Board approval is the final request-approval decision for the above-PHP-1,000,000 unbudgeted route and permits Finance to prepare the voucher. Authorized Signatory payment authorization remains separate in Phase 07. Finance validation outcomes and delegation/rerouting authority remain separate workflow decisions.

The owner also confirmed the Finance Associate correction path on 2026-10-10: Finance Associate can flag individual lines and required documents, Return to Requestor or Fully Decline with a reason, and a corrected request resumes at Finance Associate without repeating Department Head approval. Completion is blocked until all required documents and reimbursement-line physical originals are accepted. These validation and return controls are implemented. Finance configuration readiness must block new requests when required settings are missing; the exact readiness checklist remains to be finalized.

Finance's configured VAT/EWT rules and account mappings will apply automatically. Finance Associate validation will check documents, physical originals, and individual lines; manual tax and account selection is not required before advancing to Finance Manager. The generated tax/accounting result is reviewed later in the Finance workbench, with its source configuration retained for audit.

On 2026-10-11, Return now opens a role-selection modal. Department Head and Finance Associate can choose Requestor; Finance Manager can choose Requestor or Finance Associate. Returning from Finance Manager to Finance Associate creates a correction assignment and resumes Finance Manager when Finance Associate responds, preserving earlier approvals. Returning from Finance Associate to Requestor resumes Finance Associate after resubmission if the department is unchanged. Fully Decline has no destination. The API enforces these destinations and version/idempotency checks; the frontend build and 390px, 768px, and 1280px modal click-through passed.

The owner directed that confirmed Phase 05 work be completed before choosing provisional delegation, reassignment, or urgent-unlock rules. The assigned-work queue now supports role, department, request type, workflow state, PHP amount, and age filters, stable submitted-date/PHP-amount sorting, and optional pagination without changing the existing queue response shape. The approval screen has request-type and sort controls. Request details show recorded workflow events with actor names and the saved route's current assignment. Backend requests no longer show the mock-only urgent-unlock action. Focused approval and Finance validation tests passed (13 tests); browser queue and history checks passed at 390px, 768px, and 1280px.

The request, approval, and Finance validation regression fixtures now run together without relying on stale user names, persistent Finance policy settings, or document rules outside the request lifecycle tests. All 55 focused regression tests pass. Workflow transitions also save a pending transactional outbox event for later notification processing; recipient resolution and delivery remain Phase 08 work.

On 2026-10-13, the owner clarified that future executive and Board reviewers must not see a request or its conversation before their approval stage is reached. Request visibility, conversation posting, participant lists, and @mentions now use the current or previously reached stages of the saved route. Department Head access remains limited to the request department. Finance Associate and Finance Manager retain their separate read-all request permission, but cannot enter the conversation before their stage. The staged browser walkthrough checks each role before and after its stage begins, including 390px, 768px, and 1280px layouts and outsider denial. The request, workflow, document, Finance validation, and conversation API regression set passed (68 tests). The five-role return/resubmit/cancel/reopen browser walkthrough and the executive information-request/mention scenario pass with fixtures updated for the Phase 06 Finance Associate validation gate.

## Development update — 2026-10-07

- Submission now stores the route policy version, submitted request values, ordered stages, and current stage in `workflow_instances`. `workflow_events` retains the route snapshot and each transition; `workflow_commands` makes approval retries idempotent.
- Foreign-currency submissions without a configured PHP-per-unit rate enter `policy_pending` with no assignment or approval action. On 2026-10-08 the owner directed that all approval thresholds use the PHP equivalent from a configured per-currency rate. The rate and exact PHP amount are frozen in the route snapshot at submission.
- `/api/v1/workflow/queue` lists current assignments by reviewer role, with Department Head access confined to the request department and no self-approval. `/api/v1/workflow/{request_id}` exposes route progress and history to an authorized owner or current reviewer. `/approve` requires a workflow version and idempotency key, locks the request, advances one stage, and records an audit event.
- At the active Department Head or Finance Manager approval stage, the reviewer selects Return to Requestor or Fully Decline from a reject dropdown and provides a required reason. Return changes the request to `returned`; the requestor can edit and resubmit, which starts a fresh route snapshot. Fully Decline changes it to terminal `declined`; the requestor can read the reason but cannot edit or resubmit. Decision, stage, actor, and reason are recorded in request history, workflow events, and audit history.
- Finance Manager can set `php_per_unit` on a currency through the Currencies screen/API. An already submitted `policy_pending` request can then be activated through `POST /api/v1/workflow/{request_id}/activate` by a user with `master_data.manage`; activation freezes the current rate and PHP equivalent, creates the assignment, and is idempotent. Configuring a rate does not silently change existing active routes.
- Migration `20261007_0011` was applied in isolated test schema `phase05_trial`. Focused tests cover the full COO → President → Board sequence, retry/stale decision behavior, role handoff, and foreign-currency pending state.

## Request-specific exchange-rate update — 2026-10-10

- Foreign-currency requests now proceed through Department Head and Finance Associate to Finance Manager without requiring a system rate. The first three stages are saved at submission; the executive stages remain undecided.
- At Finance Manager review, a positive PHP-per-unit rate is required for approval. The current system rate is offered as a suggestion and may be overridden for that request. The approval command calculates the exact PHP equivalent, saves the rate and remaining route, and records the actor, system rate at confirmation, note, and event time. Earlier approvals remain complete.
- Cash Advance limits are checked against the Finance Manager-confirmed PHP equivalent. A rate that places the request above the limit blocks approval until the request is returned for correction or declined.

Remaining Phase 05 closeout: record final local validation, obtain reviewer acceptance, and verify hosted CI after the development changes are committed and pushed. SLA/escalation is explicitly deferred. The approved exception transitions are now enabled as described above; broad post-approval editing and stage bypass are excluded.

## Development update — 2026-10-09

- The approval queue now includes the assigned request summary, allowing reviewer roles to see work assigned by the backend even when their general request list does not include that request. The frontend uses the saved current stage for queue and review displays.
- Department Head, Finance Manager, COO, President, and Board approval buttons now submit versioned, idempotent decisions to the backend. Return/Fully Decline is available at the active Department Head and Finance Manager approval stages.
- COO, President, and Board Return/Fully Decline is rejected by the API. Their Request More Information action pauses the current stage and assigns a response to Finance Associate; a required response note restores the same stage and preserves earlier approvals. The Finance Associate validation screen is explicitly held for Phase 06 rather than advancing from prototype-only controls.
- Focused workflow tests passed (7 tests), including the COO information round trip and President/Board stage resumption. The frontend build passed. Headless Chrome checks found no horizontal overflow on the COO information-request and Finance Associate response views at 390px, 768px, and 1280px. A full multi-role action walkthrough remains required before Phase 05 acceptance.

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

- Each request has a shared conversation visible to its requestor and reviewers whose stages have been reached in the saved approval route. Future executive and Board reviewers cannot see or post in it, and cannot be tagged, until their stage begins. Reached participants may post while a request is submitted or returned, including while Request More Information is pending. Terminal requests retain a read-only log. Notes do not change the workflow stage or count as approval decisions.
- Request More Information and Finance Associate responses appear in the conversation from their existing workflow events. Messages use idempotency keys to avoid duplicates after mobile retries.
- A participant can tag another active route participant in a message. The tagged person receives an in-app notification linking to that message; the header bell shows unread mentions and checks for new ones while the app is open. Mentions do not change workflow assignments. Local demo requests include one unread mention for each assigned reviewer.

- Queue API supports assigned-to-me, role, department, status, aging, type, amount, stable sort, and pagination.
- Decision commands require workflow/version tokens and idempotency keys.
- Request detail returns the current stage, permitted actions, safe assignee display, progress, and immutable timeline.
- Frontend persona views show only permitted queues/actions and provide accessible confirmation/comment dialogs.
- Returned work clearly identifies required corrections without exposing restricted reviewer-only data.
- Mock mode contains representative threshold routes for independent UI validation.
- Local development seeding provides three assigned requests for each Phase 05 reviewer (Department Head, Finance Associate, Finance Manager, COO, President, and Board Member), with three shared messages per request. One Board sample also includes a resolved Request More Information exchange. The seed uses stable IDs and preserves existing conversations on rerun.

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

- SLA and escalation behavior are deferred by owner direction on 2026-10-13.
- Final reviewer acceptance and hosted CI evidence remain release gates; the implemented exception rules are recorded above.

## Exclusions

Finance accounting validation, voucher creation, and payment execution remain in Phases 06–07.
