import { expect, test } from "@playwright/test";

const accounts = {
  financeAssociate: "finance.associate@payment.local",
  financeManager: "finance.manager@payment.local",
};

async function login(page, email) {
  await page.goto("/#/login");
  await page.locator("[data-demo-login]").selectOption(email);
  await page.getByRole("button", { name: "Sign in" }).click();
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

  const associateContext = await browser.newContext();
  const associate = await associateContext.newPage();
  await login(associate, accounts.financeAssociate);
  await associate.goto("/#/administration/request-settings");
  await expect(associate.getByText("View only", { exact: true })).toBeVisible();
  await expect(associate.locator('[name="cutoff_day"]').first()).toBeDisabled();
  await expect(associate.getByRole("button", { name: "Save batch schedule" })).toHaveCount(0);

  await cutoffInputs.nth(0).fill("15");
  await cutoffInputs.nth(1).fill("30");
  const restore = manager.waitForResponse((response) => response.url().endsWith("/api/v1/request-settings/reimbursement-batches") && response.request().method() === "PUT");
  await manager.getByRole("button", { name: "Save batch schedule" }).click();
  expect((await restore).ok()).toBeTruthy();

  await associateContext.close();
  await managerContext.close();
});
