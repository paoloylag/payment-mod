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
