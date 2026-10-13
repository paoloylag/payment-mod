import { writeFileSync } from "node:fs";
import { expect, request as apiRequest, test } from "@playwright/test";

test("all request types use Finance defaults and individual payment authorization", async ({ browser }) => {
  test.setTimeout(300_000);
  const sessions = [], browsers = [], errors = [];
  const session = async email => {
    const context = await apiRequest.newContext({ baseURL: "http://127.0.0.1:58003" }); sessions.push(context);
    const result = await context.post("/api/v1/auth/login", { data: { email, password: "Phase01-Test-Only!" } });
    expect(result.ok(), await result.text()).toBeTruthy();
    return { context, headers: { "X-CSRF-Token": (await result.json()).csrf_token } };
  };
  const ui = async email => {
    const context = await browser.newContext(); browsers.push(context);
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    page.setDefaultTimeout(15_000);
    await page.goto("/#/login"); await page.locator("[data-demo-login]").selectOption(email);
    await page.getByRole("button", { name: "Sign in" }).click(); await expect(page).toHaveURL(/#\/dashboard$/);
    return page;
  };
  const admin = await session("admin@payment.local");
  const original = await (await admin.context.get("/api/v1/request-settings/finance-setup")).json();
  try {
    const ids = [];
    for (const [name, account_type, normal_balance] of [["Expense", "expense", "debit"], ["VAT", "asset", "debit"], ["EWT", "liability", "credit"], ["Payable", "liability", "credit"], ["Advance", "asset", "debit"]]) {
      const result = await admin.context.post("/api/v1/chart-of-accounts", { headers: admin.headers, data: {
        code: `ALL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, name, account_type, normal_balance, is_posting: true,
      } }); expect(result.ok(), await result.text()).toBeTruthy(); ids.push((await result.json()).id);
    }
    const taxes = await (await admin.context.get("/api/v1/tax-codes")).json();
    const configured = await admin.context.put("/api/v1/request-settings/finance-setup", { headers: admin.headers, data: {
      ...original, setup_scope: "system", vat_basis: "inclusive", ewt_basis: "net_of_vat", rounding: "half_up",
      effective_from: "2020-01-01", effective_date_basis: "finance_review",
      tax_by_request_type: { general: taxes.find(row => row.code === "VAT12-EWT2").id },
      accounts_by_request_type: { general: { debit_account_id: ids[0], input_vat_account_id: ids[1], ewt_payable_account_id: ids[2], credit_account_id: ids[3] }, cashAdvance: { debit_account_id: ids[4], credit_account_id: ids[3] } },
      voucher: { prefix: "PV", reset_basis: "calendar_year", certification_text: "Finance certification", create_role: "finance_associate", post_role: "finance_manager", void_role: "finance_manager" },
    } }); expect(configured.ok(), await configured.text()).toBeTruthy();
    const managerPage = await ui("finance.manager@payment.local");
    await managerPage.goto("/#/administration/request-settings");
    const activation = managerPage.locator("[data-finance-activation]");
    await activation.locator('[name="scope"]').selectOption("all");
    await activation.locator('[name="reason"]').fill("Activate the confirmed payment flow for all types");
    await activation.getByRole("button", { name: "Activate saved setup for all request types" }).click();
    await expect(activation.getByRole("button")).toHaveText("Saved version already activated");
    expect((await (await admin.context.get("/api/v1/request-settings/finance-setup")).json()).activation.scope).toBe("all");
    const associate = await session("finance.associate@payment.local"), owner = await session("requestor@payment.local");
    const manager = await session("finance.manager@payment.local");
    const page = await ui("finance.associate@payment.local"), signatoryPage = await ui("signatory@payment.local");
    const departments = await (await admin.context.get("/api/v1/departments")).json();
    const centers = await (await admin.context.get("/api/v1/cost-centers")).json();
    const documentTypes = await (await admin.context.get("/api/v1/document-types")).json();
    const methods = await (await admin.context.get("/api/v1/payment-methods")).json();
    const transfer = methods.find(row => row.code === "BANK_TRANSFER").id;
    let advance;
    for (const type of ["cashAdvance", "reimbursement", "poPayment", "liquidation"]) {
      console.log(`Payment flow: ${type}`);
      const isAdvance = type === "cashAdvance", isPo = type === "poPayment", isLiquidation = type === "liquidation";
      const amount = isAdvance ? "1000.00" : isPo ? "89000.00" : "1120.00";
      const typeData = isAdvance ? { event_end_date: "2026-10-13", liquidation_due_date: "2026-10-28", accountability_acknowledged: true }
        : isPo ? { po_reference: "PO-DEMO-1001", budgeted: true }
          : isLiquidation ? { cash_advance_reference: advance.request_number, liquidation_advance_amount: "1000.00", liquidation_due_date: "2026-10-28", actual_liquidation_date: "2026-10-13" } : {};
      const created = await owner.context.post("/api/v1/requests", { headers: owner.headers, data: {
        request_type: type, department_id: departments.find(row => row.code === "MKTG").id,
        currency_code: "PHP", payee_name: isPo ? "Sample BrightTech Supply" : "Mara Reyes", purpose: `${type} payment browser validation`,
        type_data: { budgeted: true, ...typeData }, lines: [{ amount, currency_code: "PHP", particulars: `${type} expenses`,
          vendor_name: isAdvance ? "" : isPo ? "Sample BrightTech Supply" : "Merchant",
          invoice_number: isAdvance ? null : isPo ? "PO-DEMO-1001" : "ALL-INVOICE", invoice_date: isAdvance || isPo ? null : "2026-10-13",
          chart_account_id: ids[0], cost_center_id: centers.find(row => row.code === "MKTG").id, attachment_refs: isAdvance || isLiquidation ? [] : ["proof.pdf"] }],
      } }); expect(created.ok(), await created.text()).toBeTruthy(); const draft = await created.json();
      if (isAdvance) expect(draft.lines[0].chart_account_id).toBe(ids[4]);
      const documentIds = [];
      for (const documentType of documentTypes.filter(row => row.allowed_request_types.includes(type))) {
        for (const lineId of [null, draft.lines[0].id]) {
          const uploaded = await owner.context.post(`/api/v1/requests/${draft.id}/documents`, { headers: owner.headers,
            multipart: { document_type_id: documentType.id, ...(lineId ? { line_id: lineId } : {}),
              file: { name: "proof.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nEvidence\n%%EOF") } } });
          expect(uploaded.ok(), await uploaded.text()).toBeTruthy(); documentIds.push((await uploaded.json()).id);
        }
      }
      const submitted = await owner.context.post(`/api/v1/requests/${draft.id}/submit`, { headers: { ...owner.headers, "Idempotency-Key": crypto.randomUUID() }, data: { version: draft.version } });
      expect(submitted.ok(), await submitted.text()).toBeTruthy(); const item = await submitted.json();
      const approveCurrent = async () => {
        const workflow = await (await admin.context.get(`/api/v1/workflow/${item.id}`)).json();
        if (workflow.state === "approved") return workflow;
        const role = workflow.route.stages[workflow.current_stage].role;
        const email = { department_head: "department.head", finance_associate: "finance.associate", finance_manager: "finance.manager", board_member: "board.member" }[role] || role;
        const reviewer = await session(`${email}@payment.local`);
        const result = await reviewer.context.post(`/api/v1/workflow/${item.id}/approve`, { headers: { ...reviewer.headers, "Idempotency-Key": crypto.randomUUID() }, data: { version: workflow.version } });
        expect(result.ok(), await result.text()).toBeTruthy(); return result.json();
      };
      await approveCurrent();
      for (const id of documentIds) {
        const accepted = await associate.context.post(`/api/v1/documents/${id}/reviews`, { headers: associate.headers, data: { decision: "accepted", comment: "Verified" } });
        expect(accepted.ok(), await accepted.text()).toBeTruthy();
      }
      const acceptedLine = await associate.context.post(`/api/v1/finance-validation/${item.id}/lines/${item.lines[0].id}/reviews`, { headers: associate.headers, data: { request_version: item.version, decision: "accepted", physical_original_received: true } });
      expect(acceptedLine.ok(), await acceptedLine.text()).toBeTruthy();
      await page.goto(`/#/requests/${item.request_number}`);
      const calculation = page.locator("[data-finance-tax-form]");
      await calculation.locator('[name="reason"]').fill("Review amounts for this request type");
      await calculation.locator('button[type="submit"]').click();
      await expect(page.locator("[data-finance-tax]")).toContainText("Saved calculation 1");
      const accounting = page.locator('[data-accounting-action="draft"]');
      await accounting.locator('[name="reason"]').fill("Balanced accounting from configured defaults");
      await accounting.getByRole("button", { name: "Save accounting draft" }).click();
      await expect(page.locator("[data-finance-accounting]")).toContainText("Saved accounting draft 1");
      let approved = await approveCurrent();
      for (let count = 0; approved.state !== "approved" && count < 8; count++) approved = await approveCurrent();
      expect(approved.state).toBe("approved");
      await managerPage.goto(`/#/requests/${item.request_number}`);
      const post = managerPage.locator('[data-accounting-action="post"]');
      await post.locator('[name="reason"]').fill("Post approved accounting"); await post.getByRole("button").click();
      await expect(managerPage.locator("[data-finance-accounting]")).toContainText("Posted accounting");
      await page.reload(); const voucher = page.locator('[data-accounting-action="voucher"]');
      await voucher.locator('[name="reason"]').fill("Prepare the voucher"); await voucher.getByRole("button").click();
      await expect(page.locator("[data-finance-accounting]")).toContainText("Prepared voucher draft");
      await managerPage.reload(); const issue = managerPage.locator('[data-voucher-action="issue"]');
      await issue.locator('[name="reason"]').fill("Certify this voucher"); await issue.getByRole("button").click();
      await expect(managerPage.locator("[data-voucher-state]")).toHaveText("Voucher issued");
      const details = await (await manager.context.get(`/api/v1/finance-vouchers/${item.id}`)).json();
      if (isLiquidation) expect(Number(details.voucher.totals.amount_due)).toBe(120);
      await page.reload(); await page.getByText("Add payment line items", { exact: true }).click();
      const payment = page.locator('[data-payment-action="prepare"]');
      await payment.locator('[name="label"]').fill(`${type} payment`); await payment.locator('[name="amount"]').fill(details.voucher.totals.amount_due);
      await payment.locator('[name="method_id"]').selectOption(transfer);
      await payment.locator('[name="signatory_user_id"]').selectOption(await payment.locator('[name="signatory_user_id"] option').nth(1).getAttribute("value"));
      await payment.locator('[name="reference"]').fill(`ALL-${crypto.randomUUID().slice(0, 12)}`);
      await payment.locator('[name="reason"]').fill("Prepare individual authorization"); await payment.getByRole("button", { name: "Prepare payment line items" }).click();
      await expect(page.locator("[data-voucher-state]")).toHaveText("Awaiting assigned signatory");
      await signatoryPage.goto(`/#/requests/${item.request_number}`);
      await signatoryPage.getByText("Authorize payment line", { exact: true }).first().click();
      const authorization = signatoryPage.locator('[data-payment-action="authorize"]');
      await authorization.locator('[name="reason"]').fill("Authorize this payment line"); await authorization.getByRole("button").click();
      await expect(signatoryPage.locator("[data-voucher-state]")).toHaveText("Payment authorized · Release pending");
      const record = async (target, actionName, title) => {
        await target.reload(); await target.getByText(title, { exact: true }).first().click();
        const form = target.locator(`[data-payment-action="${actionName}"]`);
        await form.locator('[name="recorded_on"]').fill("2026-10-13"); await form.locator('[name="reason"]').fill("Verified evidence");
        if (actionName === "release") { await form.locator('[name="bank_name"]').fill("Bank"); await form.locator('[name="recipient_name"]').fill("Payee"); }
        await form.locator('[name="evidence"]').setInputFiles({ name: "release.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nRecorded proof\n%%EOF") });
        await expect(form.locator("[data-payment-file-name]")).toHaveText("release.pdf");
        await form.getByRole("button", { name: title, exact: true }).click(); await expect(form).toHaveCount(0);
      };
      await record(page, "release", "Record payment release"); await record(managerPage, "clear", "Confirm payment clearing");
      await expect(managerPage.locator("[data-voucher-state]")).toHaveText("Payment cleared");
      if (isAdvance) advance = item;
      if (isLiquidation) {
        await managerPage.addInitScript(() => { window.print = () => {}; });
        await managerPage.locator("[data-finance-voucher]").getByRole("button", { name: "Print / Save PDF" }).click();
        const printed = managerPage.frameLocator("[data-voucher-print-frame]");
        await expect(printed.locator("body")).toContainText("Advance settlement");
        await expect(printed.locator("body")).toContainText(advance.request_number);
        await expect(printed.locator("body")).toContainText("120.00");
        writeFileSync("outputs/phase07-liquidation-voucher-preview.html", await printed.locator("html").evaluate(el => el.outerHTML), "utf8");
      }
      for (const width of [390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
      }
      await page.goto("/#/tracker"); const row = page.locator(`[data-tracker-request="${item.request_number}"]`);
      await expect(row).toContainText("Cleared"); await expect(row).toContainText("Approved");
    }
    expect(errors).toEqual([]);
  } finally {
    const current = await (await admin.context.get("/api/v1/request-settings/finance-setup")).json();
    await admin.context.put("/api/v1/request-settings/finance-setup", { headers: admin.headers, data: { ...original, version: current.version } });
    for (const context of browsers) await context.close(); for (const context of sessions) await context.dispose();
  }
});
