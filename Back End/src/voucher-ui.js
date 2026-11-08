import { statusLabel } from "./status-label.js";
import { paymentExecutionBody } from "./payment-execution-ui.js";
export function voucherBody(data, draft, error, escapeHtml, money, paymentDrafts = {}) {
  const labels = { fund_return_pending: "Full advance return review pending", funds_returned: "Full fund return verified", recovery_pending: "Payment recovery review pending", reversed: "Payment reversed · Replacement pending", settled_no_payment: "Liquidation settled · No additional payment", cash_return_pending: "Cash return pending · No additional payment", not_prepared: "Voucher draft not prepared", draft: "Voucher draft awaiting certification",
    issued: "Voucher issued", payment_prepared: "Ready for Finance release", authorized: "Payment authorized · Release pending", partially_released: "Partially released", released: "Payment released · Clearing pending", cleared: "Payment cleared", voided: "Voucher voided · Accounting reversed" };
  const instruction = data.payment_instruction;
  const summary = instruction ? `<dl class="detail-list">${[["Payment method", instruction.method], ["Reference", instruction.reference], ["Prepared by", instruction.prepared_by], ["Payment amount", money(Number(instruction.amount), instruction.currency)]].map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>` : "";
  const form = (action, label, fields = "") => `<form data-voucher-action="${action}" class="identity-form">${fields}<label>Reason<textarea name="reason" maxlength="4000" rows="2" required>${escapeHtml(draft[`${action}_reason`] || "")}</textarea></label><p role="alert" data-voucher-error>${escapeHtml(error || "")}</p><button type="submit" ${action === "issue" && data.blockers.length ? "disabled" : ""} class="${action === "void" ? "danger" : "primary-button"}">${label}</button></form>`;
  const fields = `<label>Payment method<select name="method_id" required><option value="">Choose method</option>${data.methods.map(row => `<option value="${row.id}" ${draft.method_id === row.id ? "selected" : ""}>${escapeHtml(row.name)}</option>`).join("")}</select></label><label>Transaction or check reference<input name="reference" maxlength="100" pattern="[A-Za-z0-9][A-Za-z0-9._/-]*" required value="${escapeHtml(draft.reference || "")}"></label>`;
  return `<div class="finance-status-line" role="status" data-voucher-state><span class="status-pill ${["issued", "cleared"].includes(data.state) ? "success" : ""}">${escapeHtml(statusLabel(labels[data.state] || data.state))}</span></div>${error ? `<p role="alert">${escapeHtml(error)}</p>` : ""}${data.latest?.result.voucher_number ? `<p><strong>${escapeHtml(data.latest.result.voucher_number)}</strong></p>` : ""}
    ${(data.replacement_links || []).map(link => `<p>${link.direction === "replaced_by" ? "Replaced by" : "Replacement for"} <a href="#/requests/${escapeHtml(link.direction === "replaced_by" ? link.replacement_request_number : link.original_request_number)}">${escapeHtml(link.direction === "replaced_by" ? link.replacement_request_number : link.original_request_number)}</a><br>${escapeHtml(link.reason)}</p>`).join("")}
    ${data.can_link_replacement ? `<details data-voucher-replacement ${draft.replacement_open ? "open" : ""}><summary>Link replacement voucher</summary><p>The replacement must complete its own approvals and accounting posting. Link it before issuance. The same requestor, department, request type and currency are required.</p>${data.replacement_candidates.length ? form("link-replacement", "Link replacement voucher", `<label>Replacement request<select name="replacement_request_id" required><option value="">Choose approved replacement</option>${data.replacement_candidates.map(row => `<option value="${row.id}" ${draft.replacement_request_id === row.id ? "selected" : ""}>${escapeHtml(row.request_number)}</option>`).join("")}</select></label>`) : "<p>No eligible prepared replacement exists. The requestor should create a new request, complete approvals, and have Finance prepare its voucher draft. Refresh after preparation.</p>"}</details>` : ""}
    ${data.state === "not_prepared" ? '<p class="finance-next-step"><strong>Next step:</strong> Prepare the voucher draft in Accounting above.</p>' : data.can_issue ? '<p class="finance-next-step"><strong>Next step:</strong> Review and issue the voucher.</p>' : data.execution?.can_add ? '<p class="finance-next-step"><strong>Next step:</strong> Add payment lines for release.</p>' : ""}
    ${data.voucher ? `<dl class="detail-list"><div><dt>Payee</dt><dd>${escapeHtml(data.voucher.payee)}</dd></div><div><dt>Amount due</dt><dd>${money(Number(data.voucher.totals.amount_due), data.voucher.currency)}</dd></div></dl>` : ""}
    ${data.voucher?.advance_source ? `<p>Original advance: ${escapeHtml(data.voucher.advance_source.request_number)} · Applied ${money(Number(data.voucher.totals.advance_applied), data.voucher.currency)} · Cash return pending ${money(Number(data.execution?.fund_return?.outstanding ?? data.voucher.totals.cash_return_pending), data.voucher.currency)}.</p>${Number(data.voucher.totals.amount_due) === 0 ? "<p>No additional payment is due. The fund return section below tracks any unused advance and its verification.</p>" : ""}` : ""}
    ${data.blockers.length ? `<ul>${data.blockers.map(value => `<li>${escapeHtml(value)}</li>`).join("")}</ul>` : ""}
    ${data.can_issue ? form("issue", "Issue and certify voucher") : ""}${data.execution ? paymentExecutionBody(data, paymentDrafts, escapeHtml, money) : summary}
    ${!data.execution && data.can_prepare_payment ? `<p>Record the full payment instruction.</p>${form("prepare-payment", "Prepare payment instruction", fields)}` : ""}
    ${!data.execution && data.can_authorize ? `<p>Review the voucher and payment instruction. Authorization records your approval for payment preparation; payment release remains a separate step.</p>${form("authorize", "Authorize payment")}` : ""}
    ${data.can_print ? '<div class="voucher-document-actions"><button type="button" data-view-issued-voucher>View Voucher</button><button type="button" data-print-issued-voucher>Print / Save PDF</button></div>' : ""}
    ${data.can_void ? `<details><summary>Void voucher and reverse accounting</summary><p>This preserves the original voucher and posted entries, adds balancing reversal entries, and invalidates any recorded payment authorization.</p>${form("void", "Void voucher and reverse accounting")}</details>` : ""}
    ${data.history.length ? `<details><summary>Voucher history (${data.history.length})</summary>${data.history.map(row => `<p><strong>${escapeHtml(statusLabel(labels[row.state] || row.state))}</strong> · ${escapeHtml(row.result.actor_name)}<br>${escapeHtml(row.created_at)}<br>${escapeHtml(row.reason)}</p>`).join("")}</details>` : ""}`;
}

export function voucherPrintHtml(data, escapeHtml, money) {
  const amount = value => escapeHtml(money(Number(value), data.currency));
  const text = escapeHtml;
  const footerReference = `${data.voucher_number} / ${data.request_number || ""}`.replace(/[^A-Z0-9 /-]/g, "");
  const department = data.entries?.find(row => row.cost_center?.name)?.cost_center?.name || "Not specified";
  const paymentMethod = data.payment_instruction?.method || data.execution?.lines?.[0]?.details?.method || "Pending payment preparation";
  const approvalRows = (data.approval_history || []).map((row, index) => `<div class="certification-record"><div><small>Approval stage ${index + 1}</small><strong>${text(row.actor)}</strong></div><div><small>Decision</small><strong>${text(statusLabel(row.action))}</strong></div><div><small>Date and time</small><strong>${text(row.occurred_at)}</strong></div>${row.note ? `<div class="approval-note"><small>Reviewer note</small><strong>${text(row.note)}</strong></div>` : ""}</div>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${text(data.voucher_number)}</title><style>
    @page { size: Letter portrait; margin: 0.5in; @bottom-left { content: "${footerReference}"; font: 8pt Arial,sans-serif; color: #555; } @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt Arial,sans-serif; color: #555; } }
    :root { --primary:#9e1d20; --ink:#17191f; --muted:#626a76; --line:#d9d3cc; --accent:#f2e8dc; }
    * { box-sizing: border-box; } html, body { margin:0; padding:0; } body { color: var(--ink); background: white; font: 9.5pt/1.35 Arial,sans-serif; overflow-wrap: anywhere; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .voucher-card { width:100%; min-width:0; border: 1.5pt solid var(--primary); border-radius: 7pt; padding: 12pt; background:#fff; }
    .voucher-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:14pt; padding-bottom:11pt; border-bottom:2pt solid var(--primary); }
    .eyebrow, small { color:var(--muted); font-size:7.5pt; font-weight:700; letter-spacing:.05em; text-transform:uppercase; }
    h1 { margin:3pt 0 0; color:var(--primary); font-size:20pt; line-height:1.1; } h2 { margin:0; font-size:10.5pt; } p { margin:5pt 0; }
    .system-name { color:var(--muted); font-size:9pt; } .issued { text-align:right; } .issued strong { display:block; font-size:10pt; }
    .voucher-meta { display:grid; grid-template-columns:1fr 1fr; gap:16pt; margin:10pt 0; } .voucher-meta > div { display:grid; gap:2pt; } .voucher-meta > div:last-child { text-align:right; }
    .voucher-table { width:100%; border-collapse:collapse; table-layout:fixed; margin-top:9pt; font-size:9pt; } .voucher-table th,.voucher-table td { border:1px solid var(--line); padding:4pt 5pt; vertical-align:top; } .voucher-table th { width:20%; background:var(--accent); text-align:left; } .voucher-table td { font-weight:700; }
    .amount-table { width:57%; margin-left:auto; } .amount-table th { width:65%; } .amount-table td { width:35%; text-align:right; white-space:nowrap; } .net-row th,.net-row td { color:var(--primary); font-size:10.5pt; }
    .section { margin-top:8pt; break-inside:auto; } .section-heading { padding-bottom:5pt; border-bottom:1px solid var(--line); }
    .accounting-table th:nth-child(1){width:24%}.accounting-table th:nth-child(2){width:42%}.accounting-table th:nth-child(3),.accounting-table th:nth-child(4){width:17%}.money{text-align:right;white-space:nowrap}.accounting-table thead{display:table-header-group}.accounting-table tr{break-inside:avoid}
    .approval-certification { margin-top:8pt; border:1px solid var(--line); border-radius:5pt; padding:8pt; break-inside:avoid; } .certification-heading { display:flex; justify-content:space-between; gap:12pt; padding-bottom:6pt; border-bottom:1px solid var(--line); } .certification-heading > div { display:grid; gap:2pt; }
    .certification-record { display:grid; grid-template-columns:1.1fr .65fr 1fr; gap:5pt; padding:4pt 0; border-bottom:1px solid var(--line); } .certification-record > div { display:grid; gap:1pt; min-width:0; } .certification-record strong { font-size:8.5pt; } .approval-note { grid-column:1/-1; }
    .certification-copy { color:var(--muted); font-size:8pt; } .void { margin:8pt 0 0; color:var(--primary); font-size:16pt; font-weight:800; }
    .payment-history p,.settlement p { padding:5pt 7pt; border-left:3pt solid var(--accent); background:#faf8f5; }
    @media (max-width:600px){.voucher-card{min-height:0;padding:12pt}.amount-table{width:100%}.certification-record{grid-template-columns:1fr}.approval-note{grid-column:auto}}
    @media screen { body { padding:16px; background:#e9e9ec; } .voucher-card { max-width:7.5in; margin:auto; } }
    @media print { html,body { width:auto; height:auto; overflow:visible; } .voucher-card { width:100%; max-width:none; margin:0; box-decoration-break:clone; -webkit-box-decoration-break:clone; } .voucher-heading { break-inside:avoid; } }
  </style></head><body><main class="voucher-card"><header class="voucher-heading"><div><span class="eyebrow">Payment Voucher</span><h1>${text(data.voucher_number)}</h1><p class="system-name">Automated Payment System</p></div><div class="issued"><small>Date issued</small><strong>${text(data.issued_on)}</strong>${data.current_state === "voided" ? '<p class="void">VOIDED</p>' : ""}</div></header>
    ${(data.replacement_links || []).map(link => `<p>${link.direction === "replaced_by" ? "Replaced by" : "Replacement for"}: ${text(link.direction === "replaced_by" ? link.replacement_request_number : link.original_request_number)}<br>${text(link.reason)}</p>`).join("")}
    <div class="voucher-meta"><div><small>Reference no.</small><strong>${text(data.request_number)}</strong></div><div><small>Currency</small><strong>${text(data.currency)}</strong></div></div>
    <table class="voucher-table"><tbody><tr><th>Payee</th><td>${text(data.payee)}</td><th>Department</th><td>${text(department)}</td></tr><tr><th>Prepared by</th><td>${text(data.prepared_by)}</td><th>Payment method</th><td>${text(paymentMethod)}</td></tr><tr><th>Purpose</th><td colspan="3">${text(data.purpose)}</td></tr></tbody></table>
    <table class="voucher-table amount-table"><tbody><tr><th>Gross amount</th><td>${amount(data.totals.gross)}</td></tr><tr><th>Input VAT</th><td>${amount(data.totals.vat)}</td></tr><tr><th>Net of VAT / EWT base</th><td>${amount(data.totals.net_of_vat ?? Number(data.totals.gross)-Number(data.totals.vat))}</td></tr><tr><th>Less: EWT</th><td>${amount(data.totals.ewt)}</td></tr><tr class="net-row"><th>Total amount due</th><td>${amount(data.totals.amount_due)}</td></tr></tbody></table>
    <section class="approval-certification"><div class="certification-heading"><div><span class="eyebrow">Digital Approval Certification</span><strong>System-verified approval trail</strong></div><small>No handwritten signature required</small></div><div>${approvalRows || "<p>No request approval events were supplied.</p>"}</div><p class="certification-copy">Authenticated through the Automated Payment System. ${text(data.certification_text)} Prepared by ${text(data.prepared_by)} and certified by ${text(data.certified_by)}. Accounting version ${data.journal_version} · EWT calculation ${data.tax_version} · Request version ${data.request_version}.</p></section>
    <section class="section"><div class="section-heading"><h2>Accounting entries</h2></div><table class="voucher-table accounting-table"><thead><tr><th>Line / Entry</th><th>Account / Cost center</th><th>Debit</th><th>Credit</th></tr></thead><tbody>${data.entries.map(row => `<tr><td>${row.position} · ${text(row.component.replaceAll("_", " "))}<br>${text(row.particulars)}</td><td>${text(row.account.code)} - ${text(row.account.name)}<br>${text(row.cost_center.code)} - ${text(row.cost_center.name)}</td><td class="money">${amount(row.debit)}</td><td class="money">${amount(row.credit)}</td></tr>`).join("")}</tbody></table></section>
    ${data.advance_source ? `<section class="section settlement"><div class="section-heading"><h2>Advance settlement</h2></div><p>Original advance: ${text(data.advance_source.request_number)} · ${amount(data.advance_source.amount)}<br>Applied to expenses: ${amount(data.totals.advance_applied)}<br>Cash return pending: ${amount(data.execution?.fund_return?.outstanding ?? data.totals.cash_return_pending)}</p></section>` : ""}
    ${data.execution?.fund_return?.latest ? `<section class="section settlement"><div class="section-heading"><h2>Fund return receipt</h2></div><p>${text(statusLabel(data.execution.fund_return.latest.state))} · ${text(data.execution.fund_return.latest.result.reference)}<br>${text(data.execution.fund_return.latest.result.receiving_office)} · ${text(data.execution.fund_return.latest.result.recorded_on)}<br>Verified returned funds: ${amount(data.execution.fund_return.verified)}<br>${text(data.execution.fund_return.latest.result.actor_name)} · ${text(data.execution.fund_return.latest.reason)}</p></section>` : ""}
    ${data.execution?.lines.length ? `<section class="section"><div class="section-heading"><h2>Payment line items</h2></div><table class="voucher-table"><thead><tr><th>Payment / Reference</th><th>Method</th><th>Amount</th><th>Status</th></tr></thead><tbody>${data.execution.lines.map(line => `<tr><td>${line.sequence} · ${text(line.details.label || line.details.method)}<br>${text(line.details.reference)}${line.predecessor_id ? "<br>Replacement payment" : ""}</td><td>${text(line.details.method)}</td><td class="money">${amount(line.amount)}</td><td>${text(statusLabel(line.state.replaceAll("_", " ")))}</td></tr>`).join("")}</tbody></table><p>Released: ${amount(data.execution.summary.released)} · Cleared: ${amount(data.execution.summary.cleared)} · Remaining: ${amount(data.execution.summary.remaining)}</p></section>` : ""}
    <section class="section payment-history"><div class="section-heading"><h2>Payment release</h2></div>${!data.execution?.lines.length && data.payment_instruction ? `<p>${text(data.payment_instruction.method)} · ${text(data.payment_instruction.reference)}<br>Payment amount: ${amount(data.payment_instruction.amount)}</p>` : ""}<p>${["settled_no_payment", "cash_return_pending", "funds_returned"].includes(data.current_state) ? "No additional payment authorization required" : data.current_state === "authorized" ? "Authorized · Payment release pending" : data.current_state === "voided" ? "Payment authorization invalidated by voucher voiding" : ["released", "partially_released", "cleared"].includes(data.current_state) ? text(statusLabel(data.current_state.replaceAll("_", " "))) : "Ready for Finance release"}</p>${data.history.map(row => `<p>${text(statusLabel(row.state.replaceAll("_", " ")))} · ${text(row.result.actor_name)} · ${text(row.created_at)}<br>${text(row.reason)}</p>`).join("")}</section>
  </main></body></html>`;
}

export function openVoucherPrint(html) {
  document.querySelector("[data-voucher-print-frame]")?.remove();
  const frame = document.createElement("iframe"); frame.dataset.voucherPrintFrame = "true";
  frame.title = "Issued payment voucher print document";
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:7.5in;height:10in;border:0";
  frame.addEventListener("load", async () => {
    const printDocument = frame.contentDocument;
    const printWindow = frame.contentWindow;
    await printDocument.fonts.ready;
    printWindow.focus();
    printWindow.print();
  }, { once: true });
  frame.srcdoc = html; document.body.appendChild(frame);
}


export function pettyCashVoucherPrintHtml(data, escapeHtml, money) {
  const text = escapeHtml, amount = value => text(money(Number(value), "PHP"));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${text(data.voucher_number)}</title><style>
  @page{size:Letter portrait;margin:.5in}*{box-sizing:border-box}body{font:14px/1.5 Arial,sans-serif;color:#17191f;margin:0;overflow-wrap:anywhere}.voucher-card{border:2px solid #9e1d20;border-radius:8px;padding:24px}h1{color:#9e1d20;font-size:24px;margin:0 0 16px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #d9d3cc;padding:10px;text-align:left}th{background:#f2e8dc}.money{text-align:right}small{color:#626a76}@media(max-width:600px){.voucher-card{padding:12px}h1{font-size:20px}}</style></head><body><main class="voucher-card">
  <small>Automated Payment System · Petty Cash Voucher</small><h1>${text(data.voucher_number)}</h1><p>Request: ${text(data.request_number)}<br>Issued: ${text(data.issued_on)}<br>Payee: ${text(data.payee)}<br>Department: ${text(data.department)}</p><p>${text(data.purpose)}</p>
  <table><thead><tr><th>Particulars</th><th class="money">Amount</th></tr></thead><tbody>${data.lines.map(line=>`<tr><td>${text(line.particulars)}</td><td class="money">${amount(line.amount)}</td></tr>`).join("")}<tr><th>Total approved amount</th><th class="money">${amount(data.amount_due)}</th></tr></tbody></table><p>No VAT/EWT deductions.</p>
  <p>Created by ${text(data.issued_by)} · Finance Associate<br>${text(data.reason)}</p><h2>Approval history</h2>${data.approvals.map(row=>`<p>${text(row.actor)} · ${text(row.occurred_at)}${row.note ? `<br>${text(row.note)}` : ""}</p>`).join("")}</main></body></html>`;
}


export function openVoucherPreview(html, returnFocus = null) {
  document.querySelector("[data-voucher-preview]")?.close();
  const previousFocus = returnFocus || document.activeElement;
  const focusSelector = previousFocus?.matches("[data-view-issued-voucher]") ? "[data-view-issued-voucher]" : "[data-view-petty-voucher]";
  const dialog = document.createElement("dialog");
  dialog.className = "voucher-preview-dialog"; dialog.dataset.voucherPreview = "true";
  dialog.setAttribute("aria-labelledby", "voucherPreviewTitle");
  const header = document.createElement("header");
  const title = document.createElement("h3"); title.id = "voucherPreviewTitle"; title.textContent = "Voucher Preview";
  const actions = document.createElement("div"); actions.className = "voucher-document-actions";
  const print = document.createElement("button"); print.type = "button"; print.textContent = "Print / Save PDF";
  print.addEventListener("click", () => openVoucherPrint(html));
  const close = document.createElement("button"); close.type = "button"; close.textContent = "Close";
  close.setAttribute("aria-label", "Close voucher preview"); close.addEventListener("click", () => dialog.close());
  const frame = document.createElement("iframe"); frame.title = "Voucher document preview";
  frame.setAttribute("sandbox", "allow-same-origin"); frame.srcdoc = html;
  actions.append(print, close); header.append(title, actions); dialog.append(header, frame);
  dialog.addEventListener("close", () => { dialog.remove(); requestAnimationFrame(() => { const target = previousFocus?.isConnected ? previousFocus : document.querySelector(focusSelector); target?.focus(); }); }, {once:true});
  document.body.append(dialog); dialog.showModal(); close.focus();
}
