# SpeakerManager

The top of the review panel: the speaker list with 编辑名称 buttons and the form that adds or renames a speaker.

- The consumer passes the project's speakers and handles `onSave` (the app calls `Editor.SetSpeaker`, which is undoable).
- New speakers get the next color from `SPEAKER_COLORS`; existing ones keep theirs.
- Saving needs both an ID and a name. Placeholders give the expected shape: 说话人 ID（A / B / C）, 显示名称，例如：主持人.
- Explain once, in `caption`, that labels from different analysis ranges are numbered independently.
