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
