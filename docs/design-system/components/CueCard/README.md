# CueCard

One subtitle cue in the list: `cue-meta` line (identifier and time range), the text in `cue-text`, then speaker tags. The whole card is a button.

- States: hover and `selected` fill with `select` and take a `cue-accent` border; `playing` adds `shadow-playing`, the 3px inset bar. Selected and playing can combine.
- A cue flagged for review shows an `orange` 待复核 tag at the right of the meta line.
- No speakers: show the `Unknown` tag rather than nothing.
- Clicking pauses playback and seeks to the cue start. If the editor has unapplied changes, confirm first (see ConfirmDialog).
- Keep the text pre-wrapped: multi-line SRT cues keep their line breaks.
