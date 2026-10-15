import { closeIcon, uploadIcon } from "./icons.js";

export function fundReturnBody(data, drafts, text, money, currency, accounts) {
  if (!data) return "";
  const amount = value => text(money(Number(value), currency));
  const form = (action, title) => {
    const draft = drafts[`fundReturn:${action}`] || {};
    return `<details ${draft.open ? "open" : ""}><summary>${title}</summary><form class="identity-form" data-fund-return-action="${action}">
      ${action === "record" ? `<p>Record the full unused balance in ${text(currency)}. It remains outstanding until Finance Manager verifies the receipt.</p>
      <label>Full return amount<input name="amount" value="${text(data.expected)}" readonly required></label>
      <label>Receipt date<input type="date" name="recorded_on" value="${text(draft.recorded_on || "")}" required></label>
      <label>Receipt or deposit reference<input name="reference" value="${text(draft.reference || "")}" required maxlength="100"></label>
      <label>Receiving bank or cash office<input name="receiving_office" value="${text(draft.receiving_office || "")}" required maxlength="160"></label>
      <label>Receiving cash/bank asset account<select name="receiving_account_id" required><option value="">Choose account</option>${accounts.map(row => `<option value="${text(row.id)}" ${row.id === draft.receiving_account_id ? "selected" : ""}>${text(row.name)}</option>`).join("")}</select></label>
      <div class="payment-evidence-control"><span>Return receipt or deposit evidence</span><div class="file-upload-selection"><div class="selected-upload-file" data-return-file-selection ${draft.file ? "" : "hidden"}><span data-return-file-name>${text(draft.file?.name || "")}</span><button type="button" class="close-icon-button" data-remove-return-file aria-label="Remove return evidence">${closeIcon}</button></div><label class="line-upload-control document-upload-button"><input type="file" name="evidence" aria-label="Return evidence" accept=".pdf,.png,.jpg,.jpeg" ${draft.file ? "" : "required"}>${uploadIcon}<span>Upload Files</span></label></div></div>` : ""}
      <label>Reason<textarea name="reason" rows="2" required maxlength="4000">${text(draft.reason || "")}</textarea></label><p role="alert" data-return-error></p><button type="submit" class="${action === "reject" ? "danger" : "primary-button"}">${title}</button></form></details>`;
  };
  return `<section data-fund-return aria-label="Unused advance fund return" class="payment-line-card"><h4>Unused advance fund return</h4>
    <dl class="detail-list">${[["Required return", data.expected], ["Verified returned funds", data.verified], ["Outstanding return", data.outstanding]].map(([title, value]) => `<div><dt>${title}</dt><dd>${amount(value)}</dd></div>`).join("")}</dl>
    <p data-fund-return-state>${({ recorded: "Receipt recorded · Finance Manager verification pending", verified: "Full fund return verified", rejected: "Receipt rejected · Finance Associate must record corrected evidence" })[data.latest?.state] || "Full return receipt required"}</p>
    ${data.latest ? `<p>Receipt ${text(data.latest.result.reference)} · ${text(data.latest.result.receiving_office)} · ${text(data.latest.result.recorded_on)}<br>Receiving account: ${text(data.latest.result.receiving_account.code)} — ${text(data.latest.result.receiving_account.name)}</p>${data.evidence_available ? `<a href="/api/v1/documents/${text(data.latest.result.document_id)}/content" target="_blank" rel="noopener">Open return evidence</a>` : '<p role="alert">Receipt evidence unavailable.</p>'}` : ""}
    ${data.can_record ? form("record", "Record full fund return") : ""}${data.can_verify ? `${form("verify", "Verify full fund return")}${form("reject", "Reject fund return receipt")}` : ""}
    ${data.latest?.result.receipt_entries ? `<h4>Verified receipt accounting</h4><dl class="detail-list">${data.latest.result.receipt_entries.map(row => `<div><dt>${Number(row.debit) > 0 ? "Debit" : "Credit"} · ${text(row.account.code)} — ${text(row.account.name)}</dt><dd>${amount(Number(row.debit) > 0 ? row.debit : row.credit)}</dd></div>`).join("")}</dl>` : ""}
    ${data.history.length ? `<details><summary>Fund return history (${data.history.length})</summary>${data.history.map(row => `<p><strong>${text(row.state)}</strong> · ${text(row.result.actor_name)}<br>${text(row.created_at)}<br>${text(row.reason)}</p>`).join("")}</details>` : ""}</section>`;
}
