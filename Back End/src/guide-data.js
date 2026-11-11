// Shared source for the in-app guide and portable LIFE College guides.
export const guideRevision = "2026-11-10";
export const guideAudienceLabels = {
  "requestor": "Requestor",
  "department_head": "Department Head",
  "finance_associate": "Finance Associate",
  "finance_manager": "Finance Manager",
  "coo": "COO",
  "president": "President",
  "board_member": "Board",
  "system_administrator": "System Administrator",
  "authorized_signatory": "Historical Signatory"
};
export const guideSections = [
  {
    "id": "start",
    "number": "01",
    "title": "Getting started",
    "intro": "Follow these menu-by-menu steps to open the correct screen and complete the action available to your role.",
    "cards": [
      {
        "title": "Create a payment request",
        "audiences": [
          "requestor"
        ],
        "path": "Requests → New Request",
        "steps": [
          "Open New Request in the sidebar.",
          "Choose Reimbursement, Liquidation, Cash Advance, P.O. Payment, General Payment or Petty Cash.",
          "Complete the labelled fields, line items, cost centers and required uploads. Finance setup must be active where required.",
          "Save as Draft or select Submit to Department Head. Review any validation error before retrying."
        ]
      },
      {
        "title": "Resume or remove a draft",
        "audiences": [
          "requestor"
        ],
        "path": "Dashboard → Draft Requests → Open Draft",
        "steps": [
          "Open Dashboard from the left sidebar and locate the Draft Requests list.",
          "Select the draft request number to reopen the form at its last saved step.",
          "Update the fields, line items, and documents, then select Save as Draft or Submit to Department Head.",
          "To discard it, open the draft, select Delete Draft, and confirm the deletion prompt."
        ]
      },
      {
        "title": "Track a submitted request",
        "audiences": [
          "requestor"
        ],
        "path": "Overview → Dashboard or Processing → Request Tracker",
        "steps": [
          "Open Request Tracker in the sidebar.",
          "Use column sorting and filters to find the request.",
          "Open the row to review Request Status, Payment Status, Approval Progress and Request History.",
          "For a returned request, read the correction reason before editing and resubmitting."
        ]
      },
      {
        "title": "Track an assigned approval",
        "audiences": [
          "department_head",
          "coo",
          "president",
          "board_member"
        ],
        "path": "Overview → Dashboard or Processing → Approval Queue",
        "steps": [
          "Open Dashboard for assigned items, or open Approval Queue from the left sidebar.",
          "Use Search and the available filters to locate the assigned request.",
          "Select the request row to review Status, Current Owner, amount, and prior Workflow History.",
          "Complete only the decision available to your role, then verify the recorded outcome and next owner."
        ]
      }
    ],
    "note": "A permanent payment request number is generated only when a completed draft is submitted."
  },
  {
    "id": "requests",
    "number": "02",
    "title": "Requests and documents",
    "intro": "Each payment type shows only the fields and document rules that apply to that transaction.",
    "cards": [
      {
        "title": "Prepare a reimbursement",
        "audiences": [
          "requestor"
        ],
        "path": "Requests → New Request → Reimbursement",
        "steps": [
          "Open Requests → New Request, then select Reimbursement.",
          "In Request Details, enter the event or purpose and required payee information.",
          "Under Line Items, select Add Line and enter the merchant, invoice date and number, expense account, department, and amount.",
          "Use the line-item attachment control to upload the invoice or official receipt and proof of payment, then select Submit to Department Head after the totals match."
        ]
      },
      {
        "title": "Prepare a cash advance",
        "audiences": [
          "requestor"
        ],
        "path": "Requests → New Request → Cash Advance",
        "steps": [
          "Open Requests → New Request, then select Cash Advance.",
          "Enter the approved event or purpose and choose the Event End Date.",
          "Review the automatically displayed Liquidation Due Date, then add the advance breakdown and upload the budget or itinerary.",
          "Read and accept the accountability acknowledgement, review validation and select Submit to Department Head."
        ]
      },
      {
        "title": "Submit a liquidation",
        "audiences": [
          "requestor"
        ],
        "path": "Requests → New Request → Liquidation",
        "steps": [
          "Create a Liquidation and select your Cash Advance reference.",
          "Enter actual expenses, accounts and cost centers. Attach supporting receipts where applicable and submit originals to Finance.",
          "Only expenses above the released advance create a new payable amount; equal expenses need no payment.",
          "An unused balance remains outstanding until Finance Associate records the full fund return and Finance Manager verifies it. Do not claim a return merely by submitting liquidation."
        ]
      },
      {
        "title": "Prepare a Purchase Order payment",
        "audiences": [
          "requestor"
        ],
        "path": "Requests → New Request → Purchase Order Payment",
        "steps": [
          "Open Requests → New Request, select Purchase Order Payment, and choose an approved Purchase Order reference.",
          "Review the requestor, supplier, department, and amount populated from the selected purchase order.",
          "Open each generated line item and complete its expense account and allocation.",
          "Upload the approved Purchase Order and billing support, add BIR 2303 when requested, then select Submit to Department Head."
        ]
      },
      {
        "title": "Prepare a general payment",
        "audiences": [
          "requestor"
        ],
        "path": "Requests → New Request → General Payment",
        "steps": [
          "Open Requests → New Request, then select General Payment.",
          "Complete the payment description and payee fields, then select Add Line for each charge.",
          "Enter the merchant, expense account, cost center, and amount, and attach the billing document or invoice to the line.",
          "Upload any requested quotation, statement of account, or supplier document; verify the total and currency, then select Submit to Department Head."
        ]
      },
      {
        "title": "Correct a returned request",
        "audiences": [
          "requestor"
        ],
        "path": "Dashboard → Returned Request → View Request",
        "steps": [
          "Open Dashboard and select the returned request, or open the in-app return notification.",
          "Read Reviewer Comment at the top of Request Details and select Edit Returned Request.",
          "Update the identified fields and use Replace Document or Add Document for the affected attachment.",
          "Select Resubmit Request, then open Workflow History to confirm that it returned to the named reviewer."
        ]
      },
      {
        "title": "Prepare Petty Cash",
        "audiences": [
          "requestor"
        ],
        "path": "New Request → Petty Cash",
        "steps": [
          "Use PHP and an amount strictly below ₱3,000.",
          "Complete the request and required documents, then submit to Department Head.",
          "Finance Associate validates and gives final approval.",
          "Finance Associate creates the voucher for the approved amount, without tax deductions or the regular payment flow."
        ]
      }
    ],
    "note": "Uploads and Finance checks depend on request type and configured requirements. Submitted requests can be edited only through an allowed correction path; unrestricted post-approval editing is not available. P.O. references currently use local data, not a live Procurement connection."
  },
  {
    "id": "approvals",
    "number": "03",
    "title": "Reviews and approvals",
    "intro": "Approvers act only on requests assigned to their role, department, or identity. Every decision and note becomes part of the audit trail.",
    "cards": [
      {
        "title": "Complete a department review",
        "audiences": [
          "department_head"
        ],
        "path": "Processing → Approval Queue → Request",
        "steps": [
          "Open Approval Queue and select a request assigned through its selected cost center.",
          "Review the request, lines, documents and approval history.",
          "Select Approve, or open Reject to choose Return or Fully Decline.",
          "For Return or Fully Decline, provide the required reason and confirm the destination/outcome."
        ]
      },
      {
        "title": "Complete Finance validation",
        "audiences": [
          "finance_associate"
        ],
        "path": "Processing → Approval Queue → Document Validation",
        "steps": [
          "Open the assigned request in Approval Queue.",
          "Accept every required document and review each line. Flag corrections individually with a reason.",
          "For Reimbursement, confirm Necessary documents received for each line; missing required originals block approval. Review automatically applied defaults and any EWT override.",
          "Complete validation only when all required checks pass. Return or Fully Decline requires a reason."
        ]
      },
      {
        "title": "Review budget and routing",
        "audiences": [
          "finance_manager"
        ],
        "path": "Processing → Approval Queue → Finance Budget Review",
        "steps": [
          "Open the request assigned to Finance Manager.",
          "Review budget classification, amount, validated documents and prior decisions.",
          "For foreign currency, confirm PHP per currency unit for this request. The PHP equivalent sets the remaining approval route.",
          "Approve, or use Reject to Return to Requestor/Finance Associate or Fully Decline. A Finance Associate response resumes Finance Manager review without repeating earlier approvals."
        ]
      }
    ],
    "note": "Missing documents, incomplete approvals, invalid references, and unbalanced accounting entries block workflow progression."
  },
  {
    "id": "routing",
    "number": "04",
    "title": "Approval routing",
    "intro": "Routing is based on budget status, amount, request type, and the policy version saved when the request is submitted.",
    "cards": [
      {
        "title": "Route a budgeted request",
        "audiences": [
          "finance_manager"
        ],
        "path": "Finance Budget Review → Required Approver",
        "steps": [
          "Open the assigned budgeted request and review the saved amount and Budget Status.",
          "Approve requests up to PHP 100,000 for Voucher Creation.",
          "Route requests from PHP 100,000.01 to PHP 300,000 to the COO and requests above PHP 300,000 to the President.",
          "Open Workflow History and verify the next owner before leaving the request."
        ]
      },
      {
        "title": "Route an unbudgeted request",
        "audiences": [
          "finance_manager"
        ],
        "path": "Finance Budget Review → Executive Approval",
        "steps": [
          "Open the assigned request and confirm Budget Status is Unbudgeted.",
          "Review the amount and business justification before selecting Approve.",
          "Unbudgeted requests up to PHP 1,000,000 go to COO approval. Above PHP 1,000,000, the sequence is COO, then President, then Board.",
          "Open Workflow History and verify the next owner before leaving the request."
        ]
      },
      {
        "title": "Review a COO approval",
        "audiences": [
          "coo"
        ],
        "path": "Processing → Approval Queue → COO Approval",
        "steps": [
          "Open only the request assigned to you in Approval Queue.",
          "Review its amount, budget status, business justification, documents, and prior approvals.",
          "Select Approve or Request More Information. Information requests go to Finance Associate and resume this same approval stage after the response.",
          "Confirm the decision and verify the recorded next owner in Workflow History."
        ]
      },
      {
        "title": "Review a President approval",
        "audiences": [
          "president"
        ],
        "path": "Processing → Approval Queue → President Approval",
        "steps": [
          "Open only the request assigned to you in Approval Queue.",
          "Review its amount, budget status, business justification, documents, and prior approvals.",
          "Select Approve or Request More Information. Information requests go to Finance Associate and resume this same approval stage after the response.",
          "Confirm the decision and verify the recorded next owner in Workflow History."
        ]
      },
      {
        "title": "Review a Board approval",
        "audiences": [
          "board_member"
        ],
        "path": "Processing → Approval Queue → Board Approval",
        "steps": [
          "Open the assigned unbudgeted request above PHP 1,000,000.",
          "Review its amount, business justification, documents, and prior approvals.",
          "Select Approve or Request More Information. Information requests go to Finance Associate and resume this same approval stage after the response.",
          "Confirm the decision and verify the recorded next owner in Workflow History."
        ]
      },
      {
        "title": "Review a cash advance",
        "audiences": [
          "finance_manager"
        ],
        "path": "Department Approval → Finance Validation → Finance Manager",
        "steps": [
          "Open the assigned Cash Advance and review event dates, purpose, breakdown and documents.",
          "Check the configured amount limit, outstanding-advance policy and liquidation deadline.",
          "Review the saved accountability acknowledgement and Finance validation.",
          "Record the available decision and required reason."
        ]
      }
    ],
    "note": "Board approval applies only to unbudgeted requests above PHP 1,000,000. A budgeted request above that amount follows the President route unless policy changes."
  },
  {
    "id": "payments",
    "number": "05",
    "title": "Voucher and payment",
    "intro": "The request explains why payment is needed, the voucher records the approved financial treatment, and the payment records how funds were released.",
    "cards": [
      {
        "title": "Create a payment voucher",
        "audiences": [
          "finance_associate"
        ],
        "path": "Approved Request → Accounting workbench → Voucher & Payment",
        "steps": [
          "Review the calculation and prepare balanced accounting as Finance Associate.",
          "After final approval, Finance Manager posts accounting; Finance Associate prepares the voucher draft.",
          "Finance Manager issues the official voucher after reviewing certification.",
          "Use View Voucher or Print voucher. Petty Cash instead uses Finance Associate voucher creation without Finance Manager or tax deductions."
        ]
      },
      {
        "title": "Prepare a payment for release",
        "audiences": [
          "finance_associate"
        ],
        "path": "Request Details → Voucher & Payment",
        "steps": [
          "Open the issued voucher as Finance Associate.",
          "Prepare payment lines using the available method and reference fields. The total cannot exceed the available amount due.",
          "There is no separate signatory approval step.",
          "For checks, mark Ready for pickup before recording release."
        ]
      },
      {
        "title": "Release and complete payment",
        "audiences": [
          "finance_associate"
        ],
        "path": "Request Details → Payment lines → Release and clearing",
        "steps": [
          "Finance Associate records release evidence and releases the payment line.",
          "Finance Manager records clearing evidence and confirms clearing.",
          "Partial releases retain their remaining balance; do not treat one released line as full voucher settlement.",
          "Review Voucher & Payment and Financial reconciliation for the recorded balances."
        ]
      },
      {
        "title": "Create a Petty Cash voucher",
        "audiences": [
          "finance_associate"
        ],
        "path": "Approved Petty Cash → Petty Cash Voucher",
        "steps": [
          "Complete the required document and line validation and approve the request.",
          "Select Create voucher and enter a reason.",
          "Verify the full approved amount, creator and voucher reference.",
          "Use View Voucher or Print voucher. No Finance Manager or separate payment release is required for Petty Cash."
        ]
      },
      {
        "title": "Record and verify a fund return",
        "audiences": [
          "finance_associate",
          "finance_manager"
        ],
        "path": "Cash Advance → Fund return",
        "steps": [
          "Finance Associate records the full unused amount, receipt/deposit reference and supporting evidence.",
          "Finance Manager verifies or requests correction.",
          "Pending or rejected returns do not reduce the outstanding balance.",
          "Review Financial reconciliation after verification."
        ]
      },
      {
        "title": "Recover a released payment",
        "audiences": [
          "finance_associate",
          "finance_manager"
        ],
        "path": "Voucher & Payment → Payment recovery",
        "steps": [
          "Finance Associate records evidence of full recovery for the selected payment line.",
          "Finance Manager independently verifies recovery.",
          "Verified recovery reopens the amount for a linked replacement payment; pending recovery does not.",
          "Prepare the replacement with fresh release evidence. Original approvals and expense/tax accounting remain recorded."
        ]
      }
    ],
    "note": "Ordinary payments use Finance Associate preparation/release and Finance Manager clearing. The former Authorized Signatory gate is retired. Petty Cash ends with its Finance Associate-created voucher."
  },
  {
    "id": "reports",
    "number": "06",
    "title": "Tracking reporting and controls",
    "intro": "Dashboards and reports are role-scoped. Finance records remain searchable after payment release.",
    "cards": [
      {
        "title": "Review elapsed-time aging",
        "audiences": [
          "finance_associate",
          "finance_manager"
        ],
        "path": "Tracker and Reports → Financial reconciliation",
        "steps": [
          "Choose the relevant Finance report and generate it for the current filters.",
          "Use the elapsed-time bucket to group requests by time since submission.",
          "These buckets describe elapsed time only. They do not establish an SLA or an overdue deadline.",
          "Open the request link to review its current owner, history and any outstanding Finance action."
        ]
      },
      {
        "title": "Produce a Finance report",
        "audiences": [
          "finance_associate",
          "finance_manager"
        ],
        "path": "Tracker and Reports → Financial reconciliation",
        "steps": [
          "Choose Payment reconciliation, Cash advance reconciliation, Fund returns or Payment recoveries.",
          "Set search, department, currency, submission dates, state or elapsed-time filters, then Generate report.",
          "Review the per-currency totals across all result pages and follow the request links when needed.",
          "Export Excel or Print report. Request gross-amount reports remain available from Dashboard filters."
        ]
      },
      {
        "title": "Investigate an exception",
        "audiences": [
          "finance_associate",
          "finance_manager"
        ],
        "path": "Request Detail → Workflow and Audit History",
        "steps": [
          "Open the request and expand Request History.",
          "Review the actor, recorded reason, payment line and relevant documents.",
          "Use only the available correction, return, void or recovery action; preserve the original history.",
          "If a write response is lost, check the latest record before retrying. For access errors, sign in again or contact the administrator."
        ]
      }
    ],
    "note": "Request approvals and financial actions retain their recorded history. Each report states its generation time, filters and amount definitions."
  },
  {
    "id": "administration",
    "number": "07",
    "title": "System administration",
    "intro": "Administrative procedures are shown only to System Administrators.",
    "cards": [
      {
        "title": "Manage users",
        "audiences": [
          "system_administrator"
        ],
        "path": "Administration → Users",
        "steps": [
          "Open Administration and select the Users tab.",
          "Select + User to create an account, then assign its department, manager, and required role.",
          "Use the row action menu to edit, suspend, reactivate, or delete an eligible account.",
          "Verify the saved assignment and audit entry before leaving the page."
        ]
      },
      {
        "title": "Manage roles and permissions",
        "audiences": [
          "system_administrator"
        ],
        "path": "Administration → Roles & Permissions",
        "steps": [
          "Open Administration and select Roles & Permissions.",
          "Create or edit only the role and permission records required by the approved access design.",
          "Review the permission assignment before saving it.",
          "Confirm the change is recorded in the audit history."
        ]
      },
      {
        "title": "Manage departments",
        "audiences": [
          "system_administrator"
        ],
        "path": "Administration → Departments",
        "steps": [
          "Open Administration and select Departments.",
          "Select + Department to add an approved display name and official code.",
          "Use the row action menu to edit or deactivate an existing department.",
          "Reassign linked users before attempting a deletion."
        ]
      },
      {
        "title": "Configure and accept Finance setup",
        "audiences": [
          "finance_manager",
          "system_administrator"
        ],
        "path": "Request Settings → Start / resume initial setup",
        "steps": [
          "Prepare actual accounts, tax codes, cost centers, methods, currency rates and document rules.",
          "Select General defaults and the Cash Advance asset mapping; configure basis, rounding, effective date and voucher wording.",
          "Save the draft, resolve blockers and activate the required request-type scope with a reason. Saving alone does not activate.",
          "Finance Manager completes Business review after testing the agreed scenarios. Automated development checks do not sign business acceptance."
        ]
      }
    ],
    "note": "Apply least-privilege access. Administrative changes must remain attributable through the audit trail."
  },
  {
    "id": "reconciliation",
    "number": "08",
    "title": "Finance reconciliation",
    "intro": "Review current payment and advance balances against their saved Finance records.",
    "cards": [
      {
        "title": "Reconcile payments and advances",
        "audiences": [
          "finance_associate",
          "finance_manager"
        ],
        "path": "Tracker and Reports → Financial reconciliation",
        "steps": [
          "Choose Payment reconciliation, Cash advance reconciliation, Fund returns or Payment recoveries.",
          "Apply search, submission dates, currency, department, state and elapsed-time filters, then Generate report.",
          "Review totals across all pages. Payment amounts are net voucher amounts. Advance outstanding subtracts posted liquidation and verified returns only.",
          "Open a request from its report row to inspect the voucher, line history and supporting evidence. Export Excel or print the same applied filters."
        ]
      }
    ],
    "note": "Pending receipts and recoveries remain outstanding until independently verified. Elapsed-time buckets are informational, not SLA overdue deadlines. Finance configures and activates setup before processing requests; business acceptance is recorded by Finance Manager."
  },
  {
    "id": "conversation",
    "number": "09",
    "title": "Messages and recovery",
    "intro": "Use the request conversation for clarification, with in-app notifications for tags.",
    "cards": [
      {
        "title": "Send a message or tag a participant",
        "audiences": [
          "requestor",
          "department_head",
          "finance_associate",
          "finance_manager",
          "coo",
          "president",
          "board_member"
        ],
        "path": "Request Details → Messages & Notes",
        "steps": [
          "Open the right-side conversation panel. The composer stays above the scrollable messages; latest messages appear first.",
          "Type @ and select a reached participant to tag them. Future approvers are excluded until their stage is reached.",
          "Post the message. Messages cannot be edited after posting.",
          "Tagged participants see a highlighted message and an in-app notification. Terminal requests retain a read-only log."
        ]
      },
      {
        "title": "Recover from a failed action",
        "audiences": [
          "requestor",
          "department_head",
          "finance_associate",
          "finance_manager",
          "coo",
          "president",
          "board_member",
          "system_administrator"
        ],
        "path": "Error message → Recovery action",
        "steps": [
          "Read the inline error and correct the named field or missing requirement. Failed editable forms retain entered values.",
          "For a temporary load failure, select Try again. A conflict needs the latest record before another save.",
          "For an expired session, select Go to sign in. Access denied requires the appropriate role or assignment.",
          "If a response is unreadable or times out, check whether the change was saved before retrying."
        ]
      }
    ],
    "note": "Messages are not approval decisions. Email delivery and SLA reminders are not enabled by downloading this guide."
  }
];
export const guideStages = [
  [
    "01",
    "Draft",
    "Requestor",
    "Complete the applicable form, line items, allocations, and documents."
  ],
  [
    "02",
    "Department approval",
    "Department Head",
    "Review the business purpose and departmental charge."
  ],
  [
    "03",
    "Document validation",
    "Finance Associate",
    "Validate documents, tax treatment, and balanced accounting entries."
  ],
  [
    "04",
    "Budget review",
    "Finance Manager",
    "Confirm budget status and the required approval route."
  ],
  [
    "05",
    "Executive approval",
    "COO President or Board",
    "Approve according to the saved amount and budget policy."
  ],
  [
    "06",
    "Voucher creation",
    "Finance Associate and Finance Manager",
    "Prepare accounting and voucher drafts; Finance Manager posts accounting and issues ordinary vouchers. Petty Cash is handled by Finance Associate."
  ],
  [
    "07",
    "Payment preparation and release",
    "Finance Associate",
    "Prepare payment lines and record release evidence; checks require pickup readiness."
  ],
  [
    "08",
    "Release and completion",
    "Finance Associate and Finance Manager",
    "Record release with evidence, verify clearing, and reconcile payments and advance settlements."
  ]
];
export const guideStageAudiences = {
  "requestor": [
    "01",
    "08"
  ],
  "department_head": [
    "02"
  ],
  "finance_associate": [
    "03",
    "06",
    "07",
    "08"
  ],
  "finance_manager": [
    "04",
    "06",
    "08"
  ],
  "coo": [
    "05"
  ],
  "president": [
    "05"
  ],
  "board_member": [
    "05"
  ],
  "authorized_signatory": [],
  "system_administrator": []
};
