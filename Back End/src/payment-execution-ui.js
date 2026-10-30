import { statusLabel } from "./status-label.js";
import { closeIcon, uploadIcon } from "./icons.js";
import { fundReturnBody } from "./fund-return-ui.js";
export function paymentExecutionBody(data, drafts, text, money) {
  const execution = data.execution;
  if (!execution) return "";
  const precision = execution.currency_precision ?? 2;
  const quantum = (10 ** -precision).toFixed(precision);
  const amount = value => text(money(Number(value), execution.summary.currency));
  const label = state => statusLabel(({ prepared: "Ready for Finance release", authorized: "Authorized", ready_for_pickup: "Ready for pickup", released: "Released", cleared: "Cleared", failed: "Failed", voided: "Voided", recovery_pending: "Recovery recorded · Manager review pending", reversed: "Payment reversed · Full recovery verified" })[state] || state);
  const input = (name, title, value = "", attrs = "") => `<label>${title}<input name="${name}" value="${text(value)}" ${attrs}></label>`;
  const reason = draft => `<label>Reason<textarea name="reason" rows="2" maxlength="4000" required>${text(draft.reason || "")}</textarea></label>`;
  const options = (name, title, rows, value) => `<label>${title}<select name="${name}" required><option value="">Choose ${title.toLowerCase()}</option>${rows.map(row => `<option value="${text(row.id)}" ${row.id === value ? "selected" : ""}>${text(row.name)}</option>`).join("")}</select></label>`;
  const schedule = drafts.schedule || { lines: [{}] };
  const rows = schedule.lines || [{}];
  const preparation = execution.can_add ? `<details ${schedule.open ? "open" : ""} data-payment-schedule><summary>Add payment line items</summary><form class="identity-form" data-payment-action="prepare">
    <p>Available to allocate: <strong>${amount(execution.summary.available)}</strong>. Each line requires separate authorization.</p>
    ${rows.map((row, index) => `<fieldset data-payment-draft-line="${index}"><legend>Payment ${index + 1}${row.predecessor_id ? " · Replacement" : ""}</legend>
      ${input("label", "Payment description", row.label, 'required maxlength="200"')}
      ${input("amount", "Amount", row.amount, `type="number" step="${quantum}" min="${quantum}" required ${row.predecessor_id ? "readonly" : ""}`)}
      ${options("method_id", "Payment method", data.methods, row.method_id)}
      ${input("reference", "Transaction or check reference", row.reference, 'required maxlength="100" pattern="[A-Za-z0-9][A-Za-z0-9._/-]*"')}

      ${row.predecessor_id ? `<input type="hidden" name="predecessor_id" value="${text(row.predecessor_id)}">` : ""}
      ${rows.length > 1 ? `<button type="button" data-remove-payment-line="${index}">Remove payment line</button>` : ""}</fieldset>`).join("")}
    <button type="button" data-add-payment-line ${rows.length >= 50 ? "disabled" : ""}>Add another payment line</button>
    ${reason(schedule)}<p role="alert" data-payment-error></p><button type="submit" class="primary-button">Prepare payment line items</button></form></details>` : "";
  const actionForm = (line, action, title) => {
    const draft = drafts[`${line.id}:${action}`] || {};
    const needsEvidence = ["release", "clear", "recover"].includes(action);
    return `<details ${draft.open ? "open" : ""}><summary>${title}</summary><form class="identity-form" data-payment-action="${action}" data-payment-line="${text(line.id)}">
      ${action === "recover" ? `<p>Record full recovery of ${amount(line.amount)}. This amount remains allocated until Finance Manager confirms reversal.</p>${input("recovered_amount", "Recovered amount", line.amount, "readonly required")}${input("bank_name", "Receiving bank or cash office", draft.bank_name, 'required maxlength="160"')}${input("recipient_name", "Returned by", draft.recipient_name, 'required maxlength="200"')}` : ""}
      ${["confirm-reversal", "reject-recovery"].includes(action) ? '<p>Review the recovery evidence below. Confirmation reopens this amount for a linked replacement for Finance release. Request approvals and expense/tax accounting remain recorded.</p>' : ""}
      ${needsEvidence ? `${input("recorded_on", action === "release" ? "Release date" : action === "recover" ? "Recovery date" : "Clearing date", draft.recorded_on, 'type="date" required')}
        ${action === "release" ? `${input("bank_name", line.details.method_category === "cash" ? "Releasing cash office" : "Releasing bank", draft.bank_name, 'required maxlength="160"')}${input("recipient_name", "Recipient", draft.recipient_name, 'required maxlength="200"')}` : ""}
        ${draft.evidence_id ? '<p role="status">Supporting evidence uploaded.</p>' : `<div class="payment-evidence-control"><span>Supporting evidence</span><div class="file-upload-selection"><div class="selected-upload-file" data-payment-file-selection ${draft.file ? "" : "hidden"}><span data-payment-file-name>${text(draft.file?.name || "")}</span><button type="button" class="close-icon-button" data-remove-payment-file aria-label="Remove supporting evidence">${closeIcon}</button></div><label class="line-upload-control document-upload-button"><input name="evidence" type="file" aria-label="Supporting evidence" accept=".pdf,.png,.jpg,.jpeg" ${draft.file ? "" : "required"}>${uploadIcon}<span>Upload Files</span></label></div></div>`}` : ""}
      ${reason(draft)}<p role="alert" data-payment-error></p><button type="submit" class="${["fail", "void"].includes(action) ? "danger" : "primary-button"}">${title}</button></form></details>`;
  };
  return `<section data-payment-execution aria-label="Payment line items"><h4>Payment line items</h4>
    <dl class="detail-list">${[["Allocated", "allocated"], ["Released (net of confirmed recoveries)", "released"], ["Cleared", "cleared"], ["Remaining to release", "remaining"], ["Verified payment recoveries", "recovered"]].map(([title, key]) => `<div><dt>${title}</dt><dd>${amount(execution.summary[key] || "0")}</dd></div>`).join("")}</dl>
    ${fundReturnBody(execution.fund_return, drafts, text, money, execution.summary.currency, data.return_accounts || [])}
    ${execution.lines.map(line => `<article class="payment-line-card" data-payment-card="${text(line.id)}"><h4>Payment ${line.sequence} · ${text(line.details.label || line.details.method)}</h4>
      <p><strong>${amount(line.amount)}</strong> · <span data-payment-state>${label(line.state)}</span></p>
      <dl class="detail-list">${[["Method", line.details.method], ["Reference", line.details.reference]].map(([title, value]) => `<div><dt>${title}</dt><dd>${text(value)}</dd></div>`).join("")}</dl>
      ${line.predecessor_id ? `<p>Replacement for payment ${execution.lines.find(row => row.id === line.predecessor_id)?.sequence || ""}.</p>` : ""}${line.replacement_id ? `<p>Replaced by payment ${execution.lines.find(row => row.id === line.replacement_id)?.sequence || ""}.</p>` : ""}
      ${line.can_authorize ? actionForm(line, "authorize", "Authorize payment line") : ""}
      ${line.can_pickup_ready ? actionForm(line, "pickup-ready", "Mark ready for pickup") : ""}
      ${line.can_release ? actionForm(line, "release", "Record payment release") : ""}
      ${line.can_clear ? actionForm(line, "clear", "Confirm payment clearing") : ""}
      ${line.can_recover ? actionForm(line, "recover", "Record full payment recovery") : ""}
      ${line.recovery_blocker ? `<p>${text(line.recovery_blocker)}</p>` : ""}
      ${line.can_confirm_reversal ? `${actionForm(line, "confirm-reversal", "Confirm post-release reversal")}${actionForm(line, "reject-recovery", "Reject payment recovery")}` : ""}
      ${line.can_fail ? `${actionForm(line, "fail", "Mark payment failed")}${actionForm(line, "void", "Void payment line")}` : ""}
      ${line.can_replace ? `<button type="button" data-replace-payment="${text(line.id)}">Prepare replacement</button>` : ""}
      ${line.evidence.length ? `<details><summary>Supporting evidence (${line.evidence.length})</summary>${line.evidence.map(row => `<p>${text(row.kind)} · ${text(row.filename)}${row.available ? ` <a href="/api/v1/documents/${text(row.document_id)}/content" target="_blank" rel="noopener">Open evidence</a>` : " · Unavailable"}</p>`).join("")}</details>` : ""}
      ${line.history.length ? `<details><summary>Payment history (${line.history.length})</summary>${line.history.map(row => `<p><strong>${row.result.recovery_rejected ? "Recovery Rejected" : label(row.state)}</strong> · ${text(row.result.actor_name)}<br>${text(row.created_at)}<br>${text(row.reason)}${row.result.bank_name ? `<br>${text(row.result.bank_name)} · ${text(row.result.recipient_name)}` : ""}${row.result.recorded_on ? `<br>Recorded date: ${text(row.result.recorded_on)}` : ""}</p>`).join("")}</details>` : ""}</article>`).join("")}
    ${preparation}</section>`;
}
