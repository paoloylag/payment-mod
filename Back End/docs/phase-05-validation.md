# Phase 05 — local validation and acceptance record

Date: 2026-10-13
Branch: `codex/backend-integration`
Base commit: `6516b5ac46162a3ff2f5b8a566a5b28ef0d2d130`
Development changes: uncommitted working tree
Status: Approved development scope implemented and locally verified; stakeholder acceptance and hosted CI remain pending.

## Approved scope

The owner authorized the recommended delegation, reassignment, controlled route correction, and unavailable-assignment recovery scope. SLA, deadline tracking, reminders, and escalation are deferred. The exact implemented authority and safeguards are in [Phase 05 plan](phase-05-plan.md).

New controls appear under **Request Details → Assignment and recovery controls**. They apply to the selected current assignment. Eligible original reviewers can delegate with a required finite date range. System Administrators manage all stages; Finance Managers manage Finance assignments and Finance Associate responses. Neither administrative authority nor delegation bypasses role eligibility, explicit permission denies, department scope, or the no-self-approval rule.

Material correction returns the request to its requestor. Resubmission regenerates the route and repeats approvals from Department Head; previous snapshots and decisions remain in history. Recovery replaces an unavailable named reviewer at the current stage and cannot unlock fields or revive a terminal workflow.

## Evidence

| Gate | Result |
|---|---|
| Full backend regression | **153 passed**, 2 warnings; dedicated `payment_module_test` database. Includes the eight new exception tests. |
| Approval/Finance/conversation regression before full run | **103 passed**, 2 warnings. |
| Final targeted Chrome browser run | **3 passed**: complete exception workflow, mobile foreign-currency rate confirmation, and responsive administration/approval layout. |
| Existing browser flow regression | Five-role Return/resubmit/cancel/reopen for all request types, executive information-request/mention round trip, stage-gated conversation access, and manager/associate settings permissions passed in the preceding run. |
| Responsive widths | 390px, 768px, and 1280px for assignment controls; no horizontal page overflow. Mobile Actions menu and conversation drawer were exercised through their visible controls. |
| Keyboard/error/persistence | Enter submits the exception form; simulated HTTP 503 displays an error and preserves input; retry succeeds. Requestor edits/resubmits after material correction. |
| Assignment queue reconciliation | A delegated original's request leaves their queue; reviewer dashboard pending count equals their backend queue count. Named-assignee, expiry, revocation, and information-response restrictions are covered by API tests. |
| Concurrent commands | Simultaneous approval and reassignment against one workflow version allow exactly one command to commit. |
| Migration | `20261013_0020` upgrade and downgrade/replay passed. Full dedicated test schema downgrade to base and replay to head also passed. |
| Backend lint | `ruff check api tests migrations` passed. Formatting/import issues in existing in-progress files were corrected without changing their business rules. |
| Frontend | `pnpm run build` passed; `git diff --check` passed. |
| Local environment | Docker image built; local API `/readyz` reports ready and database connected. New assignment migration applied locally. |
| Visible browser inspection | Existing local COO request `PR-2026-900006` retained its route, approval buttons, history, and right conversation panel. Assignment disclosure opens and explains when another eligible substitute is required. |

Browser evidence is generated in `outputs/playwright-report`; a mobile assignment form capture is saved at `outputs/phase05-assignment-controls-mobile.png`. These are local generated artifacts, not committed source files.

## Corrections found during verification

- Reviewer pending dashboard metrics previously counted visible requests outside the active assignment queue; they now derive from that queue.
- Background refreshes could discard an entered request exchange rate or reviewer note. Those inputs and exception-form drafts now persist by user/request. The exception disclosure also preserves its open state.
- Legacy seed assertions counted roles as users and omitted the concurrently added completed development workflows. Assertions now check the configured demo users and workflow fixtures.
- The foreign-currency browser fixture now performs required Finance line/document validation, and the mobile click path opens the compressed Actions menu before approving. Browser tests close the open conversation drawer before accessing the underlying form.

## Remaining acceptance items

1. Named business reviewer accepts the approved Phase 05 scope and exception behavior.
2. Commit/push the reviewed development changes and record the resulting hosted CI run and commit in this record. Local CI-equivalent lint, migration, test, and build gates passed; hosted CI has not run for these uncommitted changes.
3. SLA/reminders/escalation remain explicitly deferred. They are not enabled or represented as complete.

Finance setup activation, tax/accounting calculations, vouchers, payment authorization/execution, workflow notification delivery, production providers, and release promotion remain in their respective later phases.
