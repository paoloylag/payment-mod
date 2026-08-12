# Payment Module Database: Plain-Language Guide

## What the database is for

The database will be the official record of every payment request from the moment it is drafted until the payment is completed.

It will answer practical questions such as:

- Who requested the payment?
- Which department and cost center will be charged?
- Who will receive the payment?
- What is being paid for?
- Which receipts, invoices, quotations, or other documents were submitted?
- Who reviewed and approved the request?
- What taxes and accounting entries were applied?
- When was the payment prepared, authorized, released, and completed?
- Who made each change, and when did it happen?

The recommended database is PostgreSQL, a widely used relational database suited to structured financial records and audit trails.

## The main payment record

Every transaction begins with one payment request. This is the main record that connects all other information.

The request contains:

- a unique request number, such as `RMB-2026-0161`;
- the type of request;
- the requestor and department;
- the vendor or other payee;
- the purpose of the payment;
- the currency and total amount;
- whether it is budgeted, unbudgeted, or over budget;
- its current status and workflow step; and
- its submission and completion dates.

The database will use a separate internal ID for reliability. Employees will continue to see and search using the familiar formatted request number.

## Supported request types

The database will support the five request types already represented in the prototype:

1. Reimbursement
2. Liquidation
3. Cash Advance
4. Purchase Order Payment
5. General Payment Request

These requests share common information, but each type also has special fields.

For example, a cash advance records the event dates and liquidation deadline. A liquidation records the original advance, the amount spent, and any amount returned. A PO payment records the purchase order and supplier invoice. Keeping these details separate prevents the main request record from becoming cluttered with fields that do not apply.

## Expense lines and cost centers

A payment request may contain one or more expense lines. Each line can record:

- the transaction date;
- a receipt, invoice, or reference number;
- the merchant or supplier;
- a description of the expense;
- the expense account;
- the amount and currency; and
- the department or cost center to charge.

A single expense may eventually be divided among several departments or cost centers. The database will therefore support multiple allocations for one expense line.

Before a request can be submitted, the system should confirm that:

- all line items add up to the request total; and
- all department or cost-center allocations add up to their corresponding line item.

## Supporting documents

Receipts, invoices, quotations, statements of account, proof of payment, and similar files will be kept in secure file storage. The database will keep information about each file, including:

- its filename and document type;
- which request or expense line it belongs to;
- who uploaded it and when;
- whether it is required;
- whether a hard copy, soft copy, or both were received; and
- the result of Finance's review.

The database will preserve every document review. If a document is returned for correction and reviewed again, both decisions remain in the history.

## How approvals will work

The database will maintain two views of the approval process:

- the current step, used for dashboards and queues; and
- the complete event history, used for audit and investigation.

For every approval, it will record the assigned role or person, the decision, the review note, and the decision time.

The initial approval rules represented in the prototype are:

- Cash advances require Finance Manager approval and are flagged above PHP 40,000.
- Budgeted payments up to PHP 100,000 may be approved by the Finance Manager.
- Budgeted payments from PHP 100,000.01 to PHP 300,000 require COO approval.
- Budgeted payments above PHP 300,000 require President approval.
- Unbudgeted payments up to PHP 1,000,000 require COO approval.
- Unbudgeted payments above PHP 1,000,000 require Board Member approval after the applicable executive review.

The exact policy used for a submitted request will be saved with it. If the company changes an approval threshold later, requests already in progress will keep their original route unless an authorized person deliberately reroutes them.

## Finance validation

During document validation, Finance will record:

- the VAT classification;
- the EWT code, rate, and amount;
- the resulting net payment;
- whether hard and soft copies were received;
- the review result for every supporting document or expense line;
- accounting debit and credit entries; and
- the Finance reviewer's notes and completion time.

The system will not allow Finance validation to finish unless the required documents are valid and total debits equal total credits.

Tax calculations will be saved as they were approved at the time. An older payment will not silently change if the organization updates its tax rules later.

## Voucher and actual payment

The request, voucher, and payment will be separate but connected records.

This distinction is important:

- The request explains why money should be paid.
- The voucher documents the approved accounting and payment amount.
- The payment records how the money was actually released.

Separating them allows the system to handle situations such as a failed bank transfer, a voided check, a replacement check, or a payment divided into multiple releases without deleting the original history.

For each payment, the database can record:

- bank transfer, check, or cash as the payment method;
- the amount and currency;
- the check number or external bank reference;
- its preparation and authorization status;
- when it became available for pickup;
- when it was released or cleared; and
- any failed or voided attempt.

Authorized signatory decisions will be recorded separately so it is clear who approved the release and in what order.

## Philippine Time

All timestamps must use Philippine Time: `Asia/Manila`, which is UTC+08:00.

This applies to:

- requests and submissions;
- document uploads and reviews;
- approval assignments and decisions;
- workflow changes;
- voucher preparation and posting;
- payment authorization, release, pickup, and completion;
- emails and system notifications;
- reports, exports, and audit logs.

A timestamp sent by the API should visibly include the Philippine offset, for example:

```text
2026-08-12T14:30:00+08:00
```

The system must explicitly use `Asia/Manila` rather than relying on the time zone configured on an employee's computer or on the server. Date-only information, such as an event date or liquidation deadline, will remain a calendar date and will not be converted between time zones.

## Audit trail

The database will retain a permanent trail of important actions, including:

- creating, submitting, editing, returning, or resubmitting a request;
- unlocking a request for an urgent authorized edit;
- uploading, replacing, reviewing, or removing a document;
- assigning, delegating, approving, returning, or rejecting an approval;
- completing Finance validation;
- creating, posting, or voiding a voucher;
- preparing, authorizing, releasing, clearing, failing, or voiding a payment;
- changing vendor banking information;
- changing user permissions, approval policies, or tax rules; and
- attempting or completing an email notification.

Each audit entry will identify the person or system responsible, what changed, the affected record, the reason when applicable, and the exact Philippine Time of the action.

Financial and audit history should never be permanently deleted through normal application functions.

## Security controls

Access will depend on a person's role and responsibilities.

- Requestors can work with their own requests and other records explicitly made available to them.
- Department Heads can review requests routed to their department.
- Finance Associates can validate documents and prepare authorized finance records.
- Finance Managers and executives can act on approvals assigned to them.
- Payment preparation and payment authorization can be separated to support segregation of duties.

Bank account information will be encrypted and masked. Only employees who need the complete details for payment processing will be able to view them.

The database will not store online banking passwords, PINs, one-time passwords, or digital signing credentials.

## Notifications and integrations

Email delivery will be tracked separately from the business event that requested it. This means the system can show whether an email is queued, sent, retried, or failed without changing the payment's approval status.

The same approach will support future connections to:

- the purchase-order or procurement system;
- an accounting or ERP system;
- bank payment services; and
- document or file-storage services.

Unique processing keys will prevent a retry from accidentally sending the same email twice or creating the same payment instruction twice.

## Recommended implementation sequence

### Phase 1: Requests and approvals

Build the user, department, vendor, request, expense-line, document, approval, workflow-history, and audit records.

### Phase 2: Finance processing

Add document reviews, taxes, Finance validation, accounting entries, and payment vouchers.

### Phase 3: Payment operations

Add payment methods, bank accounts, authorized signatories, pickup and release tracking, and notification delivery.

### Phase 4: Integrations and configurable policies

Connect the module to purchasing, accounting, banking, and email services. Allow authorized administrators to maintain approval thresholds and tax rules with version history.

## Decisions still needed

Before backend development begins, the project owners should decide:

- whether to use a custom PostgreSQL API, Supabase, or another PostgreSQL platform;
- whether vendor and PO records originate here or in another company system;
- whether the module must support multiple companies or branches;
- how foreign-currency payments and exchange rates will be approved;
- whether one request can produce more than one voucher;
- who may cancel, void, reopen, return, or urgently unlock requests;
- how long documents and audit records must be retained; and
- which payment duties must be performed by different employees.

These decisions will refine the implementation, but the overall structure described in this guide can remain the same.

## Summary

The database will provide one connected, traceable record from request creation through final payment. It is designed to give employees a clear workflow while giving Finance and management the controls, history, and reporting required for reliable payment operations.

The technical schema and implementation notes are available in [Payment Module Database Design](database-design.md).
