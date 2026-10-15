# 颜色管理（Tailwind CSS v4）

`docs/design-system/tokens.json` 的 `color.tokens` 是颜色的维护入口。每个 token 可以是固定颜色，也可以包含 light / dark 两个值。当前应用的深色工作区为中性深灰。

修改后在 frontend 执行 `pnpm colors:generate`。生成器输出：

- `src/colors.generated.css`：语义 CSS 变量、Tailwind v4 `@theme inline` 映射及基于 data-theme 的 dark variant。
- `src/colors.generated.ts`：供 Ant Design 的主题种子与覆盖值使用；派生的控件色仍由 Ant Design 算法计算。
- `../colors_generated.go`：原生窗口背景 `ground()`。
- `index.html` 中带标记的启动样式及同步主题脚本。

`pnpm dev`、`pnpm build` 会自动生成；`pnpm colors:check` 和 CI 检查生成结果是否过期。直接执行 Go 构建前，修改 tokens 后也须先运行生成器。不要手改生成文件。

组件可以使用 `bg-panel text-ink border-line`、`bg-select`、`text-muted`、`bg-accent/10` 等语义类。现有 CSS 可继续使用 `var(--panel)`。主题切换只改变 document 根节点的 `data-theme`；普通组件不必分别写 light / dark 类。未启用 Tailwind Preflight，以保留现有桌面样式及 Ant Design 控件外观。

启动时 URL 的 light / dark / system 优先于浏览器缓存；没有 URL 主题时才读取缓存。system 使用系统媒体查询，脚本在应用 bundle 前同步设置根节点主题；内联背景和 color-scheme 不依赖外部 CSS。Go 为系统模式显式传入 theme=system，避免旧缓存强制覆盖系统偏好。运行时沿用原有设置广播和系统主题监听，原生窗口背景随主题更新。

设计文件中尚有历史的组件派生色、布局与对比度说明，它们不是对当前界面的自动审计；本次统一的是应用语义颜色和启动背景，不代表所有派生色均经过对比度验证。

本次已验证生成一致性、启动主题优先级、存储不可用、前端类型检查、22 项现有前端测试、生产构建，以及 Go 核心包测试。使用 pnpm 12.10.1 验证了 frozen-lockfile 安装与生产构建。完整 server 模式 Go 测试被 Wails 模块下载的 HTTP 403 阻断，尚未完成。macOS 的 WebView 首帧、窗口显示时机和系统外观切换仍需真实 Mac 验证；Tailwind 本身不能控制原生窗口显示时机。
