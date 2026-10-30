import { expect } from "@playwright/test";
import { writeFileSync } from "node:fs";

export async function checkVoucherLifecycle({ page, managerPage, item, admin, ui, errors }) {
  await managerPage.reload();
  const managerPanel = managerPage.getByRole("region", { name: "Voucher and payment authorization" });
  const issue = managerPanel.locator('[data-voucher-action="issue"]');
  await expect(issue).toBeVisible();
  await issue.locator('[name="reason"]').fill("Finance certifies the posted voucher");
  await managerPage.route(`**/finance-vouchers/${item.id}/issue`, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Issue retry test" }) }));
  await issue.getByRole("button").click();
  await expect(issue.locator("[data-voucher-error]")).toHaveText("Issue retry test");
  await expect(issue.locator('[name="reason"]')).toHaveValue("Finance certifies the posted voucher");
  await managerPage.unroute(`**/finance-vouchers/${item.id}/issue`);
  await issue.getByRole("button").focus(); await managerPage.keyboard.press("Enter");
  await expect(managerPanel.locator("[data-voucher-state]")).toHaveText("Voucher Issued");

  const signatoryPage = await ui("signatory@payment.local"); signatoryPage.on("pageerror", error => errors.push(error.message));
  await signatoryPage.goto("/#/approvals");
  await expect(signatoryPage.getByText("No requests are currently assigned to you.", { exact: true })).toBeVisible();
  await page.reload();
  const financePanel = page.getByRole("region", { name: "Voucher and payment authorization" });
  await financePanel.getByText("Add payment line items", { exact: true }).click();
  const instruction = financePanel.locator('[data-payment-action="prepare"]');
  await expect(instruction).toBeVisible();
  const methods = await (await admin.context.get("/api/v1/payment-methods")).json();
  await instruction.locator('[name="label"]').fill("First installment");
  await instruction.locator('[name="amount"]').fill("1200.00");
  await instruction.locator('[name="method_id"]').selectOption(methods.find(row => row.code === "BANK_TRANSFER").id);
  const signatoryId = await instruction.locator('[name="signatory_user_id"] option').nth(1).getAttribute("value");
  await instruction.locator('[name="signatory_user_id"]').selectOption(signatoryId);
  await instruction.locator('[name="reference"]').fill(`TX-${crypto.randomUUID().slice(0, 8)}`);
  await instruction.getByRole("button", { name: "Add another payment line" }).click();
  const second = instruction.locator('[data-payment-draft-line="1"]');
  await second.locator('[name="label"]').fill("Second installment");
  await second.locator('[name="amount"]').fill("1000.00");
  await second.locator('[name="method_id"]').selectOption(methods.find(row => row.code === "CHECK").id);
  await second.locator('[name="signatory_user_id"]').selectOption(signatoryId);
  await second.locator('[name="reference"]').fill(`CK-${crypto.randomUUID().slice(0, 8)}`);
  await instruction.locator('[name="reason"]').fill("Prepare two installments for assigned signatory");
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const drawer = page.locator('[data-toggle-conversation][aria-expanded="true"]'); if (width < 1200 && await drawer.isVisible()) await drawer.click();
    await expect(async () => { await financePanel.scrollIntoViewIfNeeded(); }).toPass({ timeout: 5000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    for (const select of await instruction.locator("select").all()) {
      const box = await select.boundingBox(); expect(Math.round(box.height)).toBeGreaterThanOrEqual(42);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    }
  }
  await instruction.getByRole("button", { name: "Prepare payment line items" }).click();
  await expect(financePanel.locator("[data-voucher-state]")).toHaveText("Awaiting Assigned Signatory");
  await managerPage.reload();
  const failedCard = managerPanel.locator("[data-payment-card]").nth(1);
  await failedCard.getByText("Mark payment failed", { exact: true }).first().click();
  const failure = failedCard.locator('[data-payment-action="fail"]');
  await failure.locator('[name="reason"]').fill("Replace a check before release");
  await failure.getByRole("button", { name: "Mark payment failed", exact: true }).click();
  await expect(failedCard.locator("[data-payment-state]")).toHaveText("Failed");
  await page.reload();
  await financePanel.getByRole("button", { name: "Prepare replacement" }).click();
  const replacement = financePanel.locator('[data-payment-action="prepare"]');
  await expect(replacement.locator('[name="amount"]')).toHaveValue("1000.0000");
  await replacement.locator('[name="reference"]').fill(`CK-REPLACE-${crypto.randomUUID().slice(0, 8)}`);
  await replacement.locator('[name="reason"]').fill("Fresh check requiring a new authorization");
  await replacement.getByRole("button", { name: "Prepare payment line items" }).click();
  await expect(financePanel.locator("[data-payment-card]")).toHaveCount(3);
  await signatoryPage.reload();
  await expect(signatoryPage.locator(`[data-open-approval-workspace="${item.request_number}"]`)).toBeVisible();
  await signatoryPage.locator(`[data-open-approval-workspace="${item.request_number}"]`).click();
  const signatoryPanel = signatoryPage.getByRole("region", { name: "Voucher and payment authorization" });
  const authorization = signatoryPanel.locator('[data-payment-action="authorize"]');
  await expect(authorization).toHaveCount(2);
  for (const details of await signatoryPanel.locator("details").all()) {
    if (await details.locator('[data-payment-action="authorize"]').count()) await details.locator("summary").click();
  }
  await signatoryPage.setViewportSize({ width: 390, height: 900 });
  const drawer = signatoryPage.locator('[data-toggle-conversation][aria-expanded="true"]'); if (await drawer.isVisible()) await drawer.click();
  for (let index = 0; index < 2; index++) {
    const form = authorization.first();
    const details = form.locator("..");
    if (!(await details.getAttribute("open")) && !await form.isVisible()) await details.locator("summary").click();
    await form.locator('[name="reason"]').fill("Authorize the recorded installment");
    await form.getByRole("button").focus(); await signatoryPage.keyboard.press("Enter");
    await expect(authorization).toHaveCount(1 - index);
  }
  await expect(signatoryPanel.locator("[data-voucher-state]")).toHaveText("Payment Authorized · Release Pending");
  await signatoryPage.reload();
  await expect(authorization).toHaveCount(0);
  await expect(signatoryPanel).toContainText("Sofia Bautista");
  expect(await signatoryPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await signatoryPanel.screenshot({ path: "outputs/phase07-authorization-mobile.png" });

  // Render the actual print iframe while suppressing the native print dialog in the test only.
  await signatoryPage.addInitScript(() => { window.print = () => {}; });
  await signatoryPanel.getByRole("button", { name: "Print / Save PDF" }).click();
  const print = signatoryPage.frameLocator("[data-voucher-print-frame]");
  await expect(print.getByRole("heading", { name: "Payment Voucher", exact: true })).toBeVisible();
  await expect(print.locator("body")).toContainText("2,200.00");
  await expect(print.locator("body")).toContainText("Authorized · Payment release pending");
  writeFileSync("outputs/phase06-voucher-preview.html", await print.locator("html").evaluate(el => el.outerHTML), "utf8");
  writeFileSync("outputs/phase06-voucher-print-data.json", JSON.stringify(await (await signatoryPage.request.get(`/api/v1/finance-vouchers/${item.id}/print-data`)).json()), "utf8");
  await signatoryPage.locator("[data-voucher-print-frame]").evaluate(el => { el.style.cssText = "position:relative;left:0;top:0;width:794px;height:1123px;border:0"; });
  await signatoryPage.setViewportSize({ width: 900, height: 1200 });
  expect(await print.locator("body").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
  await print.locator("body").screenshot({ path: "outputs/phase06-voucher-print.png" });
  await signatoryPage.locator("[data-voucher-print-frame]").evaluate(el => el.remove());

  await page.reload();
  const cards = financePanel.locator("[data-payment-card]");
  const record = async (card, action, title) => {
    await card.getByText(title, { exact: true }).first().click();
    const form = card.locator(`[data-payment-action="${action}"]`);
    await form.locator('[name="reason"]').fill("Evidence verified in browser");
    if (["release", "clear"].includes(action)) {
      await form.locator('[name="recorded_on"]').fill("2026-01-02");
      await form.locator('[name="evidence"]').setInputFiles({ name: "payment-proof.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nPayment proof\n%%EOF") });
      if (action === "release") {
        await form.locator('[name="bank_name"]').fill("Test Bank");
        await form.locator('[name="recipient_name"]').fill("Accounting Browser Vendor");
      }
    }
    const submit = form.getByRole("button", { name: title, exact: true });
    if (action === "release") {
      const lineId = await card.getAttribute("data-payment-card");
      const endpoint = `**/payments/${item.id}/lines/${lineId}/release`;
      await page.route(endpoint, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Release retry test" }) }));
      await submit.click();
      await expect(form.locator("[data-payment-error]")).toHaveText("Release retry test");
      await expect(form.locator('[name="reason"]')).toHaveValue("Evidence verified in browser");
      await page.unroute(endpoint);
    }
    await submit.click();
    await expect(form).toHaveCount(0);
  };
  await record(cards.nth(0), "release", "Record payment release");
  await expect(financePanel.locator("[data-voucher-state]")).toHaveText("Partially Released");
  await record(cards.last(), "pickup-ready", "Mark ready for pickup");
  await record(cards.last(), "release", "Record payment release");
  await expect(financePanel.locator("[data-voucher-state]")).toHaveText("Payment Released · Clearing Pending");
  await managerPage.reload();
  await expect(managerPanel.locator('[data-voucher-action="void"]')).toHaveCount(0);
  const managerCards = managerPanel.locator("[data-payment-card]");
  await record(managerCards.nth(0), "clear", "Confirm payment clearing");
  await record(managerCards.last(), "clear", "Confirm payment clearing");
  await expect(managerPanel.locator("[data-voucher-state]")).toHaveText("Payment Cleared");
  await page.reload();
  await expect(financePanel.locator("[data-voucher-state]")).toHaveText("Payment Cleared");
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const drawer = page.locator('[data-toggle-conversation][aria-expanded="true"]'); if (width < 1200 && await drawer.isVisible()) await drawer.click();
    await expect(async () => { await financePanel.scrollIntoViewIfNeeded(); }).toPass({ timeout: 5000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await financePanel.screenshot({ path: "outputs/phase07-payment-execution-mobile.png" });
  await managerPage.addInitScript(() => { window.print = () => {}; });
  await managerPanel.getByRole("button", { name: "Print / Save PDF" }).click();
  const finalPrint = managerPage.frameLocator("[data-voucher-print-frame]");
  await expect(finalPrint.locator("body")).toContainText("Payment line items");
  await expect(finalPrint.locator("body")).toContainText("cleared");
  writeFileSync("outputs/phase07-voucher-preview.html", await finalPrint.locator("html").evaluate(el => el.outerHTML), "utf8");
  expect(errors).toEqual([]);
}
