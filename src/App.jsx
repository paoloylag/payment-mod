import React, { useEffect, useMemo, useState } from "react";

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
    required: ["Particulars of P.O. Payment", "Department / Cost Center for Each Line Item", "Approved P.O."],
    mandatoryFields: [
      { label: "Particulars of P.O. Payment", kind: "textarea", value: "Office equipment purchase order payment" },
    ],
    uploadDocuments: ["Approved P.O.", "BIR 2303 (If New Supplier)", "Billing / Quotation / SOA", "Invoice (If Available)"],
    lineColumns: ["P.O. Number", "Supplier", "Particulars", "Expense Account", "Department / Cost Center", "Amount", "Attachment"],
  },
  general: {
    label: "General Payment",
    prefix: "GEN",
    required: ["Particulars of Payment", "Department / Cost Center for Each Line Item", "Billing or Invoice"],
    mandatoryFields: [
      { label: "Particulars of Payment", kind: "textarea", value: "Monthly utilities and service charges" },
    ],
    uploadDocuments: ["Billing or Invoice", "BIR 2303 (If New Supplier)", "Billing / Quotation / SOA", "Invoice (If Available)"],
    lineColumns: ["Merchant Name", "Particulars", "Expense Account", "Department / Cost Center", "Amount", "Attachment"],
  },
};

const steps = [
  { id: 1, name: "Request", owner: "Requesting Department" },
  { id: 2, name: "Documents", owner: "Requestor" },
  { id: 3, name: "Department Approval", owner: "Department Head" },
  { id: 4, name: "Document Validation", owner: "Finance Associate" },
  { id: 5, name: "Budget Review", owner: "Finance Manager" },
  { id: 7, name: "COO Approval", owner: "COO", rule: "100,000.01 to 300,000" },
  { id: 8, name: "President Approval", owner: "President", rule: "Budgeted above 300,000" },
  { id: 8.5, displayId: "8B", name: "Board Approval", owner: "Board Member", rule: "Unbudgeted above 1,000,000" },
  { id: 9, name: "Voucher", owner: "Finance Associate" },
  { id: 10, name: "Bank Processing", owner: "Finance Associate" },
  { id: 11, name: "Bank Authorization", owner: "Authorized Signatories" },
  { id: 12, name: "Vendor Notice", owner: "Finance Associate" },
  { id: 13, name: "Release", owner: "Finance Associate" },
  { id: 14, name: "Tracker", owner: "System" },
  { id: 15, name: "Complete", owner: "System" },
];

const emailTemplates = {
  1: { recipient: "Requestor", subject: "Complete your payment request", trigger: "Draft created", intro: "Your payment request draft has been saved.", message: "Complete the required request information so Finance can begin processing it.", action: "Continue Request" },
  2: { recipient: "Requestor", subject: "Required documents need to be uploaded", trigger: "Request details completed", intro: "Your request details are ready.", message: "Upload the required supporting documents shown in the request checklist before submission.", action: "Upload Documents" },
  3: { recipient: "Department Head", subject: "Approval required: payment request", trigger: "Request submitted", intro: "A payment request from your department is awaiting approval.", message: "Review the purpose, payee, amount, cost center, and supporting documents before approving.", action: "Review Request" },
  4: { recipient: "Finance Associate", subject: "Document validation required", trigger: "Department Head approved", intro: "An approved request is ready for Finance validation.", message: "Validate the uploaded documents and add any withholding tax or accounting computation needed.", action: "Validate Documents" },
  5: { recipient: "Finance Manager", subject: "Budget review required", trigger: "Documents validated", intro: "A validated payment request is ready for budget review.", message: "Confirm budget availability, accounting treatment, and the approval route based on the amount.", action: "Review Budget" },
  7: { recipient: "COO", subject: "COO approval required: payment request", trigger: "Finance review completed", intro: "A payment request requires your approval.", message: "This request is unbudgeted, over budget, or falls within the PHP 100,000.01 to PHP 300,000 approval threshold.", action: "Review and Approve" },
  8: { recipient: "President", subject: "President approval required: payment request", trigger: "Finance review completed", intro: "A high-value budgeted payment request requires your approval.", message: "This budgeted request exceeds PHP 300,000. Review the approval trail and supporting documents before deciding.", action: "Review and Approve" },
  "8.5": { recipient: "Board Member", subject: "Board approval required: unbudgeted payment request", trigger: "Executive review completed", intro: "An unbudgeted payment request above PHP 1,000,000 requires Board approval.", message: "Review the complete executive approval trail, funding justification, payee details, and supporting documents before deciding.", action: "Review and Approve" },
  9: { recipient: "Finance Associate", subject: "Create payment voucher", trigger: "Final approval completed", intro: "The payment request has received its final approval.", message: "Create the payment voucher and confirm the payee, tax deductions, net payment, and accounting entries.", action: "Create Voucher" },
  10: { recipient: "Finance Associate", subject: "Payment is ready for bank processing", trigger: "Voucher created", intro: "An approved payment voucher is ready for processing.", message: "Prepare the bank transfer or check and record the payment reference in the request.", action: "Process Payment" },
  11: { recipient: "Authorized Signatories", subject: "Bank authorization required", trigger: "Payment instruction prepared", intro: "A payment instruction is awaiting bank authorization.", message: "Review the voucher, approval trail, payee details, and payment instruction before authorizing.", action: "Authorize Payment" },
  12: { recipient: "Vendor", subject: "Payment ready for processing: {{request_id}}", trigger: "Bank authorization completed", intro: "Your payment is ready for processing.", message: "The payment instruction has completed bank authorization. Review the payment details and reference below.", action: "View Payment Details" },
  13: { recipient: "Department Requestor and Vendor", subject: "Payment available for pick-up: {{request_id}}", trigger: "Payment marked available for pick-up", intro: "The payment is now available for pick-up.", message: "The update date, time, and Finance personnel who recorded the status are included for reference.", action: "View Release Details" },
  14: { recipient: "Finance Associate", subject: "Payment tracker updated", trigger: "Payment released", intro: "The payment tracker has been updated automatically.", message: "Review the recorded turnaround dates and resolve any remaining tracker exceptions.", action: "View Tracker" },
  15: { recipient: "Department Requestor and Vendor", subject: "Payment completed: {{request_id}}", trigger: "Transaction completed", intro: "Your payment transaction has been completed.", message: "Payment has been completed. The payment date, amount, method, and reference are included for your records.", action: "View Payment Record" },
};

const uploadSamples = [
  { id: "RMB-2026-0161", type: "reimbursement", requestor: "Lia Dizon", department: "People Ops", vendor: "Training Center", amount: 72300, documents: [
    { name: "Invoice", required: true, file: "training-invoice-1042.pdf", size: "248 KB" },
    { name: "Billing / Quotation / SOA", required: false, file: "training-quotation.pdf", size: "181 KB" },
    { name: "Proof of Payment", required: true, file: "proof-of-payment.png", size: "864 KB" },
    { name: "Receipt for Each Line Item", required: true },
    { name: "Cash Advance Form", required: false, file: "cash-advance-reference.pdf", size: "226 KB" },
  ] },
  { id: "RMB-2026-0164", type: "reimbursement", requestor: "Mika Santos", department: "Marketing", vendor: "Event Registration", amount: 21850, documents: [
    { name: "Invoice", required: true },
    { name: "Billing / Quotation / SOA", required: false },
    { name: "Proof of Payment", required: true, file: "card-payment-receipt.pdf", size: "126 KB" },
    { name: "Receipt for Each Line Item", required: true },
    { name: "Cash Advance Form", required: false },
  ] },
  { id: "CA-2026-0065", type: "cashAdvance", requestor: "Tara Lim", department: "Sales", vendor: "Internal", amount: 35000, documents: [
    { name: "Cash Advance Form", required: true, file: "signed-cash-advance-form.pdf", size: "319 KB" },
    { name: "Supporting Budget / Itinerary", required: true },
  ] },
  { id: "CA-2026-0068", type: "cashAdvance", requestor: "Iya Cruz", department: "Events", vendor: "Internal", amount: 39000, documents: [
    { name: "Cash Advance Form", required: true, file: "event-cash-advance.pdf", size: "284 KB" },
    { name: "Supporting Budget / Itinerary", required: true, file: "event-budget-and-itinerary.xlsx", size: "92 KB" },
  ] },
  { id: "PO-2026-0102", type: "poPayment", requestor: "Bea Tan", department: "Procurement", vendor: "Atlas Office Systems", amount: 141750, documents: [
    { name: "Approved P.O.", required: true, file: "PO-2026-0102-approved.pdf", size: "411 KB" },
    { name: "BIR 2303 (New Supplier)", required: false, file: "atlas-bir-2303.pdf", size: "205 KB" },
    { name: "Billing / Quotation / SOA", required: true, file: "atlas-soa-june.pdf", size: "176 KB" },
    { name: "Invoice", required: false },
  ] },
  { id: "PO-2026-0105", type: "poPayment", requestor: "Jon Reyes", department: "Operations", vendor: "Northstar Supplies", amount: 98200, documents: [
    { name: "Approved P.O.", required: true },
    { name: "BIR 2303 (New Supplier)", required: false },
    { name: "Billing / Quotation / SOA", required: true, file: "northstar-quotation.pdf", size: "238 KB" },
    { name: "Invoice", required: false },
  ] },
  { id: "GEN-2026-0053", type: "general", requestor: "Nico Ramos", department: "Facilities", vendor: "Metro Repairs", amount: 66200, documents: [
    { name: "Billing or Invoice", required: true, file: "metro-repairs-invoice.pdf", size: "154 KB" },
    { name: "BIR 2303 (New Supplier)", required: false },
    { name: "Billing / Quotation / SOA", required: false, file: "repair-quotation.pdf", size: "202 KB" },
    { name: "Other Supporting Document", required: false },
  ] },
  { id: "GEN-2026-0057", type: "general", requestor: "Carlo Uy", department: "IT", vendor: "CloudWorks", amount: 88400, documents: [
    { name: "Billing or Invoice", required: true },
    { name: "BIR 2303 (New Supplier)", required: false, file: "cloudworks-bir-2303.pdf", size: "196 KB" },
    { name: "Billing / Quotation / SOA", required: false },
    { name: "Other Supporting Document", required: false, file: "service-acceptance.pdf", size: "118 KB" },
  ] },
];

const lineItemExamples = {
  reimbursement: [
    { "Merchant Name": "Training Center", "Invoice Date": "2026-07-15", "Invoice Number": "INV-1042", Particulars: "Leadership workshop registration", Amount: 50000 },
    { "Merchant Name": "Travel Desk", "Invoice Date": "2026-07-16", "Invoice Number": "OR-1048", Particulars: "Workshop transportation", Amount: 75000 },
  ],
  cashAdvance: [
    { Particulars: "Regional transportation", Amount: 25000 },
    { Particulars: "Meals and incidentals", Amount: 10000 },
  ],
  liquidation: [
    { "Merchant Name": "Training Center", "Invoice Date": "2026-07-15", "Invoice Number": "INV-2051", Particulars: "Workshop venue and meals", Amount: 30000 },
    { "Merchant Name": "Travel Desk", "Invoice Date": "2026-07-16", "Invoice Number": "OR-2058", Particulars: "Local transportation", Amount: 15000 },
  ],
  poPayment: [
    { "P.O. Number": "PO-2026-0106", Supplier: "Northstar Supplies", Particulars: "Office workstations", "Department / Cost Center": "Operations - 4400", Amount: 98000 },
    { "P.O. Number": "PO-2026-0106", Supplier: "Northstar Supplies", Particulars: "Delivery and installation", "Department / Cost Center": "IT - 4500", Amount: 27500 },
  ],
  general: [
    { "Merchant Name": "City Utilities", Particulars: "Electricity service", "Department / Cost Center": "Facilities - 4600", Amount: 48500, Attachment: "electric-bill.pdf" },
    { "Merchant Name": "City Utilities", Particulars: "Water service", "Department / Cost Center": "Admin - 4000", Amount: 12200, Attachment: "water-bill.pdf" },
    { "Merchant Name": "CloudWorks", Particulars: "Monthly hosting", "Department / Cost Center": "IT - 4500", Amount: 27700, Attachment: "cloud-invoice.pdf" },
  ],
};

const initialLineItems = Object.fromEntries(Object.entries(paymentTypes).map(([type, config]) => [
  type,
  [Object.fromEntries(config.lineColumns.map((column) => [column, column === "Amount" ? 0 : ""]))],
]));

const seedRequests = [
  ["RMB-2026-0144", "reimbursement", "Mika Santos", "Marketing", "Event Registration", 12350, true, "Draft Request", 1, "2026-06-25", "", "", 0, 3, "Requestor is filling out mandatory request fields."],
  ["CA-2026-0049", "cashAdvance", "Tara Lim", "Sales", "Internal", 35000, false, "Uploading Documents", 2, "2026-06-25", "", "", 1, 1, "Requestor is attaching cash advance support and cost center details."],
  ["GEN-2026-0034", "general", "Alex Cruz", "Admin", "City Utilities", 18500, true, "Department Approval", 3, "2026-06-24", "", "", 3, 0, "Department Head is reviewing purpose, amount, and attachments."],
  ["GEN-2026-0200", "general", "Jonas Lee Baro", "Facilities", "TOJUST Construction", 200000, true, "Document Validation", 4, "2026-08-20", "", "", 2, 0, "Business validation sample: VAT-inclusive gross PHP 200,000.00, VAT PHP 21,428.57, net-of-VAT/EWT base PHP 178,571.43, 2% EWT PHP 3,571.43, and amount due PHP 196,428.57."],
  ["GEN-2026-0201", "general", "Jonas Lee Baro", "Facilities", "TOJUST Construction", 100000, true, "Document Validation", 4, "2026-08-20", "", "", 1, 0, "50% downpayment sample: VAT-inclusive gross PHP 100,000.00, VAT PHP 10,714.29, net-of-VAT/EWT base PHP 89,285.71, 2% EWT PHP 1,785.71, and amount due PHP 98,214.29."],
  ["RMB-2026-0148", "reimbursement", "Mika Santos", "Marketing", "Hotel Benilde", 84350, true, "Document Validation", 4, "2026-06-21", "", "", 4, 0, "Finance Associate added withholding tax computation."],
  ["PO-2026-0088", "poPayment", "Jon Reyes", "Operations", "Northstar Supplies", 98000, true, "Finance Budget Review", 5, "2026-06-20", "", "", 5, 0, "Finance Manager is checking budget availability and accounting entry."],
  ["PO-2026-0092", "poPayment", "Jon Reyes", "Operations", "Northstar Supplies", 248900, true, "COO Approval", 7, "2026-06-19", "2026-06-20", "2026-06-22", 5, 0, "Department Head approved after receiving revised SOA."],
  ["GEN-2026-0037", "general", "Alex Cruz", "Admin", "City Utilities", 329500, true, "President Approval", 8, "2026-06-18", "", "", 3, 0, "Finance Manager routed to President based on threshold."],
  ["PO-2026-0108", "poPayment", "Bea Tan", "Procurement", "Enterprise Systems Corp.", 1250000, false, "Board Approval", 8.5, "2026-06-18", "", "", 5, 0, "The unbudgeted request exceeded PHP 1,000,000 and was routed to a Board Member."],
  ["RMB-2026-0150", "reimbursement", "Lia Dizon", "People Ops", "Training Center", 72300, true, "Voucher Creation", 9, "2026-06-17", "", "", 4, 0, "System is generating the payment voucher with approval signatures."],
  ["GEN-2026-0041", "general", "Nico Ramos", "Facilities", "Metro Repairs", 66200, true, "Bank Payment Processing", 10, "2026-06-16", "", "", 3, 0, "Finance Associate is preparing the check payment."],
  ["PO-2026-0098", "poPayment", "Bea Tan", "Procurement", "Atlas Office Systems", 141750, true, "Bank Authorization", 11, "2026-06-15", "", "", 5, 0, "Authorized signatories need to complete bank authorization."],
  ["PO-2026-0120", "poPayment", "Bea Tan", "Procurement", "Multiple Vendors (3)", 287500, true, "Vendor Notification", 12, "2026-08-20", "", "", 6, 0, "Three P.O. line-item groups are ready for separate vendor notifications: Atlas Office Systems, Northstar Supplies, and TechSource Solutions."],
  ["GEN-2026-0044", "general", "Carlo Uy", "IT", "CloudWorks", 88400, true, "Vendor Notification", 12, "2026-06-14", "", "", 3, 0, "Check is available and vendor notification is ready."],
  ["RMB-2026-0154", "reimbursement", "Sam Lee", "Legal", "Travel Desk", 30750, true, "Payment Release", 13, "2026-06-13", "", "", 4, 0, "Finance Associate is recording check release to the payee."],
  ["CA-2026-0061", "cashAdvance", "Iya Cruz", "Events", "Internal", 39000, true, "Payment Tracker", 14, "2026-06-12", "2026-06-13", "2026-06-14", 2, 0, "System is updating turnaround dates and tracker reporting."],
  ["GEN-2026-0049", "general", "Paolo Reyes", "Finance", "Completed Payment", 101250, true, "Completed", 15, "2026-06-11", "", "", 4, 0, "The payment request workflow is complete."],
].map(([id, type, requestor, department, vendor, amount, budgeted, status, currentStep, submitted, returned, resubmitted, documents, missing, note]) => ({
  id,
  type,
  requestor,
  department,
  vendor,
  amount,
  budgeted,
  status,
  currentStep,
  submitted,
  returned,
  resubmitted,
  documents,
  missing,
  comments: [note],
}));

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const calculateTaxes = (grossAmount, ewtRate = 0, vatInclusive = true) => {
  const gross = roundMoney(grossAmount);
  const rawNetOfVat = vatInclusive ? gross / 1.12 : gross;
  const netOfVat = roundMoney(rawNetOfVat);
  const vatAmount = vatInclusive ? roundMoney(gross - rawNetOfVat) : 0;
  const ewtAmount = roundMoney(rawNetOfVat * (Number(ewtRate) / 100));
  return { gross, netOfVat, vatAmount, ewtRate: Number(ewtRate), ewtAmount, amountDue: roundMoney(gross - ewtAmount) };
};
const formatStep = (value) => value === 8.5 ? "8B" : value;

function getRoute(request) {
  if (request.type === "cashAdvance") return request.amount > 40000 ? "Exceeds the PHP 40,000 employee cash advance limit." : "Finance Manager approval is required for this cash advance.";
  if (!request.budgeted && request.amount > 1000000) return "Board Member approval required for unbudgeted payments above PHP 1,000,000.";
  if (!request.budgeted) return "COO approval required for unbudgeted payments up to PHP 1,000,000.";
  if (request.amount <= 100000) return "Finance Manager can approve and route to voucher creation.";
  if (request.amount <= 300000) return "COO approval required by amount threshold.";
  return "President approval required for budgeted payments above PHP 300,000.";
}

function getFinalApprovalRole(request) {
  if (request.type === "cashAdvance" || (request.budgeted && request.amount <= 100000)) return "Finance Manager";
  if (!request.budgeted && request.amount > 1000000) return "Board Member";
  if (!request.budgeted || request.amount <= 300000) return "COO";
  return "President";
}

function getApprovalCertification(request) {
  const key = request.id.replace(/[^A-Z0-9]/g, "");
  return [
    { stage: "Department Approval", approver: `${request.department} Department Head`, decision: "Approved", timestamp: "2026-06-20 09:14", id: `APR-${key}-DH` },
    { stage: "Document Validation", approver: "Ms. Rhee · Finance Associate", decision: "Validated", timestamp: "2026-06-22 14:36", id: `APR-${key}-DV` },
    { stage: "Final Approval", approver: getFinalApprovalRole(request), decision: "Approved", timestamp: "2026-06-23 11:08", id: `APR-${key}-FA` },
  ];
}

function getVoucher(request) {
  if (request.currentStep < 9) return null;

  const taxes = calculateTaxes(request.amount, 2, true);
  const typeLabel = paymentTypes[request.type].label;

  return {
    number: `PV-${request.id.replace("-2026-", "-")}`,
    date: "2026-06-24",
    paymentMethod: "Check payment",
    bank: "BDO Operating Account - 1284",
    checkNumber: request.currentStep >= 11 ? "CHK-004918" : "Pending bank processing",
    ...taxes,
    purpose: `${typeLabel} payment for ${request.vendor}`,
    attachments: [
      `${typeLabel} request form`,
      "Approved request workflow trail",
      request.type === "poPayment" ? "Approved purchase order" : "Invoice / billing support",
      "Accounting entry support",
    ],
  };
}

function App() {
  const initialPath = (window.location.hash.slice(1) || "/dashboard").split("/").filter(Boolean);
  const initialTab = initialPath[0] === "requests" ? "request" : initialPath[0] === "documents" ? (initialPath[1] === "rules" ? "documents" : "uploads") : initialPath[0] === "admin" ? "admin" : ["dashboard", "approvals", "tracker", "emails"].includes(initialPath[0]) ? initialPath[0] : "dashboard";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [selectedId, setSelectedId] = useState(seedRequests[0].id);
  const [trackerRequestId, setTrackerRequestId] = useState(initialTab === "tracker" ? initialPath[1] || null : null);
  const [dashboardMetric, setDashboardMetric] = useState(initialTab === "dashboard" && ["pending", "value", "returned", "unclaimed"].includes(initialPath[1]) ? initialPath[1] : null);
  const [dashboardWorkflowId, setDashboardWorkflowId] = useState(initialTab === "dashboard" && initialPath[1] === "workflow" ? initialPath[2] || null : null);
  const [draftType, setDraftType] = useState(initialTab === "request" && paymentTypes[initialPath[2]] ? initialPath[2] : "reimbursement");
  const [lineItemsByType, setLineItemsByType] = useState(() => Object.fromEntries(
    Object.entries(initialLineItems).map(([type, rows]) => [type, rows.map((row) => ({ ...row }))])
  ));
  const [budgeted, setBudgeted] = useState(true);
  const [emailStep, setEmailStep] = useState(3);
  const [uploadId, setUploadId] = useState(uploadSamples[0].id);
  const [theme, setTheme] = useState(() => localStorage.getItem("payment-module-theme") || (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const selected = seedRequests.find((request) => request.id === selectedId) || seedRequests[0];
  const draftLineItems = lineItemsByType[draftType];
  const draftAmount = draftLineItems.reduce((sum, item) => sum + (Number(item.Amount) || 0), 0);
  const draftRequest = { amount: draftAmount, budgeted, type: draftType };
  const navigateTo = (path) => { window.location.hash = path; };

  useEffect(() => {
    const syncRoute = () => {
      const parts = (window.location.hash.slice(1) || "/dashboard").split("/").filter(Boolean);
      if (parts[0] === "requests") { setActiveTab("request"); if (paymentTypes[parts[2]]) setDraftType(parts[2]); }
      else if (parts[0] === "documents") setActiveTab(parts[1] === "rules" ? "documents" : "uploads");
      else if (parts[0] === "tracker") { setActiveTab("tracker"); setTrackerRequestId(parts[1] || null); }
      else if (parts[0] === "dashboard") { setActiveTab("dashboard"); setDashboardMetric(["pending", "value", "returned", "unclaimed"].includes(parts[1]) ? parts[1] : null); setDashboardWorkflowId(parts[1] === "workflow" ? parts[2] || null : null); if (["request", "workflow"].includes(parts[1]) && seedRequests.some((request) => request.id === parts[2])) setSelectedId(parts[2]); }
      else if (parts[0] === "admin") setActiveTab("admin");
      else if (["approvals", "emails"].includes(parts[0])) setActiveTab(parts[0]);
      else setActiveTab("dashboard");
    };
    window.addEventListener("hashchange", syncRoute);
    if (!window.location.hash) window.location.hash = "/dashboard";
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("payment-module-theme", theme);
  }, [theme]);

  const updateLineItem = (rowIndex, column, value) => {
    setLineItemsByType((current) => ({
      ...current,
      [draftType]: current[draftType].map((row, index) => index === rowIndex ? { ...row, [column]: value } : row),
    }));
  };

  const addLineItem = () => {
    const emptyItem = Object.fromEntries(paymentTypes[draftType].lineColumns.map((column) => [column, column === "Amount" ? 0 : ""]));
    setLineItemsByType((current) => ({ ...current, [draftType]: [...current[draftType], emptyItem] }));
  };

  const removeLineItem = (rowIndex) => {
    setLineItemsByType((current) => current[draftType].length === 1 ? current : {
      ...current,
      [draftType]: current[draftType].filter((_, index) => index !== rowIndex),
    });
  };

  const metrics = useMemo(() => {
    const pendingApproval = seedRequests.filter((request) => [3, 4, 5, 7, 8, 8.5].includes(request.currentStep)).length;
    const total = seedRequests.reduce((sum, request) => sum + request.amount, 0);
    const returned = seedRequests.filter((request) => request.status.includes("Returned")).length;
    const unclaimed = seedRequests.filter((request) => request.currentStep === 12).length;
    return { pendingApproval, total, returned, unclaimed };
  }, []);

  return (
    <div className={`app-shell ${mobileNavOpen ? "nav-open" : ""}`}>
      <button type="button" className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />
      <aside className="sidebar" id="primarySidebar">
        <div className="sidebar-mobile-header"><span>Navigation</span><button type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation">×</button></div>
        <div className="brand-block">
          <div className="brand-mark">AP</div>
          <div>
            <h1>Automated Payment System</h1>
            <p>Finance Operations</p>
          </div>
        </div>
        <nav className="nav-list" aria-label="Primary">
          {[
            ["Overview", [["dashboard", "Dashboard", "▦"]]],
            ["Requests", [["request", "New Request", "+"], ["uploads", "Document Uploads", "↑"], ["documents", "Document Rules", "□"]]],
            ["Processing", [["approvals", "Approval Queue", "✓"], ["tracker", "Payment Tracker", "↗"]]],
            ["Records", [["emails", "Email Samples", "@"]]],
            ["Administration", [["admin", "Users & Permissions", "⚙"]]],
          ].map(([group, links]) => (
            <div className="nav-group" key={group}>
              <span className="nav-group-label">{group}</span>
              <div className="nav-group-links">
                {links.map(([id, label, icon]) => (
                  <button key={id} className={activeTab === id ? "active" : ""} onClick={() => navigateTo(id === "request" ? `/requests/new/${draftType}` : ({ dashboard: "/dashboard", approvals: "/approvals", tracker: "/tracker", uploads: "/documents/uploads", documents: "/documents/rules", emails: "/emails", admin: "/admin/users" })[id])}>
                    <span>{icon}</span>{label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="sidebar-footer"><span className="sidebar-status-icon">✓</span><span>Prototype access enabled</span></div>
      </aside>

      <main>
        <header className="topbar">
          <div className="mobile-title-row">
            <button type="button" className="hamburger-button icon-button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><span /><span /><span /></button>
            <div><h2>{tabTitle(activeTab)}</h2><p>Finance Operations</p></div>
          </div>
          <div className="topbar-actions">
            <label className="shell-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search payment application" placeholder="Search" /></label>
            <button type="button" className="icon-button" aria-label="Notifications" title="Notifications">◉</button>
            <button type="button" className="theme-toggle icon-button" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>{theme === "dark" ? "☀" : "☾"}</button>
            <div className="user-chip"><span className="user-chip-avatar">SA</span><span className="user-chip-copy"><strong>System Administrator</strong><small>Prototype Admin</small></span></div>
          </div>
        </header>

        {activeTab === "dashboard" && <Dashboard metrics={metrics} selected={selected} onSelect={(id) => { setSelectedId(id); navigateTo(`/dashboard/request/${id}`); }} activeMetric={dashboardMetric} onMetric={(metric) => navigateTo(metric ? `/dashboard/${metric}` : "/dashboard")} workflowRequestId={dashboardWorkflowId} onWorkflow={(id) => navigateTo(id ? `/dashboard/workflow/${id}` : `/dashboard/request/${selected.id}`)} />}
        {activeTab === "request" && (
          <RequestBuilder
            draftType={draftType}
            setDraftType={(type) => navigateTo(`/requests/new/${type}`)}
            draftAmount={draftAmount}
            lineItems={draftLineItems}
            updateLineItem={updateLineItem}
            addLineItem={addLineItem}
            removeLineItem={removeLineItem}
            budgeted={budgeted}
            setBudgeted={setBudgeted}
            draftRequest={draftRequest}
          />
        )}
        {activeTab === "approvals" && <ApprovalQueue selected={selected} onSelect={setSelectedId} />}
        {activeTab === "tracker" && <Tracker selectedId={trackerRequestId} onSelect={(id) => navigateTo(id ? `/tracker/${id}` : "/tracker")} />}
        {activeTab === "uploads" && <DocumentUploads selectedId={uploadId} onSelect={setUploadId} />}
        {activeTab === "documents" && <DocumentRules />}
        {activeTab === "emails" && <EmailSamples selectedStep={emailStep} onSelectStep={setEmailStep} />}
        {activeTab === "admin" && <AdminAccess />}
      </main>
    </div>
  );
}

function tabTitle(tab) {
  return {
    dashboard: "Payment Requests",
    request: "Create Payment Request",
    approvals: "Review and Approve",
    tracker: "Tracker and Reports",
    uploads: "Upload Required Documents",
    documents: "Required Documents",
    emails: "Workflow Email Samples",
    admin: "Users & Permissions",
  }[tab];
}

const accessRoles = {
  requestor: { name: "Requestor", description: "Creates requests and tracks their own payments." },
  departmentHead: { name: "Department Head", description: "Reviews requests for assigned departments." },
  financeAssociate: { name: "Finance Associate", description: "Validates documents and processes payments." },
  financeManager: { name: "Finance Manager", description: "Reviews budgets and manages finance operations." },
  executiveApprover: { name: "Executive Approver", description: "Approves routed high-value requests." },
  administrator: { name: "Administrator", description: "Manages users, roles, and system access." },
};

const accessPermissions = [
  ["requests.create", "Create payment requests", "Requests"],
  ["requests.view_all", "View requests across departments", "Requests"],
  ["requests.unlock", "Unlock submitted requests", "Requests"],
  ["documents.validate", "Validate supporting documents", "Processing"],
  ["approvals.department", "Approve for assigned departments", "Approvals"],
  ["approvals.finance", "Approve finance and budget reviews", "Approvals"],
  ["approvals.executive", "Approve executive-level requests", "Approvals"],
  ["payments.process", "Process and release payments", "Payments"],
  ["reports.export", "Export transaction reports", "Reports"],
  ["admin.manage_users", "Manage users and access", "Administration"],
];

const initialAccessUsers = [
  { id: 1, name: "Paolo Ylag", email: "paolo.ylag@life.edu.ph", department: "Finance", status: "Active", roles: ["administrator"], permissions: ["requests.view_all", "requests.unlock", "reports.export", "admin.manage_users"], lastActive: "Today, 9:42 AM" },
  { id: 2, name: "Mika Santos", email: "mika.santos@example.com", department: "Marketing", status: "Active", roles: ["requestor"], permissions: ["requests.create"], lastActive: "Today, 8:16 AM" },
  { id: 3, name: "Ms. Rhee", email: "rhee@example.com", department: "Finance", status: "Active", roles: ["financeAssociate"], permissions: ["requests.view_all", "documents.validate", "payments.process", "reports.export"], lastActive: "Yesterday, 4:51 PM" },
  { id: 4, name: "Alex Cruz", email: "alex.cruz@example.com", department: "Administration", status: "Active", roles: ["requestor", "departmentHead"], permissions: ["requests.create", "approvals.department"], lastActive: "Aug 15, 2026" },
  { id: 5, name: "Finance Manager", email: "finance.manager@example.com", department: "Finance", status: "Active", roles: ["financeManager"], permissions: ["requests.view_all", "requests.unlock", "approvals.finance", "reports.export"], lastActive: "Aug 14, 2026" },
  { id: 6, name: "Chief Operating Officer", email: "coo@example.com", department: "Executive", status: "Suspended", roles: ["executiveApprover"], permissions: ["requests.view_all", "approvals.executive"], lastActive: "Aug 8, 2026" },
];

function AdminAccess() {
  const [users, setUsers] = useState(initialAccessUsers);
  const [selectedId, setSelectedId] = useState(initialAccessUsers[0].id);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(false);
  const selected = users.find((user) => user.id === selectedId) || users[0];
  const visibleUsers = users.filter((user) => `${user.name} ${user.email} ${user.department}`.toLowerCase().includes(query.toLowerCase()));
  const updateSelected = (patch) => { setSaved(false); setUsers((current) => current.map((user) => user.id === selected.id ? { ...user, ...patch } : user)); };
  const toggleRole = (role) => updateSelected({ roles: selected.roles.includes(role) ? selected.roles.filter((item) => item !== role) : [...selected.roles, role] });
  const togglePermission = (permission) => updateSelected({ permissions: selected.permissions.includes(permission) ? selected.permissions.filter((item) => item !== permission) : [...selected.permissions, permission] });
  const groupedPermissions = Object.groupBy ? Object.groupBy(accessPermissions, (permission) => permission[2]) : accessPermissions.reduce((groups, permission) => ({ ...groups, [permission[2]]: [...(groups[permission[2]] || []), permission] }), {});

  return <section className="admin-access-view">
    <div className="admin-summary-row">
      <article><span>Total users</span><strong>{users.length}</strong><small>{users.filter((user) => user.status === "Active").length} active accounts</small></article>
      <article><span>Roles</span><strong>{Object.keys(accessRoles).length}</strong><small>Reusable access profiles</small></article>
      <article><span>Administrators</span><strong>{users.filter((user) => user.roles.includes("administrator")).length}</strong><small>Full access managers</small></article>
      <article><span>Suspended</span><strong>{users.filter((user) => user.status === "Suspended").length}</strong><small>Sign-in blocked</small></article>
    </div>
    {saved && <div className="admin-save-notice" role="status">✓ Access changes saved for {selected.name}. An audit record was created.</div>}
    <div className="admin-access-layout">
      <section className="panel admin-user-list">
        <div className="panel-header"><div><span className="eyebrow">Directory</span><h3>System Users</h3></div><button type="button" className="primary-button" onClick={() => alert("Invite-user flow is ready for backend integration.")}>+ Invite User</button></div>
        <label className="admin-user-search"><span>Search users</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, or department" /></label>
        <div className="admin-user-rows">{visibleUsers.map((user) => <button type="button" key={user.id} className={selected.id === user.id ? "selected" : ""} onClick={() => { setSelectedId(user.id); setSaved(false); }}><span className="admin-avatar">{user.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span><strong>{user.name}</strong><small>{user.email}</small><small>{user.department}</small></span><i className={user.status.toLowerCase()}>{user.status}</i></button>)}</div>
      </section>
      <section className="panel admin-user-editor">
        <div className="admin-user-heading"><div><span className="eyebrow">Access Profile</span><h3>{selected.name}</h3><p>{selected.email} · Last active {selected.lastActive}</p></div><label>Account status<select value={selected.status} onChange={(event) => updateSelected({ status: event.target.value })}><option>Active</option><option>Suspended</option></select></label></div>
        <div className="admin-editor-section"><div className="admin-section-heading"><div><h4>Assigned roles</h4><p>Roles provide a baseline set of capabilities. A user may hold more than one role.</p></div><span>{selected.roles.length} assigned</span></div><div className="admin-role-grid">{Object.entries(accessRoles).map(([id, role]) => <label key={id} className={selected.roles.includes(id) ? "selected" : ""}><input type="checkbox" checked={selected.roles.includes(id)} onChange={() => toggleRole(id)} /><span><strong>{role.name}</strong><small>{role.description}</small></span></label>)}</div></div>
        <div className="admin-editor-section"><div className="admin-section-heading"><div><h4>Permission overrides</h4><p>Fine-tune what this user can do beyond their assigned roles.</p></div><span>{selected.permissions.length} enabled</span></div><div className="admin-permission-groups">{Object.entries(groupedPermissions).map(([group, permissions]) => <div key={group}><h5>{group}</h5>{permissions.map(([id, label]) => <label key={id}><span><strong>{label}</strong><code>{id}</code></span><input type="checkbox" role="switch" checked={selected.permissions.includes(id)} onChange={() => togglePermission(id)} /></label>)}</div>)}</div></div>
        <div className="admin-editor-actions"><p>Changes will apply the next time this user refreshes or signs in.</p><button type="button" className="primary-button" onClick={() => setSaved(true)}>Save Access Changes</button></div>
      </section>
    </div>
  </section>;
}

function Dashboard({ metrics, selected, onSelect, activeMetric, onMetric, workflowRequestId, onWorkflow }) {
  const [filters, setFilters] = useState({ voucher: "", type: "all", status: "all", minAmount: "", maxAmount: "", sortBy: "submitted", sortDirection: "desc" });
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape" && workflowRequestId) onWorkflow(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [workflowRequestId]);
  const pendingRequests = seedRequests.filter((request) => [3, 4, 5, 7, 8, 8.5].includes(request.currentStep));
  const returnedRequests = seedRequests.filter((request) => request.status.includes("Returned"));
  const unclaimedRequests = seedRequests.filter((request) => request.currentStep === 12);
  const filteredRequests = seedRequests.filter((request) => {
    const voucherMatch = request.id.toLowerCase().includes(filters.voucher.trim().toLowerCase());
    const typeMatch = filters.type === "all" || request.type === filters.type;
    const statusMatch = filters.status === "all" || request.status === filters.status;
    const minMatch = filters.minAmount === "" || request.amount >= Number(filters.minAmount);
    const maxMatch = filters.maxAmount === "" || request.amount <= Number(filters.maxAmount);
    return voucherMatch && typeMatch && statusMatch && minMatch && maxMatch;
  }).sort((a, b) => {
    const values = { submitted: [a.submitted, b.submitted], voucher: [a.id, b.id], type: [paymentTypes[a.type].label, paymentTypes[b.type].label], status: [a.status, b.status], amount: [a.amount, b.amount] }[filters.sortBy];
    const result = typeof values[0] === "number" ? values[0] - values[1] : values[0].localeCompare(values[1]);
    return filters.sortDirection === "desc" ? -result : result;
  });
  const metricViews = {
    pending: { title: "Pending Approvals", description: "Requests currently waiting for a reviewer or approver.", rows: pendingRequests, total: `${pendingRequests.length} requests` },
    value: { title: "Open Request Value", description: "All active payment requests represented on the dashboard.", rows: seedRequests, total: formatCurrency(metrics.total) },
    returned: { title: "Returned Requests", description: "Requests sent back for corrections or additional information.", rows: returnedRequests, total: `${returnedRequests.length} requests` },
    unclaimed: { title: "Unclaimed Checks", description: "Checks available for release but not yet claimed by the payee.", rows: unclaimedRequests, total: `${unclaimedRequests.length} checks` },
  };
  if (activeMetric) return <MetricDetail view={metricViews[activeMetric]} onBack={() => onMetric(null)} onSelect={onSelect} />;
  const workflowRequest = workflowRequestId ? seedRequests.find((request) => request.id === workflowRequestId) || selected : null;
  return (
    <section className="content-grid">
      <div className="metric-row">
        <Metric label="Pending Approval" value={metrics.pendingApproval} tone="green" hint="View Requests" onClick={() => onMetric("pending")} />
        <Metric label="Open Request Value" value={formatCurrency(metrics.total)} tone="blue" hint="View Breakdown" onClick={() => onMetric("value")} />
        <Metric label="Returned" value={metrics.returned} tone="amber" hint="View Requests" onClick={() => onMetric("returned")} />
        <Metric label="Unclaimed Checks" value={metrics.unclaimed} tone="red" hint="View Checks" onClick={() => onMetric("unclaimed")} />
      </div>
      <DashboardFilters filters={filters} onChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))} onClear={() => setFilters({ voucher: "", type: "all", status: "all", minAmount: "", maxAmount: "", sortBy: "submitted", sortDirection: "desc" })} />
      <div className="two-column">
        <RequestTable selectedId={selected.id} onSelect={onSelect} rows={filteredRequests} combineStepStatus />
        <RequestDetail request={selected} showWorkflowSummary onViewWorkflow={() => onWorkflow(selected.id)} />
      </div>
      {workflowRequest && <WorkflowModal request={workflowRequest} onClose={() => onWorkflow(null)} />}
    </section>
  );
}

function WorkflowModal({ request, onClose }) {
  return <div className="workflow-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="workflow-modal" role="dialog" aria-modal="true" aria-labelledby="workflow-modal-title"><div className="workflow-modal-header"><div><span className="eyebrow">Request Workflow</span><h3 id="workflow-modal-title">{request.id}</h3><p>Complete approval and processing trail for this payment request.</p></div><button type="button" className="workflow-modal-close" onClick={onClose} aria-label="Close full workflow">×</button></div><div className="workflow-modal-body"><WorkflowMap currentStep={request.currentStep} /></div></section></div>;
}

function DashboardFilters({ filters, onChange, onClear }) {
  const statusOptions = [...new Set(seedRequests.map((request) => request.status))].sort();
  return (
    <section className="panel dashboard-filter-panel">
      <div className="panel-header"><div><span className="eyebrow">Find a Request</span><h3>Search and Sort</h3></div><button type="button" className="clear-filter-button" onClick={onClear}>Clear Filters</button></div>
      <div className="dashboard-filters">
        <label>Voucher Number<input placeholder="Search voucher no." value={filters.voucher} onChange={(event) => onChange("voucher", event.target.value)} /></label>
        <label>Type<select value={filters.type} onChange={(event) => onChange("type", event.target.value)}><option value="all">All Types</option>{Object.entries(paymentTypes).map(([id, type]) => <option key={id} value={id}>{type.label}</option>)}</select></label>
        <label>Status<select value={filters.status} onChange={(event) => onChange("status", event.target.value)}><option value="all">All Statuses</option>{statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
        <label>Minimum Amount<input type="number" min="0" placeholder="0" value={filters.minAmount} onChange={(event) => onChange("minAmount", event.target.value)} /></label>
        <label>Maximum Amount<input type="number" min="0" placeholder="No limit" value={filters.maxAmount} onChange={(event) => onChange("maxAmount", event.target.value)} /></label>
        <label>Sort By<select value={filters.sortBy} onChange={(event) => onChange("sortBy", event.target.value)}><option value="submitted">Submitted Date</option><option value="voucher">Voucher Number</option><option value="type">Type</option><option value="status">Status</option><option value="amount">Amount</option></select></label>
        <label>Order<select value={filters.sortDirection} onChange={(event) => onChange("sortDirection", event.target.value)}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
      </div>
    </section>
  );
}

function Metric({ label, value, tone, hint, onClick }) {
  return (
    <button type="button" className={`metric ${tone}`} onClick={onClick}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint} →</small>
    </button>
  );
}

function MetricDetail({ view, onBack, onSelect }) {
  return (
    <section className="metric-detail-view">
      <div className="metric-detail-actions"><button type="button" className="back-button" onClick={onBack}>← Back to Dashboard</button></div>
      <div className="metric-detail-header">
        <div><span className="eyebrow">Dashboard Detail</span><h3>{view.title}</h3><p>{view.description}</p></div>
        <strong>{view.total}</strong>
      </div>
      <section className="panel"><div className="table-wrap"><table><thead><tr><th>Request</th><th>Type</th><th>Requestor</th><th>Department</th><th>Amount</th><th>Status</th></tr></thead><tbody>
        {view.rows.length ? view.rows.map((request) => <tr key={request.id} onClick={() => onSelect(request.id)}><td>{request.id}</td><td>{paymentTypes[request.type].label}</td><td>{request.requestor}</td><td>{request.department}</td><td>{formatCurrency(request.amount)}</td><td><StatusPill status={request.status} /></td></tr>) : <tr><td colSpan="6" className="empty-state">No matching requests right now.</td></tr>}
      </tbody></table></div></section>
    </section>
  );
}

function RequestTable({ selectedId, onSelect, rows = seedRequests, combineStepStatus = false }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h3>Live Requests</h3>
        <span className="count">{rows.length}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{combineStepStatus ? "Status" : "Step"}</th>
              <th>Submitted</th>
              <th>Voucher</th>
              <th>Type</th>
              <th>Amount</th>
              {!combineStepStatus && <th>Status</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((request) => (
              <tr key={request.id} className={selectedId === request.id ? "selected" : ""} onClick={() => onSelect(request.id)}>
                <td>{combineStepStatus ? <div className="step-status-cell"><StatusPill status={request.status} /></div> : formatStep(request.currentStep)}</td>
                <td>{request.submitted}</td>
                <td>{request.id}</td>
                <td>{paymentTypes[request.type].label}</td>
                <td>{formatCurrency(request.amount)}</td>
                {!combineStepStatus && <td><StatusPill status={request.status} /></td>}
              </tr>
            )) : <tr><td colSpan={combineStepStatus ? 5 : 6} className="empty-state">No requests match the selected filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RequestActivity({ request }) {
  const formatDate = (date, hour = 9) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(`${date}T${String(hour).padStart(2, "0")}:00:00`));
  const addDays = (date, days) => { const value = new Date(`${date}T00:00:00`); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10); };
  const currentIndex = Math.max(0, steps.findIndex((step) => step.id === request.currentStep));
  const current = steps[currentIndex];
  const activities = [{ date: formatDate(request.submitted, 8), actor: request.requestor, title: request.currentStep === 1 ? "Draft Created" : "Request Submitted", detail: `${paymentTypes[request.type].label} request created for ${request.vendor}.`, tone: "system" }];
  if (request.currentStep >= 2) activities.push({ date: formatDate(addDays(request.submitted, 1), 9), actor: request.requestor, title: "Supporting Documents Recorded", detail: `${request.documents} document${request.documents === 1 ? "" : "s"} attached${request.missing ? `; ${request.missing} still required` : "; document set complete"}.`, tone: request.missing ? "pending" : "complete" });
  if (request.returned) activities.push({ date: formatDate(request.returned, 14), actor: "Workflow Reviewer", title: "Returned for Correction", detail: "Additional information or corrected support was requested from the requestor.", tone: "returned" });
  if (request.resubmitted) activities.push({ date: formatDate(request.resubmitted, 10), actor: request.requestor, title: "Request Resubmitted", detail: "The requestor supplied updated information and returned the request to the workflow.", tone: "system" });
  if (currentIndex > 1) { const previous = steps[currentIndex - 1]; activities.push({ date: formatDate(addDays(request.submitted, Math.min(currentIndex, 8)), 11), actor: previous.owner, title: `${previous.name} Completed`, detail: `The ${previous.name.toLowerCase()} stage was completed and recorded by the system.`, tone: "complete" }); }
  activities.push({ date: formatDate(addDays(request.submitted, Math.min(currentIndex + 1, 9)), 13), actor: current.owner, title: request.currentStep === 15 ? "Request Completed" : `Assigned to ${current.name}`, detail: request.currentStep === 15 ? "The payment request completed all workflow stages." : `${current.owner} is the current workflow owner. Status: ${request.status}.`, tone: request.currentStep === 15 ? "complete" : "current" });
  return <section className="request-activity"><div className="request-activity-heading"><div><span className="eyebrow">Request History</span><h4>Request Activity</h4></div><span className="system-generated-tag">System Generated</span></div><div className="activity-timeline">{activities.slice(-5).reverse().map((activity) => <article className={`activity-entry ${activity.tone}`} key={`${activity.date}-${activity.title}`}><span className="activity-dot" /><div><div className="activity-entry-heading"><strong>{activity.title}</strong><time>{activity.date}</time></div><p>{activity.detail}</p><small>{activity.actor}</small></div></article>)}</div></section>;
}

function RequestDetail({ request, showWorkflowSummary = false, onViewWorkflow }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h3>{request.id}</h3>
        <StatusPill status={request.status} />
      </div>
      <dl className="detail-list">
        <div><dt>Requestor</dt><dd>{request.requestor}</dd></div>
        <div><dt>Department</dt><dd>{request.department}</dd></div>
        <div><dt>Payee</dt><dd>{request.vendor}</dd></div>
        <div><dt>Amount</dt><dd>{formatCurrency(request.amount)}</dd></div>
        <div><dt>Documents</dt><dd>{request.documents} attached, {request.missing} missing</dd></div>
        <div><dt>Budget</dt><dd>{request.budgeted ? "Budgeted" : "Unbudgeted"}</dd></div>
      </dl>
      <div className="request-routing-card"><span className="eyebrow">Routing Threshold</span><strong>{getRoute(request)}</strong><small>{request.budgeted ? "Budgeted request" : "Unbudgeted request"} · {formatCurrency(request.amount)}</small></div>
      {showWorkflowSummary && <WorkflowSummary request={request} onView={onViewWorkflow} />}
      <RequestActivity request={request} />
      <VoucherCard voucher={getVoucher(request)} request={request} />
    </section>
  );
}

function WorkflowSummary({ request, onView }) {
  const currentIndex = Math.max(0, steps.findIndex((step) => step.id === request.currentStep));
  const current = steps[currentIndex];
  const previous = currentIndex > 0 ? steps[currentIndex - 1] : null;
  const next = currentIndex < steps.length - 1 ? steps[currentIndex + 1] : null;
  const progress = Math.round(((currentIndex + 1) / steps.length) * 100);
  return <section className="workflow-summary"><div className="workflow-summary-heading"><div><span className="eyebrow">Workflow Progress</span><strong>{current.name}</strong><small>{current.owner} · {currentIndex + 1} of {steps.length} stages</small></div><button type="button" onClick={onView}>View Full Workflow</button></div><div className="workflow-progress-bar" aria-label={`${progress}% complete`}><span style={{ width: `${progress}%` }} /></div><div className="workflow-summary-stages"><div><span>Previous</span><strong>{previous?.name || "None"}</strong></div><div className="current"><span>Current</span><strong>{current.name}</strong></div><div><span>Next</span><strong>{next?.name || "Complete"}</strong></div></div></section>;
}

function VoucherCard({ voucher, request }) {
  if (!voucher) return null;
  const certifications = getApprovalCertification(request);

  return (
    <div className="voucher-card">
      <div className="voucher-heading">
        <div>
          <span className="eyebrow">Payment Voucher</span>
          <h4>{voucher.number}</h4>
          <p>Automated Payment System</p>
        </div>
        <button className="print-button" onClick={() => window.print()}>Print</button>
      </div>
      <div className="voucher-meta">
        <span><small>Reference No.</small><strong>{request.id}</strong></span>
        <span><small>Date</small><strong>{voucher.date}</strong></span>
      </div>
      <table className="voucher-table">
        <tbody>
          <tr><th>Payee</th><td>{request.vendor}</td><th>Department</th><td>{request.department}</td></tr>
          <tr><th>Requestor</th><td>{request.requestor}</td><th>Payment Method</th><td>{voucher.paymentMethod}</td></tr>
          <tr><th>Purpose</th><td colSpan="3">{voucher.purpose}</td></tr>
          <tr><th>Bank Account</th><td>{voucher.bank}</td><th>Check No.</th><td>{voucher.checkNumber}</td></tr>
        </tbody>
      </table>
      <table className="voucher-table amount-table">
        <tbody>
          <tr><th>Gross Amount (VAT Inclusive)</th><td>{formatCurrency(voucher.gross)}</td></tr>
          <tr><th>12% VAT Component</th><td>{formatCurrency(voucher.vatAmount)}</td></tr>
          <tr><th>Net of VAT / EWT Base</th><td>{formatCurrency(voucher.netOfVat)}</td></tr>
          <tr><th>Less: 2% EWT</th><td>{formatCurrency(voucher.ewtAmount)}</td></tr>
          <tr className="net-row"><th>Total Amount Due</th><td>{formatCurrency(voucher.amountDue)}</td></tr>
        </tbody>
      </table>
      <section className="approval-certification">
        <div className="certification-heading"><div><span className="eyebrow">Digital Approval Certification</span><strong>System-verified approval trail</strong></div><small>No handwritten signature required</small></div>
        <div className="certification-list">{certifications.map((record) => <div className="certification-record" key={record.id}><div><small>{record.stage}</small><strong>{record.approver}</strong></div><div><small>Decision</small><strong>{record.decision}</strong></div><div><small>Date and Time</small><strong>{record.timestamp}</strong></div><div><small>Approval ID</small><strong>{record.id}</strong></div></div>)}</div>
        <p>Authenticated through the Automated Payment System. Approval records are linked to request version {request.id}-01.</p>
      </section>
    </div>
  );
}

function RequestBuilder({ draftType, setDraftType, draftAmount, lineItems, updateLineItem, addLineItem, removeLineItem, budgeted, setBudgeted, draftRequest }) {
  const config = paymentTypes[draftType];
  const isReimbursement = draftType === "reimbursement";
  const isLiquidation = draftType === "liquidation";
  const isCashAdvance = draftType === "cashAdvance";
  const liquidationAdvanceAmount = 0;
  const liquidationBalance = liquidationAdvanceAmount - draftAmount;
  const requestCreatedDate = new Date().toISOString().slice(0, 10);
  return (
    <section className="form-layout">
      <div className="panel">
        <div className="panel-header">
          <h3>{isReimbursement ? "Reimbursement Details" : isLiquidation ? "Liquidation Details" : isCashAdvance ? "Cash Advance Details" : "Request Details"}</h3>
          <span className="voucher-preview">{config.prefix}-2026-0150</span>
        </div>
        <div className="segmented">
          {Object.entries(paymentTypes).map(([id, type]) => (
            <button key={id} className={draftType === id ? "active" : ""} onClick={() => setDraftType(id)}>
              {type.label}
            </button>
          ))}
        </div>
        <div className={`field-grid ${isReimbursement || isLiquidation || isCashAdvance ? "reimbursement-fields" : ""}`}>
          <input type="hidden" name="requestDate" value={requestCreatedDate} />
          <label>{isReimbursement ? "Requestor's Name" : isLiquidation || isCashAdvance ? "Cash Advance Requestor" : "Requestor"}<input placeholder={isLiquidation || isCashAdvance ? "Enter cash advance requestor" : "Enter requestor's full name"} /></label>
          {!isReimbursement && !isLiquidation && !isCashAdvance && <label>Payee / Vendor<input placeholder="Enter payee or vendor name" /></label>}
          {config.mandatoryFields.map((field) => (
            <label className={field.kind === "textarea" ? "full" : ""} key={field.label}>
              {field.label}
              {field.kind === "textarea" ? <textarea placeholder={field.value} /> : <input type={field.kind === "date" ? "date" : "text"} placeholder={field.value} />}
            </label>
          ))}
          {(isReimbursement || isLiquidation || isCashAdvance) && <label>Voucher Number <small>(Finance Use Only)</small><input placeholder="Assigned after approval" disabled /></label>}
          {!isLiquidation && <label>{isCashAdvance ? "Cash Advance Amount" : "Calculated Total"}<input type="number" value={draftAmount} readOnly /></label>}
        </div>
        {isLiquidation && <div className="liquidation-summary"><label>Cash Advance Amount<input type="number" placeholder="e.g. 50000" /></label><div><span>Total Expenses</span><strong>{formatCurrency(draftAmount)}</strong></div><div><span>For Return / For Reimbursement</span><strong>{formatCurrency(Math.abs(liquidationBalance))} {liquidationBalance >= 0 ? "for return" : "for reimbursement"}</strong></div></div>}
        {!isCashAdvance && !isLiquidation && <label className="toggle-row">
          <input type="checkbox" checked={!budgeted} onChange={(event) => setBudgeted(!event.target.checked)} />
          Unbudgeted Request
        </label>}
        <div className="line-items-section">
          <div className="line-items-header">
            <div><span className="eyebrow">Request Breakdown</span><h4>Line Items</h4></div>
            <button type="button" className="add-line-button" onClick={addLineItem}>+ Add Line Item</button>
          </div>
          <div className="table-wrap">
            <table className="line-item-table">
              <thead><tr>{config.lineColumns.map((column) => <th key={column}>{column}</th>)}<th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {lineItems.map((item, rowIndex) => (
                  <tr key={`${draftType}-${rowIndex}`}>
                    {config.lineColumns.map((column) => {
                      const isFile = column === "Receipt" || column === "Attachment";
                      const example = lineItemExamples[draftType]?.[0]?.[column] ?? column;
                      if (isFile) return <td key={column}><input type="file" aria-label={`${column} for line ${rowIndex + 1}`} /></td>;
                      return <td key={column}><input type={column === "Amount" ? "number" : column.includes("date") ? "date" : "text"} value={item[column] || ""} placeholder={String(example)} onChange={(event) => updateLineItem(rowIndex, column, event.target.value)} /></td>;
                    })}
                    <td><button type="button" className="remove-line-button" title="Remove line item" aria-label={`Remove line item ${rowIndex + 1}`} disabled={lineItems.length === 1} onClick={() => removeLineItem(rowIndex)}>×</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th colSpan={config.lineColumns.length}><span>{isCashAdvance ? "Total cash advance amount" : isLiquidation ? "Total liquidated amount" : "Total"}</span><strong>{formatCurrency(draftAmount)}</strong></th><td /></tr></tfoot>
            </table>
          </div>
        </div>
        {isCashAdvance && <><section className="accountability-box"><h4>Accountability / Authority to Deduct</h4><p>I have read and understood the Cash Advance policies and procedures. I agree to fully liquidate this Cash Advance after completion of the transaction, project, or event. I authorize payroll deduction of any unliquidated or unsubstantiated cash advance in accordance with labor laws and company policy.</p><label><input type="checkbox" required /> I acknowledge full accountability for the amount received and agree to the authority to deduct.</label></section><section className="cash-advance-policy"><h4>Cash Advance policy</h4><ul><li>Full-time employees may request up to PHP 40,000 and may hold only one cash advance at a time.</li><li>Liquidation is due on the 15th or 30th after the event, whichever is later.</li><li>Partial liquidation is required for projects lasting more than one month; receipts older than 30 days are not accepted.</li></ul></section></>}
      </div>
      <div className="panel">
        <div className="panel-header">
          <h3>Validation Preview</h3>
          <span className="count">{config.required.length}</span>
        </div>
        <ul className="check-list">
          {config.required.map((item, index) => (
            <li key={item}>
              <span className={index < config.required.length - 1 ? "ok" : "warn"}>{index < config.required.length - 1 ? "✓" : "!"}</span>
              {item}
            </li>
          ))}
        </ul>
        <h4>Document Uploads</h4>
        <div className="upload-list">
          {config.uploadDocuments.map((documentName) => (
            <label key={documentName} className="upload-row">
              <span>{documentName}</span>
              <input type="file" />
            </label>
          ))}
        </div>
        <div className="route-box">
          <span className="eyebrow">System Route</span>
          <strong>{getRoute(draftRequest)}</strong>
        </div>
        <button className="primary-button">Submit to Department Head</button>
      </div>
    </section>
  );
}

function ApprovalQueue({ selected, onSelect }) {
  return (
    <section className="two-column approval-layout">
      <RequestTable selectedId={selected.id} onSelect={onSelect} />
      <section className="panel action-panel">
        <div className="panel-header">
          <h3>Approval action</h3>
        </div>
        <RequestDetail request={selected} />
        <div className="approval-actions">
          <button className="primary-button">Approve and Notify Next Owner</button>
          <button>Request More Information</button>
          <button className="danger">Disapprove</button>
        </div>
        <label>Reviewer note<textarea defaultValue="Validated supporting documents and routing threshold." /></label>
      </section>
    </section>
  );
}

function Tracker({ selectedId, onSelect }) {
  const selected = seedRequests.find((request) => request.id === selectedId);
  if (selected) return (
    <section className="metric-detail-view">
      <div className="metric-detail-actions"><button type="button" className="back-button" onClick={() => onSelect(null)}>← Back to Payment Tracker</button></div>
      <div className="metric-detail-header"><div><span className="eyebrow">Tracker Detail</span><h3>{selected.id}</h3><p>Review request information and its current payment progress.</p></div><StatusPill status={selected.status} /></div>
      <RequestDetail request={selected} />
      <WorkflowMap currentStep={selected.currentStep} />
    </section>
  );
  return (
    <section className="panel">
      <div className="panel-header">
        <h3>Payment Tracker</h3>
        <button className="icon-button" title="Export Report">↧</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Voucher</th>
              <th>Submitted</th>
              <th>Returned</th>
              <th>Resubmitted</th>
              <th>Approval</th>
              <th>Check Approval</th>
              <th>Payment</th>
            </tr>
          </thead>
          <tbody>
            {seedRequests.map((request, index) => (
              <tr key={request.id} onClick={() => onSelect(request.id)}>
                <td>{request.id}</td>
                <td>{request.submitted}</td>
                <td>{request.returned || "-"}</td>
                <td>{request.resubmitted || "-"}</td>
                <td>{index === 0 ? "Pending" : "2026-06-24"}</td>
                <td>{request.currentStep >= 11 ? "2026-06-25" : "Pending"}</td>
                <td>{request.currentStep >= 13 ? "2026-06-25" : "Pending"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="report-band">
        <div>
          <span className="eyebrow">Report</span>
          <strong>Unclaimed Checks</strong>
        </div>
        <p>Flags checks marked available but not yet released to the payee.</p>
      </div>
    </section>
  );
}

function DocumentUploads({ selectedId, onSelect }) {
  const selected = uploadSamples.find((request) => request.id === selectedId) || uploadSamples[0];
  const required = selected.documents.filter((document) => document.required);
  const completed = required.filter((document) => document.file).length;

  return (
    <section className="document-upload-layout">
      <section className="panel upload-request-list">
        <div className="panel-header">
          <h3>Requests Needing Documents</h3>
          <span className="count">{uploadSamples.length}</span>
        </div>
        <div className="upload-request-buttons">
          {uploadSamples.map((request) => {
            const requiredDocuments = request.documents.filter((document) => document.required);
            const uploadedDocuments = requiredDocuments.filter((document) => document.file).length;
            return (
              <button key={request.id} className={selected.id === request.id ? "active" : ""} onClick={() => onSelect(request.id)}>
                <div><strong>{request.id}</strong><span>{paymentTypes[request.type].label}</span></div>
                <small>{uploadedDocuments}/{requiredDocuments.length} required</small>
              </button>
            );
          })}
        </div>
      </section>
      <section className="panel upload-workspace">
        <div className="panel-header">
          <div><span className="eyebrow">{paymentTypes[selected.type].label}</span><h3>{selected.id}</h3></div>
          <span className={`upload-progress ${completed === required.length ? "complete" : "pending"}`}>{completed}/{required.length} required uploaded</span>
        </div>
        <dl className="upload-request-meta">
          <div><dt>Requestor</dt><dd>{selected.requestor}</dd></div>
          <div><dt>Department</dt><dd>{selected.department}</dd></div>
          <div><dt>Payee</dt><dd>{selected.vendor}</dd></div>
          <div><dt>Amount</dt><dd>{formatCurrency(selected.amount)}</dd></div>
        </dl>
        <div className="document-file-list">
          {selected.documents.map((document) => (
            <article className={`document-file-row ${document.file ? "uploaded" : "missing"}`} key={document.name}>
              <div className="document-file-info">
                <div><strong>{document.name}</strong><span className={document.required ? "required-tag" : "conditional-tag"}>{document.required ? "Required" : "Conditional"}</span></div>
                {document.file ? <p><span className="file-icon">{document.file.split(".").pop().toUpperCase()}</span>{document.file} <small>{document.size}</small></p> : <p className="missing-file">No File Uploaded</p>}
              </div>
              <label className="file-picker">
                <span>{document.file ? "Replace File" : "Add File"}</span>
                <input type="file" aria-label={`${document.file ? "Replace" : "Add"} ${document.name}`} />
              </label>
            </article>
          ))}
        </div>
        <div className="upload-footer">
          <p>Accepted: PDF, JPG, PNG, XLSX. Maximum 10 MB per file.</p>
          <button className="primary-button">Save Documents</button>
        </div>
      </section>
    </section>
  );
}

function DocumentRules() {
  return (
    <section className="doc-grid">
      {Object.entries(paymentTypes).map(([id, type]) => (
        <article className="panel" key={id}>
          <h3>{type.label}</h3>
          <h4>Mandatory fields</h4>
          <ul className="check-list">
            {type.required.map((item) => <li key={item}><span className="ok">✓</span>{item}</li>)}
          </ul>
          <h4>Upload documents</h4>
          <div className="chip-row">
            {type.uploadDocuments.map((item) => <span key={item}>{item}</span>)}
          </div>
        </article>
      ))}
      <article className="panel todo-panel">
        <h3>Future modules</h3>
        <div className="chip-row">
          <span>Petty Cash</span>
          <span>Credit Card Payments</span>
          <span>Cash Advance Guidelines</span>
          <span>Procurement alignment</span>
        </div>
      </article>
    </section>
  );
}

function EmailSamples({ selectedStep, onSelectStep }) {
  const template = emailTemplates[selectedStep];
  const step = steps.find((item) => item.id === selectedStep);
  const request = seedRequests.find((item) => item.currentStep === selectedStep) || seedRequests[0];

  return (
    <section className="email-layout">
      <section className="panel email-stage-list">
        <div className="panel-header">
          <h3>Workflow stages</h3>
          <span className="count">{steps.length}</span>
        </div>
        <div className="email-stage-buttons">
          {steps.map((item) => (
            <button key={item.id} className={selectedStep === item.id ? "active" : ""} onClick={() => onSelectStep(item.id)}>
              <span>{item.id}</span>
              <div><strong>{item.name}</strong><small>To: {emailTemplates[item.id].recipient}</small></div>
            </button>
          ))}
        </div>
      </section>
      <section className="email-preview-wrap">
        <div className="email-meta-panel">
          <div><span>To</span><strong>{template.recipient}</strong></div>
          <div><span>Cc</span><strong>{request.requestor}, Finance Operations</strong></div>
          <div><span>Subject</span><strong>{template.subject} | {request.id}</strong></div>
          <div><span>Sent when</span><strong>{template.trigger}</strong></div>
        </div>
        <article className="email-preview">
          <div className="email-brand"><span>AP</span><strong>Automated Payment System</strong></div>
          <div className="email-body">
            <span className="email-step-label">Step {formatStep(step.id)}: {step.name}</span>
            <h3>{template.intro}</h3>
            <p>Hello {template.recipient},</p>
            <p>{template.message}</p>
            <div className="email-request-summary">
              <div><span>Request</span><strong>{request.id}</strong></div>
              <div><span>Requestor</span><strong>{request.requestor}</strong></div>
              <div><span>Payee</span><strong>{request.vendor}</strong></div>
              <div><span>Department</span><strong>{request.department}</strong></div>
              <div><span>Type</span><strong>{paymentTypes[request.type].label}</strong></div>
              <div><span>Amount</span><strong>{formatCurrency(request.amount)}</strong></div>
            </div>
            <button className="email-action">{template.action}</button>
            <p className="email-deadline">Please complete this action within two business days.</p>
            <p className="email-fallback">If the button does not work, open: https://payments.example.local/requests/{request.id}</p>
          </div>
          <footer>This is an automated workflow notification. Replies are not monitored.</footer>
        </article>
      </section>
    </section>
  );
}

function WorkflowMap({ currentStep }) {
  return (
    <section className="panel workflow-panel">
      <div className="panel-header">
        <h3>Workflow map</h3>
        <span className="eyebrow">Step {formatStep(currentStep)}</span>
      </div>
      <div className="workflow-track">
        {steps.map((step) => (
          <div key={`${step.id}-${step.name}`} className={`workflow-step ${step.id < currentStep ? "done" : ""} ${step.id === currentStep ? "current" : ""}`}>
            <span>{formatStep(step.id)}</span>
            <strong>{step.name}</strong>
            <small>{step.owner}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusPill({ status }) {
  const tone = status.includes("Returned") ? "returned" : status.includes("Board") ? "board" : status.includes("President") ? "executive" : status.includes("COO") ? "coo" : "normal";
  return <span className={`status-pill ${tone}`}>{status}</span>;
}

export default App;
