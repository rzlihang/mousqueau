# Alert

Ant Design's `Alert`, used for standing explanations next to the controls they affect, never for transient results.

- `info` (`tag-blue-bg`, `tag-blue-border`) explains a constraint or a consequence: how to enable analysis, what SRT export drops.
- `warning` (`warning-bg`, `warning-border`) says a dependency is missing and what still works without it.
- No icon, no title: one or two sentences. Stack alerts with `.notice` (`space-16` above).
- Transient results go through antd `message` (已保存：<path>, errors as `message.error`).
