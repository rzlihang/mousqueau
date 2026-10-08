# SpeakerTag

A solid antd `Tag` in the speaker's color with the speaker's name, or a neutral `Unknown` tag when a cue has no speaker.

- Colors come from `speaker-1` to `speaker-3` in order, cycling (the Go analysis palette adds `speaker-4`). Keep a speaker's color once assigned; renaming keeps it.
- Always show the name. White on `speaker-2` is 2.3:1 and on `speaker-1` 4.1:1, so the color is never the only cue.
- A cue may carry several speakers; render one tag each, in assignment order.
