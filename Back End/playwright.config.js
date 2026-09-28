import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 10_000 },
  reporter: [["html", { outputFolder: "outputs/playwright-report", open: "never" }], ["list"]],
  outputDir: "outputs/playwright-results",
  globalSetup: "./tests/e2e/global-setup.js",
  globalTeardown: "./tests/e2e/global-teardown.js",
  use: {
    baseURL: "http://127.0.0.1:5178",
    headless: false,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "Google Chrome", use: { browserName: "chromium", channel: "chrome" } }],
  webServer: {
    command: "pnpm dev:e2e",
    url: "http://127.0.0.1:5178/#/login",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PAYMENT_API_TARGET: "http://127.0.0.1:58003",
      VITE_DATA_SOURCE: "api",
      VITE_ENABLE_DEMO_LOGIN: "true",
      VITE_DEMO_PASSWORD: "Phase01-Test-Only!",
    },
  },
});
