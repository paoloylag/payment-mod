import test from "node:test";
import assert from "node:assert/strict";
import { documentSelectionError, documentUploadError, requestLineAttachmentRefs } from "../src/document-upload.js";

test("document selection rejects unsupported, empty and mismatched files with a named recovery", () => {
  const unsupported = documentSelectionError({name: "supplier.heic", type: "image/heic", size: 25});
  assert.match(unsupported, /supplier.heic/); assert.match(unsupported, /PDF/);
  assert.match(documentSelectionError({name: "empty.pdf", type: "application/pdf", size: 0}), /empty.pdf.*empty/);
  assert.match(documentSelectionError({name: "invoice.pdf", type: "text/plain", size: 20}), /does not match/);
  assert.equal(documentSelectionError({name: "INVOICE.PDF", type: "application/pdf", size: 20}), "");
  assert.equal(documentSelectionError({name: "invoice.pdf", type: "", size: 20}), "");
});
test("upload errors identify the file without duplicating an existing server filename", () => {
  assert.equal(documentUploadError({name:"bill.pdf"},new Error("Connection failed")), "“bill.pdf”: Connection failed");
  assert.equal(documentUploadError({name:"bill.pdf"},new Error("File bill.pdf is empty")), "File bill.pdf is empty");
});

test("request line references retain reimbursement proof and legacy attachment formats", () => {
  assert.deepEqual(requestLineAttachmentRefs({"Proof of Payment": ["paid.pdf"]}), ["paid.pdf"]);
  assert.deepEqual(requestLineAttachmentRefs({Attachment: [], "Proof of Payment": " paid.pdf "}), ["paid.pdf"]);
  assert.deepEqual(requestLineAttachmentRefs({Attachment:["invoice.pdf"], Receipt:["receipt.pdf"], "Proof of Payment":["invoice.pdf","paid.pdf"]}), ["invoice.pdf","receipt.pdf","paid.pdf"]);
  assert.deepEqual(requestLineAttachmentRefs({Attachment:[null,"",{}]}), []);
});
