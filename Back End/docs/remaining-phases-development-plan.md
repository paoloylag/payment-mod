# Remaining development phases — execution plan

Prepared: 2026-09-28  
Scope: backend integration branch, Phases 02–09  
Source of truth: `PROJECT_MANIFEST.md`, the phase plans and validation records, and the Finance orientation findings in this directory.

## Current baseline and planning rule

| Phase | Current recorded state | Next gate |
|---|---|---|
| 00 — Foundation | Validated | Carry its migration, seed, logging, and CI contracts forward. |
| 01 — Authentication and RBAC | Validated for local development | Recheck permissions as each new domain command is added. |
| 02 — Master Data | Validated for local development | Activate authoritative Finance/vendor sources only through the Phase 09 production gate. |
| 03 — Requests | Validated for local development | Activate live Procurement/vendor providers only through the Phase 09 production gate. |
| 04 — Documents | Validated for local development | Production storage, scanning, retention, accessibility, and hosted-browser assurance remain Phase 09 work. |
| 05 | In progress — preview only | Replace the read-only provisional route preview with persisted workflow behavior. |
| 06–09 | Not started | Execute the work packages below in dependency order. |

The status above reflects the 2026-10-07 closeout evidence and accepted local limitations. A release cannot inherit an
unresolved external or production rule silently. Keep the existing frontend-only GitHub Pages preview explicitly in
mock mode; the backend integration build must continue to require the API.

## Delivery method and cross-phase controls

For every phase, deliver: reviewed rule/decision table; reversible migration and indexes; persistence model; service-layer state rules; permission checks; version and idempotency handling for commands; append-only audit events; API schema and error contract; frontend API wiring with loading/error states; seed fixtures; automated tests; browser walkthrough; updated API/operations documentation; and a validation record with evidence. Use PostgreSQL as the authoritative state and `Asia/Manila` business timestamps with explicit offsets. Monetary calculations use decimal arithmetic and stored rule snapshots.

For Phases 05–08, preserve the current working interface as the UI baseline. Build new and changed screens mobile first, then adapt them for tablet and desktop. Reuse shared components and styles. Before each phase is accepted, walk through affected existing and new flows at narrow mobile, tablet, and desktop widths, including navigation, forms, primary actions, loading/error states, and keyboard use. Resolve clipped content, horizontal page overflow, unusable touch controls, and interaction regressions before sign-off; record the viewport checks in the validation evidence.

Before expanding a phase, establish a clean baseline on the backend branch: review the current uncommitted work, run migration/seed/test/build gates in the isolated Docker test environment, and preserve the Phase 03/04 evidence. Do not use the main-branch static prototype as proof that a backend feature exists.

### Near-term closeout: Phases 02–04

1. **Phase 02:** review chart of accounts, tax codes, vendor ownership/sync fields, and Finance administration screens with the business owner. Record accepted limitations and mark validated only after the phase's human/environment gates pass.
2. **Phase 03:** obtain sign-off on request lifecycle behavior and unresolved reimbursement, Procurement, and Finance policy choices. Keep the confirmed Cash Advance cap, one-outstanding rule, and 15-calendar-day liquidation deadline in regression fixtures. Verify that return/reopen correction targets remain compatible with Phase 05 routing.
3. **Phase 04:** the confirmed per-line Reimbursement rule is implemented in the seed, API requirement evaluation, upload workspace, submission guard, mock configuration, and multi-line API/browser tests. The 2026-09-29 Google Chrome run proved that each line requires its own Proof of Payment, that no request-level Invoice or Billing / Quotation / SOA rule remains, and that the completed request submits successfully. Obtain final reviewer acceptance and preserve the existing upload/version/review behavior. Move AWS, malware scanning, and formal retention acceptance to Phase 09.

## Phase 05 — Workflow and approvals

**Outcome:** every submitted request has a server-generated, policy-versioned route and an auditable current assignment. This phase implements the Department approval → Finance review handoff → Payment approval path and correction loops confirmed by Finance.

**Work packages, in order**

1. Approve a route matrix by request type, budget state, department, amount, and approver role. Specify the exact inclusive/exclusive thresholds, including unbudgeted amounts above PHP 1,000,000; define return targets, required comments, delegation expiry, and absence coverage.
2. Add effective-dated policy definitions, submission-time route snapshots, ordered stages, assignments, delegations, decisions, immutable events, and command idempotency records. Index active assignments and due dates.
3. Implement a single transition service for approve, return, decline, delegate, reassign, reroute, and authorized unlock. Require expected workflow version and idempotency key; lock the request/assignment rows in one transaction. Preserve prior stages on correction and create a new route/version only under the approved resubmission rule.
4. Expose role-scoped queues, assignment detail, permitted actions, timeline, and decision APIs. Connect existing persona queues and decision dialogs to server responses; show a precise correction destination to the requestor.
5. Add event hooks for later notification outbox processing without sending live email.

**Acceptance:** below/at/above-threshold route tests for budgeted and unbudgeted requests; all five request types; no self-approval or skipped stage; expired delegation and explicit deny behavior; duplicate/concurrent decisions advance once; return, reroute, unlock, and resubmission histories remain intact. Complete a multi-role browser walkthrough and reconcile queue counts to active assignments.

**Blocking decisions:** final role/threshold matrix, who may reassign/reroute/unlock, mandatory comments and correction targets, SLA/escalation policy. If a policy is not approved, keep it disabled rather than guessing an authorization route.

## Phase 06 — Finance validation and vouchers

**Outcome:** Finance decisions, tax/accounting results, and vouchers are persisted and reproducible from approved source versions.

**Work packages, in order**

1. Approve VAT/EWT/No EWT formulas, rates, rounding, effective dates, chart-of-account mapping, foreign-currency treatment, voucher numbering, print/certification text, and posting/void authority. Capture exact worked examples, including the PHP 200,000 TOJUST fixture.
2. Add validation headers, document/line decisions, tax snapshots, balanced accounting batches, voucher headers/snapshots, certifications, posting events, and replacement links.
3. Implement decimal-safe calculation and completion guards. A validation cannot complete while required documents/lines lack final decisions, tax data are invalid, or debit and credit entries do not balance under the approved dimensions.
4. Implement atomic voucher numbering and idempotent creation only after the final required approval and Finance completion. Treat post, void, and replace as separate reason-required commands that retain old versions.
5. Expose Finance work queues, review/calculation/accounting APIs, voucher lifecycle APIs, and server-derived print data. Connect the Finance workbench and voucher print view.

**Acceptance:** exact expected tax intermediate and final values, rounding boundaries, No EWT, foreign currency, missing/rejected documents, balance failures, concurrent numbering, duplicate creation, permission boundaries, immutable snapshots after configuration changes, and print-to-ledger reconciliation. Review rendered vouchers against an approved sample.

**Blocking decisions:** tax calculation specification, account mappings, voucher format/numbering, posting and void authority, and foreign-currency accounting treatment.

## Phase 07 — Payment execution

**Outcome:** the system records manual Check, Bank Transfer/DigiBanker, and Cash preparation, authorization, release, and settlement evidence, including multiple or partial attempts, without overwriting history.

**Work packages, in order**

1. Approve method-specific state diagrams, signatory matrix, partial/split-payment policy, release evidence, and reconciliation ownership. Define the amount and currency invariants for every state.
2. Add payment attempts, method details, signatory assignments/decisions, processing references, release/clearing events, failures, voids, and predecessor/successor replacement links.
3. Implement balance calculation from non-void settled/released attempts, overpayment prevention under concurrency, preparer/authorizer segregation, version checks, idempotency, reference uniqueness, and reason-required corrections.
4. Expose preparation, signatory, processing, pickup, release, clearing, failure, retry, void, and replacement APIs. Connect the payment tracker, signatory queue, and check pickup views to persisted state.
5. Provide exception and reconciliation views for manual transfer/check references, with actor/time/evidence and masked sensitive values.

**Acceptance:** valid and invalid transitions for all three methods; partial and mixed attempts; no overpayment or currency mismatch; no same-person preparation and authorization where policy forbids it; retry/void/replacement histories visible; concurrent commands do not duplicate settlement; tracker balance equals voucher payable less recorded valid payments.

**Blocking decisions:** signatory thresholds, partial/split policy, pickup/release evidence, and the source of manual clearing confirmation. This phase records bank activity; it does not connect to a bank or claim an unverified transfer settled.

## Phase 08 — Notifications, dashboards, and reports

**Outcome:** durable event-driven notifications and role-scoped views whose counts and amounts match persisted transactions.

**Work packages, in order**

1. Approve the business-event/recipient/template matrix and definitions for pending, aging, overdue, unclaimed, paid, and completed. Specify report fields, time zone/currency presentation, export limits, and retention.
2. Add a transactional outbox, notification jobs, attempt history, recipient snapshots, template versions, and per-user read state. Enqueue each event in the same transaction as its business change.
3. Run an at-least-once worker with stable idempotency keys, bounded retries, dead-letter/manual recovery, backlog metrics, and a protected development mailbox. Keep live delivery disabled until Phase 09.
4. Build permission-scoped dashboard, search, tracker, report, Excel export, and print-data APIs. Apply visibility before counts/aggregation; use stable pagination and indexes. Add projections only after measuring query performance.
5. Connect cards, lists, notifications, filters, tracker, export, and print controls to the API. Centralize metric definitions so card/list/export totals agree.

**Acceptance:** transaction rollback leaves no orphan notification; worker restart and repeated events do not duplicate jobs; failures are visible and recoverable; role/department tests show no data leaks through counts or search; filtered card/list/export totals reconcile; large datasets paginate; exported user text cannot execute spreadsheet formulas; responsive browser and print checks pass.

**Blocking decisions:** official metric definitions, event recipients/templates, retry/alert policy, required reports, and retention.

## Phase 09 — Administration, integrations, and production readiness

**Outcome:** approved enterprise adapters and operational controls are ready for staged release, with production activation treated as a separate decision.

**Work packages, in order**

1. Name business/technical/security/operations owners. Approve contracts and data flows for LifeOS SAML, Procurement/P.O., vendor, ERP/accounting, email, storage, and webhooks; define environments, credentials, classifications, retention, SLOs, and incident ownership. Banking connectivity remains excluded.
2. Version approval/tax/notification/retention settings with effective dates and historical views. Add restricted audit search/export and separate permissions for ordinary administration, sensitive configuration, and recovery.
3. Implement LifeOS SAML with stable subject/tenant linking, replay/signature validation, deprovisioning, certificate rotation, and audited outcomes while retaining local login.
4. Add one disabled-by-default adapter at a time behind a domain interface. Use contract tests, timeouts, bounded retries, circuit breaking, idempotency, signed/replay-protected webhooks, reconciliation checkpoints, and manual recovery. Keep external failures from silently rewriting request/payment history.
5. Complete production AWS private storage, malware scanning/quarantine policy, document/audit retention and legal hold, secrets management, TLS/proxy/CORS/cookies, environment separation, monitoring and alert routing.
6. Test staging deployment, migration rollback, database/object restore, disaster recovery, provider outage, reconciliation mismatch, load, penetration/security review, Chrome/Firefox/Safari, accessibility, and release rollback. Produce runbooks and an approved release artifact/checksum.
7. Enable each external connection only after provider sandbox/staging evidence, named owner, approved credentials, monitoring, and explicit production promotion approval.

**Acceptance:** local and SAML logins coexist; identity linking and deprovisioning are deterministic; provider timeout/duplicate/webhook replay paths are safe; secrets and bank-sensitive fields are absent from source/logs/browser storage; restore and rollback meet agreed objectives; alerts and runbooks work in a drill; production promotion has a signed decision.

**Blocking decisions:** identity metadata and owner, selected providers and contracts, secrets/monitoring platform, retention, recovery objectives, support model, and production approval authority.

## Dependency and release gates

```text
02/03/04 acceptance and policy decisions
             ↓
05 workflow → 06 Finance/vouchers → 07 payments
             ↘         ↓                 ↓
              08 notifications/reporting
                         ↓
              09 integrations/release
```

Phase 08 outbox schema and event naming should be designed during Phase 05 so Phases 05–07 can enqueue events atomically, even if the worker and delivery UI arrive later. Phase 09 adapter contracts can be drafted early, but live providers and production-only checks do not block local acceptance of earlier phases unless their business rule itself depends on that provider.

At each phase boundary, publish a validation record listing the migration revision, test/build/CI results, browser and reconciliation evidence, unresolved decisions, accepted limitations, and reviewer. Move the status to `Validated for local development` only when those local gates are met. Reserve `Production ready` for the Phase 09 promotion decision.
