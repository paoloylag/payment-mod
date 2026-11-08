
## 2026-11-03 — Dark surface token parity
- Coverage: implemented in boilerplate; app override drift corrected.
- Source: payment module shared theme, `src/boilerplate-shell.css`.
- Evidence: tenant boilerplate `src/styles.css` `.app.dark` and `.signed-out.dark` define charcoal #111318, panels #191d25/#202632, text #f8fafc and muted #a5adba.
- Action: reuse these existing tokens for pages, notifications, fields and body-mounted dialogs. No new shared component required. Preserve semantic status colors and responsive layouts.
