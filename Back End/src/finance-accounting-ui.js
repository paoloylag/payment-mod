import { statusLabel } from "./status-label.js";
// Finance workbench uses persisted server amounts for every display and action.
export function accountingBody(r, data, draft, error, escapeHtml, money) {
  const result = data.stale ? data.preview : (data.saved?.result || data.preview);
  const amount = value => money(Number(value), r.currency);
  const labels = { expense: "Expense", advance: "Cash advance asset", advance_settlement: "Advance settlement", input_vat: "Input VAT", ewt_payable: "EWT payable", vendor_payable: "Vendor payable" };
  const entries = (rows, editable) => rows.map(entry => {
    const current = draft.account_overrides?.[entry.key] || entry.account?.id || "";
    const choices = [...data.accounts];
    if (entry.account && !choices.some(row => row.id === entry.account.id)) choices.push(entry.account);
    return `<fieldset class="finance-setup-type"><legend>Line ${entry.position} · ${labels[entry.component]}</legend><p>${escapeHtml(entry.particulars)}</p>
      <dl class="detail-list"><div><dt>Debit</dt><dd>${amount(entry.debit)}</dd></div><div><dt>Credit</dt><dd>${amount(entry.credit)}</dd></div><div><dt>Cost center</dt><dd>${escapeHtml(entry.cost_center ? `${entry.cost_center.code} — ${entry.cost_center.name}` : "Not configured")}</dd></div></dl>
      ${editable ? `<label>Account<select data-accounting-entry="${escapeHtml(entry.key)}" required><option value="">Choose account</option>${choices.map(row => `<option value="${escapeHtml(row.id)}" ${row.id === current ? "selected" : ""}>${escapeHtml(row.code)} — ${escapeHtml(row.name)}</option>`).join("")}</select></label>` : `<p>${escapeHtml(entry.account ? `${entry.account.code} — ${entry.account.name}` : "Account not configured")}</p>`}</fieldset>`;
  }).join("");
  const posted = data.saved?.state === "posted";
  const reversed = data.saved?.state === "reversed";
  const totals = result ? `<dl class="detail-list"><div><dt>Total debit</dt><dd data-accounting-total="debit">${amount(result.totals.debit)}</dd></div><div><dt>Total credit</dt><dd data-accounting-total="credit">${amount(result.totals.credit)}</dd></div><div><dt>Difference</dt><dd data-accounting-total="difference">${amount(result.totals.difference)}</dd></div></dl>` : "";
  const actionForm = (action, label) => `<form data-accounting-action="${action}" class="identity-form"><label>${action === "post" ? "Posting review reason" : "Voucher preparation reason"}<textarea name="reason" maxlength="4000" required rows="2">${escapeHtml(draft[`${action}_reason`] || "")}</textarea></label><p role="alert" data-accounting-error>${escapeHtml(error || "")}</p><button type="submit">${label}</button></form>`;
  return `<p role="status">${reversed ? "Accounting reversed — Original posting preserved" : posted ? "Posted accounting" : data.saved && !data.stale ? `Saved accounting draft ${data.version}` : "Accounting preview — save a draft before posting"}</p>
    <p>Finance Associate prepares and corrects account assignments. Finance Manager posts after final request approval. Amounts follow the saved EWT calculation.</p>
    ${data.stale ? '<p role="alert">The request or EWT calculation changed. Prepare a new draft; earlier entries remain in history.</p>' : ""}
    ${data.blocker ? `<p role="alert">${escapeHtml(data.blocker)}</p>` : ""}${totals}
    ${result?.blockers?.length && !posted ? `<ul>${result.blockers.map(value => `<li>${escapeHtml(value)}</li>`).join("")}</ul>` : ""}
    ${result ? data.can_prepare ? `<form data-accounting-action="draft" class="identity-form">${entries(result.entries, true)}<label>Reason for preparation or correction<textarea name="reason" maxlength="4000" required rows="2">${escapeHtml(draft.reason || "")}</textarea></label><p role="alert" data-accounting-error>${escapeHtml(error || "")}</p><button type="submit">Save accounting draft</button></form>` : `<details><summary>Accounting entries</summary>${entries(result.entries, false)}</details>` : ""}
    ${data.can_post ? actionForm("post", "Post accounting") : ""}
    ${!posted && !reversed && data.saved && !data.can_post ? '<p>Posting becomes available to Finance Manager after final request approval.</p>' : ""}
    ${data.can_prepare_voucher ? actionForm("voucher", "Prepare voucher draft") : ""}
    ${data.voucher ? `<section aria-label="Prepared voucher draft"><h4>Prepared voucher draft</h4><dl class="detail-list">${[["Request", data.voucher.result.request_number], ["Reserved voucher reference", data.voucher.result.reserved_voucher_number], ["Payee", data.voucher.result.payee], ["Purpose", data.voucher.result.purpose], ["Prepared by", data.voucher.result.prepared_by]].map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value || "Pending")}</dd></div>`).join("")}<div><dt>Gross</dt><dd>${amount(data.voucher.result.totals.gross)}</dd></div><div><dt>EWT</dt><dd>${amount(data.voucher.result.totals.ewt)}</dd></div><div><dt>Amount due</dt><dd>${amount(data.voucher.result.totals.amount_due)}</dd></div></dl><p>${escapeHtml(data.voucher.result.certification_text || "Certification wording pending Finance configuration")}</p><p>Draft prepared from posted accounting version ${data.voucher.result.journal_version}. Payment authorization is pending.</p></section>` : ""}
    ${data.history.length ? `<details><summary>Accounting history (${data.history.length})</summary>${data.history.map(row => `<details><summary>Version ${row.version} · ${escapeHtml(statusLabel(row.state))} · ${escapeHtml(row.result.posted_by || row.result.prepared_by)}</summary><p>${escapeHtml(row.created_at)} · ${escapeHtml(row.reason)}</p><p>Request version ${row.request_version} · EWT calculation ${row.result.tax_version}</p>${entries(row.result.entries, false)}</details>`).join("")}</details>` : ""}`;
}
