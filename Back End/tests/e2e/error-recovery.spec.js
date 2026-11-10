import { expect, test } from "@playwright/test";

async function login(page, email = "admin@payment.local") {
  await page.goto("/#/login");
  await page.locator("[data-demo-login]").selectOption(email);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/#\/dashboard$/);
}

const noOverflow = async page => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();

test("administration failed load retries and failed writes preserve the editor", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await login(page);
  await page.route("**/api/v1/users", route => route.fulfill({ status: 503, body: "Service unavailable" }), { times: 1 });
  await page.goto("/#/administration/users");
  await expect(page.locator("main [role=alert]").first()).toContainText("temporarily unavailable");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByRole("button", { name: "+ User", exact: true }).click();
  const form = page.locator("[data-create-user]");
  const name = "Recovery Test User", email = `recovery-${Date.now()}@payment.local`;
  await form.locator('[name="display_name"]').fill(name);
  await form.locator('[name="email"]').fill(email);
  await form.locator('[name="password"]').fill("Recovery-Test-2026!");
  await form.locator('[name="role_ids"]').first().check();
  const save = form.getByRole("button", { name: "Create user", exact: true });
  const failures = [
    { status: 422, body: JSON.stringify({ detail: [{ loc: ["body", "email"], msg: "Email is already registered" }] }), message: "email: Email is already registered" },
    { status: 409, body: "Conflict", message: "Reload the latest version" },
    { status: 403, body: "Forbidden", message: "permission" },
    { status: 429, body: "Slow down", message: "Wait a moment" },
    { status: 401, body: "Expired", message: "session has expired" },
    { status: 500, body: "Internal Server Error", message: "temporarily unavailable" },
    { status: 200, body: "Not JSON", message: "check whether your changes were saved" },
  ];
  for (const failure of failures) {
    await page.route("**/api/v1/users", route => route.request().method() === "POST" ? route.fulfill({ status: failure.status, body: failure.body }) : route.continue());
    await save.click();
    await expect(form.getByRole("alert")).toContainText(failure.message);
    await expect(save).toBeEnabled();
    await expect(form.locator('[name="display_name"]')).toHaveValue(name);
    await expect(form.locator('[name="email"]')).toHaveValue(email);
    await expect(form.locator('[name="password"]')).toHaveValue("Recovery-Test-2026!");
    await expect(form.locator('[name="role_ids"]').first()).toBeChecked();
    await page.unroute("**/api/v1/users");
  }
  await page.route("**/api/v1/users", route => route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue());
  await save.click();
  await expect(form.getByRole("alert")).toContainText("Check your connection");
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 }); await noOverflow(page);
    await page.getByRole("dialog").screenshot({ path: `outputs/error-user-${width}.png` });
  }
  await expect(form.getByRole("alert")).toContainText("Check your connection");
  await expect(form.locator('[name="password"]')).toHaveValue("Recovery-Test-2026!");
  await expect(form.locator('[name="role_ids"]').first()).toBeChecked();
  await page.unroute("**/api/v1/users");
  let calls = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route("**/api/v1/users", async route => {
    if (route.request().method() !== "POST") return route.continue();
    calls++; await pending;
    await route.fulfill({ status: 503, body: "Unavailable" });
  });
  await save.click(); await expect(save).toBeDisabled();
  await form.evaluate(element => element.requestSubmit());
  release();
  await expect(save).toBeEnabled();
  expect(calls).toBe(1);
  await page.unroute("**/api/v1/users");
  await save.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".identity-list article").filter({ hasText: email })).toBeVisible();
  expect(errors).toEqual([]);
});

test("master data and Finance setup keep unsaved values after failed saves", async ({ page }) => {
  await login(page);
  await page.route("**/api/v1/currencies*", route => route.fulfill({ status: 503, body: "Unavailable" }), { times: 1 });
  await page.goto("/#/master-data/currencies");
  await expect(page.locator("main [role=alert]").first()).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.locator("[data-add-master]").click();
  const form = page.locator("[data-master-form]");
  await form.locator('[name="code"]').fill("ZZZ");
  await form.locator('[name="name"]').fill("Recovery Currency");
  await form.locator('[name="symbol"]').fill("Z");
  await page.route("**/api/v1/currencies*", route => route.request().method() === "POST" ? route.fulfill({ status: 503, body: "Unavailable" }) : route.continue());
  await form.locator('button[type="submit"]').click();
  await expect(form.getByRole("alert")).toContainText("temporarily unavailable");
  await expect(form.locator('[name="name"]')).toHaveValue("Recovery Currency");
  await expect(form.locator('button[type="submit"]')).toBeEnabled();
  await form.getByRole("alert").screenshot({ path: "outputs/error-master-inline.png" });
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.route("**/api/v1/request-settings/finance-setup", route => route.fulfill({ status: 503, body: "Unavailable" }), { times: 1 });
  await page.goto("/#/administration/request-settings");
  await expect(page.locator("main [role=alert]").first()).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const setup = page.locator("[data-finance-setup]");
  await setup.locator('[name="voucher_prefix"]').fill("UNSAVED");
  await page.route("**/api/v1/request-settings/finance-setup", route => route.request().method() === "PUT" ? route.fulfill({ status: 503, body: "Unavailable" }) : route.continue());
  await setup.locator('button[type="submit"]').click();
  await expect(setup.getByRole("alert")).toContainText("temporarily unavailable");
  await expect(setup.locator('[name="voucher_prefix"]')).toHaveValue("UNSAVED");
  await expect(setup.locator('button[type="submit"]')).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(page);
  await setup.getByRole("alert").screenshot({ path: "outputs/error-setup-inline.png" });
  await page.locator("[data-theme-toggle]").click();
  await expect(setup.getByRole("alert")).toContainText("temporarily unavailable");
  await expect(setup.locator('[name="voucher_prefix"]')).toHaveValue("UNSAVED");
  await setup.getByRole("alert").screenshot({ path: "outputs/error-setup-dark.png" });
});

test("failed sign-in retains email and permits recovery without a reload", async ({ page }) => {
  await page.goto("/#/login");
  await page.locator("[data-demo-login]").selectOption("admin@payment.local");
  const form = page.locator("[data-login-form]");
  await page.route("**/api/v1/auth/login", route => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "Invalid email or password" }) }));
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("Invalid email or password");
  await expect(form.locator('[name="email"]')).toHaveValue("admin@payment.local");
  await expect(form.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await page.unroute("**/api/v1/auth/login");
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/#\/dashboard$/);
});

test("request load failures show matching error pages and recover", async ({ page }) => {
  await login(page);
  for (const [status, heading] of [[401, "Sign in required"], [403, "Access denied"], [404, "Page not found"], [503, "Service temporarily unavailable"]]) {
    await page.route("**/api/v1/requests*", route => route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ detail: "Request temporarily inaccessible" }) }));
    await page.goto(`/#/requests/missing-${status}`);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(page);
    await page.locator(".error-page-card").screenshot({ path: `outputs/error-page-${status}.png` });
    await page.unroute("**/api/v1/requests*");
    if (status === 401) {
      await page.getByRole("button", { name: "Go to sign in", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
      await login(page);
    }
    await page.goto("/#/dashboard");
    await expect(page.getByRole("heading", { name: "Payment Requests", exact: true })).toBeVisible();
  }
});

test("valid session with unavailable requests shows service recovery rather than false sign-in failure", async ({ page }) => {
  await login(page);
  await page.route("**/api/v1/requests*", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Service temporarily unavailable", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toHaveCount(0);
  await page.unroute("**/api/v1/requests*");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator("[data-account-menu]")).toBeVisible();
});

test("schedule and policy save errors preserve values and local validation stays in place", async ({ page }) => {
  await login(page, "finance.manager@payment.local");
  await page.goto("/#/administration/request-settings");
  const batches = page.locator("[data-reimbursement-batches]");
  const days = batches.locator('[name="cutoff_day"]');
  await days.nth(0).fill("12"); await days.nth(1).fill("12");
  await batches.locator('button[type="submit"]').click();
  await expect(batches.getByRole("alert")).toContainText("two different cutoff days");
  await expect(days.nth(0)).toHaveValue("12");
  await days.nth(1).fill("26");
  await page.route("**/api/v1/request-settings/reimbursement-batches", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await batches.locator('button[type="submit"]').click();
  await expect(batches.getByRole("alert")).toContainText("temporarily unavailable");
  await expect(days.nth(1)).toHaveValue("26");
  for (const [selector, field, value, endpoint] of [
    ["data-numbering-settings", "reset_month", "8", "numbering"],
    ["data-finance-policies", "cash_advance_liquidation_days", "19", "finance-policies"],
  ]) {
    const form = page.locator(`[${selector}]`);
    const control = form.locator(`[name="${field}"]`);
    if (field === "reset_month") await control.selectOption(value); else await control.fill(value);
    await page.route(`**/api/v1/request-settings/${endpoint}`, route => route.request().method() === "GET" ? route.continue() : route.fulfill({ status: 503, body: "Unavailable" }));
    await form.locator('button[type="submit"]').click();
    await expect(form.getByRole("alert")).toContainText("temporarily unavailable");
    await expect(control).toHaveValue(value);
    await expect(form.locator('button[type="submit"]')).toBeEnabled();
  }
});
