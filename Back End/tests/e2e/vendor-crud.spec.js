import { expect, request as apiRequest, test } from "@playwright/test";

test("Finance manages vendors through the UI with safe deletion, retries and responsive forms", async ({ browser }) => {
  test.setTimeout(180000);
  const contexts = [], errors = [];
  const ui = async role => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); contexts.push(context);
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/#/login"); await page.locator("[data-demo-login]").selectOption(`${role}@payment.local`);
    await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(/#\/dashboard$/);
    await page.goto("/#/master-data/vendors");
    await expect(page.locator("[data-vendor-row]").first()).toBeVisible(); return page;
  };
  const api = await apiRequest.newContext({ baseURL: "http://127.0.0.1:58003" });
  const login = await api.post("/api/v1/auth/login", { data: { email: "requestor@payment.local", password: "Phase01-Test-Only!" } });
  const headers = { "X-CSRF-Token": (await login.json()).csrf_token };
  const name = `Browser Vendor ${crypto.randomUUID().slice(0,8)}`;
  try {
    const page = await ui("finance.associate");
    await page.getByRole("button", { name: "Add vendor", exact: true }).click();
    const form = page.locator("[data-vendor-create]");
    await form.locator('[name="name"]').fill(name);
    await form.locator('[name="email"]').fill("browser@example.test");
    await form.locator('[name="branchCode"]').fill("BROWSER-MNL");
    await form.locator('[name="notes"]').fill("Long vendor information ".repeat(40));
    for (const width of [375, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(form.locator('[name="name"]')).toHaveValue(name);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
      expect(Math.round((await form.locator("select").boundingBox()).height)).toBeGreaterThanOrEqual(42);
    }
    await page.route("**/api/v1/vendors", route => route.request().method() === "POST" ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Temporary vendor save failure" }) }) : route.continue());
    await form.getByRole("button", { name: "Create vendor", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("Temporary vendor save failure");
    await expect(form.locator('[name="name"]')).toHaveValue(name);
    await page.unroute("**/api/v1/vendors");
    const createdResponse = page.waitForResponse(r => r.url().endsWith("/api/v1/vendors") && r.request().method() === "POST");
    await form.getByRole("button", { name: "Create vendor", exact: true }).click();
    const created = await (await createdResponse).json();
    await expect(page.getByRole("dialog", { name: "Vendor details" })).toContainText(name);
    await page.keyboard.press("Escape");
    const row = page.locator(`[data-vendor-row="${created.id}"]`);
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await form.locator('[name="phone"]').fill("09171234567");
    await form.locator('[name="informationStatus"]').selectOption("Information requested");
    await form.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("dialog")).toContainText("09171234567");
    await page.keyboard.press("Escape"); await expect(row).toContainText("Incomplete");
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await form.locator('[name="informationStatus"]').selectOption("Information complete");
    await form.getByRole("button", { name: "Save changes" }).click(); await expect(page.getByRole("dialog", { name: "Vendor details" })).toBeVisible(); await page.keyboard.press("Escape");
    await page.reload(); await expect(row).toContainText("Active");
    await page.locator("[data-vendor-search]").fill(name); await expect(page.locator("[data-vendor-count]")).toHaveText("1 vendor");
    await row.getByRole("button", { name: "Deactivate", exact: true }).click();
    await page.locator("[data-confirm-action-prompt]").click(); await expect(row).toContainText("Inactive");
    await page.locator("[data-vendor-status]").selectOption("active"); await expect(row).toBeHidden();
    await page.goto("/#/requests/new/general");
    await expect(page.locator("[data-vendor-reference] option").first()).toBeAttached();
    await expect(page.locator(`[data-vendor-reference] option[value="${created.id}"]`)).toHaveCount(0);
    await page.goto("/#/master-data/vendors"); await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.locator("[data-vendor-status]").selectOption("all"); await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Reactivate", exact: true }).click(); await page.locator("[data-confirm-action-prompt]").click();
    await expect(row).toContainText("Active");
    const reader = await ui("requestor");
    await expect(reader.locator("[data-new-vendor], [data-edit-vendor], [data-delete-vendor], [data-toggle-vendor]")).toHaveCount(0);
    await reader.locator(`[data-view-vendor="${created.id}"]`).click(); await expect(reader.getByRole("dialog")).toContainText("09171234567");
    await reader.keyboard.press("Escape");
    await row.getByRole("button", { name: "Delete", exact: true }).click();
    await page.locator("[data-action-prompt-backdrop]").getByRole("button", { name: "Cancel", exact: true }).click(); await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Delete", exact: true }).click(); await page.locator("[data-confirm-action-prompt]").click();
    await expect(row).toHaveCount(0); await page.reload(); await expect(row).toHaveCount(0);

    // An independently saved request makes the next vendor referenced; no request approvals are seeded.
    await page.getByRole("button", { name: "Add vendor", exact: true }).click();
    await form.locator('[name="name"]').fill(`${name} referenced`);
    const pending = page.waitForResponse(r => r.url().endsWith("/api/v1/vendors") && r.request().method() === "POST");
    await form.getByRole("button", { name: "Create vendor", exact: true }).click(); const used = await (await pending).json();
    await expect(page.getByRole("dialog", { name: "Vendor details" })).toBeVisible(); await page.keyboard.press("Escape");
    const departments = await (await api.get("/api/v1/departments")).json();
    const draft = await api.post("/api/v1/requests", { headers, data: { request_type: "general", department_id: departments.find(item => item.code === "MKTG").id,
      vendor_external_id: used.id, payee_name: used.name, currency_code: "PHP", type_data: {}, lines: [] } });
    expect(draft.ok(), await draft.text()).toBeTruthy();
    await page.locator("[data-vendor-search]").fill("referenced");
    const usedRow = page.locator(`[data-vendor-row="${used.id}"]`);
    await usedRow.getByRole("button", { name: "Delete", exact: true }).click(); await page.locator("[data-confirm-action-prompt]").click();
    await expect(page.getByRole("alert")).toContainText("Deactivate it instead"); await expect(usedRow).toBeVisible();
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
      await expect(usedRow.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
    }
    await page.setViewportSize({ width: 375, height: 900 });
    await page.locator(".vendor-directory").screenshot({ path: "outputs/vendor-directory-mobile.png" });
    expect(errors).toEqual([]);
  } finally { for (const context of contexts) await context.close(); await api.dispose(); }
});

test("stale vendor edits cannot overwrite a colleague's changes and refresh enables recovery", async ({ browser }) => {
  const contexts = [], name = `Concurrent Vendor ${crypto.randomUUID().slice(0,8)}`;
  const login = async role => {
    const context = await browser.newContext(); contexts.push(context); const page = await context.newPage();
    page.setDefaultTimeout(15000); await page.goto("/#/login");
    await page.locator("[data-demo-login]").selectOption(`${role}@payment.local`);
    await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(/#\/dashboard$/);
    await page.goto("/#/master-data/vendors"); await expect(page.locator("[data-vendor-row]").first()).toBeVisible(); return page;
  };
  try {
    const first = await login("finance.associate"); await first.getByRole("button", { name: "Add vendor", exact: true }).click();
    await first.locator('[name="name"]').fill(name);
    const pending = first.waitForResponse(r => r.url().endsWith("/api/v1/vendors") && r.request().method() === "POST");
    await first.getByRole("button", { name: "Create vendor", exact: true }).click(); const item = await (await pending).json();
    await expect(first.getByRole("dialog", { name: "Vendor details" })).toBeVisible(); await first.keyboard.press("Escape");
    await first.locator(`[data-edit-vendor="${item.id}"]`).click();
    await first.locator('[name="phone"]').fill("Old unsaved phone");
    const second = await login("finance.manager"); await second.locator(`[data-edit-vendor="${item.id}"]`).click();
    await second.locator('[name="phone"]').fill("09170009999"); await second.getByRole("button", { name: "Save changes" }).click();
    await expect(second.getByRole("dialog", { name: "Vendor details" })).toContainText("09170009999");
    await first.getByRole("button", { name: "Save changes" }).click();
    await expect(first.locator("[data-vendor-error]")).toContainText("updated elsewhere");
    await expect(first.locator('[name="phone"]')).toHaveValue("Old unsaved phone");
    await first.getByRole("button", { name: "Cancel", exact: true }).click();
    await first.getByRole("button", { name: "Refresh", exact: true }).click();
    await first.locator(`[data-edit-vendor="${item.id}"]`).click(); await expect(first.locator('[name="phone"]')).toHaveValue("09170009999");
    await first.locator('[name="name"]').fill("Sample BrightTech Supply"); await first.getByRole("button", { name: "Save changes" }).click();
    await expect(first.locator("[data-vendor-error]")).toContainText("already exists");
    await first.keyboard.press("Escape");
  } finally { for (const context of contexts) await context.close(); }
});
