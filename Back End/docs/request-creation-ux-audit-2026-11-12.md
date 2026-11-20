# Request creation UX audit — 12 November 2026

## Checkout and scope

Actual Git root: `C:/Users/Paolo Ylag/Documents/ChatGPT/LifeOS/Payment Module/.worktrees/backend-integration`; application directory `Back End`, branch `staging`, baseline commit `83fbca3`. Audited the running working tree with pre-existing edits in `index.html`, `src/boilerplate-shell.css`, and `src/prototype.js`. No application code was edited by this audit.

Used actual CUA browser clicks on `http://127.0.0.1:5176`, normal local API port 58002, Requestor demo session (Mara Reyes). Started at login, selected Requestor and signed in; did not switch roles, reset data, or submit requests. Created two fictional draft scenarios: Petty Cash particulars `UX AUDIT fictional stationery` amount250, and General supplier `UX AUDIT fictional vendor` / `ux-audit@example.com`, particulars `UX AUDIT vendor test only`, amount125. Existing drafts were not edited or deleted. No payment, approval, email, or external integration actions were performed.

Read applicable AGENTS.md, life-ui-fix, life-mobile-responsive, life-testing. Current shared app UI is the design baseline; native selects, cards, file buttons, accordion controls and responsive actions were inspected. No new boilerplate component is proposed; findings below can be addressed using current primitives.

## Browser test units

These are manual UI units, not automated test counts. **26 units: 18 Pass, 5 Fail, 3 Not run.** Pass applies only to the described interaction, not full workflow or persistence.

| Unit | Action actually exercised | Result | Evidence / limit |
|---|---|---|---|
| T01.a General | Request type card opens form; fields and default account inspected | Pass | `audit-create-20261112-vendor.png`; 6100 Office Supplies preselected |
| T01.b General | Add another item then Remove item | Pass | Two accordions appear, original125 and particulars restored to inline single form; new item inherits vendor |
| T01.c General | Inspect department selection and accordion summary | Fail | No request department selector; readonly line says automatically follows request department while accordion says Choose a cost center |
| T01.d General | Explicit mobile Actions → Save as Draft | Pass | Success toast and Draft saved state; **not proof of server reload persistence** |
| T02.a Reimbursement | Click type card, inspect new fields and document guidance | Fail | Invoice/receipt required guidance and validation, but line offers only Proof of Payment upload |
| T02.b Reimbursement | Add another item then Remove item | Pass | Two accordions then inline single form, no controls lost |
| T03.a Cash Advance | Click fresh type card; inspect actual date values | Fail | Actual July25/Aug9 dates prefilled in November and both marked valid |
| T03.b Cash Advance | Add another item then Remove item | Pass | Two accordions then inline particulars/amount restored |
| T04.a Liquidation | Click fresh type card; inspect actual date values | Fail | Actual July31/July30 dates prefilled in November and both marked valid |
| T04.b Liquidation | Add another item then Remove item | Pass | Two accordions then inline form restored |
| T05.a PO Payment | Click type card, inspect generated PO fields | Fail | First sample PO selected automatically with89000 top amount, while duplicate editable PO/supplier/amount line fields blank |
| T05.b PO Payment | Add another item then Remove item | Pass | Two accordions then inline single form restored |
| T06.a Petty Cash | Click type card and inspect PHP-only controls / route copy | Pass | PHP only, below3000 and FA voucher rule visible |
| T06.b Petty Cash | Enter particulars and250, Add another item then Remove item | Pass | Original particular and250 survive; total250 |
| T10.a Vendor | Add new vendor modal opens with three required document sections | Pass | Supplier identity/contact fields, BIR2303, registration, permit visible |
| T10.b Vendor | Save fictional name/email with missing documents | Pass | Card displays name/email,0/3 attached and Missing statuses, edit button and completion guidance; does not claim validation |
| T10.c Vendor | Edit vendor on375px, press Escape | Pass | Modal closes, focus returns to Edit vendor |
| T12.a Responsive | General at375×812 light | Pass | Single-column fields and supplier document cards visible; native text in readonly long field visually truncates but no page-breaking horizontal overflow seen |
| T12.b Responsive | General Actions at375px | Pass | Opens Save as Draft and Submit; saved using Save as Draft |
| T12.c Responsive | General at768×1024 light | Pass | Two-column fields, validation/upload section below; action buttons visible |
| T12.d Responsive | General at1440×900 dark | Pass | Fields/buttons/card readable, no observed overlapping controls |
| T12.e Responsive | Temporary viewport/theme reset | Pass | Returned to default viewport and light theme before handoff |
| T12.f Upload error | Unsupported file, server rejection and replace/remove | Not run | No file uploaded in this child audit; do not infer pass from source or previous agent claims |
| T12.g Persistence | Save→reopen fictional draft and verify all values | Not run | Draft list lacks descriptive title; opened top existing draft read-only then left; could not confidently identify fictional draft row |
| T12.h Device | Physical phone/iPad keyboard, Safari, touch and focus trap cycle | Not run | Viewport testing is not physical device testing |
| T12.i Navigation | Back to Request Types after untouched new forms | Pass | Navigated through all six types through visible cards/back controls |

All screenshots are under `outputs/` in the application directory and were captured through the browser. Representative viewport screenshots were visually inspected during capture; full-page files provide additional context.

## Findings and recommended changes

### P1 — stale actual dates in new Cash Advance and Liquidation (T03.a, T04.a)

Reproduce: New Request → Cash Advance. On12November2026 Last Day of Event is2026-07-25 and Date to Liquidate2026-08-09, with green validation. New Liquidation shows Date to Be Liquidated2026-07-31 and Actual Date2026-07-30 before selecting an advance. These are populated date values, not grey examples/placeholders.

Expected: event date blank until user supplies it; generated liquidation date derives from that selection/configuration. Liquidation due date should derive from chosen advance; actual liquidation date should be consciously entered or default to today. Avoid silently carrying old demo dates into operational requests. Preserve dates on existing drafts.

Evidence: `audit-create-20261112-cashadvance.png`, `audit-create-20261112-liquidation.png`.

### P1 — General department/cost-center guidance is a dead end (T01.c)

Reproduce: General form, add another item. Accordion shows Choose a cost center, but expanded field is readonly Automatically follows the request department. General has no visible request department selector. Requestor cannot act on the instruction; the current department's actual name/code is not shown in the field. Parent feature audit is investigating routing correctness separately; this report does not claim backend routing failure.

Expected: show the actual inherited department name, explain source concisely, and use it in accordion summaries; if users must choose request cost center expose the selector once at request level. Keep server routing authoritative.

Evidence: `audit-create-20261112-general375.png`, `audit-create-20261112-general1440dark.png`; AX observations of two-item headers.

### P1/P2 — Reimbursement invoice versus proof upload mismatch (T02.a)

Guidance explicitly asks corresponding invoice or receipt and proof of payment in each line. Validation asks BIR-Recognized Invoice(s)/Official Receipt(s). Actual line controls show Merchant, Invoice Date/Number, Particulars, Account/Department/Amount and only a Proof of Payment upload. Other Supporting Document is request-level. No separate invoice/receipt upload appears in either single or expanded second line.

Recommendation: provide distinct invoice/receipt and proof upload sections with file count and requirement state. If one multi-file control is intentionally meant to cover both, name it accordingly and classify documents explicitly so reviewers can distinguish evidence. Root/source agent is confirming backend requirement mapping before declaring submission blocker.

Evidence: `audit-create-20261112-reimbursement.png`; actual single/multiple AX state. Source corroboration: `src/prototype.js` around1474,3281–3282 maps only reimbursement proof_of_payment per line; line guidance around3571.

### P2 — PO generated values and blank duplicate line fields (T05.a)

A fresh PO form immediately selects PO-DEMO-1001 / Sample BrightTech Supply and shows system-generated89000, ACAD and Approved. Below it the single item asks editable Purchase Order Number, Supplier and Amount with blank actual values. A user cannot tell whether top amount or entered line total controls the request. This finding concerns local UI clarity; unavailable live procurement integration is excluded and is not a new bug.

Recommendation: start with Choose a PO; after selection populate/lock inherited PO/supplier details, display line allocation and remaining balance, and state whether amounts must reconcile to the PO. Reuse the General vendor inheritance pattern rather than duplicate identity entry.

Evidence: `audit-create-20261112-popayment.png`.

### P2 — requestor Expense Account choices include liabilities and tax/advance control accounts

Observed in General, Reimbursement, Liquidation and PO dropdowns: Accounts Payable, EWT Payable, Demo control accounts, Employee Cash Advances and Input VAT are offered alongside expense accounts. Label Expense Account does not communicate why these are valid requestor choices. This is a recommendation requiring Finance's allowed-account policy, not a claim that every non-expense account is invalid in all accounting situations.

Recommendation: Finance controls a requestor-selectable allowlist or eligible posting categories; keep broader override choices in Finance workbench. Clearly distinguish demo records from usable Finance configuration.

### P2 — existing zero-line draft opens without basic item inputs

Read-only opened DRAFT-B41DE5E4 through My Drafts → first Actions → Continue Editing. Form has zero amount, no inline Vendor/Particulars/Account/Amount inputs, only Add another item. No edits were made. New forms do start with one item.

Recommendation: normalize a zero-line draft to one blank integrated item on render/load. Do not delete or silently invent transaction amounts.

### P2 — possible budgeted-state leakage into route guidance (needs source confirmation)

Initial Liquidation form showed normal Finance Manager route. After opening existing unbudgeted General draft DRAFT-B41DE5E4 read-only, Back to Request Types → Cash Advance → Back → new Liquidation, Liquidation displayed COO approval required for unbudgeted payments up to PHP1,000,000. Liquidation has no Unbudgeted checkbox. Actual route persistence/submission was not tested; this is an observed route-preview inconsistency, not a demonstrated authorization bypass.

Recommendation: initialize route-relevant state from each new request type/draft consistently, and ensure preview uses the same policy inputs as server. Evidence `audit-create-20261112-liquidation-route.png`.

### P3 — draft recovery lacks an identifying subject

My Drafts shows generated draft code, type, date, amount and status. Multiple same-type0-value drafts are difficult to distinguish, including a partially entered vendor. Audit could not confidently select its fictional General draft from this UI without risking user drafts.

Recommendation: add short purpose/vendor/particulars preview and search; retain generated ID as secondary reference. Reopen verification remains Not run here.

### P3 — concise validation preview can be more actionable

General preview only says Complete Request Breakdown Row(s), hiding the missing actual department/vendor/particulars reasons. In Petty Cash, adding a blank second row still left Complete Request Breakdown Row(s) green because first row was populated; whether blank rows are ignored is not communicated. Suggest jump buttons to the exact missing field and clear exclusion of unused blank rows. Do not expand guidance into long paragraphs.

## Positive observations

All six request cards opened correctly. Single-item integration and Add/Remove transitions worked in every type. General and Petty Cash retained original entered values across transitions. General vendor inheritance is read-only and new-vendor pending validation is explicit. Supplier summary has clear Missing labels, compact cards, Edit and Choose existing actions. Unbudgeted is restored below Vendor. Mobile actions remain accessible through an Actions button.375px modal scrolls within viewport, Escape dismisses and returns focus to opener. Desktop dark theme uses readable current design tokens.

## Limitations and handoff

No app fixes, commits or pushes. Only this report is authored; screenshots are ignored outputs. No end-to-end submission, approval, successful attachment, attachment-error recovery, accounting persistence, physical device, screen reader or full keyboard trap test is claimed. All-type responsiveness is not certified: General is representative at375/768/1440; the other five received desktop visual checks. Finance acceptance/configuration was not modified. Parent QA and feature agents cover server mapping, business flow and remaining routes.

Next: confirm invoice mapping and route state with feature agent, fix the P1 items, then rerun the linked units plus explicit save/reopen and real file-error cases. Reuse existing shared controls; no confirmed missing boilerplate pattern requires a new shared component.
