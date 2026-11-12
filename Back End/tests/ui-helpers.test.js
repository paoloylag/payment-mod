import test from "node:test";
import assert from "node:assert/strict";
import { promptIncomplete, retainPromptValues, takePromptSubmission } from "../src/action-prompt.js";
import { conversationMessage } from "../src/conversation-message.js";
import { statusLabel } from "../src/status-label.js";
import { createApiRequest } from "../src/api-request.js";

test("required prompt reasons reject blanks and destinations must be selected", () => {
  const prompt = { required: true, selectOptions: [["requestor", "Requestor"]] };
  assert.equal(promptIncomplete(prompt, "  ", "requestor"), true);
  assert.equal(promptIncomplete(prompt, "Correction needed", ""), true);
  assert.equal(promptIncomplete(prompt, "Correction needed", "requestor"), false);
});
test("unrelated refresh retains reason and destination, including deliberate clearing", () => {
  const prompt = { inputValue: "Keep this note", selectValue: "requestor" };
  retainPromptValues(prompt, undefined, "finance_associate");
  assert.equal(prompt.inputValue, "Keep this note");
  retainPromptValues(prompt, "", undefined);
  assert.equal(prompt.inputValue, "");
  assert.equal(prompt.selectValue, "finance_associate");
});
test("prompt command is taken once with trimmed reason", () => {
  const prompt = { required: true };
  assert.deepEqual(takePromptSubmission(prompt, "  Fix invoice  ", "requestor"), { value: "Fix invoice", selected: "requestor" });
  assert.equal(takePromptSubmission(prompt, "Fix invoice", "requestor"), null);
});
test("status aliases preserve acronyms and missing values", () => {
  assert.equal(statusLabel("returned for information"), "Returned");
  assert.equal(statusLabel("approved — finance processing"), "Finance Processing");
  assert.equal(statusLabel("ewt_pending"), "EWT Pending");
  assert.equal(statusLabel(null), "");
});
test("mentions escape HTML and highlight only known names with valid boundaries", () => {
  const participants = [{ display_name: "Mara Reyes" }, { display_name: "Mara" }];
  assert.equal(conversationMessage("<script>@Mara Reyes!</script>", participants), '&lt;script&gt;<span class="conversation-mention">@Mara Reyes</span>!&lt;/script&gt;');
  for (const text of ["user@Mara", "@@Mara", "@Marathon", "ñ@Mara", "@Mara_1"]) assert.equal(conversationMessage(text, participants), text);
  assert.equal(conversationMessage("@Unknown", participants), "@Unknown");
});
for (const status of [401, 403, 409, 422]) test(`API preserves HTTP ${status} errors and details`, async () => {
  const request = createApiRequest("/test", async () => new Response(JSON.stringify({ detail: "Synthetic error" }), { status }));
  await assert.rejects(request("/save"), error => error.status === status && error.details === "Synthetic error");
});
test("API formats field validation errors", async () => {
  const request = createApiRequest("", async () => new Response(JSON.stringify({ detail: [{ loc: ["body", "name"], msg: "Required" }] }), { status: 422 }));
  await assert.rejects(request("/save"), /body.name: Required/);
});
test("API reports network, non-JSON failure and malformed success without false success", async () => {
  await assert.rejects(createApiRequest("", async () => { throw new Error("offline"); })("/save"), /Unable to reach/);
  await assert.rejects(createApiRequest("", async () => new Response("bad gateway", { status: 502 }))("/save"), /temporarily unavailable/);
  await assert.rejects(createApiRequest("", async () => new Response("broken", { status: 200 }))("/save"), /unreadable response/);
});
test("API keeps CSRF credentials and supports successful no-content responses", async () => {
  let received;
  const request = createApiRequest("/api", async (url, options) => { received = { url, ...options }; return new Response(null, { status: 204 }); });
  assert.equal(await request("/save", { method: "DELETE", headers: { "X-CSRF-Token": "synthetic" } }), null);
  assert.equal(received.url, "/api/save");
  assert.equal(received.credentials, "include");
  assert.equal(received.headers["X-CSRF-Token"], "synthetic");
});
