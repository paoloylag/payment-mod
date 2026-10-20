# Phase 08 notification increment — 2026-10-20

Status: implemented locally; full Phase 08 is not complete. Production email remains disabled.
The owner confirmed the recipient policy in this chat on 2026-10-20.

## Recipient matrix (template version phase08-v1)

| Event | Recipients |
| --- | --- |
| Submitted/resubmitted; stage approved with another stage remaining | Effective assigned reviewer, or eligible users for the current reached role when no named assignment exists |
| Information requested / returned to Finance Associate | Current Finance Associate responder |
| Information provided | Reviewer at the saved resumption stage |
| Return to requestor / decline / final approval | Requestor plus responsible Finance Associate if Finance has been reached |
| Assignment/delegation/route update | Current effective reviewer; future stages remain excluded |
| Payment line prepared/replacement prepared | That payment line's assigned signatory |
| Payment released or recovery pending | Requestor plus responsible Finance Manager (clearing/recovery task) |
| Other payment state updates | Requestor plus responsible Finance Associate |

Inactive/suspended accounts and the actor who performed the action are excluded. A named assignment/delegation
is respected; an ineligible named assignee is not silently bypassed. Recipients and a generic safe message
are saved in the same transaction as the business event. No notes, bank details or attachments are copied into messages.
The inbox rechecks current request visibility before returning items, unread counts, totals or read-state changes.

## Delivery and history

- Outbox rows are claimed with row locks / SKIP LOCKED; workers can coexist without double delivery.
- Unique event/recipient/channel keys and a single database transaction prevent duplicate/partial deliveries.
- Attempt history survives manual retry. Retry delays are 1 minute, 5 minutes, 30 minutes and 2 hours;
  the fifth failed attempt is terminal. These are local operational defaults pending production operations acceptance.
- Error history contains exception class names only. No raw exception payloads or credentials are logged.
- Existing pending events without a recipient snapshot are marked delivered with a skipped attempt; they are not
  retroactively routed to today's reviewers. Migration downgrade refuses to discard notification/payment history.
- Development mailbox rows are stored in notification_deliveries with channel development_email. They are protected
  database records, not SMTP deliveries or files in a public web directory. The ordinary inbox cannot read that channel.
- The worker never contacts an email service. The development mailbox flag is rejected outside local/test.

## Local operation

Use the normal local compose file plus any local port override already in use. Build/start the app first so
migration 20261020_0028 has completed, then enable the notifications profile:

```sh
docker compose build app
docker compose --profile notifications up -d app notification-worker
docker compose exec notification-worker python -m payment_module.notification_worker --health
```

A one-off pass is `python -m payment_module.notification_worker`; add --development-mailbox only locally.
An authorized host/database operator can inspect a terminal failure, correct its cause, then run
`python -m payment_module.notification_worker --retry-failed EVENT_ID`. There is no automatic replay of terminal failures.
The CLI records the retry in notification_attempts. Infrastructure access and operator actions must be governed by the
production runbook before deployment. Stop the local loop with `docker compose stop notification-worker`.

The inbox APIs support bounded paging, read and unread commands. The existing bell has matching controls;
opening a notification follows the normal request screen and marks it read. Conversation mentions remain supported.

## Verification

- Isolated API tests cover recipient scope, future-role privacy, read/unread ownership, deduplication,
  atomic retry failure, terminal failure, event rollback, payment recipients and manual retry history.
- Chrome test covers the bell, read/unread, safe link, Department Head approval → Finance Associate notification,
  future COO exclusion, transient inbox error/retry, and panel fit at 375/768/1440px.
- Migration upgrade, downgrade and replay run on a separate empty migration-test database.
- Full backend regression: 237 passed. Production frontend build, backend lint and whitespace checks passed.
- Chrome: 10 browser tests passed (new notification test, conversation participant regression, and eight request click-through scenarios).
- Full regression/browser evidence is recorded in outputs/phase08-*.log. Local API and notification worker health verified.

## Remaining Phase 08 work

- Voucher, fund-return, certification and additional business-event notification coverage and templates.
- Approved production email adapter, channel preferences/delivery controls, retention/expiry and operational alerts.
- Role-scoped dashboard/report APIs with centralized definitions and reconciliation to persisted financial events.
- Aging, outstanding advances, unclaimed checks and payment reconciliation reports, safe Excel/print exports.
- Representative-volume performance and query-plan checks; consolidated report acceptance.
- Mock-mode examples for the new notification scenarios. Current acceptance uses the isolated real API.

SLA/overdue reminders and escalation remain owner-deferred. Existing elapsed-day aging is not an SLA definition.
