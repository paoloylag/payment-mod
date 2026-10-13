# Voucher lifecycle and payment authorization validation

Date: 2026-10-13 (Asia/Manila)
Branch: `codex/phase06-voucher-lifecycle`
Dependency: `codex/phase06-accounting-workbench`, commit `09e63d9`
Status: Implemented and verified locally; Finance business acceptance remains open.

## Scope and roles

General requests only. Finance Associate prepares accounting, the voucher draft and a full-amount payment instruction. Finance Manager posts accounting, issues/certifies the voucher, and voids/reverses it. One explicitly assigned Authorized Signatory authorizes the recorded instruction. Payment release remains pending.

## Browser click path

1. Finance Associate opens a General request, saves its EWT calculation, prepares balanced accounting, then corrects an expense account with a reason. Verify the failed-save retry retains the selection/reason and keyboard submission succeeds.
2. Complete Department Head → Finance Associate → Finance Manager final approval. Confirm posting is unavailable before final approval, then Finance Manager posts the balanced draft.
3. Finance Associate prepares the voucher draft. Finance Manager issues and certifies it using the configured prefix, numbering period and certification text. Verify issuance error/retry retains the reason and generates one number.
4. Confirm the Signatory Approval Queue is empty before assignment. Finance Associate selects Bank Transfer/DigiBanker, records a reference and assigns Sofia Bautista. Verify the assigned request appears in the signatory queue and its voucher/instruction is visible.
5. Authorized Signatory reviews and authorizes with a reason. Reload to confirm the decision persists and authorization is unavailable a second time. Amount remains PHP 2,200 from the PHP 2,240 request, PHP 240 VAT and PHP 40 EWT.
6. Print / Save PDF renders the persisted issued voucher, accounting entries, certification, approval trail and current authorization history. A4 output was exported and both pages visually inspected. Every page carries the voucher/request reference and page count. The voided print label and invalidated authorization are verified separately.
7. Finance Manager voids with a reason. Verify a balancing reversal exists, the original posting/voucher/authorization remains intact, the signatory cannot authorize the voided instruction, and print output identifies the voucher as voided.

## Evidence

- Visible Chrome workflow: `tests/e2e/finance-accounting.spec.js` and `voucher-lifecycle-flow.js`; passed.
- Responsive checks: 390, 768 and 1280 pixels; no page overflow, shared selects retain 42px height, inputs fit the viewport, keyboard submission and retry behavior pass.
- Screenshots: `outputs/phase07-authorization-mobile.png`, `outputs/phase06-voucher-print.png`, `outputs/phase06-accounting-mobile.png`.
- A4 verification: actual print template exported with Chrome, rendered with Poppler and text checked with pdfplumber. Two pages; financial totals, certification, authorization, references and page numbers present. PDF/PNG files under `tmp/pdfs` are disposable test evidence.
- Full backend regression: 178 passed before the final two edge-case tests and reopen guard. Final voucher/request checks: 46 passed; final lifecycle checks: 4 passed.
- Existing Chrome regressions: six passed for stage-based request/conversation visibility, Finance activation, EWT, all request-type return/resubmit/cancel/reopen, executive information/mentions, and foreign-currency routing.
- Lint, frontend production build and migration 0024 rollback/replay passed. Downgrade refuses to discard existing reversals.
- CI branch filter now covers `codex/**`, allowing independent branch pushes to run the same build/test/package checks. No deployment step was added.

## Protected invariants

- Commands require current request/voucher/settings versions, a nonblank reason and an idempotency key. Repeated keys return their original result; changed payloads are rejected.
- Request locks serialize issuance, preparation, authorization and reversal. A shared Finance configuration lock prevents issuing against settings being changed concurrently. Number allocation is transactional; issued numbers and method/reference pairs are unique.
- Explicit permission denials apply. Requestors/preparers/posters/certifiers cannot be assigned to authorize their own payment. Inactive methods/signatories and stale sources block new actions.
- The assigned signatory gains request, document, approval and conversation visibility only after instruction preparation. Other signatories are excluded. Original snapshot names, rates, accounting entries, certification and decisions are retained.
- Reversal swaps each original debit and credit exactly and cannot occur twice. A voided request may be cancelled but cannot reopen/repost its old accounting; a replacement requires a new request.

## Remaining work

Other request-type applicability, formal predecessor/replacement links, amount-based multi-signatory rules, partial/multiple payment attempts, processing/release, pickup/clearing, settlement reconciliation, production voucher format acceptance and later notifications/reporting remain separate development items. This increment records authorization without external bank execution.
