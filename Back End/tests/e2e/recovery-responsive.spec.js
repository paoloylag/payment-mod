import { expect, test } from "@playwright/test";
import { prepareRecoveries } from "./recovery-fixtures.js";

test("fund return and recovery views handle long text at mobile, tablet and desktop sizes", async ({ browser }) => {
  test.setTimeout(180_000);
  const fixture = await prepareRecoveries(), contexts = [], errors = [];
  const longReason = "DetailedFinanceReview".repeat(120);
  const ui = async email => {
    const context = await browser.newContext(); contexts.push(context);
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    await page.goto("/#/login"); await page.locator("[data-demo-login]").selectOption(email);
    await page.getByRole("button", { name: "Sign in" }).click(); await expect(page).toHaveURL(/#\/dashboard$/);
    return page;
  };
  const check = async (page, scope) => {
    for (const width of [375, 390, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await scope.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
      const overflowing = await scope.locator("p, dd, dt, h3, h4, summary, button, a").evaluateAll(elements => elements.filter(el => {
        const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.overflowX === "visible" && el.scrollWidth > el.clientWidth + 2;
      }).map(el => ({ tag: el.tagName, text: el.textContent.slice(0,80), width: el.clientWidth, scroll: el.scrollWidth })));
      expect(overflowing, `Overflow at ${width}px`).toEqual([]);
      for (const select of await scope.locator("select:visible").all()) expect(await select.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(42);
    }
  };
  try {
    const associate = await ui("finance.associate@payment.local"), manager = await ui("finance.manager@payment.local");
    await associate.goto(`/#/requests/${fixture.liquidation.request_number}`);
    const returned = associate.locator("[data-fund-return]");
    await returned.locator("summary").filter({ hasText: /^Record full fund return$/ }).click();
    const receipt = returned.locator("form");
    await receipt.locator('[name="recorded_on"]').fill("2026-10-15");
    await receipt.locator('[name="reference"]').fill("R".repeat(100));
    await receipt.locator('[name="receiving_office"]').fill("CashOffice".repeat(16));
    await receipt.locator('[name="receiving_account_id"]').selectOption(fixture.receivingAccount);
    await receipt.locator("textarea").fill(longReason);
    await receipt.locator('[type="file"]').setInputFiles({ name: `${"Receipt".repeat(30)}.pdf`, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nUI receipt\n%%EOF") });
    await check(associate, returned);
    await associate.setViewportSize({ width: 390, height: 900 });
    await returned.screenshot({ path: "outputs/fund-return-mobile.png" });
    await receipt.getByRole("button", { name: "Record full fund return", exact: true }).click();
    await expect(returned.locator("[data-fund-return-state]")).toContainText("verification pending");
    await manager.goto(`/#/requests/${fixture.liquidation.request_number}`);
    const review = manager.locator("[data-fund-return]");
    await review.locator("summary").filter({ hasText: /^Verify full fund return$/ }).click();
    await review.locator("summary").filter({ hasText: /^Fund return history/ }).click();
    await check(manager, review);
    await manager.setViewportSize({ width: 390, height: 900 });
    await review.screenshot({ path: "outputs/fund-return-review-mobile.png" });
    await associate.goto(`/#/requests/${fixture.general.request_number}`);
    const recoveryCard = associate.locator(`[data-payment-card="${fixture.payment}"]`);
    await recoveryCard.locator("summary").filter({ hasText: /^Record full payment recovery$/ }).click();
    const recovery = recoveryCard.locator('[data-payment-action="recover"]');
    await recovery.locator('[name="recorded_on"]').fill("2026-10-15");
    await recovery.locator('[name="bank_name"]').fill("Bank".repeat(40));
    await recovery.locator('[name="recipient_name"]').fill("Payee".repeat(40));
    await recovery.locator("textarea").fill(longReason);
    await recovery.locator('[type="file"]').setInputFiles({ name: `${"Recovery".repeat(25)}.pdf`, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nUI recovery\n%%EOF") });
    const collapsed = associate.locator('[data-toggle-conversation][aria-expanded="false"]');
    if (await collapsed.isVisible()) await collapsed.click();
    await check(associate, recoveryCard);
    await expect(recovery.locator("[data-payment-file-name]")).toHaveText(`${"Recovery".repeat(25)}.pdf`);
    await expect(recovery.locator("textarea")).toHaveValue(longReason);
    await associate.setViewportSize({ width: 390, height: 900 });
    const dismiss = associate.getByRole("button", { name: "Dismiss message" }); if (await dismiss.isVisible()) await dismiss.click();
    await recoveryCard.screenshot({ path: "outputs/payment-recovery-mobile.png" });
    await recovery.getByRole("button", { name: "Record full payment recovery", exact: true }).click();
    await expect(recoveryCard.locator("[data-payment-state]")).toContainText("Manager review pending");
    await manager.goto(`/#/requests/${fixture.general.request_number}`);
    const card = manager.locator(`[data-payment-card="${fixture.payment}"]`);
    await card.locator("summary").filter({ hasText: /^Confirm post-release reversal$/ }).click();
    await card.locator("summary").filter({ hasText: /^Supporting evidence/ }).click();
    await card.locator("summary").filter({ hasText: /^Payment history/ }).click();
    await check(manager, card);
    await manager.setViewportSize({ width: 390, height: 900 });
    await card.screenshot({ path: "outputs/payment-recovery-review-mobile.png" });
    await manager.getByRole("button", { name: /dark mode|light mode|Toggle theme/i }).click();
    await check(manager, card);
    await manager.goto("/#/tracker");
    expect(await manager.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    expect(errors).toEqual([]);
  } finally { for (const context of contexts) await context.close(); await fixture.dispose(); }
});
