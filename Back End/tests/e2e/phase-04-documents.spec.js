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
const pdf = (name, suffix = "") => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.from(`%PDF-1.7\nPhase 04 browser acceptance ${suffix}\n%%EOF`),
});

async function apiSession(email) {
  const context = await playwrightRequest.newContext({ baseURL: apiBaseURL });
  const response = await context.post("/api/v1/auth/login", { data: { email, password } });
  expect(response.ok()).toBeTruthy();
  return { context, csrf: (await response.json()).csrf_token };
}

async function login(page, email) {
  await page.goto("/#/login");
  await page.locator("[data-demo-login]").selectOption(email);
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/v1/auth/login") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Sign in" }).click();
  expect((await responsePromise).ok()).toBeTruthy();
  await expect(page).toHaveURL(/#\/dashboard$/);
  await expect(page.locator("[data-account-menu]")).toBeVisible({ timeout: 20_000 });
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
        code: "P04-E2E-EXPENSE",
        name: "Phase 04 E2E Expense",
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
    chartAccountId: chartAccounts.find((item) => item.is_posting).id,
  };
}

async function createDraft() {
  const { context: adminContext, csrf: adminCsrf } = await apiSession(accounts.systemAdministrator);
  const documentTypes = await (await adminContext.get("/api/v1/document-types?page=1&page_size=100")).json();
  const billingType = documentTypes.find((item) => item.code === "BILLING_SOA");
  expect(billingType).toBeTruthy();
  const ruleResponse = await adminContext.post("/api/v1/document-requirement-rules", {
    headers: { "X-CSRF-Token": adminCsrf },
    data: {
      request_type: "general",
      document_type_id: billingType.id,
      scope: "request",
      minimum_count: 1,
      is_required: true,
      is_active: true,
    },
  });
  expect(ruleResponse.ok()).toBeTruthy();
  await adminContext.dispose();

  const { context, csrf } = await apiSession(accounts.requestor);
  const refs = await referenceData(context);
  const response = await context.post("/api/v1/requests", {
    headers: { "X-CSRF-Token": csrf },
    data: {
      request_type: "general",
      department_id: refs.departmentId,
      payee_name: "Phase 04 Browser Vendor",
      purpose: "Phase 04 five-role browser validation",
      currency_code: "PHP",
      type_data: { new_supplier: false, billing_document_refs: ["billing-original.pdf"] },
      lines: [{
        invoice_number: null,
        invoice_date: null,
        vendor_name: "Phase 04 Browser Vendor",
        particulars: "Browser validation service",
        chart_account_id: refs.chartAccountId,
        cost_center_id: refs.costCenterId,
        amount: "1250.50",
        currency_code: "PHP",
        attachment_refs: [],
      }],
    },
  });
  expect(response.ok()).toBeTruthy();
  const draft = await response.json();
  await context.dispose();
  return { ...draft, displayNumber: `DRAFT-${draft.id.slice(0, 8).toUpperCase()}` };
}

async function createReimbursementDraft() {
  const { context: adminContext, csrf: adminCsrf } = await apiSession(accounts.systemAdministrator);
  const documentTypes = await (await adminContext.get("/api/v1/document-types?page=1&page_size=100")).json();
  const typeByCode = Object.fromEntries(documentTypes.map((item) => [item.code, item]));
  for (const rule of [
    { code: "PROOF_PAYMENT", scope: "line", required: true, guidance: "Required for every reimbursement line" },
  ]) {
    expect(typeByCode[rule.code]).toBeTruthy();
    const response = await adminContext.post("/api/v1/document-requirement-rules", {
      headers: { "X-CSRF-Token": adminCsrf },
      data: {
        request_type: "reimbursement",
        document_type_id: typeByCode[rule.code].id,
        scope: rule.scope,
        minimum_count: 1,
        is_required: rule.required,
        guidance: rule.guidance,
        is_active: true,
      },
    });
    expect(response.ok()).toBeTruthy();
  }
  await adminContext.dispose();

  const { context, csrf } = await apiSession(accounts.requestor);
  const refs = await referenceData(context);
  const response = await context.post("/api/v1/requests", {
    headers: { "X-CSRF-Token": csrf },
    data: {
      request_type: "reimbursement",
      department_id: refs.departmentId,
      payee_name: "Phase 04 Reimbursement Merchant",
      purpose: "Multi-line reimbursement document validation",
      currency_code: "PHP",
      type_data: {},
      lines: [
        {
          invoice_number: "P04-E2E-001",
          invoice_date: "2026-09-20",
          vendor_name: "Phase 04 Merchant One",
          particulars: "Reimbursement item one",
          chart_account_id: refs.chartAccountId,
          cost_center_id: refs.costCenterId,
          amount: "625.25",
          currency_code: "PHP",
          attachment_refs: ["invoice-one.pdf"],
        },
        {
          invoice_number: "P04-E2E-002",
          invoice_date: "2026-09-21",
          vendor_name: "Phase 04 Merchant Two",
          particulars: "Reimbursement item two",
          chart_account_id: refs.chartAccountId,
          cost_center_id: refs.costCenterId,
          amount: "625.25",
          currency_code: "PHP",
          attachment_refs: ["invoice-two.pdf"],
        },
      ],
    },
  });
  expect(response.ok()).toBeTruthy();
  const draft = await response.json();
  await context.dispose();
  return {
    ...draft,
    displayNumber: `DRAFT-${draft.id.slice(0, 8).toUpperCase()}`,
    typeByCode,
  };
}

async function transition(email, requestId, action, version, note) {
  const { context, csrf } = await apiSession(email);
  const response = await context.post(`/api/v1/requests/${requestId}/${action}`, {
    headers: { "X-CSRF-Token": csrf, "Idempotency-Key": crypto.randomUUID() },
    data: { version, note },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  await context.dispose();
  return body;
}

async function openDocuments(page, requestNumber) {
  await page.goto("/#/documents/uploads");
  await page.reload();
  const heading = page.locator(".upload-workspace h3");
  if ((await heading.textContent())?.trim() !== requestNumber) {
    const candidate = page.locator(`[data-upload-request="${requestNumber}"]`);
    if (!(await candidate.isVisible())) await page.locator(".upload-request-selector").evaluate((details) => { details.open = true; });
    await expect(candidate).toBeVisible();
    await candidate.click();
  }
  await expect(heading).toHaveText(requestNumber);
  await expect(page.locator(".document-file-list")).toBeVisible();
}

async function assertResponsive(page) {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator(".upload-workspace")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
}

test("Phase 04 document workspace supports five-role API-backed browser validation", async ({ browser }) => {
  test.setTimeout(180_000);
  const draft = await createDraft();
  const sessions = {};
  for (const [role, email] of Object.entries(accounts)) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, email);
    sessions[role] = { context, page };
  }

  const requestor = sessions.requestor.page;
  await openDocuments(requestor, draft.displayNumber);
  await expect(requestor.getByText("0/1 requirements complete")).toBeVisible();
  const uploadResponse = requestor.waitForResponse((response) => response.url().includes(`/api/v1/requests/${draft.id}/documents`) && response.request().method() === "POST");
  await requestor.getByLabel(/^Upload Billing \/ Quotation \/ SOA/).setInputFiles(pdf("billing-original.pdf", "original"), { timeout: 10_000 });
  expect((await uploadResponse).status()).toBe(201);
  await expect(requestor.getByText("1/1 requirements complete")).toBeVisible();
  await expect(requestor.getByRole("link", { name: "Preview" })).toBeVisible();
  await assertResponsive(requestor);

  let submitted = await transition(accounts.requestor, draft.id, "submit", draft.version, "Ready for document-role validation.");
  const returned = await transition(accounts.departmentHead, draft.id, "return", submitted.version, "Return to validate editable document replacement.");

  await openDocuments(requestor, returned.request_number);
  const replaceResponse = requestor.waitForResponse((response) => response.url().includes("/api/v1/documents/") && response.url().endsWith("/versions") && response.request().method() === "POST");
  await requestor.getByLabel(/^Replace Billing \/ Quotation \/ SOA/).setInputFiles(pdf("billing-replacement.pdf", "replacement"), { timeout: 10_000 });
  expect((await replaceResponse).status()).toBe(201);
  await expect(requestor.getByText("billing-replacement.pdf")).toBeVisible();

  const departmentHead = sessions.departmentHead.page;
  await openDocuments(departmentHead, returned.request_number);
  await expect(departmentHead.getByText("billing-replacement.pdf")).toBeVisible();
  await expect(departmentHead.locator("[data-document-review]")).toHaveCount(0);

  const financeAssociate = sessions.financeAssociate.page;
  await openDocuments(financeAssociate, returned.request_number);
  const hardCopyResponse = financeAssociate.waitForResponse((response) => response.url().includes("/hard-copy") && response.request().method() === "POST");
  await financeAssociate.locator("[data-document-hard-copy]").selectOption("received");
  expect((await hardCopyResponse).status()).toBe(201);
  const reviewResponse = financeAssociate.waitForResponse((response) => response.url().includes("/reviews") && response.request().method() === "POST");
  await financeAssociate.locator("[data-document-review]").selectOption("accepted");
  expect((await reviewResponse).status()).toBe(201);
  await expect(financeAssociate.getByText("Review saved")).toBeVisible();
  await assertResponsive(financeAssociate);

  for (const role of ["financeManager", "systemAdministrator"]) {
    const page = sessions[role].page;
    await openDocuments(page, returned.request_number);
    await expect(page.locator("[data-document-hard-copy]")).toHaveValue("received");
    await expect(page.locator("[data-document-review]")).toHaveValue("accepted");
  }

  const admin = sessions.systemAdministrator.page;
  await admin.goto("/#/administration/request-requirements");
  await expect(admin.getByRole("heading", { name: "Request Requirements" })).toBeVisible();
  await expect(admin.getByRole("button", { name: "+ Requirement" })).toBeVisible();

  const { context: auditContext } = await apiSession(accounts.systemAdministrator);
  const documents = await (await auditContext.get(`/api/v1/requests/${draft.id}/documents`)).json();
  expect(documents).toHaveLength(1);
  expect(documents[0].current_version).toBe(2);
  expect(documents[0].hard_copy_status).toBe("received");
  expect(documents[0].review_decision).toBe("accepted");
  expect(documents[0].versions).toHaveLength(2);
  await auditContext.dispose();

  // Keep the returned version value referenced so API fixture drift is caught by the test.
  expect(returned.status).toBe("returned");
  await Promise.all(Object.values(sessions).map(({ context }) => context.close()));
});

test("Phase 04 requires separate Proof of Payment uploads for every Reimbursement line", async ({ browser }) => {
  test.setTimeout(120_000);
  const browserContext = await browser.newContext();
  const page = await browserContext.newPage();
  const draft = await createReimbursementDraft();
  await login(page, accounts.requestor);
  await openDocuments(page, draft.displayNumber);

  const lineOneUpload = page.getByLabel("Upload Proof of Payment (required for every reimbursement line) for line 1");
  const lineTwoUpload = page.getByLabel("Upload Proof of Payment (required for every reimbursement line) for line 2");
  await expect(lineOneUpload).toBeVisible();
  await expect(lineTwoUpload).toBeVisible();
  await expect(page.getByText("Line 1: Reimbursement item one", { exact: false })).toBeVisible();
  await expect(page.getByText("Line 2: Reimbursement item two", { exact: false })).toBeVisible();

  let upload = page.waitForResponse((response) => response.url().includes(`/api/v1/requests/${draft.id}/documents`) && response.request().method() === "POST");
  await lineOneUpload.setInputFiles(pdf("proof-line-one.pdf", "proof line one"));
  expect((await upload).status()).toBe(201);
  await expect(page.getByText("proof-line-one.pdf")).toBeVisible();
  await expect(page.getByText("Line 2: Reimbursement item two", { exact: false })).toBeVisible();

  upload = page.waitForResponse((response) => response.url().includes(`/api/v1/requests/${draft.id}/documents`) && response.request().method() === "POST");
  await page.getByLabel("Upload Proof of Payment (required for every reimbursement line) for line 2").setInputFiles(pdf("proof-line-two.pdf", "proof line two"));
  expect((await upload).status()).toBe(201);
  await expect(page.getByText("proof-line-two.pdf")).toBeVisible();

  const { context, csrf } = await apiSession(accounts.requestor);
  const requirements = await (await context.get(`/api/v1/requests/${draft.id}/document-requirements`)).json();
  expect(requirements.requirements.map((item) => item.document_type_code)).toEqual(["PROOF_PAYMENT"]);
  const proof = requirements.requirements.find((item) => item.document_type_code === "PROOF_PAYMENT");
  expect(proof.scope).toBe("line");
  expect(proof.complete).toBe(true);
  expect(proof.lines).toHaveLength(2);
  expect(proof.lines.every((item) => item.complete)).toBe(true);
  expect(requirements.can_submit_documents).toBe(true);

  const submitted = await context.post(`/api/v1/requests/${draft.id}/submit`, {
    headers: { "X-CSRF-Token": csrf, "Idempotency-Key": crypto.randomUUID() },
    data: { version: draft.version, note: "Multi-line Reimbursement documents complete." },
  });
  expect(submitted.ok()).toBeTruthy();
  expect((await submitted.json()).status).toBe("submitted");
  await context.dispose();
  await browserContext.close();
});
