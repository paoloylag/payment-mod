import { execFileSync } from "node:child_process";
import { expect, request as apiRequest, test } from "@playwright/test";

test("Finance activates General setup and requests receive immutable account assignments", async ({ browser }) => {
  test.setTimeout(90_000);
  const sessions = [];
  const session = async email => {
    const context = await apiRequest.newContext({ baseURL: "http://127.0.0.1:58003" }); sessions.push(context);
    const login = await context.post("/api/v1/auth/login", { data: { email, password: "Phase01-Test-Only!" } });
    expect(login.ok()).toBeTruthy();
    return { context, headers: { "X-CSRF-Token": (await login.json()).csrf_token } };
  };
  const signIn = async (page, email) => {
    await page.goto("/#/login");
    await page.locator("[data-demo-login]").selectOption(email);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/#\/dashboard$/);
  };
  const admin = await session("admin@payment.local");
  const original = await (await admin.context.get("/api/v1/request-settings/finance-setup")).json();
  const beforeVersion = original.activation.latest_version;
  const managerContext = await browser.newContext(), ownerContext = await browser.newContext();
  try {
    const accounts = [];
    for (const [kind, balance] of [["expense", "debit"], ["liability", "credit"]]) {
      const response = await admin.context.post("/api/v1/chart-of-accounts", { headers: admin.headers, data: {
        code: `ACT-${balance.toUpperCase()}-${Date.now()}`, name: `Activation ${balance} ${Date.now()}`,
        account_type: kind, normal_balance: balance, is_posting: true,
      } });
      expect(response.ok(), await response.text()).toBeTruthy(); accounts.push(await response.json());
    }
    const codes = await (await admin.context.get("/api/v1/tax-codes")).json();
    const saved = await admin.context.put("/api/v1/request-settings/finance-setup", { headers: admin.headers, data: {
      ...original, vat_basis: "inclusive", ewt_basis: "net_of_vat", rounding: "half_up", setup_scope: "request_type",
      effective_from: "2020-01-01", effective_date_basis: "finance_review",
      tax_by_request_type: { general: codes.find(row => row.code === "VAT12-EWT2").id },
      accounts_by_request_type: { general: { debit_account_id: accounts[0].id, credit_account_id: accounts[1].id } },
    } });
    expect(saved.ok()).toBeTruthy();
    const manager = await managerContext.newPage();
    await signIn(manager, "finance.manager@payment.local");
    await manager.goto("/#/administration/request-settings");
    const section = manager.getByRole("region", { name: "General Finance activation" });
    const form = section.locator("form");
    await expect(form).toBeVisible();
    for (const width of [390, 768, 1280]) {
      await manager.setViewportSize({ width, height: 900 });
      await form.scrollIntoViewIfNeeded();
      expect(await manager.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    }
    await form.locator("textarea").fill("Finance acceptance of General mapping");
    await manager.route("**/finance-setup/activate", route => route.fulfill({ status: 503,
      contentType: "application/json", body: JSON.stringify({ detail: "Activation retry test" }) }));
    await form.getByRole("button").click();
    await expect(form.getByRole("alert")).toContainText("Activation retry test");
    await expect(form.locator("textarea")).toHaveValue("Finance acceptance of General mapping");
    await manager.unroute("**/finance-setup/activate");
    await form.getByRole("button").focus(); await manager.keyboard.press("Enter");
    await expect(section).toContainText("Active version");
    await expect(form.getByRole("button")).toBeDisabled();
    const owner = await session("requestor@payment.local");
    const departments = await (await owner.context.get("/api/v1/departments")).json();
    const response = await owner.context.post("/api/v1/requests", { headers: owner.headers, data: {
      request_type: "general", department_id: departments.find(row => row.code === "MKTG").id,
      payee_name: "Mapping Vendor", purpose: "Automatic General coding", currency_code: "PHP",
      type_data: { budgeted: true, billing_document_refs: ["billing.pdf"] },
      lines: [{ particulars: "Materials", vendor_name: "Mapping Vendor", amount: "1120", currency_code: "PHP",
        attachment_refs: ["billing.pdf"] }],
    } });
    expect(response.ok(), await response.text()).toBeTruthy();
    const draft = await response.json();
    expect(draft.lines[0].chart_account_id).toBe(accounts[0].id);
    expect(draft.lines[0].cost_center_id).toBeTruthy();
    const submitted = await owner.context.post(`/api/v1/requests/${draft.id}/submit`, {
      headers: { ...owner.headers, "Idempotency-Key": crypto.randomUUID() }, data: { version: draft.version },
    });
    expect(submitted.ok(), await submitted.text()).toBeTruthy();
    const item = await submitted.json();
    const page = await ownerContext.newPage(); await signIn(page, "requestor@payment.local");
    await page.goto(`/#/requests/${item.request_number}`);
    await expect(page.locator("[data-finance-coding]")).toContainText(accounts[0].code);
    await expect(page.locator("[data-finance-coding]")).toContainText(accounts[1].code);
    await page.goto("/#/requests/new/general");
    await expect(page.getByText("Assigned by active Finance setup").first()).toBeVisible();
    await expect(page.locator(`input[readonly]`).filter({ visible: true }).first()).toBeVisible();
    await manager.setViewportSize({ width: 390, height: 900 });
    await section.screenshot({ path: "outputs/phase06-activation-mobile.png" });
  } finally {
    // This suite owns the disposable payment_module_e2e database. Restore activation state for other tests.
    execFileSync("docker", ["compose", "exec", "-T", "db", "psql", "-U", "payment_module", "-d", "payment_module_e2e", "-v", "ON_ERROR_STOP=1", "-c",
      `DELETE FROM finance_coding_snapshots WHERE configuration_id IN (SELECT id FROM finance_configurations WHERE version > ${Number(beforeVersion)}); DELETE FROM finance_configurations WHERE version > ${Number(beforeVersion)};`]);
    const current = await (await admin.context.get("/api/v1/request-settings/finance-setup")).json();
    await admin.context.put("/api/v1/request-settings/finance-setup", { headers: admin.headers,
      data: { ...original, version: current.version } });
    await managerContext.close(); await ownerContext.close();
    for (const context of sessions) await context.dispose();
  }
});
