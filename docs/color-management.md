# 颜色管理（Tailwind CSS v4）

应用颜色只在 `theme/colors.json` 里维护。每个颜色是一个值，或者一组浅色／深色值，并写明用在哪里。这里只放应用实际用到的颜色；`docs/design-system/tokens.json` 是设计系统的说明副本，构建不读它。

修改后在 `frontend` 执行 `pnpm colors:generate`，`scripts/colors.mjs` 会生成：

- `frontend/src/colors.generated.css`：CSS 变量（如 `--panel`）、按 `data-theme` 切换的深色值，以及 Tailwind 的 `@theme inline` 映射。
- `frontend/src/colors.generated.ts`：给 Ant Design 的主题种子（`colorPrimary`、`colorBgLayout`、`colorError`，以及浅色下的标签文字色）。其余控件色由 Ant Design 的明暗算法计算，弹出层背景也用它自己的值。
- `colors_generated.go`：原生窗口背景 `ground()`。
- `frontend/index.html` 中 `colors:start` / `colors:end` 之间的启动样式和主题脚本。

`pnpm dev`、`pnpm build` 会先自动生成；`pnpm test` 和 CI 用 `pnpm colors:check` 检查生成文件是否过期。直接运行 Go 构建前，改过颜色也要先生成一次。不要手改生成文件。

现有 CSS 继续用 `var(--panel)` 这样的变量。Tailwind 只启用主题和工具类，不启用 Preflight，并使用 `tw` 前缀：写成 `tw:bg-panel tw:text-ink tw:border-line`。前缀可以避免 Tailwind 把代码里的普通单词（例如时间轴的 `.block`）当成工具类生成样式。深色由根节点的 `data-theme` 决定，组件不必另写 `dark:` 类。

启动时 URL 中的 `theme`（light / dark / system）优先于浏览器缓存；没有 URL 主题时才读取缓存。system 优先使用 Go 传入的 `systemTheme`，缺少时使用系统媒体查询。脚本在应用 bundle 之前设置根节点主题，内联背景和 `color-scheme` 不依赖外部 CSS。

已验证与仍需 Mac：生成一致性、启动主题优先级、前端与 Go 测试在 Linux 上通过；macOS WebView 的首帧、窗口显示时机和系统外观切换仍需在真机上检查。Tailwind 不控制原生窗口何时显示。
