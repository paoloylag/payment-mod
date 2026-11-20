import { expect, request as apiRequest, test } from "@playwright/test";
import { writeFileSync } from "node:fs";

const emails = { system_administrator: "admin", requestor: "requestor", department_head: "department.head", finance_associate: "finance.associate", finance_manager: "finance.manager", coo: "coo", president: "president", board_member: "board.member" };
const proof = name => ({ name, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\nClick-through evidence ${name}\n%%EOF`) });
let admin;
const results = [];

async function signIn(browser, role, contexts, errors) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  contexts.push(context);
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on("pageerror", error => { errors.push(error.message); console.log(`UI ERROR ${role}: ${error.message}`); });
  page.on("response", async response => { if (response.status() >= 400 && response.url().includes("/api/v1/") && !response.url().endsWith("/auth/session")) console.log(`API ${response.status()}: ${await response.text().catch(() => "")}`); });
  await page.goto("/#/login");
  await page.locator("[data-demo-login]").selectOption(`${emails[role]}@payment.local`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/#\/dashboard$/);
  return page;
}
async function read(path) { const response = await admin.get(`/api/v1/${path}`); expect(response.ok(), await response.text()).toBeTruthy(); return response.json(); }
async function mutation(page, suffix, action) {
  const pending = page.waitForResponse(r => r.url().endsWith(suffix) && ["POST", "PATCH", "PUT"].includes(r.request().method()));
  const [response] = await Promise.all([pending, action()]);
  expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
}
async function clickAction(control) {
  await control.page().evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (!await control.isVisible()) {
    const menu = control.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " compressed-actions ")][1]');
    await menu.locator(":scope > button").click();
  }
  await control.click();
}
async function open(page, item) {
  await page.goto(`/#/requests/${item.request_number}`); await page.reload();
  await expect(page.locator(".unified-request-page h3").first()).toHaveText(item.request_number);
}
async function approve(page, item) {
  await open(page, item);
  const control = page.locator("[data-backend-approve], [data-finance-approve]");
  await expect(control).toBeEnabled();
  await control.click();
  return mutation(page, `/workflow/${item.id}/approve`, () => page.locator("[data-confirm-action-prompt]").click());
}
async function reject(page, item, outcome, reason, invalid = false) {
  await open(page, item); await page.locator("[data-first-stage-reject-submit]").click();
  const modal = page.locator("[data-action-prompt-backdrop]");
  await modal.locator("[data-action-prompt-select]").selectOption(outcome);
  if (invalid) {
    await expect(modal.locator("[data-confirm-action-prompt]")).toBeDisabled();
    await expect(modal).toBeVisible();
    expect((await read(`workflow/${item.id}`)).state).toBe("active");
  }
  await modal.locator("[data-action-prompt-input]").fill(reason);
  return mutation(page, `/workflow/${item.id}/reject`, () => modal.locator("[data-confirm-action-prompt]").click());
}
async function create(page, title, amount = "1120000") {
  const retryFiles = title === "upload-retry-mobile";
  if (retryFiles) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/requests");
  await page.locator('[data-select-request-type="general"]').click();
  const vendor = page.locator("[data-vendor-reference]");
  if (title === "new-supplier") {
    await page.getByLabel("Supplier option").selectOption("new");
    await page.getByLabel("Supplier name", { exact: true }).fill("Click-through Supplier " + crypto.randomUUID().slice(0,8));
    await page.getByLabel("Supplier email", { exact: true }).fill("supplier@example.test");
    for (const key of ["bir_2303", "business_registration_sec_dti", "business_permit"]) {
      await page.locator(`[data-request-document="${key}"]`).setInputFiles(proof(`${key}.pdf`));
    }
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
      await page.locator(".general-vendor-section").screenshot({ path: `outputs/supplier-form-${width}.png` });
    }
  } else await vendor.selectOption(await vendor.locator("option").nth(1).getAttribute("value"));
  await page.locator("#unbudgeted").check();
  const line = page.locator('[data-line-card="0"]');
  await line.locator('[data-line-column="Merchant Name"]').fill("Click-through Vendor");
  await line.locator('[data-line-column="Particulars"]').fill(title);
  await line.locator('[data-line-column="Amount"]').fill(amount);
  await line.locator('[data-line-column="Attachment"]').setInputFiles(retryFiles ? [proof(`${title}-invoice.pdf`), proof("remove-me.pdf")] : proof(`${title}-invoice.pdf`));
  if (retryFiles) await line.getByRole("button", { name: "Remove remove-me.pdf", exact: true }).click();
  await page.locator('[data-request-document="billing_soa_quotation"]').setInputFiles(proof(`${title}-billing.pdf`));
  if (retryFiles) {
    await page.locator("[data-add-line]").click(); await page.locator('[data-remove-line="1"]').click();
    await page.setViewportSize({ width: 768, height: 900 }); await page.setViewportSize({ width: 390, height: 844 });
    let uploads = 0;
    await page.route("**/requests/*/documents", route => route.request().method() === "POST" && ++uploads === 2 ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Temporary upload interruption" }) }) : route.continue());
  }
  const draft = await mutation(page, "/api/v1/requests", () => clickAction(page.locator("[data-save-draft]")));
  if (retryFiles) {
    await expect(page.getByText("Temporary upload interruption", { exact: true })).toBeVisible();
    expect((await read(`requests/${draft.id}/documents`)).length).toBe(1);
    await page.unroute("**/requests/*/documents");
    await mutation(page, `/requests/${draft.id}`, () => clickAction(page.locator("[data-save-draft]")));
  }
  await expect.poll(async () => (await read(`requests/${draft.id}/documents`)).length, { message: "Request-form uploads must persist real files, not filenames only" }).toBe(title === "new-supplier" ? 5 : 2);
  if (retryFiles) {
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: `Remove ${title}-invoice.pdf`, exact: true }).click();
    await page.locator('[data-line-column="Attachment"]').first().setInputFiles(proof(`${title}-revised-invoice.pdf`));
    await mutation(page, `/requests/${draft.id}`, () => clickAction(page.locator("[data-save-draft]")));
    await expect.poll(async () => (await read(`requests/${draft.id}/documents`)).map(row => row.filename).sort()).toEqual([`${title}-billing.pdf`, `${title}-revised-invoice.pdf`]);
  }
  await page.reload();
  await page.locator("[data-view-drafts]").click();
  // Draft rows show amounts/type, so identify the server-backed draft by its number.
  const candidate = page.locator(`[data-submit-draft="DRAFT-${draft.id.slice(0, 8).toUpperCase()}"]`);
  if (!await candidate.isVisible()) await candidate.locator("xpath=ancestor::tr").getByRole("button", { name: /^Actions/ }).click();
  await expect(candidate).toBeVisible();
  if (retryFiles) {
    const menu = candidate.locator("xpath=..");
    const box = await menu.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await page.screenshot({ path: "outputs/ui-click-through-draft-actions-mobile.png" });
  }
  const item = await mutation(page, `/requests/${draft.id}/submit`, () => candidate.click());
  await expect(page).toHaveURL(new RegExp(item.request_number));
  console.log(`UI CREATED ${item.request_number}: ${title}`);
  return item;
}
async function review(page, item) {
  await open(page, item);
  await expect(page.locator("[data-finance-approve]")).toBeDisabled();
  // Request-level document decision, then accept each complete line with its documents.
  const selectors = await page.locator(".finance-validation-documents [data-finance-document-review]").all();
  for (const selector of selectors) {
    const id = await selector.getAttribute("data-finance-document-review");
    await mutation(page, `/documents/${id}/reviews`, () => page.locator(`[data-finance-document-review="${id}"]`).selectOption("accepted"));
    await expect(page.getByText("The document decision was saved.", { exact: true })).toBeVisible();
  }
  for (const line of item.lines) {
    const form = page.locator(`[data-finance-line-review="${line.id}"]`);
    await form.locator("xpath=..").locator("[data-open-line-decision]").click();
    await form.locator('[name="decision"]').selectOption("accepted");
    await mutation(page, `/lines/${line.id}/reviews`, () => form.getByRole("button", { name: "Save line review" }).click());
  }
}
async function accounting(page, item) {
  await open(page, item);
  await page.locator('[data-finance-disclosure$=":tax-edit"] > summary').click();
  const tax = page.locator("[data-finance-tax-form]");
  await tax.locator('[name="reason"]').fill("Reviewed configured tax treatment");
  await mutation(page, `/finance-tax/${item.id}`, () => tax.getByRole("button", { name: "Save EWT and recalculate" }).click());
  await page.locator('[data-finance-disclosure$=":accounting-edit"] > summary').click();
  const draft = page.locator('[data-accounting-action="draft"]');
  await draft.locator('[name="reason"]').fill("Balanced entries reviewed through UI");
  await mutation(page, `/finance-accounting/${item.id}/draft`, () => draft.getByRole("button", { name: "Save accounting draft" }).click());
}
async function respond(page, item) {
  await open(page, item); await page.locator("[data-backend-respond-information]").click();
  await page.locator("[data-action-prompt-input]").fill("Finance completed the requested clarification and correction.");
  return mutation(page, `/workflow/${item.id}/respond-information`, () => page.locator("[data-confirm-action-prompt]").click());
}
test.beforeAll(async ({ browser }) => {
  admin = await apiRequest.newContext({ baseURL: "http://127.0.0.1:58003" });
  const login = await admin.post("/api/v1/auth/login", { data: { email: "admin@payment.local", password: "Phase01-Test-Only!" } });
  expect(login.ok()).toBeTruthy(); const headers = { "X-CSRF-Token": (await login.json()).csrf_token };
  const ids = [];
  for (const [name, account_type, normal_balance] of [["Expense", "expense", "debit"], ["VAT", "asset", "debit"], ["EWT", "liability", "credit"], ["Payable", "liability", "credit"]]) {
    const result = await admin.post("/api/v1/chart-of-accounts", { headers, data: { code: `CLICK-${crypto.randomUUID().slice(0,8).toUpperCase()}`, name: `${name} ${crypto.randomUUID().slice(0,8)}`, account_type, normal_balance, is_posting: true } });
    expect(result.ok(), await result.text()).toBeTruthy(); ids.push((await result.json()).id);
  }
  const original = await read("request-settings/finance-setup"), taxes = await read("tax-codes");
  const saved = await admin.put("/api/v1/request-settings/finance-setup", { headers, data: {
    ...original, vat_basis: "inclusive", ewt_basis: "net_of_vat", rounding: "half_up", setup_scope: "system", effective_from: "2020-01-01", effective_date_basis: "finance_review",
    tax_by_request_type: { general: taxes.find(row => row.code === "VAT12-EWT2").id },
    accounts_by_request_type: { general: { debit_account_id: ids[0], input_vat_account_id: ids[1], ewt_payable_account_id: ids[2], credit_account_id: ids[3] } },
    voucher: { prefix: "PV", reset_basis: "calendar_year", certification_text: "UI click-through certification", create_role: "finance_associate", post_role: "finance_manager", void_role: "finance_manager" },
  } }); expect(saved.ok(), await saved.text()).toBeTruthy();
  const contexts = [], errors = []; const page = await signIn(browser, "finance_manager", contexts, errors);
  await page.goto("/#/administration/request-settings"); const activate = page.locator("[data-finance-activation]");
  await activate.locator('[name="reason"]').fill("Activate synthetic click-through Finance setup");
  await activate.getByRole("button").click(); await expect(activate.getByRole("button")).toHaveText("Saved version already activated");
  await contexts[0].close();
});
test.afterAll(async () => { writeFileSync("outputs/request-click-through-results.json", JSON.stringify(results, null, 2)); await admin?.dispose(); });

test("UI creation, documents, six approvals, Finance return and executive information loops finish at issued voucher", async ({ browser }) => {
  test.setTimeout(300000); const contexts = [], errors = [], pages = {};
  const rolePage = async role => pages[role] ||= await signIn(browser, role, contexts, errors);
  try {
    const item = await create(await rolePage("requestor"), "full-ui-route");
    const head = await rolePage("department_head"); await open(head, item);
    await head.locator("[data-first-stage-reject-submit]").click();
    await expect(head.locator('[data-action-prompt-select] option[value="return:finance_associate"]')).toHaveCount(0);
    await head.getByRole("button", { name: "Cancel", exact: true }).click();
    await approve(head, item);
    const associate = await rolePage("finance_associate"); await review(associate, item); await accounting(associate, item); await approve(associate, item);
    const manager = await rolePage("finance_manager");
    const before = await read(`workflow/${item.id}`);
    await reject(manager, item, "return:finance_associate", "Check supporting evidence before executive review", true);
    const paused = await read(`workflow/${item.id}`); expect(paused.current_stage).toBe(before.current_stage); expect(paused.state).toBe("information_requested");
    const resumed = await respond(associate, item); expect(resumed.current_stage).toBe(before.current_stage);
    expect((await read(`workflow/${item.id}`)).events.filter(row => row.action === "stage_approved")).toHaveLength(2);
    await approve(manager, item);
    for (const role of ["coo", "president", "board_member"]) {
      const executive = await rolePage(role); await open(executive, item);
      await expect(executive.locator("[data-first-stage-reject-submit]")).toHaveCount(0);
      const workflow = await read(`workflow/${item.id}`);
      await executive.locator("[data-backend-request-information]").click();
      await executive.locator("[data-action-prompt-input]").fill(`${role}: confirm milestone and payment schedule`);
      await mutation(executive, `/workflow/${item.id}/request-information`, () => executive.locator("[data-confirm-action-prompt]").click());
      const response = await respond(associate, item); expect(response.current_stage).toBe(workflow.current_stage);
      const approved = await approve(executive, item); console.log(`UI APPROVAL ${role}: ${approved.state}`);
    }
    expect((await read(`workflow/${item.id}`)).state).toBe("approved");
    await open(manager, item); const post = manager.locator('[data-accounting-action="post"]');
    await post.locator('[name="reason"]').fill("Post after all approvals");
    await mutation(manager, `/finance-accounting/${item.id}/post`, () => post.getByRole("button").click());
    await open(associate, item); const voucher = associate.locator('[data-accounting-action="voucher"]');
    await voucher.locator('[name="reason"]').fill("Create voucher after full UI approval route");
    await mutation(associate, `/finance-accounting/${item.id}/voucher`, () => voucher.getByRole("button").click());
    await open(manager, item); const issue = manager.locator('[data-voucher-action="issue"]');
    await issue.locator('[name="reason"]').fill("Certify completed click-through voucher");
    await mutation(manager, `/finance-vouchers/${item.id}/issue`, () => issue.getByRole("button").click());
    await manager.reload(); await expect(manager.locator("[data-voucher-state]")).toHaveText("Voucher Issued");
    await manager.addInitScript(() => { window.print = () => {}; });
    await manager.locator("[data-finance-voucher]").getByRole("button", { name: "Print / Save PDF" }).click();
    await expect(manager.frameLocator("[data-voucher-print-frame]").locator("body")).toContainText(item.request_number);
    for (const width of [390, 768, 1440]) {
      await manager.setViewportSize({ width, height: 900 });
      expect(await manager.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    }
    await manager.locator("[data-finance-voucher]").screenshot({ path: "outputs/ui-click-through-issued-voucher.png" });
    expect(errors).toEqual([]); results.push({ scenario: "full UI route including FM return and all executive information loops", request: item.request_number, result: "passed" });
  } finally { for (const context of contexts) await context.close(); }
});

for (const role of ["department_head", "finance_associate", "finance_manager"]) {
  for (const decision of ["return", "decline"]) {
    test(`${role} ${decision} uses UI; requestor editing and workflow ownership follow the decision`, async ({ browser }) => {
      test.setTimeout(180000); const contexts = [], errors = [], pages = {};
      const rolePage = async key => pages[key] ||= await signIn(browser, key, contexts, errors);
      try {
        const owner = await rolePage("requestor"), item = await create(owner, `${role}-${decision}`);
        if (role !== "department_head") await approve(await rolePage("department_head"), item);
        if (role === "finance_manager") { const associate = await rolePage("finance_associate"); await review(associate, item); await accounting(associate, item); await approve(associate, item); }
        const reviewer = await rolePage(role);
        await reject(reviewer, item, decision === "return" ? "return:requestor" : "decline", `Please correct supporting information: ${role}`, true);
        await open(owner, item);
        const current = await read(`requests/${item.id}`); expect(current.status).toBe(decision === "return" ? "returned" : "declined");
        if (decision === "return") {
          await owner.locator("[data-edit-returned]").click();
          await owner.locator('[data-line-column="Particulars"]').first().fill("Corrected after reviewer return");
          const resubmitted = await mutation(owner, `/requests/${item.id}/resubmit`, () => owner.locator("[data-submit-current]").click());
          expect(resubmitted.status).toBe("submitted");
          const workflow = await read(`workflow/${item.id}`);
          expect(workflow.route.stages[workflow.current_stage].role).toBe(role === "department_head" ? "department_head" : "finance_associate");
          expect((await read(`requests/${item.id}/documents`)).length).toBe(2);
        } else {
          await expect(owner.locator("[data-edit-returned], [data-api-lifecycle=\"resubmit\"]")).toHaveCount(0);
          expect((await read(`workflow/${item.id}`)).state).toBe("declined");
        }
        expect(errors).toEqual([]); results.push({ scenario: `${role} ${decision}`, request: item.request_number, result: "passed" });
      } finally { for (const context of contexts) await context.close(); }
    });
  }
}

test("mobile uploads survive a partial failure, retry without duplicates, and request cancellation can be reopened", async ({ browser }) => {
  test.setTimeout(120000); const contexts = [], errors = [];
  try {
    const owner = await signIn(browser, "requestor", contexts, errors), item = await create(owner, "upload-retry-mobile");
    const documents = await read(`requests/${item.id}/documents`);
    expect(documents.map(row => row.filename).sort()).toEqual(["upload-retry-mobile-billing.pdf", "upload-retry-mobile-revised-invoice.pdf"]);
    expect(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await open(owner, item); await owner.locator('[data-api-lifecycle="cancel"]').click();
    await owner.locator("[data-action-prompt-input]").fill("Cancel the mobile retry test request");
    const cancelled = await mutation(owner, `/requests/${item.id}/cancel`, () => owner.locator("[data-confirm-action-prompt]").click());
    expect(cancelled.status).toBe("cancelled");
    const manager = await signIn(browser, "finance_manager", contexts, errors); await open(manager, item);
    await manager.locator('[data-api-lifecycle="reopen"]').click(); await manager.locator("[data-action-prompt-input]").fill("Reopen the cancelled request for correction");
    const reopened = await mutation(manager, `/requests/${item.id}/reopen`, () => manager.locator("[data-confirm-action-prompt]").click());
    expect(reopened.status).toBe("draft");
    await expect(manager).toHaveURL(/#\/dashboard$/);
    expect(errors).toEqual([]); results.push({ scenario: "mobile file removal, partial-upload retry, cancel and reopen", request: item.request_number, result: "passed" });
  } finally { for (const context of contexts) await context.close(); }
});


test("new supplier uploads stay request-bound until Finance validates all documents", async ({ browser }) => {
  test.setTimeout(180000); const contexts = [], errors = [];
  try {
    const owner = await signIn(browser, "requestor", contexts, errors);
    const item = await create(owner, "new-supplier", "1000");
    const vendorId = item.vendor_external_id;
    expect((await read("vendors")).some(vendor => vendor.id === vendorId)).toBe(false);
    const head = await signIn(browser, "department_head", contexts, errors);
    await approve(head, item);
    expect((await read("vendors")).some(vendor => vendor.id === vendorId)).toBe(false);
    const finance = await signIn(browser, "finance_associate", contexts, errors);
    for (const role of ["finance_manager", "system_administrator"]) {
      const viewer = await signIn(browser, role, contexts, errors);
      await viewer.getByRole("button", { name: "□ Vendor Administration", exact: true }).click();
      await viewer.locator("[data-vendor-status]").selectOption("pending_validation");
      await expect(viewer.locator(`[data-vendor-row="${vendorId}"]`)).toContainText("Pending Validation");
    }
    await expect(owner.getByRole("button", { name: "□ Vendor Administration", exact: true })).toHaveCount(0);
    await finance.getByRole("button", { name: "□ Vendor Administration", exact: true }).click();
    await finance.locator("[data-vendor-status]").selectOption("pending_validation");
    const vendorRow = finance.locator(`[data-vendor-row="${vendorId}"]`);
    await expect(vendorRow.locator("[data-edit-vendor], [data-toggle-vendor]")).toHaveCount(0);
    await vendorRow.getByRole("button", { name: "Verify documents", exact: true }).click();
    const verification = finance.getByRole("region", { name: "Supplier document verification", exact: true });
    await expect(verification.locator("[data-vendor-document-review]")).toHaveCount(3);
    for (const width of [375, 768, 1440]) {
      await finance.setViewportSize({ width, height: 900 });
      expect(await finance.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
      await finance.screenshot({ path: `outputs/vendor-verification-${width}.png` });
    }
    const permit = verification.getByRole("combobox", { name: "Review Business Permit", exact: true });
    await permit.selectOption("replacement_required");
    await finance.locator("[data-action-prompt-input]").fill("Please upload a readable current permit.");
    await mutation(finance, "/reviews", () => finance.locator("[data-confirm-action-prompt]").click());
    await expect(verification).toContainText("Replacement Required");
    for (let index = 0; index < 3; index++) {
      const control = verification.locator("[data-vendor-document-review]").nth(index);
      const documentId = await control.getAttribute("data-vendor-document-review");
      await mutation(finance, `/documents/${documentId}/reviews`, () => control.selectOption("accepted"));
      await expect(verification.locator(".vendor-verification-card").nth(index)).toContainText("Accepted");
    }
    expect((await read("vendors")).some(vendor => vendor.id === vendorId)).toBe(false);
    await finance.getByRole("button", { name: "Close vendor", exact: true }).click();
    await finance.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
    await vendorRow.getByRole("button", { name: "Verify documents", exact: true }).click();
    await expect(verification).toContainText("Accepted");
    await finance.screenshot({ path: "outputs/vendor-verification-dark.png" });
    await verification.getByRole("button", { name: "Open request", exact: true }).click();
    await expect(finance).toHaveURL(new RegExp(item.request_number));
    await review(finance, item);
    await accounting(finance, item);
    await finance.screenshot({ path: "outputs/supplier-finance-review.png", fullPage: true });
    await approve(finance, item);
    const supplier = (await read("vendors")).find(vendor => vendor.id === vendorId);
    expect(supplier.status).toBe("active"); expect(supplier.businessDocuments.length).toBe(3);
    await owner.goto("/#/requests"); await owner.reload();
    await owner.locator('[data-select-request-type="general"]').click();
    await expect(owner.locator(`[data-vendor-reference] option[value="${vendorId}"]`)).toBeAttached();
    await owner.locator("[data-vendor-reference]").selectOption(vendorId);
    expect(errors).toEqual([]);
    results.push({ scenario: "supplier validation and reuse", request: item.request_number, result: "passed" });
  } finally { for (const context of contexts) await context.close(); }
});


test("confirmation retains reason across background refresh and contains/restores focus", async ({ browser }) => {
  test.setTimeout(120000); const contexts = [], errors = [];
  try {
    const owner = await signIn(browser, "requestor", contexts, errors);
    const item = await create(owner, "prompt-state", "1000");
    const head = await signIn(browser, "department_head", contexts, errors);
    await head.clock.install();
    await open(head, item);
    const opener = head.locator("[data-first-stage-reject-submit]");
    await opener.click();
    const modal = head.locator("[data-action-prompt-backdrop]");
    await expect(modal).toHaveJSProperty("open", true);
    const selection = modal.locator("[data-action-prompt-select]");
    const reason = modal.locator("[data-action-prompt-input]");
    const confirm = modal.locator("[data-confirm-action-prompt]");
    await selection.selectOption("return:requestor");
    await reason.fill("Retain this correction reason through notification refresh.");
    await expect(confirm).toBeEnabled();
    const refreshed = head.waitForResponse(response => response.url().includes("/notifications"));
    await head.clock.runFor(31000);
    await refreshed;
    await expect(reason).toHaveValue("Retain this correction reason through notification refresh.");
    await expect(selection).toHaveValue("return:requestor");
    await expect(confirm).toBeEnabled();
    await selection.focus(); await head.keyboard.press("Shift+Tab");
    await expect(confirm).toBeFocused();
    await head.keyboard.press("Tab"); await expect(selection).toBeFocused();
    await head.screenshot({ path: "outputs/ui-fixes-prompt-desktop.png" });
    for (const width of [375, 768]) {
      await head.setViewportSize({ width, height: 900 });
      expect(await head.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
      await expect(reason).toHaveValue("Retain this correction reason through notification refresh.");
      await head.screenshot({ path: `outputs/ui-fixes-prompt-${width}.png` });
    }
    await reason.press("Escape");
    await expect(modal).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect((await read(`workflow/${item.id}`)).current_stage).toBe(0);
    expect(errors).toEqual([]);
  } finally { for (const context of contexts) await context.close(); }
});

test("Finance Manager empty dashboard offers its approval queue, not request creation", async ({ browser }) => {
  const contexts = [], errors = [];
  try {
    const page = await signIn(browser, "finance_manager", contexts, errors);
    await page.getByRole("searchbox", { name: "Search requests, vouchers or payees", exact: true }).fill("NO-MATCH-UI-FIX");
    await expect(page.getByRole("button", { name: "Create Request", exact: true })).toHaveCount(0);
    // Prepare a true empty API list; filtered-empty tables use a different existing presentation.
    await page.route(/\/api\/v1\/requests(?:\?.*)?$/, route => route.fulfill({ json: [], headers: { "X-Total-Count": "0" } }));
    await page.reload();
    await expect(page.getByRole("heading", { name: "No payment requests yet", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Request", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Open Approval Queue", exact: true }).click();
    await expect(page).toHaveURL(/#\/approvals$/);
    expect(errors).toEqual([]);
  } finally { for (const context of contexts) await context.close(); }
});
