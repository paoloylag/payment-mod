# Procurement / APS connection readiness — 14 November 2026

## Verified projects

Updated Procurement: `C:/Users/Paolo Ylag/Documents/ChatGPT/Procurement`, clean checkout at `4487ee2`. This is a different local project from `Documents/Procurement Module` (`f5c408a`, unchanged after remote fetch). Updated code has Node/SQLite persistence and actual staff APIs. APS remains Python/PostgreSQL. No live connection or database changes were made.

Read implementation before older notes: `docs/APS-INTEGRATION.md` in updated Procurement still describes obsolete browser storage/Filed behavior. Current `server/operations-http.mjs`, `server/orders.mjs` and `docs/OPERATIONS.md` implement database-backed files and a `Closed` state.

## Existing APIs usable behind an adapter

| Procurement endpoint | Current behavior | APS preparation |
| --- | --- | --- |
| GET /api/purchase-orders?q=&status= | Staff-session scoped list; array with id, number, requestId, vendorName, totalCents, status, timestamps | Dedicated service-read projection and paging needed. `/ready` means ready for PO creation, NOT ready for payment. |
| GET /api/purchase-orders/{id} | Staff-authorized full detail, items, receipts, files, history, version | Lookup uses internal ID, unlike APS mock lookup by PO number. Map exact IDs; do not expose the entire nested profile. |
| GET /api/purchase-orders/{id}/pdf | Authorized generated PDF; preview same-origin only | Stream via APS authorized backend proxy; no cross-origin iframe dependency. |
| GET /api/order-files/{fileId} | Record-authorized PO evidence content | Service scope and per-request access; allowlisted content proxy, no arbitrary URL fetching. |
| GET /api/vendors/{id}/enrollments | Staff-only historical onboarding records | Procurement qualification is distinct from APS supplier acceptance. No bank fields in APS projection. |
| GET /api/enrollment-files/{fileId} | Authorized supplier evidence | Define shared document-kind mapping and APS visibility. |
| POST /api/integrations/aps/closure | HMAC-authenticated full settlement + APS-admin closure, atomic and idempotent | Inactive APS signing helper prepared; dispatch/outbox/authority and settlement mapping not activated. |

Never reuse supplier bearer invitation links or staff login credentials as service authentication. Do not expose the closure secret to a browser.

## Required provider read API contract (proposed, not implemented)

- `GET /api/integrations/aps/v1/purchase-orders?cursor=&limit=&q=&eligibleOnly=true`: bounded service-authorized list; normalized `items`, opaque `nextCursor`.
- `GET /api/integrations/aps/v1/purchase-orders/{id}`: immutable ID, official number, PR ID, canonical vendor ID, department/cost-center code, currency, decimal-string amounts, version, timestamps, actual lifecycle state and explicit eligibility/reasons.
- `GET /api/integrations/aps/v1/purchase-orders/by-number/{number}`: exact match, not fuzzy list search.
- `GET /api/integrations/aps/v1/documents/{id}`: authorized PO/vendor evidence belonging to allowed records; name, MIME, size and checksum metadata. No provider filesystem paths, tokens or bank information.
- Procurement-owned vendor safe lookup should use the canonical shared PostgreSQL vendor table once integrated; if read facade needed, expose only whitelisted identity/qualification fields with canonical IDs. No second synchronized master and no APS editing of Procurement-owned vendors.

Use dedicated service identity and least-privilege read scopes, with key rotation/auditing, bounded timeouts, response-size limits, rate limits and consistent 401/403/404/409/429/503 errors. Choose authentication compatible with deployment; current staff sessions are not that contract. APS must fail closed on provider failure and revalidate eligibility/version at submission. A source-native `totalCents` integer maps through Decimal /100; never float currency calculations. Department display names require explicit configured codes, not guessing.

APS facade remains `GET /api/v1/purchase-orders` and `GET /api/v1/purchase-orders/{po_number}` (master_data router prefix `/api/v1`). Preserve mock mode for local tests, transaction snapshots and duplicate-use controls. No automatic partial/multi-request PO allocation is authorized by multiple payment lines on one voucher.

## Shared vendor database prerequisite

Confirmed user direction: one shared vendor database, ownership `aps` versus `procurement`; APS General only uses APS suppliers, PO requests may show Procurement suppliers. APS already owns Alembic migration of `vendor_records`; Procurement currently uses SQLite and separate vendor records. Move/integrate Procurement's vendor repository with that canonical PostgreSQL table, retain an explicit audited ID crosswalk for existing suppliers/PO snapshots, and enforce ownership on both sides. Do not change SQLite IDs by name matching or copy private banking profiles into APS. Procurement encrypted bank profiles remain outside APS's safe projection. Shared vendors do not require sharing staff sessions or all business tables.

## Existing closure wire contract

Provider requires secret length >=32, header `X-APS-Timestamp` (10-digit Unix seconds), header `X-APS-Signature` (lowercase hex HMAC-SHA256 over timestamp + '.' + exact raw body). Five-minute skew, body <=65536 bytes. Empty/unconfigured secret returns503. Payload:

```json
{"eventId":"immutable-outbox-event-id","type":"po.closed","poNumber":"PO-2026-000001","currency":"PHP","settledCents":8900000,"paymentReference":"APS-reference","closedAt":"2026-11-14T08:00:00Z","closedBy":{"id":"verified-admin-id","name":"Verified administrator","role":"aps_admin"}}
```

Only `Received` POs with an Invoice and exact full PHP total may close. Closure cannot predate final receipt or be in the future. Atomic insertion in `aps_events`, order update and history; same event and identical bytes yields duplicate success; changed bytes/event collision409. Retries preserve persisted body/event ID but refresh signature/timestamp. Current handler changes state to `Closed`, not historical `Filed`.

`api/payment_module/procurement_wire.py` now signs exact bytes only. It performs no HTTP call, creates no closure command and grants no role. Caller must derive and authorize the actor server-side; string `aps_admin` from browser input is not authority. A durable transactional APS outbox, explicit authorized closure action, retries/dead-letter/reconciliation and provider error feedback remain to implement. Payment release alone must not automatically close a PO.

## Decisions that block live activation

1. Confirm provider payment eligibility state(s), receiving/invoice prerequisites and one-PO versus multiple-invoice allocation. Existing APS mock `Approved` and provider `Received` closure are different phases, not equivalent.
2. Define gross PO settlement versus net cash release + EWT. APS supports withholding; exact provider total cannot safely be populated from net paid cash alone. Partial payments, credits/recoveries and reopening a Closed PO also need policy/endpoint support.
3. Map actual APS closure authority to an authorized action; System Administrator is not automatically a Finance/payment decision maker. No privilege was granted here.
4. Integrate canonical shared vendors and cost-center codes, service authentication, protected documents and deployment URLs/secrets.

## Next implementation order

1. Provider safe service-read endpoints + authenticated contract tests.
2. Canonical vendor repository/ID crosswalk and department mapping.
3. APS HTTP adapter/proxy with feature flag, decimal normalization, failure handling and submission revalidation.
4. Settlement authority and outbox-backed closure dispatch once the rules above are confirmed.
5. Isolated two-system API regression, then actual browser PO selection -> approval -> voucher/payment -> authorized closure. No end-to-end UI pass is claimed by this assessment.

## Validation performed

Procurement `node --test server/operations.test.mjs`: 8 passed against in-memory fixtures, including full lifecycle/HMAC/duplicate and conflict cases. APS `python -m unittest discover -s tests -p test_procurement_wire_contract.py`: 3 passed. These are API/unit checks, not browser validation or a live two-system connection. Procurement working tree remained clean. No secrets, service accounts or configuration were created.
