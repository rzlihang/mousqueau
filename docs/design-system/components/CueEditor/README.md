# CueEditor

Edits the selected cue below the list: start and end in SRT time, the text, speakers, and the review flag. Nothing changes until 套用编辑.

- Heading `编辑 #<id>` in `section-title`; a `gold` 尚未套用 tag appears as soon as the draft differs.
- Time inputs use `time-field` (mono). Validate with `parseTime`; reject an end at or before the start with 结束时间必须晚于开始时间。
- Speakers: a multiple `Select` with the placeholder `Unknown · 未指派说话人`.
- Actions: 需要复核 checkbox, `primary` 套用编辑, and 放弃未套用修改. Both buttons stay disabled until the draft is dirty.
- Every applied edit must be undoable in the backend; the component only reports the edited cue through `onApply`.
