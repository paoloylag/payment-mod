# Finance confirmation request — Phases 02–04

Date prepared: 2026-09-28  
Purpose: obtain the remaining Finance decisions needed to close Master Data, Payment Requests, and Documents for local development without repeated clarification rounds.

## How to respond

For every numbered item, Finance may write `Approve recommended default` or replace the proposed answer. If an answer varies by request type, department, supplier type, amount, or date, provide the complete exception table. Please name the policy owner and effective date for each approved rule. Supporting spreadsheets may be attached if they contain the requested stable code, display name, status, and effective dates.

## 1. Cost centers and cross-department charging

**Current design:** each request line has exactly one cost center. A request may charge multiple departments by using separate lines. Split percentages within one line are not supported.

Please confirm:

1. Effective date for the eight initial cost centers: OCP, PNC, OOG, DT, ACAD, OPS, FIN, and MKTG.
2. Whether a requestor may charge a cost center outside their home department.
3. If yes, whether the charged department head must approve each affected line or whether one primary department approval is sufficient.
4. Whether inactive cost centers remain visible on historical requests but unavailable for new requests.
5. Who may create, rename, deactivate, and reactivate cost centers.

**Recommended default:** activate all eight on the approved go-live date; allow cross-department charging only with approval from every charged department; retain inactive values on historical records; Finance Manager and System Administrator may maintain them.

## 2. Authoritative Chart of Accounts

QuickBooks import/export is deferred, but APS needs stable internal accounts for request lines.

Please supply one row per account with:

- stable internal code;
- official display name and optional description;
- account type;
- normal balance;
- posting or parent/group status;
- parent account code, if applicable;
- active/inactive status;
- effective-from date and optional effective-to date;
- request types or departments allowed to use it, if restricted;
- Finance owner responsible for future changes.

Please also confirm whether Finance may rename an account without changing its code and whether used accounts may only be deactivated, never deleted.

**Recommended default:** codes are immutable; names may change with audit history; accounts referenced by a request cannot be deleted; inactive accounts remain on historical records and are excluded from new selections.

## 3. Tax codes, VAT, and EWT

Please provide a complete tax table containing:

- stable code and display name;
- VAT classification and exact percentage;
- EWT classification and exact percentage;
- inclusive or exclusive calculation basis;
- rounding precision and rounding method;
- effective-from and effective-to dates;
- supplier/request/account conditions that make the code applicable;
- whether users select the code or Finance assigns it during validation;
- treatment of zero-rated, exempt, non-VAT, and mixed cases;
- whether VAT and EWT can both apply to one line;
- required supporting document or supplier tax status;
- replacement/superseding code when a rate expires.

Please include two worked examples for every non-zero rate showing gross amount, taxable base, VAT, EWT, and net payable.

**Recommended default until supplied:** retain tax master-data capability but do not calculate or post authoritative tax amounts automatically; Finance selects/reviews tax treatment during validation.

## 4. Vendor and new-supplier data from Procurement

Please confirm the Procurement owner and provide:

- sandbox and production base URLs;
- authentication method and credential owner;
- immutable vendor ID and branch/site ID semantics;
- search parameters, pagination, sorting, and filtering;
- vendor active/blocked/incomplete statuses and payment eligibility rules;
- exact `new supplier` indicator and when it stops being new;
- contacts, default currency, default payment method, tax ID, and document metadata fields;
- document type codes and secure document retrieval method;
- response/error schema, rate limits, timeouts, retry guidance, and availability expectations;
- update/webhook strategy, or confirmation that APS always reads on demand;
- sandbox credentials and representative active, inactive, blocked, incomplete, and new-supplier fixtures.

Bank-account fields will be discarded and must not be used by APS.

**Recommended default:** Procurement is the source of truth; APS stores the immutable external ID and a safe transaction-time snapshot; unavailable Procurement data prevents P.O. submission but does not alter historical requests.

## 5. Reimbursement invoice-age policy

Current guidance says invoices should be submitted within 30 days of the invoice date.

Please choose:

- hard block after 30 calendar days;
- accept with a Finance-review warning;
- no system enforcement; or
- a different number of calendar/business days.

Also specify who may override the rule, the required reason, whether the age is measured at draft creation or submission, and how weekends/holidays are treated.

**Recommended default:** accept with a visible Finance-review warning, calculated on submission using calendar days; never silently reject an otherwise valid claim; store any Finance disposition in the audit history.

## 6. Reimbursement supporting documents

Already confirmed and being implemented: Invoice is required and Proof of Payment is required for every Reimbursement line. A file attached to one line cannot satisfy another line.

Please confirm whether **Billing / Quotation / Statement of Account** remains:

- conditional when available;
- always required;
- required only when no invoice exists; or
- removed from Reimbursement requirements.

Also confirm whether one document may serve as both Invoice and Proof of Payment, or whether separate document classifications are mandatory.

**Recommended default:** Billing/Quotation/SOA remains conditional and non-blocking; Invoice and Proof of Payment are separately classified even when contained in one PDF, requiring Finance to accept the document under both types if dual use is allowed.

## 7. P.O. Payment document conditions

Approved P.O. and Quotation/Contract will come from Procurement. Please define:

1. When Delivery Receipt is required: goods only, services with completion evidence, partial deliveries, or another rule.
2. Whether missing Delivery Receipt blocks submission or creates a warning.
3. Whether Business Permit is required for every new supplier or only specified vendor types/amounts.
4. Whether Procurement-hosted documents satisfy APS requirements without re-upload.
5. Whether Invoice remains optional and Billing/SOA/Quotation remains required after Procurement integration.

**Recommended default:** Delivery Receipt blocks submission for delivered goods and is conditional for services; Business Permit is required when Procurement marks the supplier as new; authoritative Procurement documents satisfy the requirement by immutable reference plus accessible metadata.

## 8. Finance role structure and segregation of duties

Please confirm whether these are separate APS roles or work assignments under `Finance Associate`:

- Finance Officer;
- Finance Associate — Accounts Payable;
- Finance Associate — Collections.

For each, specify request visibility, document validation, tax/account coding, return/disapprove ability, cash-release logging, reporting, master-data access, and whether the user may validate a request they created.

**Recommended default:** keep one Finance Associate role with queue/team assignment metadata; prevent self-validation; reserve configuration, overrides, and final Finance administration for Finance Manager; use separate roles only where permissions materially differ.

## 9. Returned-request correction controls

The proposed UI lets a reviewer select the exact sections, line items, or documents requiring revision. Unselected content remains locked. An authorized reopen can select `Entire request`.

Please confirm:

- reviewers allowed to return a request;
- users allowed to reopen a cancelled/locked request;
- selectable correction categories;
- whether changing amount, cost center, vendor, currency, tax, or documents invalidates prior approvals;
- whether corrected requests return to the previous reviewer or restart Department approval;
- whether a return note is mandatory per selected target or one overall note is sufficient;
- maximum number of return cycles, if any.

**Recommended default:** one mandatory overall note plus optional per-target notes; material financial changes restart Department approval and Finance validation; document-only replacement returns to the previous validation step; no hard cycle limit, but every cycle is audited.

## 10. Reimbursement batch schedule

Already configured: Finance Manager/System Administrator may set monthly cutoff days; Finance Associate has view-only access; the initial schedule is the 15th and 30th; nonexistent dates use month-end; late submissions move to the next batch.

Please confirm:

- whether cutoffs use calendar or business days;
- exact cutoff time and Asia/Manila timezone;
- weekend/holiday handling;
- whether a Finance Manager may manually move a request between open future batches;
- whether configuration changes affect already-assigned requests;
- whether emergency/off-cycle batches are allowed and who approves them.

**Recommended default:** calendar dates at 5:00 PM Asia/Manila; weekend/holiday batches move to the next business day; assigned requests do not move when settings change; Finance Manager may create an audited off-cycle batch or manually reassign before processing starts.

## 11. Offline Cash Advance release and liquidation return

APS will not initiate, verify, or connect to any bank. Please confirm the fields Finance records when cash is released offline:

- released/not released status;
- release date and time;
- Finance actor;
- releasing bank name or `Cash`;
- optional check/transaction/offline reference;
- optional note;
- recipient acknowledgment requirement.

For liquidation, APS records the amount returned but no Proof of Return upload. Please confirm who records/verifies that amount and whether it must equal the calculated excess before liquidation completes.

**Recommended default:** Finance records the release; requestors cannot mark their own release; returned amount must equal the calculated excess within currency precision; Finance may correct it only with an audited reason.

## 12. Manual Finance document checks

Please identify which checks are mandatory attestations during document validation:

- invoice name matches vendor/payee;
- TIN matches vendor record;
- invoice number/date and duplicate warning reviewed;
- no prohibited alterations;
- original/hard copy received where required;
- thermal receipt photocopy/scanned preservation received;
- amount and currency match the request line;
- document is readable and complete.

For every mandatory check, specify applicable request/document types, whether failure blocks validation, permitted waiver role, and required waiver reason.

**Recommended default:** implement these as explicit manual checkboxes with actor/time evidence; failures block validation unless a Finance Manager records a reasoned waiver. OCR may assist later but cannot make the approval decision.

## 13. Decisions intentionally deferred or outside scope

Please acknowledge that these will not block Phases 02–04 local closeout:

- QuickBooks mapping/import/export;
- payroll-deduction execution and Cash Advance exception approval;
- credit-card module;
- bank connection or electronic settlement verification;
- production AWS/IAM/encryption/monitoring configuration;
- malware-scanning provider and fail-open/fail-closed policy;
- formal retention, archive tier, legal hold, and S3 lifecycle policy;
- production SAML, email, Procurement/Vendor credentials, and hosted infrastructure validation.

## Requested approval record

Please return:

- respondent name and Finance role;
- approval date;
- answers to items 1–12;
- attached reference tables and policy documents;
- list of answers that are temporary;
- owner and target date for every deferred answer;
- explicit confirmation that item 13 may be deferred without blocking local-development validation.
