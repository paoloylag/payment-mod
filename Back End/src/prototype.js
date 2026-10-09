import { createDataSource } from "./data-source.js";
import { paginateTables } from "./table-pagination.js";
import { guideSections, guideStageAudiences, guideStages } from "./guide-data.js?v=20260920-backend-integration";

const dataSource = createDataSource();
const mockDraftStorageKey = "payment-module-mock-drafts-v1";

function loadMockDrafts(fallback) {
  if (dataSource.mode !== "mock") return fallback;
  try {
    const stored = JSON.parse(localStorage.getItem(mockDraftStorageKey) || "null");
    return Array.isArray(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

function persistMockDrafts(drafts) {
  if (dataSource.mode !== "mock") return;
  try {
    localStorage.setItem(mockDraftStorageKey, JSON.stringify(drafts));
  } catch (error) {
    console.warn("Mock draft storage is unavailable.", error);
  }
}

const paymentTypes = {
  reimbursement: {
    label: "Reimbursement",
    prefix: "RMB",
    required: ["Requestor's Name", "Department", "Event / Purpose", "BIR-Recognized Invoice(s) / Official Receipt(s)"],
    mandatoryFields: [
      { label: "Department", kind: "input", value: "People Operations" },
      { label: "Event / Purpose", kind: "textarea", value: "Leadership workshop reimbursement" },
    ],
    uploadDocuments: ["Invoice", "Billing / Quotation / SOA (if available)", "Proof of Payment"],
    lineColumns: ["Merchant Name", "Invoice Date", "Invoice Number", "Particulars", "Expense Account", "Department to Be Charged", "Amount", "Proof of Payment"],
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
    required: ["Cash Advance Reference Number", "Cash Advance Requestor", "Department", "Date to Be Liquidated", "Actual Date of Liquidation", "Event / Purpose"],
    mandatoryFields: [
      { label: "Cash Advance Reference Number", kind: "input", value: "CA-2026-0049" },
      { label: "Department", kind: "input", value: "People Operations" },
      { label: "Date to Be Liquidated", kind: "date", value: "2026-07-31" },
      { label: "Actual Date of Liquidation", kind: "date", value: "2026-07-30" },
      { label: "Event / Purpose", kind: "textarea", value: "Leadership workshop liquidation" },
    ],
    uploadDocuments: [],
    lineColumns: ["Merchant Name", "Invoice Date", "Invoice Number", "Particulars", "Expense Account", "Department to Be Charged", "Amount", "Attachment"],
  },
  poPayment: {
    label: "Purchase Order Payment",
    prefix: "PO",
    required: ["P.O. Reference from Procurement", "Automatically Generated Requestor, Payee, and Amount", "Expense Account for Each Line Item"],
    mandatoryFields: [],
    uploadDocuments: ["BIR 2303 (if new supplier)", "Business Permit (if new supplier)", "Delivery Receipt (if applicable)", "Billing Invoice / Statement of Account", "Invoice (if available)"],
    lineColumns: ["P.O. Number", "Supplier", "Particulars", "Expense Account", "Department / Cost Center", "Amount", "Attachment"],
  },
  general: {
    label: "General Payment",
    prefix: "GEN",
    required: ["Complete Request Breakdown Row(s)", "Billing / SOA / Quotation"],
    mandatoryFields: [],
    uploadDocuments: ["Billing / SOA / Quotation", "BIR 2303 (if new supplier)"],
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
  [10, "Payment Preparation", "Finance Associate"],
  [11, "Signatory Approval", "Authorized Signatories"],
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
  10: ["Finance Associate", "Payment is ready for payment preparation", "Voucher created", "An approved payment voucher is ready for processing.", "Prepare the bank transfer or check and record the payment reference in the request.", "Process Payment"],
  11: ["Authorized Signatories", "Signatory approval required", "Payment instruction prepared", "A payment instruction is awaiting signatory approval.", "Review the voucher, approval trail, payee details, and payment instruction before authorizing.", "Authorize Payment"],
  12: ["Vendor", "Payment ready for processing: {{request_id}}", "Signatory approval completed", "Your payment is ready for processing.", "The payment instruction for {{payee_name}} has completed signatory approval. Please review the payment details and reference below.", "View Payment Details"],
  13: ["Department Requestor and Vendor", "Payment available for pick-up: {{request_id}}", "Payment marked available for pick-up", "The payment is now available for pick-up.", "Payment for {{payee_name}} is available. The update date, time, and Finance personnel who recorded the status are included for reference.", "View Release Details"],
  14: ["Finance Associate", "Payment tracker updated", "Payment released", "The payment tracker has been updated automatically.", "Review the recorded turnaround dates and resolve any remaining tracker exceptions.", "View Tracker"],
  15: ["Department Requestor and Vendor", "Payment completed: {{request_id}}", "Transaction completed", "Your payment transaction has been completed.", "Payment for {{payee_name}} has been completed. The payment date, amount, method, and reference are included below for your records.", "View Payment Record"],
  returned: ["Requestor", "Action required: payment request returned", "Request returned for correction", "Your payment request needs changes", "The reviewer returned this request for correction. Open the request to review the comments, update the required information or documents, and resubmit it.", "View Request"],
  declined: ["Requestor", "Payment request declined", "Request declined", "Your payment request was declined", "The reviewer declined this payment request. Open the request to review the decision, reviewer comments, and recorded approval history.", "View Request"],
};

const emailNotificationEvents = [
  ["returned", "Request Returned", "Requestor"],
  ["declined", "Request Declined", "Requestor"],
];

const uploadSamples = [
  ["RMB-2026-0161", "reimbursement", "Lia Dizon", "People Ops", "Training Center", 72300, [["Invoice", true, "training-invoice-1042.pdf", "248 KB"], ["Billing / Quotation / SOA", false, "training-quotation.pdf", "181 KB"], ["Proof of Payment", true, "proof-of-payment.png", "864 KB"], ["Receipt for Each Line Item", true], ["Cash Advance Form", false, "cash-advance-reference.pdf", "226 KB"]]],
  ["RMB-2026-0164", "reimbursement", "Mika Santos", "Marketing", "Event Registration", 21850, [["Invoice", true], ["Billing / Quotation / SOA", false], ["Proof of Payment", true, "card-payment-receipt.pdf", "126 KB"], ["Receipt for Each Line Item", true], ["Cash Advance Form", false]]],
  ["CA-2026-0065", "cashAdvance", "Tara Lim", "Sales", "Internal", 35000, [["Cash Advance Form", true, "signed-cash-advance-form.pdf", "319 KB"], ["Supporting Budget / Itinerary", true]]],
  ["CA-2026-0068", "cashAdvance", "Iya Cruz", "Events", "Internal", 39000, [["Cash Advance Form", true, "event-cash-advance.pdf", "284 KB"], ["Supporting Budget / Itinerary", true, "event-budget-and-itinerary.xlsx", "92 KB"]]],
  ["PO-2026-0102", "poPayment", "Bea Tan", "Procurement", "Atlas Office Systems", 141750, [["BIR 2303 (New Supplier)", false, "atlas-bir-2303.pdf", "205 KB"], ["Business Permit (New Supplier)", false], ["Delivery Receipt (If Applicable)", false], ["Billing Invoice / Statement of Account", true, "atlas-soa-june.pdf", "176 KB"], ["Invoice", false]]],
  ["PO-2026-0105", "poPayment", "Jon Reyes", "Operations", "Northstar Supplies", 98200, [["BIR 2303 (New Supplier)", false], ["Business Permit (New Supplier)", false], ["Delivery Receipt (If Applicable)", false], ["Billing Invoice / Statement of Account", true, "northstar-soa.pdf", "238 KB"], ["Invoice", false]]],
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
  ["CA-2026-0069", "cashAdvance", "Mika Santos", "Marketing", "Internal", 24000, true, "Payment Tracker", 14, "2026-06-20", "", "", 2, 0],
  ["GEN-2026-0034", "general", "Alex Cruz", "Admin", "City Utilities", 18500, true, "Department Approval", 3, "2026-06-24", "", "", 3, 0],
  ["GEN-2026-0210", "general", "Mika Santos", "Marketing", "Sample Print Studio", 16200, true, "Department Approval", 3, "2026-10-08", "", "", 2, 0],
  ["GEN-2026-0211", "general", "Mika Santos", "Marketing", "Sample Event Supplier", 28750, true, "Department Approval", 3, "2026-10-08", "", "", 2, 0],
  ["GEN-2026-0200", "general", "Jonas Lee Baro", "Facilities", "TOJUST Construction", 200000, true, "Document Validation", 4, "2026-08-20", "", "", 2, 0],
  ["GEN-2026-0201", "general", "Jonas Lee Baro", "Facilities", "TOJUST Construction", 100000, true, "Document Validation", 4, "2026-08-20", "", "", 1, 0],
  ["RMB-2026-0148", "reimbursement", "Mika Santos", "Marketing", "Hotel Benilde", 84350, true, "Document Validation", 4, "2026-06-21", "", "", 4, 0],
  ["RMB-2026-0158", "reimbursement", "Mika Santos", "Marketing", "Travel Desk", 84350, true, "Document Validation", 4, "2026-08-11", "", "", 2, 0],
  ["GEN-2026-0062", "general", "Ms. Rhee", "Finance", "Office Hub", 12600, true, "Document Validation", 4, "2026-08-12", "", "", 2, 0],
  ["PO-2026-0088", "poPayment", "Jon Reyes", "Operations", "Northstar Supplies", 98000, true, "Finance Budget Review", 5, "2026-06-20", "", "", 5, 0],
  ["PO-2026-0092", "poPayment", "Jon Reyes", "Operations", "Northstar Supplies", 248900, true, "COO Approval", 7, "2026-06-19", "2026-06-20", "2026-06-22", 5, 0],
  ["GEN-2026-0037", "general", "Alex Cruz", "Admin", "City Utilities", 329500, true, "President Approval", 8, "2026-06-18", "", "", 3, 0],
  ["PO-2026-0108", "poPayment", "Bea Tan", "Procurement", "Enterprise Systems Corp.", 1250000, false, "Board Approval", 8.5, "2026-06-18", "", "", 5, 0],
  ["RMB-2026-0150", "reimbursement", "Lia Dizon", "People Ops", "Training Center", 72300, true, "Voucher Creation", 9, "2026-06-17", "", "", 4, 0],
  ["GEN-2026-0041", "general", "Nico Ramos", "Facilities", "Metro Repairs", 66200, true, "Payment Preparation", 10, "2026-06-16", "", "", 3, 0],
  ["PO-2026-0098", "poPayment", "Bea Tan", "Procurement", "Atlas Office Systems", 141750, true, "Signatory Approval", 11, "2026-06-15", "", "", 5, 0],
  ["PO-2026-0120", "poPayment", "Bea Tan", "Procurement", "Multiple Vendors (3)", 287500, true, "Vendor Notification", 12, "2026-08-20", "", "", 6, 0],
  ["GEN-2026-0044", "general", "Carlo Uy", "IT", "CloudWorks", 88400, true, "Vendor Notification", 12, "2026-06-14", "", "", 3, 0],
  ["RMB-2026-0154", "reimbursement", "Sam Lee", "Legal", "Travel Desk", 30750, true, "Payment Release", 13, "2026-06-13", "", "", 4, 0],
  ["CA-2026-0061", "cashAdvance", "Iya Cruz", "Events", "Internal", 39000, true, "Payment Tracker", 14, "2026-06-12", "2026-06-13", "2026-06-14", 2, 0],
  ["GEN-2026-0049", "general", "Paolo Reyes", "Finance", "Completed Payment", 101250, true, "Completed", 15, "2026-06-11", "", "", 4, 0],
].map(([id, type, requestor, department, vendor, amount, budgeted, status, currentStep, submitted, returned, resubmitted, documents, missing], index) => ({
  id, type, requestor, department, vendor, amount, budgeted, status, currentStep, submitted, returned, resubmitted, documents, missing,
  currency: id === "PO-2026-0088" ? "USD" : id === "PO-2026-0092" ? "EUR" : "PHP",
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
  submittedByFinance: requestor === "Ms. Rhee",
  validationAssignee: requestor === "Ms. Rhee" ? "Jamie Cruz" : "Ms. Rhee",
  vendorItems: id === "PO-2026-0120" ? [
    { vendor: "Atlas Office Systems", email: "orders@atlas.example", item: "Ergonomic office chairs (10)", amount: 125000 },
    { vendor: "Northstar Supplies", email: "sales@northstar.example", item: "Standing desks (5)", amount: 97500 },
    { vendor: "TechSource Solutions", email: "accounts@techsource.example", item: "Docking stations and monitors", amount: 65000 },
  ] : [],
}));

const personas = {
  all: { label: "All Roles", name: "Prototype Admin", subtitle: "Complete Prototype Access" },
  requestor: { label: "Requestor", name: "Mika Santos", subtitle: "Marketing Department" },
  departmentHead: { label: "Department Head", name: "Department Head", subtitle: "Department Approval" },
  financeAssociate: { label: "Finance Associate", name: "Ms. Rhee", subtitle: "Document Validation" },
  financeManager: { label: "Finance Manager", name: "Finance Manager", subtitle: "All-Request Visibility" },
  authorizedSignatory: { label: "Authorized Signatory", name: "Authorized Signatory", subtitle: "Signatory Approval" },
  coo: { label: "COO", name: "Chief Operating Officer", subtitle: "Routed Approvals Only" },
  president: { label: "President", name: "President", subtitle: "Routed Approvals Only" },
  boardMember: { label: "Board Member", name: "Board Member", subtitle: "Board Approvals Only" },
};

let draftAutosaveTimer;
let requestFilterTimer;
let toastDismissTimer;
let scheduledToastId = null;
let expandedLineIndex = 0;
let state = {
  theme: localStorage.getItem("payment-module-theme") || (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  mobileNavOpen: false,
  backendStatus: { state: dataSource.mode === "mock" ? "mock" : "checking", label: dataSource.mode === "mock" ? "Mock data" : "Checking API" },
  authStatus: dataSource.mode === "mock" ? "mock" : "checking",
  authUser: null,
  csrfToken: null,
  authError: "",
  authSubmitting: false,
  toast: null,
  actionPrompt: null,
  identityData: { users: [], roles: [], permissions: [], departments: [] },
  identityLoading: false,
  identityError: "",
  identityEdit: null,
  masterData: {},
  procurementPOs: null,
  masterDataLoading: false,
  masterDataError: "",
  masterDataEdit: null,
  requirementRules: [],
  requirementDocumentTypes: [],
  requirementRulesLoaded: false,
  requirementRulesLoading: false,
  requirementRulesError: "",
  requirementRuleEdit: null,
  requestNumbering: null,
  reimbursementBatchSetting: null,
  financePolicySetting: null,
  requestSettingsLoading: false,
  requestSettingsError: "",
  cashAdvanceOptions: null,
  cashAdvanceOptionsLoading: false,
  cashAdvanceOptionsError: "",
  persona: "all",
  tab: "dashboard",
  approvalView: "list",
  workflowQueue: [],
  workflowQueueError: "",
  conversations: {},
  conversationLoading: {},
  conversationErrors: {},
  conversationPosting: {},
  conversationDraftBody: {},
  conversationDraftMentions: {},
  conversationCollapsed: window.matchMedia("(max-width: 1199px)").matches,
  notifications: { unread_count: 0, items: [] },
  notificationsLoaded: false,
  notificationsLoading: false,
  notificationsError: "",
  notificationsOpen: false,
  highlightMessageId: null,
  requestsFiltered: false,
  selectedId: requests[0].id,
  dashboardRequestId: null,
  dashboardMetric: null,
  dashboardWorkflow: false,
  unlockRequestId: null,
  trackerRequestId: null,
  requestDetailId: null,
  vendorNotificationRequestId: null,
  dashboardFilters: { voucher: "", department: "all", type: "all", status: "all", minAmount: "", maxAmount: "", sortBy: "submitted", sortDirection: "desc" },
  requestMode: "new",
  requestTypeSelection: false,
  draftDirty: false,
  leaveRequestTarget: null,
  activeDraftId: null,
  requestFieldBuffer: {},
  requestDocumentBuffer: {},
  drafts: loadMockDrafts(Object.entries(paymentTypes).map(([type], index) => ({
    id: `DRAFT-2026-${String(index + 1).padStart(4, "0")}`,
    type,
    requestor: "Mika Santos",
    department: type === "cashAdvance" ? "Sales" : type === "poPayment" ? "Operations" : "Marketing",
    savedAt: new Date(Date.now() - index * 86400000).toISOString(),
    createdAt: new Date(Date.now() - (index + 1) * 86400000).toISOString(),
    currency: "PHP",
    otherCurrency: "",
    budgeted: type !== "liquidation",
    liquidationAdvanceAmount: type === "liquidation" ? 50000 : 0,
    liquidationReturnAmount: 0,
    lineItems: (lineItemExamples[type] || []).slice(0, 1).map((item) => ({ ...item })),
    controls: [],
  }))),
  draftType: "reimbursement",
  draftCurrency: "PHP",
  otherCurrency: "",
  selectedPO: poSystemRecords[0].id,
  cashAdvanceEventEnd: "2026-07-25",
  cashAdvanceLiquidationDate: "2026-08-09",
  budgeted: true,
  liquidationAdvanceAmount: 0,
  liquidationReturnAmount: 0,
  emailStep: 3,
  uploadId: uploadSamples[0].id,
  documentRecords: {},
  documentRequirements: {},
  documentLoading: false,
  documentError: "",
  correctionReviewIndex: null,
  duplicateInvoiceIndex: null,
  documentValidation: {
    vat: "subject",
    ewt: "2",
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
      { account: "Construction Expense", debit: 200000, credit: 0 },
      { account: "Accounts Payable", debit: 0, credit: 200000 },
    ],
  },
  voucherDetails: { paymentMethod: "", checkNumber: "", transactionNumber: "", created: false },
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
  guide: "/guide",
  users: "/administration/users",
  roles: "/administration/roles",
  departments: "/administration/departments",
  requestRequirements: "/administration/request-requirements",
  requestSettings: "/administration/request-settings",
  costCenters: "/master-data/cost-centers",
  vendors: "/master-data/vendors",
  accounts: "/master-data/chart-of-accounts",
  taxCodes: "/master-data/tax-codes",
  currencies: "/master-data/currencies",
  paymentMethods: "/master-data/payment-methods",
  documentTypes: "/master-data/document-types",
};

const purchaseOrderRecords = () => state.procurementPOs?.length ? state.procurementPOs : poSystemRecords;
function routeStateFromHash() {
  const path = (window.location.hash.slice(1) || "/dashboard").replace(/\/$/, "") || "/dashboard";
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "requests" && requests.some((r) => r.id === parts[1])) return { tab: "requestDetail", requestDetailId: parts[1], selectedId: parts[1], dashboardMetric: null, dashboardRequestId: null, trackerRequestId: null };
  if (parts[0] === "requests") return { tab: "request", requestMode: parts[1] === "drafts" ? "drafts" : "new", requestTypeSelection: !parts[1], draftType: paymentTypes[parts[2]] ? parts[2] : state.draftType, dashboardMetric: null, dashboardRequestId: null, trackerRequestId: null, requestDetailId: null };
  if (parts[0] === "approvals") {
    const approvalView = parts[1] === "request" ? "detail" : parts[1] === "review" ? "review" : "list";
    const requestId = approvalView === "list" ? null : parts[2];
    if (requestId && requests.some((r) => r.id === requestId)) return { tab: "requestDetail", requestDetailId: requestId, selectedId: requestId, dashboardMetric: null, dashboardRequestId: null, trackerRequestId: null };
    return { tab: "approvals", approvalView, selectedId: state.selectedId, dashboardMetric: null, dashboardRequestId: null, trackerRequestId: null, requestDetailId: null };
  }
  if (parts[0] === "tracker" && requests.some((r) => r.id === parts[1])) return { tab: "requestDetail", requestDetailId: parts[1], selectedId: parts[1], trackerRequestId: null, dashboardMetric: null, dashboardRequestId: null };
  if (parts[0] === "tracker") return { tab: "tracker", trackerRequestId: null, dashboardMetric: null, dashboardRequestId: null, requestDetailId: null };
  if (parts[0] === "documents") return { tab: parts[1] === "rules" ? "documents" : "uploads", trackerRequestId: null, dashboardMetric: null };
  if (parts[0] === "emails") {
    const emailId = [...steps, ...emailNotificationEvents].find(([id]) => String(id) === parts[1])?.[0];
    return { tab: "emails", emailStep: emailId ?? state.emailStep, trackerRequestId: null, dashboardMetric: null };
  }
  if (parts[0] === "guide") return { tab: "guide" };
  if (parts[0] === "administration") {
    const administrationRoutes = { users: "users", roles: "roles", departments: "departments", "request-requirements": "requestRequirements", "request-settings": "requestSettings" };
    return { tab: administrationRoutes[parts[1]] || "users" };
  }
  if (parts[0] === "master-data") {
    const resourceTabs = { "cost-centers": "costCenters", vendors: "vendors", "chart-of-accounts": "accounts", "tax-codes": "taxCodes", currencies: "currencies", "payment-methods": "paymentMethods", "document-types": "documentTypes" };
    if (parts[1] === "company-bank-accounts") {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/master-data/cost-centers`);
    }
    return { tab: resourceTabs[parts[1]] || "costCenters" };
  }
  if (parts[0] === "dashboard" && parts[1] === "request" && requests.some((r) => r.id === parts[2])) return { tab: "requestDetail", requestDetailId: parts[2], selectedId: parts[2], dashboardMetric: null, dashboardRequestId: null, trackerRequestId: null };
  if (parts[0] === "dashboard") return { tab: "dashboard", dashboardMetric: ["pending", "value", "returned", "unclaimed"].includes(parts[1]) ? parts[1] : null, dashboardRequestId: null, dashboardWorkflow: parts[1] === "workflow", selectedId: requests.some((r) => r.id === parts[2]) ? parts[2] : state.selectedId, trackerRequestId: null, requestDetailId: null };
  return { tab: "dashboard", dashboardMetric: null, trackerRequestId: null };
}
function resetPageScroll() {
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  document.querySelector(".app-shell > main")?.scrollTo({ top: 0, left: 0, behavior: "instant" });
}
if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
function navigate(path) {
  if (window.location.hash === `#${path}`) {
    state = { ...state, ...routeStateFromHash() };
    render();
    resetPageScroll();
  } else window.location.hash = path;
}
const money = (value, currency = "PHP") => {
  if (currency === "OTHER") return `${state.otherCurrency || "Currency"} ${new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(value)}`;
  return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
};
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const taxBreakdown = (grossAmount, ewtRate = 0, vatInclusive = true) => {
  const gross = roundMoney(grossAmount);
  const rawNetOfVat = vatInclusive ? gross / 1.12 : gross;
  const netOfVat = roundMoney(rawNetOfVat);
  const vatAmount = vatInclusive ? roundMoney(gross - rawNetOfVat) : 0;
  const ewtAmount = roundMoney(rawNetOfVat * (Number(ewtRate) / 100));
  return { gross, netOfVat, vatAmount, ewtRate: Number(ewtRate), ewtAmount, amountDue: roundMoney(gross - ewtAmount) };
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
const pillTone = (status) => /Rejected|Disapproved|Declined/i.test(status) ? "rejected" : /Returned/i.test(status) ? "returned" : /Completed|Approved|Release|Notification|Tracker/i.test(status) ? "approved" : /Draft|Uploading/i.test(status) ? "neutral" : "pending";
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
const prototypeRequests = requests.map((request) => ({ ...request }));
};
const voucherFor = (r, allowCreation = false) => {
  if (r.currentStep < 9) return "";
  if (r.currentStep === 9 && !state.voucherDetails.created && !allowCreation) return "";
  const voucher = r.currentStep === 9 ? state.voucherDetails : {
    paymentMethod: state.voucherDetails.paymentMethod || "Bank Transfer (DigiBanker)",
    checkNumber: state.voucherDetails.checkNumber,
    transactionNumber: state.voucherDetails.transactionNumber || `TXN-${r.id.replace(/[^0-9]/g, "")}`,
  };
  const typeLabel = paymentTypes[r.type].label;
  const taxes = taxBreakdown(r.amount, 2, true);
  const voucherNumber = `PV-${r.id.replace("-2026-", "-")}`;
  const checkNumber = r.currentStep >= 11 ? "CHK-004918" : "Pending payment preparation";
  const certifications = approvalCertificationFor(r);
  if (r.currentStep === 9 && !state.voucherDetails.created) return `<section class="panel voucher-creation-details"><div class="validation-section-heading"><div><span class="eyebrow">Voucher Input</span><h3>Payment Processing Details</h3><p>Complete the required payment information before generating the payment voucher.</p></div><span class="status-pill pending">Required</span></div><div class="voucher-payment-grid"><label>Payment Method <small>(Required)</small><select data-voucher-payment-method><option value="">Select payment method</option><option value="Check" ${voucher.paymentMethod === "Check" ? "selected" : ""}>Check</option><option value="Bank Transfer (DigiBanker)" ${voucher.paymentMethod === "Bank Transfer (DigiBanker)" ? "selected" : ""}>Bank Transfer (DigiBanker)</option><option value="Cash" ${voucher.paymentMethod === "Cash" ? "selected" : ""}>Cash</option></select></label><label>Transaction Number <small>(Required)</small><input data-voucher-transaction-number value="${voucher.transactionNumber}" placeholder="Match the Finance Team Tracker File"></label>${voucher.paymentMethod === "Check" ? `<label>Check Number <small>(Optional)</small><input data-voucher-check-number value="${voucher.checkNumber}" placeholder="Enter check number when available"></label>` : ""}</div><p class="voucher-transaction-note">The Transaction Number must match the corresponding entry in the Finance Team Tracker File.</p><div class="voucher-create-action"><button type="button" class="confirmation-button" data-create-voucher ${voucher.paymentMethod && voucher.transactionNumber.trim() ? "" : "disabled"}>Generate Voucher</button></div></section>`;
  const collapsibleVoucher = r.currentStep > 9;
  return `${collapsibleVoucher ? `<details class="voucher-card collapsible-voucher"><summary><div><span class="eyebrow">Payment Voucher</span><strong>${voucherNumber}</strong><small>Generated · Click to review payment and approval details</small></div><span class="voucher-toggle-button">View Voucher</span></summary><div class="voucher-collapsible-content">` : `<div class="voucher-card">`}
    <div class="voucher-heading"><div><span class="eyebrow">Payment Voucher</span><h4>${voucherNumber}</h4><p>Automated Payment System</p></div><button class="print-button" data-print-voucher="true">Print</button></div>
    <div class="voucher-meta"><span><small>Reference No.</small><strong>${r.id}</strong></span><span><small>Date</small><strong>2026-06-24</strong></span></div>
    <table class="voucher-table"><tbody>
      <tr><th>Payee</th><td>${r.vendor}</td><th>Department</th><td>${r.department}</td></tr>
      <tr><th>Requestor</th><td>${r.requestor}</td><th>Payment Method</th><td>Check payment</td></tr>
      <tr><th>Purpose</th><td colspan="3">${typeLabel} payment for ${r.vendor}</td></tr>
      <tr><th>Releasing Bank</th><td>BDO</td><th>Check No.</th><td>${checkNumber}</td></tr>
    </tbody></table>
    <table class="voucher-table amount-table"><tbody>
      <tr><th>Gross Amount (VAT Inclusive)</th><td>${money(taxes.gross, r.currency || "PHP")}</td></tr>
      <tr><th>12% VAT Component</th><td>${money(taxes.vatAmount, r.currency || "PHP")}</td></tr>
      <tr><th>Net of VAT / EWT Base</th><td>${money(taxes.netOfVat, r.currency || "PHP")}</td></tr>
      <tr><th>Less: 2% EWT</th><td>${money(taxes.ewtAmount, r.currency || "PHP")}</td></tr>
      <tr class="net-row"><th>Total Amount Due</th><td>${money(taxes.amountDue, r.currency || "PHP")}</td></tr>
    </tbody></table>
    <section class="approval-certification"><div class="certification-heading"><div><span class="eyebrow">Digital Approval Certification</span><strong>System-verified approval trail</strong></div><small>No handwritten signature required</small></div>
      <div class="certification-list">${certifications.map(([stage, approver, decision, timestamp, id]) => `<div class="certification-record"><div><small>${stage}</small><strong>${approver}</strong></div><div><small>Decision</small><strong>${decision}</strong></div><div><small>Date and Time</small><strong>${timestamp}</strong></div><div><small>Approval ID</small><strong>${id}</strong></div></div>`).join("")}</div>
      <p>Authenticated through the Automated Payment System. Approval records are linked to request version ${r.id}-01.</p>
    </section>
  ${collapsibleVoucher ? `</div></details>` : `</div>`}`;
};
const requestFieldKey = (label) => ({
  "Event / Purpose": "purpose", "Last Day of the Event": "event_end_date",
  "Cash Advance Reference Number": "cash_advance_reference", "Date to Be Liquidated": "liquidation_due_date",
  "Actual Date of Liquidation": "actual_liquidation_date",
}[label] || label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "_").replaceAll(/^_|_$/g, ""));
const documentFieldKey = (label) => label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "_").replaceAll(/^_|_$/g, "");
const fieldInput = (field) => {
  if (field.label === "Cash Advance Reference Number") {
    const options = state.cashAdvanceOptions || [];
    const previous = state.drafts.find((draft) => draft.id === state.activeDraftId)?.fields?.cash_advance_reference || state.requestFieldBuffer.cash_advance_reference || "";
    const unavailable = previous && !options.some((item) => item.request_number === previous);
    return `<label>Cash Advance Reference Number<select data-request-field="cash_advance_reference" required><option value="">${state.cashAdvanceOptionsLoading || state.cashAdvanceOptions === null ? "Loading your cash advances…" : "Select a cash advance"}</option>${options.map((item) => `<option value="${escapeHtml(item.request_number)}">${escapeHtml(item.request_number)} · ${escapeHtml(money(Number(item.amount), item.currency_code))}</option>`).join("")}${unavailable ? `<option value="${escapeHtml(previous)}" disabled>${escapeHtml(previous)} · No longer available</option>` : ""}</select>${state.cashAdvanceOptionsError ? `<small class="field-error">${escapeHtml(state.cashAdvanceOptionsError)}</small><button type="button" data-retry-cash-advances>Retry loading cash advances</button>` : !state.cashAdvanceOptionsLoading && state.cashAdvanceOptions?.length === 0 ? `<span class="field-warning-tooltip" tabindex="0" aria-label="No submitted cash advances found for your account."><span class="field-warning-icon" aria-hidden="true">⚠</span><span class="field-warning-message" role="tooltip">No submitted cash advances found for your account.</span></span>` : ""}</label>`;
  }
  if (field.label === "Department") {
    const costCenters = state.masterData["cost-centers"] || [];
    return `<label>Department / Cost Center<select data-department-cost-center data-request-field="department_cost_center_id"><option value="">Select department</option>${costCenters.filter((item) => item.is_active !== false).map((item) => `<option value="${item.id}">${escapeHtml(item.name)} (${escapeHtml(item.code)})</option>`).join("")}</select></label>`;
  }
  const fieldKey = requestFieldKey(field.label);
  return field.kind === "textarea"
    ? `<label class="full">${field.label}<textarea data-request-field="${fieldKey}" placeholder="${field.value}"></textarea></label>`
    : `<label>${field.label}<input data-request-field="${fieldKey}" type="${field.kind === "date" ? "date" : "text"}" ${field.label === "Last Day of the Event" ? "data-event-end-date" : ""} ${field.kind === "date" ? `value="${field.label === "Last Day of the Event" && state.draftType === "cashAdvance" ? state.cashAdvanceEventEnd : field.value}"` : `placeholder="${field.value}"`}></label>`;
};
const uploadIcon = `<span class="line-upload-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V3m0 0L7 8m5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg></span>`;
const uploadInput = (documentName) => `<div class="upload-row"><span>${documentName}</span><div class="upload-row-selection"><span class="line-upload-filename" data-request-document-filename>No files selected</span><label class="line-upload-control document-upload-button" title="Upload ${escapeHtml(documentName)}"><input type="file" data-request-document="${documentFieldKey(documentName)}" ${documentName.includes("Billing / Quotation / SOA") ? "multiple" : ""} aria-label="Upload ${escapeHtml(documentName)}">${uploadIcon}<span>Upload Files</span></label></div></div>`;
const lineAttachmentNames = (value) => (Array.isArray(value) ? value : value ? [value] : [])
  .filter((name) => typeof name === "string" && name.trim()).map((name) => name.trim());
const lineCenterLabel = (value) => (state.masterData["cost-centers"] || []).find((center) => center.id === value || center.code === value)?.name || value || "Choose a cost center";
const lineFieldComplete = (row, column) => column === "Amount"
  ? Number(row[column]) > 0
  : column === "Attachment" || column === "Receipt" || column === "Proof of Payment"
    ? lineAttachmentNames(row[column]).length > 0
    : Boolean(String(row[column] || "").trim());
const lineRowActive = (row, type) => paymentTypes[type].lineColumns.some((column) => lineFieldComplete(row, column));

function refreshLineRequirements(rowIndex) {
  const row = state.lineItemsByType[state.draftType]?.[rowIndex];
  const card = document.querySelector(`[data-line-card="${rowIndex}"]`);
  if (!row || !card) return;
  const active = lineRowActive(row, state.draftType);
  card.querySelectorAll("[data-line-column]").forEach((control) => {
    const optionalLiquidationReceipt = state.draftType === "liquidation" && control.type === "file";
    const incomplete = active && !optionalLiquidationReceipt && !lineFieldComplete(row, control.dataset.lineColumn);
    control.required = active && !optionalLiquidationReceipt && (control.type !== "file" || incomplete);
    control.setAttribute("aria-required", String(active && !optionalLiquidationReceipt));
    control.closest(".line-card-field")?.classList.toggle("line-field-required", incomplete);
  });
}

function validationRequirementComplete(requirement) {
  const normalized = requirement.toLowerCase();
  const fieldLabels = [...document.querySelectorAll(".request-form-panel .field-grid label")];
  const fieldValue = (...needles) => {
    const label = fieldLabels.find((candidate) => needles.some((needle) => candidate.textContent.toLowerCase().includes(needle)));
    const control = label?.querySelector("input, select, textarea");
    return Boolean(control && String(control.value || "").trim());
  };
  const lineItems = state.lineItemsByType[state.draftType] || [];
  const hasFiles = [...document.querySelectorAll('.request-form-page input[type="file"]')].some((input) => input.files?.length);
  const hasLineAttachments = lineItems.length > 0 && lineItems.every((item) => lineAttachmentNames(item.Attachment).length || lineAttachmentNames(item.Receipt).length);

  if (normalized.includes("automatically generated")) return true;
  if (normalized.includes("automatic date to liquidate")) return Boolean(state.cashAdvanceLiquidationDate);
  if (normalized.includes("accountability") || normalized.includes("authority to deduct")) return Boolean(document.querySelector(".accountability-box input[type=checkbox]")?.checked);
  if (normalized.includes("requestor")) return fieldValue("requestor's name", "cash advance requestor", "requestor");
  if (normalized === "department") return fieldValue("department");
  if (normalized === "date") return fieldLabels.some((label) => label.childNodes[0]?.textContent.trim().toLowerCase() === "date" && Boolean(label.querySelector("input")?.value));
  if (normalized.includes("event / purpose")) return fieldValue("event / purpose");
  if (normalized.includes("cash advance reference")) return fieldValue("cash advance reference number");
  if (normalized.includes("last day of the event")) return fieldValue("last day of the event");
  if (normalized.includes("date to be liquidated")) return fieldValue("date to be liquidated");
  if (normalized.includes("actual date of liquidation")) return fieldValue("actual date of liquidation");
  if (normalized.includes("p.o. reference") || normalized.includes("approved p.o.")) return Boolean(state.selectedPO);
  if (normalized.includes("complete request breakdown")) {
    const values = ["Merchant Name", "Particulars", "Expense Account", "Department / Cost Center", "Amount", "Attachment"];
    const startedRows = lineItems.filter((item) => values.some((key) => String(item[key] || "").trim()));
    return startedRows.length > 0 && startedRows.every((item) => values.every((key) => key === "Amount" ? Number(item[key]) > 0 : key === "Attachment" ? lineAttachmentNames(item[key]).length > 0 : String(item[key] || "").trim()));
  }
  if (normalized.includes("expense account")) return lineItems.length > 0 && lineItems.every((item) => {
    const expense = item["Expense Account"];
    const department = item["Department / Cost Center"] || item["Department to Be Charged"];
    return String(expense || "").trim() && String(department || "").trim() && Number(item.Amount) > 0;
  });
  if (normalized.includes("invoice") || normalized.includes("official receipt") || normalized.includes("billing")) return hasFiles || hasLineAttachments;
  return false;
}

function refreshValidationPreview() {
  const requirements = [...document.querySelectorAll("[data-validation-requirement]")];
  let complete = 0;
  requirements.forEach((row) => {
    const isComplete = validationRequirementComplete(row.dataset.validationRequirement || "");
    const icon = row.querySelector("span");
    if (isComplete) complete += 1;
    if (icon) {
      icon.className = isComplete ? "ok" : "warn";
      icon.textContent = isComplete ? "✓" : "!";
    }
    row.dataset.validationStatus = isComplete ? "complete" : "pending";
  });
  const count = document.querySelector("[data-validation-count]");
  if (count) count.textContent = `${complete}/${requirements.length}`;
}

function setState(patch) {
  state = { ...state, ...patch };
  render();
}

function errorToast(message, title = "Something went wrong") {
  return { id: `${Date.now()}-${Math.random()}`, tone: "error", title, message: String(message || "Please try again.") };
}

function successToast(message, title = "Saved") {
  return { id: `${Date.now()}-${Math.random()}`, tone: "success", title, message: String(message) };
}

function showErrorToast(message, title) {
  setState({ toast: errorToast(message, title) });
}

function toastView() {
  if (!state.toast) return "";
  const isError = state.toast.tone === "error";
  return `<div class="app-toast-region" aria-live="${isError ? "assertive" : "polite"}" aria-atomic="true"><section class="app-toast app-toast-${state.toast.tone}" role="${isError ? "alert" : "status"}"><span class="app-toast-icon" aria-hidden="true">${isError ? "!" : "✓"}</span><div class="app-toast-copy"><strong>${escapeHtml(state.toast.title)}</strong><p>${escapeHtml(state.toast.message)}</p></div><button type="button" class="app-toast-dismiss" data-dismiss-toast aria-label="Dismiss message">×</button><span class="app-toast-timer" aria-hidden="true"></span></section></div>`;
}

function bindToast() {
  document.querySelector("[data-dismiss-toast]")?.addEventListener("click", () => setState({ toast: null }));
  if (!state.toast || scheduledToastId === state.toast.id) return;
  clearTimeout(toastDismissTimer);
  scheduledToastId = state.toast.id;
  toastDismissTimer = window.setTimeout(() => {
    if (state.toast?.id !== scheduledToastId) return;
    state = { ...state, toast: null };
    scheduledToastId = null;
    render();
  }, 7000);
}

function actionPromptModal() {
  const prompt = state.actionPrompt;
  if (!prompt) return "";
  const input = prompt.inputLabel ? `<label>${escapeHtml(prompt.inputLabel)}${prompt.required ? " <small>(Required)</small>" : ""}<textarea data-action-prompt-input placeholder="${escapeHtml(prompt.placeholder || "")}"></textarea></label>` : "";
  return `<div class="correction-modal-backdrop" data-action-prompt-backdrop><section class="correction-modal" role="dialog" aria-modal="true" aria-labelledby="action-prompt-title"><div><span class="eyebrow">${escapeHtml(prompt.eyebrow || "Confirm Action")}</span><h3 id="action-prompt-title">${escapeHtml(prompt.title)}</h3><p>${escapeHtml(prompt.message || "")}</p></div>${input}<div class="correction-modal-actions"><button type="button" data-cancel-action-prompt>Cancel</button><button type="button" class="${prompt.danger ? "danger" : "confirmation-button"}" data-confirm-action-prompt ${prompt.required ? "disabled" : ""}>${escapeHtml(prompt.confirmLabel || "Confirm")}</button></div></section></div>`;
}

function openActionPrompt(options) {
  setState({ actionPrompt: options });
}

function bindActionPrompt() {
  const close = () => setState({ actionPrompt: null });
  document.querySelector("[data-cancel-action-prompt]")?.addEventListener("click", close);
  document.querySelector("[data-action-prompt-backdrop]")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) close(); });
  const input = document.querySelector("[data-action-prompt-input]");
  const confirm = document.querySelector("[data-confirm-action-prompt]");
  input?.addEventListener("input", () => { if (confirm) confirm.disabled = state.actionPrompt?.required && !input.value.trim(); });
  confirm?.addEventListener("click", async () => {
    const prompt = state.actionPrompt;
    const value = input?.value.trim() || "";
    if (!prompt || prompt.required && !value) return;
    state.actionPrompt = null;
    render();
    await prompt.onConfirm?.(value);
  });
  input?.focus();
}

function loginView() {
  const checking = state.authStatus === "checking";
  const busy = checking || state.authSubmitting;
  const buttonLabel = state.authSubmitting ? "Signing in…" : checking ? "Checking session…" : "Sign in";
  const demoAccounts = [
    ["requestor@payment.local", "Requestor"], ["department.head@payment.local", "Department Head"],
    ["finance.associate@payment.local", "Finance Associate"], ["finance.manager@payment.local", "Finance Manager"],
    ["coo@payment.local", "COO"], ["president@payment.local", "President"],
    ["board.member@payment.local", "Board Member"], ["signatory@payment.local", "Authorized Signatory"],
    ["admin@payment.local", "System Administrator"],
  ];
  const demoSelector = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_LOGIN === "true"
    ? `<div class="development-login-selector"><label>Login as<select data-demo-login><option value="">Select a development role</option>${demoAccounts.map(([email, role]) => `<option value="${email}">${role}</option>`).join("")}</select></label></div>`
    : "";
  return `<main class="signed-out"><section class="login-panel" aria-label="Automated Payment System sign in">
    <div class="login-intro"><div class="brand-lockup"><span class="brand-mark" aria-hidden="true">AP</span><span><strong>Automated Payment System</strong><small>Finance Operations</small></span></div></div>
    <div class="login-copy"><h1>Sign in</h1><p>Sign in to continue.</p></div>
    <form class="login-form" data-login-form><label>Email<input name="email" type="email" autocomplete="username" required ${busy ? "disabled" : ""}></label><label>Password<input name="password" type="password" autocomplete="current-password" minlength="8" required ${busy ? "disabled" : ""}></label><button class="primary-button login-submit-button" type="submit" ${busy ? "disabled" : ""} aria-busy="${busy}">${busy ? `<span class="login-button-spinner" aria-hidden="true"></span>` : ""}<span>${buttonLabel}</span></button>${demoSelector}</form>
  </section>${toastView()}</main>`;
}

function personaForRoles(roles = []) {
  const rolePersona = { requestor: "requestor", department_head: "departmentHead", finance_associate: "financeAssociate", finance_manager: "financeManager", authorized_signatory: "authorizedSignatory", coo: "coo", president: "president", board_member: "boardMember" };
  return roles.map((role) => rolePersona[role]).find(Boolean) || "all";
}

function bindLogin() {
  document.querySelector("[data-demo-login]")?.addEventListener("change", (event) => {
    const form = event.currentTarget.form;
    if (!event.currentTarget.value || !form) return;
    form.elements.email.value = event.currentTarget.value;
    form.elements.password.value = import.meta.env.VITE_DEMO_PASSWORD || "Phase01-Test-Only!";
  });
  document.querySelector("[data-login-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState({ authSubmitting: true, authError: "" });
    try {
      const session = await dataSource.login(form.get("email"), form.get("password"));
      const persona = personaForRoles(session.user.roles);
      state = { ...state, authStatus: "authenticated", authUser: session.user, csrfToken: session.csrf_token, persona, authSubmitting: false, cashAdvanceOptions: null, requirementRules: [], requirementDocumentTypes: [], requirementRulesLoaded: false, requirementRulesLoading: false, requirementRulesError: "", requirementRuleEdit: null, notifications: { unread_count: 0, items: [] }, notificationsLoaded: false, notificationsOpen: false };
      await loadApiPaymentRequests();
      navigate("/dashboard");
    } catch (error) {
      setState({ authStatus: "unauthenticated", authError: error.message || "Sign-in failed", authSubmitting: false, toast: errorToast(error.message || "Sign-in failed", "Unable to sign in") });
    }
  });
}

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

async function loadIdentityData() {
  if (state.identityLoading || !state.authUser) return;
  state.identityLoading = true;
  state.identityError = "";
  render();
  try {
    const [users, roles, permissions, departments] = await Promise.all([dataSource.listUsers(), dataSource.listRoles(), dataSource.listPermissions(), dataSource.listDepartments()]);
    setState({ identityData: { users, roles, permissions, departments }, identityLoading: false });
  } catch (error) {
    const message = error.status === 403 ? "You do not have permission to administer identity data." : error.message;
    setState({ identityLoading: false, identityError: message, toast: errorToast(message, "Administration data unavailable") });
  }
}

function identityActionMenu(kind, id, label) {
  const safeLabel = escapeHtml(label);
  return `<div class="identity-action-menu"><button type="button" class="identity-action-trigger" data-identity-action-menu aria-label="Actions for ${safeLabel}" aria-expanded="false">⋮</button><div class="identity-action-popover" data-identity-action-popover hidden><button type="button" data-edit-${kind}="${id}">Edit</button><button type="button" class="danger" data-delete-${kind}="${id}">Delete</button></div></div>`;
}

function identityEditorModal() {
  const edit = state.identityEdit;
  if (!edit) return "";
  const { users, roles, permissions, departments } = state.identityData;
  const item = ({ user: users, role: roles, permission: permissions, department: departments }[edit.kind] || []).find((entry) => entry.id === edit.id);
  const isEdit = Boolean(item);
  const titles = { user: "User", department: "Department", role: "Role", permission: "Permission" };
  let form = "";
  if (edit.kind === "user") form = isEdit ? `<form data-edit-user-form="${item.id}"><label>Display name<input name="display_name" value="${escapeHtml(item.display_name)}" required maxlength="160"></label><label>Email<input name="email" type="email" value="${escapeHtml(item.email)}" required></label><label>Department<select name="department_id"><option value="">Unassigned</option>${departments.map((department) => `<option value="${department.id}" ${department.id === item.department_id ? "selected" : ""}>${escapeHtml(department.name)}</option>`).join("")}</select></label><label>Manager<select name="manager_id"><option value="">No manager</option>${users.filter((manager) => manager.id !== item.id).map((manager) => `<option value="${manager.id}" ${manager.id === item.manager_id ? "selected" : ""}>${escapeHtml(manager.display_name)}</option>`).join("")}</select></label><label class="identity-checkbox"><input name="is_active" type="checkbox" ${item.is_active ? "checked" : ""}> Active account</label><label class="identity-checkbox"><input name="is_suspended" type="checkbox" ${item.is_suspended ? "checked" : ""}> Suspended</label><div class="identity-form-actions"><button type="button" data-cancel-identity-edit>Cancel</button><button class="primary-button" type="submit">Save changes</button></div></form>` : `<form data-create-user><label>Display name<input name="display_name" required maxlength="160"></label><label>Email<input name="email" type="email" required></label><label>Temporary password<input name="password" type="password" minlength="12" required autocomplete="new-password"></label><label>Department<select name="department_id"><option value="">Unassigned</option>${departments.map((department) => `<option value="${department.id}">${escapeHtml(department.name)}</option>`).join("")}</select></label><label>Manager<select name="manager_id"><option value="">No manager</option>${users.map((manager) => `<option value="${manager.id}">${escapeHtml(manager.display_name)}</option>`).join("")}</select></label><div class="identity-form-actions"><button type="button" data-cancel-identity-edit>Cancel</button><button class="primary-button" type="submit">Create user</button></div></form>`;
  if (edit.kind === "department") form = `<form ${isEdit ? `data-edit-department-form="${item.id}"` : "data-create-department"}><label>Code<input name="code" value="${escapeHtml(item?.code || "")}" required maxlength="30" pattern="[A-Z][A-Z0-9&_\\-]*"></label><label>Name<input name="name" value="${escapeHtml(item?.name || "")}" required maxlength="120"></label>${isEdit ? `<label class="identity-checkbox"><input name="is_active" type="checkbox" ${item.is_active ? "checked" : ""}> Active department</label>` : ""}<div class="identity-form-actions"><button type="button" data-cancel-identity-edit>Cancel</button><button class="primary-button" type="submit">${isEdit ? "Save changes" : "Add department"}</button></div></form>`;
  if (edit.kind === "role") form = `<form ${isEdit ? `data-edit-role-form="${item.id}"` : "data-create-role"}><label>Code<input name="code" value="${escapeHtml(item?.code || "")}" pattern="[a-z][a-z0-9_]*" required></label><label>Name<input name="name" value="${escapeHtml(item?.name || "")}" required></label><label>Description<textarea name="description">${escapeHtml(item?.description || "")}</textarea></label><div class="identity-form-actions"><button type="button" data-cancel-identity-edit>Cancel</button><button class="primary-button" type="submit">${isEdit ? "Save role" : "Add role"}</button></div></form>`;
  if (edit.kind === "permission") form = `<form ${isEdit ? `data-edit-permission-form="${item.id}"` : "data-create-permission"}><label>Code<input name="code" value="${escapeHtml(item?.code || "")}" pattern="[a-z][a-z0-9_.]*" required></label><label>Description<textarea name="description" required>${escapeHtml(item?.description || "")}</textarea></label><div class="identity-form-actions"><button type="button" data-cancel-identity-edit>Cancel</button><button class="primary-button" type="submit">${isEdit ? "Save permission" : "Add permission"}</button></div></form>`;
  return `<div class="identity-modal-backdrop" data-identity-modal-backdrop><section class="identity-modal" role="dialog" aria-modal="true" aria-labelledby="identity-modal-title"><div class="identity-modal-header"><div><span class="eyebrow">Administration</span><h3 id="identity-modal-title">${isEdit ? "Edit" : "Add"} ${titles[edit.kind]}</h3><p>${isEdit ? "Update the selected record. Changes are audited." : "Complete the details below. The new record will be audited."}</p></div><button type="button" class="identity-modal-close" data-cancel-identity-edit aria-label="Close">×</button></div>${form}</section></div>`;
}

function identityPage(kind) {
  if (state.identityLoading) return `<section class="identity-page"><div class="auth-loading" aria-label="Loading administration data"></div></section>`;
  if (state.identityError) return `<section class="identity-page"><p class="auth-error">${escapeHtml(state.identityError)}</p></section>`;
  const { users, roles, permissions, departments } = state.identityData;
  const departmentName = (id) => departments.find((item) => item.id === id)?.name || "Unassigned";
  const roleName = (id) => roles.find((item) => item.id === id)?.name || "Unknown role";
  let content = "";
  if (kind === "users") {
    content = `<section class="panel"><div class="panel-header"><div><h3>Users</h3><p>Maintain accounts and requestor-manager associations.</p></div><div class="identity-header-actions"><button type="button" class="primary-button" data-add-identity="user">+ User</button></div></div><div class="identity-list">${users.map((user) => `<article><div><strong>${escapeHtml(user.display_name)}</strong><small>${escapeHtml(user.email)}</small></div><div><span>${escapeHtml(departmentName(user.department_id))}</span><small>${user.role_ids.map(roleName).map(escapeHtml).join(", ") || "No role"}</small></div><span class="status-pill ${user.is_suspended || !user.is_active ? "danger" : "success"}">${user.is_suspended ? "Suspended" : user.is_active ? "Active" : "Inactive"}</span>${identityActionMenu("user", user.id, user.display_name)}</article>`).join("")}</div></section>`;
  }
  if (kind === "roles") {
    content = `<div class="identity-section-stack"><section class="panel"><div class="panel-header"><div><h3>Roles</h3><p>Role deletion is blocked while assigned to users.</p></div><div class="identity-header-actions"><button type="button" class="primary-button" data-add-identity="role">+ Role</button></div></div><div class="identity-list identity-role-list">${roles.map((role) => `<article><div><strong>${escapeHtml(role.name)}</strong><small>${escapeHtml(role.description)}</small></div><div><span>${escapeHtml(role.code)}</span><small>Role code</small></div><span class="status-pill success">${role.permission_ids?.length || 0} permissions</span>${identityActionMenu("role", role.id, role.name)}</article>`).join("")}</div></section><section class="panel"><div class="panel-header"><div><h3>Permissions</h3><p>Permission deletion is blocked while assigned.</p></div><div class="identity-header-actions"><button type="button" class="primary-button" data-add-identity="permission">+ Permission</button></div></div><div class="identity-list identity-permission-list">${permissions.map((permission) => `<article><div><strong>${escapeHtml(permission.code)}</strong><small>${escapeHtml(permission.description)}</small></div><div><span>Access rule</span><small>Permission</small></div><span class="status-pill success">Active</span>${identityActionMenu("permission", permission.id, permission.code)}</article>`).join("")}</div></section></div>`;
  }
  if (kind === "departments") {
    content = `<section class="panel"><div class="panel-header"><div><h3>Department directory</h3><p>Delete is blocked until all users are reassigned.</p></div><div class="identity-header-actions"><button type="button" class="primary-button" data-add-identity="department">+ Department</button></div></div><div class="identity-list identity-department-list">${departments.map((department) => `<article><div><strong>${escapeHtml(department.name)}</strong><small>Department</small></div><div><span>${escapeHtml(department.code)}</span><small>Department code</small></div><span class="status-pill ${department.is_active ? "success" : "danger"}">${department.is_active ? "Active" : "Inactive"}</span>${identityActionMenu("department", department.id, department.name)}</article>`).join("")}</div></section>`;
  }
  return `<section class="identity-page">${content}</section>${identityEditorModal()}`;
}

async function refreshIdentityData() {
  state.identityData = { users: [], roles: [], permissions: [], departments: [] };
  state.identityEdit = null;
  await loadIdentityData();
}

function bindIdentityForms() {
  document.querySelectorAll("[data-add-identity]").forEach((button) => button.addEventListener("click", () => setState({ identityEdit: { kind: button.dataset.addIdentity, id: null } })));
  document.querySelectorAll("[data-identity-action-menu]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const panel = button.nextElementSibling;
    const willOpen = panel?.hidden;
    document.querySelectorAll("[data-identity-action-popover]").forEach((menu) => { menu.hidden = true; });
    document.querySelectorAll("[data-identity-action-menu]").forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
    if (panel && willOpen) {
      panel.hidden = false;
      button.setAttribute("aria-expanded", "true");
    }
  }));
  document.querySelector("[data-create-department]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await dataSource.createDepartment({ code: String(form.get("code")).toUpperCase(), name: form.get("name") }, state.csrfToken);
      await refreshIdentityData();
    } catch (error) { setState({ identityError: error.message, toast: errorToast(error.message, "Unable to update user") }); }
  });
  document.querySelector("[data-create-user]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await dataSource.createUser({ email: form.get("email"), display_name: form.get("display_name"), password: form.get("password"), department_id: form.get("department_id") || null, manager_id: form.get("manager_id") || null }, state.csrfToken);
      await refreshIdentityData();
    } catch (error) { setState({ identityError: error.message, toast: errorToast(error.message, "Unable to update role") }); }
  });
  document.querySelectorAll("[data-edit-user]").forEach((button) => button.addEventListener("click", () => setState({ identityEdit: { kind: "user", id: button.dataset.editUser } })));
  document.querySelectorAll("[data-edit-department]").forEach((button) => button.addEventListener("click", () => setState({ identityEdit: { kind: "department", id: button.dataset.editDepartment } })));
  document.querySelectorAll("[data-edit-role]").forEach((button) => button.addEventListener("click", () => setState({ identityEdit: { kind: "role", id: button.dataset.editRole } })));
  document.querySelectorAll("[data-edit-permission]").forEach((button) => button.addEventListener("click", () => setState({ identityEdit: { kind: "permission", id: button.dataset.editPermission } })));
  document.querySelectorAll("[data-cancel-identity-edit]").forEach((button) => button.addEventListener("click", () => setState({ identityEdit: null })));
  document.querySelector("[data-identity-modal-backdrop]")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) setState({ identityEdit: null });
  });
  const bindSubmit = (selector, action) => document.querySelector(selector)?.addEventListener("submit", async (event) => { event.preventDefault(); try { await action(new FormData(event.currentTarget), event.currentTarget); await refreshIdentityData(); } catch (error) { setState({ identityError: error.message, toast: errorToast(error.message, "Unable to save changes") }); } });
  const editUserForm = document.querySelector("form[data-edit-user-form]");
  editUserForm?.addEventListener("submit", async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await dataSource.updateUser(event.currentTarget.dataset.editUserForm, { display_name: form.get("display_name"), email: form.get("email"), department_id: form.get("department_id") || null, manager_id: form.get("manager_id") || null, is_active: form.get("is_active") === "on", is_suspended: form.get("is_suspended") === "on" }, state.csrfToken); await refreshIdentityData(); } catch (error) { setState({ identityError: error.message, toast: errorToast(error.message, "Unable to update user") }); } });
  bindSubmit("[data-edit-department-form]", (form, element) => dataSource.updateDepartment(element.dataset.editDepartmentForm, { code: String(form.get("code")).toUpperCase(), name: form.get("name"), is_active: form.get("is_active") === "on" }, state.csrfToken));
  bindSubmit("[data-create-role]", (form) => dataSource.createRole({ code: form.get("code"), name: form.get("name"), description: form.get("description") }, state.csrfToken));
  bindSubmit("[data-edit-role-form]", (form, element) => dataSource.updateRole(element.dataset.editRoleForm, { code: form.get("code"), name: form.get("name"), description: form.get("description") }, state.csrfToken));
  bindSubmit("[data-create-permission]", (form) => dataSource.createPermission({ code: form.get("code"), description: form.get("description") }, state.csrfToken));
  bindSubmit("[data-edit-permission-form]", (form, element) => dataSource.updatePermission(element.dataset.editPermissionForm, { code: form.get("code"), description: form.get("description") }, state.csrfToken));
  const bindDelete = (selector, label, action) => document.querySelectorAll(selector).forEach((button) => button.addEventListener("click", () => openActionPrompt({
    eyebrow: "Administration",
    title: `Delete ${label}?`,
    message: "This action cannot be undone.",
    confirmLabel: "Delete",
    danger: true,
    onConfirm: async () => { try { await action(button); await refreshIdentityData(); } catch (error) { setState({ identityError: error.message, toast: errorToast(error.message, `Unable to delete ${label}`) }); } },
  })));
  bindDelete("[data-delete-user]", "this user", (button) => dataSource.deleteUser(button.dataset.deleteUser, state.csrfToken));
  bindDelete("[data-delete-department]", "this department", (button) => dataSource.deleteDepartment(button.dataset.deleteDepartment, state.csrfToken));
  bindDelete("[data-delete-role]", "this role", (button) => dataSource.deleteRole(button.dataset.deleteRole, state.csrfToken));
  bindDelete("[data-delete-permission]", "this permission", (button) => dataSource.deletePermission(button.dataset.deletePermission, state.csrfToken));
}

const masterDataConfig = {
  costCenters: { resource: "cost-centers", title: "Cost Centers", description: "One synchronized cost center for each department.", readonly: true },
  vendors: { resource: "vendors", title: "Vendors", description: "Read-only vendor records supplied through the external-system adapter.", readonly: true },
  accounts: { resource: "chart-of-accounts", title: "Chart of Accounts", description: "Hierarchical posting and summary accounts." },
  taxCodes: { resource: "tax-codes", title: "Tax Codes", description: "Finance-approved VAT and EWT definitions." },
  currencies: { resource: "currencies", title: "Currencies", singular: "Currency", description: "Set the PHP value of one currency unit for approval thresholds. New rates apply to future submissions." },
  paymentMethods: { resource: "payment-methods", title: "Payment Methods", description: "Supported payment channels and reference rules." },
  documentTypes: { resource: "document-types", title: "Document Types", description: "Reusable request-document definitions." },
};

async function loadMasterData(tab = state.tab) {
  const config = masterDataConfig[tab];
  if (!config || state.masterDataLoading) return;
  state.masterDataLoading = true;
  state.masterDataError = "";
  render();
  try {
    const [items, requestNumbering] = await Promise.all([
      dataSource.listMasterData(config.resource),
      tab === "currencies" ? dataSource.getRequestNumberingSetting().catch(() => null) : Promise.resolve(state.requestNumbering),
    ]);
    setState({ masterData: { ...state.masterData, [config.resource]: items }, requestNumbering, masterDataLoading: false });
  } catch (error) {
    const message = error.status === 403 ? "You do not have permission to view this master data." : error.message;
    setState({ masterDataLoading: false, masterDataError: message, toast: errorToast(message, "Master data unavailable") });
  }
}

async function loadRequestReferenceData() {
  if (state.masterDataLoading) return;
  state.masterDataLoading = true;
  try {
    const resources = ["cost-centers", "vendors", "chart-of-accounts", "currencies", "payment-methods"];
    const [results, purchaseOrders] = await Promise.all([
      Promise.all(resources.map((resource) => dataSource.listMasterData(resource))),
      dataSource.listPurchaseOrders(),
    ]);
    const procurementPOs = purchaseOrders.map((item) => ({
      ...item,
      id: item.poNumber,
      requestor: item.requester,
      payee: item.vendorName,
      department: item.departmentCode || item.department,
      newSupplier: Boolean(item.newSupplier),
    }));
    const selectedPO = procurementPOs.some((item) => item.id === state.selectedPO) ? state.selectedPO : procurementPOs[0]?.id || state.selectedPO;
    setState({ masterData: { ...state.masterData, ...Object.fromEntries(resources.map((resource, index) => [resource, results[index]])) }, procurementPOs, selectedPO, masterDataLoading: false });
  } catch (error) {
    setState({ masterDataLoading: false, masterDataError: error.message, toast: errorToast(error.message, "Reference data unavailable") });
  }
}

function masterDataModal() {
  const edit = state.masterDataEdit;
  if (!edit) return "";
  const config = masterDataConfig[edit.tab];
  const items = state.masterData[config.resource] || [];
  const item = items.find((candidate) => String(candidate.id || candidate.code) === String(edit.id));
  const isEdit = Boolean(item);
  const common = `<label>Code<input name="code" value="${escapeHtml(item?.code || "")}" ${isEdit && edit.tab === "currencies" ? "readonly" : ""} required maxlength="40"></label><label>Display name<input name="name" value="${escapeHtml(item?.name || "")}" required maxlength="160"></label>`;
  let fields = common;
  if (edit.tab === "accounts") fields += `<label>Account type<select name="account_type"><option value="asset">Asset</option><option value="liability">Liability</option><option value="equity">Equity</option><option value="income">Income</option><option value="expense">Expense</option></select></label><label>Normal balance<select name="normal_balance"><option value="debit">Debit</option><option value="credit">Credit</option></select></label><label class="identity-checkbox"><input name="is_posting" type="checkbox" ${item?.is_posting !== false ? "checked" : ""}> Posting account</label>`;
  if (edit.tab === "taxCodes") fields += `<label>VAT classification<input name="vat_classification" value="${escapeHtml(item?.vat_classification || "")}" required></label><label>VAT rate<input name="vat_rate" type="number" min="0" max="100" step="0.0001" value="${item?.vat_rate ?? 0}" required></label><label>EWT classification<input name="ewt_classification" value="${escapeHtml(item?.ewt_classification || "")}" required></label><label>EWT rate<input name="ewt_rate" type="number" min="0" max="100" step="0.0001" value="${item?.ewt_rate ?? 0}" required></label>`;
  if (edit.tab === "currencies") fields = `${common}<label>Symbol<input name="symbol" value="${escapeHtml(item?.symbol || "")}" required maxlength="8"></label><label>Decimal precision<input name="decimal_precision" type="number" min="0" max="6" value="${item?.decimal_precision ?? 2}" required></label><label>PHP per 1 ${escapeHtml(item?.code || "currency unit")}<input name="php_per_unit" type="number" min="0.00000001" step="0.00000001" value="${escapeHtml(item?.php_per_unit ?? (item?.code === "PHP" ? "1" : ""))}" ${item?.code === "PHP" ? "readonly" : ""}></label><p>Leave blank to keep foreign-currency approvals pending. Existing submitted routes keep their saved rate.</p>`;
  if (edit.tab === "paymentMethods") fields += `<label>Category<input name="category" value="${escapeHtml(item?.category || "")}" required></label><label class="identity-checkbox"><input name="requires_reference" type="checkbox" ${item?.requires_reference ? "checked" : ""}> Requires transaction reference</label>`;
  if (edit.tab === "documentTypes") fields += `<label>Description<textarea name="description">${escapeHtml(item?.description || "")}</textarea></label><label>Copy requirement<select name="copy_requirement"><option value="soft" ${item?.copy_requirement === "soft" ? "selected" : ""}>Soft copy</option><option value="hard" ${item?.copy_requirement === "hard" ? "selected" : ""}>Hard copy</option><option value="both" ${item?.copy_requirement === "both" ? "selected" : ""}>Both</option></select></label><fieldset class="document-type-request-fieldset"><legend>Included in request types</legend><p>Select every request form where this document type can be uploaded.</p><div class="document-type-request-grid">${Object.entries(requestTypeLabels).map(([id, label]) => `<label class="identity-checkbox"><input name="allowed_request_types" type="checkbox" value="${id}" ${(item?.allowed_request_types || []).includes(id) ? "checked" : ""}> ${label}</label>`).join("")}</div></fieldset>`;
  if (!isEdit && edit.tab !== "currencies" && edit.tab !== "documentTypes") fields += `<label>Description<textarea name="description"></textarea></label>`;
  if (isEdit) fields += `<label class="identity-checkbox"><input name="is_active" type="checkbox" ${item.is_active !== false ? "checked" : ""}> Active</label>`;
  return `<div class="identity-modal-backdrop" data-master-modal-backdrop><section class="identity-modal" role="dialog" aria-modal="true" aria-labelledby="master-modal-title"><div class="identity-modal-header"><div><span class="eyebrow">Master Data</span><h3 id="master-modal-title">${isEdit ? "Edit" : "Add"} ${config.singular || config.title.replace(/s$/, "")}</h3><p>Changes are validated and recorded in the audit trail.</p></div><button type="button" class="identity-modal-close" data-cancel-master-edit aria-label="Close">×</button></div><form data-master-form>${fields}<div class="identity-form-actions"><button type="button" data-cancel-master-edit>Cancel</button><button type="submit" class="primary-button">${isEdit ? "Save changes" : "Add record"}</button></div></form></section></div>`;
}

function masterDataPage(tab) {
  const config = masterDataConfig[tab];
  if (state.masterDataLoading) return `<section class="identity-page"><div class="auth-loading" aria-label="Loading master data"></div></section>`;
  if (state.masterDataError) return `<section class="identity-page"><p class="auth-error">${escapeHtml(state.masterDataError)}</p></section>`;
  const items = state.masterData[config.resource] || [];
  const rows = items.length ? items.map((item) => {
    const id = item.id || item.code;
    const secondary = tab === "currencies" ? (item.php_per_unit ? `1 ${item.code} = PHP ${item.php_per_unit}` : "PHP conversion rate pending") : tab === "documentTypes" ? `${item.copy_requirement || "soft"} copy` : item.masked_account_number || item.default_currency || item.account_type || item.category || item.copy_requirement || "Reference data";
    const active = item.status ? item.status === "active" : item.is_active !== false;
    const actions = config.readonly ? "" : `<div class="identity-action-menu"><button type="button" class="identity-action-trigger" data-master-edit="${escapeHtml(id)}" aria-label="Edit ${escapeHtml(item.name)}">⋮</button></div>`;
    const inclusion = tab === "documentTypes" ? `<div><span>${(item.allowed_request_types || []).map((type) => requestTypeLabels[type] || type).map(escapeHtml).join(", ") || "No request types"}</span></div>` : `<div><span>${escapeHtml(item.code)}</span><small>Official code</small></div>`;
    return `<article><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(secondary)}${tab === "documentTypes" ? ` · ${escapeHtml(item.code)}` : ""}</small></div>${inclusion}<span class="status-pill ${active ? "success" : "danger"}">${active ? "Active" : "Inactive"}</span>${actions}</article>`;
  }).join("") : `<div class="empty-state">No records are configured yet.</div>`;
  const listHeader = tab === "documentTypes" && items.length
    ? `<div class="identity-list-header" role="row"><span role="columnheader">Document Name</span><span role="columnheader">Request Type</span><span role="columnheader">Status</span><span class="sr-only" role="columnheader">Actions</span></div>`
    : "";
  return `<section class="identity-page"><div class="identity-section-stack"><section class="panel"><div class="panel-header"><div><h3>${config.title}</h3><p>${config.description}</p></div>${config.readonly ? "" : `<div class="identity-header-actions"><button type="button" class="primary-button" data-add-master>+ ${config.singular || config.title.replace(/s$/, "")}</button></div>`}</div><div class="identity-list">${listHeader}${rows}</div></section></div></section>${masterDataModal()}`;
}

function masterPayload(tab, form) {
  const text = (name) => String(form.get(name) || "").trim();
  if (tab === "currencies") return { code: text("code").toUpperCase(), name: text("name"), symbol: text("symbol"), decimal_precision: Number(text("decimal_precision")), php_per_unit: text("php_per_unit") || null };
  if (tab === "accounts") return { code: text("code").toUpperCase(), name: text("name"), description: text("description"), account_type: text("account_type"), normal_balance: text("normal_balance"), is_posting: form.get("is_posting") === "on" };
  if (tab === "taxCodes") return { code: text("code").toUpperCase(), name: text("name"), description: text("description"), vat_classification: text("vat_classification"), vat_rate: Number(text("vat_rate")), ewt_classification: text("ewt_classification"), ewt_rate: Number(text("ewt_rate")) };
  if (tab === "paymentMethods") return { code: text("code").toUpperCase(), name: text("name"), description: text("description"), category: text("category"), requires_reference: form.get("requires_reference") === "on" };
  if (tab === "documentTypes") return { code: text("code").toUpperCase(), name: text("name"), description: text("description"), allowed_request_types: form.getAll("allowed_request_types"), copy_requirement: text("copy_requirement") };
  return { code: text("code").toUpperCase(), name: text("name"), description: text("description") };
}

let masterModalReturnTarget = null;

function openMasterDataModal(id = null) {
  masterModalReturnTarget = id ? `[data-master-edit="${CSS.escape(id)}"]` : "[data-add-master]";
  setState({ masterDataEdit: { tab: state.tab, id } });
  document.querySelector("[data-master-form] input:not([type=hidden]), [data-master-form] select")?.focus();
}

function closeMasterDataModal() {
  const returnTarget = masterModalReturnTarget;
  setState({ masterDataEdit: null });
  if (returnTarget) document.querySelector(returnTarget)?.focus();
  masterModalReturnTarget = null;
}

function bindMasterData() {
  const config = masterDataConfig[state.tab];
  if (!config) return;
  document.querySelector("[data-add-master]")?.addEventListener("click", () => openMasterDataModal());
  document.querySelectorAll("[data-master-edit]").forEach((button) => button.addEventListener("click", () => openMasterDataModal(button.dataset.masterEdit)));
  document.querySelectorAll("[data-cancel-master-edit]").forEach((button) => button.addEventListener("click", closeMasterDataModal));
  document.querySelector("[data-master-modal-backdrop]")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) closeMasterDataModal(); });
  document.querySelector("[data-master-modal-backdrop] .identity-modal")?.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll("button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])")];
    if (!controls.length) return;
    if (event.shiftKey && document.activeElement === controls[0]) {
      event.preventDefault();
      controls.at(-1).focus();
    } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
      event.preventDefault();
      controls[0].focus();
    }
  });
  document.querySelector("[data-master-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const edit = state.masterDataEdit;
    const payload = masterPayload(edit.tab, new FormData(event.currentTarget));
    const isEdit = Boolean(edit.id);
    if (isEdit) payload.is_active = event.currentTarget.elements.is_active?.checked ?? undefined;
    try {
      if (isEdit) await dataSource.updateMasterData(config.resource, edit.id, payload, state.csrfToken);
      else await dataSource.createMasterData(config.resource, payload, state.csrfToken);
      state.masterDataEdit = null;
      state.masterData[config.resource] = [];
      await loadMasterData(state.tab);
    } catch (error) { setState({ masterDataError: error.message, toast: errorToast(error.message, "Unable to save master data") }); }
  });
  document.querySelector("[data-numbering-settings]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await dataSource.updateRequestNumberingSetting(Number(new FormData(event.currentTarget).get("reset_month")), state.csrfToken);
      state.requestNumbering = await dataSource.getRequestNumberingSetting();
      render();
    } catch (error) { setState({ masterDataError: error.message, toast: errorToast(error.message, "Unable to save numbering settings") }); }
  });
}

function updateDraftLineItem(rowIndex, column, value) {
  const lineItemsByType = { ...state.lineItemsByType };
  lineItemsByType[state.draftType] = lineItemsByType[state.draftType].map((row, index) => index === rowIndex ? { ...row, [column]: value } : row);
  state = { ...state, lineItemsByType };
  refreshLineRequirements(rowIndex);
  const amount = state.draftType === "poPayment" ? (purchaseOrderRecords().find((record) => record.id === state.selectedPO) || purchaseOrderRecords()[0]).amount : lineItemsByType[state.draftType].reduce((sum, item) => sum + (Number(item.Amount) || 0), 0);
  const amountInput = document.getElementById("draftAmount");
  const totalOutput = document.querySelector("[data-line-total]");
  const routeOutput = document.querySelector(".route-box strong");
  if (amountInput) amountInput.value = amount;
  if (totalOutput) totalOutput.textContent = money(amount);
  if (routeOutput) routeOutput.textContent = route({ amount, budgeted: state.budgeted, type: state.draftType });
  const lineCard = document.querySelector(`[data-line-card="${rowIndex}"]`);
  if (lineCard) {
    const row = lineItemsByType[state.draftType][rowIndex];
    const title = row["Merchant Name"] || row.Particulars || row.Supplier || row["P.O. Number"] || `Line item ${rowIndex + 1}`;
    const subtitle = lineCenterLabel(row["Department / Cost Center"] || row["Department to Be Charged"]);
    lineCard.querySelector("[data-line-title]").textContent = title;
    if (lineCard.querySelector("[data-line-subtitle]")) lineCard.querySelector("[data-line-subtitle]").textContent = subtitle;
    lineCard.querySelector("[data-line-amount]").textContent = money(Number(row.Amount) || 0, state.draftCurrency);
    if (lineCard.querySelector("[data-line-file-count]")) lineCard.querySelector("[data-line-file-count]").textContent = `${lineAttachmentNames(state.draftType === "reimbursement" ? row["Proof of Payment"] : row.Attachment || row.Receipt).length} files`;
  }
  const liquidationExpenses = document.getElementById("liquidationExpenses");
  const liquidationSettlement = document.getElementById("liquidationSettlement");
  if (liquidationExpenses) liquidationExpenses.textContent = money(amount);
  if (liquidationSettlement) liquidationSettlement.textContent = settlementFor(state.liquidationAdvanceAmount, amount);
  refreshValidationPreview();
}

function addDraftLineItem() {
  state.requestFieldBuffer = captureDraftFields();
  state.requestDocumentBuffer = { ...state.requestDocumentBuffer, ...captureDraftDocuments() };
  const emptyItem = Object.fromEntries(paymentTypes[state.draftType].lineColumns.map((column) => [column, column === "Amount" ? 0 : ""]));
  expandedLineIndex = state.lineItemsByType[state.draftType].length;
  const lineItemsByType = { ...state.lineItemsByType, [state.draftType]: [...state.lineItemsByType[state.draftType], emptyItem] };
  setState({ lineItemsByType });
}

function removeDraftLineItem(rowIndex) {
  if (state.lineItemsByType[state.draftType].length === 1) return;
  state.requestFieldBuffer = captureDraftFields();
  state.requestDocumentBuffer = { ...state.requestDocumentBuffer, ...captureDraftDocuments() };
  expandedLineIndex = Math.max(0, Math.min(expandedLineIndex > rowIndex ? expandedLineIndex - 1 : expandedLineIndex, state.lineItemsByType[state.draftType].length - 2));
  const lineItemsByType = { ...state.lineItemsByType, [state.draftType]: state.lineItemsByType[state.draftType].filter((_, index) => index !== rowIndex) };
  setState({ lineItemsByType });
}

const draftAmountFor = (draft) => draft.lineItems.reduce((sum, item) => sum + (Number(item.Amount) || 0), 0);
const activeRequestor = () => state.authUser?.display_name?.trim() || personas[state.persona]?.name || personas.requestor.name;

function apiLineToPrototype(type, line) {
  const common = { Particulars: line.particulars, Amount: Number(line.amount) || 0 };
  const attachment = lineAttachmentNames(line.attachment_refs);
  if (type === "cashAdvance") return common;
  if (type === "poPayment") return { "P.O. Number": line.invoice_number || "", Supplier: line.vendor_name, ...common, "Expense Account": line.chart_account_id || "", "Department / Cost Center": line.cost_center_id || "", Attachment: attachment };
  if (type === "general") return { "Merchant Name": line.vendor_name, Particulars: line.particulars, "Expense Account": line.chart_account_id || "", "Department / Cost Center": line.cost_center_id || "", Amount: Number(line.amount) || 0, Attachment: attachment };
  return { "Merchant Name": line.vendor_name, "Invoice Date": line.invoice_date || "", "Invoice Number": line.invoice_number || "", Particulars: line.particulars, "Expense Account": line.chart_account_id || "", "Department to Be Charged": line.cost_center_id || "", Amount: Number(line.amount) || 0, Attachment: attachment };
}

function apiRequestToPrototype(item) {
  const statusMap = { submitted: ["Department Approval", 3], returned: ["Returned for Information", 2], declined: ["Declined", 2], cancelled: ["Cancelled", 2], archived: ["Archived", 15], draft: ["Draft Request", 1] };
  const [defaultStatus, defaultStep] = statusMap[item.status] || [item.status, 2];
  const currentStep = Number(item.type_data?.demo_current_step) || defaultStep;
  const status = (item.type_data?.demo_display_status || defaultStatus).replace("Payment Preparation", "Payment Preparation").replace("Signatory Approval", "Signatory Approval");
  return {
    id: item.request_number || `DRAFT-${item.id.slice(0, 8).toUpperCase()}`, voucherNumber: item.voucher_number || "", backendId: item.id,
    backendVersion: item.version, backendStatus: item.status, type: item.request_type,
    requestor: item.requestor_name, requestorId: item.requestor_id, department: item.department_name,
    vendor: item.payee_name || item.lines?.find((line) => line.vendor_name)?.vendor_name || "To Be Confirmed",
    amount: Number(item.gross_amount) || 0, budgeted: item.type_data?.budgeted !== false,
    status, currentStep, submitted: item.submitted_at?.slice(0, 10) || item.created_at.slice(0, 10),
    returned: item.status === "returned" ? item.updated_at.slice(0, 10) : "", resubmitted: "",
    documents: item.lines?.reduce((count, line) => count + (line.attachment_refs?.length || 0), 0) || 0,
    missing: 0, currency: item.currency_code, unlocked: item.status === "returned", audit: [], lines: item.lines || [],
    purpose: item.purpose, typeData: item.type_data || {},
    submittedByFinance: item.requestor_name === personas.financeAssociate.name,
    validationAssignee: item.type_data?.validation_assignee || personas.financeAssociate.name,
    bankSubmittedAt: currentStep >= 11 ? item.updated_at : "",
    bankSubmittedBy: currentStep >= 11 ? "Development Finance Associate" : "",
    bankAuthorizedAt: currentStep >= 12 ? item.updated_at : "",
    bankAuthorizedBy: currentStep >= 12 ? "Development Authorized Signatory" : "",
    vendorNotifiedAt: currentStep >= 13 ? item.updated_at : "",
    vendorNotifiedBy: currentStep >= 13 ? "Development Finance Associate" : "",
    pickupAvailableAt: currentStep >= 14 ? item.updated_at : "",
    pickupAvailableBy: currentStep >= 14 ? "Development Finance Associate" : "",
  };
}

function apiRequestToDraft(item) {
  return {
    id: `DRAFT-${item.id.slice(0, 8).toUpperCase()}`, backendId: item.id, backendVersion: item.version,
    type: item.request_type, requestor: item.requestor_name, department: item.department_name,
    savedAt: item.updated_at, createdAt: item.created_at, currency: item.currency_code, otherCurrency: "",
    budgeted: item.type_data?.budgeted !== false,
    liquidationAdvanceAmount: Number(item.type_data?.liquidation_advance_amount) || 0,
    liquidationReturnAmount: Number(item.type_data?.liquidation_return_amount) || 0,
    purpose: item.purpose,
    fields: item.type_data?.fields || { purpose: item.purpose, department_cost_center_id: item.type_data?.department_cost_center_id || "" },
    documents: item.type_data?.documents || {},
    lineItems: (item.lines || []).map((line, index) => ({ ...apiLineToPrototype(item.request_type, line), ...(item.request_type === "reimbursement" ? { "Proof of Payment": item.type_data?.line_document_refs?.[index]?.proof_of_payment || [] } : {}) })), controls: [],
  };
}

async function loadApiPaymentRequests(filters = null) {
  const items = await dataSource.listPaymentRequests(filters || {});
  if (!items) return false;
  let workflowQueue = [];
  let workflowQueueError = "";
  try { workflowQueue = await dataSource.listWorkflowQueue(); }
  catch (error) { workflowQueueError = error.message || "Approval assignments could not be loaded."; }
  const decisions = new Map(await Promise.all(items.filter((item) => ["returned", "declined"].includes(item.status)).map(async (item) => {
    try {
      const history = await dataSource.getPaymentRequestHistory(item.id);
      return [item.id, [...history].reverse().find((entry) => entry.to_status === item.status)?.note || ""];
    } catch { return [item.id, ""]; }
  })));
  const queueById = new Map(workflowQueue.map((entry) => [entry.request_id, entry]));
  const allItems = filters ? items : [...items, ...workflowQueue.filter((entry) => !items.some((item) => item.id === entry.request_id)).map((entry) => entry.request)];
  const stageSteps = { department_head: 3, finance_associate: 4, finance_manager: 5, coo: 7, president: 8, board_member: 8.5 };
  const submitted = allItems.filter((item) => item.status !== "draft").map((item) => {
    const request = { ...apiRequestToPrototype(item), decisionReason: decisions.get(item.id) || "" };
    const workflow = queueById.get(item.id);
    if (workflow && ["active", "information_requested"].includes(workflow.state)) {
      const stage = workflow.route.stages[workflow.current_stage];
      request.currentStep = stageSteps[workflow.assignment_role || stage.role] || request.currentStep;
      request.status = workflow.state === "information_requested" ? `Information Requested by ${stage.role === "board_member" ? "Board" : stage.role === "president" ? "President" : "COO"}` : stage.purpose;
    }
    return request;
  });
  requests.splice(0, requests.length, ...submitted);
  state = {
    ...state,
    conversations: {},
    drafts: filters ? state.drafts : items.filter((item) => item.status === "draft").map(apiRequestToDraft),
    selectedId: submitted.some((item) => item.id === state.selectedId) ? state.selectedId : submitted[0]?.id || null,
    requestsError: "",
    workflowQueue,
    workflowQueueError,
    requestsFiltered: Boolean(filters),
  };
  state = { ...state, ...routeStateFromHash() };
  return true;
}

function backendDocumentCandidates() {
  const draftCandidates = state.drafts.filter((item) => item.backendId).map((item) => ({
    ...item,
    id: item.id,
    vendor: item.fields?.payee_name || "To Be Confirmed",
    amount: draftAmountFor(item),
    backendStatus: item.backendStatus || "draft",
  }));
  return [...draftCandidates, ...requests.filter((item) => item.backendId && item.backendStatus === "returned")];
}

async function loadDocumentData(candidate, force = false) {
  if (!candidate?.backendId || state.documentLoading) return;
  if (!force && state.documentRecords[candidate.backendId] && state.documentRequirements[candidate.backendId]) return;
  state.documentLoading = true;
  state.documentError = "";
  render();
  try {
    const [documents, requirements] = await Promise.all([
      dataSource.listDocuments(candidate.backendId),
      dataSource.getDocumentRequirements(candidate.backendId),
    ]);
    setState({
      documentLoading: false,
      documentRecords: { ...state.documentRecords, [candidate.backendId]: documents || [] },
      documentRequirements: { ...state.documentRequirements, [candidate.backendId]: requirements || { requirements: [], can_submit_documents: true } },
    });
  } catch (error) {
    setState({ documentLoading: false, documentError: error.message || "Documents could not be loaded." });
  }
}

async function saveDocumentFile(candidate, input) {
  const file = input.files?.[0];
  if (!candidate?.backendId || !file) return;
  try {
    if (input.dataset.documentReplace) await dataSource.replaceDocument(input.dataset.documentReplace, file, state.csrfToken);
    else await dataSource.uploadDocument(candidate.backendId, file, input.dataset.documentType || null, input.dataset.documentLine || null, state.csrfToken);
    state.documentRecords = { ...state.documentRecords, [candidate.backendId]: null };
    state.documentRequirements = { ...state.documentRequirements, [candidate.backendId]: null };
    state.toast = successToast(`${file.name} is now attached to this request.`, input.dataset.documentReplace ? "Document replaced" : "Document uploaded");
    await loadDocumentData(candidate, true);
  } catch (error) {
    showErrorToast(error.message, "Unable to upload document");
  }
}

function removeApiDocument(candidate, documentId) {
  openActionPrompt({
    eyebrow: "Document Management",
    title: "Remove this document?",
    message: "The file will no longer be active, but its audit and version history will be retained.",
    inputLabel: "Removal reason",
    placeholder: "Explain why this document is being removed.",
    required: true,
    confirmLabel: "Remove Document",
    danger: true,
    onConfirm: async (reason) => {
      try {
        await dataSource.removeDocument(documentId, reason, state.csrfToken);
        state.documentRecords = { ...state.documentRecords, [candidate.backendId]: null };
        state.documentRequirements = { ...state.documentRequirements, [candidate.backendId]: null };
        state.toast = successToast("The document was removed and its audit history was retained.", "Document removed");
        await loadDocumentData(candidate, true);
      } catch (error) {
        showErrorToast(error.message, "Unable to remove document");
      }
    },
  });
}

async function loadCashAdvanceOptions() {
  if (state.cashAdvanceOptionsLoading || state.cashAdvanceOptions !== null) return;
  if (state.authStatus !== "authenticated") {
    state.cashAdvanceOptions = requests
      .filter((item) => item.type === "cashAdvance" && item.requestor === activeRequestor() && !["Draft Request", "Cancelled", "Archived"].includes(item.status))
      .map((item) => ({ request_number: item.id, amount: item.amount, currency_code: item.currency || "PHP", status: item.status }));
    render();
    return;
  }
  state.cashAdvanceOptionsLoading = true;
  try {
    const options = await dataSource.listOwnCashAdvances();
    if (state.tab === "request" && state.draftType === "liquidation") {
      state.requestFieldBuffer = captureDraftFields();
      state.requestDocumentBuffer = { ...state.requestDocumentBuffer, ...captureDraftDocuments() };
    }
    setState({ cashAdvanceOptions: options || [], cashAdvanceOptionsLoading: false, cashAdvanceOptionsError: "" });
  } catch (error) {
    if (state.tab === "request" && state.draftType === "liquidation") state.requestFieldBuffer = captureDraftFields();
    setState({ cashAdvanceOptions: [], cashAdvanceOptionsLoading: false, cashAdvanceOptionsError: error.message || "Cash advances could not be loaded." });
  }
}

function captureDraftControls() {
  return [...document.querySelectorAll(".request-form-panel input:not([type=file]), .request-form-panel select, .request-form-panel textarea")].map((control) => ({
    value: control.type === "checkbox" ? control.checked : control.value,
    checkbox: control.type === "checkbox",
    disabled: control.disabled,
  }));
}

function captureDraftFields() {
  const fields = Object.fromEntries([...document.querySelectorAll(".request-form-panel [data-request-field]")].map((control) => [
    control.dataset.requestField,
    control.type === "checkbox" ? control.checked : control.value,
  ]));
  const acknowledgement = document.querySelector(".accountability-box input[type=checkbox]");
  if (acknowledgement) fields.accountability_acknowledged = acknowledgement.checked;
  return fields;
}

async function openCashAdvancePolicy(event) {
  event.preventDefault();
  const trigger = event.currentTarget;
  const modal = document.createElement("dialog");
  modal.className = "cash-advance-policy-modal";
  modal.setAttribute("aria-labelledby", "cash-advance-policy-title");
  modal.innerHTML = `<header><h3 id="cash-advance-policy-title">Cash Advance Policy</h3><button type="button" data-close-policy aria-label="Close Cash Advance Policy">×</button></header><div data-policy-content><p>Loading policies…</p></div><footer><button type="button" data-close-policy>Close</button></footer>`;
  document.body.append(modal);
  modal.querySelectorAll("[data-close-policy]").forEach((button) => button.addEventListener("click", () => modal.close()));
  modal.addEventListener("click", (click) => { if (click.target === modal) { const bounds = modal.getBoundingClientRect(); if (click.clientX < bounds.left || click.clientX > bounds.right || click.clientY < bounds.top || click.clientY > bounds.bottom) modal.close(); } });
  modal.addEventListener("close", () => { modal.remove(); trigger.focus(); }, { once: true });
  modal.showModal();
  try {
    const policy = state.authStatus === "authenticated" ? await dataSource.getFinanceRequestPolicy() : { cash_advance_limit_amount: 40000, cash_advance_limit_currency: "PHP", cash_advance_one_outstanding: true, cash_advance_liquidation_days: 15 };
    if (!modal.isConnected) return;
    modal.querySelector("[data-policy-content]").innerHTML = `<ul>
      <li><strong>Amount limit:</strong> Up to ${escapeHtml(money(Number(policy.cash_advance_limit_amount), policy.cash_advance_limit_currency))} for requests in ${escapeHtml(policy.cash_advance_limit_currency)}.</li>
      <li><strong>Outstanding advances:</strong> ${policy.cash_advance_one_outstanding ? "Each requestor may have only one outstanding Cash Advance. Liquidate it before submitting another." : "The one-outstanding-advance restriction is currently disabled."}</li>
      <li><strong>Liquidation deadline:</strong> Liquidate within ${Number(policy.cash_advance_liquidation_days)} calendar days after the event or project. The due date is calculated from the last day of the event.</li>
      <li><strong>Supporting documents:</strong> Upload the required budget, itinerary, or supporting documents shown in the request checklist.</li>
      <li><strong>Unused funds:</strong> Return excess cash directly to Finance and account for the returned amount during liquidation.</li>
      <li><strong>Accountability:</strong> Acknowledge responsibility for the amount received before submitting the request.</li>
      <li><strong>Authority to deduct:</strong> The acknowledgment covers unliquidated or unsubstantiated advances under the company policy and applicable labor laws stated in the form.</li>
    </ul>`;
  } catch {
    if (modal.isConnected) modal.querySelector("[data-policy-content]").textContent = "The current policy settings could not be loaded. Close this window and try again.";
  }
}
function renderSelectedFiles(input, names) {
  const field = input.closest(".line-card-attachments, .upload-row");
  const preview = field?.querySelector(".line-upload-filename");
  if (!preview) return;
  preview.classList.add("file-upload-selection");
  preview.replaceChildren();
  preview.title = "";
  if (!names.length) { preview.textContent = "No files selected"; return; }
  names.forEach((name, index) => {
    const entry = document.createElement("span");
    entry.className = "selected-upload-file";
    const text = document.createElement("span");
    text.textContent = name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-upload-file";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${name}`);
    remove.title = `Remove ${name}`;
    remove.addEventListener("click", () => {
      const remaining = names.filter((_, position) => position !== index);
      const transfer = new DataTransfer();
      [...input.files].forEach((file, position) => { if (position !== index) transfer.items.add(file); });
      input.files = transfer.files;
      if (input.hasAttribute("data-line-row")) updateDraftLineItem(Number(input.dataset.lineRow), input.dataset.lineColumn, remaining);
      else state.requestDocumentBuffer[input.dataset.requestDocument] = remaining;
      state.draftDirty = true;
      renderSelectedFiles(input, remaining);
      refreshValidationPreview();
    });
    entry.append(text, remove);
    preview.append(entry);
  });
}
function captureDraftDocuments() {
  return Object.fromEntries([...document.querySelectorAll(".request-form-panel [data-request-document]")].map((control) => [
    control.dataset.requestDocument,
    [...(control.files || [])].map((file) => file.name),
  ]).filter(([, files]) => files.length));
}

function saveDraft({ silent = false } = {}) {
  const now = new Date().toISOString();
  const existing = state.drafts.find((draft) => draft.id === state.activeDraftId);
  const fields = captureDraftFields();
  state.requestFieldBuffer = fields;
  state.requestDocumentBuffer = { ...state.requestDocumentBuffer, ...captureDraftDocuments() };
  const draft = {
    id: existing?.id || `DRAFT-${new Date().getFullYear()}-${String(state.drafts.length + 1).padStart(4, "0")}`,
    type: state.draftType,
    requestor: activeRequestor(),
    department: state.persona === "financeAssociate" ? "Finance" : "Marketing",
    savedAt: now,
    createdAt: existing?.createdAt || now,
    currency: state.draftCurrency,
    otherCurrency: state.otherCurrency,
    budgeted: state.budgeted,
    liquidationAdvanceAmount: state.liquidationAdvanceAmount,
    liquidationReturnAmount: state.liquidationReturnAmount,
    lineItems: state.lineItemsByType[state.draftType].map((item) => ({ ...item })),
    controls: captureDraftControls(),
    fields,
    documents: { ...(existing?.documents || {}), ...state.requestDocumentBuffer },
    purpose: fields.purpose || existing?.purpose,
    backendId: existing?.backendId,
    backendVersion: existing?.backendVersion,
    backendStatus: existing?.backendStatus,
  };
  state.drafts = existing ? state.drafts.map((item) => item.id === draft.id ? draft : item) : [...state.drafts, draft];
  persistMockDrafts(state.drafts);
  state.activeDraftId = draft.id;
  state.draftDirty = false;
  void persistDraft(draft);
  if (!silent) {
    state.toast = successToast("Your draft has been saved and can be continued later.", "Draft saved");
    render();
  }
}

function restoreDraftControls() {
  const draft = state.drafts.find((item) => item.id === state.activeDraftId);
  if (state.requestMode !== "new") return;
  const fields = draft?.fields || state.requestFieldBuffer;
  if (fields && Object.keys(fields).length) {
    Object.entries(fields).forEach(([key, value]) => {
      const control = document.querySelector(`[data-request-field="${key}"]`);
      if (!control) return;
      if (control.type === "checkbox") control.checked = Boolean(value);
      else control.value = value ?? "";
    });
    const requestor = document.querySelector('[data-request-field="requestor_name"]');
    if (requestor && !requestor.value.trim()) requestor.value = activeRequestor();
    return;
  }
  const controls = [...document.querySelectorAll(".request-form-panel input:not([type=file]), .request-form-panel select, .request-form-panel textarea")];
  (draft?.controls || []).forEach((saved, index) => {
    const control = controls[index];
    if (!control || control.disabled !== saved.disabled) return;
    if (saved.checkbox) control.checked = saved.value;
    else control.value = saved.value;
  });
  const requestor = document.querySelector('[data-request-field="requestor_name"]');
  if (requestor && !requestor.value.trim()) requestor.value = activeRequestor();
}

function openDraft(id) {
  const draft = state.drafts.find((item) => item.id === id);
  if (!draft) return;
  state = {
    ...state,
    activeDraftId: draft.id,
    requestTypeSelection: false,
    draftDirty: false,
    draftType: draft.type,
    draftCurrency: draft.currency,
    otherCurrency: draft.otherCurrency,
    budgeted: draft.budgeted,
    liquidationAdvanceAmount: draft.liquidationAdvanceAmount,
    liquidationReturnAmount: draft.liquidationReturnAmount || 0,
    lineItemsByType: { ...state.lineItemsByType, [draft.type]: draft.lineItems.map((item) => ({ ...item })) },
  };
  navigate(`/requests/new/${draft.type}`);
}

async function submitSavedDraft(id) {
  const draft = state.drafts.find((item) => item.id === id);
  if (!draft) return;
  const activeLines = draft.lineItems.map((row, index) => ({ row, index })).filter(({ row }) => lineRowActive(row, draft.type));
  if (!activeLines.length) {
    showErrorToast("Add and complete at least one request breakdown line.", "Request not submitted");
    return;
  }
  const incomplete = activeLines.map(({ row, index }) => ({ index, missing: paymentTypes[draft.type].lineColumns.find((column) => !(draft.type === "liquidation" && (column === "Attachment" || column === "Receipt" || column === "Proof of Payment")) && !lineFieldComplete(row, column)) })).find(({ missing }) => missing);
  if (incomplete) {
    expandedLineIndex = incomplete.index;
    showErrorToast(`Line ${incomplete.index + 1}: complete ${incomplete.missing} and all other required fields.`, "Request not submitted");
    if (state.activeDraftId === id && state.requestMode === "new") {
      const card = document.querySelector(`[data-line-card="${incomplete.index}"]`);
      if (card) {
        card.open = true;
        card.querySelectorAll("[data-line-column]").forEach((control) => { control.closest(".line-card-field")?.classList.toggle("line-field-required", !lineFieldComplete(draft.lineItems[incomplete.index], control.dataset.lineColumn)); });
        card.querySelector(`[data-line-column="${CSS.escape(incomplete.missing)}"]`)?.focus();
      }
    }
    return;
  }
  let submittedRecord = null;
  if (dataSource.mode !== "mock" && state.authStatus === "authenticated") {
    await persistDraft(draft);
    const persisted = state.drafts.find((item) => item.id === id);
    if (persisted?.backendId) {
      try {
        const submitted = persisted.backendStatus === "returned"
          ? await dataSource.resubmitPaymentRequest(persisted.backendId, persisted.backendVersion, "Returned request updated and resubmitted.", state.csrfToken)
          : await dataSource.submitPaymentRequest(persisted.backendId, persisted.backendVersion, state.csrfToken);
        submittedRecord = submitted;
        if (submitted?.request_number) draft.backendRequestNumber = submitted.request_number;
      } catch (error) {
        showErrorToast(error.message || "The request could not be submitted.", "Request not submitted");
        return;
      }
    }
  }
  const config = paymentTypes[draft.type];
  const sequence = requests.filter((request) => request.type === draft.type).length + 151;
  const idValue = draft.backendRequestNumber || `${config.prefix}-${new Date().getFullYear()}-${String(sequence).padStart(4, "0")}`;
  const vendor = draft.lineItems.find((item) => item["Merchant Name"] || item.Supplier)?.["Merchant Name"] || draft.lineItems.find((item) => item.Supplier)?.Supplier || "To Be Confirmed";
  if (submittedRecord) requests.unshift(apiRequestToPrototype(submittedRecord));
  else requests.unshift({
    id: idValue, type: draft.type, requestor: draft.requestor, department: draft.department, vendor,
    amount: draftAmountFor(draft), budgeted: draft.budgeted, status: "Department Approval", currentStep: 3,
    submitted: new Date().toISOString().slice(0, 10), returned: "", resubmitted: "", documents: 0, missing: 0,
    currency: draft.currency === "OTHER" ? draft.otherCurrency || "PHP" : draft.currency, unlocked: false,
    submittedByFinance: draft.requestor === personas.financeAssociate.name,
    validationAssignee: draft.requestor === personas.financeAssociate.name ? "Jamie Cruz" : "Ms. Rhee",
    audit: [{ action: "Request Submitted", actor: draft.requestor, timestamp: new Date().toISOString(), reason: "Submitted to Department Head from saved draft." }, ...(draft.requestor === personas.financeAssociate.name ? [{ action: "Independent Validator Assigned", actor: "System", timestamp: new Date().toISOString(), reason: "Jamie Cruz assigned because the submitting Finance Associate cannot validate their own request." }] : [])],
    bankSubmittedAt: "", bankSubmittedBy: "", bankAuthorizedAt: "", bankAuthorizedBy: "", vendorNotifiedAt: "", vendorNotifiedBy: "", pickupAvailableAt: "", pickupAvailableBy: "",
  });
  state = { ...state, drafts: state.drafts.filter((item) => item.id !== id), activeDraftId: null, selectedId: idValue, requestMode: "new", cashAdvanceOptions: draft.type === "cashAdvance" ? null : state.cashAdvanceOptions };
  persistMockDrafts(state.drafts);
  navigate(`/requests/${idValue}`);
}

function draftsView() {
  const drafts = state.authStatus === "authenticated" ? state.drafts : state.drafts.filter((draft) => draft.requestor === activeRequestor());
  return `<section class="drafts-view"><div class="metric-detail-actions"><button type="button" class="back-button" data-new-request>← Back to New Request</button></div><section class="panel"><div class="panel-header"><div><span class="eyebrow">Requestor Workspace</span><h3>My Drafts</h3><p>Saved requests remain private until submitted to the department head.</p></div><span class="count">${drafts.length}</span></div><div class="table-wrap"><table><thead><tr><th>Draft</th><th>Type</th><th>Last Saved</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>${drafts.length ? drafts.map((draft) => `<tr><td><strong>${draft.id}</strong></td><td>${paymentTypes[draft.type].label}</td><td>${new Date(draft.savedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</td><td>${money(draftAmountFor(draft), draft.currency)}</td><td>${statusPill("Draft Request")}</td><td><div class="draft-row-actions"><button type="button" data-continue-draft="${draft.id}">Continue Editing</button><button type="button" class="confirmation-button" data-submit-draft="${draft.id}">Submit to Department Head</button><button type="button" class="danger" data-delete-draft="${draft.id}">Delete Draft</button></div></td></tr>`).join("") : `<tr><td colspan="6" class="empty-state">No saved drafts yet. Start a request and choose Save as Draft.</td></tr>`}</tbody></table></div></section></section>`;
}

function requestTypeSelectionView() {
  const descriptions = {
    reimbursement: "Repay employee expenses supported by invoices or official receipts.",
    cashAdvance: "Request funds before an approved activity, trip, or business expense.",
    liquidation: "Account for a previously issued cash advance and any balance due.",
    poPayment: "Pay a supplier against an approved purchase order in the P.O. system.",
    general: "Request non-P.O. vendor, utility, professional, or other general payments.",
  };
  const draftCount = state.authStatus === "authenticated" ? state.drafts.length : state.drafts.filter((draft) => draft.requestor === activeRequestor()).length;
  return `<section class="request-type-selection"><div class="request-navigation-row request-landing-navigation"><span></span><button type="button" data-view-drafts>My Drafts (${draftCount})</button></div><div class="persona-banner"><div><span class="eyebrow">New Request</span><strong>Select a Request Type</strong></div><p>Choose the document you need before entering information. Each request opens as a separate form.</p></div><div class="request-type-card-grid">${Object.entries(paymentTypes).map(([id, config]) => `<button type="button" class="request-type-card" data-select-request-type="${id}"><span class="request-type-icon">${config.prefix}</span><div><h3>${config.label}</h3><p>${descriptions[id]}</p><small>${config.uploadDocuments.length} document requirement${config.uploadDocuments.length === 1 ? "" : "s"}</small></div><strong>Start Request →</strong></button>`).join("")}</div></section>`;
}

function leaveRequestModal() {
  if (!state.leaveRequestTarget) return "";
  return `<div class="correction-modal-backdrop" data-leave-request-backdrop><section class="correction-modal" role="dialog" aria-modal="true" aria-labelledby="leave-request-title"><div><span class="eyebrow">Unsaved Request</span><h3 id="leave-request-title">Leave this request form?</h3><p>Choose what to do with the information entered in this ${paymentTypes[state.draftType].label} request.</p></div><div class="leave-request-actions"><button type="button" class="confirmation-button" data-save-and-leave>Save as Draft and Leave</button><button type="button" class="danger" data-discard-and-leave>Discard and Leave</button><button type="button" data-continue-editing>Continue Editing</button></div></section></div>`;
}

function personaRequests(persona = state.persona) {
  const submittedRequests = requests.filter((request) => request.currentStep !== 1 && request.status !== "Draft Request");
  if (state.authStatus === "authenticated") return submittedRequests;
  if (persona === "requestor") return submittedRequests.filter((request) => request.requestor === personas.requestor.name);
  if (persona === "coo") return submittedRequests.filter((request) => request.currentStep === 7);
  if (persona === "president") return submittedRequests.filter((request) => request.currentStep === 8);
  if (persona === "boardMember") return submittedRequests.filter((request) => request.currentStep === 8.5);
  return submittedRequests;
}

function approvalRequests(persona = state.persona) {
  const assignedIds = state.authStatus === "authenticated" ? new Set(state.workflowQueue.map((entry) => entry.request_id)) : null;
  const activeRequests = requests.filter((request) => !request.backendId || request.backendStatus === "submitted" && assignedIds.has(request.backendId));
  if (persona === "departmentHead") return activeRequests.filter((request) => request.currentStep === 3);
  if (persona === "authorizedSignatory") return activeRequests.filter((request) => request.currentStep === 11);
  if (persona === "financeAssociate") return activeRequests.filter((request) => [4, 9, 10, 12, 13].includes(request.currentStep) && (request.currentStep !== 4 || request.validationAssignee === personas.financeAssociate.name));
  if (persona === "financeManager") return activeRequests.filter((request) => request.currentStep === 5);
  if (persona === "coo") return activeRequests.filter((request) => request.currentStep === 7);
  if (persona === "president") return activeRequests.filter((request) => request.currentStep === 8);
  if (persona === "boardMember") return activeRequests.filter((request) => request.currentStep === 8.5);
  if (persona === "requestor") return [];
  return activeRequests;
}

const requestTypeLabels = {
  reimbursement: "Reimbursement", cashAdvance: "Cash Advance", liquidation: "Liquidation",
  poPayment: "Purchase Order Payment", general: "General Payment",
};

async function loadRequirementRules() {
  if (state.requirementRulesLoading || !state.authUser) return;
  state.requirementRulesLoading = true;
  state.requirementRulesError = "";
  render();
  try {
    const [rules, documentTypes] = await Promise.all([dataSource.listDocumentRules(), dataSource.listMasterData("document-types")]);
    setState({ requirementRules: rules, requirementDocumentTypes: documentTypes, requirementRulesLoaded: true, requirementRulesLoading: false });
  } catch (error) {
    const message = error.status === 403 ? "Only Finance Managers and System Administrators can manage request requirements." : error.message;
    setState({ requirementRulesLoading: false, requirementRulesError: message, toast: errorToast(message, "Requirements unavailable") });
  }
}

function requirementRuleModal() {
  const edit = state.requirementRuleEdit;
  if (!edit) return "";
  const item = state.requirementRules.find((rule) => rule.id === edit.id);
  const isEdit = Boolean(item);
  const value = (key, fallback = "") => item?.[key] ?? fallback;
  return `<div class="identity-modal-backdrop" data-requirement-modal-backdrop><section class="identity-modal" role="dialog" aria-modal="true" aria-labelledby="requirement-modal-title"><div class="identity-modal-header"><div><span class="eyebrow">Administration</span><h3 id="requirement-modal-title">${isEdit ? "Edit" : "Add"} document requirement</h3><p>Required rules block submission. Conditional rules remain visible without blocking the request.</p></div><button type="button" class="identity-modal-close" data-cancel-requirement-edit aria-label="Close">×</button></div><form data-requirement-rule-form>
    <label>Request type<select name="request_type" required>${Object.entries(requestTypeLabels).map(([id, label]) => `<option value="${id}" ${value("request_type", "reimbursement") === id ? "selected" : ""}>${label}</option>`).join("")}</select></label>
    <label>Document type<select name="document_type_id" required><option value="">Select a document type</option>${state.requirementDocumentTypes.filter((type) => type.is_active !== false).map((type) => `<option value="${type.id}" ${value("document_type_id") === type.id ? "selected" : ""}>${escapeHtml(type.name)} (${escapeHtml(type.code)})</option>`).join("")}</select></label>
    <label>Applies to<select name="scope"><option value="request" ${value("scope", "request") === "request" ? "selected" : ""}>Whole request</option><option value="line" ${value("scope") === "line" ? "selected" : ""}>Every request line</option></select></label>
    <label>Minimum files<input name="minimum_count" type="number" min="1" max="100" value="${value("minimum_count", 1)}" required></label>
    <label class="identity-checkbox"><input name="is_required" type="checkbox" ${value("is_required", true) ? "checked" : ""}> Required for submission</label>
    <label>Conditional guidance<input name="guidance" maxlength="200" value="${escapeHtml(value("guidance"))}" placeholder="For example: If available or If new supplier"></label>
    <label class="identity-checkbox"><input name="is_active" type="checkbox" ${value("is_active", true) ? "checked" : ""}> Active rule</label>
    <div class="identity-form-actions"><button type="button" data-cancel-requirement-edit>Cancel</button><button class="primary-button" type="submit">${isEdit ? "Save changes" : "Add requirement"}</button></div>
  </form></section></div>`;
}

function requestRequirementsPage() {
  if (state.requirementRulesLoading) return `<section class="identity-page"><div class="auth-loading" aria-label="Loading request requirements"></div></section>`;
  if (state.requirementRulesError) return `<section class="identity-page"><p class="auth-error">${escapeHtml(state.requirementRulesError)}</p></section>`;
  const documentName = (id) => state.requirementDocumentTypes.find((type) => type.id === id)?.name || "Unknown document type";
  const rows = state.requirementRules.length ? state.requirementRules.map((rule) => `<article><div><strong>${escapeHtml(documentName(rule.document_type_id))}</strong><small>${escapeHtml(requestTypeLabels[rule.request_type] || rule.request_type)} · ${rule.scope === "line" ? "Every line" : "Whole request"}</small></div><div><span>${rule.is_required ? "Required" : "Conditional"}</span><small>${escapeHtml(rule.guidance || `Minimum ${rule.minimum_count} file${rule.minimum_count === 1 ? "" : "s"}`)}</small></div><span class="status-pill ${rule.is_active ? "success" : "danger"}">${rule.is_active ? "Active" : "Inactive"}</span><div class="identity-action-menu"><button type="button" class="identity-action-trigger" data-identity-action-menu aria-label="Actions for ${escapeHtml(documentName(rule.document_type_id))}" aria-expanded="false">⋮</button><div class="identity-action-popover" data-identity-action-popover hidden><button type="button" data-edit-requirement-rule="${rule.id}">Edit</button></div></div></article>`).join("") : `<div class="empty-state"><strong>No requirements configured</strong><p>Requests remain non-blocking until an active required rule is added.</p></div>`;
  return `<section class="identity-page"><section class="panel"><div class="panel-header"><div><h3>Request Requirements</h3><p>Configure required and conditional documents for each payment request type.</p></div><div class="identity-header-actions"><button type="button" class="primary-button" data-add-requirement-rule>+ Requirement</button></div></div><div class="identity-list">${rows}</div></section></section>${requirementRuleModal()}`;
}

function bindRequirementRules() {
  if (state.tab !== "requestRequirements") return;
  const close = () => setState({ requirementRuleEdit: null });
  document.querySelector("[data-add-requirement-rule]")?.addEventListener("click", () => setState({ requirementRuleEdit: { id: null } }));
  document.querySelectorAll("[data-edit-requirement-rule]").forEach((button) => button.addEventListener("click", () => setState({ requirementRuleEdit: { id: button.dataset.editRequirementRule } })));
  document.querySelectorAll("[data-cancel-requirement-edit]").forEach((button) => button.addEventListener("click", close));
  document.querySelector("[data-requirement-modal-backdrop]")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) close(); });
  document.querySelector("[data-requirement-rule-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = { request_type: form.get("request_type"), document_type_id: form.get("document_type_id"), scope: form.get("scope"), minimum_count: Number(form.get("minimum_count")), is_required: form.get("is_required") === "on", guidance: String(form.get("guidance") || "").trim() || null, is_active: form.get("is_active") === "on" };
    try {
      if (state.requirementRuleEdit.id) await dataSource.updateDocumentRule(state.requirementRuleEdit.id, payload, state.csrfToken);
      else await dataSource.createDocumentRule(payload, state.csrfToken);
      state.requirementRuleEdit = null;
      state.requirementRulesLoaded = false;
      state.toast = successToast("The document requirement was saved and will be applied to submission checks.", "Requirement saved");
      await loadRequirementRules();
    } catch (error) { setState({ toast: errorToast(error.message, "Unable to save requirement") }); }
  });
}

async function loadRequestSettings() {
  state.requestSettingsLoading = true;
  state.requestSettingsError = "";
  render();
  try {
    const [requestNumbering, reimbursementBatchSetting, financePolicySetting] = await Promise.all([
      dataSource.getRequestNumberingSetting(), dataSource.getReimbursementBatchSetting(), dataSource.getFinanceRequestPolicy(),
    ]);
    setState({ requestNumbering, reimbursementBatchSetting, financePolicySetting, requestSettingsLoading: false });
  } catch (error) {
    setState({ requestSettingsLoading: false, requestSettingsError: error.message, toast: errorToast(error.message, "Settings unavailable") });
  }
}

function canManageRequestSettings() {
  return ["all", "financeManager"].includes(state.persona)
    || state.authUser?.roles?.some((role) => ["system_administrator", "finance_manager"].includes(role));
}

function requestSettingsPage() {
  if (state.requestSettingsLoading) return `<section class="identity-page"><div class="auth-loading" aria-label="Loading request settings"></div></section>`;
  if (state.requestSettingsError) return `<section class="identity-page"><p class="auth-error">${escapeHtml(state.requestSettingsError)}</p></section>`;
  if (!state.requestNumbering || !state.reimbursementBatchSetting || !state.financePolicySetting) return `<section class="identity-page"><div class="auth-loading" aria-label="Preparing request settings"></div></section>`;
  const editable = canManageRequestSettings();
  const disabled = editable ? "" : "disabled";
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const cutoffs = state.reimbursementBatchSetting.cutoff_days || [15, 30];
  return `<section class="identity-page"><div class="identity-section-stack">
    ${editable ? "" : `<div class="independent-validation-notice"><div><span class="eyebrow">View only</span><strong>Finance schedule settings</strong></div><p>Finance Managers and System Administrators can change these settings.</p></div>`}
    <section class="panel"><div class="panel-header"><div><h3>Request Numbering</h3><p>Choose when numbering restarts for the new academic year. Existing request numbers do not change.</p></div></div><form data-numbering-settings class="identity-form numbering-settings-form"><label>Academic year starts<select name="reset_month" ${disabled}>${months.map((month, index) => `<option value="${index + 1}" ${state.requestNumbering.reset_month === index + 1 ? "selected" : ""}>${month}</option>`).join("")}</select></label><div class="numbering-settings-summary"><div><span>Current academic year</span><strong>${escapeHtml(state.requestNumbering.current_academic_year)}</strong></div><small>Next sequence example: ${escapeHtml(state.requestNumbering.number_preview)}</small></div>${editable ? `<button type="submit" class="primary-button">Save numbering</button>` : ""}</form></section>
    <section class="panel"><div class="panel-header"><div><h3>Reimbursement Batches</h3><p>Set the monthly processing cutoffs. Late submissions automatically carry into the next configured batch.</p></div></div><form data-reimbursement-batches class="identity-form numbering-settings-form"><div class="field-grid"><label>First cutoff day<input name="cutoff_day" type="number" min="1" max="31" value="${cutoffs[0] || 15}" ${disabled} required></label><label>Second cutoff day<input name="cutoff_day" type="number" min="1" max="31" value="${cutoffs[1] || 30}" ${disabled} required></label></div><div class="numbering-settings-summary"><div><span>Month-end handling</span><strong>Use the last calendar day</strong></div><small>If a configured day does not exist in a month, that batch runs on month-end. Low-value expenses remain Reimbursement requests.</small></div>${editable ? `<button type="submit" class="primary-button">Save batch schedule</button>` : ""}</form></section>
    <section class="panel"><div class="panel-header"><div><h3>Finance Request Policies</h3><p>Configure the request rules Finance may revise without a code deployment.</p></div></div><form data-finance-policies class="identity-form numbering-settings-form"><div class="field-grid"><label>Cash Advance limit<input name="cash_advance_limit_amount" type="number" min="0.01" step="0.01" value="${escapeHtml(state.financePolicySetting.cash_advance_limit_amount)}" ${disabled} required></label><label>Limit currency<input name="cash_advance_limit_currency" value="${escapeHtml(state.financePolicySetting.cash_advance_limit_currency)}" maxlength="3" pattern="[A-Z]{3}" ${disabled} required></label><label>Liquidation deadline (calendar days)<input name="cash_advance_liquidation_days" type="number" min="1" max="365" value="${state.financePolicySetting.cash_advance_liquidation_days}" ${disabled} required></label><label>Reimbursement invoice age (calendar days)<input name="reimbursement_invoice_age_days" type="number" min="1" max="365" value="${state.financePolicySetting.reimbursement_invoice_age_days}" ${disabled} required></label><label>Older-invoice handling<select name="reimbursement_invoice_age_action" ${disabled}><option value="warning" ${state.financePolicySetting.reimbursement_invoice_age_action === "warning" ? "selected" : ""}>Accept with Finance warning</option><option value="block" ${state.financePolicySetting.reimbursement_invoice_age_action === "block" ? "selected" : ""}>Block submission</option><option value="none" ${state.financePolicySetting.reimbursement_invoice_age_action === "none" ? "selected" : ""}>No system check</option></select></label><label class="checkbox-field"><input name="cash_advance_one_outstanding" type="checkbox" ${state.financePolicySetting.cash_advance_one_outstanding ? "checked" : ""} ${disabled}> Limit each requestor to one outstanding Cash Advance</label></div><div class="numbering-settings-summary"><div><span>Change behavior</span><strong>Applies to future submission checks</strong></div><small>Existing request and voucher numbers never change. Submitted records retain their saved values and audit evidence. Updates are restricted to Finance Managers and System Administrators.</small></div>${editable ? `<button type="submit" class="primary-button">Save finance policies</button>` : ""}</form></section>
  </div></section>`;
}

function bindRequestSettings() {
  if (state.tab !== "requestSettings" || !canManageRequestSettings()) return;
  document.querySelector("[data-numbering-settings]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await dataSource.updateRequestNumberingSetting(Number(new FormData(event.currentTarget).get("reset_month")), state.csrfToken);
      state.requestNumbering = await dataSource.getRequestNumberingSetting();
      setState({ toast: successToast("The academic-year numbering schedule was updated.", "Numbering saved") });
    } catch (error) { setState({ toast: errorToast(error.message, "Unable to save numbering") }); }
  });
  document.querySelector("[data-reimbursement-batches]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const cutoffDays = new FormData(event.currentTarget).getAll("cutoff_day").map(Number);
    if (new Set(cutoffDays).size !== cutoffDays.length) {
      setState({ toast: errorToast("Choose two different cutoff days.", "Schedule not saved") });
      return;
    }
    try {
      state.reimbursementBatchSetting = await dataSource.updateReimbursementBatchSetting(cutoffDays, state.csrfToken);
      setState({ toast: successToast("Late reimbursements will carry into the next configured batch.", "Batch schedule saved") });
    } catch (error) { setState({ toast: errorToast(error.message, "Unable to save batch schedule") }); }
  });
  document.querySelector("[data-finance-policies]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      cash_advance_limit_amount: String(form.get("cash_advance_limit_amount")),
      cash_advance_limit_currency: String(form.get("cash_advance_limit_currency")).toUpperCase(),
      cash_advance_one_outstanding: form.get("cash_advance_one_outstanding") === "on",
      cash_advance_liquidation_days: Number(form.get("cash_advance_liquidation_days")),
      reimbursement_invoice_age_days: Number(form.get("reimbursement_invoice_age_days")),
      reimbursement_invoice_age_action: String(form.get("reimbursement_invoice_age_action")),
    };
    try {
      state.financePolicySetting = await dataSource.updateFinanceRequestPolicy(payload, state.csrfToken);
      setState({ toast: successToast("Future submission checks will use the updated rules. Existing submitted records remain unchanged.", "Finance policies saved") });
    } catch (error) { setState({ toast: errorToast(error.message, "Unable to save finance policies") }); }
  });
}

const administrationTabs = [
  ["users", "Users"], ["roles", "Roles & Permissions"], ["departments", "Departments"],
  ["costCenters", "Cost Centers"], ["vendors", "Vendors"], ["accounts", "Chart of Accounts"],
  ["taxCodes", "Tax Codes"], ["currencies", "Currencies"], ["paymentMethods", "Payment Methods"],
  ["documentTypes", "Document Types"], ["requestRequirements", "Request Requirements"], ["requestSettings", "Request Settings"],
];
const financeAdministrationTabs = administrationTabs.filter(([id]) => !["users", "roles", "departments"].includes(id));

function administrationWorkspace(content) {
  const isSystemAdministrator = state.persona === "all" || state.authUser?.roles?.includes("system_administrator");
  const isFinanceManager = state.persona === "financeManager" || state.authUser?.roles?.includes("finance_manager");
  const isFinanceAssociate = state.persona === "financeAssociate" || state.authUser?.roles?.includes("finance_associate");
  const visibleTabs = isSystemAdministrator ? administrationTabs : isFinanceManager ? financeAdministrationTabs : isFinanceAssociate ? [["requestSettings", "Request Settings"]] : [];
  if (!visibleTabs.some(([id]) => id === state.tab)) return content;
  const description = isSystemAdministrator
    ? "Manage identity, access, departments, and financial reference data."
    : "Manage the financial reference data used throughout payment processing.";
  return `<section class="administration-workspace"><div class="administration-workspace-heading"><span class="eyebrow">${isSystemAdministrator ? "System Settings" : "Finance Settings"}</span><h3>Administration</h3><p>${description}</p></div><label class="administration-mobile-select">Administration section<select data-administration-select>${visibleTabs.map(([id, label]) => `<option value="${id}" ${state.tab === id ? "selected" : ""}>${label}</option>`).join("")}</select></label><nav class="administration-tabs" aria-label="Administration settings">${visibleTabs.map(([id, label]) => `<button type="button" data-tab="${id}" class="${state.tab === id ? "active" : ""}">${label}</button>`).join("")}</nav>${content}</section>`;
}

function canViewAdminReference() {
  return state.authUser ? state.authUser.roles?.includes("system_administrator") === true : dataSource.mode === "mock" && state.persona === "all";
}

function shell(content) {
  const allNavGroups = [
    ["Overview", [["dashboard", "Dashboard", "▦"]]],
    ["Requests", [["request", "New Request", "+"], ["uploads", "Document Uploads", "↑"], ["documents", "Document Rules", "□"]]],
    ["Processing", [["approvals", "Approval Queue", "✓"], ["tracker", "Payment Tracker", "↗"]]],
    ["Records", [["emails", "Email Samples", "@"]]],
    ["Settings", [["users", "Administration", "⚙"]]],
    ["Help", [["guide", "System Guide", "?"]]],
  ];
  const personaNav = {
    requestor: [["Overview", [["dashboard", "My Dashboard", "◦"]]], ["Requests", [["request", "New Request", "+"], ["uploads", "Document Uploads", "↑"]]], ["Tracking", [["tracker", "My Payment Tracker", "↗"]]], ["Help", [["guide", "System Guide", "?"]]]],
    departmentHead: [["Overview", [["dashboard", "Department Dashboard", "◦"]]], ["Approvals", [["approvals", "Approval Queue", "✓"]]], ["Tracking", [["tracker", "Department Requests", "↗"]]], ["Help", [["guide", "System Guide", "?"]]]],
    authorizedSignatory: [["Overview", [["dashboard", "Authorization Dashboard", "◦"]]], ["Authorizations", [["approvals", "Signatory Approval Queue", "✓"]]], ["Tracking", [["tracker", "Authorized Payments", "↗"]]], ["Help", [["guide", "System Guide", "?"]]]],
    financeAssociate: [["Overview", [["dashboard", "Finance Dashboard", "◦"]]], ["Requests", [["request", "New Request", "+"]]], ["Processing", [["approvals", "Approval Queue", "✓"], ["tracker", "Payment Tracker", "↗"]]], ["Reference", [["documents", "Document Rules", "□"], ["emails", "Email Samples", "@"]]], ["Settings", [["requestSettings", "Request Settings", "⚙"]]], ["Help", [["guide", "System Guide", "?"]]]],
    financeManager: [["Overview", [["dashboard", "Finance Overview", "◦"]]], ["Processing", [["approvals", "Approval Queue", "✓"], ["tracker", "All Requests", "↗"]]], ["Settings", [["costCenters", "Administration", "⚙"]]], ["Help", [["guide", "System Guide", "?"]]]],
    coo: [["Overview", [["dashboard", "Executive Dashboard", "◦"]]], ["Approvals", [["approvals", "Approval Queue", "✓"]]], ["Help", [["guide", "System Guide", "?"]]]],
    president: [["Overview", [["dashboard", "Executive Dashboard", "◦"]]], ["Approvals", [["approvals", "Approval Queue", "✓"]]], ["Help", [["guide", "System Guide", "?"]]]],
    boardMember: [["Overview", [["dashboard", "Board Dashboard", "◦"]]], ["Approvals", [["approvals", "Board Approval Queue", "✓"]]], ["Help", [["guide", "System Guide", "?"]]]],
  };
  const navGroups = (personaNav[state.persona] || allNavGroups)
    .map(([label, items]) => [label, items.filter(([id]) => !["documents", "emails"].includes(id))])
    .filter(([, items]) => items.length);
  if (canViewAdminReference()) navGroups.splice(navGroups.length - 1, 0, ["Reference", [["documents", "Document Rules", "□"], ["emails", "Email Samples", "@"]]]);
  const persona = personas[state.persona];
  const displayName = state.authUser?.display_name || persona.name;
  const displayRole = state.authUser?.roles?.map((role) => role.replaceAll("_", " ")).join(", ") || persona.label;
  const initials = displayName.split(" ").map((part) => part[0]).slice(0, 2).join("");
  const titles = { dashboard: "Payment Requests", request: "Create Payment Request", requestDetail: "Request Details", approvals: "Review and Approve", tracker: "Tracker and Reports", uploads: "Upload Required Documents", documents: "Required Documents", emails: "Workflow Email Samples", guide: "System Guide", users: "User Administration", roles: "Roles & Permissions", departments: "Departments", costCenters: "Cost Centers", vendors: "Vendors", accounts: "Chart of Accounts", taxCodes: "Tax Codes", currencies: "Currencies", paymentMethods: "Payment Methods", documentTypes: "Document Types", requestRequirements: "Request Requirements", requestSettings: "Request Settings" };
  return `
    <div class="app-shell ${state.mobileNavOpen ? "nav-open" : ""}">
      <button type="button" class="sidebar-backdrop" data-close-mobile-nav aria-label="Close navigation"></button>
      <aside class="sidebar" id="primarySidebar" aria-hidden="${!state.mobileNavOpen}">
        <div class="sidebar-mobile-header"><span>Navigation</span><button type="button" data-close-mobile-nav aria-label="Close navigation">×</button></div>
        <div class="brand-block"><div class="brand-mark" aria-hidden="true">AP</div><div><h1>Automated Payment System</h1><p>Finance Operations</p><div class="brand-api-status backend-${state.backendStatus.state}"><span class="sidebar-status-icon" aria-hidden="true">${state.backendStatus.state === "connected" ? "✓" : state.backendStatus.state === "unavailable" ? "!" : "•"}</span><span>${state.backendStatus.label}</span></div></div></div>
        <nav class="nav-list" aria-label="Primary">${navGroups.map(([group, links]) => `<div class="nav-group"><span class="nav-group-label">${group}</span><div class="nav-group-links">${links.map(([id, label, icon]) => `<button data-tab="${id}" class="${state.tab === id ? "active" : ""}"><span>${icon}</span>${label}</button>`).join("")}</div></div>`).join("")}</nav>
        <div class="sidebar-footer-stack">
          ${state.authUser ? `<div class="sidebar-account"><button type="button" class="sidebar-account-trigger" data-account-menu aria-expanded="false" aria-controls="sidebarAccountMenu"><span class="sidebar-account-avatar">${initials}</span><span class="sidebar-account-copy"><strong>${displayName}</strong><small>${displayRole}</small></span><span class="sidebar-account-chevron" aria-hidden="true">⌃</span></button><div class="sidebar-account-menu" id="sidebarAccountMenu" data-account-menu-panel hidden><button type="button" data-logout>Sign out</button></div></div>` : ""}
        </div>
      </aside>
      <main class="${state.tab === "guide" ? "guide-main" : ""}">
        <header class="topbar"><div class="mobile-title-row"><button type="button" class="hamburger-button icon-button" data-open-mobile-nav aria-label="Open navigation" aria-controls="primarySidebar" aria-expanded="${state.mobileNavOpen}"><span></span><span></span><span></span></button><div><h2>${titles[state.tab]}</h2><p>${persona.subtitle}</p></div></div><div class="topbar-actions"><label class="shell-search"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input type="search" aria-label="Search payment application" placeholder="Search" /></label><button type="button" class="icon-button notification-button" data-toggle-notifications aria-label="Notifications${state.notifications.unread_count ? `, ${state.notifications.unread_count} unread` : ""}" aria-expanded="${state.notificationsOpen}" title="Notifications"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>${state.notifications.unread_count ? `<span class="notification-count">${Math.min(state.notifications.unread_count, 99)}${state.notifications.unread_count > 99 ? "+" : ""}</span>` : ""}</button><button type="button" class="theme-toggle icon-button" data-theme-toggle aria-label="Switch to ${state.theme === "dark" ? "light" : "dark"} mode" title="Switch to ${state.theme === "dark" ? "light" : "dark"} mode" aria-pressed="${state.theme === "dark"}">${state.theme === "dark" ? `<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg>` : `<svg aria-hidden="true" viewBox="0 0 24 24"><path class="moon-fill" d="M20.2 15.45A8.75 8.75 0 0 1 8.55 3.8 9 9 0 1 0 20.2 15.45Z"/></svg>`}</button></div>${notificationPanel()}</header>
        ${administrationWorkspace(content)}
        ${unlockRequestModal()}
      </main>
    </div>${toastView()}${actionPromptModal()}`;
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
  return `<section class="panel"><div class="panel-header"><h3>Live Requests</h3><span class="count">${rows.length}</span></div><div class="table-wrap responsive-request-table"><table><thead><tr>${headers}</tr></thead><tbody>
    ${rows.length ? rows.map((r) => `<tr data-request="${r.id}" class="${state.selectedId === r.id ? "selected" : ""}">${combineStepStatus ? `<td data-label="Status"><div class="step-status-cell">${statusPill(r.status)}</div></td><td data-label="Submitted">${r.submitted}</td><td data-label="Aging"><span class="aging-badge ${agingDays(r) > 30 ? "overdue" : ""}">${agingDays(r)}d</span></td><td data-label="Request"><strong>${r.id}</strong></td><td data-label="Type">${paymentTypes[r.type].label}</td><td data-label="Amount">${requestMoney(r)}</td>` : `<td data-label="Step">${stepLabel(r.currentStep)}</td><td data-label="Submitted">${r.submitted}</td><td data-label="Aging"><span class="aging-badge ${agingDays(r) > 30 ? "overdue" : ""}">${agingDays(r)}d</span></td><td data-label="Request"><strong>${r.id}</strong></td><td data-label="Type">${paymentTypes[r.type].label}</td><td data-label="Amount">${requestMoney(r)}</td><td data-label="Status">${statusPill(r.status)}</td>`}</tr>`).join("") : `<tr><td colspan="${combineStepStatus ? 6 : 7}" class="empty-state">No requests match the selected filters.</td></tr>`}
  </tbody></table></div></section>`;
}

function liveRequestList(rows) {
  const list = `<div class="table-wrap live-request-list"><table><thead><tr><th>Status</th><th>Submitted</th><th>Aging</th><th>Voucher</th><th>Type</th><th>Requestor</th><th>Department</th><th>Payee</th><th>Amount</th></tr></thead><tbody>${rows.length ? rows.map((r) => `<tr data-request="${r.id}" tabindex="0"><td>${statusPill(r.status)}</td><td>${r.submitted}</td><td><span class="aging-badge ${agingDays(r) > 30 ? "overdue" : ""}">${agingDays(r)}d</span></td><td><strong>${r.id}</strong></td><td>${paymentTypes[r.type].label}</td><td>${r.requestor}</td><td>${r.department}</td><td>${r.vendor}</td><td>${requestMoney(r)}</td></tr>`).join("") : `<tr><td colspan="9" class="empty-state">No requests match the selected filters.</td></tr>`}</tbody></table></div>`;
  return `<section class="panel live-request-panel"><div class="panel-header"><div><span class="eyebrow">Transaction Overview</span><h3>Live Requests</h3><p>Select a request from the list to display it in the preview pane.</p></div><span class="count">${rows.length}</span></div>${list}</section>`;
}

function dashboardPreviewAction(request) {
  if (state.persona === "requestor") return request.currentStep <= 2
    ? { label: "Manage Request Documents", route: "/documents/uploads" }
    : { label: "View Request", route: `/requests/${request.id}` };
  if (state.persona === "financeAssociate") {
    if (request.currentStep === 4) return { label: "Open Document Validation", route: `/requests/${request.id}` };
    if (request.currentStep === 9) return { label: "Open Voucher Creation", route: `/requests/${request.id}` };
    if (request.currentStep === 10) return { label: "Open Payment Preparation", route: `/requests/${request.id}` };
    if (request.currentStep === 12) return { label: "Open Vendor Notification", route: `/requests/${request.id}` };
    if (request.currentStep === 13) return { label: "Open Payment Release", route: `/requests/${request.id}` };
    if (request.currentStep === 14) return { label: "Open Payment Tracker", route: `/requests/${request.id}` };
    return { label: "Review Request", route: `/requests/${request.id}` };
  }
  if (state.persona === "departmentHead") return request.currentStep === 3
    ? { label: "Review and Approve", route: `/requests/${request.id}` }
    : { label: "Review Request", route: `/requests/${request.id}` };
  if (state.persona === "authorizedSignatory") return request.currentStep === 11
    ? { label: "Authorize Payment", route: `/requests/${request.id}` }
    : { label: "Review Payment", route: `/requests/${request.id}` };
  if (state.persona === "financeManager") return request.currentStep === 5
    ? { label: "Review and Approve", route: `/requests/${request.id}` }
    : { label: "Review Request", route: `/requests/${request.id}` };
  if (state.persona === "coo") return request.currentStep === 7
    ? { label: "Complete COO Approval", route: `/requests/${request.id}` }
    : { label: "Review Request", route: `/requests/${request.id}` };
  if (state.persona === "president") return request.currentStep === 8
    ? { label: "Complete President Approval", route: `/requests/${request.id}` }
    : { label: "Review Request", route: `/requests/${request.id}` };
  if (state.persona === "boardMember") return request.currentStep === 8.5
    ? { label: "Complete Board Approval", route: `/requests/${request.id}` }
    : { label: "Review Request", route: `/requests/${request.id}` };
  const stageRoutes = `/requests/${request.id}`;
  return { label: "Open Current Action", route: stageRoutes };
}

function dashboardRequestPreview(request) {
  if (!request) return `<aside class="panel dashboard-preview-pane empty-dashboard-preview"><span class="eyebrow">Request Preview</span><h3>No Request Selected</h3><p>Adjust the filters or select a request to preview its details.</p></aside>`;
  const owner = steps.find(([id]) => id === request.currentStep)?.[2] || "System";
  const roleAction = dashboardPreviewAction(request);
  return `<aside class="panel dashboard-preview-pane" aria-live="polite">
    <div class="panel-header"><div><span class="eyebrow">Request Preview</span><h3>${request.id}</h3><p>${paymentTypes[request.type].label} · ${request.department}</p></div>${statusPill(request.status)}</div>
    <div class="preview-amount"><span>Transaction Amount</span><strong>${requestMoney(request)}</strong></div>
    <dl class="preview-detail-list"><div><dt>Requestor</dt><dd>${request.requestor}</dd></div><div><dt>Payee</dt><dd>${request.vendor}</dd></div><div><dt>Submitted</dt><dd>${request.submitted}</dd></div><div><dt>Aging</dt><dd>${agingDays(request)} day${agingDays(request) === 1 ? "" : "s"}</dd></div><div><dt>Current Owner</dt><dd>${owner}</dd></div><div><dt>Documents</dt><dd>${request.documents} attached · ${request.missing} missing</dd></div></dl>
    <div class="preview-route"><span>Routing Threshold</span><strong>${route(request)}</strong></div>
    <div class="dashboard-preview-actions"><button type="button" class="confirmation-button preview-role-action" data-preview-action-route="${roleAction.route}">${roleAction.label}</button><button type="button" data-open-dashboard-full="${request.id}">View Details</button><button type="button" data-view-workflow="${request.id}">View Workflow</button></div>
  </aside>`;
}
function workflowSummary(r) {
  const currentIndex = Math.max(0, steps.findIndex(([id]) => id === r.currentStep));
  const current = steps[currentIndex];
  const previous = currentIndex > 0 ? steps[currentIndex - 1] : null;
  const next = currentIndex < steps.length - 1 ? steps[currentIndex + 1] : null;
  const progress = Math.round(((currentIndex + 1) / steps.length) * 100);
  return `<details class="workflow-summary responsive-disclosure" ${window.matchMedia("(min-width: 640px)").matches ? "open" : ""}><summary><span><span class="eyebrow">Workflow Progress</span><strong>${current[1]}</strong><small>${current[2]} · ${currentIndex + 1} of ${steps.length} stages</small></span><span class="disclosure-label">Details</span></summary><div class="workflow-summary-content"><div class="workflow-summary-heading"><button type="button" data-view-workflow="${r.id}">View Full Workflow</button></div><div class="workflow-progress-bar" aria-label="${progress}% complete"><span style="width:${progress}%"></span></div><div class="workflow-summary-stages"><div><span>Previous</span><strong>${previous ? previous[1] : "None"}</strong></div><div class="current"><span>Current</span><strong>${current[1]}</strong></div><div><span>Next</span><strong>${next ? next[1] : "Complete"}</strong></div></div></div></details>`;
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
  return `<details class="request-activity responsive-disclosure" ${window.matchMedia("(min-width: 640px)").matches ? "open" : ""}><summary><span><span class="eyebrow">Request History</span><strong>Request Activity</strong><small>${activities.length} recorded events</small></span><span class="disclosure-label">Latest events</span></summary><div class="request-activity-content"><div class="request-activity-heading"><span class="system-generated-tag">System Generated</span></div><div class="activity-timeline">${activities.slice(-5).reverse().map((activity) => `<article class="activity-entry ${activity.tone}"><span class="activity-dot"></span><div><div class="activity-entry-heading"><strong>${activity.title}</strong><time>${activity.date}</time></div><p>${activity.detail}</p><small>${activity.actor}</small></div></article>`).join("")}</div></div></details>`;
}

function detail(r, showWorkflowSummary = false) {
  const canEdit = (state.persona === "requestor" || (state.persona === "financeAssociate" && r.requestor === personas.financeAssociate.name)) && (r.currentStep < 4 || r.unlocked) && (!r.backendId || ["draft", "returned"].includes(r.backendStatus));
  const canUnlock = ["all", "financeManager"].includes(state.persona) && r.currentStep >= 4 && !r.unlocked;
  const requestControls = canEdit || canUnlock || r.unlocked ? `<div class="request-control-bar"><div><span class="eyebrow">Request Controls</span><strong>${r.unlocked ? "Unlocked for urgent correction" : canEdit ? "Editing is available before Document Validation" : "Request is workflow-locked"}</strong></div>${canEdit ? `<button type="button" data-edit-request="${r.id}">Edit Request</button>` : ""}${canUnlock ? `<button type="button" class="danger" data-unlock-request="${r.id}">Authorize Unlock</button>` : ""}</div>` : "";
  return `<section class="panel request-detail-panel"><details class="request-metadata responsive-disclosure" ${window.matchMedia("(min-width: 640px)").matches ? "open" : ""}><summary><span><span class="eyebrow">Request Summary</span><strong>${r.requestor} · ${requestMoney(r)}</strong><small>${r.department} · ${r.vendor}</small></span><span class="disclosure-label">Details</span></summary><dl class="detail-list">
      <div><dt>Requestor</dt><dd>${r.requestor}</dd></div><div><dt>Department</dt><dd>${r.department}</dd></div>
      <div><dt>Payee</dt><dd>${r.vendor}</dd></div><div><dt>Amount</dt><dd>${requestMoney(r)}</dd></div>
      <div><dt>Currency</dt><dd>${r.currency || "PHP"}</dd></div><div><dt>Aging Days</dt><dd>${agingDays(r)} day${agingDays(r) === 1 ? "" : "s"}</dd></div>
      <div><dt>Documents</dt><dd>${r.documents} attached, ${r.missing} missing</dd></div><div><dt>Budget</dt><dd>${r.budgeted ? "Budgeted" : "Unbudgeted"}</dd></div>
      ${r.submittedByFinance ? `<div><dt>Submitted by Finance</dt><dd>${r.requestor}</dd></div><div><dt>Independent Review</dt><dd>Required</dd></div>` : ""}
    </dl></details>${r.decisionReason ? `<div class="request-control-bar"><div><span class="eyebrow">${r.backendStatus === "declined" ? "Decline Reason" : "Correction Requested"}</span><strong>${escapeHtml(r.decisionReason)}</strong></div></div>` : ""}${requestControls}<details class="request-routing-card responsive-disclosure" ${window.matchMedia("(min-width: 640px)").matches ? "open" : ""}><summary><span><span class="eyebrow">Routing</span><strong>${r.budgeted ? "Budgeted" : "Unbudgeted"} · ${requestMoney(r)}</strong></span><span class="disclosure-label">Why this route?</span></summary><div class="routing-detail"><strong>${route(r)}</strong></div></details>${showWorkflowSummary ? workflowSummary(r) : ""}${requestActivity(r)}</section>`;
}

function conversationLayoutClass() {
  return `request-conversation-layout${state.conversationCollapsed ? " conversation-collapsed" : ""}`;
}

function conversationPanel(r) {
  const key = r.backendId || r.id;
  const conversation = state.conversations[key];
  const loading = state.conversationLoading[key];
  const error = state.conversationErrors[key];
  const items = conversation?.items || [];
  const canPost = conversation?.can_post ?? !["Declined", "Cancelled", "Completed"].includes(r.status);
  const labels = { information_requested: "Request More Information", information_provided: "Information Provided" };
  const participants = (conversation?.participants || []).filter((person) => person.id !== state.authUser?.id);
  const selectedMentions = state.conversationDraftMentions[key] || [];
  const draftBody = state.conversationDraftBody[key] || "";
  if (state.conversationCollapsed) return `<section class="panel request-conversation is-collapsed" data-conversation-request="${escapeHtml(key)}"><button type="button" class="conversation-toggle conversation-expand" data-toggle-conversation aria-label="Open request conversation, ${items.length} messages" aria-expanded="false" title="Open conversation"><span aria-hidden="true">◀</span><span class="conversation-rail-label">Messages</span>${items.length ? `<span class="conversation-rail-count">${items.length}</span>` : ""}</button></section>`;
  return `<section class="panel request-conversation" data-conversation-request="${escapeHtml(key)}"><div class="panel-header"><div><span class="eyebrow">Request Conversation</span><h3>Messages & Notes</h3><p>Shared with everyone in this request's approval flow.</p></div><div class="conversation-header-actions"><span class="count">${items.length}</span><button type="button" class="conversation-toggle" data-toggle-conversation aria-label="Collapse request conversation to the right" aria-expanded="true" title="Collapse conversation">→</button></div></div>
    ${!loading && !error && canPost ? `<form class="conversation-form" data-conversation-form="${escapeHtml(key)}"><label for="conversation-${escapeHtml(key)}">Add a message</label><div class="conversation-composer-input"><textarea id="conversation-${escapeHtml(key)}" name="body" maxlength="2000" required rows="3" placeholder="Write a note. Type @ to tag someone" aria-autocomplete="list" aria-controls="conversation-mention-options-${escapeHtml(key)}" aria-expanded="false">${escapeHtml(draftBody)}</textarea><div id="conversation-mention-options-${escapeHtml(key)}" class="conversation-mention-menu" role="listbox" aria-label="Participants to tag" hidden></div></div>${selectedMentions.length ? `<div class="conversation-mention-chips">${selectedMentions.map((id) => { const person = participants.find((entry) => entry.id === id); return person ? `<span class="conversation-mention-chip">@${escapeHtml(person.display_name)}<button type="button" data-remove-mention="${escapeHtml(id)}" data-mention-request="${escapeHtml(key)}" aria-label="Remove mention of ${escapeHtml(person.display_name)}">×</button></span>` : ""; }).join("")}</div>` : ""}<div><small>Type @ and choose a participant to notify them. Messages cannot be edited after posting.</small><button type="submit" class="primary-button" ${state.conversationPosting[key] ? "disabled" : ""}>${state.conversationPosting[key] ? "Posting…" : "Post Message"}</button></div></form>` : ""}
    ${loading ? `<p class="conversation-muted">Loading messages…</p>` : error ? `<div class="conversation-error" role="alert"><p>${escapeHtml(error)}</p><button type="button" data-retry-conversation="${escapeHtml(key)}">Try again</button></div>` : items.length ? `<div class="conversation-list" aria-label="Request messages, newest first">${[...items].reverse().map((item) => `<article class="conversation-entry" id="message-${escapeHtml(item.id)}"><div class="conversation-entry-header"><strong>${escapeHtml(item.author_name)}</strong>${item.kind !== "message" ? `<span class="conversation-event-tag">${escapeHtml(labels[item.kind] || item.kind)}</span>` : ""}<time datetime="${escapeHtml(item.created_at)}">${new Date(item.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</time></div><p>${escapeHtml(item.body)}</p></article>`).join("")}</div>` : `<p class="conversation-muted">No messages yet.</p>`}
</section>`;
}

function conversationMentionMatch(textarea) {
  const beforeCaret = textarea.value.slice(0, textarea.selectionStart);
  const match = /(^|[\s(])@([^@\n]*)$/.exec(beforeCaret);
  if (!match || match[2].length > 60 || /[.,!?]/.test(match[2])) return null;
  const query = match[2];
  const key = textarea.form?.dataset.conversationForm;
  const participants = state.conversations[key]?.participants || [];
  if (/\s$/.test(query) && participants.some((person) => person.display_name.toLowerCase() === query.trim().toLowerCase())) return null;
  return { start: beforeCaret.length - query.length - 1, end: textarea.selectionStart, query: query.trim().toLowerCase() };
}

function updateConversationMentionMenu(textarea) {
  const menu = textarea.parentElement.querySelector(".conversation-mention-menu");
  const key = textarea.form?.dataset.conversationForm;
  const match = conversationMentionMatch(textarea);
  const participants = (state.conversations[key]?.participants || []).filter((person) => person.id !== state.authUser?.id);
  const options = match ? participants.filter((person) => `${person.display_name} ${person.role.replaceAll("_", " ")}`.toLowerCase().includes(match.query)).slice(0, 8) : [];
  menu.innerHTML = options.map((person, index) => `<button type="button" role="option" id="mention-option-${escapeHtml(person.id)}" data-mention-option="${escapeHtml(person.id)}" aria-selected="${index === 0}"><strong>${escapeHtml(person.display_name)}</strong><small>${escapeHtml(person.role.replaceAll("_", " "))}</small></button>`).join("");
  menu.hidden = options.length === 0;
  menu.dataset.activeIndex = "0";
  textarea.setAttribute("aria-expanded", String(!menu.hidden));
  if (options.length) textarea.setAttribute("aria-activedescendant", `mention-option-${options[0].id}`);
  else textarea.removeAttribute("aria-activedescendant");
}

function chooseConversationMention(textarea, personId) {
  const key = textarea.form?.dataset.conversationForm;
  const person = state.conversations[key]?.participants?.find((entry) => entry.id === personId);
  const match = conversationMentionMatch(textarea);
  if (!person || !match) return;
  const insertion = `@${person.display_name} `;
  state.conversationDraftBody[key] = `${textarea.value.slice(0, match.start)}${insertion}${textarea.value.slice(match.end)}`;
  state.conversationDraftMentions[key] = [...new Set([...(state.conversationDraftMentions[key] || []), person.id])];
  const caret = match.start + insertion.length;
  render();
  const nextTextarea = document.querySelector(`[data-conversation-form="${key}"] textarea`);
  nextTextarea?.focus();
  nextTextarea?.setSelectionRange(caret, caret);
}

async function loadConversation(r, force = false) {
  const key = r.backendId || r.id;
  if (state.conversationLoading[key] || (!force && state.conversations[key])) return;
  state.conversationLoading[key] = true;
  state.conversationErrors[key] = "";
  try {
    state.conversations[key] = r.backendId ? await dataSource.getRequestConversation(key) : { items: r.conversation || [], can_post: true };
  } catch (error) { state.conversationErrors[key] = error.message || "Messages could not be loaded."; }
  finally { state.conversationLoading[key] = false; render(); }
}

async function loadNotifications() {
  if (state.authStatus !== "authenticated" || state.notificationsLoading) return;
  state.notificationsLoading = true;
  const wasLoaded = state.notificationsLoaded;
  let changed = !wasLoaded;
  try {
    const next = await dataSource.getNotifications();
    changed = changed || JSON.stringify(next) !== JSON.stringify(state.notifications) || Boolean(state.notificationsError);
    state.notifications = next;
    state.notificationsError = "";
  } catch (error) { state.notificationsError = error.message || "Notifications could not be loaded."; changed = true; }
  finally { state.notificationsLoaded = true; state.notificationsLoading = false; if (changed) render(); }
}

function notificationPanel() {
  if (!state.notificationsOpen) return "";
  const items = state.notifications.items || [];
  return `<section class="notification-panel" aria-label="Mention notifications"><div class="notification-panel-header"><div><strong>Notifications</strong><small>${state.notifications.unread_count} unread</small></div><button type="button" data-close-notifications aria-label="Close notifications">×</button></div>${state.notificationsLoading ? `<p class="notification-empty">Loading…</p>` : state.notificationsError ? `<div class="notification-empty" role="alert"><p>${escapeHtml(state.notificationsError)}</p><button type="button" data-retry-notifications>Try again</button></div>` : items.length ? `<div class="notification-list">${items.map((item) => `<button type="button" class="notification-item ${item.read_at ? "" : "unread"}" data-open-notification="${escapeHtml(item.id)}"><span class="notification-item-title">${escapeHtml(item.author_name)} mentioned you</span><span class="notification-item-request">${escapeHtml(item.request.request_number || "Payment request")}</span><span class="notification-item-preview">${escapeHtml(item.preview)}</span><time datetime="${escapeHtml(item.created_at)}">${new Date(item.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</time></button>`).join("")}</div>` : `<p class="notification-empty">No mentions yet.</p>`}</section>`;
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
    10: ["Prepare Payment", "Finance Associate", "tracker"],
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
  const activeCount = [filters.department !== "all", filters.status !== "all", filters.type !== "all", filters.minAmount !== "", filters.maxAmount !== ""].filter(Boolean).length;
  return `<section class="panel dashboard-filter-panel"><div class="request-filter-toolbar"><label class="request-filter-search"><span class="sr-only">Search voucher number</span><input data-dashboard-filter="voucher" type="search" placeholder="Search voucher number" value="${filters.voucher}"></label><button type="button" class="request-filter-toggle" data-toggle-request-filters aria-expanded="${Boolean(state.requestFiltersExpanded)}" aria-controls="requestAdvancedFilters">☰ Filter${activeCount ? ` (${activeCount})` : ""}</button><div class="request-filter-sort">    <label>Sort By<select data-dashboard-filter="sortBy"><option value="submitted" ${filters.sortBy === "submitted" ? "selected" : ""}>Submitted Date</option><option value="voucher" ${filters.sortBy === "voucher" ? "selected" : ""}>Voucher Number</option><option value="type" ${filters.sortBy === "type" ? "selected" : ""}>Type</option><option value="status" ${filters.sortBy === "status" ? "selected" : ""}>Status</option><option value="amount" ${filters.sortBy === "amount" ? "selected" : ""}>Amount</option></select></label>
    <label>Order<select data-dashboard-filter="sortDirection"><option value="asc" ${filters.sortDirection === "asc" ? "selected" : ""}>Ascending</option><option value="desc" ${filters.sortDirection === "desc" ? "selected" : ""}>Descending</option></select></label>
</div><button type="button" class="clear-filter-button" data-clear-filters="true">Clear Filters</button></div><div class="dashboard-filters dashboard-filters-primary">
    ${financeView ? `<label>Department<select data-dashboard-filter="department"><option value="all">All Departments</option>${departmentOptions.map((department) => `<option value="${department}" ${filters.department === department ? "selected" : ""}>${department}</option>`).join("")}</select></label>` : ""}
    <label>Status<select data-dashboard-filter="status"><option value="all">All Statuses</option>${statusOptions.map((status) => `<option value="${status}" ${filters.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label>
  </div><div id="requestAdvancedFilters" class="advanced-filter-options" ${state.requestFiltersExpanded ? "" : "hidden"}><div class="dashboard-filters dashboard-filters-advanced"><label>Type<select data-dashboard-filter="type"><option value="all">All Types</option>${Object.entries(paymentTypes).map(([id, type]) => `<option value="${id}" ${filters.type === id ? "selected" : ""}>${type.label}</option>`).join("")}</select></label>
    <label>Minimum Amount<input data-dashboard-filter="minAmount" type="number" min="0" placeholder="0" value="${filters.minAmount}"></label>
    <label>Maximum Amount<input data-dashboard-filter="maxAmount" type="number" min="0" placeholder="No limit" value="${filters.maxAmount}"></label>
  </div>${financeView ? `<div class="report-actions"><div class="report-actions-copy"><span class="eyebrow">Department Transaction Report</span><p>Generate a report using the active filters above.</p></div><div class="report-action-buttons"><button type="button" class="report-button report-button-secondary" data-export-report="xlsx">Export Excel</button><button type="button" class="report-button primary-button" data-print-report="true">Print / Save PDF</button></div></div>` : ""}</div></section>`;
}

function reportRows() {
  const filters = state.dashboardFilters;
  return personaRequests().filter((r) => {
    const voucherMatch = (r.voucherNumber || "").toLowerCase().includes(filters.voucher.trim().toLowerCase());
    const departmentMatch = filters.department === "all" || r.department === filters.department;
    const typeMatch = filters.type === "all" || r.type === filters.type;
    const statusMatch = filters.status === "all" || r.status === filters.status;
    const minMatch = filters.minAmount === "" || r.amount >= Number(filters.minAmount);
    const maxMatch = filters.maxAmount === "" || r.amount <= Number(filters.maxAmount);
    return voucherMatch && departmentMatch && typeMatch && statusMatch && minMatch && maxMatch;
  });
}

async function downloadDepartmentReport() {
  const XLSX = await import("xlsx");
  const columns = ["Request Number", "Submitted", "Department", "Requestor", "Payee", "Type", "Currency", "Amount", "Status", "Current Owner", "Aging Days"];
  const rows = reportRows().map((r) => [r.id, r.submitted, r.department, r.requestor, r.vendor, paymentTypes[r.type].label, r.currency || "PHP", r.amount, r.status, steps.find(([id]) => id === r.currentStep)?.[2] || "System", agingDays(r)]);
  const report = paymentReportData(reportRows());
  const summaryRows = [
    ["Department Transaction Report"],
    ["Report Number", report.reportNumber],
    ["Department", report.department],
    ["Generated", report.generatedAt],
    ["Generated By", report.generatedBy],
    ["Transactions", rows.length],
    ["Applied Filters", report.filters.join(" | ") || "All request types and statuses"],
    [],
    ["Currency", "Total"],
    ...report.totals.map((total) => [total.currency, total.amount]),
  ];
  const workbook = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  const transactionSheet = XLSX.utils.aoa_to_sheet([columns, ...rows]);
  summarySheet["!cols"] = [{ wch: 24 }, { wch: 48 }];
  transactionSheet["!cols"] = [14, 13, 18, 22, 24, 20, 10, 15, 24, 22, 12].map((wch) => ({ wch }));
  transactionSheet["!autofilter"] = { ref: `A1:K${Math.max(rows.length + 1, 1)}` };
  for (let rowIndex = 2; rowIndex <= rows.length + 1; rowIndex += 1) {
    if (transactionSheet[`H${rowIndex}`]) transactionSheet[`H${rowIndex}`].z = "#,##0.00";
    if (transactionSheet[`K${rowIndex}`]) transactionSheet[`K${rowIndex}`].z = "0";
  }
  for (let rowIndex = 10; rowIndex <= summaryRows.length; rowIndex += 1) {
    if (summarySheet[`B${rowIndex}`]) summarySheet[`B${rowIndex}`].z = "#,##0.00";
  }
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
  XLSX.utils.book_append_sheet(workbook, transactionSheet, "Transactions");
  workbook.Props = { Title: "Department Transaction Report", Subject: report.department, Author: report.generatedBy, CreatedDate: new Date() };
  const departmentSlug = state.dashboardFilters.department === "all" ? "all-departments" : state.dashboardFilters.department.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and");
  XLSX.writeFile(workbook, `payment-requests-${departmentSlug}-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
}

function apiDraftPayload(draft) {
  const currency = draft.currency === "OTHER" ? draft.otherCurrency || "PHP" : draft.currency;
  const centers = state.masterData["cost-centers"] || [];
  const fields = draft.fields || {};
  const poRecord = purchaseOrderRecords().find((record) => record.id === (fields.po_reference || state.selectedPO));
  const center = centers.find((item) => item.id === fields.department_cost_center_id)
    || (draft.type === "poPayment" && centers.find((item) => item.name === poRecord?.department || item.code === poRecord?.department))
    || centers.find((item) => item.code === (state.persona === "financeAssociate" ? "FIN" : "MKTG")) || centers[0];
  if (!center?.department_id) return null;
  const valueFor = (row, names) => names.map((name) => row[name]).find((value) => String(value || "").trim()) || "";
  const accounts = state.masterData["chart-of-accounts"] || [];
  const resolveId = (entries, value) => entries.find((entry) => entry.id === value || entry.code === value)?.id || null;
  const selectedVendor = (state.masterData.vendors || []).find((vendor) => vendor.id === fields.vendor_external_id);
  const populatedLines = draft.lineItems.filter((row) => paymentTypes[draft.type].lineColumns.some((name) => String(row[name] || "").trim()));
  const documents = draft.documents || {};
  const typeData = {
    ...fields,
    fields,
    documents,
    budgeted: draft.budgeted,
    liquidation_advance_amount: draft.liquidationAdvanceAmount,
    liquidation_return_amount: draft.liquidationReturnAmount || 0,
    department_cost_center_id: center.id,
    proof_of_payment_refs: draft.type === "reimbursement" ? populatedLines.flatMap((row) => lineAttachmentNames(row["Proof of Payment"])) : documents.proof_of_payment || [],
    line_document_refs: populatedLines.map((row) => ({ proof_of_payment: lineAttachmentNames(row["Proof of Payment"]) })),
    billing_document_refs: documents.billing_or_invoice || [],
    po_reference: fields.po_reference || (draft.type === "poPayment" ? state.selectedPO : ""),
    accountability_acknowledged: fields.accountability_acknowledged === true,
  };
  return {
    request_type: draft.type,
    department_id: center.department_id,
    payee_name: poRecord?.payee || selectedVendor?.name || valueFor(draft.lineItems[0] || {}, ["Merchant Name", "Supplier"]),
    vendor_external_id: fields.vendor_external_id || null,
    purpose: String(fields.purpose || draft.purpose || ""),
    currency_code: currency,
    type_data: typeData,
    lines: populatedLines.map((row) => ({
      invoice_date: valueFor(row, ["Invoice Date"]) || null,
      invoice_number: valueFor(row, ["Invoice Number", "P.O. Number"]) || (draft.type === "poPayment" ? poRecord?.id : null),
      vendor_name: valueFor(row, ["Merchant Name", "Supplier"]) || (draft.type === "poPayment" ? poRecord?.payee || "" : ""),
      particulars: valueFor(row, ["Particulars"]),
      chart_account_id: resolveId(accounts, valueFor(row, ["Expense Account"])),
      cost_center_id: resolveId(centers, valueFor(row, ["Department / Cost Center", "Department to Be Charged"])),
      amount: Number(row.Amount) || (draft.type === "poPayment" && draft.lineItems.length === 1 ? poRecord?.amount || 0 : 0),
      currency_code: currency,
      attachment_refs: lineAttachmentNames(row.Attachment || row.Receipt).slice(0, 20),
    })),
  };
}

async function persistDraft(draft) {
  if (dataSource.mode === "mock" || state.authStatus !== "authenticated") return;
  const payload = apiDraftPayload(draft);
  if (!payload) return;
  try {
    const saved = draft.backendId
      ? await dataSource.updatePaymentRequest(draft.backendId, { ...payload, version: draft.backendVersion }, state.csrfToken)
      : await dataSource.createPaymentRequest(payload, state.csrfToken);
    if (saved) state.drafts = state.drafts.map((item) => item.id === draft.id ? { ...item, backendId: saved.id, backendVersion: saved.version, backendStatus: saved.status } : item);
    return saved;
  } catch (error) {
    console.warn("Draft remains saved locally because API persistence failed.", error);
    return null;
  }
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
  if (!visibleRequests.length) return `<section class="content-grid"><div class="metric-row"><div class="metric green"><span>Pending Approval</span><strong>0</strong></div><div class="metric blue"><span>Open Request Value</span><strong>${money(0)}</strong></div><div class="metric amber"><span>Returned</span><strong>0</strong></div><div class="metric red"><span>Unclaimed Checks</span><strong>0</strong></div></div><section class="panel empty-state"><h3>No payment requests yet</h3><p>Create a request or adjust the current filters when records become available.</p><button type="button" class="primary-button" data-tab="request">Create Request</button></section></section>`;
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
      voucher: [a.voucherNumber || "", b.voucherNumber || ""],
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
  const pendingLabel = state.persona === "requestor" ? "Awaiting Approval" : ["departmentHead", "coo", "president", "boardMember", "authorizedSignatory"].includes(state.persona) ? "Awaiting My Approval" : state.persona === "financeAssociate" ? "Awaiting Validation" : "Pending Approval";
  return `<section class="content-grid">
    <div class="metric-row"><button type="button" class="metric green" data-metric="pending"><span>Pending Approval</span><strong>${pendingRequests.length}</strong><small>View Requests →</small></button><button type="button" class="metric blue" data-metric="value"><span>Open Request Value</span><strong>${totalDisplay}</strong><small>View Breakdown →</small></button><button type="button" class="metric amber" data-metric="returned"><span>Returned</span><strong>${returnedRequests.length}</strong><small>View Requests →</small></button><button type="button" class="metric red" data-metric="unclaimed"><span>Unclaimed Checks</span><strong>${unclaimedRequests.length}</strong><small>View Checks →</small></button></div>
    ${dashboardFilters(visibleRequests)}<div class="two-column">${requestTable(filteredRequests, true)}${dashboardRequestPreview(selected)}</div>${workflowModal}
  </section>`;
}

function requestBuilder() {
  if (state.requestMode === "drafts") return draftsView();
  if (state.requestTypeSelection) return requestTypeSelectionView();
  const config = paymentTypes[state.draftType];
  if (state.draftType === "liquidation" && state.cashAdvanceOptions === null && !state.cashAdvanceOptionsLoading) queueMicrotask(loadCashAdvanceOptions);
  const lineItems = state.lineItemsByType[state.draftType];
  const draftAmount = lineItems.reduce((sum, item) => sum + (Number(item.Amount) || 0), 0);
  const isLiquidation = state.draftType === "liquidation";
  const isCashAdvance = state.draftType === "cashAdvance";
  const isPoPayment = state.draftType === "poPayment";
  const poRecords = purchaseOrderRecords();
  const poRecord = poRecords.find((record) => record.id === state.selectedPO) || poRecords[0];
  const effectiveAmount = isPoPayment ? poRecord.amount : draftAmount;
  const currencyOptions = state.masterData.currencies || [{ code: "PHP", name: "Philippine Peso" }, { code: "USD", name: "US Dollar" }, { code: "EUR", name: "Euro" }];
  const currencyField = `<label>Currency<select data-draft-currency>${currencyOptions.filter((item) => item.is_active !== false).map((item) => `<option value="${item.code}" ${state.draftCurrency === item.code ? "selected" : ""}>${item.code} — ${escapeHtml(item.name)}</option>`).join("")}</select></label>`;
  const cashAdvanceFields = config.mandatoryFields.map((field) => `${fieldInput(field)}${field.label === "Last Day of the Event" ? `<label>Date to Liquidate <small>(System Generated: 15 Days After Event)</small><input data-liquidation-due-date data-request-field="liquidation_due_date" type="date" value="${state.cashAdvanceLiquidationDate}" readonly></label>` : ""}`).join("");
  const requestorName = escapeHtml(activeRequestor());
  const primaryFields = state.draftType === "reimbursement"
    ? `<label>Requestor's Name<input data-request-field="requestor_name" value="${requestorName}" placeholder="Enter requestor's full name"></label>${config.mandatoryFields.map(fieldInput).join("")}<label>Calculated Total<input id="draftAmount" type="number" value="${draftAmount}" readonly></label>${currencyField}`
    : isLiquidation
    ? `<label>Cash Advance Requestor<input data-request-field="requestor_name" value="${requestorName}" placeholder="Enter cash advance requestor"></label>${config.mandatoryFields.map(fieldInput).join("")}<label>Calculated Total<input id="draftAmount" type="number" value="${draftAmount}" readonly></label>${currencyField}`
    : isCashAdvance
    ? `<label>Cash Advance Requestor<input data-request-field="requestor_name" value="${requestorName}" placeholder="Enter cash advance requestor"></label>${cashAdvanceFields}<label>Cash Advance Amount<input id="draftAmount" type="number" value="${draftAmount}" readonly></label>${currencyField}`
    : isPoPayment
    ? `<label>P.O. Reference Number <small>(From Procurement)</small><select data-po-reference data-request-field="po_reference">${poRecords.map((record) => `<option value="${record.id}" ${record.id === poRecord.id ? "selected" : ""}>${record.id} · ${escapeHtml(record.payee)}</option>`).join("")}</select></label><label>Requestor<input data-request-field="requestor_name" value="${requestorName}"></label><label>Payee / Vendor <small>(System Generated)</small><input data-request-field="payee_name" value="${poRecord.payee}" readonly></label><label>Calculated Amount <small>(System Generated)</small><input id="draftAmount" type="number" value="${poRecord.amount}" readonly></label>${currencyField}<label>Department / Cost Center <small>(From Procurement)</small><input value="${poRecord.department}" readonly></label><label>P.O. Status <small>(From Procurement)</small><input value="${poRecord.status}" readonly></label>${config.mandatoryFields.map(fieldInput).join("")}`
    : `<label>Requestor<input data-request-field="requestor_name" value="${requestorName}" placeholder="Enter requestor's full name"></label><label>Payee / Vendor<select data-vendor-reference data-request-field="vendor_external_id"><option value="">Select vendor</option>${(state.masterData.vendors || []).map((vendor) => `<option value="${escapeHtml(vendor.id)}">${escapeHtml(vendor.name)}</option>`).join("")}</select></label><label>Calculated Amount<input id="draftAmount" type="number" value="${draftAmount}" readonly></label>${currencyField}${config.mandatoryFields.map(fieldInput).join("")}<label class="toggle-row"><input type="checkbox" data-request-field="new_supplier"> New supplier <small>BIR 2303 is required when selected.</small></label>`;
  const liquidationSummary = isLiquidation ? `<div class="liquidation-summary"><label>Cash Advance Amount<input id="liquidationAdvanceAmount" type="number" placeholder="e.g. 50000"></label><div><span>Total Expenses</span><strong id="liquidationExpenses">${money(draftAmount)}</strong></div><div><span>For Return / For Reimbursement</span><strong id="liquidationSettlement">${settlementFor(state.liquidationAdvanceAmount, draftAmount)}</strong></div><label>Amount Returned Offline<input id="liquidationReturnAmount" type="number" min="0" step="0.01" value="${state.liquidationReturnAmount || ""}" placeholder="0.00"><small>Enter the amount returned directly to Finance. No proof-of-return upload is required.</small></label></div>` : "";
  const poSupplierNotice = isPoPayment && poRecord.newSupplier ? `<div class="po-system-notice"><strong>New Supplier Requirement</strong><p>BIR 2303 must be uploaded and validated in the P.O. system before this payment request can proceed.</p></div>` : "";
  const reimbursementTiming = state.draftType === "reimbursement" ? `<section class="cash-advance-policy"><h4>Finance processing guidance</h4><ul><li>Submit complete requests at least 15 days before the required payment date.</li><li>Submit invoices within 30 days of the invoice date.</li><li>Low-value expenses remain Reimbursement requests in this module.</li><li>Reimbursements are normally processed in the batches scheduled for the 15th and 30th.</li></ul></section>` : "";
  const accountability = isCashAdvance ? `<section class="accountability-box"><h4>Accountability / Authority to Deduct</h4><p>I have read and understood the <a href="#cash-advance-policy" data-cash-advance-policy>Cash Advance policies</a> and procedures. I agree to fully liquidate this Cash Advance after completion of the transaction, project, or event. I authorize payroll deduction of any unliquidated or unsubstantiated cash advance in accordance with labor laws and company policy.</p><label><input type="checkbox" data-request-field="accountability_acknowledged" required><span>I acknowledge full accountability for the amount received and agree to the authority to deduct.</span></label></section><section class="cash-advance-policy"><h4>Cash Advance Policy</h4><ul><li>Staff may request up to PHP 40,000 and may hold only one cash advance at a time.</li><li>Liquidation is due within 15 days after the event or project.</li><li>Excess cash must be returned directly to Finance.</li></ul></section>` : "";
  return `<section class="request-form-page"><div class="request-navigation-row"><button type="button" class="back-button" data-back-request-types>← Back to Request Types</button><button type="button" data-view-drafts>My Drafts (${state.drafts.filter((draft) => draft.requestor === activeRequestor()).length})</button></div><section class="form-layout"><div class="panel request-form-panel"><div class="panel-header request-details-header"><div><h3>${state.draftType === "reimbursement" ? "Reimbursement Details" : isLiquidation ? "Liquidation Details" : isCashAdvance ? "Cash Advance Details" : "Request Details"}</h3>${state.activeDraftId ? `<small class="draft-save-state">Draft saved · Auto-save enabled</small>` : ""}</div></div>${state.persona === "financeAssociate" ? `<div class="independent-validation-notice"><div><span class="eyebrow">Segregation of Duties</span><strong>You may submit this request, but you cannot validate it.</strong></div><p>The system will assign document validation to another Finance Associate.</p></div>` : ""}
    <div class="field-grid ${state.draftType === "reimbursement" || isLiquidation || isCashAdvance ? "reimbursement-fields" : ""}">${primaryFields}</div>${poSupplierNotice}${liquidationSummary}
    ${isCashAdvance || isLiquidation ? "" : `<label class="toggle-row"><input id="unbudgeted" type="checkbox" ${!state.budgeted ? "checked" : ""}>Unbudgeted Request</label>`}
    <div class="line-items-section"><div class="line-items-header"><div><span class="eyebrow">Request Breakdown</span><h4>Line Items</h4></div></div><div class="line-card-list">
      ${lineItems.map((item, rowIndex) => `<details class="line-item-card" data-line-card="${rowIndex}" ${rowIndex === expandedLineIndex ? "open" : ""}><summary><span class="line-card-number">${rowIndex + 1}</span><span class="line-card-summary"><strong data-line-title>${escapeHtml(item["Merchant Name"] || item.Particulars || item.Supplier || item["P.O. Number"] || `Line item ${rowIndex + 1}`)}</strong>${config.lineColumns.some((column) => column.includes("Department")) ? `<small data-line-subtitle>${escapeHtml(lineCenterLabel(item["Department / Cost Center"] || item["Department to Be Charged"]))}</small>` : ""}</span><span class="line-card-meta"><strong data-line-amount>${money(Number(item.Amount) || 0, state.draftCurrency)}</strong>${config.lineColumns.includes("Attachment") || config.lineColumns.includes("Receipt") || config.lineColumns.includes("Proof of Payment") ? `<small data-line-file-count>${lineAttachmentNames(state.draftType === "reimbursement" ? item["Proof of Payment"] : item.Attachment || item.Receipt).length} files</small>` : ""}</span><span class="line-card-chevron" aria-hidden="true">⌄</span></summary><div class="line-card-body"><div class="line-card-fields">${config.lineColumns.map((column) => {
        const isFile = column === "Receipt" || column === "Attachment" || column === "Proof of Payment";
        const example = lineItemExamples[state.draftType]?.[0]?.[column] ?? column;
        const references = column === "Expense Account" ? (state.masterData["chart-of-accounts"] || []) : column.includes("Department") ? (state.masterData["cost-centers"] || []) : null;
        if (isFile) {
          const fileNames = lineAttachmentNames(item[column]);
          return `<div class="line-card-field line-card-attachments"><span class="line-card-label">${escapeHtml(column.replace("P.O.", "Purchase Order"))}</span><div class="line-card-upload"><label class="line-upload-control document-upload-button" title="Upload ${escapeHtml(column.replace("P.O.", "Purchase Order"))} for line ${rowIndex + 1}"><input type="file" multiple data-line-row="${rowIndex}" data-line-column="${column}" aria-label="Upload ${escapeHtml(column.replace("P.O.", "Purchase Order"))} for line ${rowIndex + 1}">${uploadIcon}<span>Upload Files</span></label><span class="line-upload-filename" title="${escapeHtml(fileNames.join(", "))}">${fileNames.length ? fileNames.map(escapeHtml).join("<br>") : "No files selected"}</span></div></div>`;
        }
        if (references) return `<label class="line-card-field">${escapeHtml(column.replace("P.O.", "Purchase Order"))}<select data-line-row="${rowIndex}" data-line-column="${column}"><option value="">Select</option>${references.filter((entry) => entry.is_active !== false).map((entry) => `<option value="${escapeHtml(entry.id)}" ${item[column] === entry.id || item[column] === entry.code ? "selected" : ""}>${escapeHtml(entry.name)} (${escapeHtml(entry.code)})</option>`).join("")}</select></label>`;
        return `<label class="line-card-field">${escapeHtml(column.replace("P.O.", "Purchase Order"))}<input data-line-row="${rowIndex}" data-line-column="${column}" type="${column === "Amount" ? "number" : column.toLowerCase().includes("date") ? "date" : "text"}" value="${escapeHtml(String(item[column] || ""))}" placeholder="${escapeHtml(String(example))}"></label>`;
      }).join("")}</div><div class="line-card-actions"><button type="button" class="remove-line-button" data-remove-line="${rowIndex}" ${lineItems.length === 1 ? "disabled" : ""}>Remove line</button></div></div></details>`).join("")}
    </div><div class="line-card-footer"><button type="button" class="add-line-button" data-add-line="true">+ Add Line Item</button><div class="line-card-total"><span>${isCashAdvance ? "Total cash advance amount" : isLiquidation ? "Total liquidated amount" : isPoPayment ? "Purchase Order amount" : "Total"}</span><strong data-line-total>${money(effectiveAmount, state.draftCurrency)}</strong></div></div></div>${reimbursementTiming}${accountability}</div>
    <div class="panel"><div class="panel-header validation-preview-header"><h3>Validation Preview</h3><span class="count" data-validation-count>0/${config.required.length}</span></div><ul class="check-list">${config.required.map((item) => `<li data-validation-requirement="${item}"><span class="warn">!</span>${item}</li>`).join("")}</ul>
    ${state.draftType === "reimbursement" || isPoPayment ? `<div class="line-attachment-notice"><strong>Documents are attached per line item.</strong><p>${isPoPayment ? "Approved Purchase Order, quotation/contract, and supplier records are retrieved from Procurement. Upload the Delivery Receipt or Business Permit here when applicable." : "Add the corresponding invoice or receipt and proof of payment in each reimbursement line."}</p></div>${state.draftType === "reimbursement" ? `<h4>Request Documents</h4><div class="upload-list">${uploadInput("Other Supporting Document")}</div>` : `<h4>Request Documents</h4><div class="upload-list">${config.uploadDocuments.map(uploadInput).join("")}</div>`}` : isLiquidation ? `<div class="line-attachment-notice"><strong>Receipt uploads are optional.</strong><p>You may attach invoices or receipts to each breakdown line. Original hard copies will be submitted to Finance offline.</p></div>` : `<h4>Document Uploads</h4><div class="upload-list">${config.uploadDocuments.map(uploadInput).join("")}</div>`}
    <div class="route-box"><span class="eyebrow">System Route</span><strong>${route({ amount: effectiveAmount, budgeted: state.budgeted, type: state.draftType })}</strong></div></div><div class="panel request-action-footer"><div><span class="eyebrow">Request Actions</span><p>Save your progress or submit the completed request to your department head.</p></div><div class="request-submit-actions"><button type="button" data-save-draft>Save as Draft</button><button type="button" class="confirmation-button" data-submit-current>Submit to Department Head</button></div></div></section>${leaveRequestModal()}</section>`;
}

function validationReviewLines(request) {
  if (["GEN-2026-0200", "GEN-2026-0201"].includes(request.id)) {
    const isDownpayment = request.id === "GEN-2026-0201";
    return [{
      reference: isDownpayment ? "QUOTATION-TOJUST-100K" : "QUOTATION-TOJUST-200K",
      date: "2026-08-20",
      merchant: request.vendor,
      particulars: isDownpayment ? "50% downpayment on TOJUST Construction quotation" : "TOJUST Construction business-validation quotation",
      expense: "Construction Expense",
      department: request.department,
      amount: request.amount,
      attachment: isDownpayment ? "tojust-construction-50-percent-downpayment.pdf" : "tojust-construction-quotation-200000.pdf",
    }];
  }
  const amounts = [Math.round(request.amount * 0.6), request.amount - Math.round(request.amount * 0.6)];
  const typeLines = {
    reimbursement: [
      { reference: "INV-1042", date: "2026-06-18", particulars: "Hotel accommodation", expense: "Travel and Lodging", department: request.department, amount: amounts[0], attachment: "hotel-invoice-1042.pdf" },
      { reference: request.id === "RMB-2026-0158" ? "OR-1048" : "OR-1056", date: request.id === "RMB-2026-0158" ? "2026-05-28" : "2026-06-19", particulars: "Local transportation", expense: "Transportation Expense", department: request.department, amount: amounts[1], attachment: request.id === "RMB-2026-0158" ? "duplicate-travel-receipt-or-1048.pdf" : "transport-receipt-1056.pdf", ...(request.id === "RMB-2026-0158" ? { duplicate: { requestId: "RMB-2026-0132", invoice: "OR-1048", merchant: "Travel Desk", invoiceDate: "2026-05-28", reimbursedAt: "2026-06-05", amount: 33740, status: "Completed", requestor: "Mika Santos" } } : {}) },
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

const attachmentMenu = (line, index) => `<div class="attachment-actions"><button type="button" class="attachment-name-button" data-attachment-menu="${index}" aria-haspopup="menu" aria-expanded="false">${line.attachment}<span aria-hidden="true">⋮</span></button><div class="attachment-menu" data-attachment-menu-panel="${index}" role="menu" hidden><button type="button" role="menuitem" data-view-line-attachment="${index}">View Document</button><button type="button" role="menuitem" data-download-line-attachment="${index}">Download</button></div></div>`;

const lineReviewControl = (review, index, line) => review.status === "pending"
  ? `<div class="line-review-actions"><span class="review-result ${line.duplicate ? "duplicate" : "pending"}">${line.duplicate ? "Duplicate Flagged" : "Pending Review"}</span>${line.duplicate ? `<button type="button" data-view-duplicate-invoice="${index}">View Existing Reimbursement</button>` : `<button type="button" class="confirmation-button" data-validate-line="${index}">Validate</button>`}<button type="button" class="danger" data-request-line-correction="${index}">Request Correction</button></div>`
  : `<div class="line-review-decision"><span class="review-result ${review.status}">${review.status === "valid" ? "Validated" : "Needs Correction"}</span>${review.note ? `<p>${review.note}</p>` : ""}<small>${review.reviewer} · ${review.reviewedAt}</small><button type="button" data-reset-line-review="${index}">Change Decision</button></div>`;

const correctionReviewModal = () => state.correctionReviewIndex === null ? "" : `<div class="correction-modal-backdrop" data-correction-modal-backdrop><section class="correction-modal" role="dialog" aria-modal="true" aria-labelledby="correction-modal-title"><div><span class="eyebrow">Document Review</span><h3 id="correction-modal-title">Request Document Correction</h3><p>Explain what the requestor must correct or replace. This reason will appear in the audit trail.</p></div><label>Correction Reason <small>(Required)</small><textarea data-correction-reason placeholder="Example: The receipt image is unreadable. Upload a clearer copy showing the merchant, date, and amount."></textarea></label><div class="correction-modal-actions"><button type="button" class="danger" data-cancel-line-correction>Cancel</button><button type="button" class="danger" data-confirm-line-correction disabled>Request Correction</button></div></section></div>`;

const duplicateInvoiceModal = (lines) => {
  if (state.duplicateInvoiceIndex === null) return "";
  const match = lines[state.duplicateInvoiceIndex]?.duplicate;
  if (!match) return "";
  return `<div class="correction-modal-backdrop" data-duplicate-modal-backdrop><section class="correction-modal duplicate-invoice-modal" role="dialog" aria-modal="true" aria-labelledby="duplicate-modal-title"><div><span class="eyebrow duplicate-eyebrow">Possible Duplicate Invoice</span><h3 id="duplicate-modal-title">${match.invoice} was already reimbursed</h3><p>Compare the current document against this completed reimbursement before requesting a correction.</p></div><dl class="duplicate-match-details"><div><dt>Previous Request</dt><dd>${match.requestId}</dd></div><div><dt>Merchant</dt><dd>${match.merchant}</dd></div><div><dt>Invoice Number</dt><dd>${match.invoice}</dd></div><div><dt>Invoice Date</dt><dd>${match.invoiceDate}</dd></div><div><dt>Amount</dt><dd>${money(match.amount)}</dd></div><div><dt>Reimbursed On</dt><dd>${match.reimbursedAt}</dd></div><div><dt>Requestor</dt><dd>${match.requestor}</dd></div><div><dt>Status</dt><dd>${match.status}</dd></div></dl><div class="duplicate-modal-actions"><button type="button" data-close-duplicate-invoice>Close</button><button type="button" class="danger" data-correct-duplicate="${state.duplicateInvoiceIndex}">Request Correction</button></div></section></div>`;
};

function documentValidationWorkspace(request) {
  const validation = state.documentValidation;
  const selectedEwt = validation.ewt;
  const ewtRate = selectedEwt === "other" ? Number(validation.otherEwt) || 0 : Number(selectedEwt) || 0;
  const taxes = taxBreakdown(request.amount, ewtRate, validation.vat === "subject");
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
  const ewtOptions = [["0", "No EWT"], ["1", "1%"], ["2", "2%"], ["5", "5%"], ["10", "10%"], ["15", "15%"], ["other", "Others"]];
  return `<section class="document-validation-workspace">
    <div class="validation-section"><div class="validation-section-heading"><div><span class="eyebrow">Tax Classification</span><h4>VAT and Expanded Withholding Tax</h4></div><span class="validation-status ${complete ? "complete" : "pending"}">${complete ? "Ready to Complete" : "In Progress"}</span></div>
      <div class="validation-choice-grid"><fieldset><legend>VAT Classification <span>*</span></legend><label><input type="radio" name="validationVat" value="subject" ${validation.vat === "subject" ? "checked" : ""}> Subject to VAT</label><label><input type="radio" name="validationVat" value="not-subject" ${validation.vat === "not-subject" ? "checked" : ""}> Not Subject to VAT</label></fieldset>
      <fieldset><legend>Expanded Withholding Tax <span>*</span></legend><div class="ewt-options">${ewtOptions.map(([value, label]) => `<label><input type="radio" name="validationEwt" value="${value}" ${selectedEwt === value ? "checked" : ""}> ${label}</label>`).join("")}</div>${selectedEwt === "other" ? `<label class="other-ewt">Other EWT Rate (%)<input type="number" min="0" max="100" step="0.01" data-validation-other-ewt value="${validation.otherEwt}" placeholder="Enter percentage"></label>` : ""}</fieldset></div>
      <div class="tax-summary"><div><span>Gross Amount${validation.vat === "subject" ? " (VAT Inclusive)" : ""}</span><strong>${money(taxes.gross)}</strong></div><div><span>12% VAT Component</span><strong>${money(taxes.vatAmount)}</strong></div><div><span>Net of VAT / EWT Base</span><strong>${money(taxes.netOfVat)}</strong></div><div><span>EWT Rate</span><strong>${ewtRate}%</strong></div><div><span>EWT Amount</span><strong>${money(taxes.ewtAmount)}</strong></div><div><span>Total Amount Due</span><strong>${money(taxes.amountDue)}</strong></div></div>
    </div>
    <div class="validation-section"><div class="validation-section-heading"><div><span class="eyebrow">Submitted Documents</span><h4>Copy Receipt Status</h4></div><span class="document-status ${validation.hardCopy ? "complete" : "pending"}">${documentStatus}</span></div><div class="copy-options"><label><input type="checkbox" data-validation-copy="hardCopy" ${validation.hardCopy ? "checked" : ""}> Hard Copy Received</label><label><input type="checkbox" data-validation-copy="softCopy" ${validation.softCopy ? "checked" : ""}> Soft Copy Received</label></div>${validation.softCopy && !validation.hardCopy ? `<div class="hard-copy-reminder"><strong>Hard copies must still be submitted to Finance.</strong><span>This request can be reviewed, but the physical documents remain outstanding.</span></div>` : ""}</div>
    <div class="validation-section line-review-section"><div class="validation-section-heading"><div><span class="eyebrow">Line-Item Review</span><h4>Review Details and Attachments</h4></div><div class="line-review-counts"><span class="valid">${validCount} Validated</span><span class="correction">${correctionCount} Needs Correction</span><span>${pendingCount} Pending</span></div></div>${request.type === "reimbursement" && reviewLines.some((line) => line.duplicate) ? `<div class="duplicate-check-summary"><strong>Duplicate invoice check found ${reviewLines.filter((line) => line.duplicate).length} possible match.</strong><span>Flagged documents cannot be validated until Finance reviews the previous reimbursement.</span></div>` : ""}<div class="table-wrap"><table class="validation-line-table"><thead><tr><th>Reference</th><th>Date</th><th>Particulars</th><th>Expense Account</th><th>Department</th><th>Amount</th><th>Attachment</th><th>Review</th></tr></thead><tbody>${reviewLines.map((line, index) => { const review = reviews[index]; return `<tr class="review-${review.status} ${line.duplicate ? "duplicate-invoice-row" : ""}"><td><strong>${line.reference}</strong>${line.duplicate ? `<span class="duplicate-invoice-flag">Duplicate Match</span><small>Previously in ${line.duplicate.requestId}</small>` : ""}</td><td>${line.date}</td><td>${line.particulars}</td><td>${line.expense}</td><td>${line.department}</td><td>${money(line.amount)}</td><td>${attachmentMenu(line, index)}</td><td>${lineReviewControl(review, index, line)}</td></tr>`; }).join("")}</tbody></table></div>${validation.attachmentPreview ? `<div class="attachment-preview-notice">Preview opened: <strong>${validation.attachmentPreview}</strong><button type="button" data-close-attachment-preview aria-label="Close attachment preview">×</button></div>` : ""}</div>
    <div class="validation-section"><div class="validation-section-heading"><div><span class="eyebrow">Accounting Entry</span><h4>Manual Debit and Credit Entry</h4></div><button type="button" data-add-accounting-row>+ Add Entry</button></div><div class="table-wrap"><table class="accounting-entry-table"><thead><tr><th>Account Name</th><th>Debit</th><th>Credit</th><th><span class="sr-only">Action</span></th></tr></thead><tbody>${validation.entries.map((entry, index) => `<tr><td><input data-accounting-index="${index}" data-accounting-field="account" value="${entry.account}" placeholder="Enter account name"></td><td><input type="number" min="0" data-accounting-index="${index}" data-accounting-field="debit" value="${entry.debit || ""}" placeholder="0.00"></td><td><input type="number" min="0" data-accounting-index="${index}" data-accounting-field="credit" value="${entry.credit || ""}" placeholder="0.00"></td><td><button type="button" class="remove-line-button" data-remove-accounting-row="${index}" ${validation.entries.length === 1 ? "disabled" : ""} aria-label="Remove accounting entry ${index + 1}">×</button></td></tr>`).join("")}</tbody><tfoot><tr><th>Totals</th><th>${money(debitTotal)}</th><th>${money(creditTotal)}</th><th></th></tr></tfoot></table></div><div class="balance-status ${balanced ? "balanced" : "unbalanced"}">${balanced ? "Debit and credit totals are balanced." : `Entries are out of balance by ${money(Math.abs(debitTotal - creditTotal))}.`}</div></div>
    <div class="validation-section validation-completion"><div><span class="eyebrow">Completion Details</span><h4>Finalize Document Validation</h4></div><div class="validation-completion-grid"><label>Document Validation Completion Date<input type="date" value="${validation.completionDate}" readonly placeholder="Set when completed"></label><label>Check Number <small>(Optional)</small><input data-validation-check-number value="${validation.checkNumber}" placeholder="Enter check number when available"></label></div><label>Reviewer Note<textarea data-validation-reviewer-note>${validation.reviewerNote}</textarea></label><div class="approval-actions"><button type="button" class="confirmation-button" data-complete-validation ${complete ? "" : "disabled"}>${validation.completionDate ? "Validation Completed" : "Complete Validation and Notify Finance Manager"}</button><button type="button" class="danger" ${correctionCount && correctionNotesComplete ? "" : "disabled"}>Return Lines for Correction</button><button type="button" class="danger">Disapprove</button></div>${!complete ? `<p class="validation-requirements">Complete VAT, EWT, document receipt status, balanced accounting entries, and mark every line item Valid before completing validation.</p>` : ""}</div>
  </section>${correctionReviewModal()}${duplicateInvoiceModal(reviewLines)}`;
}

function validationReadOnlySummary(request) {
  const validation = state.documentValidation;
  const lines = validationReviewLines(request);
  const savedResult = Boolean(validation.completionDate);
  const reviews = lines.map((_, index) => savedResult
    ? validation.lineReviews[index] || { status: "valid", note: "Validated against the supporting attachment.", reviewer: "Ms. Rhee", reviewedAt: "2026-08-05 10:30" }
    : { status: "valid", note: "Validated against the supporting attachment.", reviewer: "Ms. Rhee", reviewedAt: "2026-07-25 10:30" });
  const rate = validation.ewt && savedResult ? (validation.ewt === "other" ? Number(validation.otherEwt) || 0 : Number(validation.ewt) || 0) : 2;
  const taxes = taxBreakdown(request.amount, rate, validation.vat === "subject" || !savedResult);
  const debitTotal = validation.entries.reduce((sum, entry) => sum + (Number(entry.debit) || 0), 0);
  const creditTotal = validation.entries.reduce((sum, entry) => sum + (Number(entry.credit) || 0), 0);
  const validCount = reviews.filter((review) => review.status === "valid").length;
  const correctionCount = reviews.filter((review) => review.status === "correction").length;
  const pendingCount = reviews.filter((review) => review.status === "pending").length;
  const outcome = correctionCount ? "Returned for Correction" : pendingCount ? "In Review" : "Completed";
  return `<section class="validation-readonly"><div class="validation-section-heading"><div><span class="eyebrow">Finance Validation Result</span><h4>Read-Only Document Validation Summary</h4></div><span class="validation-outcome ${outcome === "Completed" ? "complete" : "pending"}">${outcome}</span></div><div class="readonly-summary-grid"><div><span>Reviewed By</span><strong>Ms. Rhee</strong></div><div><span>Completion Date</span><strong>${validation.completionDate || "2026-07-25"}</strong></div><div><span>VAT Classification</span><strong>${validation.vat === "subject" ? "Subject to VAT" : "Not Subject to VAT"}</strong></div><div><span>VAT Component</span><strong>${money(taxes.vatAmount)}</strong></div><div><span>Net of VAT / EWT Base</span><strong>${money(taxes.netOfVat)}</strong></div><div><span>EWT</span><strong>${rate}% · ${money(taxes.ewtAmount)}</strong></div><div><span>Total Amount Due</span><strong>${money(taxes.amountDue)}</strong></div><div><span>Submitted Copies</span><strong>${savedResult ? `${validation.hardCopy ? "Hard Copy" : "Hard Copy Pending"} · ${validation.softCopy ? "Soft Copy" : "No Soft Copy"}` : "Hard Copy · Soft Copy"}</strong></div><div><span>Accounting Entries</span><strong>${Math.abs(debitTotal - creditTotal) < 0.01 ? "Balanced" : "Out of Balance"} · ${money(debitTotal)}</strong></div></div><div class="readonly-line-summary"><div class="line-review-counts"><span class="valid">${validCount} Valid</span><span class="correction">${correctionCount} Needs Correction</span><span>${pendingCount} Pending</span></div><div class="table-wrap"><table class="validation-line-table readonly"><thead><tr><th>Reference</th><th>Vendor / Merchant</th><th>Particulars</th><th>Expense Account</th><th>Department</th><th>Amount</th><th>Attachment</th><th>Review Result</th></tr></thead><tbody>${lines.map((line, index) => { const review = reviews[index]; return `<tr class="review-${review.status}"><td>${line.reference}</td><td>${line.merchant || request.vendor}</td><td>${line.particulars}</td><td>${line.expense}</td><td>${line.department}</td><td>${money(line.amount)}</td><td>${attachmentMenu(line, index)}</td><td><span class="review-result ${review.status}">${review.status === "valid" ? "Valid" : review.status === "correction" ? "Needs Correction" : "Pending Review"}</span><p>${review.note || "No review note."}</p><small>${review.reviewer || "Ms. Rhee"} · ${review.reviewedAt || "2026-07-25 10:30"}</small></td></tr>`; }).join("")}</tbody></table></div></div><div class="readonly-review-note"><span>General Reviewer Note</span><p>${validation.reviewerNote}</p></div></section>`;
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

function approvalQueuePreview(request) {
  const financeAction = dashboardPreviewAction(request);
  const financeAssociateLabel = request.status.startsWith("Information Requested") ? "Respond to Information Request" : financeAction.label;
  const labels = { departmentHead: "Review Department Approval", financeAssociate: financeAssociateLabel, financeManager: "Review Budget and Approve", authorizedSignatory: "Review Signatory Approval", coo: "Review COO Approval", president: "Review President Approval", boardMember: "Review Board Approval", all: "Open Approval Workspace" };
  const owner = steps.find(([id]) => id === request.currentStep)?.[2] || "System";
  return `<aside class="panel dashboard-preview-pane approval-preview-pane" aria-live="polite">
    <div class="panel-header"><div><span class="eyebrow">Request Preview</span><h3>${request.id}</h3><p>${paymentTypes[request.type].label} · ${request.department}</p></div>${statusPill(request.status)}</div>
    <div class="preview-amount"><span>Transaction Amount</span><strong>${requestMoney(request)}</strong></div>
    <dl class="preview-detail-list"><div><dt>Requestor</dt><dd>${request.requestor}</dd></div><div><dt>Payee</dt><dd>${request.vendor}</dd></div><div><dt>Submitted</dt><dd>${request.submitted}</dd></div><div><dt>Aging</dt><dd>${agingDays(request)} day${agingDays(request) === 1 ? "" : "s"}</dd></div><div><dt>Current Owner</dt><dd>${owner}</dd></div><div><dt>Documents</dt><dd>${request.documents} attached · ${request.missing} missing</dd></div></dl>
    <div class="preview-route"><span>Routing Threshold</span><strong>${route(request)}</strong></div>
    <div class="approval-preview-actions"><button type="button" class="confirmation-button" data-open-approval-workspace="${request.id}" data-action-route="/requests/${request.id}">${labels[state.persona] || "Open Request"}</button><button type="button" data-open-approval-full="${request.id}">View Details</button></div>
  </aside>`;
}

function unifiedRoleAction(request, lifecycleButtons = "") {
  const currentOwner = steps.find(([id]) => id === request.currentStep)?.[2] || "System";
  if (request.backendId && request.backendStatus !== "submitted") return "";
  const informationAssignment = request.backendId && state.workflowQueue.find((entry) => entry.request_id === request.backendId && entry.state === "information_requested");
  if (informationAssignment && state.persona === "financeAssociate") return backendInformationResponseCard(request, informationAssignment);
  if (!request.backendId && request.infoRequest && state.persona === "financeAssociate") return mockInformationResponseCard(request);
  if (request.backendId && state.persona === "financeAssociate" && request.currentStep === 4) return `<section class="panel unified-action-note"><div class="unified-action-heading"><span class="eyebrow">Finance Associate Action</span><h3>Finance Validation</h3><p>Document, tax, and accounting validation will be connected in Phase 06. This approval stage cannot be completed from the prototype controls.</p></div></section>`;
  if (state.persona === "financeAssociate") {
    if (request.currentStep === 4) return `<section class="panel unified-action-note"><div class="unified-action-heading"><span class="eyebrow">Finance Associate Action</span><h3>Document Validation</h3><p>Validate documents, tax treatment, and accounting entries for this request.</p></div></section><section class="panel unified-action-workspace">${documentValidationWorkspace(request)}</section>`;
    if (request.currentStep === 9) return `<section class="panel unified-action-note"><div class="unified-action-heading"><span class="eyebrow">Finance Associate Action</span><h3>Voucher Creation</h3><p>${state.voucherDetails.created ? "Voucher generation is complete." : "Enter the payment processing details in the separate card below, then generate the voucher."}</p></div></section>${state.voucherDetails.created ? `<section class="panel"><div class="voucher-generation-success"><span class="voucher-generation-icon" aria-hidden="true">✓</span><div><span class="eyebrow">Voucher Ready</span><strong>Payment voucher generated successfully</strong><p>The generated voucher is shown in the separate Payment Voucher section below.</p></div></div></section>` : voucherFor(request, true)}`;
    if ([10, 12, 13].includes(request.currentStep)) return `<section class="panel unified-action-note"><div class="unified-action-heading"><span class="eyebrow">Finance Associate Action</span><h3>${request.status}</h3><p>Complete the action assigned at the current payment-processing stage.</p></div></section>${paymentOperationsPanel(request)}`;
  }
  if (state.persona === "authorizedSignatory" && request.currentStep === 11) return `<section class="panel unified-action-note"><div class="unified-action-heading"><span class="eyebrow">Authorized Signatory Action</span><h3>Signatory Approval</h3><p>Review the approved voucher, payee, amount, and payment instruction before authorizing the transaction.</p></div></section>${paymentOperationsPanel(request)}`;
  const approvalRoleMatches = state.persona === "departmentHead" && request.currentStep === 3 || state.persona === "financeManager" && request.currentStep === 5 || state.persona === "coo" && request.currentStep === 7 || state.persona === "president" && request.currentStep === 8 || state.persona === "boardMember" && request.currentStep === 8.5 || state.persona === "all" && [3, 5, 7, 8, 8.5].includes(request.currentStep);
  if (request.backendId && approvalRoleMatches) return backendApprovalCard(request, lifecycleButtons);
  if (approvalRoleMatches) return `<section class="panel unified-action-workspace approval-decision-card"><div class="unified-action-heading"><span class="eyebrow">${personas[state.persona].label} Action</span><h3>${request.status}</h3><p>Review the request and supporting documents, then record your decision.</p></div>${["financeManager", "coo", "president", "boardMember"].includes(state.persona) ? validationReadOnlySummary(request) : ""}<div class="approval-actions"><button class="confirmation-button approve-notify-button">Approve and Notify Next Owner</button>${canRejectApproval(request) ? approvalRejectControl(request) : `<button type="button" class="request-info-button" data-mock-request-information>Request More Information</button>`}</div><label class="approval-reviewer-note">Reviewer Note<textarea>Reviewed request details, supporting documents, and approval route.</textarea></label>${lifecycleButtons ? `<div class="approval-lifecycle-actions">${lifecycleButtons}</div>` : ""}</section>`;
  if (state.persona === "requestor" && request.currentStep <= 2) return `<section class="panel unified-action-note"><div class="unified-action-heading"><span class="eyebrow">Requestor Action</span><h3>Complete Required Documents</h3><p>Upload or replace the documents required before this request can proceed.</p></div></section><section class="panel unified-action-workspace"><button type="button" class="primary-button" data-tab="uploads">Manage Document Uploads</button></section>`;
  return `<section class="panel unified-action-workspace read-only"><div class="unified-action-heading"><span class="eyebrow">Current Workflow Owner</span><h3>${request.status}</h3><p>${currentOwner} currently owns this request. No action is required from ${personas[state.persona].label}.</p></div></section>`;
}

function canManageRequestLifecycle() {
  return state.authUser?.roles?.some((role) => ["department_head", "finance_associate", "finance_manager", "system_administrator"].includes(role));
}

function backendInformationResponseCard(request, assignment) {
  const stage = assignment.route.stages[assignment.current_stage];
  return `<section class="panel unified-action-workspace approval-decision-card"><div class="unified-action-heading"><span class="eyebrow">Finance Associate Action</span><h3>Respond to Information Request</h3><p>${escapeHtml(stage.purpose)} will resume after you provide the requested information. Earlier approvals remain recorded.</p></div><div class="approval-information-question"><strong>Reviewer question</strong><p>${escapeHtml(assignment.information_request?.note || "Open the workflow history for the request details.")}</p></div><div class="approval-actions"><button type="button" class="confirmation-button" data-backend-respond-information="${escapeHtml(request.id)}">Respond and Return to Reviewer</button></div></section>`;
}

function mockInformationResponseCard(request) {
  return `<section class="panel unified-action-workspace approval-decision-card"><div class="unified-action-heading"><span class="eyebrow">Finance Associate Action</span><h3>Respond to Information Request</h3><p>The request returns to the same reviewer after your response.</p></div><div class="approval-information-question"><strong>Reviewer question</strong><p>${escapeHtml(request.infoRequest.note)}</p></div><div class="approval-actions"><button type="button" class="confirmation-button" data-mock-respond-information="${escapeHtml(request.id)}">Respond and Return to Reviewer</button></div></section>`;
}

function backendApprovalCard(request, lifecycleButtons = "") {
  const assignment = state.workflowQueue.find((entry) => entry.request_id === request.backendId);
  if (assignment?.state === "information_requested") return backendInformationResponseCard(request, assignment);
  if (!assignment || assignment.state !== "active") return `<section class="panel unified-action-workspace read-only"><div class="unified-action-heading"><h3>No assigned approval action</h3><p>This request is not currently assigned to your account.</p></div></section>`;
  const stage = assignment.route.stages[assignment.current_stage];
  if (stage.role === "finance_associate") return `<section class="panel unified-action-note"><div class="unified-action-heading"><h3>Finance Validation</h3><p>This stage awaits the Phase 06 validation workbench.</p></div></section>`;
  return `<section class="panel unified-action-workspace approval-decision-card"><div class="unified-action-heading"><span class="eyebrow">Assigned Approval</span><h3>${escapeHtml(stage.purpose)}</h3><p>Review the request and supporting documents before recording your decision.</p></div><div class="approval-actions"><button type="button" class="confirmation-button" data-backend-approve="${escapeHtml(request.id)}">Approve</button>${canRejectApproval(request) ? approvalRejectControl(request) : `<button type="button" class="request-info-button" data-backend-request-information="${escapeHtml(request.id)}">Request More Information</button>`}</div><label class="approval-reviewer-note">Reviewer Note<textarea placeholder="Add a note for the approval history"></textarea></label>${lifecycleButtons ? `<div class="approval-lifecycle-actions">${lifecycleButtons}</div>` : ""}</section>`;
}

function approvalRejectControl(request) {
  return `<div class="first-stage-reject-control"><label>Reject option<select data-first-stage-reject-choice="${escapeHtml(request.id)}"><option value="">Select an outcome</option><option value="return">Return to Requestor for editing</option><option value="decline">Fully Decline</option></select></label><button type="button" class="danger" data-first-stage-reject-submit="${escapeHtml(request.id)}" disabled>Continue</button></div>`;
}

function canRejectApproval(request) {
  const allowed = { 3: ["departmentHead", "department_head", 0], 5: ["financeManager", "finance_manager", 2] }[request.currentStep];
  if (!allowed || request.backendId && request.backendStatus !== "submitted") return false;
  if (state.persona !== allowed[0] && state.persona !== "all") return false;
  if (!request.backendId) return true;
  return state.workflowQueue.some((entry) => entry.request_id === request.backendId && entry.current_stage === allowed[2] && entry.route.stages[allowed[2]]?.role === allowed[1]);
}

function ownsApiRequest(request) {
  return Boolean(request.requestorId && request.requestorId === state.authUser?.id);
}

function editReturnedApiRequest(request) {
  const draft = {
    id: `RETURNED-${request.backendId.slice(0, 8).toUpperCase()}`,
    backendId: request.backendId,
    backendVersion: request.backendVersion,
    backendStatus: "returned",
    type: request.type,
    requestor: request.requestor,
    department: request.department,
    savedAt: new Date().toISOString(),
    createdAt: request.submitted,
    currency: request.currency,
    otherCurrency: "",
    budgeted: request.budgeted,
    liquidationAdvanceAmount: Number(request.typeData?.liquidation_advance_amount) || 0,
    purpose: request.purpose,
    lineItems: request.lines.map((line) => apiLineToPrototype(request.type, line)),
    controls: [],
  };
  state.drafts = [...state.drafts.filter((item) => item.backendId !== request.backendId), draft];
  openDraft(draft.id);
}

function unifiedRequestDetails() {
  const request = requests.find((item) => item.id === state.requestDetailId || item.id === state.selectedId);
  if (!request) return `<section class="panel empty-state"><h3>Request not found</h3><p>Return to the dashboard and select an available request.</p></section>`;
  const ownsRequest = ownsApiRequest(request);
  const lifecycleActions = request.backendId ? `<section class="panel request-action-footer"><div><span class="eyebrow">Request Lifecycle</span><p>Actions are validated and recorded by the backend.</p></div><div class="request-submit-actions">${request.backendStatus === "returned" && ownsRequest ? `<button type="button" data-edit-returned="${request.id}">Edit Request</button><button type="button" class="confirmation-button" data-api-lifecycle="resubmit" data-api-request="${request.id}">Resubmit</button>` : ""}${["submitted", "returned"].includes(request.backendStatus) && (ownsRequest || canManageRequestLifecycle()) ? `<button type="button" class="danger" data-api-lifecycle="cancel" data-api-request="${request.id}">Cancel Request</button>` : ""}${request.backendStatus === "cancelled" && canManageRequestLifecycle() ? `<button type="button" class="primary-button" data-api-lifecycle="reopen" data-api-request="${request.id}">Reopen Request</button>` : ""}</div></section>` : "";
  const lifecycleButtons = lifecycleActions.match(/<div class="request-submit-actions">([\s\S]*?)<\/div>/)?.[1] || "";
  const roleAction = unifiedRoleAction(request, lifecycleButtons);
  const separateLifecycle = roleAction.includes("approval-decision-card") ? "" : lifecycleActions;
  return `<section class="metric-detail-view unified-request-page ${conversationLayoutClass()}"><div class="metric-detail-actions"><button type="button" class="back-button" data-back-unified-request>← Back</button></div><div class="metric-detail-header"><div><span class="eyebrow">Request Details</span><h3>${request.id}</h3><p>${paymentTypes[request.type].label} · ${request.department} · ${requestMoney(request)}</p></div>${statusPill(request.status)}</div>${detail(request, true)}${conversationPanel(request)}${separateLifecycle}${roleAction}${voucherFor(request)}${vendorNotificationModal(request)}${documentViewerModal(request)}</section>`;
}

function approvals() {
  if (state.authStatus === "authenticated" && state.workflowQueueError) return `<section class="panel empty-state"><h3>Approval queue unavailable</h3><p>${escapeHtml(state.workflowQueueError)}</p><button type="button" data-retry-workflow-queue>Try again</button></section>`;
  const queue = approvalRequests();
  if (!queue.length) return `<section class="approval-landing"><div class="approval-page-intro"><div><span class="eyebrow">${personas[state.persona].label} Workspace</span><h3>${state.persona === "authorizedSignatory" ? "Signatory Approval Queue" : "Approval Queue"}</h3><p>Click a request to preview it. Double-click to open its details.</p></div></div><div class="approval-queue-workspace approval-queue-workspace-empty">${requestTable(queue)}</div></section>`;
  const selected = queue.find((r) => r.id === state.selectedId) || queue[0];
  if (state.approvalView === "list") return `<section class="approval-landing"><div class="approval-page-intro"><div><span class="eyebrow">${personas[state.persona].label} Workspace</span><h3>${state.persona === "authorizedSignatory" ? "Signatory Approval Queue" : "Approval Queue"}</h3><p>Click a request to preview it. Double-click to open its details.</p></div><span class="count">${queue.length} requests</span></div><div class="approval-queue-workspace">${requestTable(queue)}${approvalQueuePreview(selected)}</div></section>`;
  if (state.approvalView === "detail") return `<section class="approval-request-page ${conversationLayoutClass()}"><div class="metric-detail-actions"><button type="button" class="back-button" data-back-approval-list>← Back to Live Requests</button></div><div class="metric-detail-header"><div><span class="eyebrow">Request Review</span><h3>${selected.id}</h3><p>Review the request information before beginning the approval process.</p></div>${statusPill(selected.status)}</div>${detail(selected, true)}${conversationPanel(selected)}<div class="approval-start-card"><div><span class="eyebrow">Next Step</span><h4>Ready to Review This Request?</h4><p>Continue to the dedicated approval workspace to validate documents, record notes, and make a decision.</p></div><button type="button" class="primary-button" data-start-approval="${selected.id}">Go Through Approval</button></div></section>`;
  if (selected.backendId) return `<section class="approval-review-page ${conversationLayoutClass()}"><div class="metric-detail-actions"><button type="button" class="back-button" data-back-approval-detail="${selected.id}">← Back to Request Details</button></div><div class="metric-detail-header"><div><span class="eyebrow">Approval Workspace</span><h3>${selected.id}</h3><p>${paymentTypes[selected.type].label} · ${selected.department} · ${requestMoney(selected)}</p></div>${statusPill(selected.status)}</div>${detail(selected, true)}${conversationPanel(selected)}${backendApprovalCard(selected)}${documentViewerModal(selected)}</section>`;
  if (selected.infoRequest && state.persona === "financeAssociate") return `<section class="approval-review-page ${conversationLayoutClass()}"><div class="metric-detail-actions"><button type="button" class="back-button" data-back-approval-detail="${selected.id}">← Back to Request Details</button></div><div class="metric-detail-header"><div><span class="eyebrow">Approval Workspace</span><h3>${selected.id}</h3></div>${statusPill(selected.status)}</div>${detail(selected, true)}${conversationPanel(selected)}${mockInformationResponseCard(selected)}</section>`;
  const isVoucherCreation = state.persona === "financeAssociate" && selected.currentStep === 9;
  const actionTitle = state.persona === "financeAssociate" && selected.currentStep === 4 ? "Document Validation" : isVoucherCreation ? "Voucher Creation" : "Approval Action";
  const primaryAction = state.persona === "financeAssociate" && selected.currentStep === 4 ? "Open Document Validation" : "Approve and Notify Next Owner";
  const isDocumentValidation = state.persona === "financeAssociate" && selected.currentStep === 4;
  const showReadOnlyValidation = ["financeManager", "coo", "president", "boardMember"].includes(state.persona);
  return `<section class="approval-review-page ${conversationLayoutClass()}"><div class="metric-detail-actions"><button type="button" class="back-button" data-back-approval-detail="${selected.id}">← Back to Request Details</button></div><div class="metric-detail-header"><div><span class="eyebrow">Finance Associate Workspace</span><h3>${actionTitle}</h3><p>${selected.id} · ${paymentTypes[selected.type].label} · ${money(selected.amount)}</p></div>${statusPill(selected.status)}</div><section class="panel action-panel">${detail(selected)}${isDocumentValidation ? documentValidationWorkspace(selected) : isVoucherCreation ? (state.voucherDetails.created ? "" : voucherFor(selected, true)) : `${showReadOnlyValidation ? validationReadOnlySummary(selected) : ""}<div class="approval-actions"><button class="confirmation-button approve-notify-button">${primaryAction}</button>${canRejectApproval(selected) ? approvalRejectControl(selected) : `<button type="button" class="request-info-button" data-mock-request-information>Request More Information</button>`}</div><label>Reviewer Note<textarea>Validated supporting documents and routing threshold.</textarea></label>`}</section>${conversationPanel(selected)}${documentViewerModal(selected)}</section>`;
}

function paymentOperationsPanel(request) {
  if (![10, 11, 12, 13].includes(request.currentStep) && !request.pickupAvailableAt) return "";
  const actor = personas[state.persona].name;
  const canFinanceAct = ["all", "financeAssociate"].includes(state.persona);
  const canAuthorize = ["all", "authorizedSignatory"].includes(state.persona);
  const records = [
    request.bankSubmittedAt && ["Prepare for Authorization", request.bankSubmittedAt, request.bankSubmittedBy],
    request.bankAuthorizedAt && ["Signatory Approval Completed", request.bankAuthorizedAt, request.bankAuthorizedBy],
    request.vendorNotifiedAt && [request.vendorItems?.length > 1 ? `${request.vendorItems.length} Vendor Emails Sent` : "Vendor Email Sent", request.vendorNotifiedAt, request.vendorNotifiedBy],
    request.pickupAvailableAt && ["Payment Available for Pick-up", request.pickupAvailableAt, request.pickupAvailableBy],
  ].filter(Boolean);
  const vendorItems = request.vendorItems?.length ? request.vendorItems : [{ vendor: request.vendor, email: "vendor@example.com", item: `${paymentTypes[request.type].label} · ${request.id}`, amount: request.amount }];
  const multipleVendors = vendorItems.length > 1;
  const vendorNotificationList = request.currentStep === 12 ? `<section class="vendor-notification-list"><div class="validation-section-heading"><div><span class="eyebrow">Notification Recipients</span><h4>${vendorItems.length} vendor${multipleVendors ? "s" : ""} ready for notification</h4></div><span class="count">${vendorItems.length}</span></div>${vendorItems.map((item) => `<article><div><strong>${item.vendor}</strong><span>${item.email}</span><small>${item.item}</small></div><div class="vendor-notification-amount"><strong>${money(item.amount)}</strong><span class="review-result pending">Pending</span></div></article>`).join("")}<p>${multipleVendors ? "Each vendor receives a separate email containing only its assigned line items and amount." : "The vendor receives the payment-processing notice for this request."}</p></section>` : "";
  const action = request.currentStep === 10
    ? `<button type="button" class="primary-button operation-button" data-bank-approval="${request.id}" ${canFinanceAct ? "" : "disabled"}>Prepare for Authorization</button>`
    : request.currentStep === 11
    ? `<button type="button" class="primary-button operation-button" data-signatory-approval="${request.id}" ${canAuthorize ? "" : "disabled"}>For Signatory Approval</button>`
    : request.currentStep === 12
    ? `<button type="button" class="primary-button operation-button" data-open-vendor-notifications="${request.id}" ${canFinanceAct ? "" : "disabled"}>Send Vendor Notification</button>`
    : request.pickupAvailableAt
    ? `<button type="button" class="operation-button completed" disabled>Payment Available for Pick-up ✓</button>`
    : `<button type="button" class="primary-button operation-button" data-payment-pickup="${request.id}" ${canFinanceAct ? "" : "disabled"}>Payment Available for Pick-up</button>`;
  const help = request.currentStep === 10 ? "Submit the prepared payment instruction to the bank approval queue." : request.currentStep === 11 ? "Authorized signatories review and approve the bank instruction." : request.currentStep === 12 ? "Send the automated payment-processing email to the vendor." : "Record that the payment can now be collected and notify the requestor and vendor.";
  return `<section class="panel payment-operation-panel"><div class="panel-header"><div><span class="eyebrow">Payment Operations</span><h3>${request.status}</h3></div>${statusPill(request.status)}</div><p>${help}</p>${vendorNotificationList}<div class="payment-operation-action">${action}<small>Action performed as ${actor}</small></div>${records.length ? `<div class="operation-audit-list">${records.map(([label, timestamp, user]) => `<div><span>${label}</span><strong>${new Date(timestamp).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</strong><small>${user}</small></div>`).join("")}</div>` : ""}</section>`;
}

function vendorNotificationModal(request) {
  if (state.vendorNotificationRequestId !== request.id) return "";
  const vendorItems = request.vendorItems || [];
  const remaining = vendorItems.filter((item) => !item.sentAt).length;
  return `<div class="vendor-notification-modal-backdrop" data-vendor-notification-backdrop><section class="vendor-notification-modal" role="dialog" aria-modal="true" aria-labelledby="vendor-notification-title"><header><div><span class="eyebrow">Vendor Notification</span><h3 id="vendor-notification-title">${request.id}</h3><p>Review each recipient and send notifications individually or send all remaining emails.</p></div><button type="button" data-close-vendor-notifications aria-label="Close vendor notifications">×</button></header><div class="vendor-notification-modal-summary"><div><span>Request</span><strong>${request.id}</strong></div><div><span>Total Amount</span><strong>${requestMoney(request)}</strong></div><div><span>Vendors</span><strong>${vendorItems.length}</strong></div><div><span>Remaining</span><strong>${remaining}</strong></div></div><div class="vendor-notification-modal-list">${vendorItems.map((item, index) => `<article><div><strong>${item.vendor}</strong><span>${item.email}</span><small>${item.item}</small></div><div class="vendor-notification-modal-action"><strong>${money(item.amount)}</strong><button type="button" class="${item.sentAt ? "completed" : "confirmation-button"}" data-send-one-vendor="${index}" ${item.sentAt ? "disabled" : ""}>${item.sentAt ? "Sent" : "Send"}</button></div></article>`).join("")}</div><footer><p>${remaining ? `${remaining} vendor notification${remaining === 1 ? "" : "s"} remaining.` : "All vendor notifications have been sent."}</p><div><button type="button" data-close-vendor-notifications>Close</button><button type="button" class="confirmation-button" data-send-all-vendors ${remaining ? "" : "disabled"}>${remaining ? `Send All Remaining (${remaining})` : "All Sent"}</button></div></footer></section></div>`;
}

function tracker() {
  const visibleRequests = personaRequests();
  const selected = visibleRequests.find((r) => r.id === state.trackerRequestId);
  if (selected) return `<section class="metric-detail-view"><div class="metric-detail-actions"><button type="button" class="back-button" data-close-tracker="true">← Back to Payment Tracker</button></div><div class="metric-detail-header"><div><span class="eyebrow">Tracker Detail</span><h3>${selected.id}</h3><p>Review request information and its current payment progress.</p></div>${statusPill(selected.status)}</div>${paymentOperationsPanel(selected)}${detail(selected)}${workflow(selected.currentStep)}${vendorNotificationModal(selected)}</section>`;
  const paymentStatus = (request) => {
    const released = request.currentStep > 13;
    const label = released ? "Released" : request.pickupAvailableAt ? "Available for Pickup" : request.currentStep === 11 ? "Awaiting Signatory Approval" : request.currentStep === 10 ? "Payment Preparation" : "Pending Release";
    return `<span class="tracker-status-text ${released || request.pickupAvailableAt ? "complete" : "pending"}">${label}</span>`;
  };
  return `<section class="panel"><div class="panel-header"><h3>Payment Tracker</h3></div><div class="table-wrap responsive-request-table tracker-table"><table><thead><tr><th>Voucher</th><th>Submitted</th><th>Returned</th><th>Resubmitted</th><th>Approval</th><th>Payment Status</th></tr></thead><tbody>${visibleRequests.map((r, i) => `<tr data-tracker-request="${r.id}"><td data-label="Request"><strong>${r.id}</strong></td><td data-label="Submitted">${r.submitted}</td><td data-label="Returned">${r.returned || "-"}</td><td data-label="Resubmitted">${r.resubmitted || "-"}</td><td data-label="Approval">${i === 0 ? "Pending" : "2026-06-24"}</td><td data-label="Payment Status">${paymentStatus(r)}</td></tr>`).join("")}</tbody></table></div></section>`;
}

function documentUploads() {
  const backendCandidates = state.authStatus === "authenticated" ? backendDocumentCandidates() : [];
  if (backendCandidates.length) {
    const selected = backendCandidates.find((request) => request.id === state.uploadId) || backendCandidates[0];
    const documents = state.documentRecords[selected.backendId] || [];
    const requirementSet = state.documentRequirements[selected.backendId] || { requirements: [], can_submit_documents: true };
    const requirementRows = requirementSet.requirements.flatMap((requirement) => {
      const rowFor = (line = null) => {
        const matching = documents.filter((item) => item.document_type_id === requirement.document_type_id && (line ? item.line_id === line.line_id : !item.line_id));
        return { ...requirement, ...(line ? { line_id: line.line_id, line_position: line.position, line_particulars: line.particulars } : {}), complete: matching.length >= (requirement.minimum_count || 1), document: matching[0] };
      };
      return requirement.scope === "line" ? (requirement.lines || []).map(rowFor) : [rowFor()];
    });
    const classifiedIds = new Set(requirementRows.map((row) => row.document?.id).filter(Boolean));
    const unclassified = documents.filter((item) => !classifiedIds.has(item.id));
    const canReview = state.authUser?.roles?.some((role) => ["finance_associate", "finance_manager", "system_administrator"].includes(role));
    const rows = [
      ...requirementRows.map(({ document, ...requirement }) => ({ document, requirement })),
      ...unclassified.map((document) => ({ document, requirement: null })),
    ];
    const completed = requirementRows.filter((item) => item.complete).length;
    const list = rows.length ? rows.map(({ document, requirement }) => {
      const baseName = requirement?.document_type_name || document?.filename || "Supporting document";
      const name = requirement?.guidance ? `${baseName} (${requirement.guidance.toLocaleLowerCase()})` : baseName;
      const lineLabel = requirement?.line_position ? ` · Line ${requirement.line_position}: ${requirement.line_particulars}` : "";
      const status = document ? "uploaded" : "missing";
      const versionText = document ? `Version ${document.current_version} · ${(document.byte_size / 1024).toFixed(1)} KB` : "No file uploaded";
      const warning = document?.duplicate_warning ? `<p class="document-warning">Possible duplicate: already used on ${document.duplicate_uses.map((item) => escapeHtml(item.request_number || item.request_id)).join(", ")}.</p>` : "";
      const reviewControls = canReview && document ? `<div class="document-review-controls"><label>Hard copy<select data-document-hard-copy="${document.id}"><option value="not_required" ${document.hard_copy_status === "not_required" ? "selected" : ""}>Not required</option><option value="required" ${document.hard_copy_status === "required" ? "selected" : ""}>Required</option><option value="received" ${document.hard_copy_status === "received" ? "selected" : ""}>Received</option><option value="missing" ${document.hard_copy_status === "missing" ? "selected" : ""}>Missing</option><option value="waived" ${document.hard_copy_status === "waived" ? "selected" : ""}>Waived</option></select></label><label>Finance review<select data-document-review="${document.id}"><option value="">Not reviewed</option><option value="accepted" ${document.review_decision === "accepted" ? "selected" : ""}>Accepted</option><option value="replacement_required" ${document.review_decision === "replacement_required" ? "selected" : ""}>Replacement required</option><option value="rejected" ${document.review_decision === "rejected" ? "selected" : ""}>Rejected</option></select></label></div>` : "";
      const uploadControl = document
        ? `<label class="line-upload-control document-upload-button" title="Replace ${escapeHtml(name)}"><input type="file" data-document-replace="${document.id}" aria-label="Replace ${escapeHtml(name)} for line ${requirement?.line_position || "request"}">${uploadIcon}<span>Replace File</span></label>`
        : `<label class="line-upload-control document-upload-button" title="Upload ${escapeHtml(name)}"><input type="file" data-document-type="${requirement.document_type_id}" data-document-line="${requirement.line_id || ""}" aria-label="Upload ${escapeHtml(name)}${requirement?.line_position ? ` for line ${requirement.line_position}` : ""}">${uploadIcon}<span>Upload Files</span></label>`;
      return `<article class="document-file-row ${status}"><div class="document-file-info"><div><strong>${escapeHtml(name)}${escapeHtml(lineLabel)}</strong><span class="${requirement?.required ? "required-tag" : "conditional-tag"}">${requirement?.required ? "Required" : "Conditional"}</span></div>${uploadControl}<p class="${document ? "" : "missing-file"}">${document ? `<span class="file-icon">${escapeHtml(document.filename.split(".").pop().toUpperCase())}</span>${escapeHtml(document.filename)} <small>${versionText}</small>` : versionText}</p>${warning}${reviewControls}</div>${document ? `<div class="attachment-actions"><a class="secondary-button" href="${dataSource.documentContentUrl(document.id)}" target="_blank" rel="noopener">Preview</a><button type="button" class="danger" data-remove-document="${document.id}">Remove</button></div>` : ""}</article>`;
    }).join("") : `<div class="empty-state"><strong>No document rules configured</strong><p>You can still attach supporting files. Finance can configure formal requirements later.</p></div>`;
    const addSupporting = `<article class="document-file-row supporting-document"><div class="document-file-info"><div><strong>Additional supporting document</strong><span class="conditional-tag">Optional</span></div><label class="line-upload-control document-upload-button" title="Upload an additional supporting document"><input type="file" data-document-type="" aria-label="Upload an additional supporting document">${uploadIcon}<span>Upload Files</span></label><p>Attach a file that is not represented by a configured requirement.</p></div></article>`;
    return `<section class="document-upload-layout">
      <section class="panel upload-request-list"><div class="panel-header"><h3>Editable Requests</h3><span class="count">${backendCandidates.length}</span></div><div class="upload-request-buttons">${backendCandidates.map((request) => `<button data-upload-request="${request.id}" class="${selected.id === request.id ? "active" : ""}"><div><strong>${escapeHtml(request.id)}</strong><span>${paymentTypes[request.type].label}</span></div><small>${escapeHtml(request.backendStatus || "draft")}</small></button>`).join("")}</div></section>
      <section class="panel upload-workspace"><div class="panel-header"><div><span class="eyebrow">${paymentTypes[selected.type].label}</span><h3>${escapeHtml(selected.id)}</h3></div><span class="upload-progress ${completed === requirementRows.length ? "complete" : "pending"}">${state.documentLoading ? "Updating requirements…" : `${completed}/${requirementRows.length} requirements complete`}</span></div>
        <dl class="upload-request-meta"><div><dt>Requestor</dt><dd>${escapeHtml(selected.requestor || activeRequestor())}</dd></div><div><dt>Department</dt><dd>${escapeHtml(selected.department || "Not selected")}</dd></div><div><dt>Payee</dt><dd>${escapeHtml(selected.vendor || "To be confirmed")}</dd></div><div><dt>Amount</dt><dd>${money(selected.amount || 0, selected.currency || "PHP")}</dd></div></dl>
        ${state.documentLoading ? `<div class="empty-state"><p>Loading documents…</p></div>` : state.documentError ? `<div class="empty-state"><strong>Documents unavailable</strong><p>${escapeHtml(state.documentError)}</p><button type="button" data-retry-documents>Try again</button></div>` : `<div class="document-file-list">${list}${addSupporting}</div>`}
        <div class="upload-footer"><p>PDF, images and Office files · 50 MB/file · 100 MB/request.</p></div>
      </section>
    </section>`;
  }
  const selected = uploadSamples.find((request) => request.id === state.uploadId) || uploadSamples[0];
  const required = selected.documents.filter((document) => document.required);
  const completed = required.filter((document) => document.file).length;
  return `<section class="document-upload-layout">
    <section class="panel upload-request-list"><div class="panel-header"><h3>Requests Needing Documents</h3><span class="count">${uploadSamples.length}</span></div><div class="upload-request-buttons">${uploadSamples.map((request) => { const requiredDocuments = request.documents.filter((document) => document.required); const uploadedDocuments = requiredDocuments.filter((document) => document.file).length; return `<button data-upload-request="${request.id}" class="${selected.id === request.id ? "active" : ""}"><div><strong>${request.id}</strong><span>${paymentTypes[request.type].label}</span></div><small>${uploadedDocuments}/${requiredDocuments.length} required</small></button>`; }).join("")}</div></section>
    <section class="panel upload-workspace"><div class="panel-header"><div><span class="eyebrow">${paymentTypes[selected.type].label}</span><h3>${selected.id}</h3></div><span class="upload-progress ${completed === required.length ? "complete" : "pending"}">${completed}/${required.length} required uploaded</span></div>
      <dl class="upload-request-meta"><div><dt>Requestor</dt><dd>${selected.requestor}</dd></div><div><dt>Department</dt><dd>${selected.department}</dd></div><div><dt>Payee</dt><dd>${selected.vendor}</dd></div><div><dt>Amount</dt><dd>${money(selected.amount)}</dd></div></dl>
      <div class="document-file-list">${selected.documents.map((document, documentIndex) => `<article class="document-file-row demo-document ${document.file ? "uploaded" : "missing"}"><div class="document-file-info"><div><strong>${escapeHtml(document.name)}</strong><span class="${document.required ? "required-tag" : "conditional-tag"}">${document.required ? "Required" : "Conditional"}</span></div><label class="line-upload-control document-upload-button" title="${document.file ? "Replace" : "Upload"} ${escapeHtml(document.name)}"><input type="file" data-demo-document="${documentIndex}" aria-label="${document.file ? "Replace" : "Upload"} ${escapeHtml(document.name)}">${uploadIcon}<span>${document.file ? "Replace File" : "Upload Files"}</span></label>${document.file ? `<p><span class="file-icon">${escapeHtml(document.file.split(".").pop().toUpperCase())}</span>${escapeHtml(document.file)} <small>${escapeHtml(document.size)}</small></p>` : `<p class="missing-file">No File Uploaded</p>`}</div></article>`).join("")}</div>
      <div class="upload-footer"><p>PDF, images and Office files · 50 MB/file · 100 MB/request.</p><button class="primary-button">Save Documents</button></div>
    </section>
  </section>`;
}

function documents() {
  return `<section class="doc-grid">${Object.entries(paymentTypes).map(([, type]) => `<article class="panel"><h3>${type.label}</h3><h4>Mandatory fields</h4><ul class="check-list">${type.required.map((item) => `<li><span class="ok">✓</span>${item}</li>`).join("")}</ul><h4>Upload documents</h4><div class="chip-row">${type.uploadDocuments.map((item) => `<span>${item}</span>`).join("")}</div></article>`).join("")}<article class="panel todo-panel"><h3>Future modules</h3><div class="chip-row"><span>Petty Cash</span><span>Credit Card Payments</span><span>Cash Advance Guidelines</span><span>Procurement alignment</span></div></article></section>`;
}

function systemGuide() {
  const roleNames = state.authUser?.roles?.map((role) => role.toLocaleLowerCase()) || [];
  const knownAudiences = ["system_administrator", "finance_manager", "finance_associate", "authorized_signatory", "department_head", "board_member", "president", "coo", "requestor"];
  const roleAudience = knownAudiences.find((audience) => roleNames.some((role) => role.includes(audience))) || "requestor";
  const personaAudiences = { all: "system_administrator", requestor: "requestor", departmentHead: "department_head", financeAssociate: "finance_associate", financeManager: "finance_manager", authorizedSignatory: "authorized_signatory", coo: "coo", president: "president", boardMember: "board_member" };
  const personaAudience = personaAudiences[state.persona] || "requestor";
  const audience = state.authUser ? roleAudience : personaAudience;
  const audienceLabels = { system_administrator: "System Administrator guide", finance_manager: "Finance Manager guide", finance_associate: "Finance Associate guide", requestor: "Requestor guide", department_head: "Department Head guide", coo: "COO guide", president: "President guide", board_member: "Board Member guide", authorized_signatory: "Authorized Signatory guide" };
  const visibleSections = guideSections
    .map((section) => ({ ...section, cards: section.cards.filter((card) => card.audiences.includes(audience)) }))
    .filter((section) => section.cards.length);
  const visibleStages = guideStages.filter(([number]) => guideStageAudiences[audience]?.includes(number));
  const sections = visibleSections.map((section) => `<section class="guide-section" id="guide-${section.id}" data-guide-section>
    <header class="guide-section-heading"><div><span class="eyebrow">${section.number}</span><h3>${section.title}</h3><p>${section.intro}</p></div></header>
    <div class="guide-card-grid">${section.cards.map((card) => `<details class="guide-card" data-guide-card ${window.matchMedia("(min-width: 701px)").matches ? "open" : ""}><summary><span><h4>${card.title}</h4><p class="guide-path">${card.path}</p></span><span class="guide-card-toggle">Steps</span></summary><ol>${card.steps.map((step) => `<li>${step}</li>`).join("")}</ol></details>`).join("")}</div>
    <p class="guide-note"><strong>Remember:</strong> ${section.note}</p>
  </section>`).join("");
  return `<section class="system-guide-page">
    <header class="guide-hero"><div><span class="eyebrow">${audienceLabels[audience]}</span><h2>Payment Module quick reference</h2><p>Practical procedures, approval rules, and controls for using the Payment Module.</p></div><button type="button" class="guide-print-button" data-guide-print>Print / Save PDF</button></header>
    <nav class="guide-anchor-nav" aria-label="Guide sections">${visibleSections.map((section) => `<a href="#guide-${section.id}" data-guide-anchor="guide-${section.id}"><span>${section.number}</span>${section.title}</a>`).join("")}</nav>
    <div class="guide-content">
      <search class="guide-search"><label for="guideSearch">Search the Payment Module guide</label><div><span aria-hidden="true">⌕</span><input id="guideSearch" type="search" placeholder="Search procedures, roles, or payment stages" autocomplete="off" data-guide-search></div><p role="status" data-guide-search-status>Search procedures, approval rules, documents, and controls.</p></search>
      ${visibleStages.length ? `<section class="guide-workflow" aria-labelledby="guide-workflow-title"><div class="guide-section-heading compact"><div><span class="eyebrow">Your workflow</span><h3 id="guide-workflow-title">Payment workflow at a glance</h3><p>These are the payment stages relevant to your role.</p></div></div><div class="guide-stage-list">${visibleStages.map(([number, name, owner, detail]) => `<article data-guide-card><span>${number}</span><div><h4>${name}</h4><small>${owner}</small><p>${detail}</p></div></article>`).join("")}</div></section>` : ""}
      ${sections}
      <div class="guide-empty" data-guide-empty hidden><strong>No matching procedures</strong><p>Try a role, request type, status, or task such as voucher, cash advance, approval, or report.</p></div>
    </div>
  </section>`;
}

function emailRequestDestination(step, request) {
  if (step === "returned" || step === "declined") return { persona: "requestor", route: `/requests/${request.id}` };
  if (step === 4 || step >= 9 && step <= 14) return { persona: "financeAssociate", route: `/requests/${request.id}` };
  if (step === 5) return { persona: "financeManager", route: `/requests/${request.id}` };
  if (step === 7) return { persona: "coo", route: `/requests/${request.id}` };
  if (step === 8) return { persona: "president", route: `/requests/${request.id}` };
  if (step === 3) return { persona: "departmentHead", route: `/requests/${request.id}` };
  if (step === 8.5) return { persona: "boardMember", route: `/requests/${request.id}` };
  if (step === 15) return { persona: "requestor", route: `/requests/${request.id}` };
  return { persona: "all", route: `/requests/${request.id}` };
}

function emails() {
  const emailEntries = [...steps, ...emailNotificationEvents];
  const step = emailEntries.find(([id]) => id === state.emailStep);
  const decisionEmail = state.emailStep === "returned" || state.emailStep === "declined";
  const emailRequests = requests.length ? requests : prototypeRequests;
  const request = decisionEmail ? emailRequests.find((item) => item.id === "RMB-2026-0148") || emailRequests[0] : emailRequests.find((item) => item.currentStep === state.emailStep) || emailRequests[0];
  const [recipient, subject, trigger, intro, message] = emailTemplates[state.emailStep];
  const destination = emailRequestDestination(state.emailStep, request);
  const completionEmail = state.emailStep === 15;
  const vendorEmail = state.emailStep === 12;
  const releaseEmail = state.emailStep === 13;
  const backendEmail = vendorEmail || releaseEmail || completionEmail || decisionEmail;
  const recipientDisplay = vendorEmail ? `${request.vendor} <vendor@example.com>` : releaseEmail || completionEmail ? `${request.requestor} <requestor@example.com>; ${request.vendor} <vendor@example.com>` : decisionEmail ? `${request.requestor} <requestor@example.com>` : recipient;
  const greeting = vendorEmail ? request.vendor : releaseEmail || completionEmail ? `${request.requestor} and ${request.vendor}` : decisionEmail ? request.requestor : recipient;
  const templateKey = vendorEmail ? "vendor_payment_processing_v1" : releaseEmail ? "payment_pickup_available_v1" : completionEmail ? "payment_completion_v1" : state.emailStep === "returned" ? "payment_request_returned_v1" : "payment_request_declined_v1";
  const eventName = vendorEmail ? "payment.vendor_notification.ready" : releaseEmail ? "payment.pickup.available" : completionEmail ? "payment.transaction.completed" : state.emailStep === "returned" ? "payment.request.returned" : "payment.request.declined";
  const recipientFields = vendorEmail ? "request.vendor.email" : releaseEmail || completionEmail ? "request.requestor.email, request.vendor.email" : "request.requestor.email";
  const decisionReason = state.emailStep === "returned" ? "Please replace the unreadable official receipt and confirm the expense account for the transportation line." : "The submitted expense is outside the approved reimbursement policy and cannot proceed for payment.";
  const notificationLabel = state.emailStep === "returned" ? "Returned" : state.emailStep === "declined" ? "Declined" : `Step ${stepLabel(step[0])}`;
  return `<section class="email-layout">
    <section class="panel email-stage-list"><div class="panel-header"><h3>Email Notifications</h3><span class="count">${emailEntries.length}</span></div><div class="email-stage-buttons">
      ${emailEntries.map(([id, name]) => `<button data-email-step="${id}" class="${state.emailStep === id ? "active" : ""}"><span>${id === "returned" ? "R" : id === "declined" ? "D" : stepLabel(id)}</span><div><strong>${name}</strong><small>To: ${emailTemplates[id][0]}</small></div></button>`).join("")}
    </div></section>
    <section class="email-preview-wrap"><div class="email-meta-panel">
      <div><span>To</span><strong>${recipientDisplay}</strong></div><div><span>Cc</span><strong>Finance Operations</strong></div>
      <div><span>Subject</span><strong>${subject.replace("{{request_id}}", request.id)}${subject.includes("{{request_id}}") ? "" : ` | ${request.id}`}</strong></div><div><span>Sent when</span><strong>${trigger}</strong></div>
    </div><article class="email-preview"><div class="email-brand"><span>AP</span><strong>Automated Payment System</strong></div><div class="email-body">
      <span class="email-step-label">${notificationLabel}: ${step[1]}</span><h3>${intro}</h3><p>Hello ${greeting},</p><p>${message.replace("{{payee_name}}", request.vendor)}</p>
      ${decisionEmail ? `<div class="email-decision-reason"><span>Reviewer Comment</span><strong>${decisionReason}</strong><small>Decision recorded by the current approver · ${new Date().toLocaleDateString("en-PH", { dateStyle: "medium" })}</small></div>` : ""}
      <div class="email-request-summary"><div><span>Request</span><strong>${request.id}</strong></div><div><span>Requestor</span><strong>${request.requestor}</strong></div><div><span>Payee</span><strong>${request.vendor}</strong></div><div><span>Department</span><strong>${request.department}</strong></div><div><span>Type</span><strong>${paymentTypes[request.type].label}</strong></div><div><span>Amount</span><strong>${money(request.amount)}</strong></div></div>
      <button type="button" class="email-action" data-email-view-request="${request.id}" data-email-target-persona="${destination.persona}" data-email-target-route="${destination.route}">View Request</button>${backendEmail ? `<p class="email-deadline">No reply is required. Keep this email for your records.</p>` : `<p class="email-deadline">Please complete this action within two business days.</p>`}<p class="email-fallback">If the button does not work, open: https://payments.example.local/#${destination.route}</p>
    </div><footer>This is an automated workflow notification. Replies are not monitored.</footer></article></section>
    ${backendEmail ? `<details class="panel email-backend-contract responsive-disclosure" ${window.matchMedia("(min-width: 640px)").matches ? "open" : ""}><summary><span><span class="eyebrow">Technical Details</span><strong>${vendorEmail ? "Vendor Processing Notification" : releaseEmail ? "Payment Pick-up Notification" : completionEmail ? "Transaction Completion Notification" : state.emailStep === "returned" ? "Request Returned Notification" : "Request Declined Notification"}</strong><small>Backend email contract</small></span><span class="disclosure-label">Details</span></summary><div class="email-contract-content"><dl><div><dt>Event</dt><dd>${eventName}</dd></div><div><dt>Template Key</dt><dd>${templateKey}</dd></div><div><dt>Recipients</dt><dd>${recipientFields}</dd></div><div><dt>Idempotency Key</dt><dd>${templateKey}:${request.id}</dd></div></dl><p>Required variables: request_id, requestor_name, requestor_email, vendor_name, vendor_email, decision, decision_reason, decided_by, decision_at, currency, amount, and record_url.</p></div></details>` : ""}
  </section>`;
}

function render() {
  document.documentElement.dataset.theme = state.theme;
  if (["documents", "emails"].includes(state.tab) && !canViewAdminReference() && ["mock", "authenticated"].includes(state.authStatus)) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/dashboard`);
    state = { ...state, ...routeStateFromHash() };
  }
  if (!["mock", "authenticated"].includes(state.authStatus)) {
    document.getElementById("root").innerHTML = loginView();
    bindLogin();
    bindToast();
    return;
  }
  const views = { dashboard, request: requestBuilder, requestDetail: unifiedRequestDetails, approvals, tracker, uploads: documentUploads, documents, emails, guide: systemGuide, users: () => identityPage("users"), roles: () => identityPage("roles"), departments: () => identityPage("departments"), requestRequirements: requestRequirementsPage, requestSettings: requestSettingsPage, ...Object.fromEntries(Object.keys(masterDataConfig).map((tab) => [tab, () => masterDataPage(tab)])) };
  document.getElementById("root").innerHTML = shell(views[state.tab]());
  if (state.authStatus === "authenticated" && !state.notificationsLoaded && !state.notificationsLoading) queueMicrotask(loadNotifications);
  if (state.highlightMessageId) {
    const target = document.getElementById(`message-${state.highlightMessageId}`);
    if (target) { target.scrollIntoView({ block: "center" }); target.classList.add("conversation-highlight"); state.highlightMessageId = null; }
  }
  const conversationKey = document.querySelector("[data-conversation-request]")?.dataset.conversationRequest;
  if (conversationKey) {
    const conversationRequest = requests.find((item) => (item.backendId || item.id) === conversationKey);
    if (conversationRequest && !state.conversations[conversationKey] && !state.conversationLoading[conversationKey] && !state.conversationErrors[conversationKey]) queueMicrotask(() => loadConversation(conversationRequest));
  }
  paginateTables(document.getElementById("root"), `${state.persona}:${location.hash}`);
  bindToast();
  bindActionPrompt();
  document.querySelector("[data-toggle-conversation]")?.addEventListener("click", () => {
    setState({ conversationCollapsed: !state.conversationCollapsed });
  });
  document.querySelector("[data-toggle-notifications]")?.addEventListener("click", () => {
    state.notificationsOpen = !state.notificationsOpen;
    render();
    if (state.notificationsOpen) loadNotifications();
  });
  document.querySelector("[data-close-notifications]")?.addEventListener("click", () => setState({ notificationsOpen: false }));
  document.querySelector("[data-retry-notifications]")?.addEventListener("click", loadNotifications);
  document.querySelectorAll("[data-open-notification]").forEach((button) => button.addEventListener("click", async () => {
    const item = state.notifications.items.find((entry) => entry.id === button.dataset.openNotification);
    if (!item) return;
    if (!item.read_at) {
      try { await dataSource.markNotificationRead(item.id, state.csrfToken); }
      catch (error) { showErrorToast(error.message || "Could not mark the notification as read."); }
    }
    const request = apiRequestToPrototype(item.request);
    const stageSteps = { department_head: 3, finance_associate: 4, finance_manager: 5, coo: 7, president: 8, board_member: 8.5 };
    if (item.workflow_stage_role) {
      request.currentStep = stageSteps[item.workflow_stage_role] || request.currentStep;
      request.status = item.workflow_stage_purpose || request.status;
    }
    const existingIndex = requests.findIndex((entry) => entry.backendId === item.request_id);
    if (existingIndex < 0) requests.push(request);
    state.highlightMessageId = item.message_id;
    state.conversationCollapsed = false;
    state.notificationsOpen = false;
    navigate(`/requests/${request.id}`);
    loadNotifications();
  }));
  document.querySelectorAll("[data-retry-conversation]").forEach((button) => button.addEventListener("click", () => {
    const request = requests.find((item) => (item.backendId || item.id) === button.dataset.retryConversation);
    if (request) loadConversation(request, true);
  }));
  document.querySelectorAll("[data-conversation-form] textarea").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      const key = textarea.form.dataset.conversationForm;
      state.conversationDraftBody[key] = textarea.value;
      state.conversationDraftMentions[key] = (state.conversationDraftMentions[key] || []).filter((id) => {
        const person = state.conversations[key]?.participants?.find((entry) => entry.id === id);
        return person && textarea.value.includes(`@${person.display_name}`);
      });
      textarea.form.querySelectorAll("[data-remove-mention]").forEach((button) => {
        button.parentElement.hidden = !state.conversationDraftMentions[key].includes(button.dataset.removeMention);
      });
      updateConversationMentionMenu(textarea);
    });
    textarea.addEventListener("click", () => updateConversationMentionMenu(textarea));
    textarea.addEventListener("keydown", (event) => {
      const menu = textarea.parentElement.querySelector(".conversation-mention-menu");
      if (menu.hidden) return;
      const options = [...menu.querySelectorAll("[data-mention-option]")];
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        menu.hidden = true;
        textarea.setAttribute("aria-expanded", "false");
        textarea.removeAttribute("aria-activedescendant");
      } else if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        const next = (Number(menu.dataset.activeIndex || 0) + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
        menu.dataset.activeIndex = String(next);
        options.forEach((option, index) => option.setAttribute("aria-selected", String(index === next)));
        textarea.setAttribute("aria-activedescendant", options[next].id);
        options[next].scrollIntoView({ block: "nearest" });
      } else if (["Enter", "Tab"].includes(event.key)) {
        event.preventDefault();
        chooseConversationMention(textarea, options[Number(menu.dataset.activeIndex || 0)].dataset.mentionOption);
      }
    });
  });
  document.querySelectorAll(".conversation-mention-menu").forEach((menu) => {
    menu.addEventListener("mousedown", (event) => event.preventDefault());
    menu.addEventListener("click", (event) => {
      const option = event.target.closest("[data-mention-option]");
      if (option) chooseConversationMention(menu.parentElement.querySelector("textarea"), option.dataset.mentionOption);
    });
  });
  document.querySelectorAll("[data-remove-mention]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.mentionRequest;
    const person = state.conversations[key]?.participants?.find((entry) => entry.id === button.dataset.removeMention);
    state.conversationDraftMentions[key] = (state.conversationDraftMentions[key] || []).filter((id) => id !== button.dataset.removeMention);
    if (person) state.conversationDraftBody[key] = (state.conversationDraftBody[key] || "").replace(`@${person.display_name}`, "").trim();
    render();
  }));
  document.querySelectorAll("[data-conversation-form]").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const key = form.dataset.conversationForm;
    const body = String(new FormData(form).get("body") || "").trim();
    const mentions = (state.conversationDraftMentions[key] || []).filter((id) => {
      const person = state.conversations[key]?.participants?.find((entry) => entry.id === id);
      return person && body.includes(`@${person.display_name}`);
    });
    if (!body || state.conversationPosting[key]) return;
    state.conversationPosting[key] = true;
    form.querySelector("button[type=submit]").disabled = true;
    try {
      let posted;
      if (state.authStatus === "authenticated") posted = await dataSource.postRequestConversation(key, body, mentions, state.csrfToken, crypto.randomUUID());
      else posted = { id: crypto.randomUUID(), kind: "message", body, author_name: activeRequestor(), created_at: new Date().toISOString() };
      const conversation = state.conversations[key] || { items: [], can_post: true };
      state.conversations[key] = { ...conversation, items: [...conversation.items, posted] };
      state.conversationDraftBody[key] = "";
      state.conversationDraftMentions[key] = [];
      setState({ toast: successToast("Message posted to the request conversation.") });
    } catch (error) { showErrorToast(error.message || "Message could not be posted."); }
    finally { state.conversationPosting[key] = false; render(); }
  }));
  if (state.tab === "approvals" && state.requestsFiltered) {
    state.requestsFiltered = false;
    queueMicrotask(async () => {
      try { await loadApiPaymentRequests(); render(); }
      catch (error) { showErrorToast(error.message || "Approval requests could not be loaded."); }
    });
  }
  document.querySelector("[data-cash-advance-policy]")?.addEventListener("click", openCashAdvancePolicy);
  if (["users", "roles", "departments"].includes(state.tab) && state.authUser && !state.identityLoading && !state.identityData.departments.length && !state.identityError) {
    queueMicrotask(loadIdentityData);
  }
  bindIdentityForms();
  if (state.tab === "requestRequirements" && state.authUser && !state.requirementRulesLoading && !state.requirementRulesLoaded && !state.requirementRulesError) queueMicrotask(loadRequirementRules);
  bindRequirementRules();
  if (state.tab === "requestSettings" && !state.requestSettingsLoading && (!state.requestNumbering || !state.reimbursementBatchSetting || !state.financePolicySetting) && !state.requestSettingsError) queueMicrotask(loadRequestSettings);
  bindRequestSettings();
  if (masterDataConfig[state.tab] && !state.masterDataLoading && !(state.masterData[masterDataConfig[state.tab].resource]) && !state.masterDataError) queueMicrotask(() => loadMasterData(state.tab));
  if (state.tab === "request" && !state.masterDataLoading && (state.procurementPOs === null || ["cost-centers", "vendors", "chart-of-accounts", "currencies", "payment-methods"].some((resource) => !state.masterData[resource])) && !state.masterDataError) queueMicrotask(loadRequestReferenceData);
  if (state.tab === "uploads" && state.authStatus === "authenticated") {
    const candidate = backendDocumentCandidates().find((item) => item.id === state.uploadId) || backendDocumentCandidates()[0];
    if (candidate && !state.documentLoading && !state.documentRecords[candidate.backendId] && !state.documentError) queueMicrotask(() => loadDocumentData(candidate));
  }
  bindMasterData();
  const pendingMetricLabel = document.querySelector('[data-metric="pending"] span');
  if (pendingMetricLabel) pendingMetricLabel.textContent = state.persona === "requestor" ? "Awaiting Approval" : ["departmentHead", "coo", "president", "boardMember", "authorizedSignatory"].includes(state.persona) ? "Awaiting My Approval" : state.persona === "financeAssociate" ? "Awaiting Validation" : "Pending Approval";
  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
    state.mobileNavOpen = false;
    navigate(button.dataset.tab === "request" ? "/requests" : tabRoutes[button.dataset.tab]);
  }));
  document.querySelector("[data-administration-select]")?.addEventListener("change", (event) => navigate(tabRoutes[event.currentTarget.value]));
  document.querySelector("[data-open-mobile-nav]")?.addEventListener("click", () => setState({ mobileNavOpen: true }));
  document.querySelectorAll("[data-close-mobile-nav]").forEach((button) => button.addEventListener("click", () => setState({ mobileNavOpen: false })));
  document.querySelector(".shell-search input")?.addEventListener("search", (event) => {
    state.dashboardFilters = { ...state.dashboardFilters, voucher: event.target.value.trim() };
    navigate("/dashboard");
  });
  document.querySelector(".shell-search input")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    state.dashboardFilters = { ...state.dashboardFilters, voucher: event.currentTarget.value.trim() };
    navigate("/dashboard");
  });
  document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem("payment-module-theme", state.theme);
    render();
  });
  document.querySelectorAll("[data-upload-request]").forEach((button) => button.addEventListener("click", () => setState({ uploadId: button.dataset.uploadRequest, documentError: "" })));
  document.querySelector("[data-guide-print]")?.addEventListener("click", () => window.print());
  document.querySelectorAll("[data-guide-anchor]").forEach((anchor) => anchor.addEventListener("click", (event) => {
    event.preventDefault();
    const search = document.querySelector("[data-guide-search]");
    if (search?.value) {
      search.value = "";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    }
    document.getElementById(anchor.dataset.guideAnchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  document.querySelector("[data-guide-search]")?.addEventListener("input", (event) => {
    const query = event.currentTarget.value.trim().toLocaleLowerCase();
    let visibleCards = 0;
    document.querySelectorAll("[data-guide-card]").forEach((card) => {
      const match = !query || card.textContent.toLocaleLowerCase().includes(query);
      card.hidden = !match;
      if (match) visibleCards += 1;
    });
    document.querySelectorAll("[data-guide-section]").forEach((section) => {
      section.hidden = Boolean(query) && ![...section.querySelectorAll("[data-guide-card]")].some((card) => !card.hidden);
    });
    const status = document.querySelector("[data-guide-search-status]");
    const empty = document.querySelector("[data-guide-empty]");
    if (status) status.textContent = query ? `${visibleCards} matching procedure${visibleCards === 1 ? "" : "s"}.` : "Search procedures, approval rules, documents, and controls.";
    if (empty) empty.hidden = visibleCards > 0;
  });
  document.querySelector("[data-account-menu]")?.addEventListener("click", (event) => {
    const panel = document.querySelector("[data-account-menu-panel]");
    if (!panel) return;
    panel.hidden = !panel.hidden;
    event.currentTarget.setAttribute("aria-expanded", String(!panel.hidden));
  });
  document.querySelector("[data-logout]")?.addEventListener("click", async () => {
    await dataSource.logout(state.csrfToken).catch(() => undefined);
    setState({ authStatus: "unauthenticated", authUser: null, csrfToken: null, authError: "", authSubmitting: false, cashAdvanceOptions: null, requirementRules: [], requirementDocumentTypes: [], requirementRulesLoaded: false, requirementRulesLoading: false, requirementRulesError: "", requirementRuleEdit: null, conversations: {}, conversationErrors: {}, conversationLoading: {}, conversationPosting: {}, conversationDraftBody: {}, conversationDraftMentions: {}, notifications: { unread_count: 0, items: [] }, notificationsLoaded: false, notificationsOpen: false });
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
  document.querySelector("[data-voucher-payment-method]")?.addEventListener("change", (event) => setState({ voucherDetails: { ...state.voucherDetails, paymentMethod: event.target.value, checkNumber: event.target.value === "Check" ? state.voucherDetails.checkNumber : "" } }));
  document.querySelector("[data-voucher-transaction-number]")?.addEventListener("input", (event) => { state.voucherDetails = { ...state.voucherDetails, transactionNumber: event.target.value }; const display = document.querySelector("[data-voucher-transaction-display]"); if (display) display.textContent = event.target.value || "-"; const createButton = document.querySelector("[data-create-voucher]"); if (createButton) createButton.disabled = !(state.voucherDetails.paymentMethod && state.voucherDetails.transactionNumber.trim()); });
  document.querySelector("[data-voucher-check-number]")?.addEventListener("input", (event) => { state.voucherDetails = { ...state.voucherDetails, checkNumber: event.target.value }; const display = document.querySelector("[data-voucher-check-display]"); if (display) display.textContent = event.target.value || "-"; });
  document.querySelector("[data-create-voucher]")?.addEventListener("click", () => {
    if (!state.voucherDetails.paymentMethod || !state.voucherDetails.transactionNumber.trim()) return;
    setState({ voucherDetails: { ...state.voucherDetails, created: true } });
  });
  document.querySelector("[data-validation-reviewer-note]")?.addEventListener("change", (event) => setState({ documentValidation: { ...state.documentValidation, reviewerNote: event.target.value } }));
  document.querySelectorAll("[data-validate-line]").forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.validateLine);
    const now = new Date();
    const lineReviews = [...state.documentValidation.lineReviews];
    lineReviews[index] = { status: "valid", note: "", reviewer: "Ms. Rhee", reviewedAt: now.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) };
    const request = requests.find((item) => item.id === state.selectedId) || requests.find((item) => item.currentStep === 4) || requests[0];
    const allDocumentsValid = validationReviewLines(request).every((_, reviewIndex) => lineReviews[reviewIndex]?.status === "valid");
    setState({ documentValidation: { ...state.documentValidation, lineReviews, documentsValidatedAt: allDocumentsValid ? state.documentValidation.documentsValidatedAt || now.toISOString() : "" } });
  }));
  document.querySelectorAll("[data-request-line-correction]").forEach((button) => button.addEventListener("click", () => setState({ correctionReviewIndex: Number(button.dataset.requestLineCorrection) })));
  document.querySelectorAll("[data-view-duplicate-invoice]").forEach((button) => button.addEventListener("click", () => setState({ duplicateInvoiceIndex: Number(button.dataset.viewDuplicateInvoice) })));
  document.querySelectorAll("[data-close-duplicate-invoice]").forEach((button) => button.addEventListener("click", () => setState({ duplicateInvoiceIndex: null })));
  document.querySelector("[data-duplicate-modal-backdrop]")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) setState({ duplicateInvoiceIndex: null });
  });
  document.querySelectorAll("[data-correct-duplicate]").forEach((button) => button.addEventListener("click", () => setState({ duplicateInvoiceIndex: null, correctionReviewIndex: Number(button.dataset.correctDuplicate) })));
  document.querySelector("[data-correction-reason]")?.addEventListener("input", (event) => {
    const confirm = document.querySelector("[data-confirm-line-correction]");
    if (confirm) confirm.disabled = !event.target.value.trim();
  });
  document.querySelectorAll("[data-cancel-line-correction]").forEach((button) => button.addEventListener("click", () => setState({ correctionReviewIndex: null })));
  document.querySelector("[data-correction-modal-backdrop]")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) setState({ correctionReviewIndex: null });
  });
  document.querySelector("[data-confirm-line-correction]")?.addEventListener("click", () => {
    const reason = document.querySelector("[data-correction-reason]")?.value.trim();
    const index = state.correctionReviewIndex;
    if (!reason || index === null) return;
    const lineReviews = [...state.documentValidation.lineReviews];
    lineReviews[index] = { status: "correction", note: reason, reviewer: "Ms. Rhee", reviewedAt: new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) };
    setState({ correctionReviewIndex: null, documentValidation: { ...state.documentValidation, lineReviews, documentsValidatedAt: "" } });
  });
  document.querySelectorAll("[data-reset-line-review]").forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.resetLineReview);
    const lineReviews = [...state.documentValidation.lineReviews];
    lineReviews[index] = { status: "pending", note: "", reviewer: "", reviewedAt: "" };
    setState({ documentValidation: { ...state.documentValidation, lineReviews, documentsValidatedAt: "" } });
  }));
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
  document.querySelectorAll("[data-attachment-menu]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const index = button.dataset.attachmentMenu;
    const panel = document.querySelector(`[data-attachment-menu-panel="${index}"]`);
    const willOpen = panel?.hidden;
    document.querySelectorAll("[data-attachment-menu-panel]").forEach((menu) => { menu.hidden = true; });
    document.querySelectorAll("[data-attachment-menu]").forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
    if (panel && willOpen) {
      panel.hidden = false;
      button.setAttribute("aria-expanded", "true");
    }
  }));
  document.querySelectorAll("[data-attachment-menu-panel]").forEach((panel) => panel.addEventListener("click", (event) => event.stopPropagation()));
  document.onclick = () => {
    document.querySelectorAll("[data-attachment-menu-panel]").forEach((menu) => { menu.hidden = true; });
    document.querySelectorAll("[data-attachment-menu]").forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
  };
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
  document.querySelectorAll("[data-request]").forEach((row) => {
    const isApprovalQueue = state.tab === "approvals";
    row.tabIndex = 0;
    row.title = "Click to preview; double-click or press Enter to open details";
    const preview = () => {
      const request = requests.find((item) => item.id === row.dataset.request);
      if (!request) return;
      state.selectedId = request.id;
      document.querySelectorAll("[data-request]").forEach((item) => {
        item.classList.toggle("selected", item === row);
        item.setAttribute("aria-selected", String(item === row));
      });
      const pane = document.querySelector(".dashboard-preview-pane");
      if (pane) pane.outerHTML = isApprovalQueue ? approvalQueuePreview(request) : dashboardRequestPreview(request);
      pane?.querySelector("[data-view-workflow]")?.addEventListener("click", () => navigate(`/dashboard/workflow/${request.id}`));
      document.querySelector("[data-open-dashboard-full]")?.addEventListener("click", () => navigate(`/requests/${request.id}`));
      document.querySelector("[data-preview-action-route]")?.addEventListener("click", (event) => navigate(event.currentTarget.dataset.previewActionRoute));
      document.querySelector("[data-open-approval-workspace]")?.addEventListener("click", (event) => navigate(event.currentTarget.dataset.actionRoute));
      document.querySelector("[data-open-approval-full]")?.addEventListener("click", () => navigate(`/requests/${request.id}`));
    };
    row.addEventListener("click", preview);
    row.addEventListener("dblclick", () => navigate(`/${isApprovalQueue ? "approvals" : "dashboard"}/request/${row.dataset.request}`));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); navigate(`/${isApprovalQueue ? "approvals" : "dashboard"}/request/${row.dataset.request}`); }
      if (event.key === " ") { event.preventDefault(); preview(); }
    });
  });
  document.querySelector("[data-back-approval-list]")?.addEventListener("click", () => navigate("/approvals"));
  document.querySelector("[data-open-approval-workspace]")?.addEventListener("click", (event) => navigate(event.currentTarget.dataset.actionRoute || `/approvals/review/${event.currentTarget.dataset.openApprovalWorkspace}`));
  document.querySelector("[data-open-approval-full]")?.addEventListener("click", (event) => navigate(`/requests/${event.currentTarget.dataset.openApprovalFull}`));
  document.querySelector("[data-start-approval]")?.addEventListener("click", (event) => navigate(`/approvals/review/${event.currentTarget.dataset.startApproval}`));
  document.querySelector("[data-back-approval-detail]")?.addEventListener("click", (event) => navigate(`/approvals/request/${event.currentTarget.dataset.backApprovalDetail}`));
  document.querySelectorAll("[data-metric]").forEach((button) => button.addEventListener("click", () => navigate(`/dashboard/${button.dataset.metric}`)));
  document.querySelector("[data-close-metric]")?.addEventListener("click", () => navigate("/dashboard"));
  document.querySelector("[data-close-dashboard-detail]")?.addEventListener("click", () => navigate("/dashboard"));
  document.querySelector("[data-open-dashboard-full]")?.addEventListener("click", (event) => navigate(`/requests/${event.currentTarget.dataset.openDashboardFull}`));
  document.querySelector("[data-preview-action-route]")?.addEventListener("click", (event) => navigate(event.currentTarget.dataset.previewActionRoute));
  document.querySelectorAll("[data-all-role-action]").forEach((button) => button.addEventListener("click", () => {
    const request = requests.find((item) => item.id === button.dataset.actionRequest);
    if (!request) return;
    const action = button.dataset.allRoleAction;
    if (action === "edit") navigate(`/requests/new/${request.type}`);
    else if (action === "documents") navigate("/documents/uploads");
    else if (action === "approval" || action === "tracker") navigate(`/requests/${request.id}`);
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
  document.querySelectorAll("[data-metric-request]").forEach((row) => row.addEventListener("click", () => navigate(`/requests/${row.dataset.metricRequest}`)));
  document.querySelectorAll("[data-tracker-request]").forEach((row) => row.addEventListener("click", () => navigate(`/requests/${row.dataset.trackerRequest}`)));
  document.querySelector("[data-back-unified-request]")?.addEventListener("click", () => navigate(state.persona === "requestor" ? "/dashboard" : "/approvals"));
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
    request.audit.push({ action: "Signatory Approval Approved", actor: request.bankAuthorizedBy, timestamp, reason: "Authorized signatory approval recorded." });
    render();
  });
  const activeVendorNotificationRequest = () => requests.find((item) => item.id === state.vendorNotificationRequestId);
  const closeVendorNotifications = () => {
    const request = activeVendorNotificationRequest();
    if (request?.vendorItems?.length && request.vendorItems.every((item) => item.sentAt)) {
      request.vendorNotifiedAt = request.vendorItems.reduce((latest, item) => item.sentAt > latest ? item.sentAt : latest, "");
      request.vendorNotifiedBy = personas[state.persona].name;
      request.currentStep = 13;
      request.status = "Payment Release";
      request.audit.push({ action: `${request.vendorItems.length} Vendor Notification${request.vendorItems.length === 1 ? "" : "s"} Completed`, actor: request.vendorNotifiedBy, timestamp: request.vendorNotifiedAt, reason: "All vendor-specific payment-processing notices were sent." });
    }
    setState({ vendorNotificationRequestId: null });
  };
  document.querySelector("[data-open-vendor-notifications]")?.addEventListener("click", (event) => {
    const request = requests.find((item) => item.id === event.currentTarget.dataset.openVendorNotifications);
    if (!request) return;
    if (!request.vendorItems?.length) request.vendorItems = [{ vendor: request.vendor, email: "vendor@example.com", item: `${paymentTypes[request.type].label} · ${request.id}`, amount: request.amount }];
    setState({ vendorNotificationRequestId: request.id });
  });
  document.querySelectorAll("[data-close-vendor-notifications]").forEach((button) => button.addEventListener("click", closeVendorNotifications));
  document.querySelector("[data-vendor-notification-backdrop]")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeVendorNotifications();
  });
  document.querySelectorAll("[data-send-one-vendor]").forEach((button) => button.addEventListener("click", (event) => {
    const request = activeVendorNotificationRequest();
    const vendor = request?.vendorItems?.[Number(event.currentTarget.dataset.sendOneVendor)];
    if (!request || !vendor || vendor.sentAt) return;
    vendor.sentAt = new Date().toISOString();
    request.audit.push({ action: "Vendor Notification Email Sent", actor: personas[state.persona].name, timestamp: vendor.sentAt, reason: `Payment-processing notice sent to ${vendor.vendor} at ${vendor.email}.` });
    render();
  }));
  document.querySelector("[data-send-all-vendors]")?.addEventListener("click", () => {
    const request = activeVendorNotificationRequest();
    if (!request) return;
    const timestamp = new Date().toISOString();
    request.vendorItems.filter((item) => !item.sentAt).forEach((item) => {
      item.sentAt = timestamp;
      request.audit.push({ action: "Vendor Notification Email Sent", actor: personas[state.persona].name, timestamp, reason: `Payment-processing notice sent to ${item.vendor} at ${item.email}.` });
    });
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
  document.querySelectorAll("[data-select-request-type]").forEach((button) => button.addEventListener("click", () => {
    state = { ...state, activeDraftId: null, draftDirty: false, requestTypeSelection: false, requestFieldBuffer: {}, requestDocumentBuffer: {} };
    navigate(`/requests/new/${button.dataset.selectRequestType}`);
  }));
  document.querySelector("[data-back-request-types]")?.addEventListener("click", () => {
    if (state.draftDirty) setState({ leaveRequestTarget: "/requests" });
    else navigate("/requests");
  });
  document.querySelector("[data-continue-editing]")?.addEventListener("click", () => setState({ leaveRequestTarget: null }));
  document.querySelector("[data-leave-request-backdrop]")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) setState({ leaveRequestTarget: null });
  });
  document.querySelector("[data-save-and-leave]")?.addEventListener("click", () => {
    const target = state.leaveRequestTarget;
    saveDraft({ silent: true });
    state.leaveRequestTarget = null;
    navigate(target || "/requests");
  });
  document.querySelector("[data-discard-and-leave]")?.addEventListener("click", () => {
    const target = state.leaveRequestTarget;
    state = { ...state, activeDraftId: null, draftDirty: false, leaveRequestTarget: null };
    navigate(target || "/requests");
  });
  document.querySelector("[data-view-drafts]")?.addEventListener("click", () => {
    if (state.draftDirty && document.querySelector(".request-form-page")) setState({ leaveRequestTarget: "/requests/drafts" });
    else navigate("/requests/drafts");
  });
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
  document.querySelectorAll("[data-delete-draft]").forEach((button) => button.addEventListener("click", () => {
    const draft = state.drafts.find((item) => item.id === button.dataset.deleteDraft);
    if (!draft) return;
    openActionPrompt({ eyebrow: "Draft Request", title: `Delete ${draft.id}?`, message: "This draft and its unsaved request information will be removed.", confirmLabel: "Delete Draft", danger: true, onConfirm: async () => {
      try {
        if (draft.backendId) await dataSource.deletePaymentRequest(draft.backendId, state.csrfToken);
        const remainingDrafts = state.drafts.filter((item) => item.id !== draft.id);
        persistMockDrafts(remainingDrafts);
        setState({ drafts: remainingDrafts, activeDraftId: state.activeDraftId === draft.id ? null : state.activeDraftId });
      } catch (error) { showErrorToast(error.message || "The draft could not be deleted.", "Draft not deleted"); }
    } });
  }));
  document.querySelectorAll("[data-edit-returned]").forEach((button) => button.addEventListener("click", () => {
    const request = requests.find((item) => item.id === button.dataset.editReturned);
    if (request) editReturnedApiRequest(request);
  }));
  document.querySelectorAll("[data-first-stage-reject-choice]").forEach((select) => select.addEventListener("change", () => {
    const button = document.querySelector(`[data-first-stage-reject-submit="${CSS.escape(select.dataset.firstStageRejectChoice)}"]`);
    if (button) button.disabled = !select.value;
  }));
  document.querySelector("[data-retry-workflow-queue]")?.addEventListener("click", async () => {
    try { await loadApiPaymentRequests(); render(); }
    catch (error) { showErrorToast(error.message || "The approval queue could not be loaded."); }
  });
  document.querySelectorAll("[data-backend-approve]").forEach((button) => button.addEventListener("click", () => {
    const request = requests.find((item) => item.id === button.dataset.backendApprove);
    const assignment = state.workflowQueue.find((entry) => entry.request_id === request?.backendId);
    if (!request || !assignment || assignment.state !== "active") return;
    const note = button.closest(".approval-decision-card")?.querySelector(".approval-reviewer-note textarea")?.value.trim() || "";
    openActionPrompt({
      eyebrow: "Approval Decision", title: `Approve ${request.id}?`,
      message: "This records your approval and advances the saved workflow to its next stage.",
      confirmLabel: "Approve Request",
      onConfirm: async () => {
        try {
          await dataSource.approveWorkflow(request.backendId, assignment.version, note, state.csrfToken);
          await loadApiPaymentRequests();
          state.toast = successToast("The approval was recorded.", "Decision recorded");
          navigate("/approvals");
        } catch (error) { showErrorToast(error.message || "The approval could not be recorded.", "Decision failed"); }
      },
    });
  }));
  document.querySelectorAll("[data-backend-request-information]").forEach((button) => button.addEventListener("click", () => {
    const request = requests.find((item) => item.id === button.dataset.backendRequestInformation);
    const assignment = state.workflowQueue.find((entry) => entry.request_id === request?.backendId);
    if (!request || assignment?.state !== "active") return;
    openActionPrompt({
      eyebrow: "Approval Decision", title: `Request more information for ${request.id}?`,
      message: "Finance Associate will answer your question. This request will return to your approval stage afterward.",
      inputLabel: "Information needed", required: true, confirmLabel: "Send to Finance Associate",
      onConfirm: async (note) => {
        try {
          await dataSource.requestWorkflowInformation(request.backendId, assignment.version, note, state.csrfToken);
          await loadApiPaymentRequests();
          state.toast = successToast("Finance Associate has been asked for more information.", "Request recorded");
          navigate("/approvals");
        } catch (error) { showErrorToast(error.message || "The information request could not be recorded."); }
      },
    });
  }));
  document.querySelectorAll("[data-backend-respond-information]").forEach((button) => button.addEventListener("click", () => {
    const request = requests.find((item) => item.id === button.dataset.backendRespondInformation);
    const assignment = state.workflowQueue.find((entry) => entry.request_id === request?.backendId);
    if (!request || assignment?.state !== "information_requested") return;
    openActionPrompt({
      eyebrow: "Information Response", title: `Respond for ${request.id}?`,
      message: "Your response will return the request to the same reviewer and approval stage.",
      inputLabel: "Response to reviewer", required: true, confirmLabel: "Return to Reviewer",
      onConfirm: async (note) => {
        try {
          await dataSource.respondWorkflowInformation(request.backendId, assignment.version, note, state.csrfToken);
          await loadApiPaymentRequests();
          state.toast = successToast("Your response was recorded and the review resumed.", "Response recorded");
          navigate("/approvals");
        } catch (error) { showErrorToast(error.message || "The response could not be recorded."); }
      },
    });
  }));
  document.querySelectorAll("[data-mock-request-information]").forEach((button) => button.addEventListener("click", () => {
    const request = requests.find((item) => item.id === (state.tab === "requestDetail" ? state.requestDetailId : state.selectedId));
    if (!request || request.backendId || ![7, 8, 8.5].includes(request.currentStep)) return;
    openActionPrompt({
      eyebrow: "Approval Decision", title: `Request more information for ${request.id}?`,
      message: "Finance Associate will respond, then this request will return to your approval stage.",
      inputLabel: "Information needed", required: true, confirmLabel: "Send to Finance Associate",
      onConfirm: (note) => {
        const reviewer = { 7: "COO", 8: "President", 8.5: "Board" }[request.currentStep];
        request.infoRequest = { stage: request.currentStep, status: request.status, note };
        request.currentStep = 4;
        request.status = `Information Requested by ${reviewer}`;
        request.validationAssignee = personas.financeAssociate.name;
        request.audit = [...(request.audit || []), { action: "Information Requested", actor: personas[state.persona].name, timestamp: new Date().toISOString(), reason: note }];
        state.toast = successToast("Finance Associate has been asked for more information.", "Request recorded");
        navigate("/approvals");
      },
    });
  }));
  document.querySelectorAll("[data-mock-respond-information]").forEach((button) => button.addEventListener("click", () => {
    const request = requests.find((item) => item.id === button.dataset.mockRespondInformation);
    if (!request?.infoRequest || request.backendId) return;
    openActionPrompt({
      eyebrow: "Information Response", title: `Respond for ${request.id}?`,
      message: "The request will return to the same approval stage.",
      inputLabel: "Response to reviewer", required: true, confirmLabel: "Return to Reviewer",
      onConfirm: (note) => {
        request.currentStep = request.infoRequest.stage;
        request.status = request.infoRequest.status;
        request.audit = [...(request.audit || []), { action: "Information Provided", actor: personas[state.persona].name, timestamp: new Date().toISOString(), reason: note }];
        delete request.infoRequest;
        state.toast = successToast("Your response was recorded and the review resumed.", "Response recorded");
        navigate("/approvals");
      },
    });
  }));
  document.querySelectorAll("[data-first-stage-reject-submit]").forEach((button) => button.addEventListener("click", () => {
    const request = requests.find((item) => item.id === button.dataset.firstStageRejectSubmit);
    const choice = document.querySelector(`[data-first-stage-reject-choice="${CSS.escape(button.dataset.firstStageRejectSubmit)}"]`)?.value;
    if (!request || !choice || !canRejectApproval(request)) return;
    const returning = choice === "return";
    openActionPrompt({
      eyebrow: "Approval Decision",
      title: `${returning ? "Return" : "Fully decline"} ${request.id}?`,
      message: returning ? "The requestor can edit and resubmit this request. Explain what must be corrected." : "This ends the request. The requestor can see your reason but cannot edit or resubmit it.",
      inputLabel: returning ? "Correction reason" : "Decline reason",
      required: true, danger: true, confirmLabel: returning ? "Return to Requestor" : "Fully Decline",
      onConfirm: async (note) => {
        try {
          if (request.backendId) {
            const workflow = await dataSource.getWorkflow(request.backendId);
            if (workflow.state !== "active" || workflow.current_stage == null) throw new Error("The approval stage is no longer active. Reload the request.");
            await dataSource.rejectFirstStage(request.backendId, workflow.version, choice, note, state.csrfToken);
            await loadApiPaymentRequests();
          } else {
            request.status = returning ? "Returned for Information" : "Declined";
            request.currentStep = 2;
            request.returned = returning ? new Date().toISOString().slice(0, 10) : "";
            request.unlocked = returning;
            request.decisionReason = note;
            request.audit = [...(request.audit || []), { action: returning ? "Returned to Requestor" : "Fully Declined", actor: personas[state.persona].name, timestamp: new Date().toISOString(), reason: note }];
          }
          state.toast = successToast(returning ? "The request was returned to the requestor for editing." : "The request was fully declined.", "Decision recorded");
          navigate(`/requests/${request.id}`);
        } catch (error) { showErrorToast(error.message || "The decision could not be recorded.", "Decision failed"); }
      },
    });
  }));
  document.querySelectorAll("[data-api-lifecycle]").forEach((button) => button.addEventListener("click", () => {
    const request = requests.find((item) => item.id === button.dataset.apiRequest);
    const action = button.dataset.apiLifecycle;
    if (!request?.backendId) return;
    const labels = { return: "return reason", resubmit: "resubmission note", cancel: "cancellation reason", reopen: "reopening reason" };
    openActionPrompt({ eyebrow: "Request Workflow", title: `${action[0].toUpperCase()}${action.slice(1)} ${request.id}?`, message: `Enter the ${labels[action]} for the audit trail.`, inputLabel: labels[action][0].toUpperCase() + labels[action].slice(1), required: true, confirmLabel: action === "resubmit" ? "Resubmit Request" : `${action[0].toUpperCase()}${action.slice(1)} Request`, danger: ["return", "cancel"].includes(action), onConfirm: async (note) => {
      try {
        const method = `${action}PaymentRequest`;
        const updated = await dataSource[method](request.backendId, request.backendVersion, note, state.csrfToken);
        await loadApiPaymentRequests();
        const displayId = updated?.request_number || request.id;
        state.selectedId = displayId;
        state.toast = successToast(`The request was ${action === "resubmit" ? "resubmitted" : `${action}ed`} successfully.`, "Request updated");
        navigate(updated?.status === "draft" ? "/requests/drafts" : `/requests/${displayId}`);
      } catch (error) {
        showErrorToast(error.message || `The request could not be ${action}ed.`, "Request update failed");
      }
    } });
  }));
  document.querySelectorAll("[data-email-step]").forEach((button) => button.addEventListener("click", () => navigate(`/emails/${button.dataset.emailStep}`)));
  document.querySelector("[data-email-view-request]")?.addEventListener("click", (event) => {
    const button = event.currentTarget;
    const persona = button.dataset.emailTargetPersona;
    const visible = personaRequests(persona);
    state = {
      ...state,
      persona,
      selectedId: button.dataset.emailViewRequest,
      dashboardMetric: null,
      dashboardWorkflow: false,
    };
    if (!visible.some((request) => request.id === state.selectedId) && persona !== "all") state.persona = "all";
    navigate(button.dataset.emailTargetRoute);
  });
  const advancedFilters = document.getElementById("requestAdvancedFilters");

  document.querySelector("[data-toggle-request-filters]")?.addEventListener("click", () => {
    state.requestFiltersExpanded = !state.requestFiltersExpanded; advancedFilters.hidden = !state.requestFiltersExpanded;
    document.querySelector("[data-toggle-request-filters]")?.setAttribute("aria-expanded", String(state.requestFiltersExpanded));
  });
  document.querySelectorAll("[data-dashboard-filter]").forEach((input) => input.addEventListener(input.tagName === "INPUT" && input.type !== "number" ? "input" : "change", () => {
    state.dashboardFilters = { ...state.dashboardFilters, [input.dataset.dashboardFilter]: input.value };
    render();
    const replacement = document.querySelector(`[data-dashboard-filter="${input.dataset.dashboardFilter}"]`);
    replacement?.focus();
    if (replacement?.setSelectionRange && input.tagName === "INPUT" && input.type !== "number") replacement.setSelectionRange(replacement.value.length, replacement.value.length);
    window.clearTimeout(requestFilterTimer);
    requestFilterTimer = window.setTimeout(async () => {
      try {
        if (await loadApiPaymentRequests(state.dashboardFilters)) render();
      } catch (error) {
        showErrorToast(error.message || "Requests could not be filtered.", "Request filters unavailable");
      }
    }, input.tagName === "INPUT" ? 300 : 0);
  }));
  document.querySelector("[data-clear-filters]")?.addEventListener("click", async () => {
    state.dashboardFilters = { voucher: "", department: "all", type: "all", status: "all", minAmount: "", maxAmount: "", sortBy: "submitted", sortDirection: "desc" };
    try { await loadApiPaymentRequests(state.dashboardFilters); }
    catch (error) { showErrorToast(error.message || "Requests could not be reloaded.", "Request filters unavailable"); }
    render();
  });
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
  document.querySelector("[data-po-reference]")?.addEventListener("change", (event) => {
    const poRecord = purchaseOrderRecords().find((record) => record.id === event.target.value);
    state.requestFieldBuffer = { ...captureDraftFields(), po_reference: event.target.value, payee_name: poRecord?.payee || "" };
    const poLines = (poRecord?.items || []).map((item) => ({
      "P.O. Number": poRecord.id,
      Supplier: poRecord.payee,
      Particulars: item.description || item.name,
      "Expense Account": "",
      "Department / Cost Center": "",
      Amount: Number(item.quantity || 1) * Number(item.unitPrice || 0),
      Attachment: [],
    }));
    setState({ selectedPO: event.target.value, draftCurrency: poRecord?.currency || "PHP", lineItemsByType: { ...state.lineItemsByType, poPayment: poLines.length ? poLines : state.lineItemsByType.poPayment } });
  });
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
  document.querySelectorAll("[data-demo-document]").forEach((input) => input.addEventListener("change", () => {
    const file = input.files?.[0];
    const selected = uploadSamples.find((request) => request.id === state.uploadId) || uploadSamples[0];
    const document = selected.documents[Number(input.dataset.demoDocument)];
    if (!file || !document) return;
    document.file = file.name;
    document.size = `${(file.size / 1024).toFixed(1)} KB`;
    render();
  }));
  const documentCandidate = backendDocumentCandidates().find((item) => item.id === state.uploadId) || backendDocumentCandidates()[0];
  document.querySelectorAll("[data-document-type], [data-document-replace]").forEach((input) => input.addEventListener("change", () => saveDocumentFile(documentCandidate, input)));
  document.querySelectorAll("[data-remove-document]").forEach((button) => button.addEventListener("click", () => removeApiDocument(documentCandidate, button.dataset.removeDocument)));
  document.querySelector("[data-retry-documents]")?.addEventListener("click", () => { state.documentError = ""; loadDocumentData(documentCandidate, true); });
  document.querySelectorAll("[data-document-hard-copy]").forEach((select) => select.addEventListener("change", async () => {
    const save = async (note = "") => { try {
      await dataSource.recordDocumentHardCopy(select.dataset.documentHardCopy, select.value, note, state.csrfToken);
      state.documentRecords = { ...state.documentRecords, [documentCandidate.backendId]: null };
      state.toast = successToast("Finance hard-copy status was recorded.", "Status updated");
      await loadDocumentData(documentCandidate, true);
    } catch (error) { showErrorToast(error.message, "Unable to update hard-copy status"); } };
    if (select.value === "waived") openActionPrompt({ eyebrow: "Hard-copy Tracking", title: "Waive this hard-copy requirement?", message: "Provide the reason Finance is accepting the request without this hard copy.", inputLabel: "Waiver reason", required: true, confirmLabel: "Record Waiver", onConfirm: save });
    else await save();
  }));
  document.querySelectorAll("[data-document-review]").forEach((select) => select.addEventListener("change", async () => {
    if (!select.value) return;
    const save = async (comment = "") => { try {
      await dataSource.reviewDocument(select.dataset.documentReview, select.value, comment || "", state.csrfToken);
      state.documentRecords = { ...state.documentRecords, [documentCandidate.backendId]: null };
      state.toast = successToast("The document review decision was recorded.", "Review saved");
      await loadDocumentData(documentCandidate, true);
    } catch (error) { showErrorToast(error.message, "Unable to save document review"); } };
    if (select.value === "accepted") await save();
    else openActionPrompt({ eyebrow: "Finance Review", title: select.value === "rejected" ? "Reject this document?" : "Require a replacement?", message: "Explain what Finance found and what must be corrected.", inputLabel: "Finance review comment", required: true, confirmLabel: "Save Review", danger: select.value === "rejected", onConfirm: save });
  }));
  document.querySelector("[data-add-line]")?.addEventListener("click", addDraftLineItem);
  document.querySelector("[data-retry-cash-advances]")?.addEventListener("click", () => {
    state.requestFieldBuffer = captureDraftFields();
    state.requestDocumentBuffer = { ...state.requestDocumentBuffer, ...captureDraftDocuments() };
    setState({ cashAdvanceOptions: null, cashAdvanceOptionsError: "" });
  });
  document.querySelectorAll("[data-line-card]").forEach((card) => card.addEventListener("toggle", () => {
    if (card.open) expandedLineIndex = Number(card.dataset.lineCard);
  }));
  document.querySelectorAll("[data-remove-line]").forEach((button) => button.addEventListener("click", () => removeDraftLineItem(Number(button.dataset.removeLine))));
  document.querySelectorAll("[data-line-row]").forEach((input) => input.addEventListener(input.tagName === "SELECT" || input.type === "file" ? "change" : "input", () => {
    const value = input.type === "file" ? [...(input.files || [])].map((file) => file.name).slice(0, 20) : input.value;
    updateDraftLineItem(Number(input.dataset.lineRow), input.dataset.lineColumn, value);
    if (input.type === "file") {
      const filename = input.closest(".line-card-attachments")?.querySelector(".line-upload-filename");
      renderSelectedFiles(input, value);
    }
  }));
  document.querySelectorAll("[data-request-document]").forEach((input) => input.addEventListener("change", () => {
    const names = [...(input.files || [])].map((file) => file.name);
    state.requestDocumentBuffer[input.dataset.requestDocument] = names;
    renderSelectedFiles(input, names);
  }));
  document.querySelectorAll('[data-line-row][type="file"], [data-request-document]').forEach((input) => {
    const names = input.hasAttribute("data-line-row")
      ? lineAttachmentNames(state.lineItemsByType[state.draftType][Number(input.dataset.lineRow)][input.dataset.lineColumn])
      : state.requestDocumentBuffer[input.dataset.requestDocument] || state.drafts.find((draft) => draft.id === state.activeDraftId)?.documents?.[input.dataset.requestDocument] || [];
    renderSelectedFiles(input, names);
  });
  state.lineItemsByType[state.draftType]?.forEach((_, rowIndex) => refreshLineRequirements(rowIndex));
  document.querySelectorAll("[data-print-voucher]").forEach((button) => button.addEventListener("click", () => window.print()));
  document.getElementById("unbudgeted")?.addEventListener("change", (event) => setState({ budgeted: !event.target.checked }));
  document.getElementById("liquidationAdvanceAmount")?.addEventListener("input", (event) => {
    state.liquidationAdvanceAmount = Number(event.target.value) || 0;
    const expenses = state.lineItemsByType.liquidation.reduce((sum, item) => sum + (Number(item.Amount) || 0), 0);
    const output = document.getElementById("liquidationSettlement");
    if (output) output.textContent = settlementFor(state.liquidationAdvanceAmount, expenses);
  });
  document.getElementById("liquidationReturnAmount")?.addEventListener("input", (event) => {
    state.liquidationReturnAmount = Number(event.target.value) || 0;
  });
  restoreDraftControls();
  refreshValidationPreview();
  const requestPage = document.querySelector(".request-form-page");
  requestPage?.addEventListener("input", refreshValidationPreview);
  requestPage?.addEventListener("change", refreshValidationPreview);
  const draftForm = document.querySelector(".request-form-panel");
  if (draftForm) {
    const trackDraftChange = () => {
      state.draftDirty = true;
      window.clearTimeout(draftAutosaveTimer);
      draftAutosaveTimer = window.setTimeout(() => saveDraft({ silent: true }), 2000);
    };
    draftForm.addEventListener("input", trackDraftChange);
    draftForm.addEventListener("change", trackDraftChange);
  }
}

window.addEventListener("hashchange", () => {
  state = { ...state, ...routeStateFromHash() };
  render();
  resetPageScroll();
});
window.setInterval(() => {
  if (document.visibilityState === "visible" && state.authStatus === "authenticated") loadNotifications();
}, 30000);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.actionPrompt) setState({ actionPrompt: null });
  else if (event.key === "Escape" && state.notificationsOpen) setState({ notificationsOpen: false });
  else if (event.key === "Escape" && state.identityEdit) setState({ identityEdit: null });
  else if (event.key === "Escape" && state.masterDataEdit) closeMasterDataModal();
  else if (event.key === "Escape" && state.unlockRequestId) setState({ unlockRequestId: null });
  else if (event.key === "Escape" && state.dashboardWorkflow) navigate(`/dashboard/request/${state.selectedId}`);
  else if (event.key === "Escape" && state.documentValidation.attachmentPreview) setState({ documentValidation: { ...state.documentValidation, attachmentPreview: "" } });
  else if (event.key === "Escape" && !state.conversationCollapsed && window.matchMedia("(max-width: 1199px)").matches && document.querySelector(".request-conversation")) setState({ conversationCollapsed: true });
});
if (!window.location.hash) window.location.replace(`${window.location.pathname}${window.location.search}#/dashboard`);
state = { ...state, ...routeStateFromHash() };
render();
dataSource.getSystemStatus().then((backendStatus) => setState({ backendStatus }));
if (dataSource.mode !== "mock") {
  dataSource.getSession()
    .then(async (session) => {
      state = { ...state, authStatus: "authenticated", authUser: session.user, csrfToken: session.csrf_token, persona: personaForRoles(session.user.roles), authSubmitting: false, cashAdvanceOptions: null, requirementRules: [], requirementDocumentTypes: [], requirementRulesLoaded: false, requirementRulesLoading: false, requirementRulesError: "", requirementRuleEdit: null };
      await loadApiPaymentRequests();
      if (window.location.hash === "#/login") navigate("/dashboard");
      else render();
    })
    .catch((error) => {
      if (dataSource.mode === "hybrid" && error.status !== 401) {
        setState({ authStatus: "mock", authUser: null, csrfToken: null, authError: "", authSubmitting: false, toast: errorToast("The API could not be reached. The development fallback view is active.", "Backend unavailable") });
      } else {
        const message = error.status === 401 ? "" : "Authentication service is unavailable.";
        setState({ authStatus: "unauthenticated", authError: message, authSubmitting: false, toast: message ? errorToast(message, "Unable to restore session") : null });
      }
    });
}
