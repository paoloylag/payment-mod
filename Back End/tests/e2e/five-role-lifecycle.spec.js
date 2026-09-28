import { expect, request as playwrightRequest, test } from "@playwright/test";

const apiBaseURL = "http://127.0.0.1:58003";
const password = "Phase01-Test-Only!";
const accounts = {
  requestor: "requestor@payment.local",
  departmentHead: "department.head@payment.local",
  financeAssociate: "finance.associate@payment.local",
  financeManager: "finance.manager@payment.local",
  systemAdministrator: "admin@payment.local",
};

async function loginThroughUi(page, email) {
  await page.goto("/#/login");
  await page.locator("[data-demo-login]").selectOption(email);
  await expect(page.locator('input[name="email"]')).toHaveValue(email);
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/v1/auth/login") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Sign in" }).click();
  expect((await responsePromise).ok()).toBeTruthy();
  await expect(page.locator("[data-account-menu]")).toBeVisible({ timeout: 20_000 });
}

async function apiSession(email = accounts.requestor) {
  const context = await playwrightRequest.newContext({ baseURL: apiBaseURL });
  const response = await context.post("/api/v1/auth/login", { data: { email, password } });
  expect(response.ok()).toBeTruthy();
  return { context, csrf: (await response.json()).csrf_token };
}

async function referenceData(context) {
  let [departmentsResponse, centersResponse, accountsResponse] = await Promise.all([
    context.get("/api/v1/departments"),
    context.get("/api/v1/cost-centers?page=1&page_size=100"),
    context.get("/api/v1/chart-of-accounts?page=1&page_size=100"),
  ]);
  const departments = await departmentsResponse.json();
  const centers = await centersResponse.json();
  let chartAccounts = await accountsResponse.json();
  if (!chartAccounts.some((item) => item.is_posting)) {
    const { context: adminContext, csrf } = await apiSession(accounts.systemAdministrator);
    const created = await adminContext.post("/api/v1/chart-of-accounts", {
      headers: { "X-CSRF-Token": csrf },
      data: {
        code: "E2E-EXPENSE",
        name: "E2E Expense Account",
        description: "Dedicated browser acceptance account",
        account_type: "expense",
        parent_id: null,
        is_posting: true,
        normal_balance: "debit",
        is_active: true,
      },
    });
    expect(created.ok()).toBeTruthy();
    await adminContext.dispose();
    accountsResponse = await context.get("/api/v1/chart-of-accounts?page=1&page_size=100");
    chartAccounts = await accountsResponse.json();
  }
  return {
    departmentId: departments.find((item) => item.code === "MKTG").id,
    costCenterId: centers.find((item) => item.code === "MKTG").id,
    chartAccountId: chartAccounts.find((item) => item.is_posting)?.id,
  };
}

function payloadFor(type, refs, index) {
  const line = {
    invoice_number: `E2E-${type}-${index}`,
    invoice_date: "2026-09-20",
    vendor_name: "E2E Merchant",
    particulars: `Five-role ${type} acceptance item`,
    chart_account_id: refs.chartAccountId,
    cost_center_id: refs.costCenterId,
    amount: "1250.50",
    currency_code: "PHP",
    attachment_refs: ["e2e-support.pdf"],
  };
  const payload = {
    request_type: type,
    department_id: refs.departmentId,
    payee_name: "E2E Merchant",
    purpose: `Five-role ${type} browser acceptance`,
    currency_code: "PHP",
    type_data: { source: "playwright-e2e", proof_of_payment_refs: ["proof.pdf"] },
    lines: [line],
  };
  if (type === "cashAdvance") {
    payload.payee_name = "Development Requestor";
    payload.type_data = { event_end_date: "2026-09-15", liquidation_due_date: "2026-09-30", accountability_acknowledged: true };
    Object.assign(line, { invoice_number: null, invoice_date: null, vendor_name: "", chart_account_id: null, cost_center_id: null, attachment_refs: [] });
  } else if (type === "liquidation") {
    payload.type_data = { cash_advance_reference: "CA-E2E-SUPPORT", liquidation_due_date: "2026-09-30", actual_liquidation_date: "2026-09-28", liquidation_advance_amount: "1500.00", liquidation_return_amount: "249.50" };
    line.attachment_refs = [];
  } else if (type === "poPayment") {
    payload.payee_name = "Sample BrightTech Supply";
    payload.type_data = { po_reference: "PO-DEMO-1001" };
    Object.assign(line, { invoice_number: "PO-DEMO-1001", invoice_date: null, vendor_name: "Sample BrightTech Supply", particulars: "Two sample staff laptops", amount: "89000.00" });
  } else if (type === "general") {
    payload.payee_name = "Utility Provider";
    payload.type_data = { billing_document_refs: ["utility-bill.pdf"], new_supplier: false };
    Object.assign(line, { invoice_number: null, invoice_date: null, vendor_name: "Utility Provider" });
  }
  return payload;
}

async function createSubmittedRequests() {
  const { context, csrf } = await apiSession();
  const refs = await referenceData(context);
  expect(refs.chartAccountId).toBeTruthy();
  const records = [];
  for (const [index, type] of ["reimbursement", "cashAdvance", "liquidation", "poPayment", "general"].entries()) {
    const createdResponse = await context.post("/api/v1/requests", { headers: { "X-CSRF-Token": csrf }, data: payloadFor(type, refs, index + 1) });
    expect(createdResponse.ok()).toBeTruthy();
    const created = await createdResponse.json();
    const submittedResponse = await context.post(`/api/v1/requests/${created.id}/submit`, {
      headers: { "X-CSRF-Token": csrf, "Idempotency-Key": crypto.randomUUID() },
      data: { version: created.version, note: "Submitted for five-role browser acceptance." },
    });
    expect(submittedResponse.ok()).toBeTruthy();
    records.push(await submittedResponse.json());
  }
  await context.dispose();
  return records;
}

async function openRequest(page, requestNumber) {
  await page.goto(`/#/requests/${requestNumber}`);
  // A role can revisit the same hash after another role changes the record.
  // Reload so the page fetches the current API state instead of reusing stale UI data.
  await page.reload();
  await expect(page.locator(".unified-request-page h3").first()).toHaveText(requestNumber);
}

async function clickLifecycle(page, requestNumber, action, note) {
  await openRequest(page, requestNumber);
  const responsePromise = page.waitForResponse((response) => response.url().includes(`/api/v1/requests/`) && response.url().endsWith(`/${action}`) && response.request().method() === "POST");
  await page.locator(`[data-api-lifecycle="${action}"]`).click();
  const modal = page.locator("[data-action-prompt-backdrop]");
  await expect(modal).toBeVisible();
  await modal.locator("[data-action-prompt-input]").fill(note);
  await modal.locator("[data-confirm-action-prompt]").click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test("five roles click through return, resubmit, cancel and reopen for all request types", async ({ browser }) => {
  // Seed the real API records before the role sessions load their request lists.
  const records = await createSubmittedRequests();
  const contextEntries = [];
  for (const [role, email] of Object.entries(accounts)) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginThroughUi(page, email);
    contextEntries.push([role, { context, page }]);
  }
  const contexts = Object.fromEntries(contextEntries);

  const reopenedByRole = [];
  for (const [index, initial] of records.entries()) {
    const number = initial.request_number;
    const returned = await clickLifecycle(contexts.departmentHead.page, number, "return", `Department Head correction for ${number}.`);
    expect(returned.status).toBe("returned");

    await openRequest(contexts.financeManager.page, number);
    await expect(contexts.financeManager.page.locator('[data-api-lifecycle="resubmit"]')).toHaveCount(0);
    await expect(contexts.financeManager.page.locator("[data-edit-returned]")).toHaveCount(0);

    const resubmitted = await clickLifecycle(contexts.requestor.page, number, "resubmit", `Requestor corrected ${number}.`);
    expect(resubmitted.status).toBe("submitted");

    if (index === 0) {
      const financeReturned = await clickLifecycle(contexts.financeAssociate.page, number, "return", `Finance verification correction for ${number}.`);
      expect(financeReturned.status).toBe("returned");
      const secondResubmission = await clickLifecycle(contexts.requestor.page, number, "resubmit", `Requestor completed Finance correction for ${number}.`);
      expect(secondResubmission.status).toBe("submitted");
    }

    const cancelled = await clickLifecycle(contexts.requestor.page, number, "cancel", `Requestor cancellation for ${number}.`);
    expect(cancelled.status).toBe("cancelled");

    const reopeningRole = index % 2 === 0 ? "systemAdministrator" : "financeManager";
    const reopened = await clickLifecycle(contexts[reopeningRole].page, number, "reopen", `${reopeningRole} reopening ${number}.`);
    expect(reopened.status).toBe("draft");
    await expect(contexts[reopeningRole].page.getByText("Request updated", { exact: true })).toBeVisible();
    reopenedByRole.push(reopeningRole);
  }

  expect(new Set(reopenedByRole)).toEqual(new Set(["systemAdministrator", "financeManager"]));

  const { context: auditContext } = await apiSession(accounts.systemAdministrator);
  const finalList = await (await auditContext.get("/api/v1/requests?page=1&page_size=100")).json();
  for (const record of records) {
    const finalRecord = finalList.find((item) => item.id === record.id);
    expect(finalRecord.status).toBe("draft");
    const history = await (await auditContext.get(`/api/v1/requests/${record.id}/history`)).json();
    const transitions = history.map((item) => item.to_status);
    expect(transitions).toEqual(expect.arrayContaining(["submitted", "returned", "cancelled", "draft"]));
  }
  await auditContext.dispose();

  await Promise.all(Object.values(contexts).map(({ context }) => context.close()));
});
