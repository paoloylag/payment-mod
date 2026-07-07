const paymentTypes = {
  reimbursement: {
    label: "Reimbursement",
    prefix: "RMB",
    required: ["Event or purpose of reimbursement", "Department / cost center for each line item", "Invoice", "Proof of payment"],
    mandatoryFields: [
      { label: "Event or purpose of reimbursement", kind: "textarea", value: "Client workshop reimbursement" },
    ],
    uploadDocuments: ["Invoice", "Billing / Quotation / SOA (if available)", "Proof of payment", "Receipt upload for each line item", "Cash advance form (if applicable)"],
    lineColumns: ["Invoice date", "Invoice no.", "Vendor", "Particulars", "Department / cost center", "Amount", "Receipt"],
  },
  cashAdvance: {
    label: "Cash Advance",
    prefix: "CA",
    required: ["Event or purpose of cash advance", "Department / cost center for each line item"],
    mandatoryFields: [
      { label: "Event or purpose of cash advance", kind: "textarea", value: "Regional sales visit" },
    ],
    uploadDocuments: ["Cash advance form", "Supporting budget / itinerary"],
    lineColumns: ["Particulars", "Department / cost center", "Amount"],
  },
  poPayment: {
    label: "P.O. Payment",
    prefix: "PO",
    required: ["Particulars of P.O. payment", "Department / cost center for each line item", "Approved P.O."],
    mandatoryFields: [
      { label: "Particulars of P.O. payment", kind: "textarea", value: "Office equipment purchase order payment" },
    ],
    uploadDocuments: ["Approved P.O.", "BIR 2303 (if new supplier)", "Billing / Quotation / SOA", "Invoice (if available)"],
    lineColumns: ["P.O. number", "Supplier", "Particulars", "Department / cost center", "Amount"],
  },
  general: {
    label: "General Payment",
    prefix: "GEN",
    required: ["Particulars of payment", "Department / cost center for each line item", "Billing or invoice"],
    mandatoryFields: [
      { label: "Particulars of payment", kind: "textarea", value: "Monthly utilities and service charges" },
    ],
    uploadDocuments: ["Billing or invoice", "BIR 2303 (if new supplier)", "Billing / Quotation / SOA", "Invoice (if available)"],
    lineColumns: ["Supplier", "Particulars", "Department / cost center", "Amount", "Attachment"],
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
  [15, "Archive + ERP", "System"],
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
  15: ["Finance Associate", "Archive and ERP posting completed", "Tracker update completed", "The completed request has been archived and queued for ERP posting.", "Review the journal reference and archived record if reconciliation is required.", "View Archived Record"],
};

const uploadSamples = [
  ["RMB-2026-0161", "reimbursement", "Lia Dizon", "People Ops", "Training Center", 72300, [["Invoice", true, "training-invoice-1042.pdf", "248 KB"], ["Billing / Quotation / SOA", false, "training-quotation.pdf", "181 KB"], ["Proof of payment", true, "proof-of-payment.png", "864 KB"], ["Receipt for each line item", true], ["Cash advance form", false, "cash-advance-reference.pdf", "226 KB"]]],
  ["RMB-2026-0164", "reimbursement", "Mika Santos", "Marketing", "Event Registration", 21850, [["Invoice", true], ["Billing / Quotation / SOA", false], ["Proof of payment", true, "card-payment-receipt.pdf", "126 KB"], ["Receipt for each line item", true], ["Cash advance form", false]]],
  ["CA-2026-0065", "cashAdvance", "Tara Lim", "Sales", "Internal", 45000, [["Cash advance form", true, "signed-cash-advance-form.pdf", "319 KB"], ["Supporting budget / itinerary", true]]],
  ["CA-2026-0068", "cashAdvance", "Iya Cruz", "Events", "Internal", 59000, [["Cash advance form", true, "event-cash-advance.pdf", "284 KB"], ["Supporting budget / itinerary", true, "event-budget-and-itinerary.xlsx", "92 KB"]]],
  ["PO-2026-0102", "poPayment", "Bea Tan", "Procurement", "Atlas Office Systems", 141750, [["Approved P.O.", true, "PO-2026-0102-approved.pdf", "411 KB"], ["BIR 2303 (new supplier)", false, "atlas-bir-2303.pdf", "205 KB"], ["Billing / Quotation / SOA", true, "atlas-soa-june.pdf", "176 KB"], ["Invoice", false]]],
  ["PO-2026-0105", "poPayment", "Jon Reyes", "Operations", "Northstar Supplies", 98200, [["Approved P.O.", true], ["BIR 2303 (new supplier)", false], ["Billing / Quotation / SOA", true, "northstar-quotation.pdf", "238 KB"], ["Invoice", false]]],
  ["GEN-2026-0053", "general", "Nico Ramos", "Facilities", "Metro Repairs", 66200, [["Billing or invoice", true, "metro-repairs-invoice.pdf", "154 KB"], ["BIR 2303 (new supplier)", false], ["Billing / Quotation / SOA", false, "repair-quotation.pdf", "202 KB"], ["Other supporting document", false]]],
  ["GEN-2026-0057", "general", "Carlo Uy", "IT", "CloudWorks", 88400, [["Billing or invoice", true], ["BIR 2303 (new supplier)", false, "cloudworks-bir-2303.pdf", "196 KB"], ["Billing / Quotation / SOA", false], ["Other supporting document", false, "service-acceptance.pdf", "118 KB"]]],
].map(([id, type, requestor, department, vendor, amount, documents]) => ({ id, type, requestor, department, vendor, amount, documents: documents.map(([name, required, file, size]) => ({ name, required, file, size })) }));

const initialLineItems = {
  reimbursement: [
    { "Invoice date": "2026-06-18", "Invoice no.": "INV-1042", Vendor: "Training Center", Particulars: "Leadership workshop", "Department / cost center": "People Ops - 4200", Amount: 50000, Receipt: "training-receipt.pdf" },
    { "Invoice date": "2026-06-19", "Invoice no.": "INV-1048", Vendor: "Travel Desk", Particulars: "Workshop transportation", "Department / cost center": "Marketing - 4100", Amount: 75000, Receipt: "transport-receipt.pdf" },
  ],
  cashAdvance: [{ Particulars: "Regional transportation", "Department / cost center": "Sales - 4300", Amount: 25000 }, { Particulars: "Meals and incidentals", "Department / cost center": "Sales - 4300", Amount: 20000 }],
  poPayment: [{ "P.O. number": "PO-2026-0106", Supplier: "Northstar Supplies", Particulars: "Office workstations", "Department / cost center": "Operations - 4400", Amount: 98000 }, { "P.O. number": "PO-2026-0106", Supplier: "Northstar Supplies", Particulars: "Delivery and installation", "Department / cost center": "IT - 4500", Amount: 27500 }],
  general: [{ Supplier: "City Utilities", Particulars: "Electricity service", "Department / cost center": "Facilities - 4600", Amount: 48500, Attachment: "electric-bill.pdf" }, { Supplier: "City Utilities", Particulars: "Water service", "Department / cost center": "Admin - 4000", Amount: 12200, Attachment: "water-bill.pdf" }, { Supplier: "CloudWorks", Particulars: "Monthly hosting", "Department / cost center": "IT - 4500", Amount: 27700, Attachment: "cloud-invoice.pdf" }],
};

const requests = [
  ["RMB-2026-0144", "reimbursement", "Mika Santos", "Marketing", "Event Registration", 12350, true, "Draft Request", 1, "2026-06-25", "", "", 0, 3],
  ["CA-2026-0049", "cashAdvance", "Tara Lim", "Sales", "Internal", 45000, false, "Uploading Documents", 2, "2026-06-25", "", "", 1, 1],
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
  ["CA-2026-0061", "cashAdvance", "Iya Cruz", "Events", "Internal", 59000, true, "Payment Tracker", 14, "2026-06-12", "2026-06-13", "2026-06-14", 2, 0],
  ["GEN-2026-0049", "general", "Paolo Reyes", "Finance", "ERP Posting", 101250, true, "Archive + ERP Posting", 15, "2026-06-11", "", "", 4, 0],
].map(([id, type, requestor, department, vendor, amount, budgeted, status, currentStep, submitted, returned, resubmitted, documents, missing]) => ({
  id, type, requestor, department, vendor, amount, budgeted, status, currentStep, submitted, returned, resubmitted, documents, missing,
}));

let state = {
  tab: "dashboard",
  selectedId: requests[0].id,
  draftType: "reimbursement",
  budgeted: true,
  emailStep: 3,
  uploadId: uploadSamples[0].id,
  lineItemsByType: Object.fromEntries(Object.entries(initialLineItems).map(([type, rows]) => [type, rows.map((row) => ({ ...row }))])),
};
const money = (value) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(value);
const stepLabel = (value) => value === 8.5 ? "8B" : value;
const route = ({ amount, budgeted }) => !budgeted && amount > 1000000 ? "Board Member approval required for unbudgeted payments above PHP 1,000,000." : !budgeted ? "COO approval required for unbudgeted payments up to PHP 1,000,000." : amount <= 100000 ? "Finance Manager can approve and route to voucher creation." : amount <= 300000 ? "COO approval required by amount threshold." : "President approval required for budgeted payments above PHP 300,000.";
const pillTone = (status) => status.includes("Returned") ? "returned" : status.includes("Board") ? "board" : status.includes("President") ? "executive" : status.includes("COO") ? "coo" : "normal";
const voucherFor = (r) => {
  if (r.currentStep < 9) return "";
  const typeLabel = paymentTypes[r.type].label;
  const withholdingTax = Math.round(r.amount * 0.02);
  const netPayment = r.amount - withholdingTax;
  const voucherNumber = `PV-${r.id.replace("-2026-", "-")}`;
  const checkNumber = r.currentStep >= 11 ? "CHK-004918" : "Pending bank processing";
  const executiveSigner = !r.budgeted && r.amount > 1000000 ? "Board Member" : r.budgeted && r.amount > 300000 ? "President" : r.amount > 100000 || !r.budgeted ? "COO" : "Finance Manager";
  return `<div class="voucher-card">
    <div class="voucher-heading"><div><span class="eyebrow">Payment voucher</span><h4>${voucherNumber}</h4><p>Automated Payment System</p></div><button class="print-button" data-print-voucher="true">Print</button></div>
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
    <table class="voucher-table"><thead><tr><th>Accounting Entry</th><th>Debit</th><th>Credit</th></tr></thead><tbody>
      <tr><td>Expense / payable</td><td>${money(r.amount)}</td><td>-</td></tr>
      <tr><td>Withholding tax payable</td><td>-</td><td>${money(withholdingTax)}</td></tr>
      <tr><td>Cash in bank</td><td>-</td><td>${money(netPayment)}</td></tr>
    </tbody></table>
    <div class="signature-row"><span>Department Head</span><span>Finance Associate</span><span>${executiveSigner}</span></div>
  </div>`;
};
const fieldInput = (field) => field.kind === "textarea"
  ? `<label class="full">${field.label}<textarea>${field.value}</textarea></label>`
  : `<label>${field.label}<input value="${field.value}"></label>`;
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
  if (routeOutput) routeOutput.textContent = route({ amount, budgeted: state.budgeted });
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

function shell(content) {
  const nav = [["dashboard", "Dashboard", "▦"], ["request", "New Request", "+"], ["approvals", "Approval Queue", "✓"], ["tracker", "Payment Tracker", "↗"], ["documents", "Document Rules", "□"], ["archive", "Archive / ERP", "◆"]];
  nav.splice(4, 0, ["uploads", "Document Uploads", "↑"]);
  nav.splice(nav.length - 1, 0, ["emails", "Email Samples", "@"]);
  const titles = { dashboard: "Payment Requests", request: "Create Payment Request", approvals: "Review and Approve", tracker: "Tracker and Reports", uploads: "Upload Required Documents", documents: "Required Documents", emails: "Workflow Email Samples", archive: "Records and Posting" };
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand-block"><div class="brand-mark">AP</div><div><h1>Automated Payment System</h1><p>Workflow prototype</p></div></div>
        <nav class="nav-list">${nav.map(([id, label, icon]) => `<button data-tab="${id}" class="${state.tab === id ? "active" : ""}"><span>${icon}</span>${label}</button>`).join("")}</nav>
        <div class="threshold-panel"><span class="eyebrow">Routing thresholds</span><p>Budgeted ≤ P100k: Finance Manager</p><p>Budgeted P100k-P300k: COO</p><p>Budgeted &gt; P300k: President</p><p>Unbudgeted ≤ P1M: COO</p><p>Unbudgeted &gt; P1M: Board Member</p></div>
      </aside>
      <main>
        <header class="topbar"><div><p class="eyebrow">Finance operations</p><h2>${titles[state.tab]}</h2></div><div class="user-chip">Finance Associate</div></header>
        ${content}
      </main>
    </div>`;
}

function statusPill(status) {
  return `<span class="status-pill ${pillTone(status)}">${status}</span>`;
}

function requestTable() {
  return `<section class="panel"><div class="panel-header"><h3>Live requests</h3><span class="count">${requests.length}</span></div><div class="table-wrap"><table><thead><tr><th>Step</th><th>Voucher</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead><tbody>
    ${requests.map((r) => `<tr data-request="${r.id}" class="${state.selectedId === r.id ? "selected" : ""}"><td>${stepLabel(r.currentStep)}</td><td>${r.id}</td><td>${paymentTypes[r.type].label}</td><td>${money(r.amount)}</td><td>${statusPill(r.status)}</td></tr>`).join("")}
  </tbody></table></div></section>`;
}

function detail(r) {
  return `<section class="panel"><div class="panel-header"><h3>${r.id}</h3>${statusPill(r.status)}</div>
    <dl class="detail-list">
      <div><dt>Requestor</dt><dd>${r.requestor}</dd></div><div><dt>Department</dt><dd>${r.department}</dd></div>
      <div><dt>Payee</dt><dd>${r.vendor}</dd></div><div><dt>Amount</dt><dd>${money(r.amount)}</dd></div>
      <div><dt>Documents</dt><dd>${r.documents} attached, ${r.missing} missing</dd></div><div><dt>Next route</dt><dd>${route(r)}</dd></div>
    </dl><div class="comment-log"><h4>Notes</h4><p>${r.status.includes("Returned") ? "Reviewer requested additional information before resubmission." : "Validated supporting documents and routing threshold."}</p></div>${voucherFor(r)}</section>`;
}

function workflow(currentStep) {
  return `<section class="panel workflow-panel"><div class="panel-header"><h3>Workflow map</h3><span class="eyebrow">Step ${stepLabel(currentStep)}</span></div><div class="workflow-track">
    ${steps.map(([id, name, owner]) => `<div class="workflow-step ${id < currentStep ? "done" : ""} ${id === currentStep ? "current" : ""}"><span>${stepLabel(id)}</span><strong>${name}</strong><small>${owner}</small></div>`).join("")}
  </div></section>`;
}

function dashboard() {
  const selected = requests.find((r) => r.id === state.selectedId);
  const total = requests.reduce((sum, r) => sum + r.amount, 0);
  const pendingApproval = requests.filter((r) => [3, 4, 5, 7, 8, 8.5].includes(r.currentStep)).length;
  const returned = requests.filter((r) => r.status.includes("Returned")).length;
  const unclaimed = requests.filter((r) => r.currentStep === 12).length;
  return `<section class="content-grid">
    <div class="metric-row"><article class="metric green"><span>Pending approval</span><strong>${pendingApproval}</strong></article><article class="metric blue"><span>Open request value</span><strong>${money(total)}</strong></article><article class="metric amber"><span>Returned</span><strong>${returned}</strong></article><article class="metric red"><span>Unclaimed checks</span><strong>${unclaimed}</strong></article></div>
    <div class="two-column">${requestTable()}${detail(selected)}</div>${workflow(selected.currentStep)}
  </section>`;
}

function requestBuilder() {
  const config = paymentTypes[state.draftType];
  const lineItems = state.lineItemsByType[state.draftType];
  const draftAmount = lineItems.reduce((sum, item) => sum + (Number(item.Amount) || 0), 0);
  return `<section class="form-layout"><div class="panel"><div class="panel-header"><h3>Request details</h3><span class="voucher-preview">${config.prefix}-2026-0150</span></div>
    <div class="segmented">${Object.entries(paymentTypes).map(([id, type]) => `<button data-type="${id}" class="${state.draftType === id ? "active" : ""}">${type.label}</button>`).join("")}</div>
    <div class="field-grid"><label>Requestor<input value="Paolo Reyes"></label><label>Payee / vendor<input value="Sample Supplier Inc."></label><label>Calculated amount<input id="draftAmount" type="number" value="${draftAmount}" readonly></label>${config.mandatoryFields.map(fieldInput).join("")}</div>
    <label class="toggle-row"><input id="unbudgeted" type="checkbox" ${!state.budgeted ? "checked" : ""}>Unbudgeted request</label>
    <div class="line-items-section"><div class="line-items-header"><div><span class="eyebrow">Request breakdown</span><h4>Line items</h4></div><button type="button" class="add-line-button" data-add-line="true">+ Add line item</button></div><div class="table-wrap"><table class="line-item-table"><thead><tr>${config.lineColumns.map((column) => `<th>${column}</th>`).join("")}<th><span class="sr-only">Actions</span></th></tr></thead><tbody>
      ${lineItems.map((item, rowIndex) => `<tr>${config.lineColumns.map((column) => { const isFile = column === "Receipt" || column === "Attachment"; return isFile ? `<td><input type="file" aria-label="${column} for line ${rowIndex + 1}">${item[column] ? `<small class="existing-line-file">${item[column]}</small>` : ""}</td>` : `<td><input data-line-row="${rowIndex}" data-line-column="${column}" type="${column === "Amount" ? "number" : column.toLowerCase().includes("date") ? "date" : "text"}" value="${item[column] || ""}"></td>`; }).join("")}<td><button type="button" class="remove-line-button" data-remove-line="${rowIndex}" title="Remove line item" aria-label="Remove line item ${rowIndex + 1}" ${lineItems.length === 1 ? "disabled" : ""}>×</button></td></tr>`).join("")}
    </tbody><tfoot><tr><th colspan="${config.lineColumns.length}"><span>Total</span><strong>${money(draftAmount)}</strong></th><td></td></tr></tfoot></table></div></div></div>
    <div class="panel"><div class="panel-header"><h3>Validation preview</h3><span class="count">${config.required.length}</span></div><ul class="check-list">${config.required.map((item, index) => `<li><span class="${index < config.required.length - 1 ? "ok" : "warn"}">${index < config.required.length - 1 ? "✓" : "!"}</span>${item}</li>`).join("")}</ul>
    <h4>Document uploads</h4><div class="upload-list">${config.uploadDocuments.map(uploadInput).join("")}</div>
    <div class="route-box"><span class="eyebrow">System route</span><strong>${route({ amount: draftAmount, budgeted: state.budgeted })}</strong></div><button class="primary-button">Submit to Department Head</button></div></section>`;
}

function approvals() {
  const selected = requests.find((r) => r.id === state.selectedId);
  return `<section class="two-column approval-layout">${requestTable()}<section class="panel action-panel"><div class="panel-header"><h3>Approval action</h3>${statusPill(selected.status)}</div>${detail(selected)}<div class="approval-actions"><button class="primary-button">Approve and Notify Next Owner</button><button>Request More Information</button><button class="danger">Disapprove</button></div><label>Reviewer note<textarea>Validated supporting documents and routing threshold.</textarea></label></section></section>`;
}

function tracker() {
  return `<section class="panel"><div class="panel-header"><h3>Payment tracker</h3><button class="icon-button" title="Export report">↧</button></div><div class="table-wrap"><table><thead><tr><th>Voucher</th><th>Submitted</th><th>Returned</th><th>Resubmitted</th><th>Approval</th><th>Check approval</th><th>Payment</th></tr></thead><tbody>${requests.map((r, i) => `<tr><td>${r.id}</td><td>${r.submitted}</td><td>${r.returned || "-"}</td><td>${r.resubmitted || "-"}</td><td>${i === 0 ? "Pending" : "2026-06-24"}</td><td>${r.currentStep >= 11 ? "2026-06-25" : "Pending"}</td><td>${r.currentStep >= 13 ? "2026-06-25" : "Pending"}</td></tr>`).join("")}</tbody></table></div><div class="report-band"><div><span class="eyebrow">Report</span><strong>Unclaimed checks</strong></div><p>Flags checks marked available but not yet released to the payee.</p></div></section>`;
}

function documentUploads() {
  const selected = uploadSamples.find((request) => request.id === state.uploadId) || uploadSamples[0];
  const required = selected.documents.filter((document) => document.required);
  const completed = required.filter((document) => document.file).length;
  return `<section class="document-upload-layout">
    <section class="panel upload-request-list"><div class="panel-header"><h3>Requests needing documents</h3><span class="count">${uploadSamples.length}</span></div><div class="upload-request-buttons">
      ${uploadSamples.map((request) => { const requiredDocuments = request.documents.filter((document) => document.required); const uploadedDocuments = requiredDocuments.filter((document) => document.file).length; return `<button data-upload-request="${request.id}" class="${selected.id === request.id ? "active" : ""}"><div><strong>${request.id}</strong><span>${paymentTypes[request.type].label}</span></div><small>${uploadedDocuments}/${requiredDocuments.length} required</small></button>`; }).join("")}
    </div></section>
    <section class="panel upload-workspace"><div class="panel-header"><div><span class="eyebrow">${paymentTypes[selected.type].label}</span><h3>${selected.id}</h3></div><span class="upload-progress ${completed === required.length ? "complete" : "pending"}">${completed}/${required.length} required uploaded</span></div>
      <dl class="upload-request-meta"><div><dt>Requestor</dt><dd>${selected.requestor}</dd></div><div><dt>Department</dt><dd>${selected.department}</dd></div><div><dt>Payee</dt><dd>${selected.vendor}</dd></div><div><dt>Amount</dt><dd>${money(selected.amount)}</dd></div></dl>
      <div class="document-file-list">${selected.documents.map((document) => `<article class="document-file-row ${document.file ? "uploaded" : "missing"}"><div class="document-file-info"><div><strong>${document.name}</strong><span class="${document.required ? "required-tag" : "conditional-tag"}">${document.required ? "Required" : "Conditional"}</span></div>${document.file ? `<p><span class="file-icon">${document.file.split(".").pop().toUpperCase()}</span>${document.file} <small>${document.size}</small></p>` : `<p class="missing-file">No file uploaded</p>`}</div><label class="file-picker"><span>${document.file ? "Replace file" : "Add file"}</span><input type="file" aria-label="${document.file ? "Replace" : "Add"} ${document.name}"></label></article>`).join("")}</div>
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

function archive() {
  return `<section class="two-column"><div class="panel"><h3>Document archive</h3><p class="muted">Finance users can retrieve requests, uploaded receipts, reviewer notes, voucher PDFs, signed checks, and release confirmations.</p><div class="archive-search"><input placeholder="Search by voucher, vendor, requestor, or department"><button class="primary-button">Search</button></div></div><div class="panel"><h3>ERP posting queue</h3><div class="posting-item"><span>Accounting entry</span><strong>Auto-post journal entries after payment release</strong></div><div class="posting-item"><span>Controls</span><strong>Finance Associate can attach computations and withholding tax details</strong></div></div></section>`;
}

function render() {
  const views = { dashboard, request: requestBuilder, approvals, tracker, uploads: documentUploads, documents, emails, archive };
  document.getElementById("root").innerHTML = shell(views[state.tab]());
  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => setState({ tab: button.dataset.tab })));
  document.querySelectorAll("[data-request]").forEach((row) => row.addEventListener("click", () => setState({ selectedId: row.dataset.request })));
  document.querySelectorAll("[data-type]").forEach((button) => button.addEventListener("click", () => setState({ draftType: button.dataset.type })));
  document.querySelectorAll("[data-email-step]").forEach((button) => button.addEventListener("click", () => setState({ emailStep: Number(button.dataset.emailStep) })));
  document.querySelectorAll("[data-upload-request]").forEach((button) => button.addEventListener("click", () => setState({ uploadId: button.dataset.uploadRequest })));
  document.querySelector("[data-add-line]")?.addEventListener("click", addDraftLineItem);
  document.querySelectorAll("[data-remove-line]").forEach((button) => button.addEventListener("click", () => removeDraftLineItem(Number(button.dataset.removeLine))));
  document.querySelectorAll("[data-line-row]").forEach((input) => input.addEventListener("input", () => updateDraftLineItem(Number(input.dataset.lineRow), input.dataset.lineColumn, input.value)));
  document.querySelector("[data-print-voucher]")?.addEventListener("click", () => window.print());
  document.getElementById("unbudgeted")?.addEventListener("change", (event) => setState({ budgeted: !event.target.checked }));
}

render();
