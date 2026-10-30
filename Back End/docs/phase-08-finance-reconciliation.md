# Finance reconciliation — local acceptance scope

Implemented: 2026-10-30 (Asia/Manila).

Open **Tracker and Reports → Financial reconciliation** as Finance Associate or Finance Manager. Each report uses one permission-scoped, repeatable-read database snapshot. Totals cover all matching rows across pages and are separated by original currency. No implicit PHP conversion is used for these balances.

## Available reports

| Report | Basis and controls |
| --- | --- |
| Payment reconciliation | One row per voucher, with net due, net released, net cleared, awaiting clearing, unreleased balance, available amount, cumulative verified recoveries, state and unclaimed check count and amount; choose state unclaimed to filter only vouchers with ready-for-pickup check lines. Expand payment lines for references, methods, independent signatories, states and predecessor IDs. Voided vouchers remain visible but do not contribute payment totals. Draft vouchers are identified as draft. |
| Cash advance reconciliation | One row per advance. Outstanding equals net released advance minus advance applied by current posted Liquidation accounting minus verified fund returns. Unposted/reversed Liquidations do not reduce the balance. Liquidation excess is separately shown and paid through its own voucher. Negative balances are explicit exceptions rather than silently clamped. |
| Fund returns | Latest receipt/review state per voucher, expected return, recorded receipt, verified return and outstanding amount, reference/date and receiving office. A pending or rejected receipt does not reduce the advance balance. A full return of an entirely unused advance is supported. |
| Payment recoveries | Latest recovery attempt per payment line, including rejected attempts, pending and verified recovered amounts, restored/current payment state and replacement IDs. Pending recovery remains in released/cleared balances until independent verification. The original payment and fresh replacement authorization remain separate. |

Search matches request, voucher, payee, purpose or payment reference. Department accepts an exact code/name/ID. Currency, state, submission-date range and elapsed-time bucket can narrow the results. Submission dates use Asia/Manila calendar boundaries. These are current-state reports; date filters do not produce historical as-of balances.

Elapsed-time buckets are descriptive: 0–7, 8–30, 31–60, 61–90 and 91+ full days since submission. They do not establish deadlines or an overdue/SLA policy.

## Export and print

Generate after changing filters. Excel and print fetch fresh consistent snapshots using the last generated filters. Each states generation time, actor, filters and balance definitions. Independent generations can legitimately have different current balances. Excel includes Summary and Reconciliation plus Payment lines where applicable. Formula-looking text is escaped and values beyond ordinary spreadsheet numeric precision remain text. Empty reports retain column headers. Print is available in a separate window with an explicit Print button.

The synchronous candidate limit is 5,000 requests and 20,000 payment lines; errors require narrower filters and never silently truncate the totals. Related Liquidations are bounded separately. Production-scale asynchronous exports and historical period closing are outside this acceptance increment.

## Notification coverage

Voucher preparation targets reached Finance Manager for certification. Issuance/certification and voiding target the requestor and reached Finance Associate. Fund-return receipt targets reached Finance Manager; verification/correction targets reached Finance Associate, with the requestor included. Recovery rejection is labelled as a correction and targets Finance Associate rather than announcing a new release. Future approvers remain excluded, as do inactive/suspended users and the event actor. Outbox creation is atomic with the transaction and uses unique event source keys.

## Verification

- Full backend regression: 244 passed before the final focused additions; all seven final report cases passed afterward.
- Real voucher/payment tests: release, pending recovery, verification, available replacement balance and predecessor links; rejected recovery recipient/title; posted advance settlement and pending versus verified fund returns.
- 125-request all-page totals, PHP/USD separation, pagination and visibility; future executive exclusion; Finance-only report access; explicit limit and input checks.
- Representative benchmark: 1,000 advance candidates, 18 queries, approximately 0.175 seconds locally, 20 page rows with totals covering all 1,000. This is a local benchmark, not a production SLA.
- Browser report case: request links, Excel reopen and print checks, verified receipts/recoveries, error retry and widths 375/768/1440. Broader browser run evidence: `outputs/finance-acceptance-all-browser.log`.
- Accounting refresh fix: tax saves hold accounting actions until the fresh result arrives; a forced refresh supersedes older in-flight accounting responses.

- Existing Inter/Crimson Pro font assets are now served locally with their font licenses; login and other screens no longer wait for Google Fonts. The design fonts and login palette are retained.

## Final acceptance rehearsal results

All 21 isolated browser specifications passed across the completed batches: 33 distinct scenarios, including all request types, six approvals through issued voucher, returns/declines, information loops, posting/payment/clearing, fund return/recovery/replacement, setup activation/acceptance, conversations, notifications, reports, vendor maintenance, workflow exceptions and device layouts. The final affected reconciliation specification was rerun after adding the unclaimed-check filter and passed again.

Production build, Ruff and source whitespace checks passed. The actual local app passed a smoke check with external HTTPS requests blocked: login, server dashboard, report empty state, Finance guide and initial setup. Its database still has 29 sample requests and zero activated Finance configurations. Business acceptance remains unsigned. The normal API and in-app notification worker were refreshed and remain running; the isolated backend test helper was stopped.

Evidence: `outputs/finance-acceptance-full-backend.log`, `outputs/finance-acceptance-final-report-tests.log`, the three browser batch logs (`finance-acceptance-all-browser`, `finance-acceptance-remaining-browser`, `finance-acceptance-final-browser`), `finance-acceptance-final-reconciliation-browser.log`, `finance-acceptance-local-smoke.log`, and `finance-report-375/768/1440.png`. Earlier failed attempts identify the accounting refresh race, a missing Playwright video helper and the external font timeout; each was addressed before its affected specification passed.
