# PO-only automatic APS filing and receipt gate

Updated 20 November 2026. Automatic filing remains planned. The release-only receipt gate, signed APS receipt inbox, Procurement original-requestor confirmation and durable receipt outbox are now implemented; see po-receipt-release-integration.md. Normal service wiring and authoritative PO mapping still require setup.

## Current verified behavior

Procurement has Approved -> Issued -> Acknowledged -> Partially Received -> Received -> Closed PO states. Approved means its department/executive approval is complete. Issued means the official PO has been issued to an active vendor. Supplier acknowledgement is not goods receipt. Fully Received requires all ordered quantities accepted and an Invoice attached.

Current receipt recording is restricted to Receiving staff or Procurement managers (and the existing administrator permissions). The original requester does not currently have a separate goods-acceptance action. The existing /api/purchase-orders/ready endpoint means ready to CREATE a PO, not ready for payment. Existing notices are internal Procurement notifications, not durable outbound APS events.

APS currently requires manual PO payment request creation/submission, has a mock PO adapter and existing duplicate-use checks/snapshots. Its vendor service-read connection is implemented and tested separately but is not a real PO-read integration. APS-to-Procurement approval/financial updates do not create the reverse inbound flow. The shared vendor database migration is still pending.

## Proposed flow (PO Payment only)

Planned filing: Procurement PO Issued -> durable po.payment_request.ready event -> APS automatically creates/submits the linked PO Payment request -> normal approval, Finance validation, accounting, voucher issuance and payment preparation proceed while goods are pending. Independently: Receiving fully accepts goods and Invoice -> original requestor confirms receipt in Procurement -> signed po.receipt_confirmed event -> APS verifies PO/requestor/quantity/version linkage -> payment release becomes available when all other Finance requirements pass. Receiving staff recording delivery alone does not unlock release.

Recommended first trigger is Issued rather than Approved: APS should refer to the official issued commitment, not a PO that has only finished internal review. If business wants earlier visibility at Approved, create a preliminary linked record there but retain an Issued gate before it becomes payable.

Auto-filed means APS generates and maintains the request without manual re-entry. It does not mean automatic approval, voucher issuance, cash release or PO closure. Normal creation should need no intervention when mappings/documents are complete; exceptions must be visible and assigned, not silently guessed.

## Changes by component

| Component | Required change |
|---|---|
| Procurement issuance | Enqueue po.payment_request.ready in the same transaction as the first successful Issued transition; return an APS filing status/link in PO detail |
| Procurement receiving | Keep existing quantity inspection, rejected/partial-item and Invoice controls; add a distinct requester Confirm receipt action after full acceptance |
| Requester confirmation | Verify authenticated identity against the PO original requester; record who/when/which receipt version was confirmed. An authorized delegate requires an explicit audited delegation policy, not reuse of the integration service identity |
| Procurement outbox | Add immutable event bodies, unique PO/version/event keys, retries, acknowledgements, failed delivery status and reconciliation; do not call APS synchronously inside the PO transaction |
| APS service receiver | Add dedicated signed inbound endpoints, safe schema validation, event deduplication, provider-PO correlation and sequence/revision checks |
| APS request creation | Use an internal application service (not browser impersonation) to create exactly one linked poPayment request; record service actor and original requestor separately |
| APS receipt gate | Add an explicit Awaiting receipt confirmation integration state. Hold only payment release and check pickup-ready actions until verified original-requestor confirmation; approval, accounting, voucher creation and payment-line preparation continue |
| APS data/mapping | Persist provider PO/PR/vendor/requestor IDs, exact number, versions, correlation IDs, document references and immutable snapshots; resolve cost center/accounts/currency explicitly |
| Documents | Add authenticated PO/document read endpoints and an authorized APS import/proxy path for PO PDF, Invoice and receiving evidence; retain checksum/version/source metadata |
| Finance UI | Show PO origin/link, filing status, receipt status/confirmation identity/date, blockers and next action separately from approval/payment statuses |
| Procurement UI | Show APS request number/link, auto-filing result, Awaiting requester confirmation action and exceptions; show acknowledgement/sync status honestly |
| Existing APS outbound events | Continue separate approval/financial updates. Do not confuse receipt-ready events with paid/cleared/closed states |

## Proposed event/API contracts

Both event names below are proposals, to agree before implementation. Use one signed endpoint such as POST /api/v1/integrations/procurement/events that accepts the two explicitly versioned types; do not expose normal request CRUD with a staff password.

Common envelope: eventId, type, schemaVersion, occurredAt, provider revision/sequence, PO immutable ID/number/version and PR ID. Sign exact raw bytes with a dedicated server-side HMAC secret, timestamp/skew check, TLS outside loopback, body limits and matching eventId acknowledgement. Keep the inbound secret separate from vendor read and closure credentials. Persist inbox history/current projection atomically before acknowledging.

### po.payment_request.ready

Include safe authoritative source information:

- PO/PR IDs, official PO number, issued timestamp, lifecycle state and source version.
- Vendor provider/canonical ID and safe payee snapshot; no bank secrets copied through this event.
- Original requester immutable ID and verified identity crosswalk; department/cost-center code.
- Currency, gross amount and ordered line IDs/descriptions, quantities, unit amounts/line amounts.
- Purpose, payment terms/required dates where authoritative, budget classification or explicit unmapped/missing state.
- PO PDF and document IDs/metadata plus content checksum/version; fetch through a scoped backend API rather than arbitrary event-supplied URLs.

Do not infer budget classification, expense account, cost center or requester from free text or same-name matches. Use approved Finance defaults only when a complete, applicable configuration exists. Missing values route to an integration exception queue for correction/retry.

### po.receipt_confirmed

Include PO ID/number, referenced PO version, latest accepted receiving revision, receipt IDs/dates, ordered/accepted/rejected quantities, Invoice/receiving evidence references and original requester confirmation identity/time. APS validates that confirmation applies to the same issued PO/snapshot and that all required documents are accessible/current. Then transition the existing request; never create a second request.

Verify the event service identity and the represented human confirmation separately. Preserve source audit evidence even if APS cannot immediately resolve a local user.

## APS approval policy

Agreed policy: Finance approvals can proceed while delivery is pending. Receipt confirmation unlocks payment release, not the approval route. Department Head -> Finance Associate -> Finance Manager and higher approvers still follow existing policy; automatic filing does not waive them.

Decision required: if Procurement approvals should count in APS and skip duplicate Department Head/executive approvals, explicitly define which source approvals are trusted, role/identity mapping, amount/currency thresholds, route-version snapshot and audit representation. Do not implement an implicit skip. Finance tax/accounting checks, payment authorization and release remain separate.

Awaiting receipt is a PO-specific payment-release requirement, not a new approval stage for every request type. General Payment, Petty Cash, Reimbursement, Cash Advance and Liquidation retain their current creation/workflow behavior.

## Integrity and exceptions

- Unique provider-system + immutable PO ID prevents repeated delivery, worker retries or manual submission from generating duplicate payment requests. Do not rely solely on application pre-checks; add a database uniqueness/locking strategy covering active and historical linkage rules.
- One PO -> one APS request is the initial recommendation, consistent with current duplicate-use control. Multiple payment lines are allowed within the voucher; they do not authorize multiple APS requests per PO/invoice.
- Partial receiving updates visibility only and does not unlock payment in the first phase. Partial/invoice-based payments, deposits and advances require an explicit separate policy; otherwise they remain held.
- Receipt arriving before filing must be durably recorded/deferred and reconciled; use authenticated provider lookups to recover missing earlier state, not an unverified receipt payload to create a payable request.
- Out-of-order/duplicate events preserve history but cannot revert current state or re-run workflow submission. Use request-level transactional locks/idempotent commands.
- PO cancellation/change, receipt correction or rejection must suspend unpaid processing and create an assigned exception. Specify reversal/credit handling when payment has already been released; never rewrite paid history or quietly reopen/close a PO.
- Procurement currently restricts cancellation to specific pre-issue stages; new post-issue correction/receipt-revocation events need supported source actions and authority before they can be promised.
- Do not overwrite Finance-reviewed/approved amounts when a later source snapshot differs. Raise a reconciliation issue and require the appropriate correction/reapproval path.
- Provider/API outage retains durable pending work and shows retryable status; payment release fails closed without confirmed receipt; approval/accounting/voucher preparation may continue. Distinguish integration delivery status from business request status.
- Existing manually filed PO requests must be mapped/reused or explicitly excluded in a controlled backfill. Never send fictional showcase/test records to a real system.
- Full payment settlement/PO closure remains a separate action and policy; receiving and requestor confirmation alone cannot close a PO.

## Implementation sequence

1. Agree Issued vs Approved filing trigger, requestor confirmation/delegation, approval reuse, full-receipt versus prepayment policy and one-request-per-PO scope.
2. Define/contract-test safe PO and document reads plus durable event schemas and explicit identity/vendor/cost-center crosswalks.
3. Add Procurement outbox, APS inbox, correlation and idempotent auto-file service behind PO-only feature flags.
4. Add release-only receipt state, server-side payment-release guard, original-requestor confirmation and signed receipt event. Implemented; wire real PO mapping and service configuration before normal rollout.
5. Complete Finance/Procurement linked statuses, exception queue/retry/reconciliation and documentation.
6. Isolated two-system API and actual browser acceptance; deploy/configure gradually with no implicit historical backfill.

## Acceptance map

| Test | Expected result |
|---|---|
| Official PO issued | Exactly one APS PO Payment record appears, prefilled and allowed into approval; release held for receipt |
| Repeated issuance event / delivery timeout | Same APS request, no duplicate request or workflow |
| Supplier acknowledges delivery date | Record remains held; this is not goods receipt |
| Partial/rejected goods | Receipt status visible, payment release remains locked; approval and preparation continue |
| All goods accepted but requester has not confirmed | Release stays held; Finance can continue approval and preparation |
| Wrong requester attempts confirmation | Rejected server-side; no outbound receipt-confirmed event |
| Right requester confirms with current Invoice/receipt | Same APS request becomes eligible for release; approvals already recorded are retained |
| Missing mapping/document or stale PO version | Visible assigned exception, no guessed/corrupted request |
| Receipt event arrives first / older event arrives later | Recover/defer safely; current state does not regress |
| Direct API attempt to bypass receipt gate | Rejected regardless of UI controls |
| Cancellation/correction after receipt | Processing held or recovery exception raised; paid audit history preserved |
| Other five request types | No automatic filing or receipt-gate regression |
| Real browser walkthrough | Issue PO -> see auto-filed APS record -> record receiving -> requester confirms -> see APS payment release become available; inspect both systems' links/history |

## Evidence locations

Procurement: server/orders.mjs act(issue), acknowledge and receive; server/operations-http.mjs purchase-order actions; operations-schema.mjs for additive persistence. APS: routers/requests.py PO validation/snapshot/submission, workflow_policy.py, procurement_adapter.py, procurement_events.py and procurement_financials.py. Current service-vendor work is documented in procurement-vendor-read-integration.md.
