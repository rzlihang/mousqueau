# Provider

Wraps every Mousqueau screen: Ant Design's `ConfigProvider` with the app theme, antd's `App` context, and a `.shell` element carrying `data-theme`.

## Use

- Put it once at the root. Inside it, use antd components directly (`Button`, `Tag`, `Alert`, `Input`, `Select`, `Checkbox`, `Switch`, `Modal`, `Empty`, `Spin`) and the Mousqueau components on this page.
- The theme is the app's `colorPrimary: #2867c7`, `borderRadius: 6`, with `theme.darkAlgorithm` in dark, plus this system's contrast fixes: light `colorError #cf1322`, `green7 #237804`, `orange7 #ad4e00`, `gold7 #995b00`; dark `colorError` seeded `#ff7875`. `themeConfig(dark)` returns it if you build your own provider. Never override other antd tokens.
- `button.autoInsertSpace` is off, so two-character Chinese labels such as `撤销` stay unspaced.
- Omit `dark` to follow `<html data-theme>`; the app itself stores the choice in `localStorage["mousqueau-theme"]`.

## Window layout

The preview is the window: `AppHeader`, then `StatusBar`, then `main.workspace`, a three-column grid of `Panel`s (`media-panel` 0.95fr, `cues-panel` 1.25fr, `review-panel` 1fr; minimums `col-media-min`, `col-cues-min`, `col-review-min`) with `space-14` gaps and a `space-18` gutter. The workspace fills `100vh - 150px` and never drops below `workspace-min-height`. At `bp-two-column` it becomes two columns with the review panel spanning both; at `bp-one-column` it stacks.

The consumer supplies the children and, for the full window, a `min-height: 100vh` on the provider's `.shell` (the source sets it on the themed wrapper).
