# Phase 08 dashboard completeness

The request loader now reads every permitted page before replacing dashboard data. Cards and their detail tables use the same loaded dataset, beyond the previous 100-request limit. A failed later page or repeated request ID raises an error instead of publishing a partial replacement.

Open Request Value shows gross submitted/returned request amounts, excluding cleared payments, verified fund returns and settled liquidations. It is not net unpaid liability. Currency totals remain separate. Returned requests remain open because corrections are outstanding. Voided vouchers remain open because the underlying approved request still requires handling.

Unclaimed Checks counts actual payment lines in ready-for-pickup state, with one detail row per request; a request can contain several checks. Authorized bank transfers do not count. Requestor pending approval counts active/information-requested workflows; reviewer cards retain the assigned queue rules.

Update 2026-10-30: card values, membership and current request/payment labels now come from a permission-scoped repeatable-read server snapshot. The frontend checks request IDs and versions against loaded pages before publishing it; a concurrent membership/version change requires refresh. The interactive dashboard has an explicit 5,000-request limit and never silently truncates. Filtered Finance reports and current request exports have their own consistent snapshots. Production-volume projections and asynchronous exports remain later scale work.

The existing responsive cards, shared table pagination, request navigation and report controls are retained.

## Verification

- Production build, Ruff and whitespace checks passed.
- Full backend regression: 240 tests passed, including real check readiness/release/clearing transitions and request-summary reconciliation.
- Browser: 125 seeded requests appear in the metric breakdown and filtered live table; Excel and print retain all rows and per-currency totals. A report failure preserves retry. Overflow checks pass at 375, 768 and 1440 pixels.
