# ConfirmDialog

Ant Design's `modal.confirm` (from `App.useApp()`), used before any action that is costly, external or replaces work.

- Confirm before: uploading audio (将选定范围的音频上传到 OpenAI？), replacing the open project (开启另一份字幕／项目？), and leaving a cue with unapplied edits (尚有未套用的编辑).
- Title is the question. Content states the range or scope, what leaves the machine, possible cost, and what will not happen (不会自动修改字幕).
- The OK label repeats the action (确认上传并分析, 替换当前项目, 套用并跳转); Cancel says where it returns (返回, 留在当前字幕, 取消).
- The preview renders antd's static confirm panel; in the app it opens over `mask` with `shadow-overlay` on `overlay`.
- The YouTube import modal (可选 YouTube 导入, 650px wide) uses the same Modal with `footer={null}` and is not built here.
