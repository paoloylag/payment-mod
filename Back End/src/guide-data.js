export const guideSections = [
  {
    id: "start", number: "01", title: "Getting started",
    intro: "Follow these menu-by-menu steps to open the correct screen and complete the action available to your role.",
    cards: [
      { title: "Create a payment request", audiences: ["requestor"], path: "Requests → New Request", steps: ["In the left sidebar, open Requests and select New Request.", "Select Reimbursement, Liquidation, Cash Advance, Purchase Order Payment, or General Payment from the request-type cards.", "Complete Request Details, add each Line Item, assign its department or cost center, and attach the requested documents.", "Select Save Draft if you need to continue later. Otherwise review the validation messages and select Submit Request."] },
      { title: "Resume or remove a draft", audiences: ["requestor"], path: "Dashboard → Draft Requests → Open Draft", steps: ["Open Dashboard from the left sidebar and locate the Draft Requests list.", "Select the draft request number to reopen the form at its last saved step.", "Update the fields, line items, and documents, then select Save Draft or Submit Request.", "To discard it, open the draft, select Delete Draft, and confirm the deletion prompt."] },
      { title: "Track a submitted request", audiences: ["requestor"], path: "Overview → Dashboard or Tracking → My Request Tracker", steps: ["Open Dashboard for recent items, or open My Request Tracker from the left sidebar.", "Enter the request number in Search or use the available status filter to narrow the list.", "Select the request row to review Status, Current Owner, Aging, and Workflow History.", "If the request is returned, open the editable request and complete the requested correction."] },
      { title: "Track an assigned approval", audiences: ["department_head", "coo", "president", "board_member"], path: "Overview → Dashboard or Processing → Approval Queue", steps: ["Open Dashboard for assigned items, or open Approval Queue from the left sidebar.", "Use Search and the available filters to locate the assigned request.", "Select the request row to review Status, Current Owner, amount, and prior Workflow History.", "Complete only the decision available to your role, then verify the recorded outcome and next owner."] },
    ], note: "A permanent payment request number is generated only when a completed draft is submitted.",
  },
  {
    id: "requests", number: "02", title: "Requests and documents",
    intro: "Each payment type shows only the fields and document rules that apply to that transaction.",
    cards: [
      { title: "Prepare a reimbursement", audiences: ["requestor"], path: "Requests → New Request → Reimbursement", steps: ["Open Requests → New Request, then select Reimbursement.", "In Request Details, enter the event or purpose and required payee information.", "Under Line Items, select Add Line and enter the merchant, invoice date and number, expense account, department, and amount.", "Use the line-item attachment control to upload the invoice or official receipt and proof of payment, then select Submit Request after the totals match."] },
      { title: "Prepare a cash advance", audiences: ["requestor"], path: "Requests → New Request → Cash Advance", steps: ["Open Requests → New Request, then select Cash Advance.", "Enter the approved event or purpose and choose the Event End Date.", "Review the automatically displayed Liquidation Due Date, then add the advance breakdown and upload the budget or itinerary.", "Select both accountability acknowledgements, review the validation summary, and select Submit Request."] },
      { title: "Submit a liquidation", audiences: ["requestor"], path: "Requests → New Request → Liquidation", steps: ["Open Requests → New Request, select Liquidation, and choose the related Cash Advance reference.", "Select Add Line for every actual expense and complete the merchant, account, department, date, and amount fields.", "You may attach an invoice or official receipt to its corresponding expense line; original hard copies are submitted to Finance offline.", "If the summary shows cash to return, return it offline and enter the amount returned before selecting Submit Request."] },
      { title: "Prepare a Purchase Order payment", audiences: ["requestor"], path: "Requests → New Request → Purchase Order Payment", steps: ["Open Requests → New Request, select Purchase Order Payment, and choose an approved Purchase Order reference.", "Review the requestor, supplier, department, and amount populated from the selected purchase order.", "Open each generated line item and complete its expense account and allocation.", "Upload the approved Purchase Order and billing support, add BIR 2303 when requested, then select Submit Request."] },
      { title: "Prepare a general payment", audiences: ["requestor"], path: "Requests → New Request → General Payment", steps: ["Open Requests → New Request, then select General Payment.", "Complete the payment description and payee fields, then select Add Line for each charge.", "Enter the merchant, expense account, cost center, and amount, and attach the billing document or invoice to the line.", "Upload any requested quotation, statement of account, or supplier document; verify the total and currency, then select Submit Request."] },
      { title: "Correct a returned request", audiences: ["requestor"], path: "Dashboard → Returned Request → View Request", steps: ["Open Dashboard and select the returned request, or open the in-app return notification.", "Read Reviewer Comment at the top of Request Details and select Edit Returned Request.", "Update the identified fields and use Replace Document or Add Document for the affected attachment.", "Select Resubmit Request, then open Workflow History to confirm that it returned to the named reviewer."] },
    ], note: "Requestors may edit before Document Validation. Later changes require an authorized unlock with a reason and a permanent audit entry.",
  },
  {
    id: "approvals", number: "03", title: "Reviews and approvals",
    intro: "Approvers act only on requests assigned to their role, department, or identity. Every decision and note becomes part of the audit trail.",
    cards: [
      { title: "Complete a department review", audiences: ["department_head"], path: "Processing → Approval Queue → Request", steps: ["Open Processing → Approval Queue and select the request assigned to your department.", "Review Request Summary, Line Items, Allocations, and Supporting Documents on Request Details.", "Scroll to Department Review and select Approve, Request More Information, or Decline.", "For a return or decline, enter the required Reviewer Comment, then select Confirm Decision."] },
      { title: "Complete Finance validation", audiences: ["finance_associate"], path: "Processing → Approval Queue → Document Validation", steps: ["Open Processing → Approval Queue and select a request marked Awaiting Validation.", "Open Document Validation and review each line's merchant, account, department, amount, and attachment.", "Select Approve Document for a valid line, or choose Needs Correction and enter a review note.", "Complete VAT, EWT, debit, and credit fields; when all validation indicators pass, select Complete Validation."] },
      { title: "Review budget and routing", audiences: ["finance_manager"], path: "Processing → Approval Queue → Finance Budget Review", steps: ["Open Processing → Approval Queue and select a request marked Finance Budget Review.", "Review the Budget Status control, tax summary, accounting entries, and total amount.", "Choose Budgeted or Unbudgeted, add the Finance review note, and select Approve and Route.", "Confirm the next approver displayed in Workflow History before leaving the request."] },
    ], note: "Missing documents, incomplete approvals, invalid references, and unbalanced accounting entries block workflow progression.",
  },
  {
    id: "routing", number: "04", title: "Approval routing",
    intro: "Routing is based on budget status, amount, request type, and the policy version saved when the request is submitted.",
    cards: [
      { title: "Route a budgeted request", audiences: ["finance_manager"], path: "Finance Budget Review → Required Approver", steps: ["Open the assigned budgeted request and review the saved amount and Budget Status.", "Approve requests up to PHP 100,000 for Voucher Creation.", "Route requests from PHP 100,000.01 to PHP 300,000 to the COO and requests above PHP 300,000 to the President.", "Open Workflow History and verify the next owner before leaving the request."] },
      { title: "Route an unbudgeted request", audiences: ["finance_manager"], path: "Finance Budget Review → Executive Approval", steps: ["Open the assigned request and confirm Budget Status is Unbudgeted.", "Review the amount and business justification before selecting Approve and Route.", "Unbudgeted requests up to PHP 1,000,000 go to COO approval. Above PHP 1,000,000, the sequence is COO, then President, then Board.", "Open Workflow History and verify the next owner before leaving the request."] },
      { title: "Review a COO approval", audiences: ["coo"], path: "Processing → Approval Queue → COO Approval", steps: ["Open only the request assigned to you in Approval Queue.", "Review its amount, budget status, business justification, documents, and prior approvals.", "Select Approve or Request More Information. Information requests go to Finance Associate and resume this same approval stage after the response.", "Confirm the decision and verify the recorded next owner in Workflow History."] },
      { title: "Review a President approval", audiences: ["president"], path: "Processing → Approval Queue → President Approval", steps: ["Open only the request assigned to you in Approval Queue.", "Review its amount, budget status, business justification, documents, and prior approvals.", "Select Approve or Request More Information. Information requests go to Finance Associate and resume this same approval stage after the response.", "Confirm the decision and verify the recorded next owner in Workflow History."] },
      { title: "Review a Board approval", audiences: ["board_member"], path: "Processing → Approval Queue → Board Approval", steps: ["Open the assigned unbudgeted request above PHP 1,000,000.", "Review its amount, business justification, documents, and prior approvals.", "Select Approve or Request More Information. Information requests go to Finance Associate and resume this same approval stage after the response.", "Confirm the decision and verify the recorded next owner in Workflow History."] },
      { title: "Review a cash advance", audiences: ["finance_manager"], path: "Department Approval → Finance Validation → Finance Manager", steps: ["Open Processing → Approval Queue and select the assigned Cash Advance request.", "Review Event Dates, Purpose, Advance Breakdown, Supporting Budget, and Liquidation Due Date.", "Check the warning banner when an employee cash advance exceeds PHP 40,000 and confirm both accountability acknowledgements.", "Enter the Finance Manager comment, select Approve or Return, and confirm the decision."] },
    ], note: "Board approval applies only to unbudgeted requests above PHP 1,000,000. A budgeted request above that amount follows the President route unless policy changes.",
  },
  {
    id: "payments", number: "05", title: "Voucher and payment",
    intro: "The request explains why payment is needed, the voucher records the approved financial treatment, and the payment records how funds were released.",
    cards: [
      { title: "Create a payment voucher", audiences: ["finance_associate"], path: "Approved Request → Accounting workbench → Voucher and payment release", steps: ["Finance Associate reviews the saved calculation and prepares balanced accounting entries.", "After final request approval, Finance Manager posts the accounting.", "Finance Associate selects Prepare voucher draft. Finance Manager reviews the certification and issues the official voucher.", "Open Print issued voucher to review the frozen amount, official number, certification and approval trail."] },
      { title: "Prepare a payment for release", audiences: ["finance_associate"], path: "Request Details → Voucher and payment release", steps: ["Finance Associate opens an issued voucher and prepares one or more payment line items.", "Enter each line amount, payment method and unique reference, without assigning a signatory.", "Ensure the total prepared amount does not exceed the voucher amount available for preparation.", "Save the payment lines. Finance can proceed directly to release with supporting evidence."] },
      { title: "Release and complete payment", audiences: ["finance_associate"], path: "Request Details → Payment lines → Release and clearing", steps: ["Finance Associate reviews the independently authorized payment line.", "For a check, record that it is ready for pickup before release. Bank transfers and cash use the authorized release path.", "Upload release evidence and record the release date, receiving bank or office, recipient and reason.", "Finance Manager independently records clearing with its evidence. Review net released, cleared and remaining amounts in Financial reconciliation."] },
    ], note: "Failed transfers, voided checks, and replacement payments remain separate records. Never overwrite or delete the original attempt.",
  },
  {
    id: "reports", number: "06", title: "Tracking reporting and controls",
    intro: "Dashboards and reports are role-scoped. Finance records remain searchable after payment release and archival.",
    cards: [
      { title: "Review elapsed-time aging", audiences: ["finance_associate", "finance_manager"], path: "Tracker and Reports → Financial reconciliation", steps: ["Choose the relevant Finance report and generate it for the current filters.", "Use the elapsed-time bucket to group requests by time since submission.", "These buckets describe elapsed time only. They do not establish an SLA or an overdue deadline.", "Open the request link to review its current owner, history and any outstanding Finance action."] },
      { title: "Produce a Finance report", audiences: ["finance_associate", "finance_manager"], path: "Tracker and Reports → Financial reconciliation", steps: ["Choose Payment reconciliation, Cash advance reconciliation, Fund returns or Payment recoveries.", "Set search, department, currency, submission dates, state or elapsed-time filters, then Generate report.", "Review the per-currency totals across all result pages and follow the request links when needed.", "Export Excel or Print report. Request gross-amount reports remain available from Dashboard filters."] },
      { title: "Investigate an exception", audiences: ["finance_associate", "finance_manager"], path: "Request Detail → Workflow and Audit History", steps: ["Open Request Tracker, search for the request number, and select its row.", "Expand Workflow and Audit History to review versions, transitions, actors, and reviewer notes.", "Open Documents, Payment Attempts, and Notification History to locate the failed item and its support-safe error identifier.", "Use the available Return, Retry, Void, or Replacement action; enter a reason and confirm that the original history remains visible."] },
    ], note: "Request approvals and financial actions retain their recorded history. Each report states its generation time, filters and amount definitions.",
  },
  {
    id: "administration", number: "07", title: "System administration",
    intro: "Administrative procedures are shown only to System Administrators.",
    cards: [
      { title: "Manage users", audiences: ["system_administrator"], path: "Administration → Users", steps: ["Open Administration and select the Users tab.", "Select + User to create an account, then assign its department, manager, and required role.", "Use the row action menu to edit, suspend, reactivate, or delete an eligible account.", "Verify the saved assignment and audit entry before leaving the page."] },
      { title: "Manage roles and permissions", audiences: ["system_administrator"], path: "Administration → Roles & Permissions", steps: ["Open Administration and select Roles & Permissions.", "Create or edit only the role and permission records required by the approved access design.", "Review the permission assignment before saving it.", "Confirm the change is recorded in the audit history."] },
      { title: "Manage departments", audiences: ["system_administrator"], path: "Administration → Departments", steps: ["Open Administration and select Departments.", "Select + Department to add an approved display name and official code.", "Use the row action menu to edit or deactivate an existing department.", "Reassign linked users before attempting a deletion."] },
    ], note: "Apply least-privilege access. Administrative changes must remain attributable through the audit trail.",
  },
  {
    id: "reconciliation", number: "08", title: "Finance reconciliation",
    intro: "Review current payment and advance balances against their saved Finance records.",
    cards: [
      { title: "Reconcile payments and advances", audiences: ["finance_associate", "finance_manager"], path: "Tracker and Reports → Financial reconciliation", steps: ["Choose Payment reconciliation, Cash advance reconciliation, Fund returns or Payment recoveries.", "Apply search, submission dates, currency, department, state and elapsed-time filters, then Generate report.", "Review totals across all pages. Payment amounts are net voucher amounts. Advance outstanding subtracts posted liquidation and verified returns only.", "Open a request from its report row to inspect the voucher, line history and supporting evidence. Export Excel or print the same applied filters."] },
    ], note: "Pending receipts and recoveries remain outstanding until independently verified. Elapsed-time buckets are informational, not SLA overdue deadlines. Finance configures and activates setup before processing requests; business acceptance is recorded by Finance Manager.",
  },
];

export const guideStages = [
  ["01", "Draft", "Requestor", "Complete the applicable form, line items, allocations, and documents."],
  ["02", "Department approval", "Department Head", "Review the business purpose and departmental charge."],
  ["03", "Document validation", "Finance Associate", "Validate documents, tax treatment, and balanced accounting entries."],
  ["04", "Budget review", "Finance Manager", "Confirm budget status and the required approval route."],
  ["05", "Executive approval", "COO President or Board", "Approve according to the saved amount and budget policy."],
  ["06", "Voucher creation", "Finance Associate", "Create the approved payment and accounting record."],
  ["07", "Payment authorization", "Authorized Signatories", "Authorize the prepared check or manual payment instruction."],
  ["08", "Release and completion", "Finance Associate and Finance Manager", "Record release with evidence, verify clearing, and reconcile payments and advance settlements."],
];

export const guideStageAudiences = {
  requestor: ["01", "08"],
  department_head: ["02"],
  finance_associate: ["03", "06", "08"],
  finance_manager: ["04", "08"],
  coo: ["05"],
  president: ["05"],
  board_member: ["05"],
  authorized_signatory: ["07"],
  system_administrator: [],
};
