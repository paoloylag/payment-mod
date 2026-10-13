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
  await expect(managerPanel.locator("[data-voucher-state]")).toHaveText("Voucher issued");

  const signatoryPage = await ui("signatory@payment.local"); signatoryPage.on("pageerror", error => errors.push(error.message));
  await signatoryPage.goto("/#/approvals");
  await expect(signatoryPage.getByText("No requests are currently assigned to you.", { exact: true })).toBeVisible();
  await page.reload();
  const financePanel = page.getByRole("region", { name: "Voucher and payment authorization" });
  const instruction = financePanel.locator('[data-voucher-action="prepare-payment"]');
  await expect(instruction).toBeVisible();
  const methods = await (await admin.context.get("/api/v1/payment-methods")).json();
  await instruction.locator('[name="method_id"]').selectOption(methods.find(row => row.code === "BANK_TRANSFER").id);
  const signatoryId = await instruction.locator('[name="signatory_user_id"] option').nth(1).getAttribute("value");
  await instruction.locator('[name="signatory_user_id"]').selectOption(signatoryId);
  await instruction.locator('[name="reference"]').fill(`TX-${crypto.randomUUID().slice(0, 8)}`);
  await instruction.locator('[name="reason"]').fill("Prepare full instruction for assigned signatory");
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const drawer = page.locator('[data-toggle-conversation][aria-expanded="true"]'); if (width < 1200 && await drawer.isVisible()) await drawer.click();
    await financePanel.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    for (const select of await instruction.locator("select").all()) {
      const box = await select.boundingBox(); expect(Math.round(box.height)).toBeGreaterThanOrEqual(42);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    }
  }
  await instruction.getByRole("button").click();
  await expect(financePanel.locator("[data-voucher-state]")).toHaveText("Awaiting assigned signatory");
  await signatoryPage.reload();
  await expect(signatoryPage.locator(`[data-open-approval-workspace="${item.request_number}"]`)).toBeVisible();
  await signatoryPage.locator(`[data-open-approval-workspace="${item.request_number}"]`).click();
  const signatoryPanel = signatoryPage.getByRole("region", { name: "Voucher and payment authorization" });
  const authorization = signatoryPanel.locator('[data-voucher-action="authorize"]');
  await expect(authorization).toBeVisible();
  await signatoryPage.setViewportSize({ width: 390, height: 900 });
  const drawer = signatoryPage.locator('[data-toggle-conversation][aria-expanded="true"]'); if (await drawer.isVisible()) await drawer.click();
  await authorization.locator('[name="reason"]').fill("Authorize the recorded instruction");
  await authorization.getByRole("button").focus(); await signatoryPage.keyboard.press("Enter");
  await expect(signatoryPanel.locator("[data-voucher-state]")).toHaveText("Payment authorized · Release pending");
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

  await managerPage.reload();
  await managerPanel.getByText("Void voucher and reverse accounting", { exact: true }).first().click();
  const voidForm = managerPanel.locator('[data-voucher-action="void"]');
  await voidForm.locator('[name="reason"]').fill("Void authorization before payment release");
  await voidForm.getByRole("button").click();
  await expect(managerPanel.locator("[data-voucher-state]")).toHaveText("Voucher voided · Accounting reversed");
  await expect(managerPage.getByRole("region", { name: "General request accounting" })).toContainText("Accounting reversed");
  await signatoryPage.reload();
  await expect(signatoryPanel.locator("[data-voucher-state]")).toHaveText("Voucher voided · Accounting reversed");
  await expect(signatoryPanel.locator('[data-voucher-action="authorize"]')).toHaveCount(0);
  await signatoryPanel.getByRole("button", { name: "Print / Save PDF" }).click();
  await expect(print.locator("body")).toContainText("VOIDED - ACCOUNTING REVERSED");
  await expect(print.locator("body")).toContainText("Payment authorization invalidated by voucher voiding");
  expect(errors).toEqual([]);
}
