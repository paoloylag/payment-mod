import { expect, test } from "@playwright/test";

const financeManager = "finance.manager@payment.local";
const password = "Phase01-Test-Only!";

// Apple sizes use the CSS-point viewports published in the Human Interface
// Guidelines. Samsung publishes physical display sizes, so these entries are
// representative CSS layout viewports for the current Galaxy form factors.
const deviceViewports = [
  { name: "iPhone 17", width: 402, height: 874 },
  { name: "iPhone 17 landscape", width: 874, height: 402 },
  { name: "iPhone Air", width: 420, height: 912 },
  { name: "large iPhone", width: 440, height: 956 },
  { name: "Galaxy S26", width: 360, height: 780 },
  { name: "Galaxy S26 landscape", width: 780, height: 360 },
  { name: "Galaxy S26 Ultra", width: 412, height: 915 },
  { name: "Galaxy Z Fold7 cover", width: 360, height: 840 },
  { name: "Galaxy Z Fold7 inner", width: 768, height: 832 },
  { name: "Galaxy Z Fold7 inner landscape", width: 832, height: 768 },
];

const routes = [
  { path: "dashboard", heading: "Payment Requests" },
  { path: "tracker", heading: "Payment Tracker" },
  { path: "approvals", heading: "Approval Queue" },
  { path: "administration/request-settings", heading: "Administration" },
];

async function login(page) {
  await page.goto("/#/login");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  await page.locator("[data-demo-login]").selectOption(financeManager);
  await expect(page.locator('input[name="email"]')).toHaveValue(financeManager);
  await expect(page.locator('input[name="password"]')).toHaveValue(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/#\/dashboard$/);
  await expect(page.locator("[data-account-menu]")).toBeVisible({ timeout: 20_000 });
}

test("current iPhone and Samsung viewports keep finance pages usable", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page);

  for (const device of deviceViewports) {
    await test.step(device.name, async () => {
      await page.setViewportSize({ width: device.width, height: device.height });

      for (const route of routes) {
        await page.goto(`/#/${route.path}`);
        await expect(page.getByRole("heading", { name: route.heading }).first()).toBeVisible();
        await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();

        const overflow = await page.evaluate(() => {
          const main = document.querySelector("main");
          return {
            document: document.documentElement.scrollWidth > window.innerWidth + 1,
            main: main ? main.scrollWidth > main.clientWidth + 1 : true,
          };
        });
        expect(overflow, `${device.name} ${route.path} should not overflow`).toEqual({
          document: false,
          main: false,
        });
      }

      await page.goto("/#/dashboard");
      await page.getByRole("button", { name: "Open navigation" }).click();
      await expect(page.locator(".app-shell")).toHaveClass(/nav-open/);
      await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
      await page.locator(".sidebar-mobile-header").getByRole("button", { name: "Close navigation" }).click();
      await expect(page.locator(".app-shell")).not.toHaveClass(/nav-open/);

      await page.goto("/#/administration/request-settings");
      const administrationTabs = page.getByRole("navigation", { name: "Administration settings" });
      const administrationSelect = page.getByLabel("Administration section");
      await expect(administrationTabs).toBeVisible();
      await expect(administrationSelect).toBeHidden();
      await expect(administrationTabs.locator("button.active")).toBeInViewport();
      expect(await administrationTabs.evaluate((element) => element.scrollWidth >= element.clientWidth)).toBeTruthy();

      if (device.width < 480) {
        await page.goto("/#/dashboard");
        const metricCards = page.locator(".metric-row .metric");
        if (await metricCards.count() > 1) {
          const first = await metricCards.nth(0).evaluate((element) => element.getBoundingClientRect());
          const second = await metricCards.nth(1).evaluate((element) => element.getBoundingClientRect());
          expect(Math.abs(first.x - second.x), `${device.name} metrics should stack`).toBeLessThan(2);
        }
      }
    });
  }

  await context.close();
});
