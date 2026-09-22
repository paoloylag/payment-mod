# Phase 03 — Validation record

Date: 2026-09-22
Status: In progress. Approval-independent regression and focused browser checks below passed; full lifecycle browser acceptance and Finance policy decisions remain open.

## Evidence

| Check | Result |
|---|---|
| Backend | `pytest -q tests/test_payment_requests.py`: **21 passed, 1 warning**. Complete `pytest -q`: **58 passed, 1 warning** against the dedicated `payment_module_test` PostgreSQL database. |
| Production frontend | `pnpm run build` passed after the standalone draft change. |
| API-connected browser | An isolated Requestor session loaded all five request forms from the test backend. A Reimbursement draft was saved, survived a reload, and reopened with its purpose and Marketing cost center intact. An incomplete submission showed a request-not-submitted message. The exact synthetic test draft was deleted through the API and a database query confirmed zero matching rows. |
| Standalone browser | All five forms rendered in mock mode at 390 × 844 without page-level horizontal overflow. A started but incomplete General Payment row was blocked with a line-level message. Mock drafts now persist in browser-local storage; a saved draft survived reload and reopened with its entered particulars. |
| QA register | Test cases `TC-P03-023`–`TC-P03-029`, execution rows `RUN-20260922-001`–`008`, and pending acceptance gates `AG-P03-01`–`03` are recorded in the development/test register. |

The saved-draft toast no longer prints a temporary local draft label that differs from the backend draft label. The standalone draft persistence change affects only explicit mock mode; API-connected storage remains server-owned.

## Still open without Finance confirmation

- Complete `TC-P03-029`: a full UI lifecycle for all five request types, including edit, submit, return, resubmit, cancel, reopen, role visibility, and error states. The focused checks above do not establish this full acceptance path.
- Complete a production-like deployed-container and HTTPS/proxy smoke test when that environment exists. A successful CI image build is not a deployment test.
- Cross-browser review remains open. The full accessibility review is deferred at the owner's request.

## Finance or external-system decisions

- Finance: duplicate-invoice matching criteria; Cash Advance limit, outstanding-advance and liquidation-deadline policy; final General Payment document rules; return/reopen editability; foreign-currency conversion only if conversion is required.
- External P.O. provider: lookup contract and sandbox. Current P.O. reference validation remains local until that integration is supplied.

Do not mark Phase 03 `Ready for validation` or `Validated` solely from the focused checks above. The pending browser lifecycle and applicable business decisions must be resolved or explicitly accepted as limitations.
