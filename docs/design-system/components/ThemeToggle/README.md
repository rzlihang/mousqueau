# ThemeToggle

A small antd `Switch` labelled 深色 that switches between the light and dark themes.

- One per window, top right, over the header (`right: space-20`, `top: 30px`). The label is `subtitle` size in `muted`.
- The consumer owns the state and persists it; the app writes `localStorage["mousqueau-theme"]` as `"dark"` or `"light"`.
