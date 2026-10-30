# Phase 08 request transaction reports — 2026-10-20

Current increment: authoritative gross-request reports and existing Excel/print controls.
Dashboard financial aggregates and detailed payment/advance reconciliation reports remain separate work.

## Where to use it

As Finance Associate, Finance Manager or Administrator, open Dashboard, select Filter, apply the existing
search/department/type/status/amount/sort controls, then Export Excel or Print / Save PDF. The production/API
path requests a fresh server snapshot; it never exports only the currently loaded dashboard rows.
Mock mode retains its demonstration dataset. Report failures show a message and release disabled buttons for retry.

## Definitions and scope

- All visible non-draft requests matching filters, including returned/declined/cancelled history when selected.
- Amounts are request GROSS amounts, not voucher net due, cash paid, cash returned, outstanding advances or liabilities.
- Totals use Decimal arithmetic and stay separate by currency; no cross-currency addition or implicit FX conversion.
- Aging is completed elapsed 24-hour days since submission, never a newly invented SLA or overdue rule.
- Date filters use Asia/Manila calendar boundaries; generated timestamps retain the business timezone.
- Persisted request/workflow/payment status labels are shared with list serialization. No future approver access is granted.
- Reports use a read-only repeatable-read transaction so rows and totals share one database snapshot.
- The endpoint applies the existing request visibility scope BEFORE results, metadata, totals, filtering or export.

## API and limits

`GET /api/v1/reports/requests` supports search, department, request_type, display status, lifecycle_status, date_from/date_to,
min_amount/max_amount, sort_by/sort_direction, page/page_size and export=true. Normal pages are at most 100 rows.
Summary totals/counts cover all filtered rows, not just the page. Ordering includes a stable request-ID tie-breaker.
The export response includes all matching rows, filters, generation metadata, definitions and per-currency totals.

There is a hard 5,000 candidate-row limit after SQL visibility/search/department/type/date/amount filters.
The status display filter is then applied to current financial/workflow projections. Above the candidate limit,
the API returns 413 and asks for narrower preliminary filters; it never silently truncates an export.
This bound is a first delivery limit, not an acceptance claim for enterprise-scale reports. Query plans and larger
asynchronous export jobs remain pending. Dashboard cards and its loaded-list counts are not yet whole-system report totals.

## Export/print safety

Excel Summary and Transactions sheets are built from the server snapshot. Formula-looking text (including leading
whitespace/control characters) is escaped and written as text. User data never become formulas. Monetary values
with more than 15 significant decimal digits remain text to preserve precision; ordinary amounts have four-decimal
numeric formatting. ISO submission dates remain unambiguous text. Print cells and filter labels are HTML escaped.
The print and Excel actions independently request current snapshots, so their timestamps/report IDs can differ.

## Verification

- API tests reconcile 125 owned records across pages, separate PHP/USD totals, scoped access and future-role exclusion.
- Date-boundary, invalid range, literal wildcard, export-all and candidate-limit tests passed.
- Browser downloads/reopens the workbook, verifies all 125 rows despite the first 100 dashboard records,
  checks formula protection and currency totals, and verifies equivalent print rows/totals.
- Existing report controls checked at 375/768/1440px, including recoverable server errors.
- Shared-label changes preserve the existing request list query-count gate by reusing batched workflow data.
- Full backend regression: 239 passed; final report/status/date edge cases: 3 passed.
- Browser: report workbook/print test plus notification test and eight request workflow scenarios passed.
- Production frontend build, backend lint, whitespace, local API and worker health checks passed.
- Evidence: outputs/phase08-reports-*.log.

## Next Phase 08 work

Authoritative dashboard aggregates and global-search scope; paid/unclaimed-check reconciliation; outstanding
advance/return/recovery reports; official aging buckets; broader report-volume/permission benchmarks and operational acceptance.
SLA reminders/escalation remain deferred. Production email remains Phase 09 activation work.

## Update — 2026-10-30

Server dashboard snapshots, Finance payment/advance/return/recovery reports, unclaimed check counts/amounts and descriptive elapsed-time buckets are now implemented. See `phase-08-finance-reconciliation.md` for definitions, limits and local acceptance evidence. Production-scale benchmarks and historical/asynchronous reporting remain separate release work.
