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
    lineColumns: ["Invoice Date", "Invoice Number", "Vendor / Merchant", "Particulars", "Amount"],
  },
  cashAdvance: {
    label: "Cash Advance",
    prefix: "CA",
    required: ["Cash Advance Requestor", "Department", "Cash Advance Request Date", "Last Day of the Event", "Date to Liquidate", "Event / Purpose", "Accountability / Authority to Deduct Acknowledgement"],
    mandatoryFields: [
      { label: "Department", kind: "input", value: "Sales" },
      { label: "Cash Advance Request Date", kind: "date", value: "2026-07-18" },
      { label: "Last Day of the Event", kind: "date", value: "2026-07-25" },
      { label: "Date to Liquidate", kind: "date", value: "2026-07-30" },
      { label: "Event / Purpose", kind: "textarea", value: "Regional sales visit" },
    ],
    uploadDocuments: ["Supporting Budget / Itinerary", "Other Supporting Document"],
    lineColumns: ["Particulars", "Amount"],
  },
  liquidation: {
    label: "Liquidation",
    prefix: "LIQ",
    required: ["Cash Advance Requestor", "Department", "Date Liquidated", "Last Day of the Event", "Event / Purpose", "BIR-Recognized Invoice(s) / Official Receipt(s)"],
    mandatoryFields: [
      { label: "Department", kind: "input", value: "People Operations" },
      { label: "Date Liquidated", kind: "date", value: "2026-07-18" },
      { label: "Last Day of the Event", kind: "date", value: "2026-07-16" },
      { label: "Event / Purpose", kind: "textarea", value: "Leadership workshop liquidation" },
    ],
    uploadDocuments: ["BIR-Recognized Invoice(s) / Official Receipt(s)", "Proof of Unused Cash Return (If Applicable)", "Other Supporting Document"],
    lineColumns: ["Invoice Date", "Invoice Number", "Vendor / Merchant", "Particulars", "Amount"],
  },
  poPayment: {
    label: "P.O. Payment",
    prefix: "PO",
    required: ["Particulars of P.O. Payment", "Department / Cost Center for Each Line Item", "Approved P.O."],
    mandatoryFields: [
      { label: "Particulars of P.O. Payment", kind: "textarea", value: "Office equipment purchase order payment" },
    ],
    uploadDocuments: ["Approved P.O.", "BIR 2303 (If New Supplier)", "Billing / Quotation / SOA", "Invoice (If Available)"],
    lineColumns: ["P.O. Number", "Supplier", "Particulars", "Department / Cost Center", "Amount"],
  },
  general: {
    label: "General Payment",
    prefix: "GEN",
    required: ["Particulars of Payment", "Department / Cost Center for Each Line Item", "Billing or Invoice"],
    mandatoryFields: [
      { label: "Particulars of Payment", kind: "textarea", value: "Monthly utilities and service charges" },
    ],
    uploadDocuments: ["Billing or Invoice", "BIR 2303 (If New Supplier)", "Billing / Quotation / SOA", "Invoice (If Available)"],
    lineColumns: ["Supplier", "Particulars", "Department / Cost Center", "Amount", "Attachment"],
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
  12: ["Finance Associate", "Notify payee that payment is available", "Bank authorization completed", "The payment has been authorized and is ready for payee notification.", "Send the payment availability notice and confirm the release or collection instructions.", "Send Payee Notice"],
  13: ["Finance Associate", "Record payment release", "Payee notified", "The payment is ready for release to the payee.", "Record the release date, recipient, payment reference, and acknowledgement details.", "Record Release"],
  14: ["Finance Associate", "Payment tracker updated", "Payment released", "The payment tracker has been updated automatically.", "Review the recorded turnaround dates and resolve any remaining tracker exceptions.", "View Tracker"],
  15: ["Finance Associate", "Payment request completed", "Tracker update completed", "The payment request workflow is complete.", "Review the completed payment record if reconciliation is required.", "View Completed Request"],
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
    { "Invoice Date": "2026-07-15", "Invoice Number": "INV-1042", "Vendor / Merchant": "Training Center", Particulars: "Leadership workshop registration", Amount: 50000 },
    { "Invoice Date": "2026-07-16", "Invoice Number": "OR-1048", "Vendor / Merchant": "Travel Desk", Particulars: "Workshop transportation", Amount: 75000 },
  ],
  cashAdvance: [{ Particulars: "Regional transportation", Amount: 25000 }, { Particulars: "Meals and incidentals", Amount: 10000 }],
  liquidation: [
    { "Invoice Date": "2026-07-15", "Invoice Number": "INV-2051", "Vendor / Merchant": "Training Center", Particulars: "Workshop venue and meals", Amount: 30000 },
    { "Invoice Date": "2026-07-16", "Invoice Number": "OR-2058", "Vendor / Merchant": "Travel Desk", Particulars: "Local transportation", Amount: 15000 },
  ],
  poPayment: [{ "P.O. Number": "PO-2026-0106", Supplier: "Northstar Supplies", Particulars: "Office workstations", "Department / Cost Center": "Operations - 4400", Amount: 98000 }, { "P.O. Number": "PO-2026-0106", Supplier: "Northstar Supplies", Particulars: "Delivery and installation", "Department / Cost Center": "IT - 4500", Amount: 27500 }],
  general: [{ Supplier: "City Utilities", Particulars: "Electricity service", "Department / Cost Center": "Facilities - 4600", Amount: 48500, Attachment: "electric-bill.pdf" }, { Supplier: "City Utilities", Particulars: "Water service", "Department / Cost Center": "Admin - 4000", Amount: 12200, Attachment: "water-bill.pdf" }, { Supplier: "CloudWorks", Particulars: "Monthly hosting", "Department / Cost Center": "IT - 4500", Amount: 27700, Attachment: "cloud-invoice.pdf" }],
};

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
].map(([id, type, requestor, department, vendor, amount, budgeted, status, currentStep, submitted, returned, resubmitted, documents, missing]) => ({
  id, type, requestor, department, vendor, amount, budgeted, status, currentStep, submitted, returned, resubmitted, documents, missing,
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
  selectedId: requests[0].id,
  dashboardMetric: null,
  dashboardWorkflow: false,
  trackerRequestId: null,
  dashboardFilters: { voucher: "", type: "all", status: "all", minAmount: "", maxAmount: "", sortBy: "submitted", sortDirection: "desc" },
  requestCreatedDate: new Date().toISOString().slice(0, 10),
  draftType: "reimbursement",
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
    checkNumber: "",
    reviewerNote: "Validate supporting documents, tax treatment, and accounting entries.",
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
  if (parts[0] === "requests") return { tab: "request", draftType: paymentTypes[parts[2]] ? parts[2] : "reimbursement", dashboardMetric: null, trackerRequestId: null };
  if (parts[0] === "approvals") return { tab: "approvals", selectedId: requests.some((r) => r.id === parts[1]) ? parts[1] : state.selectedId, dashboardMetric: null, trackerRequestId: null };
  if (parts[0] === "tracker") return { tab: "tracker", trackerRequestId: requests.some((r) => r.id === parts[1]) ? parts[1] : null, dashboardMetric: null };
  if (parts[0] === "documents") return { tab: parts[1] === "rules" ? "documents" : "uploads", trackerRequestId: null, dashboardMetric: null };
  if (parts[0] === "emails") return { tab: "emails", emailStep: steps.some(([id]) => String(id) === parts[1]) ? Number(parts[1]) : state.emailStep, trackerRequestId: null, dashboardMetric: null };
  if (parts[0] === "dashboard") return { tab: "dashboard", dashboardMetric: ["pending", "value", "returned", "unclaimed"].includes(parts[1]) ? parts[1] : null, dashboardWorkflow: parts[1] === "workflow", selectedId: requests.some((r) => r.id === parts[2]) ? parts[2] : state.selectedId, trackerRequestId: null };
  return { tab: "dashboard", dashboardMetric: null, trackerRequestId: null };
}
function navigate(path) {
  if (window.location.hash === `#${path}`) {
    state = { ...state, ...routeStateFromHash() };
    render();
  } else window.location.hash = path;
}
const money = (value) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(value);
const settlementFor = (advance, expenses) => advance >= expenses
  ? `${money(advance - expenses)} for return`
  : `${money(expenses - advance)} for reimbursement`;
const stepLabel = (value) => value === 8.5 ? "8B" : value;
const route = ({ amount, budgeted, type }) => type === "cashAdvance"
  ? amount > 40000 ? "Exceeds the PHP 40,000 employee cash advance limit." : "Finance Manager approval is required for this cash advance."
  : !budgeted && amount > 1000000 ? "Board Member approval required for unbudgeted payments above PHP 1,000,000." : !budgeted ? "COO approval required for unbudgeted payments up to PHP 1,000,000." : amount <= 100000 ? "Finance Manager can approve and route to voucher creation." : amount <= 300000 ? "COO approval required by amount threshold." : "President approval required for budgeted payments above PHP 300,000.";
const pillTone = (status) => status.includes("Returned") ? "returned" : status.includes("Board") ? "board" : status.includes("President") ? "executive" : status.includes("COO") ? "coo" : "normal";
const voucherFor = (r) => {
  if (r.currentStep < 9) return "";
  const typeLabel = paymentTypes[r.type].label;
  const withholdingTax = Math.round(r.amount * 0.02);
  const netPayment = r.amount - withholdingTax;
  const voucherNumber = `PV-${r.id.replace("-2026-", "-")}`;
  const checkNumber = r.currentStep >= 11 ? "CHK-004918" : "Pending bank processing";
  return `<div class="voucher-card">
    <div class="voucher-heading"><div><span class="eyebrow">Payment Voucher</span><h4>${voucherNumber}</h4><p>Automated Payment System</p></div><button class="print-button" data-print-voucher="true">Print</button></div>
    <div class="voucher-meta"><span>Date: 2026-06-24</span><span>Request: ${r.id}</span><span>Status: ${r.status}</span></div>
    <table class="voucher-table"><tbody>
      <tr><th>Payee</th><td>${r.vendor}</td><th>Department</th><td>${r.department}</td></tr>
      <tr><th>Requestor</th><td>${r.requestor}</td><th>Payment Method</th><td>Check payment</td></tr>
      <tr><th>Purpose</th><td colspan="3">${typeLabel} payment for ${r.vendor}</td></tr>
      <tr><th>Bank Account</th><td>BDO Operating Account - 1284</td><th>Check No.</th><td>${checkNumber}</td></tr>
    </tbody></table>
    <table class="voucher-table amount-table"><tbody>
      <tr><th>Gross Amount</th><td>${money(r.amount)}</td></tr>
      <tr><th>Less: Withholding Tax</th><td>${money(withholdingTax)}</td></tr>
      <tr class="net-row"><th>Net Payment</th><td>${money(netPayment)}</td></tr>
    </tbody></table>
  </div>`;
};
const fieldInput = (field) => field.kind === "textarea"
  ? `<label class="full">${field.label}<textarea placeholder="${field.value}"></textarea></label>`
  : `<label>${field.label}<input type="${field.kind === "date" ? "date" : "text"}" placeholder="${field.value}"></label>`;
const uploadInput = (documentName) => `<label class="upload-row"><span>${documentName}</span><input type="file"></label>`;

function setState(patch) {
  state = { ...state, ...patch };
  render();
}

function updateDraftLineItem(rowIndex, column, value) {
  const lineItemsByType = { ...state.lineItemsByType };
  lineItemsByType[state.draftType] = lineItemsByType[state.draftType].map((row, index) => index === rowIndex ? { ...row, [column]: value } : row);
  state = { ...state, lineItemsByType };
  const amount = lineItemsByType[state.draftType].reduce((sum, item) => sum + (Number(item.Amount) || 0), 0);
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

function personaRequests(persona = state.persona) {
  if (persona === "requestor") return requests.filter((request) => request.requestor === personas.requestor.name);
  if (persona === "coo") return requests.filter((request) => request.currentStep === 7);
  if (persona === "president") return requests.filter((request) => request.currentStep === 8);
  return requests;
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
      </main>
    </div>`;
}

function statusPill(status) {
  return `<span class="status-pill ${pillTone(status)}">${status}</span>`;
}

function requestTable(rows = requests, combineStepStatus = false) {
  const headers = combineStepStatus ? `<th>Status</th><th>Submitted</th><th>Voucher</th><th>Type</th><th>Amount</th>` : `<th>Step</th><th>Submitted</th><th>Voucher</th><th>Type</th><th>Amount</th><th>Status</th>`;
  return `<section class="panel"><div class="panel-header"><h3>Live Requests</h3><span class="count">${rows.length}</span></div><div class="table-wrap"><table><thead><tr>${headers}</tr></thead><tbody>
    ${rows.length ? rows.map((r) => `<tr data-request="${r.id}" class="${state.selectedId === r.id ? "selected" : ""}">${combineStepStatus ? `<td><div class="step-status-cell">${statusPill(r.status)}</div></td><td>${r.submitted}</td><td>${r.id}</td><td>${paymentTypes[r.type].label}</td><td>${money(r.amount)}</td>` : `<td>${stepLabel(r.currentStep)}</td><td>${r.submitted}</td><td>${r.id}</td><td>${paymentTypes[r.type].label}</td><td>${money(r.amount)}</td><td>${statusPill(r.status)}</td>`}</tr>`).join("") : `<tr><td colspan="${combineStepStatus ? 5 : 6}" class="empty-state">No requests match the selected filters.</td></tr>`}
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

function detail(r, showWorkflowSummary = false) {
  return `<section class="panel"><div class="panel-header"><h3>${r.id}</h3>${statusPill(r.status)}</div>
    <dl class="detail-list">
      <div><dt>Requestor</dt><dd>${r.requestor}</dd></div><div><dt>Department</dt><dd>${r.department}</dd></div>
      <div><dt>Payee</dt><dd>${r.vendor}</dd></div><div><dt>Amount</dt><dd>${money(r.amount)}</dd></div>
      <div><dt>Documents</dt><dd>${r.documents} attached, ${r.missing} missing</dd></div><div><dt>Budget</dt><dd>${r.budgeted ? "Budgeted" : "Unbudgeted"}</dd></div>
    </dl><div class="request-routing-card"><span class="eyebrow">Routing Threshold</span><strong>${route(r)}</strong><small>${r.budgeted ? "Budgeted request" : "Unbudgeted request"} · ${money(r.amount)}</small></div>${showWorkflowSummary ? workflowSummary(r) : ""}<div class="comment-log"><h4>Notes</h4><p>${r.status.includes("Returned") ? "Reviewer requested additional information before resubmission." : "Validated supporting documents and routing threshold."}</p></div>${voucherFor(r)}</section>`;
}

function dashboardFilters(visibleRequests = requests) {
  const filters = state.dashboardFilters;
  const statusOptions = [...new Set(visibleRequests.map((r) => r.status))].sort();
  return `<section class="panel dashboard-filter-panel"><div class="panel-header"><div><span class="eyebrow">Find a Request</span><h3>Search and Sort</h3></div><button type="button" class="clear-filter-button" data-clear-filters="true">Clear Filters</button></div><div class="dashboard-filters">
    <label>Voucher Number<input data-dashboard-filter="voucher" placeholder="Search voucher no." value="${filters.voucher}"></label>
    <label>Type<select data-dashboard-filter="type"><option value="all">All Types</option>${Object.entries(paymentTypes).map(([id, type]) => `<option value="${id}" ${filters.type === id ? "selected" : ""}>${type.label}</option>`).join("")}</select></label>
    <label>Status<select data-dashboard-filter="status"><option value="all">All Statuses</option>${statusOptions.map((status) => `<option value="${status}" ${filters.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label>
    <label>Minimum Amount<input data-dashboard-filter="minAmount" type="number" min="0" placeholder="0" value="${filters.minAmount}"></label>
    <label>Maximum Amount<input data-dashboard-filter="maxAmount" type="number" min="0" placeholder="No limit" value="${filters.maxAmount}"></label>
    <label>Sort By<select data-dashboard-filter="sortBy"><option value="submitted" ${filters.sortBy === "submitted" ? "selected" : ""}>Submitted Date</option><option value="voucher" ${filters.sortBy === "voucher" ? "selected" : ""}>Voucher Number</option><option value="type" ${filters.sortBy === "type" ? "selected" : ""}>Type</option><option value="status" ${filters.sortBy === "status" ? "selected" : ""}>Status</option><option value="amount" ${filters.sortBy === "amount" ? "selected" : ""}>Amount</option></select></label>
    <label>Order<select data-dashboard-filter="sortDirection"><option value="asc" ${filters.sortDirection === "asc" ? "selected" : ""}>Ascending</option><option value="desc" ${filters.sortDirection === "desc" ? "selected" : ""}>Descending</option></select></label>
  </div></section>`;
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
  const pendingRequests = state.persona === "requestor"
    ? visibleRequests.filter((r) => ![1, 2, 15].includes(r.currentStep))
    : visibleRequests.filter((r) => [3, 4, 5, 7, 8, 8.5].includes(r.currentStep));
  const returnedRequests = visibleRequests.filter((r) => r.status.includes("Returned"));
  const unclaimedRequests = visibleRequests.filter((r) => r.currentStep === 12);
  const filters = state.dashboardFilters;
  const filteredRequests = visibleRequests.filter((r) => {
    const voucherMatch = r.id.toLowerCase().includes(filters.voucher.trim().toLowerCase());
    const typeMatch = filters.type === "all" || r.type === filters.type;
    const statusMatch = filters.status === "all" || r.status === filters.status;
    const minMatch = filters.minAmount === "" || r.amount >= Number(filters.minAmount);
    const maxMatch = filters.maxAmount === "" || r.amount <= Number(filters.maxAmount);
    return voucherMatch && typeMatch && statusMatch && minMatch && maxMatch;
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
    value: { title: "Open Request Value", description: "All active payment requests visible to this persona.", rows: visibleRequests, total: money(total) },
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
    <div class="metric-row"><button type="button" class="metric green" data-metric="pending"><span>Pending Approval</span><strong>${pendingRequests.length}</strong><small>View Requests →</small></button><button type="button" class="metric blue" data-metric="value"><span>Open Request Value</span><strong>${money(total)}</strong><small>View Breakdown →</small></button><button type="button" class="metric amber" data-metric="returned"><span>Returned</span><strong>${returnedRequests.length}</strong><small>View Requests →</small></button><button type="button" class="metric red" data-metric="unclaimed"><span>Unclaimed Checks</span><strong>${unclaimedRequests.length}</strong><small>View Checks →</small></button></div>
    ${dashboardFilters(visibleRequests)}<div class="two-column">${requestTable(filteredRequests, true)}${detail(selected, true)}</div>${workflowModal}
  </section>`;
}

function requestBuilder() {
  const config = paymentTypes[state.draftType];
  const lineItems = state.lineItemsByType[state.draftType];
  const draftAmount = lineItems.reduce((sum, item) => sum + (Number(item.Amount) || 0), 0);
  const isLiquidation = state.draftType === "liquidation";
  const isCashAdvance = state.draftType === "cashAdvance";
  const systemDateField = `<input type="hidden" name="requestDate" value="${state.requestCreatedDate}">`;
  const primaryFields = state.draftType === "reimbursement"
    ? `${systemDateField}<label>Requestor's Name<input placeholder="Enter requestor's full name"></label>${config.mandatoryFields.map(fieldInput).join("")}<label>Voucher Number <small>(Finance Use Only)</small><input placeholder="Assigned after approval" disabled></label><label>Calculated Total<input id="draftAmount" type="number" value="${draftAmount}" readonly></label>`
    : isLiquidation
    ? `${systemDateField}<label>Cash Advance Requestor<input placeholder="Enter cash advance requestor"></label>${config.mandatoryFields.map(fieldInput).join("")}<label>Voucher Number <small>(Finance Use Only)</small><input placeholder="Assigned after approval" disabled></label>`
    : isCashAdvance
    ? `${systemDateField}<label>Cash Advance Requestor<input placeholder="Enter cash advance requestor"></label>${config.mandatoryFields.map(fieldInput).join("")}<label>Voucher Number <small>(Finance Use Only)</small><input placeholder="Assigned after approval" disabled></label><label>Cash Advance Amount<input id="draftAmount" type="number" value="${draftAmount}" readonly></label>`
    : `${systemDateField}<label>Requestor<input placeholder="Enter requestor's full name"></label><label>Payee / Vendor<input placeholder="Enter payee or vendor name"></label><label>Calculated Amount<input id="draftAmount" type="number" value="${draftAmount}" readonly></label>${config.mandatoryFields.map(fieldInput).join("")}`;
  const liquidationSummary = isLiquidation ? `<div class="liquidation-summary"><label>Cash Advance Amount<input id="liquidationAdvanceAmount" type="number" placeholder="e.g. 50000"></label><div><span>Total Expenses</span><strong id="liquidationExpenses">${money(draftAmount)}</strong></div><div><span>For Return / For Reimbursement</span><strong id="liquidationSettlement">${settlementFor(state.liquidationAdvanceAmount, draftAmount)}</strong></div></div>` : "";
  const accountability = isCashAdvance ? `<section class="accountability-box"><h4>Accountability / Authority to Deduct</h4><p>I have read and understood the Cash Advance policies and procedures. I agree to fully liquidate this Cash Advance after completion of the transaction, project, or event. I authorize payroll deduction of any unliquidated or unsubstantiated cash advance in accordance with labor laws and company policy.</p><label><input type="checkbox" required> I acknowledge full accountability for the amount received and agree to the authority to deduct.</label></section><section class="cash-advance-policy"><h4>Cash Advance policy</h4><ul><li>Full-time employees may request up to PHP 40,000 and may hold only one cash advance at a time.</li><li>Liquidation is due on the 15th or 30th after the event, whichever is later.</li><li>Partial liquidation is required for projects lasting more than one month; receipts older than 30 days are not accepted.</li></ul></section>` : "";
  return `<section class="form-layout"><div class="panel"><div class="panel-header"><h3>${state.draftType === "reimbursement" ? "Reimbursement Details" : isLiquidation ? "Liquidation Details" : isCashAdvance ? "Cash Advance Details" : "Request Details"}</h3><span class="voucher-preview">${config.prefix}-2026-0150</span></div>
    <div class="segmented">${Object.entries(paymentTypes).map(([id, type]) => `<button data-type="${id}" class="${state.draftType === id ? "active" : ""}">${type.label}</button>`).join("")}</div>
    <div class="field-grid ${state.draftType === "reimbursement" || isLiquidation || isCashAdvance ? "reimbursement-fields" : ""}">${primaryFields}</div>${liquidationSummary}
    ${isCashAdvance || isLiquidation ? "" : `<label class="toggle-row"><input id="unbudgeted" type="checkbox" ${!state.budgeted ? "checked" : ""}>Unbudgeted Request</label>`}
    <div class="line-items-section"><div class="line-items-header"><div><span class="eyebrow">Request Breakdown</span><h4>Line Items</h4></div><button type="button" class="add-line-button" data-add-line="true">+ Add Line Item</button></div><div class="table-wrap"><table class="line-item-table"><thead><tr>${config.lineColumns.map((column) => `<th>${column}</th>`).join("")}<th><span class="sr-only">Actions</span></th></tr></thead><tbody>
      ${lineItems.map((item, rowIndex) => `<tr>${config.lineColumns.map((column) => { const isFile = column === "Receipt" || column === "Attachment"; const example = lineItemExamples[state.draftType]?.[0]?.[column] ?? column; return isFile ? `<td><input type="file" aria-label="${column} for line ${rowIndex + 1}"></td>` : `<td><input data-line-row="${rowIndex}" data-line-column="${column}" type="${column === "Amount" ? "number" : column.toLowerCase().includes("date") ? "date" : "text"}" value="${item[column] || ""}" placeholder="${example}"></td>`; }).join("")}<td><button type="button" class="remove-line-button" data-remove-line="${rowIndex}" title="Remove line item" aria-label="Remove line item ${rowIndex + 1}" ${lineItems.length === 1 ? "disabled" : ""}>×</button></td></tr>`).join("")}
    </tbody><tfoot><tr><th colspan="${config.lineColumns.length}"><span>${isCashAdvance ? "Total cash advance amount" : isLiquidation ? "Total liquidated amount" : "Total"}</span><strong>${money(draftAmount)}</strong></th><td></td></tr></tfoot></table></div></div>${accountability}</div>
    <div class="panel"><div class="panel-header"><h3>Validation Preview</h3><span class="count">${config.required.length}</span></div><ul class="check-list">${config.required.map((item, index) => `<li><span class="${index < config.required.length - 1 ? "ok" : "warn"}">${index < config.required.length - 1 ? "✓" : "!"}</span>${item}</li>`).join("")}</ul>
    <h4>Document Uploads</h4><div class="upload-list">${config.uploadDocuments.map(uploadInput).join("")}</div>
    <div class="route-box"><span class="eyebrow">System Route</span><strong>${route({ amount: draftAmount, budgeted: state.budgeted, type: state.draftType })}</strong></div><button class="primary-button">Submit to Department Head</button></div></section>`;
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
  const documentsRecorded = validation.hardCopy || validation.softCopy;
  const complete = Boolean(validation.vat && selectedEwt !== "" && documentsRecorded && balanced);
  const documentStatus = validation.hardCopy ? "Complete" : validation.softCopy ? "Awaiting Hard Copy" : "Missing Documents";
  const ewtOptions = [["0", "No EWT"], ["1", "1%"], ["2", "2%"], ["5", "5%"], ["10", "10%"], ["other", "Others"]];
  return `<section class="document-validation-workspace">
    <div class="validation-section"><div class="validation-section-heading"><div><span class="eyebrow">Tax Classification</span><h4>VAT and Expanded Withholding Tax</h4></div><span class="validation-status ${complete ? "complete" : "pending"}">${complete ? "Ready to Complete" : "In Progress"}</span></div>
      <div class="validation-choice-grid"><fieldset><legend>VAT Classification <span>*</span></legend><label><input type="radio" name="validationVat" value="subject" ${validation.vat === "subject" ? "checked" : ""}> Subject to VAT</label><label><input type="radio" name="validationVat" value="not-subject" ${validation.vat === "not-subject" ? "checked" : ""}> Not Subject to VAT</label></fieldset>
      <fieldset><legend>Expanded Withholding Tax <span>*</span></legend><div class="ewt-options">${ewtOptions.map(([value, label]) => `<label><input type="radio" name="validationEwt" value="${value}" ${selectedEwt === value ? "checked" : ""} ${automaticNoEwt && value !== "0" ? "disabled" : ""}> ${label}</label>`).join("")}</div>${selectedEwt === "other" ? `<label class="other-ewt">Other EWT Rate (%)<input type="number" min="0" max="100" step="0.01" data-validation-other-ewt value="${validation.otherEwt}" placeholder="Enter percentage"></label>` : ""}${automaticNoEwt ? `<p class="automatic-rule">No EWT automatically applied because the gross amount is ₱3,000 or below.</p>` : ""}</fieldset></div>
      <div class="tax-summary"><div><span>Gross Amount</span><strong>${money(request.amount)}</strong></div><div><span>EWT Rate</span><strong>${ewtRate}%</strong></div><div><span>EWT Amount</span><strong>${money(ewtAmount)}</strong></div><div><span>Net Amount After EWT</span><strong>${money(netAmount)}</strong></div></div>
    </div>
    <div class="validation-section"><div class="validation-section-heading"><div><span class="eyebrow">Submitted Documents</span><h4>Copy Receipt Status</h4></div><span class="document-status ${validation.hardCopy ? "complete" : "pending"}">${documentStatus}</span></div><div class="copy-options"><label><input type="checkbox" data-validation-copy="hardCopy" ${validation.hardCopy ? "checked" : ""}> Hard Copy Received</label><label><input type="checkbox" data-validation-copy="softCopy" ${validation.softCopy ? "checked" : ""}> Soft Copy Received</label></div>${validation.softCopy && !validation.hardCopy ? `<div class="hard-copy-reminder"><strong>Hard copies must still be submitted to Finance.</strong><span>This request can be reviewed, but the physical documents remain outstanding.</span></div>` : ""}</div>
    <div class="validation-section"><div class="validation-section-heading"><div><span class="eyebrow">Accounting Entry</span><h4>Manual Debit and Credit Entry</h4></div><button type="button" data-add-accounting-row>+ Add Entry</button></div><div class="table-wrap"><table class="accounting-entry-table"><thead><tr><th>Account Name</th><th>Debit</th><th>Credit</th><th><span class="sr-only">Action</span></th></tr></thead><tbody>${validation.entries.map((entry, index) => `<tr><td><input data-accounting-index="${index}" data-accounting-field="account" value="${entry.account}" placeholder="Enter account name"></td><td><input type="number" min="0" data-accounting-index="${index}" data-accounting-field="debit" value="${entry.debit || ""}" placeholder="0.00"></td><td><input type="number" min="0" data-accounting-index="${index}" data-accounting-field="credit" value="${entry.credit || ""}" placeholder="0.00"></td><td><button type="button" class="remove-line-button" data-remove-accounting-row="${index}" ${validation.entries.length === 1 ? "disabled" : ""} aria-label="Remove accounting entry ${index + 1}">×</button></td></tr>`).join("")}</tbody><tfoot><tr><th>Totals</th><th>${money(debitTotal)}</th><th>${money(creditTotal)}</th><th></th></tr></tfoot></table></div><div class="balance-status ${balanced ? "balanced" : "unbalanced"}">${balanced ? "Debit and credit totals are balanced." : `Entries are out of balance by ${money(Math.abs(debitTotal - creditTotal))}.`}</div></div>
    <div class="validation-section validation-completion"><div><span class="eyebrow">Completion Details</span><h4>Finalize Document Validation</h4></div><div class="validation-completion-grid"><label>Document Validation Completion Date<input type="date" value="${validation.completionDate}" readonly placeholder="Set when completed"></label><label>Check Number <small>(Optional)</small><input data-validation-check-number value="${validation.checkNumber}" placeholder="Enter check number when available"></label></div><label>Reviewer Note<textarea data-validation-reviewer-note>${validation.reviewerNote}</textarea></label><div class="approval-actions"><button type="button" class="primary-button" data-complete-validation ${complete ? "" : "disabled"}>${validation.completionDate ? "Validation Completed" : "Complete Validation and Notify Finance Manager"}</button><button type="button">Request More Information</button><button type="button" class="danger">Disapprove</button></div>${!complete ? `<p class="validation-requirements">Complete VAT, EWT, document receipt status, and balanced accounting entries before completing validation.</p>` : ""}</div>
  </section>`;
}

function approvals() {
  const queue = approvalRequests();
  if (!queue.length) return `<section class="panel empty-persona-view"><span class="eyebrow">Requestor View</span><h3>No Approval Queue</h3><p>Requestors can monitor progress and respond to returned requests from their dashboard.</p></section>`;
  const selected = queue.find((r) => r.id === state.selectedId) || queue[0];
  const actionTitle = state.persona === "financeAssociate" && selected.currentStep === 4 ? "Document Validation" : "Approval Action";
  const primaryAction = state.persona === "financeAssociate" && selected.currentStep === 4 ? "Open Document Validation" : "Approve and Notify Next Owner";
  const isDocumentValidation = state.persona === "financeAssociate" && selected.currentStep === 4;
  return `<section class="two-column approval-layout">${requestTable(queue)}<section class="panel action-panel"><div class="panel-header"><h3>${actionTitle}</h3>${statusPill(selected.status)}</div>${detail(selected)}${isDocumentValidation ? documentValidationWorkspace(selected) : `<div class="approval-actions"><button class="primary-button">${primaryAction}</button><button>Request More Information</button><button class="danger">Disapprove</button></div><label>Reviewer Note<textarea>Validated supporting documents and routing threshold.</textarea></label>`}</section></section>`;
}

function tracker() {
  const visibleRequests = personaRequests();
  const selected = visibleRequests.find((r) => r.id === state.trackerRequestId);
  if (selected) return `<section class="metric-detail-view"><div class="metric-detail-actions"><button type="button" class="back-button" data-close-tracker="true">← Back to Payment Tracker</button></div><div class="metric-detail-header"><div><span class="eyebrow">Tracker Detail</span><h3>${selected.id}</h3><p>Review request information and its current payment progress.</p></div>${statusPill(selected.status)}</div>${detail(selected)}${workflow(selected.currentStep)}</section>`;
  return `<section class="panel"><div class="panel-header"><h3>Payment Tracker</h3><button class="icon-button" title="Export Report">↧</button></div><div class="table-wrap"><table><thead><tr><th>Voucher</th><th>Submitted</th><th>Returned</th><th>Resubmitted</th><th>Approval</th><th>Check Approval</th><th>Payment</th></tr></thead><tbody>${requests.map((r, i) => `<tr data-tracker-request="${r.id}"><td>${r.id}</td><td>${r.submitted}</td><td>${r.returned || "-"}</td><td>${r.resubmitted || "-"}</td><td>${i === 0 ? "Pending" : "2026-06-24"}</td><td>${r.currentStep >= 11 ? "2026-06-25" : "Pending"}</td><td>${r.currentStep >= 13 ? "2026-06-25" : "Pending"}</td></tr>`).join("")}</tbody></table></div><div class="report-band"><div><span class="eyebrow">Report</span><strong>Unclaimed Checks</strong></div><p>Flags checks marked available but not yet released to the payee.</p></div></section>`;
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
  return `<section class="email-layout">
    <section class="panel email-stage-list"><div class="panel-header"><h3>Workflow stages</h3><span class="count">${steps.length}</span></div><div class="email-stage-buttons">
      ${steps.map(([id, name]) => `<button data-email-step="${id}" class="${state.emailStep === id ? "active" : ""}"><span>${stepLabel(id)}</span><div><strong>${name}</strong><small>To: ${emailTemplates[id][0]}</small></div></button>`).join("")}
    </div></section>
    <section class="email-preview-wrap"><div class="email-meta-panel">
      <div><span>To</span><strong>${recipient}</strong></div><div><span>Cc</span><strong>${request.requestor}, Finance Operations</strong></div>
      <div><span>Subject</span><strong>${subject} | ${request.id}</strong></div><div><span>Sent when</span><strong>${trigger}</strong></div>
    </div><article class="email-preview"><div class="email-brand"><span>AP</span><strong>Automated Payment System</strong></div><div class="email-body">
      <span class="email-step-label">Step ${stepLabel(step[0])}: ${step[1]}</span><h3>${intro}</h3><p>Hello ${recipient},</p><p>${message}</p>
      <div class="email-request-summary"><div><span>Request</span><strong>${request.id}</strong></div><div><span>Requestor</span><strong>${request.requestor}</strong></div><div><span>Payee</span><strong>${request.vendor}</strong></div><div><span>Department</span><strong>${request.department}</strong></div><div><span>Type</span><strong>${paymentTypes[request.type].label}</strong></div><div><span>Amount</span><strong>${money(request.amount)}</strong></div></div>
      <button class="email-action">${action}</button><p class="email-deadline">Please complete this action within two business days.</p><p class="email-fallback">If the button does not work, open: https://payments.example.local/requests/${request.id}</p>
    </div><footer>This is an automated workflow notification. Replies are not monitored.</footer></article></section>
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
  document.querySelectorAll('input[name="validationVat"]').forEach((input) => input.addEventListener("change", () => setState({ documentValidation: { ...state.documentValidation, vat: input.value } })));
  document.querySelectorAll('input[name="validationEwt"]').forEach((input) => input.addEventListener("change", () => setState({ documentValidation: { ...state.documentValidation, ewt: input.value } })));
  document.querySelector("[data-validation-other-ewt]")?.addEventListener("change", (event) => setState({ documentValidation: { ...state.documentValidation, otherEwt: event.target.value } }));
  document.querySelectorAll("[data-validation-copy]").forEach((input) => input.addEventListener("change", () => setState({ documentValidation: { ...state.documentValidation, [input.dataset.validationCopy]: input.checked } })));
  document.querySelector("[data-validation-check-number]")?.addEventListener("change", (event) => setState({ documentValidation: { ...state.documentValidation, checkNumber: event.target.value } }));
  document.querySelector("[data-validation-reviewer-note]")?.addEventListener("change", (event) => setState({ documentValidation: { ...state.documentValidation, reviewerNote: event.target.value } }));
  document.querySelectorAll("[data-accounting-index]").forEach((input) => input.addEventListener("change", () => {
    const entries = state.documentValidation.entries.map((entry, index) => index === Number(input.dataset.accountingIndex) ? { ...entry, [input.dataset.accountingField]: input.dataset.accountingField === "account" ? input.value : Number(input.value) || 0 } : entry);
    setState({ documentValidation: { ...state.documentValidation, entries } });
  }));
  document.querySelector("[data-add-accounting-row]")?.addEventListener("click", () => setState({ documentValidation: { ...state.documentValidation, entries: [...state.documentValidation.entries, { account: "", debit: 0, credit: 0 }] } }));
  document.querySelectorAll("[data-remove-accounting-row]").forEach((button) => button.addEventListener("click", () => setState({ documentValidation: { ...state.documentValidation, entries: state.documentValidation.entries.filter((_, index) => index !== Number(button.dataset.removeAccountingRow)) } })));
  document.querySelector("[data-complete-validation]")?.addEventListener("click", () => setState({ documentValidation: { ...state.documentValidation, completionDate: new Date().toISOString().slice(0, 10) } }));
  document.querySelectorAll("[data-request]").forEach((row) => row.addEventListener("click", () => navigate(state.tab === "approvals" ? `/approvals/${row.dataset.request}` : `/dashboard/request/${row.dataset.request}`)));
  document.querySelectorAll("[data-metric]").forEach((button) => button.addEventListener("click", () => navigate(`/dashboard/${button.dataset.metric}`)));
  document.querySelector("[data-close-metric]")?.addEventListener("click", () => navigate("/dashboard"));
  document.querySelector("[data-view-workflow]")?.addEventListener("click", (event) => navigate(`/dashboard/workflow/${event.currentTarget.dataset.viewWorkflow}`));
  document.querySelectorAll("[data-close-workflow]").forEach((button) => button.addEventListener("click", () => navigate(`/dashboard/request/${state.selectedId}`)));
  document.querySelector("[data-workflow-modal]")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) navigate(`/dashboard/request/${state.selectedId}`);
  });
  document.querySelectorAll("[data-metric-request]").forEach((row) => row.addEventListener("click", () => navigate(`/dashboard/request/${row.dataset.metricRequest}`)));
  document.querySelectorAll("[data-tracker-request]").forEach((row) => row.addEventListener("click", () => navigate(`/tracker/${row.dataset.trackerRequest}`)));
  document.querySelector("[data-close-tracker]")?.addEventListener("click", () => navigate("/tracker"));
  document.querySelectorAll("[data-type]").forEach((button) => button.addEventListener("click", () => navigate(`/requests/new/${button.dataset.type}`)));
  document.querySelectorAll("[data-email-step]").forEach((button) => button.addEventListener("click", () => navigate(`/emails/${button.dataset.emailStep}`)));
  document.querySelectorAll("[data-dashboard-filter]").forEach((input) => input.addEventListener(input.tagName === "INPUT" && input.type !== "number" ? "input" : "change", () => {
    state.dashboardFilters = { ...state.dashboardFilters, [input.dataset.dashboardFilter]: input.value };
    render();
    const replacement = document.querySelector(`[data-dashboard-filter="${input.dataset.dashboardFilter}"]`);
    replacement?.focus();
    if (replacement?.setSelectionRange && input.tagName === "INPUT" && input.type !== "number") replacement.setSelectionRange(replacement.value.length, replacement.value.length);
  }));
  document.querySelector("[data-clear-filters]")?.addEventListener("click", () => setState({ dashboardFilters: { voucher: "", type: "all", status: "all", minAmount: "", maxAmount: "", sortBy: "submitted", sortDirection: "desc" } }));
  document.querySelectorAll("[data-upload-request]").forEach((button) => button.addEventListener("click", () => setState({ uploadId: button.dataset.uploadRequest })));
  document.querySelector("[data-add-line]")?.addEventListener("click", addDraftLineItem);
  document.querySelectorAll("[data-remove-line]").forEach((button) => button.addEventListener("click", () => removeDraftLineItem(Number(button.dataset.removeLine))));
  document.querySelectorAll("[data-line-row]").forEach((input) => input.addEventListener("input", () => updateDraftLineItem(Number(input.dataset.lineRow), input.dataset.lineColumn, input.value)));
  document.querySelector("[data-print-voucher]")?.addEventListener("click", () => window.print());
  document.getElementById("unbudgeted")?.addEventListener("change", (event) => setState({ budgeted: !event.target.checked }));
  document.getElementById("liquidationAdvanceAmount")?.addEventListener("input", (event) => {
    state.liquidationAdvanceAmount = Number(event.target.value) || 0;
    const expenses = state.lineItemsByType.liquidation.reduce((sum, item) => sum + (Number(item.Amount) || 0), 0);
    const output = document.getElementById("liquidationSettlement");
    if (output) output.textContent = settlementFor(state.liquidationAdvanceAmount, expenses);
  });
}

window.addEventListener("hashchange", () => {
  state = { ...state, ...routeStateFromHash() };
  render();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.dashboardWorkflow) navigate(`/dashboard/request/${state.selectedId}`);
});
if (!window.location.hash) window.location.replace(`${window.location.pathname}${window.location.search}#/dashboard`);
state = { ...state, ...routeStateFromHash() };
render();
