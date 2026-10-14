import { request as apiRequest } from "@playwright/test";

export async function prepareCloseout() {
  const contexts = [];
  const session = async email => {
    const context = await apiRequest.newContext({ baseURL: "http://127.0.0.1:58003" }); contexts.push(context);
    const result = await context.post("/api/v1/auth/login", { data: { email, password: "Phase01-Test-Only!" } });
    if (!result.ok()) throw new Error(await result.text());
    return { context, headers: { "X-CSRF-Token": (await result.json()).csrf_token } };
  };
  const json = async response => { if (!response.ok()) throw new Error(await response.text()); return response.json(); };
  const admin = await session("admin@payment.local"), owner = await session("requestor@payment.local"), head = await session("department.head@payment.local"), associate = await session("finance.associate@payment.local"), manager = await session("finance.manager@payment.local");
  const original = await json(await admin.context.get("/api/v1/request-settings/finance-setup"));
  const ids = [];
  for (const [name, account_type, normal_balance] of [["Expense", "expense", "debit"], ["VAT", "asset", "debit"], ["EWT", "liability", "credit"], ["Payable", "liability", "credit"]]) {
    ids.push((await json(await admin.context.post("/api/v1/chart-of-accounts", { headers: admin.headers, data: { code: `CL-${crypto.randomUUID().slice(0,8).toUpperCase()}`, name: `Closeout ${name} ${crypto.randomUUID().slice(0,8)}`, account_type, normal_balance, is_posting: true } }))).id);
  }
  const taxes = await json(await admin.context.get("/api/v1/tax-codes"));
  const setup = await json(await admin.context.put("/api/v1/request-settings/finance-setup", { headers: admin.headers, data: {
    ...original, vat_basis: "inclusive", ewt_basis: "net_of_vat", rounding: "half_up", effective_from: "2020-01-01", effective_date_basis: "finance_review",
    tax_by_request_type: { general: taxes.find(row => row.code === "VAT12-EWT2").id }, accounts_by_request_type: { general: { debit_account_id: ids[0], input_vat_account_id: ids[1], ewt_payable_account_id: ids[2], credit_account_id: ids[3] } },
    voucher: { prefix: "PV", reset_basis: "calendar_year", certification_text: "Finance certification", create_role: "finance_associate", post_role: "finance_manager", void_role: "finance_manager" },
  } }));
  const departments = await json(await admin.context.get("/api/v1/departments")), centers = await json(await admin.context.get("/api/v1/cost-centers")), types = await json(await admin.context.get("/api/v1/document-types"));
  const post = async (session, path, body) => json(await session.context.post(`/api/v1/${path}`, { headers: { ...session.headers, "Idempotency-Key": crypto.randomUUID() }, data: body }));
  const requests = [];
  for (const label of ["Original closeout", "Replacement closeout"]) {
    const draft = await post(owner, "requests", { request_type: "general", department_id: departments.find(row => row.code === "MKTG").id, currency_code: "PHP", payee_name: "Closeout Vendor", purpose: label, type_data: { budgeted: true, billing_document_refs: ["bill.pdf"] }, lines: [{ amount: "1120.00", currency_code: "PHP", particulars: label, vendor_name: "Closeout Vendor", chart_account_id: ids[0], cost_center_id: centers.find(row => row.code === "MKTG").id, attachment_refs: ["invoice.pdf"] }] });
    const upload = async (role, code, line) => json(await role.context.post(`/api/v1/requests/${draft.id}/documents`, { headers: role.headers, multipart: { document_type_id: types.find(row => row.code === code).id, ...(line ? { line_id: line } : {}), file: { name: `${code}.pdf`, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nCloseout fixture\n%%EOF") } } }));
    const bill = await upload(owner, "BILLING_SOA");
    const item = await post(owner, `requests/${draft.id}/submit`, { version: draft.version });
    const approve = async role => { const flow = await json(await role.context.get(`/api/v1/workflow/${item.id}`)); return post(role, `workflow/${item.id}/approve`, { version: flow.version }); };
    await approve(head);
    const invoice = await upload(associate, "INVOICE", item.lines[0].id);
    for (const doc of [bill, invoice]) await post(associate, `documents/${doc.id}/reviews`, { decision: "accepted", comment: "Verified" });
    await post(associate, `finance-validation/${item.id}/lines/${item.lines[0].id}/reviews`, { request_version: item.version, decision: "accepted" });
    await post(associate, `finance-tax/${item.id}`, { request_version: item.version, version: 0, reason: "Confirm defaults", line_tax_code_ids: {} });
    await approve(associate); await approve(manager);
    const body = { request_version: item.version, tax_version: 1, reason: "Finance closeout preparation" };
    await post(associate, `finance-accounting/${item.id}/draft`, { ...body, version: 0 });
    await post(manager, `finance-accounting/${item.id}/post`, { ...body, version: 1 });
    await post(associate, `finance-accounting/${item.id}/voucher`, { ...body, version: 2 });
    if (!requests.length) {
      await post(manager, `finance-vouchers/${item.id}/issue`, { request_version: item.version, version: 0, setup_version: setup.version, reason: "Issue original" });
      await post(manager, `finance-vouchers/${item.id}/void`, { request_version: item.version, version: 1, reason: "Correction requires replacement" });
    }
    requests.push(item);
  }
  return { original: requests[0], replacement: requests[1], manager, admin, restore: async () => { await admin.context.put("/api/v1/request-settings/finance-setup", { headers: admin.headers, data: { ...original, version: setup.version } }); for (const context of contexts) await context.dispose(); } };
}
