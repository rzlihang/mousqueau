import { describe, expect, it } from "vitest";
import { cueIssues, issueLimit, qualityIssues, readingRate } from "./quality";

const cue = (id: string, start: number, end: number, text: string) => ({
  id,
  start,
  end,
  text,
});

describe("quality checks", () => {
  it("passes an ordinary cue", () => {
    expect(cueIssues(cue("a", 0, 3, "我們今天要討論新的字幕編集器。"))).toEqual([]);
    expect(cueIssues(cue("a", 0, 3, "We should talk about the editor."))).toEqual(
      [],
    );
  });
  it("flags a cue that starts before the previous one ends", () => {
    const cues = [cue("a", 0, 2, "一"), cue("b", 1.5, 3.5, "二"), cue("c", 3.5, 5, "三")];
    expect([...qualityIssues(cues)]).toEqual([["b", ["overlap"]]]);
  });
  it("flags durations outside the limits, allowing for rounding", () => {
    expect(cueIssues(cue("a", 0, 0.5, "好"))).toEqual(["short"]);
    expect(cueIssues(cue("a", 1, 1.833, "好"))).toEqual([]);
    expect(cueIssues(cue("a", 0, 7.2, "好"))).toEqual(["long"]);
    expect(cueIssues(cue("a", 0, 7, "好"))).toEqual([]);
  });
  it("measures reading speed by script", () => {
    // Ten full-width characters in one second: over 9 per second.
    expect(cueIssues(cue("a", 0, 1, "一二三四五六七八九十"))).toEqual(["fast"]);
    expect(cueIssues(cue("a", 0, 1, "Twenty characters ok"))).toEqual([]);
    expect(cueIssues(cue("a", 0, 1, "Twenty-one characters"))).toEqual(["fast"]);
    // Half-width characters count as half in CJK text; line breaks as nothing.
    expect(readingRate("字幕 AB\n字幕", 0, 1)).toBe(5.5);
  });
  it("flags long lines and too many lines", () => {
    expect(cueIssues(cue("a", 0, 5, "一二三四五六七八九十一二三四五六七"))).toEqual([
      "wide",
    ]);
    expect(cueIssues(cue("a", 0, 5, "一\n二\n三"))).toEqual(["lines"]);
    expect(cueIssues(cue("a", 0, 5, "x".repeat(43)))).toEqual(["wide"]);
    expect(cueIssues(cue("a", 0, 5, "一\n\n二"))).toEqual([]);
  });
  it("leaves an empty cue to its timing checks", () => {
    expect(cueIssues(cue("a", 0, 3, " \n"))).toEqual([]);
  });
  it("names the limit of an issue", () => {
    expect(issueLimit("fast", "字幕")).toBe("9");
    expect(issueLimit("fast", "text")).toBe("20");
    expect(issueLimit("wide", "text")).toBe("42");
    expect(issueLimit("short", "")).toBe("0.83");
    expect(issueLimit("overlap", "")).toBe("");
  });
});
