import { expect, test } from "@playwright/test";

const accounts = {
  financeAssociate: "finance.associate@payment.local",
  financeManager: "finance.manager@payment.local",
};
const password = "Phase01-Test-Only!";

async function login(page, email) {
  await page.goto("/#/login");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  await page.locator("[data-demo-login]").selectOption(email);
  await expect(page.locator('input[name="email"]')).toHaveValue(email);
  await expect(page.locator('input[name="password"]')).toHaveValue(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/#\/dashboard$/);
  await expect(page.locator("[data-account-menu]")).toBeVisible({ timeout: 20_000 });
}

test("Finance Manager edits request settings while Finance Associate has view-only access", async ({ browser }) => {
  const managerContext = await browser.newContext();
  const manager = await managerContext.newPage();
  await login(manager, accounts.financeManager);
  await manager.goto("/#/administration/request-settings");

  await expect(manager.getByRole("heading", { name: "Reimbursement Batches" })).toBeVisible();
  await expect(manager.getByText("Low-value expenses remain Reimbursement requests.")).toBeVisible();
  const cutoffInputs = manager.locator('[name="cutoff_day"]');
  await cutoffInputs.nth(0).fill("10");
  await cutoffInputs.nth(1).fill("25");
  const update = manager.waitForResponse((response) => response.url().endsWith("/api/v1/request-settings/reimbursement-batches") && response.request().method() === "PUT");
  await manager.getByRole("button", { name: "Save batch schedule" }).click();
  expect((await update).ok()).toBeTruthy();
  await expect(manager.getByText("Batch schedule saved", { exact: true })).toBeVisible();

  await expect(manager.getByRole("heading", { name: "Finance Request Policies" })).toBeVisible();
  await manager.locator('[name="cash_advance_limit_amount"]').fill("35000.00");
  await manager.locator('[name="cash_advance_limit_currency"]').fill("PHP");
  await manager.locator('[name="cash_advance_liquidation_days"]').fill("12");
  await manager.locator('[name="reimbursement_invoice_age_days"]').fill("45");
  await manager.locator('[name="reimbursement_invoice_age_action"]').selectOption("warning");
  await manager.locator('[name="cash_advance_one_outstanding"]').uncheck();
  const policyUpdate = manager.waitForResponse((response) => response.url().endsWith("/api/v1/request-settings/finance-policies") && response.request().method() === "PUT");
  await manager.getByRole("button", { name: "Save finance policies" }).click();
  expect((await policyUpdate).ok()).toBeTruthy();
  await expect(manager.getByText("Finance policies saved", { exact: true })).toBeVisible();

  const associateContext = await browser.newContext();
  const associate = await associateContext.newPage();
  await login(associate, accounts.financeAssociate);
  await associate.goto("/#/administration/request-settings");
  await expect(associate.getByText("View only", { exact: true })).toBeVisible();
  await expect(associate.locator('[name="cutoff_day"]').first()).toBeDisabled();
  await expect(associate.locator('[name="cash_advance_limit_amount"]')).toBeDisabled();
  await expect(associate.locator('[name="cash_advance_one_outstanding"]')).toBeDisabled();
  await expect(associate.getByRole("button", { name: "Save batch schedule" })).toHaveCount(0);
  await expect(associate.getByRole("button", { name: "Save finance policies" })).toHaveCount(0);

  await cutoffInputs.nth(0).fill("15");
  await cutoffInputs.nth(1).fill("30");
  const restore = manager.waitForResponse((response) => response.url().endsWith("/api/v1/request-settings/reimbursement-batches") && response.request().method() === "PUT");
  await manager.getByRole("button", { name: "Save batch schedule" }).click();
  expect((await restore).ok()).toBeTruthy();

  await manager.locator('[name="cash_advance_limit_amount"]').fill("40000.00");
  await manager.locator('[name="cash_advance_liquidation_days"]').fill("15");
  await manager.locator('[name="reimbursement_invoice_age_days"]').fill("30");
  await manager.locator('[name="cash_advance_one_outstanding"]').check();
  const restorePolicies = manager.waitForResponse((response) => response.url().endsWith("/api/v1/request-settings/finance-policies") && response.request().method() === "PUT");
  await manager.getByRole("button", { name: "Save finance policies" }).click();
  expect((await restorePolicies).ok()).toBeTruthy();

  await associateContext.close();
  await managerContext.close();
});

test("Administration and approval layouts retain the LifeOS formatting across breakpoints", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await login(page, accounts.financeManager);
  await page.goto("/#/administration/request-settings");

  const tabs = page.getByRole("navigation", { name: "Administration settings" });
  const activeTab = tabs.getByRole("button", { name: "Request Settings" });
  await expect(tabs).toBeVisible();
  await expect(activeTab).toHaveCSS("color", "rgb(255, 250, 243)");
  expect(await activeTab.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgb(255, 255, 255)");
  expect(await tabs.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();

  await page.setViewportSize({ width: 768, height: 900 });
  await expect(tabs).toBeVisible();
  expect(await tabs.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(tabs).toBeHidden();
  await expect(page.getByLabel("Administration section")).toHaveValue("requestSettings");

  await page.goto("/#/approvals");
  await expect(page.getByRole("heading", { name: "Live Requests" })).toBeVisible();
  await expect(page.getByText("No requests match the selected filters.", { exact: true })).toBeVisible();
  expect(await page.locator("main").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();

  await context.close();
});
