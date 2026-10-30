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

## 2026-10-30: Shared editable and read-only review panel

Coverage: app-only. Payment approval details reuse backendFinanceValidationCard in src/prototype.js for editable associate validation and read-only manager review. The tenant boilerplate src/App.tsx form showcase has readonly/disabled inputs, but does not establish this document-and-line review pattern. Reuse candidate: a shared review card with document preview links, saved decisions, physical-original status, loading/retry states, and optional editing controls. Preserve existing responsive cards, keyboard disclosures, and light/dark tokens; keep finance permissions in the payment app.

2026-10-30 follow-up: the same read-only document/line panel is now shared by all assigned workflow approvers, including Department Head, COO, President and Board; Finance Associate retains its editable validation panel. Existing participant authorization remains in force.

## 2026-10-30: Sortable and filterable tracker table

Coverage: app-only candidate. Payment Module tracker uses accessible column-header sort buttons, a mobile sort selector, collapsible search/status/type/date filters, an empty state, and pagination reset after changes. Inspected tenant boilerplate src/App.tsx: showcase table and record search/filter drawer exist; no aria-sort or column sorting implementation was found. Reuse candidate: a shared sortable table header and filter toolbar using the existing theme, keyboard controls, narrow-screen cards, and pagination. Domain-specific status/date semantics remain in src/tracker-table.js; presentation is in src/prototype.js and src/boilerplate-shell.css.

2026-10-30 Finance progress: app-only draft buffers now retain unsaved line decisions, reasons, receipt checkboxes, selected upload files and document types across in-app navigation, scoped by user/request/line. Save and Upload remain explicit; buffers are memory-only and do not survive a browser reload. Reuse candidate: route-safe review form and upload state alongside the existing read-only/editable panel.

2026-10-30 reimbursement batch visibility: Request Summary and approval previews reuse existing detail-list rows to show the persisted processing batch date. The reimbursement form reads the saved cutoff schedule; missing assignments and unavailable settings are explicit. No new shared component gap identified.

## 2026-10-30: Document-specific print page formats

Coverage: app-only candidate. The issued voucher print document now declares US Letter portrait dimensions and uses a matching hidden-frame viewport, while the system guide remains A4. Global print styles cannot safely support multiple paper formats in one app. Reuse candidate: a shared isolated-document print helper with configurable Letter/A4, portrait/landscape, margins, print-safe colors, font readiness, and page footer metadata. The implementation must preserve full-width tables and avoid clipping on desktop browsers and iPad Safari.

The live backend-issued voucher now also reuses the original Payment Module voucher visual language: burgundy bordered card and heading, tan label cells, right-aligned tax totals, and a structured digital approval certification. Accounting, advance, return, and payment-release details remain backend-driven extensions below the original voucher summary rather than a separate plain report template.

The isolated voucher print helper measures the completed card after fonts load and proportionally fits overlong content into the printable Letter-page height. The body is then bounded to that height so accounting or payment sections cannot create a second printed page. This auto-fit behavior is a reusable requirement for any future single-page document helper.

## 2026-10-30: Session-restoration loading state

Coverage: app-only candidate. The Payment Module now distinguishes the initial `checking` state from an authenticated or rejected session. Refresh displays a branded, non-interactive “Restoring your session” status while `/auth/session` is pending; the login form is rendered only after an unauthenticated response. The tenant boilerplate should provide a shared session-restoration screen so product apps do not briefly expose login controls during valid-session startup. Include light/dark tokens, reduced-motion behavior, accessible live status, and responsive sizing.

## 2026-10-30: Request information card groups

Coverage: app-only candidate. Request Details no longer places the summary and Finance modules inside one large panel. Request summary, EWT/tax calculation, accounting workbench, voucher/payment release, routing, approval progress, and request history render as sibling cards with consistent spacing and responsive disclosure behavior. The tenant boilerplate should provide a grouped detail-page pattern for independently owned information cards, preserving narrow-screen stacking, dark-mode surfaces, role-specific actions, and asynchronous loading/error states.

## 2026-10-30: Shared application error pages

Coverage: app-only candidate. Payment Module now uses one responsive, theme-aware error-page pattern for 400, 401, 403, 404, 408, 409, 422, 429, 500, 502, 503 and 504 states. It supports signed-out session errors, in-shell route/resource errors, recovery actions, optional support references, keyboard focusable controls, and narrow-screen stacking. The tenant boilerplate does not yet provide a verified routed error-page component or showcase example. Reuse candidate: a shared status-page component with safe status-specific copy and configurable retry, back, sign-in and dashboard actions; application authorization and error-to-route decisions remain domain-owned.

## 2026-10-30: Collapsible navigation

Reused the tenant boilerplate's persisted sidebar-collapse pattern (src/App.tsx sidebarCollapsed state). Payment Module adapts it to fully hide the desktop sidebar and reclaim the entire content width, with an accessible topbar toggle. The existing mobile/tablet drawer retains its focus trap, Escape/backdrop closing, and independent state. No missing shared component was identified for this change.
