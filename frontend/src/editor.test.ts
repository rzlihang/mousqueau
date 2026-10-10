import { describe, expect, it } from "vitest";
import { activeCue, changedText, formatTime, parseTime } from "./editor";
describe("editing helpers", () => {
  it("seeks only inside a cue and uses end-exclusive boundaries", () => {
    const cues = [
      { start: 1, end: 3 },
      { start: 3, end: 5 },
    ];
    expect(activeCue(cues, 0)).toBeUndefined();
    expect(activeCue(cues, 3)).toBe(cues[1]);
    expect(activeCue(cues, 5)).toBeUndefined();
  });
  it("highlights the Traditional Chinese correction without losing original characters", () => {
    const diff = changedText("字幕編集器", "字幕編輯器");
    expect(
      diff
        .filter((d) => !d.added)
        .map((d) => d.value)
        .join(""),
    ).toBe("字幕編集器");
    expect(
      diff
        .filter((d) => !d.removed)
        .map((d) => d.value)
        .join(""),
    ).toBe("字幕編輯器");
    expect(diff.some((d) => d.added && d.value.includes("輯"))).toBe(true);
  });
  it("handles millisecond rollover and rejects invalid timestamps", () => {
    expect(formatTime(59.9996)).toBe("00:01:00,000");
    expect(parseTime("01:00:00,001", "bad")).toBe(3600.001);
    expect(() => parseTime("00:70:00,000", "bad")).toThrow("bad");
  });
});
