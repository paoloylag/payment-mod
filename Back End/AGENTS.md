# UI consistency

When creating or changing UI elements, follow the existing app's UI format and reuse shared styles in src/boilerplate-shell.css before adding custom rules.

- Dropdowns use the shared select format: 42px minimum height, shared --radius corners, inherited font, existing arrow, focus state, padding and theme colors.
- Buttons follow the shared button layer; preserve established semantic colors and avoid one-off sizing.
- Multiple-file uploads use compact file tags above the upload button, with an individual removal × inside each tag.
- Verify responsive layouts and existing interaction behavior when changing controls.

## Phase 05–08 UI delivery

- Treat the current working UI as the baseline. Extend existing screens and shared components without breaking their layout, navigation, controls, or established interactions.
- Build new and changed views mobile first: start with a narrow viewport, then enhance the layout for tablet and desktop. Avoid horizontal page overflow, clipped controls, and touch targets that are too small to use.
- Before considering a UI change complete, check the affected flow at mobile, tablet, and desktop widths; exercise its primary actions, loading/error states, and keyboard interaction. Fix regressions before phase sign-off.


## Mandatory UI audit coverage

For every UI audit, actively check actual rendered styling against the current LifeOS tenant boilerplate implementation and UI Lab, as well as functionality. Read the applicable life-ui-fix skill. A working button or a passed automated test is not visual acceptance.

- Inventory all requested screens, role variants and states before reviewing. Include Finance workspaces, expanded accordions, dialogs, menus, tabs, tables, notifications, forms and validation/error/empty/loading states; do not limit broad system reviews to request creation.
- Inspect the actual shared component/source selectors before claiming parity. Check typography/heading hierarchy, semantic colors, spacing, borders/radii, button variants and sizes, focus/disabled/busy states, responsive overflow and touch targets. Preserve intentional domain behavior.
- Use actual browser clicks and visual screenshot inspection, including open/close, expanded/collapsed, keyboard focus and representative phone/tablet/desktop and light/dark variants. Source inspection cannot count as a browser pass.
- Record route, role, viewport/theme, exact action/state, observed issue, screenshot evidence, actual boilerplate file/component reference, severity and recommendation. Distinguish inconsistencies from intentional app-specific variants, confirmed shared gaps and unverified coverage.
- Report every inventoried screen/state as Pass, Fail, Blocked or Not run. Missing coverage must remain visible; never describe a partial review as an all-screen pass.
- Keep encountered reusable gaps deduplicated in docs/boilerplate-ui-gaps.md. An audit authorizes findings and recommendations; implement fixes only when requested.

See docs/testing-validation-workflow.md for the evidence and isolation requirements. These checks apply to all future UI-agent audits in this repository.
