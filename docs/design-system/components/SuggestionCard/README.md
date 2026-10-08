# SuggestionCard

A transcription suggestion awaiting a decision: target cue, status tag, the two-column `DiffText` comparison, the suggested speakers, a review hint, and the actions.

- Status tag: `blue` 待确认 for an ordinary pending suggestion, `orange` 需人工复核 when it involves several speakers, overlap, or crosses a cue or range boundary; after a decision, 已接受 or 已拒绝, and the card fades to `opacity-settled`.
- Actions: `primary` 接受 (确认后接受 when review is needed), 拒绝, and 定位字幕, which selects the target cue. Accept and reject lock while the cue editor has unapplied changes (`draftDirty`).
- Suggestions never change text or speakers on their own. Every acceptance is an explicit click and is undoable.
- The hint line names what to check: 以音频转录为依据，请确认忠实度与繁体用字。, or for review cases 多人、重叠或跨句／范围边界：请对照音频确认文字与时间。
