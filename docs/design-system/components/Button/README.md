# Button

Ant Design's `Button` under the Mousqueau theme: `control-height`, `radius-md`, `primary` fill for the main action.

- One `type="primary"` per area: 导出 SRT in the header, 套用编辑 in the editor, 接受 on a suggestion, 上传所选音频并分析 in the media panel.
- Default buttons for everything else; `size="small"` in the status bar and speaker list; `type="text"` small for inline 编辑名称; `danger` only for 取消处理.
- Label with a verb and its object: 导入媒体, 保存说话人, 下载并导入所选字幕. If an action sends data off the machine, the label says so (上传所选音频并分析).
- Disable rather than hide unavailable actions, and never let a disabled state be the only explanation: pair it with an `Alert` or tag that says why (OpenAI 未配置).
