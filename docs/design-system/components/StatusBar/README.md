# StatusBar

The strip on `bg` between the header and the workspace: dependency status tags and secondary entry points on the left, the busy indicator on the right.

- Dependency tags state readiness in words: `green` for ready (FFmpeg 已就绪, OpenAI 已配置), `orange` for a missing dependency (FFmpeg 未安装), default for optional and off (OpenAI 未配置 · 可离线编辑).
- Secondary actions (YouTube 导入, 载入示例) are `size="small"` default buttons.
- While busy, show the backend's phase text with a small `Spin` and a `danger` 取消处理 button that cancels the subprocess or request. Never hide the cancel button while work runs.
