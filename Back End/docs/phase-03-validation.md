# Phase 03 — Validation record

Date: 2026-09-28
Status: In progress. Current automated regression, Procurement-backed P.O. submission checks, confirmed Cash Advance and General Payment document rules, the production frontend build, and five-role Chrome lifecycle acceptance passed. Finance/external-system decisions and final reviewer acceptance remain open.

## Evidence

| Check | Result |
|---|---|
| Backend | Complete `pytest -q`: **73 passed, 2 warnings** against the dedicated Docker `payment_module_test` PostgreSQL database on 2026-09-28. Migration to head, deterministic seed and Python compilation also passed. Ruff could not be rerun locally because the configured package source exposed no Ruff distribution; the most recent recorded Ruff run remains green and hosted CI must rerun it for this evidence commit. |
| Production frontend | `pnpm run build` passed with TypeScript and Vite 7.3.6 after the current request-form and Finance-guidance changes. |
| Procurement-backed P.O. submission | The backend independently rejects unknown, Filed/ineligible, amount-mismatched, currency-mismatched, vendor-mismatched, and already-linked P.O. submissions. A successful submission freezes the authoritative P.O. and safe vendor snapshot; vendor bank fields are discarded. Advisory locking serializes duplicate-use checks. |
| Cash Advance rules | Automated tests confirm the hard PHP 40,000 submission cap, liquidation due exactly 15 calendar days after the event end date, and one submitted/unliquidated Cash Advance per requestor. A submitted Liquidation referencing the prior request releases the requestor for another Cash Advance. Per-requestor advisory locking protects concurrent submissions. |
| Finance guidance | Reimbursement forms display the confirmed 15-day submission lead time, 30-day invoice guidance, PHP 3,000 petty-cash threshold, and 15th/30th processing batches as nonblocking information pending the remaining exception/automation decisions. |
| Current API-connected browser | The Requestor P.O. form displayed only eligible `PO-DEMO-1001` and `PO-DEMO-1002` from the current API, with generated vendor, amount, currency, department/cost center, and Approved status. Cash Advance showed the PHP 40,000/one-advance/15-day guidance; Reimbursement showed the timing, invoice, petty-cash, and batch guidance. The check found and corrected an initial-state bug that could retain legacy fallback P.O. records instead of fetching Procurement data; the production build passed after the fix. |
| API-connected browser | An isolated Requestor session loaded all five request forms from the test backend. A Reimbursement draft was saved, survived a reload, and reopened with its purpose and Marketing cost center intact. An incomplete submission showed a request-not-submitted message. The exact synthetic test draft was deleted through the API and a database query confirmed zero matching rows. |
| Standalone browser | All five forms rendered in mock mode at 390 × 844 without page-level horizontal overflow. A started but incomplete General Payment row was blocked with a line-level message. Mock drafts now persist in browser-local storage; a saved draft survived reload and reopened with its entered particulars. |
| QA register | New cases `TC-P03-032`–`TC-P03-038`, executions `RUN-20260925-001`–`008`, updated Phase 03 rows, and pending acceptance gates `AG-P03-01`–`03` are recorded in the consolidated development/test register. |
| Local Docker acceptance | The complete suite passed **73 tests** against isolated Docker PostgreSQL 16. Coverage includes all five request types, Procurement-backed P.O. rules/snapshots, confirmed Cash Advance and General Payment document rules, exact/warning duplicate behavior, one cost center per line, currency/amount pairing without conversion, optimistic locking, concurrent numbering, simultaneous edits, duplicate-submission races, large-list pagination, and performance. The rebuilt live container is healthy and readiness reports `database=connected`. |
| Five-role browser lifecycle | Playwright `TC-P03-029` passed in Google Chrome on 2026-09-28 against the disposable `payment_module_e2e` PostgreSQL database. Five isolated role sessions clicked through return, resubmit, cancel and reopen for all five request types with real API records and persisted lifecycle history. Result: **1 passed in 51.5 seconds**. |

The saved-draft toast no longer prints a temporary local draft label that differs from the backend draft label. The standalone draft persistence change affects only explicit mock mode; API-connected storage remains server-owned.

## Still open locally

- Obtain final reviewer acceptance for the completed API and browser gates after the remaining Finance/external-system
  decisions below are resolved or formally accepted as limitations.

## Deferred to Phase 09 — production readiness

- Production-like deployed-container and HTTPS/proxy smoke testing.
- Hosted cross-browser validation and the full production accessibility review.

## Finance or external-system decisions

- The PHP 40,000 Cash Advance cap, one outstanding advance, and 15-calendar-day deadline are implemented as hard local submission rules. The local outstanding state is a submitted Cash Advance without a submitted Liquidation referencing its request number. Payroll-deduction processing and exception approvals remain later workflow decisions.
- Finance: return/reopen editability, late-submission handling, petty-cash redirection, configurable reimbursement batching, currency-based assignment, and Managing Director role mapping. General Payment document rules were confirmed on 2026-09-25.
- A representative finished-P.O. JSON shape was supplied on 2026-09-25. Local mock records now validate eligibility and authoritative amount/currency and retain a safe snapshot. Live activation still requires endpoint/authentication, stable identifiers, complete status transitions, selected quote, document access, APS event direction/idempotency, and sandbox details. See `docs/procurement-integration-contract.md`.

Detailed source findings and remaining questions are recorded in `docs/finance-orientation-findings-2026-09-25.md`.

## Confirmed duplicate and currency behavior

- Automated coverage confirms that all invoice-line fields matching produces an `exact` Finance-review tag.
- The same normalized invoice number with differing data produces a non-blocking `warning` and records the differing fields.
- A foreign-currency request retains its entered amount and currency without exchange-rate or converted-amount fields.

Do not mark Phase 03 `Ready for validation` or `Validated for local development` solely from the automated Docker/API/browser checks above. The applicable business decisions and final reviewer acceptance must be resolved or explicitly accepted as limitations. Phase 09 owns the deferred production gates. The consolidated local/non-local split is recorded in `docs/local-docker-acceptance-2026-09-23.md`.
