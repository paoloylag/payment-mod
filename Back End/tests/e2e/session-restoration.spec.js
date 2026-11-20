import { expect, test } from "@playwright/test";

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "desktop-dark", width: 1440, height: 900, dark: true },
  { name: "mobile", width: 390, height: 844 },
];

for (const viewport of viewports) {
  test(`session restoration is formatted without a login flash on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    if (viewport.dark) await page.emulateMedia({ colorScheme: "dark" });
    let releaseSession;
    const sessionPending = new Promise(resolve => { releaseSession = resolve; });
    await page.route("**/api/v1/auth/session", async route => {
      await sessionPending;
      await route.fulfill({ status: 401, contentType: "application/json", body: '{"detail":"Not authenticated"}' });
    });

    await page.goto("/#/dashboard", { waitUntil: "domcontentloaded" });
    const restoration = page.getByRole("status", { name: "Restoring your session" });
    await expect(restoration).toBeVisible();
    await expect(restoration).toContainText("Automated Payment System");
    await expect(restoration).toContainText("Please wait while we securely reconnect you.");
    await expect(page.getByRole("heading", { name: "Sign in" })).toHaveCount(0);
    await expect(page.locator('input[name="email"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `outputs/session-restoration-${viewport.name}.png`, fullPage: true });

    releaseSession();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
}
