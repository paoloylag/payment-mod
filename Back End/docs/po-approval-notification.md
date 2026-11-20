# APS -> Procurement: PO request approved

Prepared 14 November 2026. Payment-side implementation; live delivery disabled until Procurement implements the separate receiver.

## Behavior

When the final required approval of a `poPayment` request completes, APS records `aps.po_request.approved` in `procurement_approval_events` in the same database transaction. Earlier stages, returned/declined requests and other request types do not create this event. Required final approver remains determined by the existing route, including authorized on-behalf approvals. Rollback removes the event with the approval. Workflow version/source-event uniqueness and existing command idempotency prevent duplicate intent on retries.

The message reports APS request approval only. It does not approve Procurement's own PO, mark payment released/settled, acknowledge delivery, or close the PO. Procurement should store a separate linked APS request status/history, not replace its own lifecycle status. Gross amount is a decimal string in request currency, not a settlement amount. Names, bank fields, notes and documents are not copied into this event.

## Proposed receiver (not yet present in Procurement)

The version1 minimal example below is historical; new events use version2 with financial data as described in the 17 November section. See [version2 financial example](procurement-financial-event-example.json).

`POST /api/integrations/aps/request-approved`

```json
{"eventId":"stable-uuid","type":"aps.po_request.approved","schemaVersion":1,"occurredAt":"2026-11-14T08:00:00+00:00","purchaseOrder":{"id":"provider-id-if-known","number":"PO-2026-000001"},"request":{"id":"aps-request-uuid","number":"APS-request-number","version":3,"status":"approved","currency":"PHP","grossAmount":"56000.0000"},"approval":{"workflowId":"workflow-uuid","version":4,"actorId":"verified-user-uuid"}}
```

Receiver must verify exact-body HMAC, timestamp skew, event/type/version/PO mapping and deduplicate event ID + body digest atomically. Match both provider ID and PO number if both are present. Current mocks may have legacy IDs; reconcile the provider mapping before live dispatch. Preserve out-of-order historical approval facts; do not let an old event overwrite a newer APS request state. Returns/cancellations/revocations after final approval and their receiver transitions are separate future events, not invented here.

Successful new or duplicate delivery returns HTTP200 and `{"ok":true,"eventId":"same-stable-uuid"}`. A plain200/HTML/wrong ID is not acknowledged. Never point approval delivery at the existing `/closure` endpoint; the sender rejects it.

## Configuration and execution

New additive Alembic migration `20261114_0035` creates the outbox. It must be deployed with the API changes. It does not backfill previously approved requests or send historical approvals automatically.

- `PROCUREMENT_APPROVAL_WEBHOOK_URL`: dedicated server-side approval receiver URL. HTTPS mandatory outside literal loopback; redirects, URL credentials/query/fragment rejected.
- `PROCUREMENT_APPROVAL_WEBHOOK_SECRET`: separately configured secret at least32characters. Prefer a dedicated approval secret; no secret is saved in events/browser/source.
- `PYTHONPATH=api python -m payment_module.procurement_approval_worker`: one bounded batch; schedule only after receiver validation. No config means no sends, attempts or DB access. No worker or scheduler was enabled by this change.

Headers match the existing provider signing convention: `X-APS-Timestamp`, `X-APS-Signature`; HMAC-SHA256 over `<unix-seconds>.<exact UTF-8 body bytes>`. Retries retain event ID/body and refresh signature/time. Ten-second timeout,64KiB acknowledgement bound, five records per batch, exponential retry capped at one hour, eight attempts before failed. Only matching acknowledgement marks delivered. Errors store generic codes rather than external response bodies or credentials. Concurrent workers use row locks with SKIP LOCKED; provider deduplication handles a crash after remote acceptance but before local commit. This is at-least-once delivery, not an exactly-once transport claim.

Outbox states: pending, retry, delivered, failed; missing PO number is blocked. Operational retry/status UI and automatic alerting are not added. No normal app database migration/configuration, provider receiver, live network send or production change was performed. Existing email outbox/worker remains separate.

## Validation

Focused unit tests cover final-only/type filtering, safe payload projection, disabled mode, exact-byte signature, invalid target/closure rejection, matching acknowledgement, retries and redacted errors. PostgreSQL tests cover transactional insertion, duplicate intent, intermediate-stage exclusion, rollback and the actual final-approval HTTP endpoint with idempotent retry. API preparation is fixture-based; no browser acceptance or live provider delivery is claimed. See task closeout for executed counts and migration replay result.


Executed validation: full isolated backend suite315passed (2warnings;8subtests passed), focused approval/regression run43passed, Ruff clean. Migration0035 upgrade, downgrade to0034 and re-upgrade passed in payment_module_test; four database-event tests passed again after replay. Docker Desktop was started to run these checks; only existing DB/MinIO/test helpers were explicitly started. No regular application database migration or live Procurement send occurred. No frontend change was made, so this pass used actual approval API tests rather than claiming browser validation.


## 17 November 2026 — Version 2 financial visibility

New approval events now use schemaVersion2 and include a safe `financial` object. Existing immutable queued version1 bodies are not rewritten. Migration0036 extends the same durable stream; nullable workflow-event reference accommodates tax/voucher/payment source events, unique source keys preserve idempotency, and database-generated streamSequence provides an ordered revision token. Sequence is serialized as a decimal string to avoid JavaScript integer precision loss. Sequence gaps are normal. The receiver tracks the greatest sequence per APS request and must ignore older snapshots for current-state display while retaining their history. Duplicate retries acknowledge the same event ID without applying amounts twice.

`financial.calculation`: status (saved/not_saved/stale), calculation version, totals grossAmount/vatAmount/ewtAmount/netPayable and lines containing lineId/position/grossAmount/vatAmount/ewtBase/ewtRate/ewtClassification/ewtAmount/netPayable. Mixed rates remain per-line; no misleading single aggregate rate is invented. Missing/stale calculation totals are null, not zero. These are saved APS calculations, not a new provider-side tax calculation.

`financial.payment`: status, netPayable, released, cleared, recovered, remaining and lines (id, sequence, version, reference, method code, amount, currency, status, replacesPaymentId). Summary balances use the same decimal accounting service as APS. Released includes uncleared release; pending recovery remains released; verified reversal removes released/cleared contribution and increases remaining; original and replacement references remain visible. Recovered is separately shown and must not be deducted twice. Amounts are decimal strings in financial.currency. Withholding is a calculated liability, not proof that tax was remitted.

`financial.voucher`: id, issued number when available, version, status; null before preparation. Payment netPayable comes from the voucher balance, while calculation totals carry their own version. The receiver must display these sources explicitly if they differ, not merge them silently.

After final approval, tax re-save, voucher issue/preparation/voiding and payment release/clearing/failure/recovery/reversal transitions queue `aps.po_request.financial_updated`, schemaVersion2, with the same purchaseOrder/request correlation and full current financial snapshot. Intermediate per-line prepared events are consolidated at voucher payment_prepared, avoiding a partially-built multi-line schedule snapshot. Before final approval and on non-PO requests, no financial updates are sent. Each update is atomic with its source change and rollback-safe. Updates do not mark the Procurement PO paid or closed.

The configured receiver must support BOTH types on the dedicated approved/financial endpoint before activation. Existing Procurement closure endpoint still rejects these types; its settlement rules are unchanged. Live dispatch remains off. A Procurement UI/receiver is still required to persist and render the data: separately labelled Gross, VAT, EWT, Net payable, Released, Cleared, Recovered and Remaining cards/fields; line-level tax and payment details behind disclosures; readable dates and statuses. Do not concatenate monetary variables into a single text line. Nothing in this payload authorizes bank detail access or a new financial decision.

Migration0036 downgrade refuses when financial audit rows exist, rather than deleting those rows to restore the old non-null workflow FK. After retaining/exporting financial history under an approved process, clean isolated test data can replay the migration normally. No live database was migrated in this task.


Version2 validation closeout (17 November): full isolated backend suite318passed,2warnings,8subtests passed after correcting a non-PO notification metadata access regression. Focused notification/financial checks12passed. Ruff clean. Migration0036 upgrade/downgrade/re-upgrade passed on payment_module_test; final targeted regression replay passed. API flow exercised approval -> issued voucher -> partial payment -> release -> clearing -> pending recovery -> confirmed reversal, inspecting event balances/privacy and sequence ordering. These are actual API/unit checks, not browser or live Procurement delivery. Provider receiver/display, normal app migration and dispatch configuration remain pending.
