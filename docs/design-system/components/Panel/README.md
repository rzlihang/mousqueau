# Panel

One workspace column: `panel` fill, 1px `line` border, `radius-panel`, `space-18` padding, scrolling on overflow. No shadow.

- Title in `panel-title`. Add a muted count after it when the panel lists things (`4 句`, `4 待审`).
- Put panel-level actions (撤销 / 重做) in `extra`; they render on the heading row.
- Use `className` `media-panel`, `cues-panel` or `review-panel` to get the workspace's column behaviour. `cues-panel` turns the panel into a column with its own scrolling list.
- A panel may hold a second section: start it with another `h2` (校正建议 under 说话人管理).
