# Finance Orientation Findings

Source: `C:\Users\Paolo Ylag\Downloads\Orientation from Finance Team.pdf`
Source creation date: 2026-09-24
Reviewed: 2026-09-25
Review purpose: Reconcile Finance guidance with pending Phase 02, Phase 03, and Phase 04 requirements.

## Confirmed requirements

### Submission timing and assignment

- Payment requests should be submitted at least 15 days before the required payment date.
- The summary slide restates this as at least two weeks. Use 15 calendar days as the more specific rule unless Finance confirms business days or a different interpretation.
- PHP transactions are coordinated with Rhinarae G. Francisco (Rhee), Finance Associate - Accounts Payable.
- USD and other-currency transactions are coordinated with Vanessa D. Guinoo (Vane), Finance Associate - Collections.

### Cash Advance and Liquidation

- A staff member may hold only one cash advance at a time.
- A cash advance is limited to PHP 40,000.
- Liquidation is due within 15 days after the event or project.
- Excess cash must be returned to LCI.
- Unliquidated or unsubstantiated cash advances may be deducted from payroll.
- The accomplished Liquidation Form must be submitted with complete official invoices.

These findings resolve the previously pending Phase 03 questions about the amount limit, one-outstanding-advance policy, and liquidation deadline. Owner direction on 2026-09-25 selected hard submission enforcement for the PHP 40,000 cap and exact 15-calendar-day deadline. The local outstanding definition is a submitted Cash Advance without a submitted Liquidation referencing it. Payroll-deduction processing and exception approval remain later workflow decisions.

### Reimbursement and Petty Cash

- Reimbursement processing follows the 15th and 30th batch cutoffs each month, with more frequent processing allowed when necessary.
- Reimbursement invoices should be submitted within 30 days of the invoice date.
- Transactions below PHP 3,000 may be paid or reimbursed through petty cash.
- Petty Cash remains outside the current module scope. The product decision is to keep low-value expenses under the normal Reimbursement workflow without a Petty Cash redirect or handling option.

### Credit Card charges

- Credit-card invoices must be submitted within seven days after receipt.
- The credit-card cutoff is the 5th of each month.
- The payment deadline is the 28th of each month.
- Credit Card Payments remain outside the current module scope and should be retained as a future-module requirement.

### Invoice and receipt compliance

- Invoices and receipts must be issued to `The Leadership, Innovation, Faith and Excellence Academy International Inc.`
- The required TIN is `265-999-997-00000`.
- Invoices and receipts must have no erasures or unauthorized alterations.
- Physical invoices must be submitted to Finance with the payment request.
- Thermal receipts should be photocopied immediately before they fade.

The application can display and record these checks, but automated document-content verification would require OCR/extraction rules and confidence/error handling that are not currently planned.

## Supporting-document matrix supplied by Finance

| Request type | Finance source requirement | Current implementation difference |
|---|---|---|
| Cash Advance | Cash Advance Request Form | The system request form satisfies this requirement. No separately uploaded or signed copy is required. Cash Advance remains non-blocking for document uploads. |
| Reimbursement | Reimbursement Form; Invoices / Receipts | Confirmed on 2026-09-29: every Reimbursement line requires its own invoice or receipt attachment and Proof of Payment. There are no separate request-level Invoice or Billing / Quotation / SOA requirements. |
| P.O. Payment | Approved P.O.; Billing Invoice / Statement of Account; Quotation / Contract; Delivery Receipt when applicable; BIR 2303 and Business Permit for new suppliers | Approved P.O. and Quotation/Contract will come from Procurement. Delivery Receipt and Business Permit are added as conditional Payment Module document types. |
| Other Payments / General Payment | Payment Request Form; Billing / Invoice / Contract / Service Agreement; BIR 2303 and Business Permit for new suppliers | The system request form satisfies the form requirement. Finance subsequently confirmed that APS requires an uploaded Billing / SOA / Quotation file and additionally requires BIR 2303 when the request is marked as a new supplier. Other vendor data may still come from Procurement. |
| Liquidation | Accomplished Liquidation Form with complete official invoices, stated on the Cash Advance guidance slide | The system request form satisfies the form requirement. Breakdown-line receipt uploads remain optional because original hard copies are submitted offline. Proof of Return is omitted; the amount returned offline is recorded instead. |

Reimbursement supporting documents are implemented per line. Billing / Quotation / SOA applies to General Payments, not Reimbursements.

## Workflow and approval findings

The Finance workflow is:

1. Need identified.
2. Prepare payment request.
3. Attach supporting documents.
4. Department approval.
5. If rejected, return to the requestor for revisions and repeat Department approval.
6. Finance review and validation.
7. If incomplete or non-compliant, return for completion or correction of documents and repeat Finance review.
8. Payment approval.
9. If rejected, return for additional information or documents and repeat Payment approval.
10. Payment processing.
11. Payment release.

The sample form identifies Requestor and Immediate Supervisor / Department Head signatures, Finance Officer review, Finance Manager approval, and Managing Director approval. The current role model has no role named `Managing Director`; Finance must confirm whether it maps to COO, President, or a new role and when that approval is required.

## Legacy form fields confirmed

- Requestor name.
- Department.
- Date.
- Event / Purpose.
- Check-payment indicator.
- Voucher number for Finance use only.
- Breakdown columns: Invoice Date, Invoice Number, Vendor / Merchant, Particulars, and Amount.
- Prepared/checked signatures for Requestor and Immediate Supervisor / Department Head.

The current system adds cost center, currency, expense-account, and structured document information. Nothing in the Finance PDF requires those richer fields to be removed.

## Pending clarifications after review

1. Partially resolved: late Reimbursements are accepted and carried into the next configured batch rather than blocked. The existing 15-day guidance remains calendar-day based unless Finance changes it.
2. Resolved for the initial implementation: currency does not route a request to a named Finance Associate. It remains stored with the amount and the request enters the normal Finance queue.
3. Resolved for local development: a submitted Cash Advance remains outstanding until a submitted Liquidation references it.
4. Resolved for local development: PHP 40,000 is a hard submission limit; an exception workflow is not implemented.
5. Resolved for local development: the deadline is exactly 15 calendar days after the event end date.
6. Confirm the offline workflow for returning excess cash; the Payment Module records the amount returned and does not require Proof of Return.
7. Deferred: payroll-deduction execution is outside the current implementation.
8. Should invoices older than 30 days block Reimbursement submission or generate a Finance-review warning?
9. Resolved: keep transactions below PHP 3,000 under the normal Reimbursement workflow. Do not expose a Petty Cash redirect or handling-route option.
10. Resolved: every Reimbursement line must include its invoice or receipt and Proof of Payment. No separate request-level Billing / Quotation / SOA upload is required.
11. Resolved: system-generated request forms satisfy the named `Form` requirements; no uploaded signed copies are required.
12. For P.O. Payment, confirm how Procurement identifies a new supplier so the conditional Business Permit requirement can be evaluated automatically.
13. Define when Delivery Receipt is applicable and whether its absence should block submission or create a warning.
14. Resolved: Proof of Return is omitted; the amount returned offline is recorded in the Liquidation.
15. Resolved: `Managing Director` is not an approval role in this module. Only the explicitly configured approver roles participate in routing.
16. Confirm whether Finance Officer, Finance Associate - Accounts Payable, and Finance Associate - Collections are assignments within the existing Finance Associate role or separate roles.
17. Resolved: the reimbursement schedule is configurable. Finance Associates can view it; Finance Managers and System Administrators can change it with audit history. The initial cutoffs are the 15th and 30th, using month-end when necessary.
18. Confirm whether the credit-card guidance will remain a future module or should be represented now as informational policy.
19. Confirm whether invoice-name, TIN, alteration, physical-copy, and thermal-receipt checks are manual Finance attestations or candidates for later OCR-assisted validation.

## Impact on the current phases

- Phase 02: No cost-center, account, VAT/EWT, or vendor API contract answers were supplied. Those pending items remain open.
- Phase 03: Cash Advance amount, outstanding-advance, and liquidation-deadline rules are implemented and automated.
  Reimbursement timing and low-value Reimbursement guidance are displayed as nonblocking information. Currency assignment,
  configurable batching, late-request handling, and the future credit-card module remain pending decisions.
- Phase 04: Cash Advance and Liquidation remain non-blocking for uploads; their system forms satisfy the form requirement. Liquidation receipts may be attached per line but hard copies are submitted offline. P.O. Payment has conditional Delivery Receipt and Business Permit rules. Reimbursement invoice/receipt and Proof of Payment files are required per line, with no separate request-level Billing / Quotation / SOA rule.
- Phase 05: The workflow confirms separate Department approval, Finance review/validation, Payment approval, correction loops, processing, and release. Approval-role and threshold mapping remain pending.
- Later phases: Reimbursement batching, payment scheduling, physical-copy compliance, and operational assignment may affect Finance queues, dashboards, notifications, and reports.
