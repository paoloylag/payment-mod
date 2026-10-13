import { expect, request as apiRequest, test } from "@playwright/test";

test("General EWT inherits defaults, overrides lines, preserves retries and remains responsive", async ({ browser }) => {
  test.setTimeout(90_000);
  const sessions = [];
  const session = async email => {
    const context = await apiRequest.newContext({ baseURL: "http://127.0.0.1:58003" });
    sessions.push(context);
    const response = await context.post("/api/v1/auth/login", { data: { email, password: "Phase01-Test-Only!" } });
    expect(response.ok()).toBeTruthy();
    return { context, headers: { "X-CSRF-Token": (await response.json()).csrf_token } };
  };
  const admin = await session("admin@payment.local");
  const original = await (await admin.context.get("/api/v1/request-settings/finance-setup")).json();
  const context = await browser.newContext();
  try {
    const codes = await (await admin.context.get("/api/v1/tax-codes")).json();
    const code = name => codes.find(row => row.code === name).id;
    const config = await admin.context.put("/api/v1/request-settings/finance-setup", { headers: admin.headers, data: {
      ...original, vat_basis: "inclusive", ewt_basis: "net_of_vat", rounding: "half_up",
      effective_date_basis: "finance_review", effective_from: "2020-01-01",
      tax_by_request_type: { ...original.tax_by_request_type, general: code("VAT12-EWT2") },
    } });
    expect(config.ok(), await config.text()).toBeTruthy();
    const departments = await (await admin.context.get("/api/v1/departments")).json();
    const centers = await (await admin.context.get("/api/v1/cost-centers")).json();
    let accounts = await (await admin.context.get("/api/v1/chart-of-accounts")).json();
    if (!accounts.some(row => row.is_active && row.is_posting)) {
      const account = await admin.context.post("/api/v1/chart-of-accounts", { headers: admin.headers, data: {
        code: "EWT-EXP", name: "EWT Test Expense", account_type: "expense", normal_balance: "debit", is_posting: true,
      } });
      expect(account.ok()).toBeTruthy(); accounts = [await account.json()];
    }
    const owner = await session("requestor@payment.local");
    const created = await owner.context.post("/api/v1/requests", { headers: owner.headers, data: {
      request_type: "general", department_id: departments.find(row => row.code === "MKTG").id,
      currency_code: "PHP", payee_name: "EWT Test Vendor", purpose: "General EWT browser verification",
      type_data: { budgeted: true, billing_document_refs: ["billing.pdf"] },
      lines: [1, 2].map(index => ({ particulars: `Service ${index}`, vendor_name: "EWT Test Vendor", amount: "1120.00", currency_code: "PHP",
        chart_account_id: accounts.find(row => row.is_active && row.is_posting).id,
        cost_center_id: centers.find(row => row.code === "MKTG").id, attachment_refs: ["billing.pdf"] })),
    } });
    expect(created.ok(), await created.text()).toBeTruthy();
    const draft = await created.json();
    const submitted = await owner.context.post(`/api/v1/requests/${draft.id}/submit`, {
      headers: { ...owner.headers, "Idempotency-Key": crypto.randomUUID() }, data: { version: draft.version },
    });
    expect(submitted.ok(), await submitted.text()).toBeTruthy();
    const item = await submitted.json();
    const head = await session("department.head@payment.local");
    const approved = await head.context.post(`/api/v1/workflow/${item.id}/approve`, {
      headers: { ...head.headers, "Idempotency-Key": crypto.randomUUID() }, data: { version: 1 },
    });
    expect(approved.ok()).toBeTruthy();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/#/login");
    await page.locator("[data-demo-login]").selectOption("finance.associate@payment.local");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/#\/dashboard$/);
    await page.goto(`/#/requests/${item.request_number}`);
    const panel = page.getByRole("region", { name: "General request EWT" });
    const form = panel.locator("form");
    await expect(form).toBeVisible();
    await expect(panel.locator('[data-tax-total="ewt"]')).toContainText("40.00");
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const conversation = page.locator('[data-toggle-conversation][aria-expanded="true"]');
      if (width < 1200 && await conversation.isVisible()) await conversation.click();
      await panel.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
      for (const select of await form.locator("select").all()) {
        const box = await select.boundingBox();
        expect(box.width).toBeGreaterThan(150);
        expect(Math.round(box.height)).toBeGreaterThanOrEqual(42);
      }
    }
    await form.locator('[name="request_ewt_tax_id"]').selectOption(code("VAT12-EWT1"));
    await form.locator("[data-line-ewt]").nth(1).selectOption(code("NONVAT"));
    await form.locator('[name="reason"]').fill("Apply request rate with explicit No EWT on second line");
    await page.route(`**/api/v1/finance-tax/${item.id}`, async route => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Retry test" }) });
      } else await route.continue();
    });
    await form.getByRole("button", { name: "Save EWT and recalculate" }).click();
    await expect(form.getByRole("alert")).toHaveText("Retry test");
    await expect(form.locator("[data-line-ewt]").nth(1)).toHaveValue(code("NONVAT"));
    await page.unroute(`**/api/v1/finance-tax/${item.id}`);
    await form.getByRole("button", { name: "Save EWT and recalculate" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("EWT assignment saved", { exact: true })).toBeVisible();
    await expect(panel.locator('[data-tax-total="ewt"]')).toContainText("10.00");
    await expect(panel.locator('[data-tax-total="vat"]')).toContainText("240.00");
    await page.reload();
    await expect(panel.locator('[data-tax-total="amount_due"]')).toContainText("2,230.00");
    await panel.getByText("EWT history (1)", { exact: true }).click();
    await expect(panel.getByText("Apply request rate with explicit No EWT on second line", { exact: false })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 900 });
    const drawer = page.locator('[data-toggle-conversation][aria-expanded="true"]');
    if (await drawer.isVisible()) await drawer.click();
    await panel.screenshot({ path: "outputs/phase06-general-ewt-mobile.png" });
    expect(errors).toEqual([]);
  } finally {
    const current = await (await admin.context.get("/api/v1/request-settings/finance-setup")).json();
    await admin.context.put("/api/v1/request-settings/finance-setup", {
      headers: admin.headers, data: { ...original, version: current.version },
    });
    await context.close();
    for (const session of sessions) await session.dispose();
  }
});
