# APS boilerplate parity audit — 12 November 2026

## Outcome and checkout

Completed a broad browser sweep of the safely reachable APS screens. This is a **visual audit, not functional acceptance or an assertion that every state passed**. No UI code was changed. No approvals, configuration saves, payment actions, messages, user creation, or file uploads were submitted. Role switching used the isolated review environment only.

Actual Git root: `C:/Users/Paolo Ylag/Documents/ChatGPT/LifeOS/Payment Module/.worktrees/backend-integration`; application: `Back End`; branch: `staging`; baseline commit: `83fbca3` plus current uncommitted Finance UI/date-helper changes. All concurrent edits were preserved. Browser: Chrome, isolated `http://localhost:5179` / API58004. Normal `127.0.0.1:5176` and its database were not used in this sweep. No global agent roles or agent configuration were changed.

Read actual `AGENTS.md`, life-ui-fix, life-mobile-responsive and life-testing. Compared actual tenant boilerplate source, not another APS screen alone. Root owns the durable AGENTS/testing workflow changes.

## Design baseline and intentional variants

Baseline directory: `C:/Users/Paolo Ylag/Documents/ChatGPT/LifeOS/lifeos-tenant-boilerplate`.

- `src/App.tsx:1266` UI Lab tabs and `:1274` accordion examples are labelled **Baseline**, not fully themed.
- `src/styles.css:628` `.panel-header`: divider,16px bottom spacing,15px heading.
- `:1193` `.button-row` / `.badge-row`: flex, wrap,10px gap.
- `:1640` `.status-badge`: inline-flex, width:max-content, compact pill, semantic variants.
- `:2374` `.lab-dialog`, `:2395` `.lab-dialog-surface`, `:2408` sticky-modal surface/header/body/footer: contained scroll and persistent actions.
- `:2419` `.document-preview-*`: document header, toolbar, scrollable canvas and paper.
- `:2698` `.lab-tabs`: transparent tabs with selected underline; `:2748` `.lab-accordion`: divider-only disclosure with bold summary.

**Preserve user-approved APS variants:** rounded tinted Finance tabs and bold crimson bordered accordion headers. APS `src/boilerplate-shell.css:2685–2722` intentionally differs from the basic UI Lab examples. This is an app-only visual variant over implemented base patterns, not a missing component or a defect to revert. Current voucher preview Print button and icon Close are also intentional. Domain calculations, routing, permissions and evidence rules remain app-owned.

## Browser coverage matrix

48 manual units: 23 Pass, 19 Fail, 1 Blocked, 5 Not run. Fail counts screen/state rows affected by findings, not 19 independent defects.

Each row is a manual screen/state unit. **Pass** means the described rendering or interaction was inspected without a material parity finding; it does not certify writes, backend correctness or every responsive state. **Fail** includes the linked UI finding. No source-only read is counted as a browser pass.

| Unit | Screen / state actually visited | Role | Result |
|---|---|---|---|
| BP01 | Login initial, role selection, busy and successful sign-in | FM, FA, Admin, Requestor, DH, COO, President, Board | Pass |
| BP02 | Dashboard cards, list, filters, request preview | FM and other signed-in roles | Pass |
| BP03 | Request Summary expanded; all four Finance tabs | FM, PR-2026-000002 | Pass |
| BP04 | Tax calculation, EWT history and account assignments expanded | FM | Fail — F01 |
| BP05 | Accounting entries, preparation details and history expanded | FM | Pass |
| BP06 | Released payment; clearing form, evidence, payment history and nested release event, voucher history expanded | FM | Fail — F02 |
| BP07 | View Voucher dialog; Print button, Close, Escape and focus return | FM | Pass; actual printing excluded |
| BP08 | Approval & History tab with full map, progress and activity | FM | Pass for rendering; route legend recommendation below |
| BP09 | Cost Center approver list | FM | Pass; no assignments changed |
| BP10 | Chart of Accounts list and Add account dialog; focus and Escape | FM | Pass |
| BP11 | Tax Codes and Currencies normal lists | FM | Pass |
| BP12 | Payment Methods and Document Types lists | FM | Fail — F08 |
| BP13 | Request Requirements list | FM | Pass |
| BP14 | Request Settings full page and initial setup steps1–6 | FM | Fail — F03 |
| BP15 | APS and Procurement vendor lists; vendor detail dialog and Escape | FM | Fail — F04 |
| BP16 | Tracker loading to ready, Finance work queue, request tracker | FM | Pass for normal rendering |
| BP17 | Payment reconciliation generated with2 records; Cash Advance report with1 record | FM | Fail — F03 |
| BP18 | Fund returns and Payment recoveries generated, both empty | FM | Fail — F03 |
| BP19 | Approval Queue, list and preview | FM and FA | Pass |
| BP20 | Role-filtered System Guide | FM | Fail — F09 |
| BP21 | Validation workbench, line review dialog, tax edit disclosure, disabled Approve | FA, RMB-2026-900004 | Fail — F05, F06 |
| BP22 | User list and Add User dialog with role checkboxes | Admin | Pass for normal desktop rendering |
| BP23 | Roles & Permissions and Department lists | Admin | Pass for normal desktop rendering |
| BP24 | Roles and Departments at375px; Departments at768px | Admin | Fail — F07 |
| BP25 | Add User dialog at375px; Escape | Admin | Fail — F04; scroll works, footer not persistent |
| BP26 | Document Rules reference | Admin | Pass for normal rendering |
| BP27 | Email Samples reference | Admin | Pass for normal rendering; sample copy is not delivery verification |
| BP28 | Document Uploads workspace, requirement cards | Admin | Fail — F08 |
| BP29 | General form and Add vendor modal, dismissed without input | Requestor | Fail — F10; standard controls render |
| BP30 | Reimbursement form | Requestor | Pass for baseline form rendering; known document semantics excluded |
| BP31 | Cash Advance and Liquidation forms | Requestor | Pass for visual controls; stale dates still visible, tracked in earlier creation audit |
| BP32 | PO Payment and Petty Cash forms | Requestor | Pass for visual controls; known PO duplicate fields excluded |
| BP33 | My Drafts list | Requestor | Pass for normal rendering; identifying-title recommendation remains |
| BP34 | Notifications panel empty state | Requestor | Pass |
| BP35 | Dashboard, queue, detail, Reject modal with disabled confirmation, Escape | DH | Fail — F05; modal controls and focus render correctly |
| BP36 | Conversation panel with message headers and Mentioned You highlight | DH | Pass for normal rendering; F11 interaction observation below |
| BP37 | Dashboard, queue, detail, Request More Information modal and Escape | COO | Fail — F05; modal renders correctly |
| BP38 | Dashboard, queue and assigned detail | President | Fail — F05 |
| BP39 | Dashboard, queue and assigned detail | Board | Fail — F05 |
| BP40 | Board detail375px light and1440px dark | Board | Fail — F05; no observed page-breaking horizontal overflow |
| BP41 | Departments375px light/dark and768px dark; temporary display settings restored | Admin | Fail — F07 |
| BP42 | Unavailable prior-role request → error page → Return to dashboard | COO, President, Board | Pass for recovery; duplicate copy is optional cleanup |
| BP43 | Authorized Signatory-specific dashboard and authorization screen | Signatory | Blocked — no demo login option; guide identifies retired gate |
| BP44 | Payment preparation / failure / recovery / return entry and verification forms | FA / FM | Not run — eligible states require financial writes; empty reports were inspected |
| BP45 | All-type375/768 layouts, physical iPad/Safari and on-screen keyboard | All | Not run — representative viewport checks only |
| BP46 | Server errors, upload rejection, session expiry, conflict, busy write states | All | Not run — no business writes or service disruption in this audit |
| BP47 | Filled notification list, tag suggestions, unread/read mutations | All | Not run — no new messages or notification writes |
| BP48 | Every role-specific guide, nested accounting version detail, full keyboard trap cycles | All | Not run — representative shared implementation inspected only |

## Findings and recommendations

### F01 — P2: inconsistent history timestamps

FM → PR-2026-000002 → Tax & Withholding → EWT history shows raw `2026-11-12T17:41:10.784396+08:00`. Payment/voucher histories now show readable dates with PHT. APS `src/prototype.js:2858` directly prints `entry.created_at`; accounting history `src/finance-accounting-ui.js:28` has the same source-level risk, but its nested version date was not opened and is not a second browser-confirmed failure. Reuse APS humanDateTime and boilerplate `.activity-row small` metadata hierarchy. No new shared component is needed.

Evidence: [expanded tax screen](../outputs/parity-finance-expanded-light.png).

### F02 — P2: evidence actions retain default browser links

FM → Voucher & Payment → Supporting evidence shows blue underlined Open evidence inside themed cards. APS `src/payment-execution-ui.js:57` outputs an unstyled anchor. Use existing boilerplate link brand colors (`.lab-breadcrumbs a`) or secondary/document action styles; retain link semantics, target and accessible filename. Avoid inventing another button variant.

Evidence: [payment evidence and histories](../outputs/parity-payment-expanded.png).

### F03 — P2: button spacing and dense report/settings layout

Generate report / Export Excel / Print report touch; report pagination arrows and Page1of1 are crowded at the left, unlike the standard request table footer. Empty reports retain a wide multi-column horizontal scroller before the empty message. Settings includes long mapping paragraphs and duplicate setup entry points, with Previous/Next/Save controls abutting. APS `src/finance-reports-ui.js:11–12` uses `.metric-detail-actions` for these rows. Reuse boilerplate `.button-row`10px gap and the existing APS pagination/footer hierarchy. Give empty results a compact empty card before rendering irrelevant empty columns. Keep required monetary definitions available through the existing disclosure.

Evidence: [generated tracker report](../outputs/parity-tracker-results.png), [empty recovery report](../outputs/parity-recovery-empty.png), [settings](../outputs/parity-request-settings.png).

### F04 — P2: long modal bodies and directory actions

Add User, supplier creation and Vendor details scroll as a whole; the long forms place Save/Create and sometimes the close header beyond the visible area. At375px Add User presents a tall role list with no persistent footer. Vendor directory rows stack View/Edit/Deactivate/Delete into a tall action column; sibling reference lists use compact action menus. Boilerplate already has `.sticky-modal-surface`, `.sticky-modal-header`, `.sticky-modal-body`, `.sticky-modal-footer` at2408–2418. Adapt those existing patterns, group vendor fields, and use an accessible overflow menu for secondary/destructive row actions. This is app drift, not a missing modal component.

Evidence: [mobile Add User](../outputs/parity-user-modal375.png). Vendor directory/detail were visually inspected; no separate saved screenshot was produced for those states.

### F05 — P1/P2: stage-irrelevant validation competes with the current decision

Department Head and executive/Board detail screens show a large Finance Validation summary telling the viewer to review/complete Finance line acceptance and save a Finance calculation. The role cannot perform those tasks. Seeded summary says1 attached,0 missing while the side card says Billing/Proof is missing and detail says no uploaded documents. That may reflect incomplete sample metadata, so do not infer production data loss; the contradictory UI itself is visible. An unsaved tax calculation receives a green Not Saved pill, which suggests completion. Prioritize the current role's decision and present Finance review as read-only history/summary with accurate source-based counts. Use boilerplate `.status-badge.neutral` or `.warning`, not success styling for unsaved state. Do not weaken server approval gates.

Evidence: [Board detail](../outputs/parity-board-detail.png), [1440 dark detail](../outputs/parity-board1440dark.png), [reviewer conversation and checklist](../outputs/parity-reviewer-conversation.png). Relevant APS `src/prototype.js` `validationReadOnlySummary`, `financeValidationPanel` around3877; the status pill and checklist share current app presentation.

### F06 — P2: document receipt labels disagree

FA → RMB-2026-900004: sidebar says Line1 physical original received and page helper says physical original, but Review line modal uses approved wording Necessary documents received. Use one agreed label consistently in summary, helper, validation and modal while retaining the actual business requirement. This is copy/state presentation, not a new checkbox pattern. Boilerplate provides labelled checkboxes already.

Evidence: [line review modal](../outputs/parity-line-review-dialog.png). APS `src/prototype.js` Finance validation helper around3877.

### F07 — P2: status pills stretch across mobile/tablet rows

Roles and Department list pills span almost the full row at375px and768px, looking like progress bars. Boilerplate `.status-badge`1640 explicitly uses width:max-content. APS `.identity-list article` grid and `.status-pill` around674–681 lack corresponding intrinsic width/justification in stacked layout. Apply shared compact badge geometry across the affected lists; retain wrapping for long labels. Tested in both themes.

Evidence: [roles375](../outputs/parity-roles375.png), [departments375 dark](../outputs/parity-departments375dark.png), [departments768 dark](../outputs/parity-departments768dark.png).

### F08 — P3: raw labels remain on secondary screens

Document Uploads cards show `draft` and `returned` lowercase while other statuses use proper case. `src/prototype.js:4146` directly renders backendStatus. Payment Methods shows `bank_transfer`; Document Types shows `soft copy`/`both copy`. Reuse existing statusLabel/human labels and keep necessary codes as subdued metadata. Do not transform underlying stored values. Existing boilerplate field, badge and list patterns cover this.

Evidence: [Document Uploads](../outputs/parity-document-uploads.png). Settings lists were visually inspected without individual saved screenshots.

### F09 — P3: guide has a separate visual language and opens every procedure

Guide hero typography, pill-shaped Print button, spacious tinted sections and expanded-by-default procedures differ from normal APS cards/tabs/buttons. It is instructional content and may intentionally follow the guide template, so classify it as an app-specific design decision, not an automatic defect. Consider preserving the branded guide while collapsing procedures and reusing shared in-app action buttons. Boilerplate already has disclosure and button primitives. Role guide copies beyond FM were not separately inspected.

### F10 — P3: navigation-only review created an empty draft

Requestor had1 draft on entering creation. Opened General → Add vendor → Escape without entering values, then traversed other new forms; My Drafts later showed2, including a new0-value General draft. No explicit Save or Submit was clicked. The exact trigger could be new-form navigation or auto-save around modal mode changes; **modal causation is not proven**. Check meaningful-change detection before automatic draft creation. No additional reproduction or cleanup write was attempted. This affected only the isolated review database.

### F11 — P3: conversation visibility does not survive unrelated UI rendering

Opening the profile menu after conversation was open collapsed the conversation again; changing a Finance tab had also collapsed it. Observed on the same request without a collapse click. Consider persisting the chosen open/collapsed state through unrelated renders. This is a UI behavior observation needing a focused follow-up, not a proven permissions or message-loss issue. Boilerplate drawer exists; request conversation behavior remains app-owned.

## Positive checks and exclusions

The requested tinted tabs/crimson accordion variants are preserved and readable. Expanded Finance calculation, accounting and payment sections have clear boundaries. Voucher preview now has a primary Print button and explicit Close; Escape returned focus to View Voucher. Reviewer decision dialogs show disabled confirmation until required input. The conversation has card headers, a clear Mentioned You highlight and crimson tag text. Sidebar navigation collapses for narrow screens. No app-level horizontal page overflow was observed in representative mobile screens; wide report tables deliberately scroll in a contained region.

Normal desktop navigation was visited across Requestor, Department Head, FA, FM, COO, President, Board and System Administrator. This is not a pixel-perfect all-state certification. No submitted approval, payment, recovery, fund return, vendor validation, upload-error, permission-edit, success/error write state, physical-device keyboard or screen-reader behavior is certified. Separate existing functional QA reports remain relevant but were not counted as fresh parity passes. Future procurement integration and retired Signatory authorization are not new UI bugs. No production settings, data, firewall, commit or push were changed.

## Evidence paths and next handoff

All evidence links above resolve beneath this exact directory:

`C:/Users/Paolo Ylag/Documents/ChatGPT/LifeOS/Payment Module/.worktrees/backend-integration/Back End/outputs/`

Files were captured with supported CUA browser controls and inspected visually. Representative dimensions:375×812 and768×1024 for administration;375×812 and1440×900 for Board detail; default desktop1920×911 for most screens. Theme and viewport overrides were reset at completion. This is viewport testing, not a real iPad/device test.

No app fixes were made. Changed documents: this report and the encountered app-only variant entry in `docs/boilerplate-ui-gaps.md`. Root retains ownership of AGENTS and testing workflow rules. Recommended next work: fix F05/F06 semantic clarity first, then shared badge/action spacing, then history formatting and compact modal/report states; retest the linked units without changing domain authorization.

