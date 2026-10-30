# Phase 08 — Notifications, Dashboards, and Reports

Date prepared: 2026-08-28  
Status: Local Finance notifications, server dashboard snapshots and reconciliation reports implemented 2026-10-30; Finance acceptance and production activation remain separate
Depends on: Phases 03–07 transactional data

## Outbox foundation — 2026-10-11

Workflow events now create a pending `notification_outbox_events` record in the same database transaction. The source workflow event is unique, and the outbox payload contains only routing references needed for later processing. A retry with the same idempotency key does not create a second event; a stale decision creates none. Migration `20261011_0017` adds the table and pending-work index. Recipient rules, templates, delivery jobs, workers, and live email remain to be developed after the notification matrix is approved.

## Current increment — 2026-10-20

The owner confirmed current-stage reviewers for new tasks, and the requestor/responsible Finance role for
returns, declines, final approval and payment updates. Workflow and payment notification recipients are
snapshotted transactionally. A database worker produces in-app messages and optional protected local email
previews, with deduplication, attempt history and bounded retries. The existing bell supports read/unread,
pagination, safe links and error recovery. Historical events without recipient snapshots are not backfilled.
See [notification operations](phase-08-notifications.md) for coverage, verification and remaining scope.

Request report increment: the existing Excel/print controls now use a visibility-scoped, repeatable-read
server snapshot with exact per-currency gross totals, current status labels, safe text and a 5,000-candidate cap.
See [request reports](phase-08-request-reports.md) for definitions, limits and remaining dashboard work.

## Objective

Deliver durable notifications and role-scoped operational reporting that reconciles to persisted transactions.

## Scope

- Transactional outbox, notification jobs, templates, recipient resolution, retries, idempotency keys, and delivery history.
- Development mailbox/log before production email.
- In-app notification state and read/unread handling.
- Role-scoped dashboards, global search, queues, aging, payment tracker, unclaimed checks, and completed payments.
- Filtered Excel exports, print datasets, pagination, sorting, and report-total reconciliation.

## Planned data model

- Transactional outbox entry with event type, aggregate/entity, payload reference, idempotency key, availability time, attempts, and state.
- Notification job, resolved recipients, template/version, safe payload, channel, delivery attempts, timestamps, and final outcome.
- Per-user in-app notification/read state.
- Optional reporting projections/materialized summaries only where measured performance requires them; source transactions remain authoritative.

## Notification rules

- Business mutations enqueue outbox events in the same database transaction as the authoritative change.
- Event processing is at-least-once, while notification creation/delivery is made effectively once through stable idempotency keys.
- Recipient resolution uses the policy/assignments relevant to the event and records the resolved recipient set.
- Templates are versioned; rendered messages retain the template version and safe business references used.
- Retries use bounded backoff, attempt limits, terminal failure, and operator-visible recovery.
- Development delivery writes to a protected mailbox/log and never contacts real recipients.

## Dashboard and reporting definitions

- Role scope is applied before aggregation so unauthorized records never affect counts, totals, search, or exports.
- Definitions for pending, aging, overdue, unclaimed, completed, and paid are centralized and reused by cards, lists, and reports.
- Global search uses permitted indexed fields and does not expose restricted matches through counts or suggestions.
- Excel exports contain active filters, generated time, safe values, summary totals, and transaction rows; user-entered text is protected against spreadsheet formula injection.
- Print datasets are server-generated and reconcile to the same query definition as the interactive view.

## API and frontend behavior

- Notification APIs support list, unread count, mark read/unread, and safe deep links.
- Dashboard/report APIs support role-aware filters, stable sorting, bounded pagination, and explicit summary metadata.
- Frontend displays retry-independent in-app state, empty/error/loading conditions, consistent filters, Excel export, and print controls.
- Large exports use an approved synchronous limit or asynchronous job/download pattern.
- Mock mode provides equivalent notification, dashboard, tracker, and report scenarios.

## Performance and operations

- Index outbox availability/state, notification recipient/state, and common report dimensions.
- Measure query plans and response times using representative larger datasets.
- Provide worker health, backlog depth, oldest-event age, retry/failure counts, and correlation IDs.
- Define retention for notification payloads, delivery attempts, exports, and reporting projections.

## Delivery sequence

1. Confirm event/recipient matrix, templates, retry policy, dashboard definitions, and report fields.
2. Add outbox, notification, delivery-attempt, read-state, and reporting support models/indexes.
3. Implement transactional enqueueing, workers, retries, idempotency, and development delivery adapter.
4. Add notification, dashboard, global search, tracker, and report APIs.
5. Connect notifications, dashboard cards, queues, tracker, filters, Excel export, and print views.
6. Add duplicate-event, retry, permission, pagination, performance, and reconciliation tests.

## Acceptance gates

- Existing transaction flows remain usable; notifications, dashboards, search, tracker, and reports pass mobile-first checks at mobile, tablet, and desktop widths without clipped controls or horizontal page overflow.

- Retrying a business operation never creates duplicate notifications.
- Delivery attempts and failures are durable, observable, and safely retryable.
- Dashboard and report totals reconcile to source transactions for every role scope.
- Large result sets are paginated and indexed; exports preserve active filters and correct totals.
- Development delivery works without sending real email.

## Test and validation matrix

- Transaction rollback/outbox atomicity, worker restart, duplicate delivery, ordering, retry/backoff, terminal failure, and manual recovery.
- Recipient resolution for request, approval, Finance, voucher, payment, return, decline, pickup, release, and completion events.
- Role/department report permissions and leakage-resistant counts/search.
- Dashboard card/list/report reconciliation across filters, currencies, statuses, dates, and pagination.
- Large-data performance/query-plan checks and export limits.
- Download and reopen filtered Excel files; verify sheets, totals, rows, date/amount formats, and formula-injection escaping.
- Browser notification/read behavior, dashboard responsiveness/accessibility, print views, builds, Docker workers, dependency audits, and CI.

## Expected evidence

- Event/recipient matrix, template catalog, retry and worker metrics, reconciliation workbook/results, performance baselines, browser evidence, QA register updates, reviewed archive/checksum, and CI run.

## Decisions required before implementation

- Notification event/recipient matrix and template ownership.
- Retry schedule, expiry, and operational alert thresholds.
- Official definitions for aging, overdue, unclaimed, completed, and dashboard totals.
- Required Excel/print reports and retention policy.

## Exclusions

Production email and enterprise monitoring connections remain disabled until Phase 09 approval.

## Dashboard completeness increment — 2026-10-20

The dashboard now loads all permitted request pages before publishing a replacement, keeps per-currency open gross amounts separate, and counts persisted ready-for-pickup check lines. See `phase-08-dashboard.md` for definitions and concurrency limits. Shared table pagination and request navigation are retained. Server aggregation at large volume, payment/advance reconciliation reports, and official SLA aging definitions remain pending.

## Finance acceptance increment — 2026-10-30

- Added Finance-only payment, advance, fund return and payment recovery reports from repeatable-read snapshots, with exact separate currency totals across pages, applied filters, current-state definitions, bounded exports and payment-line traceability.
- Added a server dashboard snapshot for card totals, actionable membership and persisted status/payment projections; no totals derive solely from the first request page.
- Added transactional notifications for voucher preparation/certification, issuance/voiding and fund return receipt/verification/correction. Recovery rejections explicitly return the correction notification to Finance Associate. Legacy single-instruction authorization is covered.
- Added existing-screen filters, request links, Excel/print, descriptive elapsed-time buckets and mobile scrollable report tables.
- Fixed accounting refresh sequencing during tax saves and corrected outdated guide steps.
- Local Finance setup remains blank and unactivated by owner direction. Finance configures it during the demo; no business acceptance is pre-recorded.

See `finance-acceptance-demo.md` and `phase-08-finance-reconciliation.md`. LifeOS SSO and live procurement/ERP connections remain outside this local acceptance demo by owner confirmation. SLA deadlines/reminders/escalation remain deferred. External email and production activation are excluded. Large asynchronous exports, production-scale benchmarks, retention and provider monitoring remain production acceptance work, not represented as completed here.
