# Release validation — 8 November 2026

Scope: checkpoint 35a2a6d (Petty Cash vouchers, Finance visibility, compact workbenches, voucher preview/printing, validation navigation and mobile fixes), followed by regression updates and corrective fixes on the same branch.

## Completed checks

- 274 backend tests passed on a freshly recreated, migration-upgraded payment_module_test database. No production or local demo database was reset.
- Ruff check of api and tests passed.
- Eight tracker status/sorting/filtering JavaScript tests passed.
- Production frontend build passed.
- Fresh test migration upgrades covered foundation through 20261103_0032.
- Migration 0032 refused downgrade when an issued Petty Cash voucher existed, preserving the voucher and migration version. Empty-table downgrade to 0031 and upgrade to head succeeded.

## Corrections during validation

- Removed retired signatory gates from test scenarios. Payment preparation/release now follows current Finance controls; checks still require pickup readiness. Historical signatory access/records are not fabricated or removed.
- Preserved actual version/idempotency, evidence, allocation cap, role denial, clearing, full fund-return and recovery assertions.
- Isolated Finance activations and draft/acceptance settings between tests. Fixture-only cost-center names are unique.
- Updated browser selectors for compact Finance editing disclosures, visibility by reached stage, simplified tracker labels and notification accessibility labels.
- Fixed navigation breakpoint handling to retain live form controls and unfinished entries across resizing; navigation inert/ARIA state is updated in place.
- Restored Finance Manager entry of the request-specific PHP conversion rate at its review stage, as confirmed policy requires. Approval freezes that request's remaining route; system currency configuration is not changed.
- Removed obsolete unused dashboard queries and applied backend lint formatting/import fixes.

## Browser regression

All 41 Chrome browser tests across 27 isolated specifications passed after corrections and targeted reruns. Each specification received a fresh dedicated payment_module_e2e database. This result combines the initial run and subsequent reruns; it is not a claim of one uninterrupted green invocation.

Evidence: outputs/current-full-browser-regression.log, outputs/release-browser-reruns.log and outputs/release-browser-final-setup.log. Backend evidence: outputs/release-backend-regression.log.

Coverage includes request creation and documents; all approval stages; returns, declines and resubmission; Finance Associate return and executive information requests; request-specific exchange rates; accounting, vouchers, release/clearing and replacement payments; full fund returns/recovery and reconciliation; Petty Cash; conversation mentions/notifications and access; administration, vendors and cost-center approvers; delegation/reassignment/recovery; responsive layouts and form preservation.

The corrected workflow-exception assertion confirms that material-correction resubmission restores the cost center’s assigned Department Head without retaining temporary delegation. Setup resizing preserves an unsaved voucher prefix at phone, tablet and desktop widths.

## Acceptance remains separate

These are development checks using local/test data. Finance must confirm actual configuration and complete named business acceptance. Physical iPhone/iPad Safari/software keyboard checks, live email/integrations, production hosting/security/restore acceptance and the owner-deferred SLA escalation remain outside this local verification.
