import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("role guides share current procedures with portable branded download and print", async ({ browser }) => {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/#/login");
  await page.locator("[data-demo-login]").selectOption("finance.associate@payment.local");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/#\/dashboard$/);
  await page.goto("/#/guide");
  await expect(page.getByRole("heading", { name: "Create a Petty Cash voucher", exact: true })).toBeVisible();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await expect(page.getByRole("button", { name: "Download HTML", exact: true })).toBeVisible();
  }
  await page.locator("[data-guide-search]").fill("no-matching-procedure");
  await expect(page.locator("[data-guide-empty]")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download HTML", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("LIFE-College-Payment-Module-finance_associate-Guide.html");
  const html = await readFile(await download.path(), "utf8");
  expect(html).toContain("Create a Petty Cash voucher");
  expect(html).toContain("There is no separate signatory approval step.");
  expect(html).toContain("data:image/png;base64,");
  expect(html).not.toMatch(/(?:src|href)=["']https?:/);
  const offline = await context.newPage();
  await offline.setContent(html);
  await expect(offline.getByAltText("LIFE College International")).toBeVisible();
  expect(await offline.locator("img.logo").evaluate(image => image.complete && image.naturalWidth === 2400)).toBeTruthy();
  for (const width of [375, 768, 1440]) {
    await offline.setViewportSize({ width, height: 900 });
    expect(await offline.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await offline.screenshot({ path: `outputs/portable-guide-${width}.png` });
  }
  await offline.emulateMedia({ media: "print" });
  await offline.setViewportSize({ width: 794, height: 1123 });
  await expect(offline.getByRole("button", { name: "Print / Save as PDF", exact: true })).toBeHidden();
  await offline.screenshot({ path: "outputs/portable-guide-print.png" });
  await page.addInitScript(() => { window.print = () => {}; });
  await page.getByRole("button", { name: "Print / Save PDF", exact: true }).click();
  const frame = page.frameLocator("[data-guide-print-frame]");
  await expect(frame.getByAltText("LIFE College International")).toBeAttached();
  await expect(frame.getByRole("heading", { name: "Create a Petty Cash voucher", exact: true })).toBeAttached();
  expect(errors).toEqual([]);
  await context.close();
});
