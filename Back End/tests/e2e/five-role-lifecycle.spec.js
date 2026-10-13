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
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  await page.locator("[data-demo-login]").selectOption(email);
  await expect(page.locator('input[name="email"]')).toHaveValue(email);
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/v1/auth/login") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Sign in" }).click();
  expect((await responsePromise).ok()).toBeTruthy();
  await expect(page).toHaveURL(/#\/dashboard$/);
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
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
    payload.payee_name = "Mara Reyes";
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
  console.log(`Lifecycle ${action}: ${requestNumber}`);
  await openRequest(page, requestNumber);
  await expect(page.locator(`[data-api-lifecycle="${action}"]`)).toBeVisible();
  const responsePromise = page.waitForResponse((response) => response.url().includes(`/api/v1/requests/`) && response.url().endsWith(`/${action}`) && response.request().method() === "POST", { timeout: 10000 });
  await page.locator(`[data-api-lifecycle="${action}"]`).click();
  const modal = page.locator("[data-action-prompt-backdrop]");
  await expect(modal).toBeVisible();
  await modal.locator("[data-action-prompt-input]").fill(note);
  await modal.locator("[data-confirm-action-prompt]").click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function rejectApproval(page, requestNumber, decision, note) {
  console.log(`Approval ${decision}: ${requestNumber}`);
  await openRequest(page, requestNumber);
  await page.locator("[data-first-stage-reject-submit]").click();
  const modal = page.locator("[data-action-prompt-backdrop]");
  await expect(modal).toBeVisible();
  await modal.locator("[data-action-prompt-select]").selectOption(decision === "return" ? "return:requestor" : "decline");
  await modal.locator("[data-action-prompt-input]").fill(note);
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/reject") && response.request().method() === "POST", { timeout: 10000 });
  await modal.locator("[data-confirm-action-prompt]").click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function approveStage(page, requestNumber) {
  console.log(`Approval approve: ${requestNumber}`);
  await openRequest(page, requestNumber);
  await expect(page.locator("[data-backend-approve]")).toBeVisible();
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/approve") && response.request().method() === "POST", { timeout: 10000 });
  await page.locator("[data-backend-approve]").click();
  const modal = page.locator("[data-action-prompt-backdrop]");
  await expect(modal).toBeVisible();
  await modal.locator("[data-confirm-action-prompt]").click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function approveFinanceValidation(requestId) {
  const { context, csrf } = await apiSession(accounts.financeAssociate);
  try {
    const item = await (await context.get(`/api/v1/requests/${requestId}`)).json();
    const types = await (await context.get("/api/v1/document-types?page=1&page_size=100")).json();
    const documentType = types.find((entry) => entry.code === (item.request_type === "reimbursement" ? "PROOF_PAYMENT" : "INVOICE"));
    const documentHeaders = { "X-CSRF-Token": csrf };
    for (const line of item.lines) {
      if (line.attachment_refs?.length || item.request_type === "reimbursement") {
        const upload = await context.post(`/api/v1/requests/${requestId}/documents`, {
          headers: documentHeaders,
          multipart: {
            line_id: line.id,
            document_type_id: documentType.id,
            file: { name: "finance-e2e-proof.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nFinance acceptance\n%%EOF") },
          },
        });
        expect(upload.ok(), await upload.text()).toBeTruthy();
        const document = await upload.json();
        const reviewed = await context.post(`/api/v1/documents/${document.id}/reviews`, {
          headers: documentHeaders, data: { decision: "accepted", comment: "Verified for browser acceptance" },
        });
        expect(reviewed.ok(), await reviewed.text()).toBeTruthy();
      }
      const lineReview = await context.post(`/api/v1/finance-validation/${requestId}/lines/${line.id}/reviews`, {
        headers: documentHeaders,
        data: { request_version: item.version, decision: "accepted", physical_original_received: item.request_type === "reimbursement" },
      });
      expect(lineReview.ok(), await lineReview.text()).toBeTruthy();
    }
    const summary = await (await context.get(`/api/v1/finance-validation/${requestId}`)).json();
    expect(summary.ready_to_approve, JSON.stringify(summary.blockers)).toBeTruthy();
    const workflow = await (await context.get(`/api/v1/workflow/${requestId}`)).json();
    const response = await context.post(`/api/v1/workflow/${requestId}/approve`, {
      headers: { "X-CSRF-Token": csrf, "Idempotency-Key": crypto.randomUUID() },
      data: { version: workflow.version },
    });
    expect(response.ok()).toBeTruthy();
  } finally {
    await context.dispose();
  }
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
    const returned = await rejectApproval(contexts.departmentHead.page, number, "return", `Department Head correction for ${number}.`);
    expect(returned.request_status).toBe("returned");

    await openRequest(contexts.financeManager.page, number);
    await expect(contexts.financeManager.page.locator('[data-api-lifecycle="resubmit"]')).toHaveCount(0);
    await expect(contexts.financeManager.page.locator("[data-edit-returned]")).toHaveCount(0);

    const resubmitted = await clickLifecycle(contexts.requestor.page, number, "resubmit", `Requestor corrected ${number}.`);
    expect(resubmitted.status).toBe("submitted");

    if (index === 0) {
      await approveStage(contexts.departmentHead.page, number);
      // Phase 06 owns the Finance validation workbench; advance that stage through its API here.
      await approveFinanceValidation(initial.id);
      const financeReturned = await rejectApproval(contexts.financeManager.page, number, "return", `Finance Manager correction for ${number}.`);
      expect(financeReturned.request_status).toBe("returned");
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

test("executive review keeps messages, mentions, and information requests at the same stage", async ({ browser }) => {
  const { context: requestContext, csrf } = await apiSession();
  const refs = await referenceData(requestContext);
  const payload = payloadFor("general", refs, 6);
  payload.lines[0].amount = "1000000.01";
  payload.type_data.budgeted = false;
  const createdResponse = await requestContext.post("/api/v1/requests", {
    headers: { "X-CSRF-Token": csrf }, data: payload,
  });
  expect(createdResponse.ok()).toBeTruthy();
  const created = await createdResponse.json();
  const submittedResponse = await requestContext.post(`/api/v1/requests/${created.id}/submit`, {
    headers: { "X-CSRF-Token": csrf, "Idempotency-Key": crypto.randomUUID() },
    data: { version: created.version, note: "Executive review browser acceptance." },
  });
  expect(submittedResponse.ok()).toBeTruthy();
  const submitted = await submittedResponse.json();
  await requestContext.dispose();

  const sessions = {};
  for (const [role, email] of [
    ["departmentHead", accounts.departmentHead],
    ["financeManager", accounts.financeManager],
    ["financeAssociate", accounts.financeAssociate],
    ["coo", "coo@payment.local"],
  ]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginThroughUi(page, email);
    sessions[role] = { context, page };
  }
  try {
    await approveStage(sessions.departmentHead.page, submitted.request_number);
    await approveFinanceValidation(submitted.id);
    await approveStage(sessions.financeManager.page, submitted.request_number);

    const cooPage = sessions.coo.page;
    await openRequest(cooPage, submitted.request_number);
    const composer = cooPage.locator("[data-conversation-form]");
    await expect(composer).toBeVisible();
    await composer.locator("textarea").fill("@Nina");
    await cooPage.getByRole("option", { name: /Nina Santos/ }).click();
    await composer.locator("textarea").press("End");
    await composer.locator("textarea").type("Please confirm the payment schedule.");
    const messageResponse = cooPage.waitForResponse((response) => response.url().endsWith("/conversation") && response.request().method() === "POST", { timeout: 10000 });
    await composer.getByRole("button", { name: "Post Message" }).click();
    expect((await messageResponse).ok()).toBeTruthy();
    await expect(cooPage.locator(".conversation-entry").first()).toContainText("Please confirm the payment schedule.");

    const financePage = sessions.financeAssociate.page;
    await financePage.reload();
    await financePage.getByRole("button", { name: /Notifications/ }).click();
    await expect(financePage.locator(".notification-item-title").first()).toContainText("Mentioned you");
    await expect(financePage.locator(".notification-item").first()).toContainText("@Nina Santos Please confirm the payment schedule.");

    await cooPage.locator("[data-backend-request-information]").click();
    const questionModal = cooPage.locator("[data-action-prompt-backdrop]");
    await questionModal.locator("[data-action-prompt-input]").fill("Confirm the milestone amounts.");
    const questionResponse = cooPage.waitForResponse((response) => response.url().endsWith("/request-information") && response.request().method() === "POST", { timeout: 10000 });
    await questionModal.locator("[data-confirm-action-prompt]").click();
    expect((await questionResponse).ok()).toBeTruthy();

    await openRequest(financePage, submitted.request_number);
    await expect(financePage.locator("[data-backend-respond-information]")).toBeVisible();
    await financePage.locator("[data-backend-respond-information]").click();
    const responseModal = financePage.locator("[data-action-prompt-backdrop]");
    await responseModal.locator("[data-action-prompt-input]").fill("Finance confirmed the milestone amounts.");
    const informationResponse = financePage.waitForResponse((response) => response.url().endsWith("/respond-information") && response.request().method() === "POST", { timeout: 10000 });
    await responseModal.locator("[data-confirm-action-prompt]").click();
    const resumed = await (await informationResponse).json();
    expect(resumed.current_stage).toBe(3);
    expect(resumed.state).toBe("active");
    await approveStage(cooPage, submitted.request_number);
  } finally {
    await Promise.all(Object.values(sessions).map(({ context }) => context.close()));
  }
});

test("Finance Manager confirms a request rate and sets the remaining approval route", async ({ browser }) => {
  test.setTimeout(60_000);
  const requester = await apiSession();
  const refs = await referenceData(requester.context);
  const payload = payloadFor("general", refs, 91);
  payload.currency_code = "USD";
  payload.lines[0].currency_code = "USD";
  payload.lines[0].amount = "20000.0001";
  payload.type_data.budgeted = false;
  const createdResponse = await requester.context.post("/api/v1/requests", {
    headers: { "X-CSRF-Token": requester.csrf }, data: payload,
  });
  expect(createdResponse.ok()).toBeTruthy();
  const created = await createdResponse.json();
  const submittedResponse = await requester.context.post(`/api/v1/requests/${created.id}/submit`, {
    headers: { "X-CSRF-Token": requester.csrf, "Idempotency-Key": crypto.randomUUID() },
    data: { version: created.version },
  });
  expect(submittedResponse.ok()).toBeTruthy();
  const submitted = await submittedResponse.json();
  await requester.context.dispose();

  for (const [email, version] of [[accounts.departmentHead, 1], [accounts.financeAssociate, 2]]) {
    if (email === accounts.financeAssociate) {
      await approveFinanceValidation(created.id);
      continue;
    }
    const session = await apiSession(email);
    const response = await session.context.post(`/api/v1/workflow/${created.id}/approve`, {
      headers: { "X-CSRF-Token": session.csrf, "Idempotency-Key": crypto.randomUUID() },
      data: { version },
    });
    expect(response.ok()).toBeTruthy();
    await session.context.dispose();
  }

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await loginThroughUi(page, accounts.financeManager);
    await openRequest(page, submitted.request_number);
    const rate = page.locator("[data-request-php-rate]");
    await expect(rate).toBeVisible();
    await rate.fill("40");
    await expect(rate).toHaveValue("40");
    const actionsToggle = page.locator(".approval-actions .compressed-actions > button");
    if (await actionsToggle.isVisible()) await actionsToggle.click();
    await page.locator("[data-backend-approve]").click();
    await expect(page.locator("[data-action-prompt-backdrop]")).toBeVisible();
    const responsePromise = page.waitForResponse((response) => response.url().endsWith(`/workflow/${created.id}/approve`) && response.request().method() === "POST", { timeout: 15_000 });
    await page.locator("[data-confirm-action-prompt]").click();
    const confirmed = await (await responsePromise).json();
    expect(confirmed.route.php_per_unit).toBe("40");
    expect(confirmed.route.stages.slice(3).map((stage) => stage.role)).toEqual(["coo"]);
    expect(confirmed.current_stage).toBe(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  } finally {
    await context.close();
  }
});
