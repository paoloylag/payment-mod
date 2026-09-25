export const guideSections = [
  {
    id: "start",
    number: "01",
    title: "Getting started",
    icon: "?",
    intro: "Follow these menu-by-menu steps to open the correct screen and complete the action available to your role.",
    cards: [
      {
        title: "Create a payment request",
        audiences: ["requestor"],
        path: "Requests → New Request",
        steps: [
          "In the left sidebar, open Requests and select New Request.",
          "Select Reimbursement, Liquidation, Cash Advance, P.O. Payment, or General Payment from the request-type cards.",
          "Complete Request Details, add each Line Item, assign its department or cost center, and attach the requested documents.",
          "Select Save Draft if you need to continue later. Otherwise review the validation messages and select Submit Request.",
        ],
      },
      {
        title: "Resume or remove a draft",
        audiences: ["requestor"],
        path: "Dashboard → Draft Requests → Open Draft",
        steps: [
          "Open Dashboard from the left sidebar and locate the Draft Requests list.",
          "Select the draft request number to reopen the form at its last saved step.",
          "Update the fields, line items, and documents, then select Save Draft or Submit Request.",
          "To discard it, open the draft, select Delete Draft, and confirm the deletion prompt.",
        ],
      },
      {
        title: "Track a submitted request",
        audiences: ["requestor", "department", "executive", "signatory"],
        path: "Overview → Dashboard or Processing → Payment Tracker",
        steps: [
          "Open Dashboard for your assigned items, or open Payment Tracker from the left sidebar.",
          "Enter the request number in Search or use the status and department filters to narrow the list.",
          "Select the request row to open Request Details, then review Status, Current Owner, Aging, and Workflow History.",
          "If the request is returned, use the displayed action to open the editable request and complete the requested correction.",
        ],
      },
    ],
    note: "A permanent payment request number is generated only when a completed draft is submitted.",
  },
  {
    id: "requests",
    number: "02",
    title: "Requests and documents",
    icon: "+",
    intro: "Each payment type shows only the fields and document rules that apply to that transaction.",
    cards: [
      {
        title: "Prepare a reimbursement",
        audiences: ["requestor"],
        path: "Requests → New Request → Reimbursement",
        steps: [
          "Open Requests → New Request, then select Reimbursement.",
          "In Request Details, enter the event or purpose and required payee information.",
          "Under Line Items, select Add Line and enter the merchant, invoice date and number, expense account, department, and amount.",
          "Use the line-item attachment control to upload the invoice or official receipt and proof of payment, then select Submit Request after the totals match.",
        ],
      },
      {
        title: "Prepare a cash advance",
        audiences: ["requestor"],
        path: "Requests → New Request → Cash Advance",
        steps: [
          "Open Requests → New Request, then select Cash Advance.",
          "Enter the approved event or purpose and choose the Event End Date.",
          "Review the automatically displayed Liquidation Due Date, then add the advance breakdown and upload the budget or itinerary.",
          "Select both accountability acknowledgements, review the validation summary, and select Submit Request.",
        ],
      },
      {
        title: "Submit a liquidation",
        audiences: ["requestor"],
        path: "Requests → New Request → Liquidation",
        steps: [
          "Open Requests → New Request, select Liquidation, and choose the related Cash Advance reference.",
          "Select Add Line for every actual expense and complete the merchant, account, department, date, and amount fields.",
          "Upload the invoice or official receipt on its corresponding expense line and review the Advance versus Actual summary.",
          "If the summary shows cash to return, upload the return proof before selecting Submit Request.",
        ],
      },
      {
        title: "Prepare a P.O. payment",
        audiences: ["requestor"],
        path: "Requests → New Request → P.O. Payment",
        steps: [
          "Open Requests → New Request, select P.O. Payment, and choose an approved P.O. reference.",
          "Review the requestor, supplier, department, and amount populated from the selected purchase order.",
          "Open each generated line item and complete its expense account and allocation.",
          "Upload the approved P.O. and billing support, add BIR 2303 when requested, then select Submit Request.",
        ],
      },
      {
        title: "Prepare a general payment",
        audiences: ["requestor"],
        path: "Requests → New Request → General Payment",
        steps: [
          "Open Requests → New Request, then select General Payment.",
          "Complete the payment description and payee fields, then select Add Line for each charge.",
          "Enter the merchant, expense account, cost center, and amount, and attach the billing document or invoice to the line.",
          "Upload any requested quotation, statement of account, or supplier document; verify the total and currency, then select Submit Request.",
        ],
      },
      {
        title: "Correct a returned request",
        audiences: ["requestor"],
        path: "Dashboard → Returned Request → View Request",
        steps: [
          "Open Dashboard and select the returned request, or use View Request from the returned-request email.",
          "Read Reviewer Comment at the top of Request Details and select Edit Returned Request.",
          "Update the identified fields and use Replace Document or Add Document for the affected attachment.",
          "Select Resubmit Request, then open Workflow History to confirm that it returned to the named reviewer.",
        ],
      },
    ],
    note: "Requestors may edit before Document Validation. Later changes require an authorized unlock with a reason and a permanent audit entry.",
  },
  {
    id: "approvals",
    number: "03",
    title: "Reviews and approvals",
    icon: "✓",
    intro: "Approvers act only on requests assigned to their role, department, or identity. Every decision and note becomes part of the audit trail.",
    cards: [
      {
        title: "Complete a department review",
        audiences: ["department"],
        path: "Processing → Approval Queue → Request",
        steps: [
          "Open Processing → Approval Queue and select the request assigned to your department.",
          "Review Request Summary, Line Items, Allocations, and Supporting Documents on Request Details.",
          "Scroll to Department Review and select Approve, Request More Information, or Decline.",
          "For a return or decline, enter the required Reviewer Comment, then select Confirm Decision.",
        ],
      },
      {
        title: "Complete Finance validation",
        audiences: ["finance"],
        path: "Processing → Approval Queue → Document Validation",
        steps: [
          "Open Processing → Approval Queue and select a request marked Awaiting Validation.",
          "Open Document Validation and review each line's merchant, account, department, amount, and attachment.",
          "Select Approve Document for a valid line, or choose Needs Correction and enter a review note.",
          "Complete VAT, EWT, debit, and credit fields; when all validation indicators pass, select Complete Validation.",
        ],
      },
      {
        title: "Review budget and routing",
        audiences: ["finance"],
        path: "Processing → Approval Queue → Finance Budget Review",
        steps: [
          "Open Processing → Approval Queue and select a request marked Finance Budget Review.",
          "Review the Budget Status control, tax summary, accounting entries, and total amount.",
          "Choose Budgeted or Unbudgeted, add the Finance review note, and select Approve and Route.",
          "Confirm the next approver displayed in Workflow History before leaving the request.",
        ],
      },
    ],
    note: "Missing documents, incomplete approvals, invalid references, and unbalanced accounting entries block workflow progression.",
  },
  {
    id: "routing",
    number: "04",
    title: "Approval routing",
    icon: "↗",
    intro: "Routing is based on budget status, amount, request type, and the policy version saved when the request is submitted.",
    cards: [
      {
        title: "Budgeted request",
        audiences: ["finance", "executive"],
        path: "Finance Budget Review → Required Approver",
        steps: [
          "From Approval Queue, open the assigned budgeted request and review the saved amount and Budget Status.",
          "For up to PHP 100,000, the Finance Manager selects Approve; the request proceeds to Voucher Creation.",
          "For PHP 100,000.01 to PHP 300,000, select Approve and Route to send it to the COO; above PHP 300,000 it routes to the President.",
          "After the executive selects Approve and confirms the decision, open Workflow History and verify Voucher Creation is next.",
        ],
      },
      {
        title: "Unbudgeted request",
        audiences: ["finance", "executive"],
        path: "Finance Budget Review → Executive Approval",
        steps: [
          "From Approval Queue, open the assigned request and confirm Budget Status is Unbudgeted.",
          "Review the amount and business justification before selecting Approve and Route.",
          "Requests up to PHP 1,000,000 route to the COO; requests above PHP 1,000,000 route to the Board Member after the applicable review.",
          "Open Workflow History after the action and verify the approver, decision, comment, and next owner.",
        ],
      },
      {
        title: "Cash advance route",
        audiences: ["finance"],
        path: "Department Approval → Finance Validation → Finance Manager",
        steps: [
          "Open Processing → Approval Queue and select the assigned Cash Advance request.",
          "Review Event Dates, Purpose, Advance Breakdown, Supporting Budget, and Liquidation Due Date.",
          "Check the warning banner when an employee cash advance exceeds PHP 40,000 and confirm both accountability acknowledgements.",
          "Enter the Finance Manager comment, select Approve or Return, and confirm the decision.",
        ],
      },
    ],
    note: "Board approval applies only to unbudgeted requests above PHP 1,000,000. A budgeted request above that amount follows the President route unless policy changes.",
  },
  {
    id: "payments",
    number: "05",
    title: "Voucher and payment",
    icon: "₱",
    intro: "The request explains why payment is needed, the voucher records the approved financial treatment, and the payment records how funds were released.",
    cards: [
      {
        title: "Create a payment voucher",
        audiences: ["finance"],
        path: "Approved Request → Voucher Creation",
        steps: [
          "Open Processing → Approval Queue and select an approved request marked Voucher Creation.",
          "Review Approval History, Gross Amount, Tax Deductions, Net Payment, Accounting Entries, and Payee.",
          "In Payment Method, select Check, Bank Transfer (DigiBanker), or Cash and complete the fields that appear.",
          "Select Create Voucher, then open Print Voucher to review the digital approval certification.",
        ],
      },
      {
        title: "Prepare and authorize payment",
        audiences: ["finance", "signatory"],
        path: "Payment Tracker → Bank Processing → Bank Authorization",
        steps: [
          "Open Processing → Payment Tracker, search for the voucher number, and select the payment row.",
          "Open Bank Processing and enter the payment instruction plus the Finance Team Tracker transaction number.",
          "For Check only, enter the check number after approval; then select Submit for Authorization.",
          "An authorized signatory opens the assigned item, selects Authorize or Reject, enters a comment, and uploads signed proof when requested.",
        ],
      },
      {
        title: "Release and complete payment",
        audiences: ["finance"],
        path: "Payment Tracker → Payment Release",
        steps: [
          "Open Processing → Payment Tracker and select an Authorized payment.",
          "Review the payment reference and authorization history, then select Notify Vendor when processing is ready.",
          "For Check or Cash, select Mark Available for Pickup to notify the requestor and payee.",
          "Select Mark Released or Complete Payment, enter the release details, and confirm the recorded Finance actor and timestamp.",
        ],
      },
    ],
    note: "Failed transfers, voided checks, and replacement payments remain separate records. Never overwrite or delete the original attempt.",
  },
  {
    id: "reports",
    number: "06",
    title: "Tracking reporting and controls",
    icon: "▦",
    intro: "Dashboards and reports are role-scoped. Finance records remain searchable after payment release and archival.",
    cards: [
      {
        title: "Review aging and overdue work",
        audiences: ["finance"],
        path: "Dashboard or Payment Tracker",
        steps: [
          "Open Dashboard for summary cards or Processing → Payment Tracker for the complete Finance list.",
          "Use Status, Department, Payment Type, Amount, or Current Owner filters above the table.",
          "Review Aging Days and the Overdue indicator, then select a request row to open its details.",
          "Check Current Owner and Workflow History, then complete or assign the next required follow-up.",
        ],
      },
      {
        title: "Produce a Finance report",
        audiences: ["finance"],
        path: "Payment Tracker → Reports",
        steps: [
          "Open Processing → Payment Tracker, then select Reports.",
          "Choose the Department, Date Range, Status, Payment Type, and Amount filters.",
          "Select Apply Filters and review the result count and transaction rows.",
          "Select Export CSV for Excel or Print / Save PDF for the report layout, then verify the displayed date range.",
        ],
      },
      {
        title: "Investigate an exception",
        audiences: ["finance"],
        path: "Request Detail → Workflow and Audit History",
        steps: [
          "Open Payment Tracker, search for the request number, and select its row.",
          "Expand Workflow and Audit History to review versions, transitions, actors, and reviewer notes.",
          "Open Documents, Payment Attempts, and Notification History to locate the failed item and its support-safe error identifier.",
          "Use the available Return, Retry, Void, or Replacement action; enter a reason and confirm that the original history remains visible.",
        ],
      },
    ],
    note: "All material events, notifications, exports, approvals, and payment updates are recorded and displayed in Asia/Manila (UTC+08:00).",
  },
];

export const guideStages = [
  ["01", "Draft", "Requestor", "Complete the applicable form, line items, allocations, and documents."],
  ["02", "Department approval", "Department Head", "Review the business purpose and departmental charge."],
  ["03", "Document validation", "Finance Associate", "Validate documents, tax treatment, and balanced accounting entries."],
  ["04", "Budget review", "Finance Manager", "Confirm budget status and the required approval route."],
  ["05", "Executive approval", "COO President or Board", "Approve according to the saved amount and budget policy."],
  ["06", "Voucher creation", "Finance Associate", "Create the approved payment and accounting record."],
  ["07", "Payment authorization", "Authorized Signatories", "Authorize the prepared check or bank instruction."],
  ["08", "Release and completion", "Finance and System", "Notify stakeholders, record release, update tracking, and archive."],
];

export const guideStageAudiences = {
  requestor: ["01", "08"],
  department: ["02"],
  executive: ["04", "05"],
  signatory: ["07"],
};
