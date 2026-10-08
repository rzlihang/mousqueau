# Timecode

The playhead readout in `clock` (24px mono), always SRT time `HH:MM:SS,mmm`.

- Format every time shown to people with `formatTime`, and parse every typed time with `parseTime`, which accepts a comma or a dot and rejects minutes or seconds above 59 with the app's own error.
- Range fields for analysis are in whole seconds (开始（秒）/ 结束（秒）); everything else is SRT time.
