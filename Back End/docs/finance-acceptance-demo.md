# Finance acceptance demo

Prepared 2026-10-30 (Asia/Manila). Local URL: http://127.0.0.1:5180/.

## Starting state — intentional

The owner requested blank Finance setup. No Finance configuration has been activated and no business acceptance has been recorded. New requests are deliberately blocked until required setup is complete. The local database contains 29 existing sample requests; it has not been reset or populated with automated test transactions. Automated tests use separate databases.

## Start with Finance setup

1. Sign in as Finance Manager. Open Request Settings → Start / resume initial setup. Direct route: `/#/administration/request-settings`.
2. Use Prerequisites to prepare active posting accounts, tax codes, department cost centers, currencies, methods and document rules. Finance Manager can maintain master data. Supply the actual General expense/payable, Input VAT/EWT mappings, advance asset and credit accounts; create missing references first.
3. Select the applicable VAT/EWT basis, rounding, effective date and General default. Reimbursement and PO Payment inherit General defaults. Finance Associate can override EWT per request/line. Cash Advance uses an asset; Liquidation settles the original advance.
4. Supply voucher prefix, numbering period and certification wording. Save progress, resolve blockers, then activate **All request types** with a reason. Saving alone does not activate.
5. Continue to the scenarios below. Finance Manager records business acceptance only after review, using Business review in the wizard. Development tests do not pre-sign acceptance.

## Suggested demonstration order

| Scenario | Expected evidence |
| --- | --- |
| General payment | Submit documents; Department Head approves; Finance Associate accepts required documents and lines, saves tax/accounting; Finance Manager approves the configured route; final approval permits posting and voucher preparation/certification. |
| Executive route | For unbudgeted requests above PHP 1,000,000: COO → President → Board. Executive More Information goes to Finance Associate and resumes the same stage. Future approvers cannot see/chat before their stage is reached. |
| Return/correction | Return with destination and reason; requestor edits and resubmits to the applicable stage. Finance Manager can return to Finance Associate and resume Finance Manager review. Fully decline remains distinct. |
| Payment | Finance Associate prepares multiple lines capped by amount due; each has one independent signatory. Authorize, record pickup readiness for checks, upload release evidence and record release; Finance Manager records clearing evidence. |
| Partial release | Payment report shows net due, released, cleared, awaiting clearing and unreleased balances separately. No summation across currencies. |
| Reimbursement | Proof of payment on each line; missing physical originals block Finance approval. |
| Cash Advance/Liquidation | Expenses above the advance pay only the excess; equal expenses require no new payment; lower expenses leave an unused balance. Only posted Liquidation accounting reduces advance accountability. |
| Fund return | Record the full unused amount with evidence. Pending/rejected receipts remain outstanding; Finance Manager verification reduces outstanding to zero. Entirely unused advances can be returned in full without a zero-expense Liquidation. |
| Payment recovery | Full line recovery remains released until independent verification. Confirmation reopens the same voucher amount; linked replacement requires fresh signatory authorization. Expense/tax accounting and prior request approvals stay recorded. |
| Conversations/notifications | Reached participants can message and @mention. Show current-stage approval, certification, return/payment updates and read/unread in the bell. No real email is sent. |
| Reports | Tracker and Reports → Financial reconciliation. Generate each report, narrow filters, open a request, export Excel and print. Inspect applied filters and cross-page totals. Dashboard Filter retains gross request reports. |

For a short live session, run one General request fully and use prepared transactions in a separate rehearsal environment to show the other branches. Do not bypass approval, document or setup gates to speed up acceptance.

## Scope kept separate

Local login and local procurement/vendor data are used by owner confirmation. Live LifeOS SSO/procurement/ERP connections, external email and hosting are outside this demo. SLA deadlines/reminders/escalation remain deferred. Report age buckets are informational. Production-scale export jobs, retention, provider monitoring and production/security acceptance remain release work.

## Local services

Frontend binds 127.0.0.1:5180 and proxies API 58002. Existing PostgreSQL 55434 and internal-only MinIO are used. Windows reserved the earlier MinIO host ports, so the temporary Compose override removes those unnecessary published ports. The notification worker produces in-app notifications and protected development email previews only.

The frontend was started with a hidden Node/Vite process; its stdout/stderr are in `outputs/finance-acceptance-vite*.log`. To stop only this preview, identify the Node process listening on 5180 and verify its project command/path before stopping it. Do not stop other Node apps. Stop the worker separately using `docker compose --profile notifications stop notification-worker` with the same temporary Compose override. Do not remove volumes.

The existing Inter and Crimson Pro fonts are bundled locally, with their licenses, to avoid internet font delays during the demo. Existing styles and the restored login palette are preserved.

## Rehearsal evidence

All 21 browser specifications passed (33 scenarios), with the final Finance reconciliation case rerun after the unclaimed filter addition. Backend regression passed 244 tests, and the final seven targeted report cases passed afterward. Build/lint/whitespace and the actual local smoke check passed. See `phase-08-finance-reconciliation.md` for evidence, amount definitions and report limits. This is development verification; Finance records its own acceptance during the demo.
