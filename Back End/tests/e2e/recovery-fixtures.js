import { request as apiRequest } from "@playwright/test";

export async function prepareRecoveries() {
  const contexts = [];
  const session = async email => {
    const context = await apiRequest.newContext({ baseURL: "http://127.0.0.1:58003" }); contexts.push(context);
    const response = await context.post("/api/v1/auth/login", { data: { email: `${email}@payment.local`, password: "Phase01-Test-Only!" } });
    if (!response.ok()) throw new Error(await response.text());
    return { context, headers: { "X-CSRF-Token": (await response.json()).csrf_token } };
  };
  const json = async response => { if (!response.ok()) throw new Error(await response.text()); return response.json(); };
  const roles = {};
  for (const name of ["admin", "requestor", "department.head", "finance.associate", "finance.manager", "signatory"]) roles[name] = await session(name);
  const admin = roles.admin, associate = roles["finance.associate"], manager = roles["finance.manager"];
  const get = async path => json(await (/^(payments|finance-accounting|finance-vouchers)\//.test(path) ? manager : admin).context.get(`/api/v1/${path}`));
  const post = async (role, path, data) => json(await role.context.post(`/api/v1/${path}`, { headers: { ...role.headers, "Idempotency-Key": crypto.randomUUID() }, data }));
  const ids = [];
  for (const [name, account_type, normal_balance] of [["Expense", "expense", "debit"], ["VAT", "asset", "debit"], ["EWT", "liability", "credit"], ["Payable", "liability", "credit"], ["Advance", "asset", "debit"], ["Receiving Bank", "asset", "debit"]]) {
    ids.push((await post(admin, "chart-of-accounts", { code: `RET-${crypto.randomUUID().slice(0,8).toUpperCase()}`, name: `${name} ${crypto.randomUUID().slice(0,8)}`, account_type, normal_balance, is_posting: true })).id);
  }
  const original = await get("request-settings/finance-setup"), taxes = await get("tax-codes");
  const saved = await json(await admin.context.put("/api/v1/request-settings/finance-setup", { headers: admin.headers, data: { ...original, setup_scope: "system", vat_basis: "inclusive", ewt_basis: "net_of_vat", rounding: "half_up", effective_from: "2020-01-01", effective_date_basis: "finance_review", tax_by_request_type: { general: taxes.find(row => row.code === "VAT12-EWT2").id }, accounts_by_request_type: { general: { debit_account_id: ids[0], input_vat_account_id: ids[1], ewt_payable_account_id: ids[2], credit_account_id: ids[3] }, cashAdvance: { debit_account_id: ids[4], credit_account_id: ids[3] } }, voucher: { prefix: "PV", reset_basis: "calendar_year", certification_text: "Finance certifies this sample voucher", create_role: "finance_associate", post_role: "finance_manager", void_role: "finance_manager" } } }));
  await post(manager, "request-settings/finance-setup/activate", { scope: "all", draft_version: saved.version, expected_previous_version: saved.activation.latest_version, reason: "Recovery test setup" });
  const departments = await get("departments"), centers = await get("cost-centers"), types = await get("document-types"), users = await get("users"), methods = await get("payment-methods");
  const upload = async (role, path, fields = {}) => json(await role.context.post(`/api/v1/${path}`, { headers: { ...role.headers, "Idempotency-Key": crypto.randomUUID() }, multipart: { ...fields, file: { name: "proof.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nRecovery sample evidence\n%%EOF") } } }));
  const prepare = async (type, amount, typeData = {}) => {
    const item = await post(roles.requestor, "requests", { request_type: type, department_id: departments.find(row => row.code === "MKTG").id, currency_code: "PHP", payee_name: "Recovery sample payee", purpose: `${type} recovery testing`, type_data: { budgeted: true, ...typeData }, lines: [{ amount, currency_code: "PHP", particulars: `${type} expenses`, vendor_name: type === "cashAdvance" ? "" : "Sample vendor", invoice_number: type === "cashAdvance" ? null : `INV-${crypto.randomUUID().slice(0,8)}`, invoice_date: type === "cashAdvance" ? null : "2026-10-14", chart_account_id: ids[0], cost_center_id: centers.find(row => row.code === "MKTG").id, attachment_refs: [] }] });
    const docs = [];
    for (const kind of types.filter(row => row.allowed_request_types.includes(type))) {
      for (const line_id of [null, item.lines[0].id]) docs.push(await upload(roles.requestor, `requests/${item.id}/documents`, { document_type_id: kind.id, ...(line_id ? { line_id } : {}) }));
    }
    const submitted = await post(roles.requestor, `requests/${item.id}/submit`, { version: item.version });
    const approve = async role => {
      const flow = await json(await role.context.get(`/api/v1/workflow/${item.id}`));
      return post(role, `workflow/${item.id}/approve`, { version: flow.version });
    };
    await approve(roles["department.head"]);
    for (const doc of docs) await post(associate, `documents/${doc.id}/reviews`, { decision: "accepted", comment: "Verified sample document" });
    await post(associate, `finance-validation/${item.id}/lines/${item.lines[0].id}/reviews`, { request_version: submitted.version, decision: "accepted" });
    await post(associate, `finance-tax/${item.id}`, { request_version: submitted.version, version: 0, reason: "Sample tax calculation", line_tax_code_ids: {} });
    await approve(associate); await approve(manager);
    const body = { request_version: submitted.version, tax_version: 1, reason: "Sample accounting" };
    await post(associate, `finance-accounting/${item.id}/draft`, { ...body, version: 0 });
    await post(manager, `finance-accounting/${item.id}/post`, { ...body, version: 1 });
    await post(associate, `finance-accounting/${item.id}/voucher`, { ...body, version: 2 });
    await post(manager, `finance-vouchers/${item.id}/issue`, { request_version: submitted.version, version: 0, setup_version: saved.version, reason: "Sample certification" });
    return submitted;
  };
  const release = async (item, amount, label) => {
    await post(associate, `payments/${item.id}/lines`, { request_version: item.version, version: 1, reason: "Sample payment", lines: [{ label, amount, method_id: methods.find(row => row.code === "BANK_TRANSFER").id, signatory_user_id: users.find(row => row.email === "signatory@payment.local").id, reference: `REC-${crypto.randomUUID()}` }] });
    const payment = (await get(`payments/${item.id}`)).lines[0];
    await post(roles.signatory, `payments/${item.id}/lines/${payment.id}/authorize`, { request_version: item.version, version: 1, reason: "Sample authorization" });
    const receipt = await upload(associate, `payments/${item.id}/lines/${payment.id}/evidence/upload`, { kind: "release" });
    await post(associate, `payments/${item.id}/lines/${payment.id}/release`, { request_version: item.version, version: 2, reason: "Sample release", evidence_id: receipt.id, bank_name: "Sample bank", recipient_name: "Payee", recorded_on: "2026-10-14" });
    return payment.id;
  };
  const advance = await prepare("cashAdvance", "1000", { event_end_date: "2026-10-13", liquidation_due_date: "2026-10-28", accountability_acknowledged: true });
  const advancePayment = await release(advance, "1000", "Advance transfer");
  const liquidation = await prepare("liquidation", "600", { cash_advance_reference: advance.request_number, liquidation_advance_amount: "1000", liquidation_due_date: "2026-10-28", actual_liquidation_date: "2026-10-14" });
  const general = await prepare("general", "1120", { billing_document_refs: ["proof.pdf"] });
  const payment = await release(general, "1100", "LongPaymentDescription".repeat(8));
  return { general, payment, liquidation, advance, advancePayment, prepare, release, receivingAccount: ids[5], roles, get, post, upload, dispose: async () => { for (const context of contexts) await context.dispose(); } };
}
