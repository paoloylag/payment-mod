# Current system status

Reviewed: 12 November 2026 (Asia/Manila). This is the entry point for current development status. Dated phase plans and validation reports preserve delivery history; their older pending/deferred statements do not override this summary.

## Implemented locally

| Area | Current behavior |
| --- | --- |
| Requests and approvals | Persisted requests, cost-center Department Head assignment, approved PHP threshold matrix, Finance Manager request-specific exchange rates, returns/declines/information responses, delegation/reassignment/recovery and reason-audited Finance Manager approval overrides. |
| Documents and Finance | Required document acceptance and line flags; reimbursement originals gate; setup wizard, versioned activation, VAT/EWT defaults and overrides, balanced accounting, posting and corrections. |
| Ordinary vouchers/payments | Voucher preparation, Finance Manager issuance, view/print, void/replacement links, multiple payment lines, Finance Associate release with evidence and Finance Manager clearing. Separate signatory authorization is retired. |
| Petty Cash | PHP only, strictly below ₱3,000; Department Head → Finance Associate. Finance Associate creates a full-amount, tax-free voucher. No Finance Manager or ordinary payment flow. |
| Advance settlement/recovery | Full unused-fund return with Finance Manager verification; full released-payment-line recovery with independent verification and linked replacement. Pending/rejected verification does not reduce outstanding balances. |
| Conversations and notifications | Reached participants, @mentions, highlighted tags, in-app read/unread notifications and local worker. Future approvers remain excluded until their stage. |
| Reporting | Server dashboard snapshots, request reports, Finance payment/advance/return/recovery reconciliation, filters, Excel/print and per-currency totals. |
| Administration and help | User/role and vendor CRUD, master data, cost-center approvers, Finance settings, in-app role guide and portable LIFE College HTML/A4 print guides from shared content. |
| Error recovery | Retained editable forms on failed saves, inline feedback, load retries, duplicate-submit guard, status-aware errors and session recovery. |

Vendor onboarding update, 11 November 2026: General Payments now owns supplier selection and new-supplier entry, with BIR 2303, SEC/DTI registration and business permit uploads. Pending suppliers become selectable only after Finance Associate document validation and approval. Vendor Administration navigation is available to System Administrator and Finance, with pending-supplier filtering and audited supplier document reviews; Finance Associate request approval remains the activation gate. Migration 0034 enables the additional document types.

Earlier vendor groundwork, 11 November 2026: Finance Associate and Finance Manager can manage APS vendors for General Payments. Procurement vendor references are shown separately, read-only, for PO use; sample data is labelled and no live Procurement API is connected. The server rejects Procurement vendor edits/deletion and non-PO use. Ownership is persisted in the shared PostgreSQL vendor master by migration 20261111_0033; Procurement backend connection is still pending. See [vendor UI](finance-vendor-ui.md).

## Remaining non-production work

1. Finance selects/validates actual settings and completes named business acceptance. Current sample/local settings are not institutional approval.
2. Correct any findings from that acceptance; record accepted scenarios and exceptions.
3. Physical iPhone/iPad Safari and software-keyboard acceptance; Chrome viewport testing is not device certification.
4. SLA deadlines, reminders and escalation remain explicitly owner-deferred; current age buckets are informational.
5. LifeOS SSO and live Procurement/ERP integrations require target contracts and separate implementation/acceptance. Local flows do not prove live integrations.

Email update, 11 November 2026: a disabled-by-default SMTP adapter/configuration scaffold is available. The notification worker remains database-only; live queue delivery is not connected. See [email scaffold](email-delivery-scaffold.md).

## Production work kept separate

Hosting/TLS/domain, provider credentials and live email, object storage/scanning, security/backup/restore acceptance, retention and volume/operational benchmarks remain in [production preparation](production-preparation.md) and [Phase 09](phase-09-plan.md). Banking integration remains excluded.

## Verification and guides

- [8 November release regression](release-validation-2026-11-08.md): 274 backend tests and 41 browser cases across 27 specifications.
- [10 November error audit](error-handling-audit-2026-11-10.md): 26 browser cases across 11 specifications, eight tracker tests and build; scope and limits recorded there.
- [Finance acceptance scenarios](finance-acceptance-demo.md).
- [Guide builder](guide-builder.md): shared content, role selection, offline export and maintenance.

Validation counts are dated evidence, not a claim that every historical suite was rerun for each subsequent documentation edit.

UI follow-up, 12 November 2026: shared confirmations use native modal semantics with focus/value retention; Finance Manager empty states use permitted actions; vendor verification links submitted originating requests and labels drafts awaiting submission. Payment history uses per-event disclosures preserving full evidence. Frontend Node tests now have a package/CI command; historical migration lint is clean. Finance setup labels reflect actual scope and use neutral payment-control wording. No signatory or approval policy was changed. See [verification](ui-fixes-2026-11-12.md).
