# Upstream license fallbacks

Some npm tarballs declare a license in package.json but omit the license text. `scripts/notices.mjs` uses these checked-in upstream texts for the currently locked versions:

- `@ant-design/icons-svg` 4.6.0: https://github.com/ant-design/ant-design-icons/blob/master/LICENSE (MIT, Ant UED).
- `@wailsio/runtime` 3.0.0-beta.28: https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/LICENSE (MIT, Lea Anthony).
- `toggle-selection` 1.0.6: https://github.com/sudodoki/toggle-selection/blob/master/LICENSE (MIT, sudodoki).
- `is-mobile` 5.0.0: https://github.com/juliangruber/is-mobile/blob/v5.0.0/README.md#license (MIT, Julian Gruber). The full license is included in the installed package's README, but it has no standalone license file; the checked-in text decodes the email's HTML entities.

Retrieved 2026-10-08. Recheck these fallbacks when updating the corresponding dependencies. Other production dependencies' notices are read directly from their installed distributions and the Go module cache.
