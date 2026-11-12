# Requestor expense-account selection — 12 November 2026

General Payment request lines now use a dropdown of active posting accounts from Finance's chart of accounts. The active Finance debit default is preselected when no account has been chosen. Department/cost-center automatic mapping remains in place.

The selected account is retained on draft creation, edits and submission, recorded in each line of the Finance coding snapshot, and used for the General Payment expense entry before the configuration default. Explicit Finance accounting overrides still take precedence. Current backend checks reject inactive, non-posting or ineffective selections. Existing submitted snapshots and posted journal records are not rewritten by this change.

Validation: frontend build passed; Ruff passed for the changed Python files; 19 focused configuration/accounting/all-type payment tests passed. Added regressions cover selecting a nondefault account, draft update/submission retention, coding snapshots, inactive-account rejection, accounting preview and Finance override. Browser check selected Professional Services and saved the draft successfully. No fresh phone/tablet visual pass was performed for this change; the existing shared select is reused.
