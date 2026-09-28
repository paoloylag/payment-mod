# Procurement Integration Contract Notes

Date recorded: 2026-09-25
Status: Local mock contract implemented; live transport and complete lifecycle contract still pending.

## Purpose

Record the supplied Vendor and finished-P.O. JSON structures as the current development examples for the Procurement-to-APS boundary. The finished P.O. is demonstrative and is not evidence of a real completed transaction.

## Vendor input

The supplied payload provides:

- Identity/display: `name`, `vendorType`, `branchCode`, `businessRegistration`, and `taxId`.
- Contact: `email`, `contactPerson`, `phone`, and address fields.
- Commercial metadata: `terms`, `lead`, `rating`, `tags`, and `notes`.
- Status: `informationStatus` and `informationRequestedAt`.
- Business-document metadata: `businessDocuments[]` with `id`, `name`, `kind`, `size`, and `uploadedAt`.

### APS normalization

- Procurement remains the vendor system of record.
- APS exposes vendor data through its read-only facade and stores a transaction-time snapshot when a request is submitted.
- `bankName`, `bankAccountName`, `bankAccountNumber`, and any other `bank*` field are discarded at the adapter boundary. They must not enter APS responses, persistence, logs, exports, fixtures, or audits.
- `businessDocuments` may provide evidence that Procurement already holds BIR 2303, Business Permit, or registration records. APS needs a stable document-kind vocabulary and an authorized retrieval URL/API before it can display or automatically satisfy a document requirement.
- The sample has no immutable vendor ID. `branchCode`, `taxId`, or name-derived IDs are insufficient as the permanent integration key without a provider guarantee.

## Finished P.O. input

The supplied object provides:

- References: `id`, `poNumber`, and `sourceRequestId`.
- Lifecycle: `status`, with Procurement currently storing Closed as `Filed`.
- Request context: `title`, `department`, `requester`, `purposeType`, `purpose`, `category`, `sourcingLotCategory`, and `due`.
- Commercial terms: `amount`, `vendorName`, `vendorEmail`, and `items[]`.
- Sourcing evidence: `rfqQuotes[]`.
- DT review evidence: `dtReviewedBy`, `dtReviewedAt`, and `dtReviewNotes`.
- Invoice metadata: `invoices[]`.
- APS completion evidence: `apsPayment` with `eventId`, `paymentReference`, `poNumber`, amount/currency, status, paid/closed timestamps, and actors.

### Proposed local APS mapping

| Procurement field | APS use |
|---|---|
| `poNumber` | External P.O. reference and primary user-facing lookup key. |
| `id` / `sourceRequestId` | Retained external correlation identifiers; their distinct meaning must be documented. |
| `status` | Eligibility check. `Filed` maps to Procurement Closed, but the full status/transition list is required. |
| `department` | Must map to an APS department/cost-center code rather than relying on display text. |
| `requester` | Display snapshot only unless a stable LifeOS/user identifier is supplied. |
| `vendorName` / `vendorEmail` | Vendor snapshot; a stable vendor ID is still required. |
| `items[]` | Source line descriptions, quantity, UOM, and expected pricing. APS accounting/cost-center assignments remain APS-owned unless Procurement supplies approved mappings. |
| `rfqQuotes[]` | Read-only sourcing evidence; not copied into an APS upload requirement. |
| `invoices[]` | Read-only document metadata until an authenticated content-access mechanism is supplied. |
| `apsPayment` | APS-to-Procurement completion result or reconciliation echo; direction and mutation rules require confirmation. |

## Confirmed behavior

- Approved P.O. and Quotation/Contract records come from Procurement and are not uploaded again in APS.
- Vendor information comes from Procurement; APS does not provide vendor CRUD.
- Vendor bank data is not used. There is no bank connection or banking adapter.
- P.O. Delivery Receipt and Business Permit remain visible as conditional APS document requirements until Procurement document-kind mapping and content access can satisfy them automatically.
- A Procurement status of `Filed` represents Closed.
- APS records amount and currency as a pair and performs no currency conversion.
- For local development, only `Approved` records without `apsPayment` are eligible. APS validates the P.O. amount,
  currency, and vendor at submit/resubmit, serializes duplicate-use checks, and stores a transaction-time P.O./vendor
  snapshot. `Filed` and already-paid records are rejected. These are mock-contract assumptions, not authorization to
  activate a live integration.

## Contract questions still required

1. What immutable vendor ID will Procurement provide? Is it globally unique and stable across branches and vendor updates?
2. What are the actual Vendor and P.O. endpoint URLs, HTTP methods, authentication scheme, and API version?
3. Are responses single objects, arrays, or paginated envelopes? Supply pagination, filtering, sorting, and search parameters.
4. What timeout, rate-limit, retry, cache, and provider-unavailable behavior is expected?
5. What are the complete Vendor and P.O. status values and valid transitions? Which P.O. statuses are eligible for APS payment?
6. Does `Filed` mean Procurement closes only after receiving a successful APS event, or can Procurement mark it independently?
7. Are `id`, `poNumber`, and `sourceRequestId` unique, immutable, and distinct? Which is the canonical lookup key?
8. Supply stable requester/user and department/cost-center identifiers. `Academic Affairs` does not directly match the current approved `Academics / Residential Campus (ACAD)` display name.
9. Replace relative `due` text such as `In 14 days` with an ISO date or timestamp and define its business meaning.
10. Which amount is authoritative for the APS payment request? The sample contains P.O. `amount=90000`, selected quote total `89000`, and `apsPayment.amount=89000`.
11. How is the selected/awarded RFQ quote identified? A list of responded quotes is insufficient to infer the awarded vendor and price.
12. Can P.O. invoices or business documents be downloaded? Supply authorized content endpoints, expiry behavior, MIME/checksum metadata, and access rules.
13. Define the controlled vocabulary for `businessDocuments.kind` and `invoices.kind`, especially BIR 2303, Business Permit, Delivery Receipt, Invoice, and registration documents.
14. Should Procurement-held documents automatically satisfy APS requirements, or should APS display them as external evidence requiring Finance confirmation?
15. Is `apsPayment` sent by APS to Procurement, read back from Procurement, or both? Define create/update endpoints, webhook direction, authentication, signing, idempotency, retries, and conflict handling.
16. Is `eventId` the idempotency key? Define uniqueness, replay handling, and whether payment/closure updates can be corrected.
17. Enumerate APS payment statuses and whether `paidAt`, `closedAt`, `closedBy`, and `paymentReference` are mandatory for each status.
18. Define sandbox fixtures, error responses, validation errors, not-found behavior, and test credentials.

## Phase impact

- Phase 02: The representative Vendor schema is now updated and bank-field exclusion remains tested. Live activation still needs the transport, identity, pagination, availability, and sandbox contract above.
- Phase 03: Local seeded records now exercise P.O. selection, eligibility, authoritative amount/currency/vendor checks,
  duplicate-use protection, and safe submission snapshots. Production/live behavior still depends on the unresolved
  lifecycle, amount, identity, transport, and sandbox contract questions above.
- Phase 04: Procurement document metadata can eventually satisfy or display external evidence, but content access and document-kind mapping remain required.
- Phase 07: `apsPayment` is the planned completion/reconciliation boundary, pending direction, idempotency, status, and correction rules.
- Phase 09: Production credentials, webhook security, monitoring, retries, reconciliation, ownership, and sandbox/staging validation remain consolidated production-readiness work.
