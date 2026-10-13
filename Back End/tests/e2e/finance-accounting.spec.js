import { expect, request as apiRequest, test } from "@playwright/test";
import { checkVoucherLifecycle } from "./voucher-lifecycle-flow.js";

test("Finance prepares, corrects and posts balanced accounting before preparing a voucher", async ({ browser }) => {
  test.setTimeout(120_000);
  const sessions = [], browsers = [];
  const session = async email => {
    const context = await apiRequest.newContext({ baseURL: "http://127.0.0.1:58003" }); sessions.push(context);
    const response = await context.post("/api/v1/auth/login", { data: { email, password: "Phase01-Test-Only!" } });
    expect(response.ok()).toBeTruthy();
    return { context, headers: { "X-CSRF-Token": (await response.json()).csrf_token } };
  };
  const ui = async email => {
    const context = await browser.newContext(); browsers.push(context);
    const page = await context.newPage();
    await page.goto("/#/login");
    await page.locator("[data-demo-login]").selectOption(email);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/#\/dashboard$/);
    return page;
  };
  const admin = await session("admin@payment.local");
  const original = await (await admin.context.get("/api/v1/request-settings/finance-setup")).json();
  try {
    const ids = [];
    for (const [label, account_type, normal_balance] of [["Expense", "expense", "debit"], ["VAT", "asset", "debit"], ["EWT", "liability", "credit"], ["Payable", "liability", "credit"], ["Correction", "expense", "debit"]]) {
      const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
      const response = await admin.context.post("/api/v1/chart-of-accounts", { headers: admin.headers, data: {
        code: `J-${suffix}`, name: `${label} ${suffix}`, account_type, normal_balance, is_posting: true,
      } });
      expect(response.ok(), await response.text()).toBeTruthy(); ids.push((await response.json()).id);
    }
    const taxCodes = await (await admin.context.get("/api/v1/tax-codes")).json();
    const setup = await admin.context.put("/api/v1/request-settings/finance-setup", { headers: admin.headers, data: {
      ...original, vat_basis: "inclusive", ewt_basis: "net_of_vat", rounding: "half_up",
      effective_date_basis: "finance_review", effective_from: "2020-01-01",
      tax_by_request_type: { ...original.tax_by_request_type, general: taxCodes.find(row => row.code === "VAT12-EWT2").id },
      accounts_by_request_type: { ...original.accounts_by_request_type, general: {
        debit_account_id: ids[0], input_vat_account_id: ids[1], ewt_payable_account_id: ids[2], credit_account_id: ids[3],
    } }, voucher: { prefix: "PV", reset_basis: "calendar_year", certification_text: "Finance reviewed this voucher draft.",
      create_role: "finance_associate", post_role: "finance_manager", void_role: "finance_manager" },
    } });
    expect(setup.ok(), await setup.text()).toBeTruthy();
    const departments = await (await admin.context.get("/api/v1/departments")).json();
    const centers = await (await admin.context.get("/api/v1/cost-centers")).json();
    const types = await (await admin.context.get("/api/v1/document-types")).json();
    const owner = await session("requestor@payment.local");
    const created = await owner.context.post("/api/v1/requests", { headers: owner.headers, data: {
      request_type: "general", department_id: departments.find(row => row.code === "MKTG").id,
      currency_code: "PHP", payee_name: "Accounting Browser Vendor", purpose: "Balanced accounting browser verification",
      type_data: { budgeted: true, billing_document_refs: ["bill.pdf"] },
      lines: [1, 2].map(index => ({ particulars: `Accounting service ${index}`, vendor_name: "Accounting Browser Vendor",
        amount: "1120.00", currency_code: "PHP", chart_account_id: ids[0],
        cost_center_id: centers.find(row => row.code === "MKTG").id, attachment_refs: ["invoice.pdf"] })),
    } });
    expect(created.ok(), await created.text()).toBeTruthy();
    const draft = await created.json();
    const bill = await owner.context.post(`/api/v1/requests/${draft.id}/documents`, {
      headers: owner.headers, multipart: { document_type_id: types.find(row => row.code === "BILLING_SOA").id,
        file: { name: "bill.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nBilling verification\n%%EOF") } },
    });
    expect(bill.ok(), await bill.text()).toBeTruthy(); const billId = (await bill.json()).id;
    const submitted = await owner.context.post(`/api/v1/requests/${draft.id}/submit`, {
      headers: { ...owner.headers, "Idempotency-Key": crypto.randomUUID() }, data: { version: draft.version },
    });
    expect(submitted.ok(), await submitted.text()).toBeTruthy(); const item = await submitted.json();
    const head = await session("department.head@payment.local");
    const approve = async role => {
      const workflow = await (await role.context.get(`/api/v1/workflow/${item.id}`)).json();
      const response = await role.context.post(`/api/v1/workflow/${item.id}/approve`, {
        headers: { ...role.headers, "Idempotency-Key": crypto.randomUUID() }, data: { version: workflow.version },
      });
      expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
    };
    await approve(head);
    const associate = await session("finance.associate@payment.local");
    const upload = async (type, lineId) => {
      const response = await associate.context.post(`/api/v1/requests/${item.id}/documents`, {
        headers: associate.headers, multipart: { document_type_id: types.find(row => row.code === type).id,
          ...(lineId ? { line_id: lineId } : {}), file: { name: "accounting-proof.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nAccounting verification\n%%EOF") } },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      const reviewed = await associate.context.post(`/api/v1/documents/${(await response.json()).id}/reviews`, {
        headers: associate.headers, data: { decision: "accepted", comment: "Verified" },
      }); expect(reviewed.ok(), await reviewed.text()).toBeTruthy();
    };
    const billReview = await associate.context.post(`/api/v1/documents/${billId}/reviews`, {
      headers: associate.headers, data: { decision: "accepted", comment: "Verified billing" },
    }); expect(billReview.ok(), await billReview.text()).toBeTruthy();
    for (const line of item.lines) {
      await upload("INVOICE", line.id);
      const review = await associate.context.post(`/api/v1/finance-validation/${item.id}/lines/${line.id}/reviews`, {
        headers: associate.headers, data: { request_version: item.version, decision: "accepted" },
      }); expect(review.ok(), await review.text()).toBeTruthy();
    }
    const page = await ui("finance.associate@payment.local");
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`/#/requests/${item.request_number}`);
    const ewt = page.getByRole("region", { name: "General request EWT" });
    await ewt.locator('[name="reason"]').fill("Reviewed General EWT defaults");
    await ewt.getByRole("button", { name: "Save EWT and recalculate" }).click();
    await expect(page.getByText("EWT assignment saved", { exact: true })).toBeVisible();
    const panel = page.getByRole("region", { name: "General request accounting" });
    const form = panel.locator('[data-accounting-action="draft"]');
    await expect(form).toBeVisible();
    await expect(panel.locator('[data-accounting-total="debit"]')).toContainText("2,240.00");
    await expect(panel.locator('[data-accounting-total="difference"]')).toContainText("0.00");
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const drawer = page.locator('[data-toggle-conversation][aria-expanded="true"]');
      if (width < 1200 && await drawer.isVisible()) await drawer.click();
      await panel.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
      for (const select of await form.locator("select").all()) {
        const box = await select.boundingBox(); expect(box.width).toBeGreaterThan(150); expect(Math.round(box.height)).toBeGreaterThanOrEqual(42);
      }
    }
    await form.locator('[name="reason"]').fill("Prepared balanced entries");
    await page.route(`**/api/v1/finance-accounting/${item.id}/draft`, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Retry accounting test" }) }));
    await form.getByRole("button", { name: "Save accounting draft" }).click();
    await expect(form.getByRole("alert")).toHaveText("Retry accounting test");
    await expect(form.locator('[name="reason"]')).toHaveValue("Prepared balanced entries");
    await page.unroute(`**/api/v1/finance-accounting/${item.id}/draft`);
    await form.getByRole("button", { name: "Save accounting draft" }).focus(); await page.keyboard.press("Enter");
    await expect(page.getByText("Accounting draft saved", { exact: true })).toBeVisible();
    await form.locator("[data-accounting-entry]").first().selectOption(ids[4]);
    await form.locator('[name="reason"]').fill("Correct first expense account");
    await form.getByRole("button", { name: "Save accounting draft" }).click();
    await expect(panel.getByText("Saved accounting draft 2", { exact: true })).toBeVisible();
    await page.reload();
    await expect(form.locator("[data-accounting-entry]").first()).toHaveValue(ids[4]);
    await approve(associate);
    const manager = await session("finance.manager@payment.local");
    const managerPage = await ui("finance.manager@payment.local"); managerPage.on("pageerror", error => errors.push(error.message));
    await managerPage.goto(`/#/requests/${item.request_number}`);
    const managerPanel = managerPage.getByRole("region", { name: "General request accounting" });
    await expect(managerPanel.getByText("Saved accounting draft 2", { exact: true })).toBeVisible();
    await expect(managerPanel.getByRole("button", { name: "Post accounting", exact: true })).toHaveCount(0);
    expect((await approve(manager)).state).toBe("approved");
    await managerPage.reload();
    const postForm = managerPanel.locator('[data-accounting-action="post"]');
    await postForm.locator('[name="reason"]').fill("Reviewed balanced entries after final approval");
    await postForm.getByRole("button", { name: "Post accounting", exact: true }).click();
    await expect(managerPanel.getByText("Posted accounting", { exact: true })).toBeVisible();
    await expect(postForm).toHaveCount(0);
    await page.reload();
    const voucherForm = panel.locator('[data-accounting-action="voucher"]');
    await voucherForm.locator('[name="reason"]').fill("Prepare voucher from posted accounting");
    await voucherForm.getByRole("button", { name: "Prepare voucher draft" }).click();
    const voucher = panel.getByRole("region", { name: "Prepared voucher draft" });
    await expect(voucher).toBeVisible();
    await expect(voucher).toContainText("2,200.00"); await expect(voucher).toContainText("Accounting Browser Vendor");
    await page.reload(); await expect(voucher).toBeVisible();
    await expect(panel.locator('[data-accounting-action="draft"]')).toHaveCount(0);
    await expect(panel.getByText("Accounting history (3)", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 900 });
    const drawer = page.locator('[data-toggle-conversation][aria-expanded="true"]'); if (await drawer.isVisible()) await drawer.click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    for (const value of await voucher.locator("dd").all()) {
      expect(await value.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
    }
    await panel.screenshot({ path: "outputs/phase06-accounting-mobile.png" }); expect(errors).toEqual([]);
    await checkVoucherLifecycle({ page, managerPage, item, admin, ui, errors });
  } finally {
    const current = await (await admin.context.get("/api/v1/request-settings/finance-setup")).json();
    await admin.context.put("/api/v1/request-settings/finance-setup", { headers: admin.headers, data: { ...original, version: current.version } });
    for (const context of browsers) await context.close(); for (const context of sessions) await context.dispose();
  }
});
