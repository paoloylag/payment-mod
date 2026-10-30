import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { prepareCloseout } from "./finance-closeout-fixtures.js";
import { voucherPrintHtml } from "../../src/voucher-ui.js";

test("Finance links independently approved replacements and reconciles its filtered work queue", async ({ page }) => {
  page.setDefaultTimeout(15_000);
  const fixture = await prepareCloseout();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto("/#/login"); await page.locator("[data-demo-login]").selectOption("finance.manager@payment.local");
    await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(/#\/dashboard$/);
    await page.goto(`/#/requests/${fixture.original.request_number}`);
    const panel = page.getByRole("region", { name: "Voucher and payment authorization", exact: true });
    await panel.locator("[data-voucher-replacement] summary").click();
    const form = panel.locator('[data-voucher-action="link-replacement"]');
    await form.getByRole("combobox", { name: "Replacement request" }).selectOption(fixture.replacement.id);
    await form.getByRole("textbox", { name: "Reason", exact: true }).fill("Corrected invoice independently approved");
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const drawer = page.locator('[data-toggle-conversation][aria-expanded="true"]'); if (await drawer.isVisible()) await drawer.click();
      await expect(form).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
      expect(Math.round((await form.getByRole("combobox").boundingBox()).height)).toBeGreaterThanOrEqual(42);
    }
    const path = `**/api/v1/finance-vouchers/${fixture.original.id}/link-replacement`;
    await page.route(path, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Temporary verification failure" }) }));
    await form.getByRole("button", { name: "Link replacement voucher", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("Temporary verification failure");
    await expect(form.getByRole("textbox")).toHaveValue("Corrected invoice independently approved");
    await page.unroute(path);
    await form.getByRole("button", { name: "Link replacement voucher", exact: true }).press("Enter");
    await expect(panel.getByRole("link", { name: fixture.replacement.request_number })).toBeVisible();
    await page.reload(); await expect(panel).toContainText(`Replaced by ${fixture.replacement.request_number}`);
    await panel.getByRole("link", { name: fixture.replacement.request_number }).click();
    await expect(panel).toContainText(`Replacement for ${fixture.original.request_number}`);
    await page.goto("/#/tracker");
    const queue = page.getByRole("region", { name: "Finance work queue", exact: true });
    await expect(queue.getByRole("status")).toContainText("requests");
    await queue.getByRole("textbox", { name: "Search request or payee" }).fill("Closeout Vendor");
    await queue.getByRole("textbox").press("Enter");
    await expect(queue.getByRole("status")).toContainText("2 requests");
    await expect(queue).toContainText("PHP · Due ₱1,100.00");
    await queue.getByLabel("Work phase").selectOption("voided"); await queue.getByRole("button", { name: "Apply filters" }).click();
    await expect(queue.getByRole("status")).toContainText("1 requests"); await expect(queue).toContainText("No active voucher totals");
    await queue.getByLabel("Work phase").selectOption("voucher"); await queue.getByRole("button", { name: "Apply filters" }).click();
    await expect(queue.getByRole("status")).toContainText("1 requests");
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
      await expect(queue.getByRole("button", { name: "Apply filters" })).toBeVisible();
    }
    await page.setViewportSize({ width: 390, height: 900 }); await queue.screenshot({ path: "outputs/phase05-07-finance-queue-mobile.png" });
    await queue.getByRole("link", { name: fixture.replacement.request_number }).click();
    const mobileDrawer = page.locator('[data-toggle-conversation][aria-expanded="true"]'); if (await mobileDrawer.isVisible()) await mobileDrawer.click();
    const issue = panel.locator('[data-voucher-action="issue"]'); await issue.getByRole("textbox").fill("Certify independently approved replacement");
    await issue.getByRole("button", { name: "Issue and certify voucher" }).click(); await expect(panel.locator("[data-voucher-state]")).toHaveText("Voucher Issued");
    const print = await (await fixture.manager.context.get(`/api/v1/finance-vouchers/${fixture.replacement.id}/print-data`)).json();
    expect(print.replacement_links[0].original_request_number).toBe(fixture.original.request_number);
    const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
    writeFileSync("outputs/phase05-07-replacement-voucher-preview.html", voucherPrintHtml(print, escape, (amount, currency) => `${currency} ${amount.toFixed(2)}`));
    expect(errors).toEqual([]);
  } finally { await fixture.restore(); }
});
