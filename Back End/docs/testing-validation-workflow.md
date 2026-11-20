# Testing and validation workflow

## Required order

User-facing work is validated in this order:

1. **Browser click-through first.** Exercise the affected workflow through visible controls against the local API and
   database. Confirm navigation, role visibility, successful and failed actions, persisted results, responsive layout,
   accessible names, messages, and browser-console behavior. Record any defect before relying on automation.
2. **Automated functional testing.** Run the relevant Playwright acceptance scenario and focused backend/API tests.
3. **Regular regression testing.** Run the complete backend suite, frontend production build, lint/static checks,
   migration upgrade/rollback/replay where applicable, and dependency/security checks required by the phase.
4. **Environment and CI verification.** Rebuild the Docker services when backend or migration behavior changed, verify
   health/readiness and persistence, then confirm the hosted CI result.
5. **Evidence closeout.** Record the click path, roles, viewport(s), test commands, results, commit, date, reviewer, and
   accepted limitations in the development/test register and phase validation record.

An automated test result does not replace the initial browser click-through for user-facing behavior. Pure backend,
migration, maintenance, or infrastructure changes that expose no UI start with the closest observable API or operational
smoke test, followed by focused and full automated testing.

If the initial click-through fails, diagnose and correct the defect before treating later automated results as acceptance
evidence. Regression tests may still be run to locate the fault, but the browser gate must be repeated after the fix.

## Finance browser regression isolation

Use `pnpm test:e2e:isolated` for the full browser regression. It invokes each specification separately so global setup
recreates only the dedicated `payment_module_e2e` database between specifications. Configuration activation tests persist
immutable policies; sharing their database with later specifications changes the scenarios those tests are exercising.
The ordinary `test:e2e` command remains available for one focused specification.

To select several specifications, pass their paths, for example
`pnpm test:e2e:isolated tests/e2e/finance-closeout.spec.js tests/e2e/all-type-payments.spec.js`.
Playwright flags are forwarded. Install the standard Playwright video dependency and set `PLAYWRIGHT_BROWSERS_PATH`
when using a custom workspace browser cache.


## Required visual parity sweep for UI audits

Every UI audit must compare actual rendered controls with the current tenant boilerplate implementation, not just verify that actions work. Follow the mandatory coverage in AGENTS.md and life-ui-fix. Broad system audits must inventory all navigation screens and relevant role/state variants, including Finance processing and administration.

For each screen/state record: route, role, viewport and theme; click path; component/selector in the actual boilerplate; observed appearance and interaction; screenshot; Pass/Fail/Blocked/Not run; severity and recommendation where applicable. Explicitly inspect section headings, accordions, tabs, buttons, menus, table density, form validation, modal focus and scroll, overflow, empty/loading/error recovery and long content. Include representative phone, tablet and desktop widths and both themes. Do not mark an unvisited role or state passed based on another screen.

Separate visual parity from functional testing and policy acceptance. If a shared pattern is missing or partly themed, record the verified gap and the app-local adaptation. A source-only observation remains source-only. Finish with the complete coverage matrix, prioritized findings and explicit remaining browser checks. Use isolated fictional data for role switching or mutation; preserve ordinary demo/user data and external systems.
