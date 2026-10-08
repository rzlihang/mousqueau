# AppHeader

The window's top bar: the product name in `brand`, the `subtitle` line, and the file actions on the right, on `panel` with a `line` rule below.

- Actions go in workflow order: 导入媒体, 导入 SRT, 开启项目, 保存项目, 导出 SRT. Only 导出 SRT is `type="primary"`.
- Append ` •` to 保存项目 while there are unsaved or unapplied edits. That dot is the only dirty-state signal in the header.
- Disable file actions while the backend is busy. 导入媒体 and 保存项目 also need the cue draft applied first.
- The right padding (110px) leaves room for the `ThemeToggle`, which sits absolutely at the top right. Pass it as a child.
- Below `bp-two-column` the actions wrap under the name.
