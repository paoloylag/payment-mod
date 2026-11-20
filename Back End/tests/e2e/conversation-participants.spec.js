import { expect, request as playwrightRequest, test } from "@playwright/test";

const apiBaseURL = "http://127.0.0.1:58003";
const password = "Phase01-Test-Only!";
const roles = [
  ["requestor", "requestor@payment.local"],
  ["department_head", "department.head@payment.local"],
  ["finance_associate", "finance.associate@payment.local"],
  ["finance_manager", "finance.manager@payment.local"],
  ["coo", "coo@payment.local"],
  ["president", "president@payment.local"],
  ["board_member", "board.member@payment.local"],
];

async function session(email) {
  const context = await playwrightRequest.newContext({ baseURL: apiBaseURL });
  const login = await context.post("/api/v1/auth/login", { data: { email, password } });
  expect(login.ok()).toBeTruthy();
  return { context, csrf: (await login.json()).csrf_token };
}

async function createRequest() {
  const { context, csrf } = await session(roles[0][1]);
  const departments = await (await context.get("/api/v1/departments")).json();
  const centers = await (await context.get("/api/v1/cost-centers?page=1&page_size=100")).json();
  const accounts = await (await context.get("/api/v1/chart-of-accounts?page=1&page_size=100")).json();
  const department = departments.find((item) => item.code === "MKTG");
  const center = centers.find((item) => item.code === "MKTG" && item.is_active);
  const account = accounts.find((item) => item.is_posting && item.is_active);
  expect(department && center && account).toBeTruthy();
  const created = await context.post("/api/v1/requests", {
    headers: { "X-CSRF-Token": csrf },
    data: {
      request_type: "general", department_id: department.id, payee_name: "Conversation Test Vendor",
      purpose: "Participant chat browser walkthrough", currency_code: "PHP",
      type_data: { budgeted: false, billing_document_refs: ["conversation-test-bill.pdf"] },
      lines: [{ invoice_number: null, invoice_date: null, vendor_name: "Conversation Test Vendor",
        particulars: "Participant chat test", chart_account_id: account.id, cost_center_id: center.id,
        amount: "1000000.01", currency_code: "PHP", attachment_refs: ["conversation-test-bill.pdf"] }],
    },
  });
  expect(created.ok()).toBeTruthy();
  const draft = await created.json();
  const submitted = await context.post(`/api/v1/requests/${draft.id}/submit`, {
    headers: { "X-CSRF-Token": csrf, "Idempotency-Key": crypto.randomUUID() },
    data: { version: draft.version },
  });
  expect(submitted.ok()).toBeTruthy();
  const item = await submitted.json();
  await context.dispose();
  return item;
}

async function loginUi(page, email) {
  await page.goto("/#/login");
  await page.locator("[data-demo-login]").selectOption(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/#\/dashboard$/);
}

async function expectAccess(requestId, email, allowed, financeOverview = false) {
  const { context } = await session(email);
  try {
    const detail = await context.get(`/api/v1/requests/${requestId}`);
    const conversation = await context.get(`/api/v1/requests/${requestId}/conversation`);
    expect(detail.status()).toBe(allowed || financeOverview ? 200 : 404);
    expect(conversation.status()).toBe(allowed ? 200 : 404);
    if (allowed) expect((await conversation.json()).can_post).toBe(true);
  } finally {
    await context.dispose();
  }
}

async function advance(requestId, email, finance = false) {
  const { context, csrf } = await session(email);
  try {
    if (finance) {
      const requestItem = await (await context.get(`/api/v1/requests/${requestId}`)).json();
      const types = await (await context.get("/api/v1/document-types?page=1&page_size=100")).json();
      const invoiceType = types.find((entry) => entry.code === "INVOICE");
      for (const line of requestItem.lines) {
        const upload = await context.post(`/api/v1/requests/${requestId}/documents`, {
          headers: { "X-CSRF-Token": csrf },
          multipart: { line_id: line.id, document_type_id: invoiceType.id,
            file: { name: "conversation-review.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nConversation review\n%%EOF") } },
        });
        expect(upload.ok(), await upload.text()).toBeTruthy();
        const document = await upload.json();
        const reviewed = await context.post(`/api/v1/documents/${document.id}/reviews`, {
          headers: { "X-CSRF-Token": csrf }, data: { decision: "accepted", comment: "Reviewed" },
        });
        expect(reviewed.ok(), await reviewed.text()).toBeTruthy();
        const lineReview = await context.post(`/api/v1/finance-validation/${requestId}/lines/${line.id}/reviews`, {
          headers: { "X-CSRF-Token": csrf }, data: { request_version: requestItem.version, decision: "accepted" },
        });
        expect(lineReview.ok(), await lineReview.text()).toBeTruthy();
      }
    }
    const workflow = await (await context.get(`/api/v1/workflow/${requestId}`)).json();
    const approved = await context.post(`/api/v1/workflow/${requestId}/approve`, {
      headers: { "X-CSRF-Token": csrf, "Idempotency-Key": crypto.randomUUID() },
      data: { version: workflow.version, note: "Browser stage progression" },
    });
    expect(approved.ok(), await approved.text()).toBeTruthy();
  } finally {
    await context.dispose();
  }
}

async function openConversation(browser, item, role, email, width, post = false) {
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  try {
    const page = await context.newPage();
    await loginUi(page, email);
    await page.goto(`/#/requests/${item.request_number}`);
    if (width < 1200) await page.getByRole("button", { name: "Open request conversation" }).click();
    await expect(page.locator("[data-conversation-form]"), `${role} at ${width}px`).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${role} at ${width}px has horizontal overflow`).toBeTruthy();
    if (post) {
      const message = `${role} can post after their stage starts`;
      await page.locator("[data-conversation-form] textarea").fill(message);
      const response = page.waitForResponse((result) => result.url().endsWith("/conversation") && result.request().method() === "POST");
      await page.locator("[data-conversation-form]").getByRole("button", { name: "Post Message" }).click();
      expect((await response).status()).toBe(201);
      await expect(page.locator(".conversation-entry").first()).toContainText(message);
    }
  } finally {
    await context.close();
  }
}

test("request and chat access opens only as each approval stage is reached", async ({ browser }) => {
  const item = await createRequest();
  await openConversation(browser, item, ...roles[0], 390, true);
  await openConversation(browser, item, ...roles[1], 390);
  for (const [, email] of roles.slice(2, 4)) await expectAccess(item.id, email, false, true);
  for (const [, email] of roles.slice(4)) await expectAccess(item.id, email, false);
  const requestor = await session(roles[0][1]);
  const initialParticipants = (await (await requestor.context.get(`/api/v1/requests/${item.id}/conversation`)).json()).participants;
  expect(initialParticipants.map((person) => person.role).sort()).toEqual(["department_head", "requestor"]);
  await requestor.context.dispose();

  await advance(item.id, roles[1][1]);
  await openConversation(browser, item, ...roles[2], 390);
  await expectAccess(item.id, roles[3][1], false, true);
  for (const [, email] of roles.slice(4)) await expectAccess(item.id, email, false);
  await advance(item.id, roles[2][1], true);
  await openConversation(browser, item, ...roles[3], 390);
  for (const [, email] of roles.slice(4)) await expectAccess(item.id, email, false);
  await advance(item.id, roles[3][1]);
  await openConversation(browser, item, ...roles[4], 390, true);
  await openConversation(browser, item, ...roles[4], 768);
  await openConversation(browser, item, ...roles[0], 1280);
  for (const [, email] of roles.slice(5)) await expectAccess(item.id, email, false);
  await advance(item.id, roles[4][1]);
  await openConversation(browser, item, ...roles[5], 390);
  await expectAccess(item.id, roles[6][1], false);
  await advance(item.id, roles[5][1]);
  await openConversation(browser, item, ...roles[6], 390);
  const outsider = await session("signatory@payment.local");
  expect((await outsider.context.get(`/api/v1/requests/${item.id}/conversation`)).status()).toBe(404);
  await outsider.context.dispose();
});
