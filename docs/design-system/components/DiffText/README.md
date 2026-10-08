# DiffText

One side of a character-level comparison between the cue text and a transcription suggestion.

- Render it twice, side by side in `.comparison`: `side="original"` strikes removed characters on `diff-removed`; `side="proposed"` sets added characters at weight 600 on `diff-added`.
- Label the columns 分析时原文 and 音频转录建议 in `micro-label`.
- Character granularity matters for Chinese: a one-character fix (編集 → 編輯) must be visible without reading the whole line.
- The diff is a hand-written LCS with the same output shape as `diffChars` from the `diff` package, which the app uses.
