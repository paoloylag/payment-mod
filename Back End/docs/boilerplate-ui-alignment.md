# Existing UI alignment — 2026-10-19

Reference: tenant boilerplate commit `bc8fffb` (branded showcase/component lab).
Scope: existing Payment Module elements only. No showcase screens, new controls or workflow changes.

- Shared brand palette: ivory page background; black/burgundy dark surfaces; existing crimson sidebar.
- Existing heading/body font families retained; shared control font and radius applied consistently.
- Existing buttons/selects retain 42px minimum sizing; success/destructive actions keep semantic colors.
- Existing forms, uploads, dialogs, conversation controls and table surfaces use shared theme tokens.
- Dark text accents use a lighter brand tint for readability; primary filled actions retain crimson/maroon.
- Existing file tags, rectangular Upload Files control and workflow layouts retained.

Verification: production frontend build and whitespace check passed. Chrome mock preview exercised dashboard,
reimbursement form, document uploads, approval queue, tracker, vendors and request settings in both themes at
375, 768 and 1440px (42 combinations). No document horizontal overflow, selects at least 42px, and no page JS errors.
Mobile navigation and vendor View/close dialogs were exercised, including Escape. Form and vendor dialog screenshots
were visually reviewed; legacy gray surfaces, white upload containers and low-contrast brand text were corrected.

Preview data is mock data; this is UI verification, not renewed backend approval/payment regression or business acceptance.
Docker's Linux engine was unavailable. The isolated mock preview uses port 5180; production still builds with API data only.
