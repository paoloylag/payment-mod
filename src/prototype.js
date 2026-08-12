const paymentTypes = {
  reimbursement: {
    label: "Reimbursement",
    prefix: "RMB",
    required: ["Requestor's Name", "Department", "Date", "Event / Purpose", "BIR-Recognized Invoice(s) / Official Receipt(s)"],
    mandatoryFields: [
      { label: "Department", kind: "input", value: "People Operations" },
      { label: "Date", kind: "date", value: "2026-07-18" },
      { label: "Event / Purpose", kind: "textarea", value: "Leadership workshop reimbursement" },
    ],
    uploadDocuments: ["BIR-Recognized Invoice(s) / Official Receipt(s)", "Proof of Payment", "Cash Advance Form (If Applicable)", "Other Supporting Document"],
    lineColumns: ["Merchant Name", "Invoice Date", "Invoice Number", "Particulars", "Expense Account", "Department to Be Charged", "Amount", "Attachment"],
  },
  cashAdvance: {
    label: "Cash Advance",
    prefix: "CA",
    required: ["Cash Advance Requestor", "Department", "Last Day of the Event", "Automatic Date to Liquidate", "Event / Purpose", "Accountability / Authority to Deduct Acknowledgement"],
    mandatoryFields: [
      { label: "Department", kind: "input", value: "Sales" },
      { label: "Last Day of the Event", kind: "date", value: "2026-07-25" },
      { label: "Event / Purpose", kind: "textarea", value: "Regional sales visit" },
    ],
    uploadDocuments: ["Supporting Budget / Itinerary", "Other Supporting Document"],
    lineColumns: ["Particulars", "Amount"],
  },
  liquidation: {
    label: "Liquidation",
    prefix: "LIQ",
    required: ["Cash Advance Reference Number", "Cash Advance Requestor", "Department", "Date to Be Liquidated", "Actual Date of Liquidation", "Event / Purpose", "BIR-Recognized Invoice(s) / Official Receipt(s)"],
    mandatoryFields: [
      { label: "Cash Advance Reference Number", kind: "input", value: "CA-2026-0049" },
      { label: "Department", kind: "input", value: "People Operations" },
      { label: "Date to Be Liquidated", kind: "date", value: "2026-07-31" },
      { label: "Actual Date of Liquidation", kind: "date", value: "2026-07-30" },
      { label: "Event / Purpose", kind: "textarea", value: "Leadership workshop liquidation" },
    ],
    uploadDocuments: ["BIR-Recognized Invoice(s) / Official Receipt(s)", "Proof of Unused Cash Return (If Applicable)", "Other Supporting Document"],
    lineColumns: ["Merchant Name", "Invoice Date", "Invoice Number", "Particulars", "Expense Account", "Department to Be Charged", "Amount", "Attachment"],
  },
  poPayment: {
    label: "P.O. Payment",
    prefix: "PO",
    required: ["P.O. Reference from P.O. System", "Automatically Generated Requestor, Payee, and Amount", "Expense Account for Each Line Item", "Approved P.O."],
    mandatoryFields: [
      { label: "Particulars of P.O. Payment", kind: "textarea", value: "Office equipment purchase order payment" },
    ],
    uploadDocuments: ["Approved P.O.", "BIR 2303 (If New Supplier)", "Billing / Quotation / SOA", "Invoice (If Available)"],
    lineColumns: ["P.O. Number", "Supplier", "Particulars", "Expense Account", "Department / Cost Center", "Amount", "Attachment"],
  },
  general: {
    label: "General Payment",
    prefix: "GEN",
    required: ["Particulars of Payment", "Expense Account and Department / Cost Center for Each Line Item", "Billing or Invoice"],
    mandatoryFields: [
      { label: "Particulars of Payment", kind: "textarea", value: "Monthly utilities and service charges" },
    ],
    uploadDocuments: ["Billing or Invoice", "BIR 2303 (If New Supplier)", "Billing / Quotation / SOA", "Invoice (If Available)"],
    lineColumns: ["Merchant Name", "Particulars", "Expense Account", "Department / Cost Center", "Amount", "Attachment"],
  },
};

const steps = [
  [1, "Request", "Requesting Department"],
  [2, "Documents", "Requestor"],
  [3, "Department Approval", "Department Head"],
  [4, "Document Validation", "Finance Associate"],
  [5, "Budget Review", "Finance Manager"],
  [7, "COO Approval", "COO"],
  [8, "President Approval", "President"],
  [8.5, "Board Approval", "Board Member"],
  [9, "Voucher", "Finance Associate"],
  [10, "Bank Processing", "Finance Associate"],
  [11, "Bank Authorization", "Authorized Signatories"],
  [12, "Vendor Notice", "Finance Associate"],
  [13, "Release", "Finance Associate"],
  [14, "Tracker", "System"],
  [15, "Complete", "System"],
];

const emailTemplates = {
  1: ["Requestor", "Complete your payment request", "Draft created", "Your payment request draft has been saved.", "Complete the required request information so Finance can begin processing it.", "Continue Request"],
  2: ["Requestor", "Required documents need to be uploaded", "Request details completed", "Your request details are ready.", "Upload the required supporting documents shown in the request checklist before submission.", "Upload Documents"],
  3: ["Department Head", "Approval required: payment request", "Request submitted", "A payment request from your department is awaiting approval.", "Review the purpose, payee, amount, cost center, and supporting documents before approving.", "Review Request"],
  4: ["Finance Associate", "Document validation required", "Department Head approved", "An approved request is ready for Finance validation.", "Validate the uploaded documents and add any withholding tax or accounting computation needed.", "Validate Documents"],
  5: ["Finance Manager", "Budget review required", "Documents validated", "A validated payment request is ready for budget review.", "Confirm budget availability, accounting treatment, and the approval route based on the amount.", "Review Budget"],
  7: ["COO", "COO approval required: payment request", "Finance review completed", "A payment request requires your approval.", "This request is unbudgeted, over budget, or falls within the PHP 100,000.01 to PHP 300,000 approval threshold.", "Review and Approve"],
  8: ["President", "President approval required: payment request", "Finance review completed", "A high-value budgeted payment request requires your approval.", "This budgeted request exceeds PHP 300,000. Review the approval trail and supporting documents before deciding.", "Review and Approve"],
  "8.5": ["Board Member", "Board approval required: unbudgeted payment request", "Executive review completed", "An unbudgeted payment request above PHP 1,000,000 requires Board approval.", "Review the complete executive approval trail, funding justification, payee details, and supporting documents before deciding.", "Review and Approve"],
  9: ["Finance Associate", "Create payment voucher", "Final approval completed", "The payment request has received its final approval.", "Create the payment voucher and confirm the payee, tax deductions, net payment, and accounting entries.", "Create Voucher"],
  10: ["Finance Associate", "Payment is ready for bank processing", "Voucher created", "An approved payment voucher is ready for processing.", "Prepare the bank transfer or check and record the payment reference in the request.", "Process Payment"],
  11: ["Authorized Signatories", "Bank authorization required", "Payment instruction prepared", "A payment instruction is awaiting bank authorization.", "Review the voucher, approval trail, payee details, and payment instruction before authorizing.", "Authorize Payment"],
  12: ["Vendor", "Payment ready for processing: {{request_id}}", "Bank authorization completed", "Your payment is ready for processing.", "The payment instruction for {{payee_name}} has completed bank authorization. Please review the payment details and reference below.", "View Payment Details"],
  13: ["Department Requestor and Vendor", "Payment available for pick-up: {{request_id}}", "Payment marked available for pick-up", "The payment is now available for pick-up.", "Payment for {{payee_name}} is available. The update date, time, and Finance personnel who recorded the status are included for reference.", "View Release Details"],
  14: ["Finance Associate", "Payment tracker updated", "Payment released", "The payment tracker has been updated automatically.", "Review the recorded turnaround dates and resolve any remaining tracker exceptions.", "View Tracker"],
  15: ["Department Requestor and Vendor", "Payment completed: {{request_id}}", "Transaction completed", "Your payment transaction has been completed.", "Payment for {{payee_name}} has been completed. The payment date, amount, method, and reference are included below for your records.", "View Payment Record"],
};

const uploadSamples = [
  ["RMB-2026-0161", "reimbursement", "Lia Dizon", "People Ops", "Training Center", 72300, [["Invoice", true, "training-invoice-1042.pdf", "248 KB"], ["Billing / Quotation / SOA", false, "training-quotation.pdf", "181 KB"], ["Proof of Payment", true, "proof-of-payment.png", "864 KB"], ["Receipt for Each Line Item", true], ["Cash Advance Form", false, "cash-advance-reference.pdf", "226 KB"]]],
  ["RMB-2026-0164", "reimbursement", "Mika Santos", "Marketing", "Event Registration", 21850, [["Invoice", true], ["Billing / Quotation / SOA", false], ["Proof of Payment", true, "card-payment-receipt.pdf", "126 KB"], ["Receipt for Each Line Item", true], ["Cash Advance Form", false]]],
  ["CA-2026-0065", "cashAdvance", "Tara Lim", "Sales", "Internal", 35000, [["Cash Advance Form", true, "signed-cash-advance-form.pdf", "319 KB"], ["Supporting Budget / Itinerary", true]]],
  ["CA-2026-0068", "cashAdvance", "Iya Cruz", "Events", "Internal", 39000, [["Cash Advance Form", true, "event-cash-advance.pdf", "284 KB"], ["Supporting Budget / Itinerary", true, "event-budget-and-itinerary.xlsx", "92 KB"]]],
  ["PO-2026-0102", "poPayment", "Bea Tan", "Procurement", "Atlas Office Systems", 141750, [["Approved P.O.", true, "PO-2026-0102-approved.pdf", "411 KB"], ["BIR 2303 (New Supplier)", false, "atlas-bir-2303.pdf", "205 KB"], ["Billing / Quotation / SOA", true, "atlas-soa-june.pdf", "176 KB"], ["Invoice", false]]],
  ["PO-2026-0105", "poPayment", "Jon Reyes", "Operations", "Northstar Supplies", 98200, [["Approved P.O.", true], ["BIR 2303 (New Supplier)", false], ["Billing / Quotation / SOA", true, "northstar-quotation.pdf", "238 KB"], ["Invoice", false]]],
  ["GEN-2026-0053", "general", "Nico Ramos", "Facilities", "Metro Repairs", 66200, [["Billing or Invoice", true, "metro-repairs-invoice.pdf", "154 KB"], ["BIR 2303 (New Supplier)", false], ["Billing / Quotation / SOA", false, "repair-quotation.pdf", "202 KB"], ["Other Supporting Document", false]]],
  ["GEN-2026-0057", "general", "Carlo Uy", "IT", "CloudWorks", 88400, [["Billing or Invoice", true], ["BIR 2303 (New Supplier)", false, "cloudworks-bir-2303.pdf", "196 KB"], ["Billing / Quotation / SOA", false], ["Other Supporting Document", false, "service-acceptance.pdf", "118 KB"]]],
].map(([id, type, requestor, department, vendor, amount, documents]) => ({ id, type, requestor, department, vendor, amount, documents: documents.map(([name, required, file, size]) => ({ name, required, file, size })) }));

const lineItemExamples = {
  reimbursement: [
    { "Merchant Name": "Training Center", "Invoice Date": "2026-07-15", "Invoice Number": "INV-1042", Particulars: "Leadership workshop registration", "Expense Account": "Training Expense", "Department to Be Charged": "People Operations", Amount: 50000, Attachment: "training-invoice.pdf" },
    { "Merchant Name": "Travel Desk", "Invoice Date": "2026-07-16", "Invoice Number": "OR-1048", Particulars: "Workshop transportation", "Expense Account": "Transportation Expense", "Department to Be Charged": "People Operations", Amount: 75000, Attachment: "transport-receipt.pdf" },
  ],
  cashAdvance: [{ Particulars: "Regional transportation", Amount: 25000 }, { Particulars: "Meals and incidentals", Amount: 10000 }],
  liquidation: [
    { "Merchant Name": "Training Center", "Invoice Date": "2026-07-15", "Invoice Number": "INV-2051", Particulars: "Workshop venue and meals", "Expense Account": "Events Expense", "Department to Be Charged": "People Operations", Amount: 30000, Attachment: "event-invoice.pdf" },
    { "Merchant Name": "Travel Desk", "Invoice Date": "2026-07-16", "Invoice Number": "OR-2058", Particulars: "Local transportation", "Expense Account": "Transportation Expense", "Department to Be Charged": "People Operations", Amount: 15000, Attachment: "transport-receipt.pdf" },
  ],
  poPayment: [{ "P.O. Number": "PO-2026-0106", Supplier: "Northstar Supplies", Particulars: "Office workstations", "Expense Account": "Office Equipment", "Department / Cost Center": "Operations - 4400", Amount: 98000, Attachment: "approved-po.pdf" }, { "P.O. Number": "PO-2026-0106", Supplier: "Northstar Supplies", Particulars: "Delivery and installation", "Expense Account": "Installation Expense", "Department / Cost Center": "IT - 4500", Amount: 27500, Attachment: "supplier-invoice.pdf" }],
  general: [{ "Merchant Name": "City Utilities", Particulars: "Electricity service", "Expense Account": "Utilities Expense", "Department / Cost Center": "Facilities - 4600", Amount: 48500, Attachment: "electric-bill.pdf" }, { "Merchant Name": "City Utilities", Particulars: "Water service", "Expense Account": "Utilities Expense", "Department / Cost Center": "Admin - 4000", Amount: 12200, Attachment: "water-bill.pdf" }, { "Merchant Name": "CloudWorks", Particulars: "Monthly hosting", "Expense Account": "Cloud Services", "Department / Cost Center": "IT - 4500", Amount: 27700, Attachment: "cloud-invoice.pdf" }],
};

const poSystemRecords = [
  { id: "PO-2026-0106", requestor: "Jon Reyes", payee: "Northstar Supplies", amount: 125500, department: "Operations", newSupplier: false },
  { id: "PO-2026-0102", requestor: "Bea Tan", payee: "Atlas Office Systems", amount: 141750, department: "Procurement", newSupplier: true },
  { id: "PO-2026-0114", requestor: "Carlo Uy", payee: "CloudWorks", amount: 88400, department: "IT", newSupplier: true },
];

const initialLineItems = Object.fromEntries(Object.entries(paymentTypes).map(([type, config]) => [
  type,
  [Object.fromEntries(config.lineColumns.map((column) => [column, column === "Amount" ? 0 : ""]))],
]));

const requests = [
  ["RMB-2026-0144", "reimbursement", "Mika Santos", "Marketing", "Event Registration", 12350, true, "Draft Request", 1, "2026-06-25", "", "", 0, 3],
  ["CA-2026-0049", "cashAdvance", "Tara Lim", "Sales", "Internal", 35000, false, "Uploading Documents", 2, "2026-06-25", "", "", 1, 1],
  ["GEN-2026-0034", "general", "Alex Cruz", "Admin", "City Utilities", 18500, true, "Department Approval", 3, "2026-06-24", "", "", 3, 0],
  ["RMB-2026-0148", "reimbursement", "Mika Santos", "Marketing", "Hotel Benilde", 84350, true, "Document Validation", 4, "2026-06-21", "", "", 4, 0],
  ["PO-2026-0088", "poPayment", "Jon Reyes", "Operations", "Northstar Supplies", 98000, true, "Finance Budget Review", 5, "2026-06-20", "", "", 5, 0],
  ["PO-2026-0092", "poPayment", "Jon Reyes", "Operations", "Northstar Supplies", 248900, true, "COO Approval", 7, "2026-06-19", "2026-06-20", "2026-06-22", 5, 0],
  ["GEN-2026-0037", "general", "Alex Cruz", "Admin", "City Utilities", 329500, true, "President Approval", 8, "2026-06-18", "", "", 3, 0],
  ["PO-2026-0108", "poPayment", "Bea Tan", "Procurement", "Enterprise Systems Corp.", 1250000, false, "Board Approval", 8.5, "2026-06-18", "", "", 5, 0],
  ["RMB-2026-0150", "reimbursement", "Lia Dizon", "People Ops", "Training Center", 72300, true, "Voucher Creation", 9, "2026-06-17", "", "", 4, 0],
  ["GEN-2026-0041", "general", "Nico Ramos", "Facilities", "Metro Repairs", 66200, true, "Bank Payment Processing", 10, "2026-06-16", "", "", 3, 0],
  ["PO-2026-0098", "poPayment", "Bea Tan", "Procurement", "Atlas Office Systems", 141750, true, "Bank Authorization", 11, "2026-06-15", "", "", 5, 0],
  ["GEN-2026-0044", "general", "Carlo Uy", "IT", "CloudWorks", 88400, true, "Vendor Notification", 12, "2026-06-14", "", "", 3, 0],
  ["RMB-2026-0154", "reimbursement", "Sam Lee", "Legal", "Travel Desk", 30750, true, "Payment Release", 13, "2026-06-13", "", "", 4, 0],
  ["CA-2026-0061", "cashAdvance", "Iya Cruz", "Events", "Internal", 39000, true, "Payment Tracker", 14, "2026-06-12", "2026-06-13", "2026-06-14", 2, 0],
  ["GEN-2026-0049", "general", "Paolo Reyes", "Finance", "Completed Payment", 101250, true, "Completed", 15, "2026-06-11", "", "", 4, 0],
].map(([id, type, requestor, department, vendor, amount, budgeted, status, currentStep, submitted, returned, resubmitted, documents, missing], index) => ({
  id, type, requestor, department, vendor, amount, budgeted, status, currentStep, submitted, returned, resubmitted, documents, missing,
  currency: index === 6 ? "USD" : index === 7 ? "EUR" : "PHP",
  unlocked: false,
  audit: [],
  bankSubmittedAt: currentStep >= 11 ? "2026-06-25T09:15:00+08:00" : "",
  bankSubmittedBy: currentStep >= 11 ? "Vanessa · Finance Associate" : "",
  bankAuthorizedAt: currentStep >= 12 ? "2026-06-25T11:40:00+08:00" : "",
  bankAuthorizedBy: currentStep >= 12 ? "Authorized Signatory" : "",
  vendorNotifiedAt: currentStep >= 13 ? "2026-06-25T13:10:00+08:00" : "",
  vendorNotifiedBy: currentStep >= 13 ? "Vanessa · Finance Associate" : "",
  pickupAvailableAt: currentStep >= 14 ? "2026-06-25T14:30:00+08:00" : "",
  pickupAvailableBy: currentStep >= 14 ? "Vanessa · Finance Associate" : "",
}));

const personas = {
  all: { label: "All Roles", name: "Prototype Admin", subtitle: "Complete Prototype Access" },
  requestor: { label: "Requestor", name: "Mika Santos", subtitle: "Marketing Department" },
  financeAssociate: { label: "Finance Associate", name: "Ms. Rhee", subtitle: "Document Validation" },
  financeManager: { label: "Finance Manager", name: "Finance Manager", subtitle: "All-Request Visibility" },
  coo: { label: "COO", name: "Chief Operating Officer", subtitle: "Routed Approvals Only" },
  president: { label: "President", name: "President", subtitle: "Routed Approvals Only" },
};

let state = {
  persona: "all",
  tab: "dashboard",
  approvalView: "list",
  selectedId: requests[0].id,
  dashboardRequestId: null,
  dashboardMetric: null,
  dashboardWorkflow: false,
  unlockRequestId: null,
  trackerRequestId: null,
  dashboardFilters: { voucher: "", department: "all", type: "all", status: "all", minAmount: "", maxAmount: "", sortBy: "submitted", sortDirection: "desc" },
  requestCreatedDate: new Date().toISOString().slice(0, 10),
  requestMode: "new",
  activeDraftId: null,
  drafts: [],
  draftType: "reimbursement",
  draftCurrency: "PHP",
  otherCurrency: "",
  selectedPO: poSystemRecords[0].id,
  cashAdvanceEventEnd: "2026-07-25",
  cashAdvanceLiquidationDate: "2026-08-09",
  budgeted: true,
  liquidationAdvanceAmount: 0,
  emailStep: 3,
  uploadId: uploadSamples[0].id,
  documentValidation: {
    vat: "",
    ewt: "",
    otherEwt: "",
    hardCopy: false,
    softCopy: true,
    completionDate: "",
    documentsValidatedAt: "",
    checkNumber: "",
    reviewerNote: "Validate supporting documents, tax treatment, and accounting entries.",
    lineReviews: [
      { status: "pending", note: "", reviewer: "", reviewedAt: "" },
      { status: "pending", note: "", reviewer: "", reviewedAt: "" },
    ],
    entries: [
      { account: "Training Expense", debit: 84350, credit: 0 },
      { account: "Accounts Payable", debit: 0, credit: 84350 },
    ],
  },
  lineItemsByType: Object.fromEntries(Object.entries(initialLineItems).map(([type, rows]) => [type, rows.map((row) => ({ ...row }))])),
};
const tabRoutes = {
  dashboard: "/dashboard",
  request: "/requests/new/reimbursement",
  approvals: "/approvals",
  tracker: "/tracker",
  uploads: "/documents/uploads",
  documents: "/documents/rules",
  emails: "/emails",
};
function routeStateFromHash() {
  const path = (window.location.hash.slice(1) || "/dashboard").replace(/\/$/, "") || "/dashboard";
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "requests") return { tab: "request", requestMode: parts[1] === "drafts" ? "drafts" : "new", draftType: paymentTypes[parts[2]] ? parts[2] : state.draftType, dashboardMetric: null, dashboardRequestId: null, trackerRequestId: null };
  if (parts[0] === "approvals") {
    const approvalView = parts[1] === "request" ? "detail" : parts[1] === "review" ? "review" : "list";
    const requestId = approvalView === "list" ? null : parts[2];
    return { tab: "approvals", approvalView, selectedId: requests.some((r) => r.id === requestId) ? requestId : state.selectedId, dashboardMetric: null, dashboardRequestId: null, trackerRequestId: null };
  }
  if (parts[0] === "tracker") return { tab: "tracker", trackerRequestId: requests.some((r) => r.id === parts[1]) ? parts[1] : null, dashboardMetric: null, dashboardRequestId: null };
  if (parts[0] === "documents") return { tab: parts[1] === "rules" ? "documents" : "uploads", trackerRequestId: null, dashboardMetric: null };
  if (parts[0] === "emails") return { tab: "emails", emailStep: steps.some(([id]) => String(id) === parts[1]) ? Number(parts[1]) : state.emailStep, trackerRequestId: null, dashboardMetric: null };
  if (parts[0] === "dashboard") return { tab: "dashboard", dashboardMetric: ["pending", "value", "returned", "unclaimed"].includes(parts[1]) ? parts[1] : null, dashboardRequestId: parts[1] === "request" && requests.some((r) => r.id === parts[2]) ? parts[2] : null, dashboardWorkflow: parts[1] === "workflow", selectedId: requests.some((r) => r.id === parts[2]) ? parts[2] : state.selectedId, trackerRequestId: null };
  return { tab: "dashboard", dashboardMetric: null, trackerRequestId: null };
}
function navigate(path) {
  if (window.location.hash === `#${path}`) {
    state = { ...state, ...routeStateFromHash() };
    render();
  } else window.location.hash = path;
}
const money = (value, currency = "PHP") => {
  if (currency === "OTHER") return `${state.otherCurrency || "Currency"} ${new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(value)}`;
  return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
};
const requestMoney = (request) => money(request.amount, request.currency || "PHP");
const agingDays = (request) => request.currentStep === 15 ? 0 : Math.max(0, Math.floor((Date.now() - new Date(`${request.submitted}T00:00:00`).getTime()) / 86400000));
const settlementFor = (advance, expenses) => advance >= expenses
  ? `${money(advance - expenses)} for return`
  : `${money(expenses - advance)} for reimbursement`;
const stepLabel = (value) => value === 8.5 ? "8B" : value;
const route = ({ amount, budgeted, type }) => type === "cashAdvance"
  ? amount > 40000 ? "Exceeds the PHP 40,000 employee cash advance limit." : "Finance Manager approval is required for this cash advance."
  : !budgeted && amount > 1000000 ? "Board Member approval required for unbudgeted payments above PHP 1,000,000." : !budgeted ? "COO approval required for unbudgeted payments up to PHP 1,000,000." : amount <= 100000 ? "Finance Manager can approve and route to voucher creation." : amount <= 300000 ? "COO approval required by amount threshold." : "President approval required for budgeted payments above PHP 300,000.";
const pillTone = (status) => /Rejected|Disapproved/i.test(status) ? "rejected" : /Returned/i.test(status) ? "returned" : /Completed|Approved|Release|Notification|Tracker/i.test(status) ? "approved" : /Draft|Uploading/i.test(status) ? "neutral" : "pending";
const finalApprovalRole = (r) => r.type === "cashAdvance" || (r.budgeted && r.amount <= 100000)
  ? "Finance Manager"
  : !r.budgeted && r.amount > 1000000
  ? "Board Member"
  : !r.budgeted || r.amount <= 300000
  ? "COO"
  : "President";
const approvalCertificationFor = (r) => {
  const key = r.id.replace(/[^A-Z0-9]/g, "");
  return [
    ["Department Approval", `${r.department} Department Head`, "Approved", "2026-06-20 09:14", `APR-${key}-DH`],
    ["Document Validation", "Ms. Rhee · Finance Associate", "Validated", "2026-06-22 14:36", `APR-${key}-DV`],
    ["Final Approval", finalApprovalRole(r), "Approved", "2026-06-23 11:08", `APR-${key}-FA`],
  ];
};
const voucherFor = (r) => {
  if (r.currentStep < 9) return "";
  const typeLabel = paymentTypes[r.type].label;
  const withholdingTax = Math.round(r.amount * 0.02);
  const netPayment = r.amount - withholdingTax;
  const voucherNumber = `PV-${r.id.replace("-2026-", "-")}`;
  const checkNumber = r.currentStep >= 11 ? "CHK-004918" : "Pending bank processing";
  const certifications = approvalCertificationFor(r);
  return `<div class="voucher-card">
    <div class="voucher-heading"><div><span class="eyebrow">Payment Voucher</span><h4>${voucherNumber}</h4><p>Automated Payment System</p></div><button class="print-button" data-print-voucher="true">Print</button></div>
    <div class="voucher-meta"><span><small>Reference No.</small><strong>${r.id}</strong></span><span><small>Date</small><strong>2026-06-24</strong></span></div>
    <table class="voucher-table"><tbody>
      <tr><th>Payee</th><td>${r.vendor}</td><th>Department</th><td>${r.department}</td></tr>
      <tr><th>Requestor</th><td>${r.requestor}</td><th>Payment Method</th><td>Check payment</td></tr>
      <tr><th>Purpose</th><td colspan="3">${typeLabel} payment for ${r.vendor}</td></tr>
      <tr><th>Bank Account</th><td>BDO Operating Account - 1284</td><th>Check No.</th><td>${checkNumber}</td></tr>
    </tbody></table>
    <table class="voucher-table amount-table"><tbody>
      <tr><th>Gross Amount</th><td>${money(r.amount, r.currency || "PHP")}</td></tr>
      <tr><th>Less: Withholding Tax</th><td>${money(withholdingTax, r.currency || "PHP")}</td></tr>
      <tr class="net-row"><th>Net Payment</th><td>${money(netPayment, r.currency || "PHP")}</td></tr>
    </tbody></table>
    <section class="approval-certification"><div class="certification-heading"><div><span class="eyebrow">Digital Approval Certification</span><strong>System-verified approval trail</strong></div><small>No handwritten signature required</small></div>
      <div class="certification-list">${certifications.map(([stage, approver, decision, timestamp, id]) => `<div class="certification-record"><div><small>${stage}</small><strong>${approver}</strong></div><div><small>Decision</small><strong>${decision}</strong></div><div><small>Date and Time</small><strong>${timestamp}</strong></div><div><small>Approval ID</small><strong>${id}</strong></div></div>`).join("")}</div>
      <p>Authenticated through the Automated Payment System. Approval records are linked to request version ${r.id}-01.</p>
    </section>
  </div>`;
};
const fieldInput = (field) => field.kind === "textarea"
  ? `<label class="full">${field.label}<textarea placeholder="${field.value}"></textarea></label>`
  : `<label>${field.label}<input type="${field.kind === "date" ? "date" : "text"}" ${field.label === "Last Day of the Event" ? "data-event-end-date" : ""} ${field.kind === "date" ? `value="${field.label === "Last Day of the Event" && state.draftType === "cashAdvance" ? state.cashAdvanceEventEnd : field.value}"` : `placeholder="${field.value}"`}></label>`;
const uploadInput = (documentName) => `<label class="upload-row"><span>${documentName}</span><input type="file" ${documentName.includes("Billing / Quotation / SOA") ? "multiple" : ""}></label>`;

function setState(patch) {
  state = { ...state, ...patch };
  render();
}

function updateDraftLineItem(rowIndex, column, value) {
  const lineItemsByType = { ...state.lineItemsByType };
  lineItemsByType[state.draftType] = lineItemsByType[state.draftType].map((row, index) => index === rowIndex ? { ...row, [column]: value } : row);
  state = { ...state, lineItemsByType };
  const amount = state.draftType === "poPayment" ? (poSystemRecords.find((record) => record.id === state.selectedPO) || poSystemRecords[0]).amount : lineItemsByType[state.draftType].reduce((sum, item) => sum + (Number(item.Amount) || 0), 0);
  const amountInput = document.getElementById("draftAmount");
  const totalOutput = document.querySelector(".line-item-table tfoot strong");
  const routeOutput = document.querySelector(".route-box strong");
  if (amountInput) amountInput.value = amount;
  if (totalOutput) totalOutput.textContent = money(amount);
  if (routeOutput) routeOutput.textContent = route({ amount, budgeted: state.budgeted, type: state.draftType });
  const liquidationExpenses = document.getElementById("liquidationExpenses");
  const liquidationSettlement = document.getElementById("liquidationSettlement");
  if (liquidationExpenses) liquidationExpenses.textContent = money(amount);
  if (liquidationSettlement) liquidationSettlement.textContent = settlementFor(state.liquidationAdvanceAmount, amount);
}

function addDraftLineItem() {
  const emptyItem = Object.fromEntries(paymentTypes[state.draftType].lineColumns.map((column) => [column, column === "Amount" ? 0 : ""]));
  const lineItemsByType = { ...state.lineItemsByType, [state.draftType]: [...state.lineItemsByType[state.draftType], emptyItem] };
  setState({ lineItemsByType });
}

function removeDraftLineItem(rowIndex) {
  if (state.lineItemsByType[state.draftType].length === 1) return;
  const lineItemsByType = { ...state.lineItemsByType, [state.draftType]: state.lineItemsByType[state.draftType].filter((_, index) => index !== rowIndex) };
  setState({ lineItemsByType });
}

const draftAmountFor = (draft) => draft.lineItems.reduce((sum, item) => sum + (Number(item.Amount) || 0), 0);

function captureDraftControls() {
  return [...document.querySelectorAll(".request-form-panel input:not([type=file]), .request-form-panel select, .request-form-panel textarea")].map((control) => ({
    value: control.type === "checkbox" ? control.checked : control.value,
    checkbox: control.type === "checkbox",
    disabled: control.disabled,
  }));
}

function saveDraft({ silent = false } = {}) {
  const now = new Date().toISOString();
  const existing = state.drafts.find((draft) => draft.id === state.activeDraftId);
  const draft = {
    id: existing?.id || `DRAFT-${new Date().getFullYear()}-${String(state.drafts.length + 1).padStart(4, "0")}`,
    type: state.draftType,
    requestor: personas.requestor.name,
    department: "Marketing",
    savedAt: now,
    createdAt: existing?.createdAt || now,
    currency: state.draftCurrency,
    otherCurrency: state.otherCurrency,
    budgeted: state.budgeted,
    liquidationAdvanceAmount: state.liquidationAdvanceAmount,
    lineItems: state.lineItemsByType[state.draftType].map((item) => ({ ...item })),
    controls: captureDraftControls(),
  };
  state.drafts = existing ? state.drafts.map((item) => item.id === draft.id ? draft : item) : [...state.drafts, draft];
  state.activeDraftId = draft.id;
  if (!silent) render();
}

function restoreDraftControls() {
  const draft = state.drafts.find((item) => item.id === state.activeDraftId);
  if (!draft || state.requestMode !== "new") return;
  const controls = [...document.querySelectorAll(".request-form-panel input:not([type=file]), .request-form-panel select, .request-form-panel textarea")];
  draft.controls.forEach((saved, index) => {
    const control = controls[index];
    if (!control || control.disabled !== saved.disabled) return;
    if (saved.checkbox) control.checked = saved.value;
    else control.value = saved.value;
  });
}

function openDraft(id) {
  const draft = state.drafts.find((item) => item.id === id);
  if (!draft) return;
  state = {
    ...state,
    activeDraftId: draft.id,
    draftType: draft.type,
    draftCurrency: draft.currency,
    otherCurrency: draft.otherCurrency,
    budgeted: draft.budgeted,
    liquidationAdvanceAmount: draft.liquidationAdvanceAmount,
    lineItemsByType: { ...state.lineItemsByType, [draft.type]: draft.lineItems.map((item) => ({ ...item })) },
  };
  navigate(`/requests/new/${draft.type}`);
}

function submitSavedDraft(id) {
  const draft = state.drafts.find((item) => item.id === id);
  if (!draft) return;
  const config = paymentTypes[draft.type];
  const sequence = requests.filter((request) => request.type === draft.type).length + 151;
  const idValue = `${config.prefix}-${new Date().getFullYear()}-${String(sequence).padStart(4, "0")}`;
  const vendor = draft.lineItems.find((item) => item["Merchant Name"] || item.Supplier)?.["Merchant Name"] || draft.lineItems.find((item) => item.Supplier)?.Supplier || "To Be Confirmed";
  requests.unshift({
    id: idValue, type: draft.type, requestor: draft.requestor, department: draft.department, vendor,
    amount: draftAmountFor(draft), budgeted: draft.budgeted, status: "Department Approval", currentStep: 3,
    submitted: new Date().toISOString().slice(0, 10), returned: "", resubmitted: "", documents: 0, missing: 0,
    currency: draft.currency === "OTHER" ? draft.otherCurrency || "PHP" : draft.currency, unlocked: false,
    audit: [{ action: "Request Submitted", actor: draft.requestor, timestamp: new Date().toISOString(), reason: "Submitted to Department Head from saved draft." }],
    bankSubmittedAt: "", bankSubmittedBy: "", bankAuthorizedAt: "", bankAuthorizedBy: "", vendorNotifiedAt: "", vendorNotifiedBy: "", pickupAvailableAt: "", pickupAvailableBy: "",
  });
  state = { ...state, drafts: state.drafts.filter((item) => item.id !== id), activeDraftId: null, selectedId: idValue, requestMode: "new" };
  navigate(`/dashboard/request/${idValue}`);
}

function draftsView() {
  const drafts = state.drafts.filter((draft) => draft.requestor === personas.requestor.name);
  return `<section class="drafts-view"><div class="metric-detail-actions"><button type="button" class="back-button" data-new-request>+ New Request</button></div><section class="panel"><div class="panel-header"><div><span class="eyebrow">Requestor Workspace</span><h3>My Drafts</h3><p>Saved requests remain private until submitted to the department head.</p></div><span class="count">${drafts.length}</span></div><div class="table-wrap"><table><thead><tr><th>Draft</th><th>Type</th><th>Last Saved</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>${drafts.length ? drafts.map((draft) => `<tr><td><strong>${draft.id}</strong></td><td>${paymentTypes[draft.type].label}</td><td>${new Date(draft.savedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</td><td>${money(draftAmountFor(draft), draft.currency)}</td><td>${statusPill("Draft Request")}</td><td><div class="draft-row-actions"><button type="button" data-continue-draft="${draft.id}">Continue Editing</button><button type="button" class="confirmation-button" data-submit-draft="${draft.id}">Submit to Department Head</button><button type="button" class="danger" data-delete-draft="${draft.id}">Delete Draft</button></div></td></tr>`).join("") : `<tr><td colspan="6" class="empty-state">No saved drafts yet. Start a request and choose Save as Draft.</td></tr>`}</tbody></table></div></section></section>`;
}

function personaRequests(persona = state.persona) {
  const submittedRequests = requests.filter((request) => request.currentStep !== 1 && request.status !== "Draft Request");
  if (persona === "requestor") return submittedRequests.filter((request) => request.requestor === personas.requestor.name);
  if (persona === "coo") return submittedRequests.filter((request) => request.currentStep === 7);
  if (persona === "president") return submittedRequests.filter((request) => request.currentStep === 8);
  return submittedRequests;
}

function approvalRequests(persona = state.persona) {
  if (persona === "financeAssociate") return requests.filter((request) => [4, 9, 10, 12, 13].includes(request.currentStep));
  if (persona === "financeManager") return requests.filter((request) => request.currentStep === 5);
  if (persona === "coo") return requests.filter((request) => request.currentStep === 7);
  if (persona === "president") return requests.filter((request) => request.currentStep === 8);
  if (persona === "requestor") return [];
  return requests;
}

function shell(content) {
  const allNavGroups = [
    ["Overview", [["dashboard", "Dashboard", "▦"]]],
    ["Requests", [["request", "New Request", "+"], ["uploads", "Document Uploads", "↑"], ["documents", "Document Rules", "□"]]],
    ["Processing", [["approvals", "Approval Queue", "✓"], ["tracker", "Payment Tracker", "↗"]]],
    ["Records", [["emails", "Email Samples", "@"]]],
  ];
  const personaNav = {
    requestor: [["Overview", [["dashboard", "My Dashboard", "◦"]]], ["Requests", [["request", "New Request", "+"], ["uploads", "Document Uploads", "↑"]]], ["Tracking", [["tracker", "My Payment Tracker", "↗"]]]],
    financeAssociate: [["Overview", [["dashboard", "Finance Dashboard", "◦"]]], ["Processing", [["approvals", "Document Validation", "✓"], ["tracker", "Payment Tracker", "↗"]]], ["Reference", [["documents", "Document Rules", "□"], ["emails", "Email Samples", "@"]]]],
    financeManager: [["Overview", [["dashboard", "Finance Overview", "◦"]]], ["Processing", [["approvals", "Approval Queue", "✓"], ["tracker", "All Requests", "↗"]]], ["Reference", [["documents", "Document Rules", "□"]]]],
    coo: [["Overview", [["dashboard", "Executive Dashboard", "◦"]]], ["Approvals", [["approvals", "Approval Queue", "✓"]]]],
    president: [["Overview", [["dashboard", "Executive Dashboard", "◦"]]], ["Approvals", [["approvals", "Approval Queue", "✓"]]]],
  };
  const navGroups = personaNav[state.persona] || allNavGroups;
  const persona = personas[state.persona];
  const titles = { dashboard: "Payment Requests", request: "Create Payment Request", approvals: "Review and Approve", tracker: "Tracker and Reports", uploads: "Upload Required Documents", documents: "Required Documents", emails: "Workflow Email Samples" };
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand-block"><div class="brand-mark">AP</div><div><h1>Automated Payment System</h1><p>Workflow prototype</p></div></div>
        <nav class="nav-list" aria-label="Primary">${navGroups.map(([group, links]) => `<div class="nav-group"><span class="nav-group-label">${group}</span><div class="nav-group-links">${links.map(([id, label, icon]) => `<button data-tab="${id}" class="${state.tab === id ? "active" : ""}"><span>${icon}</span>${label}</button>`).join("")}</div></div>`).join("")}</nav>
      </aside>
      <main>
        <header class="topbar"><div><p class="eyebrow">${persona.subtitle}</p><h2>${titles[state.tab]}</h2></div><div class="persona-control"><label for="personaSwitcher">View As</label><select id="personaSwitcher">${Object.entries(personas).map(([id, option]) => `<option value="${id}" ${state.persona === id ? "selected" : ""}>${option.label}</option>`).join("")}</select><div class="user-chip">${persona.name}</div></div></header>
        ${content}
        ${unlockRequestModal()}
      </main>
    </div>`;
}

function unlockRequestModal() {
  const request = requests.find((item) => item.id === state.unlockRequestId);
  if (!request) return "";
  return `<div class="unlock-modal-backdrop" data-unlock-modal-backdrop><section class="unlock-modal" role="dialog" aria-modal="true" aria-labelledby="unlock-modal-title"><div class="unlock-modal-header"><div><span class="eyebrow">Authorized Action</span><h3 id="unlock-modal-title">Unlock ${request.id}?</h3><p>${paymentTypes[request.type].label} · ${request.department} · ${requestMoney(request)}</p></div><button type="button" class="unlock-modal-close danger" data-cancel-unlock aria-label="Close unlock request">×</button></div><div class="unlock-modal-body"><div class="unlock-warning"><strong>Approvals may need to be repeated.</strong><p>Changes made after Document Validation can affect validated documents, accounting entries, routing, and previous approval decisions.</p></div><label>Reason for Urgent Change <small>(Required)</small><textarea data-unlock-reason placeholder="Explain why this request must be reopened and what needs to change."></textarea></label><p class="unlock-audit-note">The authorizing user, reason, request reference, and date and time will be recorded in the audit trail.</p></div><div class="unlock-modal-actions"><button type="button" class="danger" data-cancel-unlock>Cancel</button><button type="button" class="danger" data-confirm-unlock="${request.id}" disabled>Confirm Unlock</button></div></section></div>`;
}

function statusPill(status) {
  return `<span class="status-pill ${pillTone(status)}">${status}</span>`;
}

function requestTable(rows = requests, combineStepStatus = false) {
  const headers = combineStepStatus ? `<th>Status</th><th>Submitted</th><th>Aging</th><th>Voucher</th><th>Type</th><th>Amount</th>` : `<th>Step</th><th>Submitted</th><th>Aging</th><th>Voucher</th><th>Type</th><th>Amount</th><th>Status</th>`;
  return `<section class="panel"><div class="panel-header"><h3>Live Requests</h3><span class="count">${rows.length}</span></div><div class="table-wrap"><table><thead><tr>${headers}</tr></thead><tbody>
    ${rows.length ? rows.map((r) => `<tr data-request="${r.id}" class="${state.selectedId === r.id ? "selected" : ""}">${combineStepStatus ? `<td><div class="step-status-cell">${statusPill(r.status)}</div></td><td>${r.submitted}</td><td><span class="aging-badge ${agingDays(r) > 30 ? "overdue" : ""}">${agingDays(r)}d</span></td><td>${r.id}</td><td>${paymentTypes[r.type].label}</td><td>${requestMoney(r)}</td>` : `<td>${stepLabel(r.currentStep)}</td><td>${r.submitted}</td><td><span class="aging-badge ${agingDays(r) > 30 ? "overdue" : ""}">${agingDays(r)}d</span></td><td>${r.id}</td><td>${paymentTypes[r.type].label}</td><td>${requestMoney(r)}</td><td>${statusPill(r.status)}</td>`}</tr>`).join("") : `<tr><td colspan="${combineStepStatus ? 6 : 7}" class="empty-state">No requests match the selected filters.</td></tr>`}
  </tbody></table></div></section>`;
}

function workflowSummary(r) {
  const currentIndex = Math.max(0, steps.findIndex(([id]) => id === r.currentStep));
  const current = steps[currentIndex];
  const previous = currentIndex > 0 ? steps[currentIndex - 1] : null;
  const next = currentIndex < steps.length - 1 ? steps[currentIndex + 1] : null;
  const progress = Math.round(((currentIndex + 1) / steps.length) * 100);
  return `<section class="workflow-summary"><div class="workflow-summary-heading"><div><span class="eyebrow">Workflow Progress</span><strong>${current[1]}</strong><small>${current[2]} · ${currentIndex + 1} of ${steps.length} stages</small></div><button type="button" data-view-workflow="${r.id}">View Full Workflow</button></div><div class="workflow-progress-bar" aria-label="${progress}% complete"><span style="width:${progress}%"></span></div><div class="workflow-summary-stages"><div><span>Previous</span><strong>${previous ? previous[1] : "None"}</strong></div><div class="current"><span>Current</span><strong>${current[1]}</strong></div><div><span>Next</span><strong>${next ? next[1] : "Complete"}</strong></div></div></section>`;
}

function requestActivity(r) {
  const formatActivityDate = (date, hour = 9) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(`${date}T${String(hour).padStart(2, "0")}:00:00`));
  const addDays = (date, days) => { const value = new Date(`${date}T00:00:00`); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10); };
  const currentIndex = Math.max(0, steps.findIndex(([id]) => id === r.currentStep));
  const activities = [{ date: formatActivityDate(r.submitted, 8), actor: r.requestor, title: r.currentStep === 1 ? "Draft Created" : "Request Submitted", detail: `${paymentTypes[r.type].label} request created for ${r.vendor}.`, tone: "system" }];
  if (r.currentStep >= 2) activities.push({ date: formatActivityDate(addDays(r.submitted, 1), 9), actor: r.requestor, title: "Supporting Documents Recorded", detail: `${r.documents} document${r.documents === 1 ? "" : "s"} attached${r.missing ? `; ${r.missing} still required` : "; document set complete"}.`, tone: r.missing ? "pending" : "complete" });
  if (r.returned) activities.push({ date: formatActivityDate(r.returned, 14), actor: "Workflow Reviewer", title: "Returned for Correction", detail: "Additional information or corrected support was requested from the requestor.", tone: "returned" });
  if (r.resubmitted) activities.push({ date: formatActivityDate(r.resubmitted, 10), actor: r.requestor, title: "Request Resubmitted", detail: "The requestor supplied updated information and returned the request to the workflow.", tone: "system" });
  if (currentIndex > 1) {
    const previous = steps[currentIndex - 1];
    activities.push({ date: formatActivityDate(addDays(r.submitted, Math.min(currentIndex, 8)), 11), actor: previous[2], title: `${previous[1]} Completed`, detail: `The ${previous[1].toLowerCase()} stage was completed and recorded by the system.`, tone: "complete" });
  }
  const current = steps[currentIndex];
  activities.push({ date: formatActivityDate(addDays(r.submitted, Math.min(currentIndex + 1, 9)), 13), actor: current[2], title: r.currentStep === 15 ? "Request Completed" : `Assigned to ${current[1]}`, detail: r.currentStep === 15 ? "The payment request completed all workflow stages." : `${current[2]} is the current workflow owner. Status: ${r.status}.`, tone: r.currentStep === 15 ? "complete" : "current" });
  (r.audit || []).forEach((record) => activities.push({ date: new Date(record.timestamp).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }), actor: record.actor, title: record.action, detail: record.reason || "Recorded automatically by the payment workflow.", tone: "complete" }));
  return `<section class="request-activity"><div class="request-activity-heading"><div><span class="eyebrow">Request History</span><h4>Request Activity</h4></div><span class="system-generated-tag">System Generated</span></div><div class="activity-timeline">${activities.slice(-5).reverse().map((activity) => `<article class="activity-entry ${activity.tone}"><span class="activity-dot"></span><div><div class="activity-entry-heading"><strong>${activity.title}</strong><time>${activity.date}</time></div><p>${activity.detail}</p><small>${activity.actor}</small></div></article>`).join("")}</div></section>`;
}

function detail(r, showWorkflowSummary = false) {
  const canEdit = state.persona === "requestor" && (r.currentStep < 4 || r.unlocked);
  const canUnlock = ["all", "financeManager"].includes(state.persona) && r.currentStep >= 4 && !r.unlocked;
  const requestControls = canEdit || canUnlock || r.unlocked ? `<div class="request-control-bar"><div><span class="eyebrow">Request Controls</span><strong>${r.unlocked ? "Unlocked for urgent correction" : canEdit ? "Editing is available before Document Validation" : "Request is workflow-locked"}</strong></div>${canEdit ? `<button type="button" data-edit-request="${r.id}">Edit Request</button>` : ""}${canUnlock ? `<button type="button" class="danger" data-unlock-request="${r.id}">Authorize Unlock</button>` : ""}</div>` : "";
  return `<section class="panel"><div class="panel-header"><h3>${r.id}</h3>${statusPill(r.status)}</div>
    <dl class="detail-list">
      <div><dt>Requestor</dt><dd>${r.requestor}</dd></div><div><dt>Department</dt><dd>${r.department}</dd></div>
      <div><dt>Payee</dt><dd>${r.vendor}</dd></div><div><dt>Amount</dt><dd>${requestMoney(r)}</dd></div>
      <div><dt>Currency</dt><dd>${r.currency || "PHP"}</dd></div><div><dt>Aging Days</dt><dd>${agingDays(r)} day${agingDays(r) === 1 ? "" : "s"}</dd></div>
      <div><dt>Documents</dt><dd>${r.documents} attached, ${r.missing} missing</dd></div><div><dt>Budget</dt><dd>${r.budgeted ? "Budgeted" : "Unbudgeted"}</dd></div>
    </dl>${requestControls}<div class="request-routing-card"><span class="eyebrow">Routing Threshold</span><strong>${route(r)}</strong><small>${r.budgeted ? "Budgeted request" : "Unbudgeted request"} · ${requestMoney(r)}</small></div>${showWorkflowSummary ? workflowSummary(r) : ""}${requestActivity(r)}${voucherFor(r)}</section>`;
}

function allRolesActionPanel(request) {
  if (state.persona !== "all") return "";
  const currentOwner = steps.find(([id]) => id === request.currentStep)?.[2] || "System";
  const stageActions = {
    1: ["Edit Request", "Requestor", "edit"],
    2: ["Manage Document Uploads", "Requestor", "documents"],
    3: ["Review Department Approval", "Department Head", "approval"],
    4: ["Open Document Validation", "Finance Associate", "approval"],
    5: ["Review Budget Approval", "Finance Manager", "approval"],
    7: ["Complete COO Approval", "COO", "approval"],
    8: ["Complete President Approval", "President", "approval"],
    8.5: ["Complete Board Approval", "Board Member", "approval"],
    9: ["Review and Print Voucher", "Finance Associate", "voucher"],
    10: ["Process Bank Payment", "Finance Associate", "tracker"],
    11: ["Complete Signatory Approval", "Authorized Signatories", "tracker"],
    12: ["Send Vendor Notification", "Finance Associate", "tracker"],
    13: ["Record Payment Release", "Finance Associate", "tracker"],
    14: ["Review Payment Tracker", "System / Finance", "tracker"],
    15: ["View Completed Record", "Finance Operations", "tracker"],
  };
  const [label, owner, action] = stageActions[request.currentStep] || ["View Request", currentOwner, "workflow"];
  const relatedActions = [
    [label, owner, action, "primary"],
    ["View Full Workflow", "All Authorized Roles", "workflow", "secondary"],
    ["Open Payment Tracker", "Finance / Requestor", "tracker", "secondary"],
    ...(request.currentStep >= 12 ? [["Preview Notification Email", request.currentStep === 12 ? "Vendor" : "Requestor and Vendor", "email", "secondary"]] : []),
    ...(request.currentStep >= 4 && !request.unlocked ? [["Authorize Unlock", "Finance Manager or Higher", "unlock", "danger"]] : []),
  ];
  return `<section class="panel all-role-actions"><div class="panel-header"><div><span class="eyebrow">All Roles View</span><h3>Available Actions</h3><p>Actions exposed by each persona for this request's current stage.</p></div><span class="count">${relatedActions.length}</span></div><div class="all-role-action-grid">${relatedActions.map(([actionLabel, actionOwner, actionId, tone]) => `<article><div><span>${actionOwner}</span><strong>${actionLabel}</strong></div><button type="button" class="${tone === "primary" ? "primary-button" : tone === "danger" ? "danger" : ""}" data-all-role-action="${actionId}" data-action-request="${request.id}">${actionLabel}</button></article>`).join("")}</div></section>`;
}

function dashboardFilters(visibleRequests = requests) {
  const filters = state.dashboardFilters;
  const statusOptions = [...new Set(visibleRequests.map((r) => r.status))].sort();
  const departmentOptions = [...new Set(visibleRequests.map((r) => r.department))].sort();
  const financeView = ["all", "financeAssociate", "financeManager"].includes(state.persona);
  return `<section class="panel dashboard-filter-panel"><div class="panel-header"><div><span class="eyebrow">Find a Request</span><h3>Search and Sort</h3></div><button type="button" class="clear-filter-button" data-clear-filters="true">Clear Filters</button></div><div class="dashboard-filters">
    <label>Voucher Number<input data-dashboard-filter="voucher" placeholder="Search voucher no." value="${filters.voucher}"></label>
    ${financeView ? `<label>Department<select data-dashboard-filter="department"><option value="all">All Departments</option>${departmentOptions.map((department) => `<option value="${department}" ${filters.department === department ? "selected" : ""}>${department}</option>`).join("")}</select></label>` : ""}
    <label>Type<select data-dashboard-filter="type"><option value="all">All Types</option>${Object.entries(paymentTypes).map(([id, type]) => `<option value="${id}" ${filters.type === id ? "selected" : ""}>${type.label}</option>`).join("")}</select></label>
    <label>Status<select data-dashboard-filter="status"><option value="all">All Statuses</option>${statusOptions.map((status) => `<option value="${status}" ${filters.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label>
    <label>Minimum Amount<input data-dashboard-filter="minAmount" type="number" min="0" placeholder="0" value="${filters.minAmount}"></label>
    <label>Maximum Amount<input data-dashboard-filter="maxAmount" type="number" min="0" placeholder="No limit" value="${filters.maxAmount}"></label>
    <label>Sort By<select data-dashboard-filter="sortBy"><option value="submitted" ${filters.sortBy === "submitted" ? "selected" : ""}>Submitted Date</option><option value="voucher" ${filters.sortBy === "voucher" ? "selected" : ""}>Voucher Number</option><option value="type" ${filters.sortBy === "type" ? "selected" : ""}>Type</option><option value="status" ${filters.sortBy === "status" ? "selected" : ""}>Status</option><option value="amount" ${filters.sortBy === "amount" ? "selected" : ""}>Amount</option></select></label>
    <label>Order<select data-dashboard-filter="sortDirection"><option value="asc" ${filters.sortDirection === "asc" ? "selected" : ""}>Ascending</option><option value="desc" ${filters.sortDirection === "desc" ? "selected" : ""}>Descending</option></select></label>
  </div>${financeView ? `<div class="report-actions"><div class="report-actions-copy"><span class="eyebrow">Department Transaction Report</span><p>Generate a report using the active filters above.</p></div><div class="report-action-buttons"><button type="button" class="report-button report-button-secondary" data-export-report="csv">Export Excel (CSV)</button><button type="button" class="report-button primary-button" data-print-report="true">Print / Save PDF</button></div></div>` : ""}</section>`;
}

function reportRows() {
  const filters = state.dashboardFilters;
  return personaRequests().filter((r) => {
    const voucherMatch = r.id.toLowerCase().includes(filters.voucher.trim().toLowerCase());
    const departmentMatch = filters.department === "all" || r.department === filters.department;
    const typeMatch = filters.type === "all" || r.type === filters.type;
    const statusMatch = filters.status === "all" || r.status === filters.status;
    const minMatch = filters.minAmount === "" || r.amount >= Number(filters.minAmount);
    const maxMatch = filters.maxAmount === "" || r.amount <= Number(filters.maxAmount);
    return voucherMatch && departmentMatch && typeMatch && statusMatch && minMatch && maxMatch;
  });
}

function downloadDepartmentReport() {
  const columns = ["Request Number", "Submitted", "Department", "Requestor", "Payee", "Type", "Currency", "Amount", "Status", "Current Owner", "Aging Days"];
  const rows = reportRows().map((r) => [r.id, r.submitted, r.department, r.requestor, r.vendor, paymentTypes[r.type].label, r.currency || "PHP", r.amount, r.status, steps.find(([id]) => id === r.currentStep)?.[2] || "System", agingDays(r)]);
  const csv = [columns, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `payment-requests-${state.dashboardFilters.department === "all" ? "all-departments" : state.dashboardFilters.department.toLowerCase().replaceAll(" ", "-")}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

const reportEscape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

function paymentReportData(rows) {
  const filters = state.dashboardFilters;
  const totals = Object.entries(rows.reduce((result, request) => {
    const currency = request.currency || "PHP";
    result[currency] = (result[currency] || 0) + request.amount;
    return result;
  }, {})).map(([currency, amount]) => ({ currency, amount, formatted: money(amount, currency) }));
  return {
    reportNumber: `PTR-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(rows.length).padStart(3, "0")}`,
    title: "Payment Request Transaction Report",
    generatedAt: new Date().toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" }),
    generatedBy: personas[state.persona].name,
    department: filters.department === "all" ? "All Departments" : filters.department,
    filters: [
      filters.type !== "all" && `Type: ${paymentTypes[filters.type].label}`,
      filters.status !== "all" && `Status: ${filters.status}`,
      filters.voucher && `Reference contains: ${filters.voucher}`,
      filters.minAmount !== "" && `Minimum amount: ${filters.minAmount}`,
      filters.maxAmount !== "" && `Maximum amount: ${filters.maxAmount}`,
    ].filter(Boolean),
    totals,
    rows: rows.map((request) => ({
      id: request.id,
      submitted: request.submitted,
      department: request.department,
      requestor: request.requestor,
      payee: request.vendor,
      type: paymentTypes[request.type].label,
      currency: request.currency || "PHP",
      amount: requestMoney(request),
      status: request.status,
      owner: steps.find(([id]) => id === request.currentStep)?.[2] || "System",
      aging: `${agingDays(request)} day${agingDays(request) === 1 ? "" : "s"}`,
    })),
  };
}

function paymentReportTemplate(data) {
  const cells = data.rows.length ? data.rows.map((row) => `<tr><td><strong>${reportEscape(row.id)}</strong><small>${reportEscape(row.type)}</small></td><td>${reportEscape(row.submitted)}</td><td>${reportEscape(row.department)}</td><td>${reportEscape(row.requestor)}</td><td>${reportEscape(row.payee)}</td><td class="amount">${reportEscape(row.amount)}</td><td>${reportEscape(row.status)}</td><td>${reportEscape(row.owner)}</td><td>${reportEscape(row.aging)}</td></tr>`).join("") : `<tr><td colspan="9" class="empty">No transactions match the selected filters.</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${reportEscape(data.title)}</title><style>@page{size:auto;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#1f2933;font:11px Arial,sans-serif}.report-header{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #9e1d20;padding-bottom:12px}.brand{display:flex;align-items:center;gap:10px}.mark{display:grid;width:38px;height:38px;place-items:center;border-radius:6px;color:#fff;background:#9e1d20;font-weight:700}.report-header h1{margin:0;font-size:20px}.report-header p,.meta span,.filters,.footer{color:#5c6670}.meta{text-align:right}.meta strong,.meta span{display:block}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}.summary div{border:1px solid #d9e0e5;border-radius:5px;padding:9px}.summary span,.totals span{display:block;color:#5c6670;font-size:9px;text-transform:uppercase}.summary strong,.totals strong{display:block;margin-top:3px}.filters{margin:0 0 12px;padding:8px 10px;background:#f7f3ee}.totals{display:flex;gap:8px;margin-bottom:12px}.totals div{min-width:140px;border-left:3px solid #9e1d20;padding:5px 9px;background:#faf7f7}table{width:100%;border-collapse:collapse;table-layout:auto}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #d9e0e5;padding:6px;text-align:left;vertical-align:top}th{color:#5c6670;background:#f2e8dc;font-size:8px;text-transform:uppercase}td{font-size:9px}td small{display:block;margin-top:2px;color:#5c6670}.amount{text-align:right;white-space:nowrap}.empty{text-align:center;padding:24px}.footer{display:flex;justify-content:space-between;margin-top:12px;border-top:1px solid #d9e0e5;padding-top:8px;font-size:9px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><header class="report-header"><div class="brand"><span class="mark">AP</span><div><h1>${reportEscape(data.title)}</h1><p>Automated Payment System</p></div></div><div class="meta"><strong>${reportEscape(data.reportNumber)}</strong><span>Generated ${reportEscape(data.generatedAt)}</span></div></header><section class="summary"><div><span>Department</span><strong>${reportEscape(data.department)}</strong></div><div><span>Transactions</span><strong>${data.rows.length}</strong></div><div><span>Generated By</span><strong>${reportEscape(data.generatedBy)}</strong></div></section><p class="filters"><strong>Applied Filters:</strong> ${data.filters.length ? data.filters.map(reportEscape).join(" · ") : "All request types and statuses"}</p><section class="totals">${data.totals.length ? data.totals.map((total) => `<div><span>${reportEscape(total.currency)} Total</span><strong>${reportEscape(total.formatted)}</strong></div>`).join("") : `<div><span>Report Total</span><strong>No transactions</strong></div>`}</section><table><thead><tr><th>Request</th><th>Submitted</th><th>Department</th><th>Requestor</th><th>Payee</th><th>Amount</th><th>Status</th><th>Current Owner</th><th>Aging</th></tr></thead><tbody>${cells}</tbody></table><footer class="footer"><span>${reportEscape(data.reportNumber)} · System Generated</span><span>For internal reference</span></footer><script>window.onload=()=>window.print()<\/script></body></html>`;
}

function printDepartmentReport() {
  const report = window.open("", "_blank");
  if (!report) return;
  report.opener = null;
  report.document.write(paymentReportTemplate(paymentReportData(reportRows())));
  report.document.querySelectorAll("th:nth-child(8), td:nth-child(8)").forEach((cell) => cell.remove());
  const emptyCell = report.document.querySelector("td.empty");
  if (emptyCell) emptyCell.colSpan = 8;
  report.document.close();
}

function workflow(currentStep) {
  return `<section class="panel workflow-panel"><div class="panel-header"><h3>Workflow map</h3><span class="eyebrow">Step ${stepLabel(currentStep)}</span></div><div class="workflow-track">
    ${steps.map(([id, name, owner]) => `<div class="workflow-step ${id < currentStep ? "done" : ""} ${id === currentStep ? "current" : ""}"><span>${stepLabel(id)}</span><strong>${name}</strong><small>${owner}</small></div>`).join("")}
  </div></section>`;
}

function dashboard() {
  const visibleRequests = personaRequests();
  const selected = visibleRequests.find((r) => r.id === state.selectedId) || visibleRequests[0] || requests[0];
  const total = visibleRequests.reduce((sum, r) => sum + r.amount, 0);
  const visibleCurrencies = [...new Set(visibleRequests.map((r) => r.currency || "PHP"))];
  const totalDisplay = visibleCurrencies.length === 1 ? money(total, visibleCurrencies[0]) : `${visibleCurrencies.length} currencies`;
  if (state.dashboardRequestId) {
    const dashboardRequest = visibleRequests.find((request) => request.id === state.dashboardRequestId);
    if (!dashboardRequest) return `<section class="metric-detail-view"><div class="metric-detail-actions"><button type="button" class="back-button" data-close-dashboard-detail>← Back to Dashboard</button></div><section class="panel empty-persona-view"><h3>Request Not Available</h3><p>This request is not visible to the selected persona.</p></section></section>`;
    return `<section class="metric-detail-view dashboard-request-detail"><div class="metric-detail-actions"><button type="button" class="back-button" data-close-dashboard-detail>← Back to Dashboard</button></div><div class="metric-detail-header"><div><span class="eyebrow">Full Request Details</span><h3>${dashboardRequest.id}</h3><p>${paymentTypes[dashboardRequest.type].label} · ${dashboardRequest.department} · ${requestMoney(dashboardRequest)}</p></div></div>${allRolesActionPanel(dashboardRequest)}${detail(dashboardRequest, true)}</section>`;
  }
  const pendingRequests = state.persona === "requestor"
    ? visibleRequests.filter((r) => ![1, 2, 15].includes(r.currentStep))
    : visibleRequests.filter((r) => [3, 4, 5, 7, 8, 8.5].includes(r.currentStep));
  const returnedRequests = visibleRequests.filter((r) => r.status.includes("Returned"));
  const unclaimedRequests = visibleRequests.filter((r) => r.currentStep === 12);
  const filters = state.dashboardFilters;
  const filteredRequests = visibleRequests.filter((r) => {
    const voucherMatch = r.id.toLowerCase().includes(filters.voucher.trim().toLowerCase());
    const typeMatch = filters.type === "all" || r.type === filters.type;
    const departmentMatch = filters.department === "all" || r.department === filters.department;
    const statusMatch = filters.status === "all" || r.status === filters.status;
    const minMatch = filters.minAmount === "" || r.amount >= Number(filters.minAmount);
    const maxMatch = filters.maxAmount === "" || r.amount <= Number(filters.maxAmount);
    return voucherMatch && departmentMatch && typeMatch && statusMatch && minMatch && maxMatch;
  }).sort((a, b) => {
    const values = {
      voucher: [a.id, b.id],
      type: [paymentTypes[a.type].label, paymentTypes[b.type].label],
      status: [a.status, b.status],
      amount: [a.amount, b.amount],
      submitted: [a.submitted, b.submitted],
    }[filters.sortBy];
    const result = typeof values[0] === "number" ? values[0] - values[1] : values[0].localeCompare(values[1]);
    return filters.sortDirection === "desc" ? -result : result;
  });
  const metricViews = {
    pending: { title: "Pending Approvals", description: "Requests currently waiting for a reviewer or approver.", rows: pendingRequests, total: `${pendingRequests.length} requests` },
    value: { title: "Open Request Value", description: "All active payment requests visible to this persona.", rows: visibleRequests, total: totalDisplay },
    returned: { title: "Returned Requests", description: "Requests sent back for corrections or additional information.", rows: returnedRequests, total: `${returnedRequests.length} requests` },
    unclaimed: { title: "Unclaimed Checks", description: "Checks available for release but not yet claimed by the payee.", rows: unclaimedRequests, total: `${unclaimedRequests.length} checks` },
  };
  if (state.dashboardMetric) {
    const view = metricViews[state.dashboardMetric];
    return `<section class="metric-detail-view"><div class="metric-detail-actions"><button type="button" class="back-button" data-close-metric="true">← Back to Dashboard</button></div><div class="metric-detail-header"><div><span class="eyebrow">Dashboard Detail</span><h3>${view.title}</h3><p>${view.description}</p></div><strong>${view.total}</strong></div><section class="panel"><div class="table-wrap"><table><thead><tr><th>Request</th><th>Type</th><th>Requestor</th><th>Department</th><th>Amount</th><th>Status</th></tr></thead><tbody>${view.rows.length ? view.rows.map((r) => `<tr data-metric-request="${r.id}"><td>${r.id}</td><td>${paymentTypes[r.type].label}</td><td>${r.requestor}</td><td>${r.department}</td><td>${money(r.amount)}</td><td>${statusPill(r.status)}</td></tr>`).join("") : `<tr><td colspan="6" class="empty-state">No matching requests right now.</td></tr>`}</tbody></table></div></section></section>`;
  }
  const workflowModal = state.dashboardWorkflow ? `<div class="workflow-modal-backdrop" data-workflow-modal="true"><section class="workflow-modal" role="dialog" aria-modal="true" aria-labelledby="workflow-modal-title"><div class="workflow-modal-header"><div><span class="eyebrow">Request Workflow</span><h3 id="workflow-modal-title">${selected.id}</h3><p>Complete approval and processing trail for this payment request.</p></div><button type="button" class="workflow-modal-close" data-close-workflow="true" aria-label="Close full workflow">×</button></div><div class="workflow-modal-body">${workflow(selected.currentStep)}</div></section></div>` : "";
  const pendingLabel = state.persona === "requestor" ? "Awaiting Approval" : ["coo", "president"].includes(state.persona) ? "Awaiting My Approval" : state.persona === "financeAssociate" ? "Awaiting Validation" : "Pending Approval";
  return `<section class="content-grid"><div class="persona-banner"><div><span class="eyebrow">Persona View</span><strong>${personas[state.persona].label}</strong></div><p>${state.persona === "all" ? "The original all-access prototype is retained in this view." : `Navigation, request visibility, and actions are scoped for ${personas[state.persona].label}.`}</p></div>
    <div class="metric-row"><button type="button" class="metric green" data-metric="pending"><span>Pending Approval</span><strong>${pendingRequests.length}</strong><small>View Requests →</small></button><button type="button" class="metric blue" data-metric="value"><span>Open Request Value</span><strong>${totalDisplay}</strong><small>View Breakdown →</small></button><button type="button" class="metric amber" data-metric="returned"><span>Returned</span><strong>${returnedRequests.length}</strong><small>View Requests →</small></button><button type="button" class="metric red" data-metric="unclaimed"><span>Unclaimed Checks</span><strong>${unclaimedRequests.length}</strong><small>View Checks →</small></button></div>
    ${dashboardFilters(visibleRequests)}<div class="two-column">${requestTable(filteredRequests, true)}${detail(selected, true)}</div>${workflowModal}
  </section>`;
}

function requestBuilder() {
  if (state.requestMode === "drafts") return draftsView();
  const config = paymentTypes[state.draftType];
  const lineItems = state.lineItemsByType[state.draftType];
  const draftAmount = lineItems.reduce((sum, item) => sum + (Number(item.Amount) || 0), 0);
  const isLiquidation = state.draftType === "liquidation";
  const isCashAdvance = state.draftType === "cashAdvance";
  const isPoPayment = state.draftType === "poPayment";
  const poRecord = poSystemRecords.find((record) => record.id === state.selectedPO) || poSystemRecords[0];
  const effectiveAmount = isPoPayment ? poRecord.amount : draftAmount;
  const currencyField = `<label>Currency<select data-draft-currency><option value="PHP" ${state.draftCurrency === "PHP" ? "selected" : ""}>PHP</option><option value="USD" ${state.draftCurrency === "USD" ? "selected" : ""}>USD</option><option value="EUR" ${state.draftCurrency === "EUR" ? "selected" : ""}>EUR</option><option value="OTHER" ${state.draftCurrency === "OTHER" ? "selected" : ""}>Other</option></select></label>${state.draftCurrency === "OTHER" ? `<label>Currency Code<input data-other-currency maxlength="8" placeholder="e.g. JPY" value="${state.otherCurrency}"></label>` : ""}`;
  const cashAdvanceFields = config.mandatoryFields.map((field) => `${fieldInput(field)}${field.label === "Last Day of the Event" ? `<label>Date to Liquidate <small>(System Generated: 15 Days After Event)</small><input data-liquidation-due-date type="date" value="${state.cashAdvanceLiquidationDate}" readonly></label>` : ""}`).join("");
  const systemDateField = `<input type="hidden" name="requestDate" value="${state.requestCreatedDate}">`;
  const primaryFields = state.draftType === "reimbursement"
    ? `${systemDateField}<label>Requestor's Name<input placeholder="Enter requestor's full name"></label>${config.mandatoryFields.map(fieldInput).join("")}<label>Voucher Number <small>(Finance Use Only)</small><input placeholder="Assigned after approval" disabled></label><label>Calculated Total<input id="draftAmount" type="number" value="${draftAmount}" readonly></label>${currencyField}`
    : isLiquidation
    ? `${systemDateField}<label>Cash Advance Requestor<input placeholder="Enter cash advance requestor"></label>${config.mandatoryFields.map(fieldInput).join("")}<label>Voucher Number <small>(Finance Use Only)</small><input placeholder="Assigned after approval" disabled></label><label>Calculated Total<input id="draftAmount" type="number" value="${draftAmount}" readonly></label>${currencyField}`
    : isCashAdvance
    ? `${systemDateField}<label>Cash Advance Requestor<input placeholder="Enter cash advance requestor"></label>${cashAdvanceFields}<label>Voucher Number <small>(Finance Use Only)</small><input placeholder="Assigned after approval" disabled></label><label>Cash Advance Amount<input id="draftAmount" type="number" value="${draftAmount}" readonly></label>${currencyField}`
    : isPoPayment
    ? `${systemDateField}<label>P.O. Reference Number <small>(From P.O. System)</small><select data-po-reference>${poSystemRecords.map((record) => `<option value="${record.id}" ${record.id === poRecord.id ? "selected" : ""}>${record.id}</option>`).join("")}</select></label><label>Requestor <small>(System Generated)</small><input value="${poRecord.requestor}" readonly></label><label>Payee / Vendor <small>(System Generated)</small><input value="${poRecord.payee}" readonly></label><label>Calculated Amount <small>(System Generated)</small><input id="draftAmount" type="number" value="${poRecord.amount}" readonly></label>${currencyField}<label>Department <small>(System Generated)</small><input value="${poRecord.department}" readonly></label>${config.mandatoryFields.map(fieldInput).join("")}`
    : `${systemDateField}<label>Requestor<input placeholder="Enter requestor's full name"></label><label>Payee / Vendor<input placeholder="Enter payee or vendor name"></label><label>Calculated Amount<input id="draftAmount" type="number" value="${draftAmount}" readonly></label>${currencyField}${config.mandatoryFields.map(fieldInput).join("")}`;
  const liquidationSummary = isLiquidation ? `<div class="liquidation-summary"><label>Cash Advance Amount<input id="liquidationAdvanceAmount" type="number" placeholder="e.g. 50000"></label><div><span>Total Expenses</span><strong id="liquidationExpenses">${money(draftAmount)}</strong></div><div><span>For Return / For Reimbursement</span><strong id="liquidationSettlement">${settlementFor(state.liquidationAdvanceAmount, draftAmount)}</strong></div><div class="cash-return-instructions"><span>Excess Cash Advance Return</span><strong>Security Bank · Account No. 0012-3456-7890</strong><small>Upload proof of transfer with the liquidation request.</small></div></div>` : "";
  const poSupplierNotice = isPoPayment && poRecord.newSupplier ? `<div class="po-system-notice"><strong>New Supplier Requirement</strong><p>BIR 2303 must be uploaded and validated in the P.O. system before this payment request can proceed.</p></div>` : "";
  const accountability = isCashAdvance ? `<section class="accountability-box"><h4>Accountability / Authority to Deduct</h4><p>I have read and understood the Cash Advance policies and procedures. I agree to fully liquidate this Cash Advance after completion of the transaction, project, or event. I authorize payroll deduction of any unliquidated or unsubstantiated cash advance in accordance with labor laws and company policy.</p><label><input type="checkbox" required> I acknowledge full accountability for the amount received and agree to the authority to deduct.</label></section><section class="cash-advance-policy"><h4>Cash Advance policy</h4><ul><li>Full-time employees may request up to PHP 40,000 and may hold only one cash advance at a time.</li><li>Liquidation is due on the 15th or 30th after the event, whichever is later.</li><li>Partial liquidation is required for projects lasting more than one month; receipts older than 30 days are not accepted.</li></ul></section>` : "";
  return `<section class="form-layout"><div class="panel request-form-panel"><div class="panel-header"><div><h3>${state.draftType === "reimbursement" ? "Reimbursement Details" : isLiquidation ? "Liquidation Details" : isCashAdvance ? "Cash Advance Details" : "Request Details"}</h3>${state.activeDraftId ? `<small class="draft-save-state">${state.activeDraftId} · Auto-save enabled</small>` : ""}</div><div class="request-header-actions"><button type="button" data-view-drafts>My Drafts (${state.drafts.length})</button><span class="voucher-preview">${state.activeDraftId || `${config.prefix}-2026-0150`}</span></div></div>
    <div class="segmented">${Object.entries(paymentTypes).map(([id, type]) => `<button data-type="${id}" class="${state.draftType === id ? "active" : ""}">${type.label}</button>`).join("")}</div>
    <div class="field-grid ${state.draftType === "reimbursement" || isLiquidation || isCashAdvance ? "reimbursement-fields" : ""}">${primaryFields}</div>${poSupplierNotice}${liquidationSummary}
    ${isCashAdvance || isLiquidation ? "" : `<label class="toggle-row"><input id="unbudgeted" type="checkbox" ${!state.budgeted ? "checked" : ""}>Unbudgeted Request</label>`}
    <div class="line-items-section"><div class="line-items-header"><div><span class="eyebrow">Request Breakdown</span><h4>Line Items</h4></div><button type="button" class="add-line-button" data-add-line="true">+ Add Line Item</button></div><div class="table-wrap"><table class="line-item-table"><thead><tr>${config.lineColumns.map((column) => `<th>${column}</th>`).join("")}<th><span class="sr-only">Actions</span></th></tr></thead><tbody>
      ${lineItems.map((item, rowIndex) => `<tr>${config.lineColumns.map((column) => { const isFile = column === "Receipt" || column === "Attachment"; const example = lineItemExamples[state.draftType]?.[0]?.[column] ?? column; return isFile ? `<td><input type="file" aria-label="${column} for line ${rowIndex + 1}"></td>` : `<td><input data-line-row="${rowIndex}" data-line-column="${column}" type="${column === "Amount" ? "number" : column.toLowerCase().includes("date") ? "date" : "text"}" value="${item[column] || ""}" placeholder="${example}"></td>`; }).join("")}<td><button type="button" class="remove-line-button" data-remove-line="${rowIndex}" title="Remove line item" aria-label="Remove line item ${rowIndex + 1}" ${lineItems.length === 1 ? "disabled" : ""}>×</button></td></tr>`).join("")}
    </tbody><tfoot><tr><th colspan="${config.lineColumns.length}"><span>${isCashAdvance ? "Total cash advance amount" : isLiquidation ? "Total liquidated amount" : isPoPayment ? "P.O. system amount" : "Total"}</span><strong>${money(effectiveAmount, state.draftCurrency)}</strong></th><td></td></tr></tfoot></table></div></div>${accountability}</div>
    <div class="panel"><div class="panel-header"><h3>Validation Preview</h3><span class="count">${config.required.length}</span></div><ul class="check-list">${config.required.map((item, index) => `<li><span class="${index < config.required.length - 1 ? "ok" : "warn"}">${index < config.required.length - 1 ? "✓" : "!"}</span>${item}</li>`).join("")}</ul>
    ${state.draftType === "reimbursement" || isPoPayment ? `<div class="line-attachment-notice"><strong>Documents are attached per line item.</strong><p>${isPoPayment ? "Approved P.O. and supplier records are retrieved from the P.O. system." : "Add the corresponding invoice or receipt in each reimbursement line."}</p></div>` : `<h4>Document Uploads</h4><div class="upload-list">${config.uploadDocuments.map(uploadInput).join("")}</div>`}
    <div class="route-box"><span class="eyebrow">System Route</span><strong>${route({ amount: effectiveAmount, budgeted: state.budgeted, type: state.draftType })}</strong></div></div><div class="panel request-action-footer"><div><span class="eyebrow">Request Actions</span><p>Save your progress or submit the completed request to your department head.</p></div><div class="request-submit-actions"><button type="button" data-save-draft>Save as Draft</button><button type="button" class="confirmation-button" data-submit-current>Submit to Department Head</button></div></div></section>`;
}

function validationReviewLines(request) {
  const amounts = [Math.round(request.amount * 0.6), request.amount - Math.round(request.amount * 0.6)];
  const typeLines = {
    reimbursement: [
      { reference: "INV-1042", date: "2026-06-18", particulars: "Hotel accommodation", expense: "Travel and Lodging", department: request.department, amount: amounts[0], attachment: "hotel-invoice-1042.pdf" },
      { reference: "OR-1048", date: "2026-06-19", particulars: "Local transportation", expense: "Transportation Expense", department: request.department, amount: amounts[1], attachment: "transport-receipt-1048.pdf" },
    ],
    liquidation: [
      { reference: "CA-2026-0049", date: "2026-06-18", particulars: "Event venue and meals", expense: "Events Expense", department: request.department, amount: amounts[0], attachment: "event-invoice.pdf" },
      { reference: "OR-2058", date: "2026-06-19", particulars: "Local transportation", expense: "Transportation Expense", department: request.department, amount: amounts[1], attachment: "transport-receipt.pdf" },
    ],
    poPayment: [
      { reference: "PO-2026-0106", date: "2026-06-18", particulars: "Office workstations", expense: "Office Equipment", department: request.department, amount: amounts[0], attachment: "approved-po.pdf" },
      { reference: "PO-2026-0106", date: "2026-06-19", particulars: "Delivery and installation", expense: "Installation Expense", department: request.department, amount: amounts[1], attachment: "supplier-invoice.pdf" },
    ],
    general: [
      { reference: "BILL-4401", date: "2026-06-18", particulars: "Service charge", expense: "Professional Fees", department: request.department, amount: amounts[0], attachment: "service-billing.pdf" },
      { reference: "INV-4402", date: "2026-06-19", particulars: "Operating expense", expense: "General Expense", department: request.department, amount: amounts[1], attachment: "supporting-invoice.pdf" },
    ],
    cashAdvance: [
      { reference: request.id, date: "2026-06-18", particulars: "Regional transportation", expense: "Transportation Expense", department: request.department, amount: amounts[0], attachment: "approved-budget.pdf" },
      { reference: request.id, date: "2026-06-19", particulars: "Meals and incidentals", expense: "Travel Expense", department: request.department, amount: amounts[1], attachment: "event-itinerary.pdf" },
    ],
  };
  return typeLines[request.type] || typeLines.general;
}

function documentValidationWorkspace(request) {
  const validation = state.documentValidation;
  const automaticNoEwt = request.amount <= 3000;
  const selectedEwt = automaticNoEwt ? "0" : validation.ewt;
  const ewtRate = selectedEwt === "other" ? Number(validation.otherEwt) || 0 : Number(selectedEwt) || 0;
  const ewtAmount = request.amount * (ewtRate / 100);
  const netAmount = request.amount - ewtAmount;
  const debitTotal = validation.entries.reduce((sum, entry) => sum + (Number(entry.debit) || 0), 0);
  const creditTotal = validation.entries.reduce((sum, entry) => sum + (Number(entry.credit) || 0), 0);
  const balanced = debitTotal > 0 && Math.abs(debitTotal - creditTotal) < 0.01;
  const reviewLines = validationReviewLines(request);
  const reviews = reviewLines.map((_, index) => validation.lineReviews[index] || { status: "pending", note: "", reviewer: "", reviewedAt: "" });
  const allLinesValid = reviews.length > 0 && reviews.every((review) => review.status === "valid");
  const correctionNotesComplete = reviews.every((review) => review.status !== "correction" || review.note.trim());
  const validCount = reviews.filter((review) => review.status === "valid").length;
  const correctionCount = reviews.filter((review) => review.status === "correction").length;
  const pendingCount = reviews.filter((review) => review.status === "pending").length;
  const documentsRecorded = validation.hardCopy || validation.softCopy;
  const complete = Boolean(validation.vat && selectedEwt !== "" && documentsRecorded && balanced && allLinesValid);
  const documentStatus = validation.hardCopy ? "Complete" : validation.softCopy ? "Awaiting Hard Copy" : "Missing Documents";
  const ewtOptions = [["0", "No EWT"], ["1", "1%"], ["2", "2%"], ["5", "5%"], ["10", "10%"], ["other", "Others"]];
  return `<section class="document-validation-workspace">
    <div class="validation-section"><div class="validation-section-heading"><div><span class="eyebrow">Tax Classification</span><h4>VAT and Expanded Withholding Tax</h4></div><span class="validation-status ${complete ? "complete" : "pending"}">${complete ? "Ready to Complete" : "In Progress"}</span></div>
      <div class="validation-choice-grid"><fieldset><legend>VAT Classification <span>*</span></legend><label><input type="radio" name="validationVat" value="subject" ${validation.vat === "subject" ? "checked" : ""}> Subject to VAT</label><label><input type="radio" name="validationVat" value="not-subject" ${validation.vat === "not-subject" ? "checked" : ""}> Not Subject to VAT</label></fieldset>
      <fieldset><legend>Expanded Withholding Tax <span>*</span></legend><div class="ewt-options">${ewtOptions.map(([value, label]) => `<label><input type="radio" name="validationEwt" value="${value}" ${selectedEwt === value ? "checked" : ""} ${automaticNoEwt && value !== "0" ? "disabled" : ""}> ${label}</label>`).join("")}</div>${selectedEwt === "other" ? `<label class="other-ewt">Other EWT Rate (%)<input type="number" min="0" max="100" step="0.01" data-validation-other-ewt value="${validation.otherEwt}" placeholder="Enter percentage"></label>` : ""}${automaticNoEwt ? `<p class="automatic-rule">No EWT automatically applied because the gross amount is ₱3,000 or below.</p>` : ""}</fieldset></div>
      <div class="tax-summary"><div><span>Gross Amount</span><strong>${money(request.amount)}</strong></div><div><span>EWT Rate</span><strong>${ewtRate}%</strong></div><div><span>EWT Amount</span><strong>${money(ewtAmount)}</strong></div><div><span>Net Amount After EWT</span><strong>${money(netAmount)}</strong></div></div>
    </div>
    <div class="validation-section"><div class="validation-section-heading"><div><span class="eyebrow">Submitted Documents</span><h4>Copy Receipt Status</h4></div><span class="document-status ${validation.hardCopy ? "complete" : "pending"}">${documentStatus}</span></div><div class="copy-options"><label><input type="checkbox" data-validation-copy="hardCopy" ${validation.hardCopy ? "checked" : ""}> Hard Copy Received</label><label><input type="checkbox" data-validation-copy="softCopy" ${validation.softCopy ? "checked" : ""}> Soft Copy Received</label></div>${validation.softCopy && !validation.hardCopy ? `<div class="hard-copy-reminder"><strong>Hard copies must still be submitted to Finance.</strong><span>This request can be reviewed, but the physical documents remain outstanding.</span></div>` : ""}</div>
    <div class="validation-section line-review-section"><div class="validation-section-heading"><div><span class="eyebrow">Line-Item Review</span><h4>Review Details and Attachments</h4></div><div class="line-review-counts"><span class="valid">${validCount} Valid</span><span class="correction">${correctionCount} Needs Correction</span><span>${pendingCount} Pending</span></div></div><div class="table-wrap"><table class="validation-line-table"><thead><tr><th>Reference</th><th>Date</th><th>Particulars</th><th>Expense Account</th><th>Department</th><th>Amount</th><th>Attachment</th><th>Review</th></tr></thead><tbody>${reviewLines.map((line, index) => { const review = reviews[index]; return `<tr class="review-${review.status}"><td>${line.reference}</td><td>${line.date}</td><td>${line.particulars}</td><td>${line.expense}</td><td>${line.department}</td><td>${money(line.amount)}</td><td><div class="attachment-actions"><strong>${line.attachment}</strong><button type="button" data-view-line-attachment="${index}">View</button><button type="button" data-download-line-attachment="${index}">Download</button></div></td><td><select data-line-review-status="${index}" aria-label="Review status for line ${index + 1}"><option value="pending" ${review.status === "pending" ? "selected" : ""}>Pending Review</option><option value="valid" ${review.status === "valid" ? "selected" : ""}>Valid</option><option value="correction" ${review.status === "correction" ? "selected" : ""}>Needs Correction</option></select><textarea data-line-review-note="${index}" placeholder="Add a line-specific review note">${review.note}</textarea>${review.reviewer ? `<small>Reviewed by ${review.reviewer} · ${review.reviewedAt}</small>` : ""}${review.status === "correction" && !review.note.trim() ? `<span class="line-note-required">A correction note is required.</span>` : ""}</td></tr>`; }).join("")}</tbody></table></div>${validation.attachmentPreview ? `<div class="attachment-preview-notice">Preview opened: <strong>${validation.attachmentPreview}</strong><button type="button" data-close-attachment-preview aria-label="Close attachment preview">×</button></div>` : ""}${!correctionNotesComplete ? `<p class="validation-requirements">Add a note explaining every line marked Needs Correction.</p>` : ""}</div>
    <div class="validation-section"><div class="validation-section-heading"><div><span class="eyebrow">Accounting Entry</span><h4>Manual Debit and Credit Entry</h4></div><button type="button" data-add-accounting-row>+ Add Entry</button></div><div class="table-wrap"><table class="accounting-entry-table"><thead><tr><th>Account Name</th><th>Debit</th><th>Credit</th><th><span class="sr-only">Action</span></th></tr></thead><tbody>${validation.entries.map((entry, index) => `<tr><td><input data-accounting-index="${index}" data-accounting-field="account" value="${entry.account}" placeholder="Enter account name"></td><td><input type="number" min="0" data-accounting-index="${index}" data-accounting-field="debit" value="${entry.debit || ""}" placeholder="0.00"></td><td><input type="number" min="0" data-accounting-index="${index}" data-accounting-field="credit" value="${entry.credit || ""}" placeholder="0.00"></td><td><button type="button" class="remove-line-button" data-remove-accounting-row="${index}" ${validation.entries.length === 1 ? "disabled" : ""} aria-label="Remove accounting entry ${index + 1}">×</button></td></tr>`).join("")}</tbody><tfoot><tr><th>Totals</th><th>${money(debitTotal)}</th><th>${money(creditTotal)}</th><th></th></tr></tfoot></table></div><div class="balance-status ${balanced ? "balanced" : "unbalanced"}">${balanced ? "Debit and credit totals are balanced." : `Entries are out of balance by ${money(Math.abs(debitTotal - creditTotal))}.`}</div></div>
    <div class="validation-section validation-completion"><div><span class="eyebrow">Completion Details</span><h4>Finalize Document Validation</h4></div><div class="validation-completion-grid"><label>Document Validation Completion Date<input type="date" value="${validation.completionDate}" readonly placeholder="Set when completed"></label><label>Check Number <small>(Optional)</small><input data-validation-check-number value="${validation.checkNumber}" placeholder="Enter check number when available"></label></div><label>Reviewer Note<textarea data-validation-reviewer-note>${validation.reviewerNote}</textarea></label><div class="approval-actions"><button type="button" class="confirmation-button" data-complete-validation ${complete ? "" : "disabled"}>${validation.completionDate ? "Validation Completed" : "Complete Validation and Notify Finance Manager"}</button><button type="button" class="danger" ${correctionCount && correctionNotesComplete ? "" : "disabled"}>Return Lines for Correction</button><button type="button" class="danger">Disapprove</button></div>${!complete ? `<p class="validation-requirements">Complete VAT, EWT, document receipt status, balanced accounting entries, and mark every line item Valid before completing validation.</p>` : ""}</div>
  </section>`;
}

function validationReadOnlySummary(request) {
  const validation = state.documentValidation;
  const lines = validationReviewLines(request);
  const savedResult = Boolean(validation.completionDate);
  const reviews = lines.map((_, index) => savedResult
    ? validation.lineReviews[index] || { status: "valid", note: "Validated against the supporting attachment.", reviewer: "Ms. Rhee", reviewedAt: "2026-08-05 10:30" }
    : { status: "valid", note: "Validated against the supporting attachment.", reviewer: "Ms. Rhee", reviewedAt: "2026-07-25 10:30" });
  const rate = validation.ewt && savedResult ? (validation.ewt === "other" ? Number(validation.otherEwt) || 0 : Number(validation.ewt) || 0) : 2;
  const tax = request.amount * rate / 100;
  const debitTotal = validation.entries.reduce((sum, entry) => sum + (Number(entry.debit) || 0), 0);
  const creditTotal = validation.entries.reduce((sum, entry) => sum + (Number(entry.credit) || 0), 0);
  const validCount = reviews.filter((review) => review.status === "valid").length;
  const correctionCount = reviews.filter((review) => review.status === "correction").length;
  const pendingCount = reviews.filter((review) => review.status === "pending").length;
  const outcome = correctionCount ? "Returned for Correction" : pendingCount ? "In Review" : "Completed";
  return `<section class="validation-readonly"><div class="validation-section-heading"><div><span class="eyebrow">Finance Validation Result</span><h4>Read-Only Document Validation Summary</h4></div><span class="validation-outcome ${outcome === "Completed" ? "complete" : "pending"}">${outcome}</span></div><div class="readonly-summary-grid"><div><span>Reviewed By</span><strong>Ms. Rhee</strong></div><div><span>Completion Date</span><strong>${validation.completionDate || "2026-07-25"}</strong></div><div><span>VAT Classification</span><strong>${validation.vat === "subject" ? "Subject to VAT" : "Not Subject to VAT"}</strong></div><div><span>EWT</span><strong>${rate}% · ${money(tax)}</strong></div><div><span>Net Amount</span><strong>${money(request.amount - tax)}</strong></div><div><span>Submitted Copies</span><strong>${savedResult ? `${validation.hardCopy ? "Hard Copy" : "Hard Copy Pending"} · ${validation.softCopy ? "Soft Copy" : "No Soft Copy"}` : "Hard Copy · Soft Copy"}</strong></div><div><span>Accounting Entries</span><strong>${Math.abs(debitTotal - creditTotal) < 0.01 ? "Balanced" : "Out of Balance"} · ${money(debitTotal)}</strong></div><div><span>Check Number</span><strong>${validation.checkNumber || "Not Yet Assigned"}</strong></div></div><div class="readonly-line-summary"><div class="line-review-counts"><span class="valid">${validCount} Valid</span><span class="correction">${correctionCount} Needs Correction</span><span>${pendingCount} Pending</span></div><div class="table-wrap"><table class="validation-line-table readonly"><thead><tr><th>Reference</th><th>Particulars</th><th>Expense Account</th><th>Department</th><th>Amount</th><th>Attachment</th><th>Review Result</th></tr></thead><tbody>${lines.map((line, index) => { const review = reviews[index]; return `<tr class="review-${review.status}"><td>${line.reference}</td><td>${line.particulars}</td><td>${line.expense}</td><td>${line.department}</td><td>${money(line.amount)}</td><td><div class="attachment-actions"><strong>${line.attachment}</strong><button type="button" data-view-line-attachment="${index}">View</button><button type="button" data-download-line-attachment="${index}">Download</button></div></td><td><span class="review-result ${review.status}">${review.status === "valid" ? "Valid" : review.status === "correction" ? "Needs Correction" : "Pending Review"}</span><p>${review.note || "No review note."}</p><small>${review.reviewer || "Ms. Rhee"} · ${review.reviewedAt || "2026-07-25 10:30"}</small></td></tr>`; }).join("")}</tbody></table></div></div><div class="readonly-review-note"><span>General Reviewer Note</span><p>${validation.reviewerNote}</p></div></section>`;
}

function documentViewerModal(request) {
  const filename = state.documentValidation.attachmentPreview;
  if (!filename) return "";
  const line = validationReviewLines(request).find((item) => item.attachment === filename) || validationReviewLines(request)[0];
  const extension = filename.split(".").pop().toUpperCase();
  return `<div class="document-viewer-backdrop" data-document-viewer-backdrop><section class="document-viewer" role="dialog" aria-modal="true" aria-labelledby="document-viewer-title"><header class="document-viewer-header"><div><span class="eyebrow">Uploaded Document</span><h3 id="document-viewer-title">${filename}</h3><p>${extension} · Uploaded with ${request.id}</p></div><button type="button" class="document-viewer-close" data-close-document-viewer aria-label="Close document viewer">×</button></header><div class="document-viewer-toolbar"><div><button type="button" aria-label="Previous page" disabled>←</button><span>Page 1 of 1</span><button type="button" aria-label="Next page" disabled>→</button></div><div><button type="button" aria-label="Zoom out">−</button><span>100%</span><button type="button" aria-label="Zoom in">+</button><button type="button" data-download-viewer-document>Download</button></div></div><div class="document-viewer-canvas"><article class="document-paper"><div class="document-paper-brand"><div><span>LCI</span><strong>${request.vendor}</strong></div><small>Supporting Payment Document</small></div><div class="document-paper-title"><span>${extension} Preview</span><h2>${line.particulars}</h2></div><dl><div><dt>Reference Number</dt><dd>${line.reference}</dd></div><div><dt>Document Date</dt><dd>${line.date}</dd></div><div><dt>Request Number</dt><dd>${request.id}</dd></div><div><dt>Department</dt><dd>${line.department}</dd></div></dl><table><thead><tr><th>Description</th><th>Expense Account</th><th>Amount</th></tr></thead><tbody><tr><td>${line.particulars}</td><td>${line.expense}</td><td>${money(line.amount)}</td></tr></tbody><tfoot><tr><th colspan="2">Document Total</th><th>${money(line.amount)}</th></tr></tfoot></table><div class="document-paper-footer"><p>This preview represents the uploaded supporting document in the prototype.</p><span>Verified upload · ${filename}</span></div></article></div></section></div>`;
}

function downloadValidationDocument(request, index) {
  const line = validationReviewLines(request)[index] || validationReviewLines(request)[0];
  const escapePdf = (value) => String(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7E]/g, "-");
  const lines = [
    "LCI Supporting Payment Document",
    `File: ${line.attachment}`,
    `Request: ${request.id}`,
    `Reference: ${line.reference}`,
    `Document Date: ${line.date}`,
    `Payee: ${request.vendor}`,
    `Department: ${line.department}`,
    `Particulars: ${line.particulars}`,
    `Expense Account: ${line.expense}`,
    `Amount: PHP ${Number(line.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
    "Generated from the Automated Payment System prototype.",
  ];
  const stream = `BT\n/F1 16 Tf\n72 760 Td\n(${escapePdf(lines[0])}) Tj\n/F1 11 Tf\n${lines.slice(1).map((text) => `0 -28 Td\n(${escapePdf(text)}) Tj`).join("\n")}\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, objectIndex) => { offsets.push(pdf.length); pdf += `${objectIndex + 1} 0 obj\n${object}\nendobj\n`; });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = line.attachment.toLowerCase().endsWith(".pdf") ? line.attachment : `${line.attachment}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function approvals() {
  const queue = approvalRequests();
  if (!queue.length) return `<section class="panel empty-persona-view"><span class="eyebrow">Requestor View</span><h3>No Approval Queue</h3><p>Requestors can monitor progress and respond to returned requests from their dashboard.</p></section>`;
  const selected = queue.find((r) => r.id === state.selectedId) || queue[0];
  if (state.approvalView === "list") return `<section class="approval-landing"><div class="approval-page-intro"><div><span class="eyebrow">Approval Workspace</span><h3>Live Requests</h3><p>Select a request to review its submitted details.</p></div><span class="count">${queue.length} requests</span></div>${requestTable(queue)}</section>`;
  if (state.approvalView === "detail") return `<section class="approval-request-page"><div class="metric-detail-actions"><button type="button" class="back-button" data-back-approval-list>← Back to Live Requests</button></div><div class="metric-detail-header"><div><span class="eyebrow">Request Review</span><h3>${selected.id}</h3><p>Review the request information before beginning the approval process.</p></div>${statusPill(selected.status)}</div>${detail(selected, true)}<div class="approval-start-card"><div><span class="eyebrow">Next Step</span><h4>Ready to Review This Request?</h4><p>Continue to the dedicated approval workspace to validate documents, record notes, and make a decision.</p></div><button type="button" class="primary-button" data-start-approval="${selected.id}">Go Through Approval</button></div></section>`;
  const actionTitle = state.persona === "financeAssociate" && selected.currentStep === 4 ? "Document Validation" : "Approval Action";
  const primaryAction = state.persona === "financeAssociate" && selected.currentStep === 4 ? "Open Document Validation" : "Approve and Notify Next Owner";
  const isDocumentValidation = state.persona === "financeAssociate" && selected.currentStep === 4;
  const showReadOnlyValidation = ["financeManager", "coo", "president"].includes(state.persona);
  return `<section class="approval-review-page"><div class="metric-detail-actions"><button type="button" class="back-button" data-back-approval-detail="${selected.id}">← Back to Request Details</button></div><div class="metric-detail-header"><div><span class="eyebrow">Approval Workspace</span><h3>${actionTitle}</h3><p>${selected.id} · ${paymentTypes[selected.type].label} · ${money(selected.amount)}</p></div>${statusPill(selected.status)}</div><section class="panel action-panel">${detail(selected)}${isDocumentValidation ? documentValidationWorkspace(selected) : `${showReadOnlyValidation ? validationReadOnlySummary(selected) : ""}<div class="approval-actions"><button class="confirmation-button">${primaryAction}</button><button class="danger">Request More Information</button><button class="danger">Disapprove</button></div><label>Reviewer Note<textarea>Validated supporting documents and routing threshold.</textarea></label>`}</section>${documentViewerModal(selected)}</section>`;
}

function paymentOperationsPanel(request) {
  if (![10, 11, 12, 13].includes(request.currentStep) && !request.pickupAvailableAt) return "";
  const actor = personas[state.persona].name;
  const canFinanceAct = ["all", "financeAssociate"].includes(state.persona);
  const canAuthorize = state.persona === "all";
  const records = [
    request.bankSubmittedAt && ["For Bank Approval", request.bankSubmittedAt, request.bankSubmittedBy],
    request.bankAuthorizedAt && ["Signatory Approval Completed", request.bankAuthorizedAt, request.bankAuthorizedBy],
    request.vendorNotifiedAt && ["Vendor Email Sent", request.vendorNotifiedAt, request.vendorNotifiedBy],
    request.pickupAvailableAt && ["Payment Available for Pick-up", request.pickupAvailableAt, request.pickupAvailableBy],
  ].filter(Boolean);
  const action = request.currentStep === 10
    ? `<button type="button" class="primary-button operation-button" data-bank-approval="${request.id}" ${canFinanceAct ? "" : "disabled"}>For Bank Approval</button>`
    : request.currentStep === 11
    ? `<button type="button" class="primary-button operation-button" data-signatory-approval="${request.id}" ${canAuthorize ? "" : "disabled"}>For Signatory Approval</button>`
    : request.currentStep === 12
    ? `<button type="button" class="primary-button operation-button" data-send-vendor-email="${request.id}" ${canFinanceAct ? "" : "disabled"}>Send Vendor Email</button>`
    : request.pickupAvailableAt
    ? `<button type="button" class="operation-button completed" disabled>Payment Available for Pick-up ✓</button>`
    : `<button type="button" class="primary-button operation-button" data-payment-pickup="${request.id}" ${canFinanceAct ? "" : "disabled"}>Payment Available for Pick-up</button>`;
  const help = request.currentStep === 10 ? "Submit the prepared payment instruction to the bank approval queue." : request.currentStep === 11 ? "Authorized signatories review and approve the bank instruction." : request.currentStep === 12 ? "Send the automated payment-processing email to the vendor." : "Record that the payment can now be collected and notify the requestor and vendor.";
  return `<section class="panel payment-operation-panel"><div class="panel-header"><div><span class="eyebrow">Payment Operations</span><h3>${request.status}</h3></div>${statusPill(request.status)}</div><p>${help}</p><div class="payment-operation-action">${action}<small>Action performed as ${actor}</small></div>${records.length ? `<div class="operation-audit-list">${records.map(([label, timestamp, user]) => `<div><span>${label}</span><strong>${new Date(timestamp).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</strong><small>${user}</small></div>`).join("")}</div>` : ""}</section>`;
}

function tracker() {
  const visibleRequests = personaRequests();
  const selected = visibleRequests.find((r) => r.id === state.trackerRequestId);
  if (selected) return `<section class="metric-detail-view"><div class="metric-detail-actions"><button type="button" class="back-button" data-close-tracker="true">← Back to Payment Tracker</button></div><div class="metric-detail-header"><div><span class="eyebrow">Tracker Detail</span><h3>${selected.id}</h3><p>Review request information and its current payment progress.</p></div>${statusPill(selected.status)}</div>${paymentOperationsPanel(selected)}${detail(selected)}${workflow(selected.currentStep)}</section>`;
  const bankStatus = (request) => request.currentStep === 10 ? `<button type="button" class="tracker-status-link pending" data-tracker-request="${request.id}">For Bank Approval</button>` : request.currentStep === 11 ? `<button type="button" class="tracker-status-link pending" data-tracker-request="${request.id}">For Signatory Approval</button>` : request.currentStep > 11 ? `<span class="tracker-status-text complete">Authorized</span>` : `<span class="tracker-status-text">Not Started</span>`;
  const releaseStatus = (request) => request.pickupAvailableAt ? `<span class="tracker-status-text complete">Available for Pick-up</span>` : request.currentStep === 12 ? `<span class="tracker-status-text pending">Vendor Email Pending</span>` : request.currentStep === 13 ? `<button type="button" class="tracker-status-link pending" data-tracker-request="${request.id}">Payment Release</button>` : request.currentStep > 13 ? `<span class="tracker-status-text complete">Released</span>` : `<span class="tracker-status-text">Pending</span>`;
  return `<section class="panel"><div class="panel-header"><h3>Payment Tracker</h3><button class="icon-button" title="Export Report">↧</button></div><div class="table-wrap"><table><thead><tr><th>Voucher</th><th>Submitted</th><th>Returned</th><th>Resubmitted</th><th>Approval</th><th>Bank Status</th><th>Payment Release</th></tr></thead><tbody>${visibleRequests.map((r, i) => `<tr data-tracker-request="${r.id}"><td>${r.id}</td><td>${r.submitted}</td><td>${r.returned || "-"}</td><td>${r.resubmitted || "-"}</td><td>${i === 0 ? "Pending" : "2026-06-24"}</td><td>${bankStatus(r)}</td><td>${releaseStatus(r)}</td></tr>`).join("")}</tbody></table></div><div class="report-band"><div><span class="eyebrow">Report</span><strong>Unclaimed Checks</strong></div><p>Flags checks marked available but not yet released to the payee.</p></div></section>`;
}

function documentUploads() {
  const selected = uploadSamples.find((request) => request.id === state.uploadId) || uploadSamples[0];
  const required = selected.documents.filter((document) => document.required);
  const completed = required.filter((document) => document.file).length;
  return `<section class="document-upload-layout">
    <section class="panel upload-request-list"><div class="panel-header"><h3>Requests Needing Documents</h3><span class="count">${uploadSamples.length}</span></div><div class="upload-request-buttons">
      ${uploadSamples.map((request) => { const requiredDocuments = request.documents.filter((document) => document.required); const uploadedDocuments = requiredDocuments.filter((document) => document.file).length; return `<button data-upload-request="${request.id}" class="${selected.id === request.id ? "active" : ""}"><div><strong>${request.id}</strong><span>${paymentTypes[request.type].label}</span></div><small>${uploadedDocuments}/${requiredDocuments.length} required</small></button>`; }).join("")}
    </div></section>
    <section class="panel upload-workspace"><div class="panel-header"><div><span class="eyebrow">${paymentTypes[selected.type].label}</span><h3>${selected.id}</h3></div><span class="upload-progress ${completed === required.length ? "complete" : "pending"}">${completed}/${required.length} required uploaded</span></div>
      <dl class="upload-request-meta"><div><dt>Requestor</dt><dd>${selected.requestor}</dd></div><div><dt>Department</dt><dd>${selected.department}</dd></div><div><dt>Payee</dt><dd>${selected.vendor}</dd></div><div><dt>Amount</dt><dd>${money(selected.amount)}</dd></div></dl>
      <div class="document-file-list">${selected.documents.map((document) => `<article class="document-file-row ${document.file ? "uploaded" : "missing"}"><div class="document-file-info"><div><strong>${document.name}</strong><span class="${document.required ? "required-tag" : "conditional-tag"}">${document.required ? "Required" : "Conditional"}</span></div>${document.file ? `<p><span class="file-icon">${document.file.split(".").pop().toUpperCase()}</span>${document.file} <small>${document.size}</small></p>` : `<p class="missing-file">No File Uploaded</p>`}</div><label class="file-picker"><span>${document.file ? "Replace File" : "Add File"}</span><input type="file" aria-label="${document.file ? "Replace" : "Add"} ${document.name}"></label></article>`).join("")}</div>
      <div class="upload-footer"><p>Accepted: PDF, JPG, PNG, XLSX. Maximum 10 MB per file.</p><button class="primary-button">Save Documents</button></div>
    </section>
  </section>`;
}

function documents() {
  return `<section class="doc-grid">${Object.entries(paymentTypes).map(([, type]) => `<article class="panel"><h3>${type.label}</h3><h4>Mandatory fields</h4><ul class="check-list">${type.required.map((item) => `<li><span class="ok">✓</span>${item}</li>`).join("")}</ul><h4>Upload documents</h4><div class="chip-row">${type.uploadDocuments.map((item) => `<span>${item}</span>`).join("")}</div></article>`).join("")}<article class="panel todo-panel"><h3>Future modules</h3><div class="chip-row"><span>Petty Cash</span><span>Credit Card Payments</span><span>Cash Advance Guidelines</span><span>Procurement alignment</span></div></article></section>`;
}

function emails() {
  const step = steps.find(([id]) => id === state.emailStep);
  const request = requests.find((item) => item.currentStep === state.emailStep) || requests[0];
  const [recipient, subject, trigger, intro, message, action] = emailTemplates[state.emailStep];
  const completionEmail = state.emailStep === 15;
  const vendorEmail = state.emailStep === 12;
  const releaseEmail = state.emailStep === 13;
  const backendEmail = vendorEmail || releaseEmail || completionEmail;
  const recipientDisplay = vendorEmail ? `${request.vendor} <vendor@example.com>` : releaseEmail || completionEmail ? `${request.requestor} <requestor@example.com>; ${request.vendor} <vendor@example.com>` : recipient;
  const greeting = vendorEmail ? request.vendor : releaseEmail || completionEmail ? `${request.requestor} and ${request.vendor}` : recipient;
  const templateKey = vendorEmail ? "vendor_payment_processing_v1" : releaseEmail ? "payment_pickup_available_v1" : "payment_completion_v1";
  const eventName = vendorEmail ? "payment.vendor_notification.ready" : releaseEmail ? "payment.pickup.available" : "payment.transaction.completed";
  const recipientFields = vendorEmail ? "request.vendor.email" : "request.requestor.email, request.vendor.email";
  return `<section class="email-layout">
    <section class="panel email-stage-list"><div class="panel-header"><h3>Workflow stages</h3><span class="count">${steps.length}</span></div><div class="email-stage-buttons">
      ${steps.map(([id, name]) => `<button data-email-step="${id}" class="${state.emailStep === id ? "active" : ""}"><span>${stepLabel(id)}</span><div><strong>${name}</strong><small>To: ${emailTemplates[id][0]}</small></div></button>`).join("")}
    </div></section>
    <section class="email-preview-wrap"><div class="email-meta-panel">
      <div><span>To</span><strong>${recipientDisplay}</strong></div><div><span>Cc</span><strong>Finance Operations</strong></div>
      <div><span>Subject</span><strong>${subject.replace("{{request_id}}", request.id)}${subject.includes("{{request_id}}") ? "" : ` | ${request.id}`}</strong></div><div><span>Sent when</span><strong>${trigger}</strong></div>
    </div><article class="email-preview"><div class="email-brand"><span>AP</span><strong>Automated Payment System</strong></div><div class="email-body">
      <span class="email-step-label">Step ${stepLabel(step[0])}: ${step[1]}</span><h3>${intro}</h3><p>Hello ${greeting},</p><p>${message.replace("{{payee_name}}", request.vendor)}</p>
      <div class="email-request-summary"><div><span>Request</span><strong>${request.id}</strong></div><div><span>Requestor</span><strong>${request.requestor}</strong></div><div><span>Payee</span><strong>${request.vendor}</strong></div><div><span>Department</span><strong>${request.department}</strong></div><div><span>Type</span><strong>${paymentTypes[request.type].label}</strong></div><div><span>Amount</span><strong>${money(request.amount)}</strong></div></div>
      <button class="email-action">${action}</button>${backendEmail ? `<p class="email-deadline">No reply is required. Keep this email for your records.</p>` : `<p class="email-deadline">Please complete this action within two business days.</p>`}<p class="email-fallback">If the button does not work, open: https://payments.example.local/requests/${request.id}</p>
    </div><footer>This is an automated workflow notification. Replies are not monitored.</footer></article></section>
    ${backendEmail ? `<section class="panel email-backend-contract"><div class="panel-header"><div><span class="eyebrow">Backend Email Contract</span><h3>${vendorEmail ? "Vendor Processing Notification" : releaseEmail ? "Payment Pick-up Notification" : "Transaction Completion Notification"}</h3></div><span class="count">Ready</span></div><dl><div><dt>Event</dt><dd>${eventName}</dd></div><div><dt>Template Key</dt><dd>${templateKey}</dd></div><div><dt>Recipients</dt><dd>${recipientFields}</dd></div><div><dt>Idempotency Key</dt><dd>${templateKey}:${request.id}</dd></div></dl><p>Required variables: request_id, requestor_name, requestor_email, vendor_name, vendor_email, update_date, update_time, updated_by, currency, amount, payment_method, payment_reference, and record_url.</p></section>` : ""}
  </section>`;
}

function render() {
  const views = { dashboard, request: requestBuilder, approvals, tracker, uploads: documentUploads, documents, emails };
  document.getElementById("root").innerHTML = shell(views[state.tab]());
  const pendingMetricLabel = document.querySelector('[data-metric="pending"] span');
  if (pendingMetricLabel) pendingMetricLabel.textContent = state.persona === "requestor" ? "Awaiting Approval" : ["coo", "president"].includes(state.persona) ? "Awaiting My Approval" : state.persona === "financeAssociate" ? "Awaiting Validation" : "Pending Approval";
  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.tab === "request" ? `/requests/new/${state.draftType}` : tabRoutes[button.dataset.tab])));
  document.querySelector("#personaSwitcher")?.addEventListener("change", (event) => {
    const persona = event.target.value;
    const visible = personaRequests(persona);
    state = { ...state, persona, selectedId: visible[0]?.id || requests[0].id, dashboardMetric: null, dashboardWorkflow: false };
    navigate("/dashboard");
  });
  document.querySelectorAll("[data-line-review-status]").forEach((select) => {
    const index = Number(select.dataset.lineReviewStatus);
    const approved = state.documentValidation.lineReviews[index]?.status === "valid";
    const button = document.createElement("button");
    button.type = "button";
    button.className = `approve-document-button confirmation-button ${approved ? "approved" : ""}`;
    button.dataset.approveLineDocument = String(index);
    button.textContent = approved ? "Approved ✓" : "Approve Document";
    button.disabled = approved;
    select.parentElement?.insertBefore(button, select);
  });
  if (state.documentValidation.documentsValidatedAt) {
    const lineReviewSection = document.querySelector(".line-review-section");
    const recorded = document.createElement("div");
    recorded.className = "system-validation-record";
    recorded.innerHTML = `<span>System Validation Record</span><strong>All documents validated on ${new Date(state.documentValidation.documentsValidatedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</strong><small>Recorded automatically by the system.</small>`;
    lineReviewSection?.appendChild(recorded);
  }
  document.querySelectorAll('input[name="validationVat"]').forEach((input) => input.addEventListener("change", () => setState({ documentValidation: { ...state.documentValidation, vat: input.value } })));
  document.querySelectorAll('input[name="validationEwt"]').forEach((input) => input.addEventListener("change", () => setState({ documentValidation: { ...state.documentValidation, ewt: input.value } })));
  document.querySelector("[data-validation-other-ewt]")?.addEventListener("change", (event) => setState({ documentValidation: { ...state.documentValidation, otherEwt: event.target.value } }));
  document.querySelectorAll("[data-validation-copy]").forEach((input) => input.addEventListener("change", () => setState({ documentValidation: { ...state.documentValidation, [input.dataset.validationCopy]: input.checked } })));
  document.querySelector("[data-validation-check-number]")?.addEventListener("change", (event) => setState({ documentValidation: { ...state.documentValidation, checkNumber: event.target.value } }));
  document.querySelector("[data-validation-reviewer-note]")?.addEventListener("change", (event) => setState({ documentValidation: { ...state.documentValidation, reviewerNote: event.target.value } }));
  document.querySelectorAll("[data-line-review-status]").forEach((select) => select.addEventListener("change", () => {
    const index = Number(select.dataset.lineReviewStatus);
    const lineReviews = [...state.documentValidation.lineReviews];
    lineReviews[index] = { ...(lineReviews[index] || { note: "" }), status: select.value, reviewer: select.value === "pending" ? "" : "Ms. Rhee", reviewedAt: select.value === "pending" ? "" : new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) };
    const request = requests.find((item) => item.id === state.selectedId) || requests.find((item) => item.currentStep === 4) || requests[0];
    const allDocumentsValid = validationReviewLines(request).every((_, reviewIndex) => lineReviews[reviewIndex]?.status === "valid");
    const now = new Date();
    setState({ documentValidation: { ...state.documentValidation, lineReviews, documentsValidatedAt: allDocumentsValid ? state.documentValidation.documentsValidatedAt || now.toISOString() : "" } });
  }));
  document.querySelectorAll("[data-approve-line-document]").forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.approveLineDocument);
    const lineReviews = [...state.documentValidation.lineReviews];
    const now = new Date();
    lineReviews[index] = { ...(lineReviews[index] || { note: "" }), status: "valid", reviewer: "Ms. Rhee", reviewedAt: now.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) };
    const request = requests.find((item) => item.id === state.selectedId) || requests.find((item) => item.currentStep === 4) || requests[0];
    const allDocumentsValid = validationReviewLines(request).every((_, reviewIndex) => lineReviews[reviewIndex]?.status === "valid");
    setState({ documentValidation: { ...state.documentValidation, lineReviews, documentsValidatedAt: allDocumentsValid ? state.documentValidation.documentsValidatedAt || now.toISOString() : "" } });
  }));
  document.querySelectorAll("[data-line-review-note]").forEach((input) => input.addEventListener("input", () => {
    const index = Number(input.dataset.lineReviewNote);
    const lineReviews = [...state.documentValidation.lineReviews];
    lineReviews[index] = { ...(lineReviews[index] || { status: "pending", reviewer: "", reviewedAt: "" }), note: input.value };
    state = { ...state, documentValidation: { ...state.documentValidation, lineReviews } };
    const correctionNotesComplete = lineReviews.every((review) => review.status !== "correction" || review.note.trim());
    const correctionCount = lineReviews.filter((review) => review.status === "correction").length;
    const returnButton = [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "Return Lines for Correction");
    if (returnButton) returnButton.disabled = !(correctionCount && correctionNotesComplete);
    const requiredNote = input.parentElement?.querySelector(".line-note-required");
    if (requiredNote && input.value.trim()) requiredNote.remove();
  }));
  document.querySelectorAll("[data-view-line-attachment], [data-download-line-attachment]").forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.viewLineAttachment ?? button.dataset.downloadLineAttachment);
    const request = requests.find((item) => item.id === state.selectedId) || requests.find((item) => item.currentStep === 4) || requests[0];
    const attachment = validationReviewLines(request)[index]?.attachment || "supporting-document.pdf";
    if (button.hasAttribute("data-download-line-attachment")) downloadValidationDocument(request, index);
    else setState({ documentValidation: { ...state.documentValidation, attachmentPreview: attachment } });
  }));
  document.querySelector("[data-close-attachment-preview]")?.addEventListener("click", () => setState({ documentValidation: { ...state.documentValidation, attachmentPreview: "" } }));
  document.querySelector("[data-close-document-viewer]")?.addEventListener("click", () => setState({ documentValidation: { ...state.documentValidation, attachmentPreview: "" } }));
  document.querySelector("[data-document-viewer-backdrop]")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) setState({ documentValidation: { ...state.documentValidation, attachmentPreview: "" } });
  });
  document.querySelector("[data-download-viewer-document]")?.addEventListener("click", () => {
    const request = requests.find((item) => item.id === state.selectedId) || requests.find((item) => item.currentStep === 4) || requests[0];
    const index = Math.max(0, validationReviewLines(request).findIndex((item) => item.attachment === state.documentValidation.attachmentPreview));
    downloadValidationDocument(request, index);
  });
  document.querySelectorAll("[data-accounting-index]").forEach((input) => input.addEventListener("change", () => {
    const entries = state.documentValidation.entries.map((entry, index) => index === Number(input.dataset.accountingIndex) ? { ...entry, [input.dataset.accountingField]: input.dataset.accountingField === "account" ? input.value : Number(input.value) || 0 } : entry);
    setState({ documentValidation: { ...state.documentValidation, entries } });
  }));
  document.querySelector("[data-add-accounting-row]")?.addEventListener("click", () => setState({ documentValidation: { ...state.documentValidation, entries: [...state.documentValidation.entries, { account: "", debit: 0, credit: 0 }] } }));
  document.querySelectorAll("[data-remove-accounting-row]").forEach((button) => button.addEventListener("click", () => setState({ documentValidation: { ...state.documentValidation, entries: state.documentValidation.entries.filter((_, index) => index !== Number(button.dataset.removeAccountingRow)) } })));
  document.querySelector("[data-complete-validation]")?.addEventListener("click", () => setState({ documentValidation: { ...state.documentValidation, completionDate: new Date().toISOString().slice(0, 10) } }));
  document.querySelectorAll("[data-request]").forEach((row) => row.addEventListener("click", () => navigate(state.tab === "approvals" ? `/approvals/request/${row.dataset.request}` : `/dashboard/request/${row.dataset.request}`)));
  document.querySelector("[data-back-approval-list]")?.addEventListener("click", () => navigate("/approvals"));
  document.querySelector("[data-start-approval]")?.addEventListener("click", (event) => navigate(`/approvals/review/${event.currentTarget.dataset.startApproval}`));
  document.querySelector("[data-back-approval-detail]")?.addEventListener("click", (event) => navigate(`/approvals/request/${event.currentTarget.dataset.backApprovalDetail}`));
  document.querySelectorAll("[data-metric]").forEach((button) => button.addEventListener("click", () => navigate(`/dashboard/${button.dataset.metric}`)));
  document.querySelector("[data-close-metric]")?.addEventListener("click", () => navigate("/dashboard"));
  document.querySelector("[data-close-dashboard-detail]")?.addEventListener("click", () => navigate("/dashboard"));
  document.querySelectorAll("[data-all-role-action]").forEach((button) => button.addEventListener("click", () => {
    const request = requests.find((item) => item.id === button.dataset.actionRequest);
    if (!request) return;
    const action = button.dataset.allRoleAction;
    if (action === "edit") navigate(`/requests/new/${request.type}`);
    else if (action === "documents") navigate("/documents/uploads");
    else if (action === "approval") navigate(`/approvals/review/${request.id}`);
    else if (action === "tracker") navigate(`/tracker/${request.id}`);
    else if (action === "email") navigate(`/emails/${request.currentStep >= 15 ? 15 : request.currentStep}`);
    else if (action === "workflow") navigate(`/dashboard/workflow/${request.id}`);
    else if (action === "voucher") document.querySelector(".voucher-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    else if (action === "unlock") setState({ unlockRequestId: request.id });
  }));
  document.querySelector("[data-view-workflow]")?.addEventListener("click", (event) => navigate(`/dashboard/workflow/${event.currentTarget.dataset.viewWorkflow}`));
  document.querySelectorAll("[data-close-workflow]").forEach((button) => button.addEventListener("click", () => navigate(`/dashboard/request/${state.selectedId}`)));
  document.querySelector("[data-workflow-modal]")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) navigate(`/dashboard/request/${state.selectedId}`);
  });
  document.querySelectorAll("[data-metric-request]").forEach((row) => row.addEventListener("click", () => navigate(`/dashboard/request/${row.dataset.metricRequest}`)));
  document.querySelectorAll("[data-tracker-request]").forEach((row) => row.addEventListener("click", () => navigate(`/tracker/${row.dataset.trackerRequest}`)));
  document.querySelector("[data-bank-approval]")?.addEventListener("click", (event) => {
    const request = requests.find((item) => item.id === event.currentTarget.dataset.bankApproval);
    if (!request) return;
    const timestamp = new Date().toISOString();
    request.bankSubmittedAt = timestamp;
    request.bankSubmittedBy = personas[state.persona].name;
    request.currentStep = 11;
    request.status = "For Signatory Approval";
    request.audit.push({ action: "Submitted for Bank Approval", actor: request.bankSubmittedBy, timestamp, reason: "Payment instruction routed to authorized signatories." });
    render();
  });
  document.querySelector("[data-signatory-approval]")?.addEventListener("click", (event) => {
    const request = requests.find((item) => item.id === event.currentTarget.dataset.signatoryApproval);
    if (!request) return;
    const timestamp = new Date().toISOString();
    request.bankAuthorizedAt = timestamp;
    request.bankAuthorizedBy = personas[state.persona].name;
    request.currentStep = 12;
    request.status = "Vendor Notification";
    request.audit.push({ action: "Bank Authorization Approved", actor: request.bankAuthorizedBy, timestamp, reason: "Authorized signatory approval recorded." });
    render();
  });
  document.querySelector("[data-send-vendor-email]")?.addEventListener("click", (event) => {
    const request = requests.find((item) => item.id === event.currentTarget.dataset.sendVendorEmail);
    if (!request) return;
    const timestamp = new Date().toISOString();
    request.vendorNotifiedAt = timestamp;
    request.vendorNotifiedBy = personas[state.persona].name;
    request.currentStep = 13;
    request.status = "Payment Release";
    request.audit.push({ action: "Vendor Notification Email Sent", actor: request.vendorNotifiedBy, timestamp, reason: `Automated payment-processing notice sent to ${request.vendor}.` });
    render();
  });
  document.querySelector("[data-payment-pickup]")?.addEventListener("click", (event) => {
    const request = requests.find((item) => item.id === event.currentTarget.dataset.paymentPickup);
    if (!request) return;
    const timestamp = new Date().toISOString();
    request.pickupAvailableAt = timestamp;
    request.pickupAvailableBy = personas[state.persona].name;
    request.releaseEmailSentAt = timestamp;
    request.status = "Payment Available for Pick-up";
    request.audit.push({ action: "Payment Available for Pick-up", actor: request.pickupAvailableBy, timestamp, reason: `Email notification sent to ${request.requestor} and ${request.vendor}.` });
    render();
  });
  document.querySelector("[data-close-tracker]")?.addEventListener("click", () => navigate("/tracker"));
  document.querySelectorAll("[data-type]").forEach((button) => button.addEventListener("click", () => navigate(`/requests/new/${button.dataset.type}`)));
  document.querySelector("[data-view-drafts]")?.addEventListener("click", () => navigate("/requests/drafts"));
  document.querySelector("[data-new-request]")?.addEventListener("click", () => {
    state.activeDraftId = null;
    navigate(`/requests/new/${state.draftType}`);
  });
  document.querySelector("[data-save-draft]")?.addEventListener("click", () => saveDraft());
  document.querySelector("[data-submit-current]")?.addEventListener("click", () => {
    saveDraft({ silent: true });
    submitSavedDraft(state.activeDraftId);
  });
  document.querySelectorAll("[data-continue-draft]").forEach((button) => button.addEventListener("click", () => openDraft(button.dataset.continueDraft)));
  document.querySelectorAll("[data-submit-draft]").forEach((button) => button.addEventListener("click", () => submitSavedDraft(button.dataset.submitDraft)));
  document.querySelectorAll("[data-delete-draft]").forEach((button) => button.addEventListener("click", () => setState({ drafts: state.drafts.filter((draft) => draft.id !== button.dataset.deleteDraft), activeDraftId: state.activeDraftId === button.dataset.deleteDraft ? null : state.activeDraftId })));
  document.querySelectorAll("[data-email-step]").forEach((button) => button.addEventListener("click", () => navigate(`/emails/${button.dataset.emailStep}`)));
  document.querySelectorAll("[data-dashboard-filter]").forEach((input) => input.addEventListener(input.tagName === "INPUT" && input.type !== "number" ? "input" : "change", () => {
    state.dashboardFilters = { ...state.dashboardFilters, [input.dataset.dashboardFilter]: input.value };
    render();
    const replacement = document.querySelector(`[data-dashboard-filter="${input.dataset.dashboardFilter}"]`);
    replacement?.focus();
    if (replacement?.setSelectionRange && input.tagName === "INPUT" && input.type !== "number") replacement.setSelectionRange(replacement.value.length, replacement.value.length);
  }));
  document.querySelector("[data-clear-filters]")?.addEventListener("click", () => setState({ dashboardFilters: { voucher: "", department: "all", type: "all", status: "all", minAmount: "", maxAmount: "", sortBy: "submitted", sortDirection: "desc" } }));
  document.querySelector("[data-export-report]")?.addEventListener("click", downloadDepartmentReport);
  document.querySelector("[data-print-report]")?.addEventListener("click", printDepartmentReport);
  document.querySelector("[data-draft-currency]")?.addEventListener("change", (event) => setState({ draftCurrency: event.target.value, otherCurrency: event.target.value === "OTHER" ? state.otherCurrency : "" }));
  document.querySelector("[data-other-currency]")?.addEventListener("input", (event) => { state.otherCurrency = event.target.value.toUpperCase(); });
  document.querySelector("[data-event-end-date]")?.addEventListener("change", (event) => {
    const eventEnd = event.target.value;
    if (!eventEnd) return;
    const dueDate = new Date(`${eventEnd}T00:00:00`);
    dueDate.setDate(dueDate.getDate() + 15);
    setState({ cashAdvanceEventEnd: eventEnd, cashAdvanceLiquidationDate: dueDate.toISOString().slice(0, 10) });
  });
  document.querySelector("[data-po-reference]")?.addEventListener("change", (event) => setState({ selectedPO: event.target.value }));
  document.querySelectorAll("[data-edit-request]").forEach((button) => button.addEventListener("click", () => {
    const request = requests.find((item) => item.id === button.dataset.editRequest);
    if (request) navigate(`/requests/new/${request.type}`);
  }));
  document.querySelectorAll("[data-unlock-request]").forEach((button) => button.addEventListener("click", () => {
    setState({ unlockRequestId: button.dataset.unlockRequest });
  }));
  document.querySelectorAll("[data-cancel-unlock]").forEach((button) => button.addEventListener("click", () => setState({ unlockRequestId: null })));
  document.querySelector("[data-unlock-modal-backdrop]")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) setState({ unlockRequestId: null });
  });
  document.querySelector("[data-unlock-reason]")?.addEventListener("input", (event) => {
    const confirmButton = document.querySelector("[data-confirm-unlock]");
    if (confirmButton) confirmButton.disabled = !event.target.value.trim();
  });
  document.querySelector("[data-confirm-unlock]")?.addEventListener("click", (event) => {
    const request = requests.find((item) => item.id === event.currentTarget.dataset.confirmUnlock);
    const reason = document.querySelector("[data-unlock-reason]")?.value.trim();
    if (!request || !reason) return;
    request.unlocked = true;
    request.audit.push({ action: "Request Unlocked", actor: personas[state.persona].name, reason, timestamp: new Date().toISOString() });
    setState({ unlockRequestId: null });
  });
  document.querySelectorAll("[data-upload-request]").forEach((button) => button.addEventListener("click", () => setState({ uploadId: button.dataset.uploadRequest })));
  document.querySelector("[data-add-line]")?.addEventListener("click", addDraftLineItem);
  document.querySelectorAll("[data-remove-line]").forEach((button) => button.addEventListener("click", () => removeDraftLineItem(Number(button.dataset.removeLine))));
  document.querySelectorAll("[data-line-row]").forEach((input) => input.addEventListener("input", () => updateDraftLineItem(Number(input.dataset.lineRow), input.dataset.lineColumn, input.value)));
  document.querySelectorAll("[data-print-voucher]").forEach((button) => button.addEventListener("click", () => window.print()));
  document.getElementById("unbudgeted")?.addEventListener("change", (event) => setState({ budgeted: !event.target.checked }));
  document.getElementById("liquidationAdvanceAmount")?.addEventListener("input", (event) => {
    state.liquidationAdvanceAmount = Number(event.target.value) || 0;
    const expenses = state.lineItemsByType.liquidation.reduce((sum, item) => sum + (Number(item.Amount) || 0), 0);
    const output = document.getElementById("liquidationSettlement");
    if (output) output.textContent = settlementFor(state.liquidationAdvanceAmount, expenses);
  });
  restoreDraftControls();
  const draftForm = document.querySelector(".request-form-panel");
  if (draftForm && state.activeDraftId) {
    const autoSave = () => saveDraft({ silent: true });
    draftForm.addEventListener("input", autoSave);
    draftForm.addEventListener("change", autoSave);
  }
}

window.addEventListener("hashchange", () => {
  state = { ...state, ...routeStateFromHash() };
  render();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.unlockRequestId) setState({ unlockRequestId: null });
  else if (event.key === "Escape" && state.dashboardWorkflow) navigate(`/dashboard/request/${state.selectedId}`);
  else if (event.key === "Escape" && state.documentValidation.attachmentPreview) setState({ documentValidation: { ...state.documentValidation, attachmentPreview: "" } });
});
if (!window.location.hash) window.location.replace(`${window.location.pathname}${window.location.search}#/dashboard`);
state = { ...state, ...routeStateFromHash() };
render();
