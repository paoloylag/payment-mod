const { useMemo, useState } = React;

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
  { id: 15, name: "Archive + ERP", owner: "System" },
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
  12: { recipient: "Finance Associate", subject: "Notify payee that payment is available", trigger: "Bank authorization completed", intro: "The payment has been authorized and is ready for payee notification.", message: "Send the payment availability notice and confirm the release or collection instructions.", action: "Send Payee Notice" },
  13: { recipient: "Finance Associate", subject: "Record payment release", trigger: "Payee notified", intro: "The payment is ready for release to the payee.", message: "Record the release date, recipient, payment reference, and acknowledgement details.", action: "Record Release" },
  14: { recipient: "Finance Associate", subject: "Payment tracker updated", trigger: "Payment released", intro: "The payment tracker has been updated automatically.", message: "Review the recorded turnaround dates and resolve any remaining tracker exceptions.", action: "View Tracker" },
  15: { recipient: "Finance Associate", subject: "Archive and ERP posting completed", trigger: "Tracker update completed", intro: "The completed request has been archived and queued for ERP posting.", message: "Review the journal reference and archived record if reconciliation is required.", action: "View Archived Record" },
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
    { "Invoice Date": "2026-07-15", "Invoice Number": "INV-1042", "Vendor / Merchant": "Training Center", Particulars: "Leadership workshop registration", Amount: 50000 },
    { "Invoice Date": "2026-07-16", "Invoice Number": "OR-1048", "Vendor / Merchant": "Travel Desk", Particulars: "Workshop transportation", Amount: 75000 },
  ],
  cashAdvance: [
    { Particulars: "Regional transportation", Amount: 25000 },
    { Particulars: "Meals and incidentals", Amount: 10000 },
  ],
  liquidation: [
    { "Invoice Date": "2026-07-15", "Invoice Number": "INV-2051", "Vendor / Merchant": "Training Center", Particulars: "Workshop venue and meals", Amount: 30000 },
    { "Invoice Date": "2026-07-16", "Invoice Number": "OR-2058", "Vendor / Merchant": "Travel Desk", Particulars: "Local transportation", Amount: 15000 },
  ],
  poPayment: [
    { "P.O. Number": "PO-2026-0106", Supplier: "Northstar Supplies", Particulars: "Office workstations", "Department / Cost Center": "Operations - 4400", Amount: 98000 },
    { "P.O. Number": "PO-2026-0106", Supplier: "Northstar Supplies", Particulars: "Delivery and installation", "Department / Cost Center": "IT - 4500", Amount: 27500 },
  ],
  general: [
    { Supplier: "City Utilities", Particulars: "Electricity service", "Department / Cost Center": "Facilities - 4600", Amount: 48500, Attachment: "electric-bill.pdf" },
    { Supplier: "City Utilities", Particulars: "Water service", "Department / Cost Center": "Admin - 4000", Amount: 12200, Attachment: "water-bill.pdf" },
    { Supplier: "CloudWorks", Particulars: "Monthly hosting", "Department / Cost Center": "IT - 4500", Amount: 27700, Attachment: "cloud-invoice.pdf" },
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
  ["RMB-2026-0148", "reimbursement", "Mika Santos", "Marketing", "Hotel Benilde", 84350, true, "Document Validation", 4, "2026-06-21", "", "", 4, 0, "Finance Associate added withholding tax computation."],
  ["PO-2026-0088", "poPayment", "Jon Reyes", "Operations", "Northstar Supplies", 98000, true, "Finance Budget Review", 5, "2026-06-20", "", "", 5, 0, "Finance Manager is checking budget availability and accounting entry."],
  ["PO-2026-0092", "poPayment", "Jon Reyes", "Operations", "Northstar Supplies", 248900, true, "COO Approval", 7, "2026-06-19", "2026-06-20", "2026-06-22", 5, 0, "Department Head approved after receiving revised SOA."],
  ["GEN-2026-0037", "general", "Alex Cruz", "Admin", "City Utilities", 329500, true, "President Approval", 8, "2026-06-18", "", "", 3, 0, "Finance Manager routed to President based on threshold."],
  ["PO-2026-0108", "poPayment", "Bea Tan", "Procurement", "Enterprise Systems Corp.", 1250000, false, "Board Approval", 8.5, "2026-06-18", "", "", 5, 0, "The unbudgeted request exceeded PHP 1,000,000 and was routed to a Board Member."],
  ["RMB-2026-0150", "reimbursement", "Lia Dizon", "People Ops", "Training Center", 72300, true, "Voucher Creation", 9, "2026-06-17", "", "", 4, 0, "System is generating the payment voucher with approval signatures."],
  ["GEN-2026-0041", "general", "Nico Ramos", "Facilities", "Metro Repairs", 66200, true, "Bank Payment Processing", 10, "2026-06-16", "", "", 3, 0, "Finance Associate is preparing the check payment."],
  ["PO-2026-0098", "poPayment", "Bea Tan", "Procurement", "Atlas Office Systems", 141750, true, "Bank Authorization", 11, "2026-06-15", "", "", 5, 0, "Authorized signatories need to complete bank authorization."],
  ["GEN-2026-0044", "general", "Carlo Uy", "IT", "CloudWorks", 88400, true, "Vendor Notification", 12, "2026-06-14", "", "", 3, 0, "Check is available and vendor notification is ready."],
  ["RMB-2026-0154", "reimbursement", "Sam Lee", "Legal", "Travel Desk", 30750, true, "Payment Release", 13, "2026-06-13", "", "", 4, 0, "Finance Associate is recording check release to the payee."],
  ["CA-2026-0061", "cashAdvance", "Iya Cruz", "Events", "Internal", 39000, true, "Payment Tracker", 14, "2026-06-12", "2026-06-13", "2026-06-14", 2, 0, "System is updating turnaround dates and tracker reporting."],
  ["GEN-2026-0049", "general", "Paolo Reyes", "Finance", "ERP Posting", 101250, true, "Archive + ERP Posting", 15, "2026-06-11", "", "", 4, 0, "Records are archived and journal entries are queued for ERP posting."],
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
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(value);
const formatStep = (value) => value === 8.5 ? "8B" : value;

function getRoute(request) {
  if (request.type === "cashAdvance") return request.amount > 40000 ? "Exceeds the PHP 40,000 employee cash advance limit." : "Finance Manager approval is required for this cash advance.";
  if (!request.budgeted && request.amount > 1000000) return "Board Member approval required for unbudgeted payments above PHP 1,000,000.";
  if (!request.budgeted) return "COO approval required for unbudgeted payments up to PHP 1,000,000.";
  if (request.amount <= 100000) return "Finance Manager can approve and route to voucher creation.";
  if (request.amount <= 300000) return "COO approval required by amount threshold.";
  return "President approval required for budgeted payments above PHP 300,000.";
}

function getVoucher(request) {
  if (request.currentStep < 9) return null;

  const withholdingTax = Math.round(request.amount * 0.02);
  const netPayment = request.amount - withholdingTax;
  const typeLabel = paymentTypes[request.type].label;

  return {
    number: `PV-${request.id.replace("-2026-", "-")}`,
    date: "2026-06-24",
    paymentMethod: "Check payment",
    bank: "BDO Operating Account - 1284",
    checkNumber: request.currentStep >= 11 ? "CHK-004918" : "Pending bank processing",
    grossAmount: request.amount,
    withholdingTax,
    netPayment,
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
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedId, setSelectedId] = useState(seedRequests[0].id);
  const [trackerRequestId, setTrackerRequestId] = useState(null);
  const [dashboardMetric, setDashboardMetric] = useState(null);
  const [draftType, setDraftType] = useState("reimbursement");
  const [lineItemsByType, setLineItemsByType] = useState(() => Object.fromEntries(
    Object.entries(initialLineItems).map(([type, rows]) => [type, rows.map((row) => ({ ...row }))])
  ));
  const [budgeted, setBudgeted] = useState(true);
  const [emailStep, setEmailStep] = useState(3);
  const [uploadId, setUploadId] = useState(uploadSamples[0].id);
  const selected = seedRequests.find((request) => request.id === selectedId) || seedRequests[0];
  const draftLineItems = lineItemsByType[draftType];
  const draftAmount = draftLineItems.reduce((sum, item) => sum + (Number(item.Amount) || 0), 0);
  const draftRequest = { amount: draftAmount, budgeted, type: draftType };

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
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">AP</div>
          <div>
            <h1>Automated Payment System</h1>
            <p>Workflow prototype</p>
          </div>
        </div>
        <nav className="nav-list" aria-label="Primary">
          {[
            ["Overview", [["dashboard", "Dashboard", "▦"]]],
            ["Requests", [["request", "New Request", "+"], ["uploads", "Document Uploads", "↑"], ["documents", "Document Rules", "□"]]],
            ["Processing", [["approvals", "Approval Queue", "✓"], ["tracker", "Payment Tracker", "↗"]]],
            ["Records", [["archive", "Archive / ERP", "◆"], ["emails", "Email Samples", "@"]]],
          ].map(([group, links]) => (
            <div className="nav-group" key={group}>
              <span className="nav-group-label">{group}</span>
              <div className="nav-group-links">
                {links.map(([id, label, icon]) => (
                  <button key={id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}>
                    <span>{icon}</span>{label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="threshold-panel">
          <span className="eyebrow">Routing thresholds</span>
          <p>Budgeted ≤ P100k: Finance Manager</p>
          <p>Budgeted P100k-P300k: COO</p>
          <p>Budgeted &gt; P300k: President</p>
          <p>Unbudgeted ≤ P1M: COO</p>
          <p>Unbudgeted &gt; P1M: Board Member</p>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">Finance operations</p>
            <h2>{tabTitle(activeTab)}</h2>
          </div>
          <div className="user-chip">Finance Associate</div>
        </header>

        {activeTab === "dashboard" && <Dashboard metrics={metrics} selected={selected} onSelect={setSelectedId} activeMetric={dashboardMetric} onMetric={setDashboardMetric} />}
        {activeTab === "request" && (
          <RequestBuilder
            draftType={draftType}
            setDraftType={setDraftType}
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
        {activeTab === "tracker" && <Tracker selectedId={trackerRequestId} onSelect={setTrackerRequestId} />}
        {activeTab === "uploads" && <DocumentUploads selectedId={uploadId} onSelect={setUploadId} />}
        {activeTab === "documents" && <DocumentRules />}
        {activeTab === "emails" && <EmailSamples selectedStep={emailStep} onSelectStep={setEmailStep} />}
        {activeTab === "archive" && <Archive />}
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
    archive: "Records and Posting",
  }[tab];
}

function Dashboard({ metrics, selected, onSelect, activeMetric, onMetric }) {
  const pendingRequests = seedRequests.filter((request) => [3, 4, 5, 7, 8, 8.5].includes(request.currentStep));
  const returnedRequests = seedRequests.filter((request) => request.status.includes("Returned"));
  const unclaimedRequests = seedRequests.filter((request) => request.currentStep === 12);
  const metricViews = {
    pending: { title: "Pending Approvals", description: "Requests currently waiting for a reviewer or approver.", rows: pendingRequests, total: `${pendingRequests.length} requests` },
    value: { title: "Open Request Value", description: "All active payment requests represented on the dashboard.", rows: seedRequests, total: formatCurrency(metrics.total) },
    returned: { title: "Returned Requests", description: "Requests sent back for corrections or additional information.", rows: returnedRequests, total: `${returnedRequests.length} requests` },
    unclaimed: { title: "Unclaimed Checks", description: "Checks available for release but not yet claimed by the payee.", rows: unclaimedRequests, total: `${unclaimedRequests.length} checks` },
  };
  if (activeMetric) return <MetricDetail view={metricViews[activeMetric]} onBack={() => onMetric(null)} onSelect={(id) => { onSelect(id); onMetric(null); }} />;
  return (
    <section className="content-grid">
      <div className="metric-row">
        <Metric label="Pending Approval" value={metrics.pendingApproval} tone="green" hint="View Requests" onClick={() => onMetric("pending")} />
        <Metric label="Open Request Value" value={formatCurrency(metrics.total)} tone="blue" hint="View Breakdown" onClick={() => onMetric("value")} />
        <Metric label="Returned" value={metrics.returned} tone="amber" hint="View Requests" onClick={() => onMetric("returned")} />
        <Metric label="Unclaimed Checks" value={metrics.unclaimed} tone="red" hint="View Checks" onClick={() => onMetric("unclaimed")} />
      </div>
      <div className="two-column">
        <RequestTable selectedId={selected.id} onSelect={onSelect} />
        <RequestDetail request={selected} />
      </div>
      <WorkflowMap currentStep={selected.currentStep} />
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

function RequestTable({ selectedId, onSelect }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h3>Live Requests</h3>
        <span className="count">{seedRequests.length}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Step</th>
              <th>Voucher</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {seedRequests.map((request) => (
              <tr key={request.id} className={selectedId === request.id ? "selected" : ""} onClick={() => onSelect(request.id)}>
                <td>{formatStep(request.currentStep)}</td>
                <td>{request.id}</td>
                <td>{paymentTypes[request.type].label}</td>
                <td>{formatCurrency(request.amount)}</td>
                <td><StatusPill status={request.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RequestDetail({ request }) {
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
        <div><dt>Next route</dt><dd>{getRoute(request)}</dd></div>
      </dl>
      <div className="comment-log">
        <h4>Notes</h4>
        {request.comments.map((comment) => <p key={comment}>{comment}</p>)}
      </div>
      <VoucherCard voucher={getVoucher(request)} request={request} />
    </section>
  );
}

function VoucherCard({ voucher, request }) {
  if (!voucher) return null;

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
        <span>Date: {voucher.date}</span>
        <span>Request: {request.id}</span>
        <span>Status: {request.status}</span>
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
          <tr><th>Gross Amount</th><td>{formatCurrency(voucher.grossAmount)}</td></tr>
          <tr><th>Less: Withholding Tax</th><td>{formatCurrency(voucher.withholdingTax)}</td></tr>
          <tr className="net-row"><th>Net Payment</th><td>{formatCurrency(voucher.netPayment)}</td></tr>
        </tbody>
      </table>
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
          <StatusPill status={selected.status} />
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

function Archive() {
  return (
    <section className="two-column">
      <div className="panel">
        <h3>Document archive</h3>
        <p className="muted">Finance users can retrieve requests, uploaded receipts, reviewer notes, voucher PDFs, signed checks, and release confirmations.</p>
        <div className="archive-search">
          <input placeholder="Search by voucher, vendor, requestor, or department" />
          <button className="primary-button">Search</button>
        </div>
      </div>
      <div className="panel">
        <h3>ERP posting queue</h3>
        <div className="posting-item">
          <span>Accounting entry</span>
          <strong>Auto-post journal entries after payment release</strong>
        </div>
        <div className="posting-item">
          <span>Controls</span>
          <strong>Finance Associate can attach computations and withholding tax details</strong>
        </div>
      </div>
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

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
