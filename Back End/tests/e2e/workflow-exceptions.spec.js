import { expect, request as playwrightRequest, test } from "@playwright/test";

const password = "Phase01-Test-Only!";
const apiBaseURL = "http://127.0.0.1:58003";
async function session(email) {
  const context = await playwrightRequest.newContext({ baseURL: apiBaseURL });
  const login = await context.post("/api/v1/auth/login", { data: { email, password } });
  expect(login.ok()).toBeTruthy();
  return { context, headers: { "X-CSRF-Token": (await login.json()).csrf_token } };
}
async function login(page, email) {
  await page.goto("/#/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/#\/dashboard$/);
}
async function openControls(page, item) {
  await page.goto(`/#/requests/${item.request_number}`);
  await page.reload();
  await expect(page.locator(".workflow-exception-controls")).toBeAttached();
  if (await page.locator(".workflow-exception-controls").getAttribute("open") === null) await page.locator(".workflow-exception-controls summary").click();
  const form = page.locator("[data-workflow-exception]");
  await expect(form).toBeVisible();
  return form;
}
async function apply(page, form, reason) {
  console.log(`Workflow exception: ${reason}`);
  await form.locator('[name="note"]').fill(reason);
  const response = page.waitForResponse((res) => res.url().endsWith("/exceptions") && res.request().method() === "POST");
  await form.getByRole("button", { name: "Apply workflow action" }).focus();
  await page.keyboard.press("Enter");
  const result = await response;
  expect(result.ok(), await result.text()).toBeTruthy();
  await expect(page.getByText("Workflow updated", { exact: true })).toBeVisible();
}

test("delegation, reassignment, recovery and material correction retain a usable approval flow", async ({ browser }) => {
  test.setTimeout(90_000);
  const admin = await session("admin@payment.local");
  const departments = await (await admin.context.get("/api/v1/departments")).json();
  const roles = await (await admin.context.get("/api/v1/roles")).json();
  const users = await (await admin.context.get("/api/v1/users")).json();
  const department = departments.find((row) => row.code === "MKTG");
  const original = users.find((row) => row.email === "department.head@payment.local");
  const email = `alternate-${crypto.randomUUID()}@payment.local`;
  const newUser = await admin.context.post("/api/v1/users", { headers: admin.headers, data: { email, password, display_name: "Gabriel Torres", department_id: department.id } });
  expect(newUser.ok()).toBeTruthy();
  const alternate = await newUser.json();
  expect((await admin.context.put(`/api/v1/users/${alternate.id}/roles`, { headers: admin.headers, data: { role_ids: [roles.find((row) => row.code === "department_head").id] } })).ok()).toBeTruthy();
  let accounts = await (await admin.context.get("/api/v1/chart-of-accounts")).json();
  if (!accounts.some((row) => row.is_posting && row.is_active)) {
    const response = await admin.context.post("/api/v1/chart-of-accounts", { headers: admin.headers, data: { code: "EXCEPTION-EXPENSE", name: "Exception Test Expense", account_type: "expense", normal_balance: "debit", is_posting: true } });
    expect(response.ok()).toBeTruthy();
    accounts = [await response.json()];
  }
  const centers = await (await admin.context.get("/api/v1/cost-centers")).json();
  const owner = await session("requestor@payment.local");
  const payload = {
    request_type: "general", department_id: department.id, currency_code: "PHP", payee_name: "Exception Test Vendor", purpose: "Workflow exception browser verification",
    type_data: { budgeted: true, billing_document_refs: ["billing.pdf"] },
    lines: [{ particulars: "Materials", amount: "1000.00", currency_code: "PHP", vendor_name: "Exception Test Vendor", chart_account_id: accounts.find((row) => row.is_posting && row.is_active).id, cost_center_id: centers.find((row) => row.code === "MKTG").id, attachment_refs: ["billing.pdf"] }],
  };
  const created = await owner.context.post("/api/v1/requests", { headers: owner.headers, data: payload });
  expect(created.ok()).toBeTruthy();
  const draft = await created.json();
  const submit = await owner.context.post(`/api/v1/requests/${draft.id}/submit`, { headers: { ...owner.headers, "Idempotency-Key": crypto.randomUUID() }, data: { version: draft.version } });
  expect(submit.ok(), await submit.text()).toBeTruthy();
  const item = await submit.json();
  const headContext = await browser.newContext();
  const head = await headContext.newPage();
  await login(head, "department.head@payment.local");
  let form = await openControls(head, item);
  for (const width of [390, 768, 1280]) {
    await head.setViewportSize({ width, height: 900 });
    if (width < 1200 && await head.locator('[data-toggle-conversation][aria-expanded="true"]').isVisible()) {
      await head.locator('[data-toggle-conversation][aria-expanded="true"]').click();
    }
    await expect(form.getByRole("button", { name: "Apply workflow action" })).toBeVisible();
    expect(await head.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  }
  await form.locator('[name="target_user_id"]').selectOption(alternate.id);
  const localTime = (date) => date.toLocaleString("sv-SE").slice(0, 16).replace(" ", "T");
  await form.locator('[name="starts_at"]').fill(localTime(new Date(Date.now() - 60_000)));
  await form.locator('[name="ends_at"]').fill(localTime(new Date(Date.now() + 86_400_000)));
  await form.locator('[name="note"]').fill("Temporary leave coverage");
  await head.setViewportSize({ width: 390, height: 844 });
  await form.scrollIntoViewIfNeeded();
  await head.screenshot({ path: "outputs/phase05-assignment-controls-mobile.png", fullPage: true });
  await head.route("**/workflow/*/exceptions", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Temporary test failure" }) }));
  await form.getByRole("button", { name: "Apply workflow action" }).click();
  await expect(form.locator("[data-exception-error]")).toContainText("Temporary test failure");
  await expect(form.locator('[name="note"]')).toHaveValue("Temporary leave coverage");
  await head.unroute("**/workflow/*/exceptions");
  await apply(head, form, "Temporary leave coverage");
  await head.goto("/#/dashboard");
  const headApi = await session("department.head@payment.local");
  const queue = await (await headApi.context.get("/api/v1/workflow/queue")).json();
  await expect(head.locator('[data-metric="pending"] strong')).toHaveText(String(queue.length));
  expect(queue.some((row) => row.request_id === item.id)).toBe(false);
  form = await openControls(head, item);
  await form.locator('[name="action"]').selectOption("revoke");
  await apply(head, form, "Reviewer returned from leave");
  const adminContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const adminPage = await adminContext.newPage();
  await login(adminPage, "admin@payment.local");
  form = await openControls(adminPage, item);
  await form.locator('[name="action"]').selectOption("reassign");
  await form.locator('[name="target_user_id"]').selectOption(alternate.id);
  await apply(adminPage, form, "Change current reviewer");
  expect((await admin.context.patch(`/api/v1/users/${alternate.id}`, { headers: admin.headers, data: { is_suspended: true } })).ok()).toBeTruthy();
  form = await openControls(adminPage, item);
  await form.locator('[name="action"]').selectOption("recover");
  await form.locator('[name="target_user_id"]').selectOption(original.id);
  await apply(adminPage, form, "Recover assignment after reviewer suspension");
  const recovered = await (await admin.context.get(`/api/v1/workflow/${item.id}`)).json();
  expect(recovered.current_stage).toBe(0);
  form = await openControls(adminPage, item);
  await form.locator('[name="action"]').selectOption("material-correction");
  await form.locator('[name="changed_fields"][value="amount"]').check();
  await apply(adminPage, form, "Requestor must correct the amount");
  const returned = await (await owner.context.get(`/api/v1/requests/${item.id}`)).json();
  expect(returned.status).toBe("returned");
  const edited = await owner.context.patch(`/api/v1/requests/${item.id}`, { headers: owner.headers, data: { ...payload, version: returned.version, lines: [{ ...payload.lines[0], amount: "2000.00" }] } });
  expect(edited.ok(), await edited.text()).toBeTruthy();
  const resubmitted = await owner.context.post(`/api/v1/requests/${item.id}/resubmit`, { headers: { ...owner.headers, "Idempotency-Key": crypto.randomUUID() }, data: { version: (await edited.json()).version, note: "Corrected amount" } });
  expect(resubmitted.ok(), await resubmitted.text()).toBeTruthy();
  const final = await (await admin.context.get(`/api/v1/workflow/${item.id}`)).json();
  expect(final.current_stage).toBe(0);
  expect(Number(final.route.amount)).toBe(2000);
  expect(final.current_assignment.named).toBeNull();
  expect(final.events.map((event) => event.action)).toEqual(expect.arrayContaining(["assignment_delegated", "delegation_revoked", "assignment_reassigned", "assignment_recovered", "route_correction_requested"]));
  await adminContext.close();
  await headContext.close();
  await headApi.context.dispose();
  await owner.context.dispose();
  await admin.context.dispose();
});
