# Workflow and integration audit — 2026-11-12

## Scope and evidence

Checkout: `C:/Users/Paolo Ylag/Documents/ChatGPT/LifeOS/Payment Module/.worktrees/backend-integration/Back End`; Git root is its parent. Branch `staging`, revision `83fbca3`. Existing uncommitted UI changes in `index.html`, `src/boilerplate-shell.css`, and `src/prototype.js` were inspected and preserved. This agent made no application or database changes.

This is a source/data-flow audit, not a browser pass. The UI and QA agents own actual browser coverage and the automated suites. No tests were executed by this agent; no credentials or secret environment files were read. Normal preview is http://127.0.0.1:5176; API is http://127.0.0.1:58002. Browser state was not changed.

## Findings needing focused reproduction

### WI-01 — General request department silently defaults to Marketing

Priority: high. Source-inferred runtime defect; not reproduced with a non-Marketing fixture by this agent.

Role/scenario: a Requestor outside Marketing creates General Payment. Route: `#/requests` → General (`#/requests/new/general`) → save/submit.

Evidence: General `mandatoryFields` is empty (`src/prototype.js:126`). General automatic coding makes line cost center follow the request department. `apiDraftPayload` (`src/prototype.js:3263`) resolves an explicit department field, then PO department, then FIN only for the Finance Associate persona, otherwise MKTG, then the first cost center. It does not resolve the authenticated requestor department. General has no primary Department field to supply the explicit choice.

Impact: a request may be charged and routed to a different department/head without a visible choice. This is particularly consequential now that Department Head approval is mapped to cost center.

Recommended change: derive the initial center from authenticated department or require an explicit valid department/cost center; show the resolved center before submission. Block missing/ambiguous routing instead of falling back to another department. Test two Requestors in different departments with different mapped approvers, including missing mapping.

### WI-02 — Editable non-General account choice can be overwritten

Priority: medium. Source-confirmed mismatch under active all-request-type configuration; browser reproduction pending.

Role/scenario: Requestor selects an Expense Account on Reimbursement or PO Payment, saves and reopens the request.

Evidence: Reimbursement and PO line schemas expose `Expense Account`, and `apiLineToPrototype` loads its saved ID (`src/prototype.js:1420`). `finance_configuration.apply_payload` (`api/payment_module/finance_configuration.py:138`) preserves an incoming line account only for General; other types always receive configured debit. `apply_submission` at line156 repeats this override. All line cost centers are also replaced by the configured department center.

Impact: a choice presented as editable can be lost without explanation, and costing may differ from the form shown before saving. Cash Advance intentionally using an advance account is not itself a defect.

Recommended change: agree which types permit selection. For fixed coding, render the assigned account/cost center read-only and explain assignment. For selectable types, preserve allowed selections server-side and snapshot the selected account. Test save/reopen/submit with a non-default account and center while all-type configuration is active.

### WI-03 — Removing a line does not remap attachment error state

Priority: medium. Source-inferred edge-case defect; browser reproduction pending.

Role/scenario: add multiple items, fail attachment upload on a later line, delete an earlier line, then retry/save.

Evidence: `removeDraftLineItem` (`src/prototype.js:1394`) reindexes `draftUploadBuffers` and `draftFileRemovals`. It does not reindex/remove `draftUploadFailures` or `draftSelectionErrors`, introduced at lines27–28. Error lookup uses scope plus line index (`src/prototype.js:1710`), while automatic save at line1758 stops for any remaining upload failure in the scope.

Impact: an error can disappear from the affected line or attach to the wrong line; an obsolete failure may continue preventing automatic saving after removal/retry.

Recommended change: use stable line IDs for all upload state, or remap every per-line map atomically on removal. Test failure on item2 → delete item1 → retry surviving item, and failure on item2 → remove item2 → edit/save item1.

## UX recommendations requiring a policy choice

### WI-04 — Expense Account selector exposes all posting account categories

Source-confirmed selector behavior, not a confirmed accounting-policy defect. General filters active/posting accounts, without expense classification (`src/prototype.js`, line field renderer near3550). Root's browser inspection separately observed liability, VAT/payable and advance accounts in this dropdown.

Recommendation: Finance should designate requestor-selectable accounts rather than showing the full posting chart. If non-expense posting is legitimate, use an accurate field label and category grouping. Server-side validation should enforce the same allowlist. Do not apply an expense-only filter without confirming required special cases.

### WI-05 — Long conversation fetches are unbounded

Source-inferred scalability risk, not reproduced performance failure. `GET /requests/{id}/conversation` reads all messages, information exchange events and mention notification rows, then sorts; UI reverses the complete array to newest first (`api/payment_module/routers/conversation.py`, `src/prototype.js:2706`).

Recommendation: add newest-first cursor pagination with a Load older messages control while preserving the fixed composer and highlight/deep-link target. Test long messages, hundreds of messages and a notification linking to an older message.

## T11 source review matrix

All browser results below are **Not run by this agent**. Source review cannot establish visual spacing, touch usability, scrolling or successful click-through writes.

| Unit | Scenario / role | Source result and evidence | Browser status |
|---|---|---|---|
| T11.1 | Future executive/Board excluded before their stage | Guards present: conversation `participant` and candidates use `reached_stages`; Department Head additionally uses mapped department participation (`routers/conversation.py:39,98`) | Not run |
| T11.2 | Participant posts, tags valid user, retries submission | Guards present: message length, whitespace, self/duplicate mention checks, literal @display_name, participant subset, idempotency and conflict handling (`routers/conversation.py`) | Not run |
| T11.3 | Tagged user sees highlight/newest-first | UI implements `is-mentioned`, Mentioned You badge, reverse chronological display (`prototype.js:2706`); visual/deep-link behavior needs browser verification | Not run |
| T11.4 | Inbox ownership/read/unread and hidden requests | Guards present: own recipient plus `visible_query` checked on read/unread; merged paginated inbox (`routers/notifications.py`) | Not run |
| T11.5 | Tracker separates request and payment progress | Separate helper mappings present, includes returned/declined/recovery/partial-release and Petty Cash Not Applicable (`src/tracker-status.js`); not a payment reconciliation substitute | Not run |
| T11.6 | Finance reconciliation roles and filters | Finance role + vouchers.read required; visibility query applied; date range/bucket validation and read-only repeatable snapshot (`routers/financial_reports.py:77`) | Not run |
| T11.7 | Vendor administration versus procurement sources | `vendors.read`/`vendors.manage` enforced; mutation of Procurement vendor rejected with403 (`routers/master_data.py:479,591,621,677`) | Not run |
| T11.8 | General requestor coding versus other type coding | WI-01, WI-02 and WI-04 require focused acceptance/reproduction | Not run |
| T11.9 | Attachment error recovery after line removal | WI-03 source risk requires edge-case reproduction | Not run |

## Six-type consistency handoff

| Request type | Code/data-flow focus | Acceptance follow-up |
|---|---|---|
| General | Request-level vendor inherited by lines; chosen account preserved; no primary department control | WI-01/WI-04; verify new vendor pending validation and snapshot survives return/edit |
| Reimbursement | Per-line proof and physical-original requirement; editable account/department fields | WI-02; save/reopen account and center with active configuration |
| Cash Advance | Configured advance account; event/end/liquidation dates | UI agent independently reproduced stale July25/Aug9 dates in a fresh form on Nov12; consolidate its browser finding rather than counting twice |
| Liquidation | Linked advance and excess-only payable amount | Check original advance/date defaults, verified full return versus outstanding balance; QA owns financial transitions |
| PO Payment | Procurement-derived vendor/department/amount; local adapter in demo | WI-02 and explicit unknown/missing PO department behavior; live connection is known pending integration |
| Petty Cash | PHP-only below3000; Department Head → Finance Associate final approval; FA voucher at full amount | Voucher access and no Finance Manager dependency; payment status Not Applicable matches confirmed no separate payment flow |

## Limitations and next handoff

Do not count source guards as executed security tests. Ask QA to execute WI-01 through WI-03 in its isolated fixture; UI agent should validate account labels/categories, long message overflow, notification deep links and empty/loading/error states. This audit deliberately avoided mutating demo data or interfering with the shared browser.

Existing pending Signatory work, email delivery setup, live Procurement/ERP integrations and AWS deployment remain known limitations and were not reported as newly discovered regressions. No new policy was assumed for selectable expense categories or cross-department charging. Root coordinates fixes and the combined acceptance verdict.

## Follow-up WI-06 — Reimbursement cannot distinguish invoice from proof

Priority: medium; source-confirmed control/type mismatch, with configuration-dependent blocking risk. Actual configured database rules were not queried and no submission failure was reproduced by this agent.

The form guidance says to add invoice/receipt and proof per line (`src/prototype.js:3571`), but its sole typed per-line upload column is Proof of Payment. `persistDraft.typeFor` (`src/prototype.js:3342`) assigns every file in that slot to `PROOF_PAYMENT`, regardless of filename or contents. Request-level Other Supporting Document receives no typed invoice mapping. The API stores the supplied type; requirement checks compare document_type_id exactly (`routers/requests.py:655`), with no invoice/proof alias.

Default seed is deliberately non-blocking for separate invoices: only reimbursement per-line PROOF_PAYMENT is required (`api/payment_module/seed.py:221`), and legacy request-level INVOICE/BILLING_SOA requirements are deactivated (`seed.py:964`). Therefore missing a distinct invoice slot is not evidence that default reimbursement submission fails. However, Finance can configure a required INVOICE rule and the current standard request form cannot satisfy its type requirement, even when an actual invoice was uploaded in the proof slot. Reviewers also cannot distinguish invoice acceptance from payment-proof acceptance by document category.

Recommendation: supply separate per-line Invoice / Receipt and Proof of Payment controls, or an accessible document-type selector per file. Align configurable rules and form controls; preserve existing documents and category history. Acceptance: submit under default rules, configure a required line invoice rule, upload correctly categorized files and submit, then return/edit/reupload and confirm classification remains correct. Consolidate with UI agent's observed upload-control finding rather than count it twice.


## Follow-up WI-07 — Budget flag leaks into a different new request

UI agent reproduced opening an unbudgeted General draft → Back → Cash Advance → Liquidation, with Liquidation route guidance changing from Finance Manager to COO despite no visible Liquidation budget toggle. This agent corroborated the state transition in source: new-type handler `src/prototype.js:4969` resets lines, activeDraftId, field/document buffers and dirtiness, but spreads existing state without resetting `budgeted`. Draft capture at1775 and API type_data3277 persist that value. The observed route-guidance change is browser-confirmed by the UI agent; an incorrect actual submitted server approval route was not demonstrated.

Recommendation: initialize all request-specific state through one fresh-draft factory, including budgeted, currencies/dates, upload errors and any selected PO, rather than spreading a previous request's state. Test switching types after editing existing drafts with opposite budget values and verify persisted payloads and approval routes.

## T11 actual browser supplement

Read-only click-through on Chrome audit tab1922976769, origin http://127.0.0.1:5176, authenticated Requestor Mara Reyes. Viewport and theme were not changed; no role switch, posting, notification read-state action, request mutation or database write was performed. This supersedes only the listed narrow browser portions of the earlier source matrix; security guards, report Finance roles and admin operations remain source-only for this agent.

| Unit | Executed action | Observed result |
|---|---|---|
| T11.10 Tracker navigation/sort | Click My Request Tracker, click Request column header | Pass: loaded32requests; sort changed to Request/Ascending and visible order changed to GEN-2026-920001,920002,920003,930001… |
| T11.11 Tracker search/reset | Search930003, Apply; Reset | Pass:1of32 with GEN-2026-930003, then32of32 with default Submitted/Descending restored |
| T11.12 Inbox open/close | Click bell and close button | Pass:7unread; cards and separate read buttons visible; compact header and spaced cards visually inspected. Did not mark notifications or open their links because those actions change read state |
| T11.13 Conversation collapse/reopen | Dashboard View Request for GEN-2026-930003; collapse rightpanel then reopen | Pass: panel changed to Open request conversation tab then restored composer; request remains displayed |
| T11.14 Mention highlight and order | Open PR-2026-900018 detail using observed request route; inspect populated conversation | Pass: newest Nina Santos Oct30 2:21PM above2:19PM, olderOct9messages below; Mara-targeted message has crimson bordered/tinted card, Mentioned You badge and crimson tagged name |
| T11.15 Fixed composer/scroll | Scroll inside PR-2026-900018 message list | Pass at desktop: older messages scroll into view while Add a message textarea, Post Message and panel header stay in place; surrounding request remained fixed |
| T11.16 Mention keyboard selection/remove | Type @, ArrowDown, Enter; remove Elena Cruz mention | Pass:3current participants (Finance Manager, mapped Department Head, Finance Associate), selected @Elena Cruz inserted with removable tag then removed; no message posted |

No new defect was reproduced in these narrow controls. Notification deep-link/read-state writes, empty-submit validation, posting retries, more-than3candidate scrolling, mobile layout, report exports and admin/vendor CRUD are not counted as browser-tested here. Financial lifecycle and isolated writes remain QA-agent ownership. Browser screenshots were visually inspected in tool output; this agent did not save standalone screenshot files.
