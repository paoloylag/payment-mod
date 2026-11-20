# PO receipt confirmation gates payment release

Implemented 20 November 2026 in APS and the local Procurement checkout. Automatic PO filing and staggered-payment accounting remain separate work.

## Business behavior

PO approvals, Finance document/tax review, accounting, voucher issuance and payment-line preparation may proceed before delivery. APS refuses `release` and `pickup-ready` server-side until the original requestor confirms full receipt in Procurement. Clearing/recovery of an already released payment remains available under existing permissions. Other request types are unaffected.

Receiving/Procurement staff first record all accepted quantities and an Invoice. The original requestor then uses **Confirm goods received** in the PO screen. Managers, administrators and Receiving staff cannot confirm on somebody else's behalf. Historical rejected units do not prevent confirmation once replacements fulfill all ordered quantities. Partial/unfulfilled quantities remain blocked.

Confirmation does not approve a request, send money, clear a payment or close the PO. This initial release gate has no downpayment exception; agree and implement the staggered/prepayment policy separately.

## Contracts and configuration

APS: `POST /api/v1/integrations/procurement/receipts`. Configure `PROCUREMENT_RECEIPT_SECRET` with a dedicated shared secret of at least 32 characters. Keep it separate from vendor-read and APS closure credentials. No staff login can substitute for the service signature.

Procurement: `POST /api/purchase-orders/:id/confirm-receipt` uses normal authenticated user/CSRF/version checks and `{version, confirmed:true}`. It records the human confirmation, audit event and outbox row in one transaction. Its PO read returns `canConfirmReceipt`, `details.requesterReceiptConfirmation` and `receiptSync`.

Event fields: `eventId`, `type:po.receipt_confirmed`, `schemaVersion:1`, `occurredAt`, `poId`, `poNumber`, `poVersion`, `sourceRequestId`, `requesterId`, `confirmedById`, `confirmedByName`, `confirmedAt`, `fullyReceived:true`, `receiptIds`, `invoiceDocumentIds`, and `items:[{itemId,ordered,accepted,rejected}]`. `rejected` records historical rejections; full acceptance requires accepted == ordered.

Headers: `X-Procurement-Timestamp` (Unix seconds) and `X-Procurement-Signature` (hex HMAC-SHA256 of `timestamp + '.' + exact raw body`). APS enforces five-minute authentication skew, 64 KiB body limit, original-requestor identity equality, full accepted quantities/evidence, version monotonicity and event/content idempotency. Different content reusing an event ID is rejected. Inbox history is append-only; receipt-before-filing is retained and can match a later request.

APS release matching uses the saved `type_data.procurement_snapshot.purchase_order`: immutable `id`, exact `poNumber`, `sourceRequestId`, original `requesterId`, `version`, and item IDs/quantities when present. A missing/mismatched mapping holds release. This must be populated by authoritative PO reads/filing; matching vendor names or local APS user names is insufficient. Existing showcase PO IDs are not real Procurement identities and are not backfilled automatically.

Procurement delivery worker: configure `APS_RECEIPT_ENDPOINT` as the exact APS endpoint and `APS_RECEIPT_SECRET` matching the APS secret; use HTTPS except for loopback tests. Run `node --env-file-if-exists=.env server/aps-receipt-worker.mjs` periodically from the Procurement working directory using the existing service scheduler. It processes a bounded batch, signs fixed payload bytes, validates matching event acknowledgement and retries with backoff. Unconfigured delivery leaves the event pending and the UI says Pending delivery. No background service is automatically installed by this change.

## Local rollout and remaining wiring

1. Apply APS migration `20261120_0037`; preserve the append-only inbox during rollback. Empty-table downgrade/replay is supported; downgrade is refused if audit data exists.
2. Restart APS and Procurement with current source/build. Procurement creates its additive outbox table on startup.
3. Supply real PO/requestor identity mapping and configure secrets/endpoint/worker. Normal APS still uses a local PO adapter; the production PO read/auto-filing integration remains pending. Existing manual/mock requests remain held until they have a matching authoritative receipt.
4. Verify one real mapped PO in a controlled pilot before enabling general use. No implicit historical backfill or receipt waiver is provided.

Two-system browser evidence used isolated Procurement at port 5192 and APS at 5190/58010. Original-requestor button click produced a signed worker delivery and enabled APS's release control after refresh. Preparatory records were synthetic fixtures; no external email/bank/payment was sent. This is not a claim that the ordinary LAN Procurement service is configured or restarted.

## Exceptions not implemented

Receipt revocation/correction after confirmation, post-issue PO amendments, audited requester delegation, downpayment/partial milestone release exceptions, automatic filing and real PO/document read adapters are follow-up work. Until a correction protocol is agreed, accepted Procurement goods/documents remain locked and the inbox does not accept arbitrary editable receipt states. Never modify paid history to resolve a mismatch.
