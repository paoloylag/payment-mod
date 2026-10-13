import { expect, test } from "@playwright/test";

test("Finance setup saves partial choices and remains usable across viewport widths", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/#/login");
  await page.locator("[data-demo-login]").selectOption("finance.manager@payment.local");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/#\/dashboard$/);
  await page.goto("/#/administration/request-settings");
  const form = page.locator("[data-finance-setup]");
  await expect(form).toBeVisible();
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await form.scrollIntoViewIfNeeded();
    expect(await page.locator("main").evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
    for (const element of await form.locator("select, input, textarea").all()) {
      const box = await element.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    }
  }
  await form.locator('[name="vat_basis"]').selectOption("inclusive");
  await form.locator('[name="voucher_prefix"]').fill("PV");
  const saved = page.waitForResponse((res) => res.url().endsWith("/finance-setup") && res.request().method() === "PUT");
  await form.getByRole("button", { name: "Save Finance setup draft" }).focus();
  await page.keyboard.press("Enter");
  expect((await saved).ok()).toBeTruthy();
  await expect(page.getByText("Finance setup saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(form.locator('[name="vat_basis"]')).toHaveValue("inclusive");
  await expect(form.locator('[name="voucher_prefix"]')).toHaveValue("PV");
  await expect(page.getByRole("heading", { name: "Finance Request Policies" })).toBeVisible();
  await context.close();
});
