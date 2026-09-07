export const guideSections = [
  {
    id: "start",
    number: "01",
    title: "Getting started",
    icon: "?",
    intro: "Choose the procedure that matches what you need to do. Menus and actions depend on your assigned role.",
    cards: [
      {
        title: "Create a payment request",
        audiences: ["requestor"],
        path: "Requests → New Request",
        steps: [
          "Choose Reimbursement, Liquidation, Cash Advance, P.O. Payment, or General Payment.",
          "Complete the request details and add every expense line.",
          "Assign the department or cost center for each line and upload the required documents.",
          "Save the draft, review the validation preview, then submit when the request is complete.",
        ],
      },
      {
        title: "Resume or remove a draft",
        audiences: ["requestor"],
        path: "Requests → My Drafts",
        steps: [
          "Open a saved draft owned by you.",
          "Continue the form; auto-save preserves eligible changes.",
          "Submit only after all required fields and documents pass validation.",
          "Use Delete Draft only when the unfinished request is no longer needed.",
        ],
      },
      {
        title: "Track a submitted request",
        audiences: ["requestor", "department", "executive", "signatory"],
        path: "Overview → Dashboard or Processing → Payment Tracker",
        steps: [
          "Search for the payment request number or select the request from a visible queue.",
          "Review its current status, owner, aging, and workflow history.",
          "Open the full request to see documents, decisions, and payment details.",
          "Follow the action shown for returned requests or missing documents.",
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
          "Enter the event or purpose and the expense details.",
          "Record the merchant, invoice date and number, expense account, department, and amount per line.",
          "Attach the BIR-recognized invoice or official receipt and proof of payment.",
          "Confirm that the line-item total matches the request total before submission.",
        ],
      },
      {
        title: "Prepare a cash advance",
        audiences: ["requestor"],
        path: "Requests → New Request → Cash Advance",
        steps: [
          "Enter the approved event or purpose and its final date.",
          "Review the system-calculated liquidation date, which is 15 calendar days after the event ends.",
          "Add the advance breakdown and supporting budget or itinerary.",
          "Acknowledge accountability and the authority-to-deduct requirement before submission.",
        ],
      },
      {
        title: "Submit a liquidation",
        audiences: ["requestor"],
        path: "Requests → New Request → Liquidation",
        steps: [
          "Select or enter the related Cash Advance request reference.",
          "Record actual expenses and attach the invoice or official receipt for each applicable line.",
          "Compare the amount advanced with the amount spent.",
          "If cash remains, upload proof that the excess was returned.",
        ],
      },
      {
        title: "Prepare a P.O. payment",
        audiences: ["requestor"],
        path: "Requests → New Request → P.O. Payment",
        steps: [
          "Select an approved purchase-order reference.",
          "Verify the generated requestor, supplier, department, and amount.",
          "Add the expense account and allocation for each line.",
          "Attach the approved P.O. and billing support; include BIR 2303 for a new supplier when required.",
        ],
      },
      {
        title: "Prepare a general payment",
        audiences: ["requestor"],
        path: "Requests → New Request → General Payment",
        steps: [
          "Describe the payment and add the merchant, expense account, cost center, and amount per line.",
          "Attach the billing document or invoice.",
          "Add quotation, statement of account, or supplier registration documents when applicable.",
          "Review the computed total and currency before submission.",
        ],
      },
      {
        title: "Correct a returned request",
        audiences: ["requestor"],
        path: "Dashboard → Returned Request → View Request",
        steps: [
          "Read the reviewer comment and identify every requested correction.",
          "Replace or add the affected information and documents.",
          "Review the updated version and resubmit it.",
          "Check the workflow history to confirm the request returned to the correct reviewer.",
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
          "Check the purpose, payee, amount, line allocations, and supporting documents.",
          "Confirm that the request belongs to the department you are authorized to review.",
          "Approve, request more information, or decline the request.",
          "Enter a clear reason whenever the request is returned or declined.",
        ],
      },
      {
        title: "Complete Finance validation",
        audiences: ["finance"],
        path: "Processing → Approval Queue → Document Validation",
        steps: [
          "Review each merchant, expense account, department, amount, and attachment.",
          "Mark each line valid or needing correction and record the review note.",
          "Classify VAT and EWT, then complete balanced debit and credit entries.",
          "Complete validation only when every required control passes.",
        ],
      },
      {
        title: "Review budget and routing",
        audiences: ["finance"],
        path: "Processing → Approval Queue → Finance Budget Review",
        steps: [
          "Confirm whether the request is budgeted or unbudgeted.",
          "Review the tax treatment, accounting entries, and total amount.",
          "Approve within Finance authority or route to the required executive approver.",
          "Verify the next owner and recorded policy route after the decision.",
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
          "Up to PHP 100,000: Finance Manager may give the final financial approval.",
          "PHP 100,000.01 to PHP 300,000: route to the COO.",
          "Above PHP 300,000: route to the President.",
          "After the final approval, route the request to voucher creation.",
        ],
      },
      {
        title: "Unbudgeted request",
        audiences: ["finance", "executive"],
        path: "Finance Budget Review → Executive Approval",
        steps: [
          "Up to PHP 1,000,000: route to the COO.",
          "Above PHP 1,000,000: route to the Board Member after the applicable executive review.",
          "Confirm that the unbudgeted indicator and amount are correct before approving the route.",
          "Keep the justification and every decision in the approval history.",
        ],
      },
      {
        title: "Cash advance route",
        audiences: ["finance"],
        path: "Department Approval → Finance Validation → Finance Manager",
        steps: [
          "Confirm the event dates, purpose, breakdown, and supporting budget.",
          "Finance Manager approval is required for a cash advance.",
          "The system flags an employee cash advance above PHP 40,000.",
          "Review the liquidation deadline and accountability acknowledgement before approval.",
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
          "Confirm that the request received every required approval.",
          "Review the gross amount, tax deductions, net payment, accounting entries, and payee.",
          "Choose Check, Bank Transfer (DigiBanker), or Cash as the payment method.",
          "Create the voucher and review its printable digital approval certification.",
        ],
      },
      {
        title: "Prepare and authorize payment",
        audiences: ["finance", "signatory"],
        path: "Payment Tracker → Bank Processing → Bank Authorization",
        steps: [
          "Record the payment instruction and the Finance Team Tracker transaction number.",
          "Enter a check number only for Check payments and only after the required approvals.",
          "Submit the instruction to the authorized signatories.",
          "Record each signatory decision and attach signed proof when required.",
        ],
      },
      {
        title: "Release and complete payment",
        audiences: ["finance"],
        path: "Payment Tracker → Payment Release",
        steps: [
          "Confirm authorization and the payment reference.",
          "Notify the vendor when the payment is ready for processing.",
          "For a check or cash release, mark the payment available for pickup and notify the requestor and payee.",
          "Record release or completion with the Finance actor and Philippine Time timestamp.",
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
          "Filter the visible request list by status, department, type, amount, or owner.",
          "Review aging days and overdue indicators.",
          "Open the request to identify the current owner and last completed action.",
          "Resolve the exception or assign a specific follow-up action.",
        ],
      },
      {
        title: "Produce a Finance report",
        audiences: ["finance"],
        path: "Payment Tracker → Reports",
        steps: [
          "Apply comparable department, date, status, type, and amount filters.",
          "Review the resulting transactions before export.",
          "Export an Excel-compatible CSV or use the print/PDF report layout.",
          "Confirm that all displayed and exported date-times use Philippine Time.",
        ],
      },
      {
        title: "Investigate an exception",
        audiences: ["finance"],
        path: "Request Detail → Workflow and Audit History",
        steps: [
          "Review the request version, workflow transitions, actors, and reviewer notes.",
          "Check document versions, payment attempts, and notification delivery results.",
          "Use the correlation or support-safe error identifier for an integration failure.",
          "Do not remove financial history; correct the record through an authorized action.",
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
