import { describe, expect, it } from "vitest";
import {
  cueStatus,
  filterCues,
  formatSeconds,
  majorStep,
  peakBetween,
  zoomToPps,
} from "./workspace";

const cue = (
  id: string,
  text: string,
  speakerIds: string[] = ["A"],
  review = false,
) => ({
  id,
  text,
  start: 0,
  end: 1,
  review,
  speakerIds,
});

describe("workspace helpers", () => {
  it("derives cue status from flags and pending suggestions only", () => {
    const suggestions = [
      { cueId: "a", status: "pending", review: false },
      { cueId: "b", status: "pending", review: true },
      { cueId: "c", status: "accepted", review: true },
    ];
    expect(cueStatus(cue("a", ""), suggestions)).toBe("pending");
    expect(cueStatus(cue("b", ""), suggestions)).toBe("review");
    expect(cueStatus(cue("c", ""), suggestions)).toBeNull();
    expect(cueStatus(cue("d", "", [], true), suggestions)).toBe("review");
  });
  it("filters by text, open work and unassigned speakers", () => {
    const cues = [
      cue("a", "字幕編集器"),
      cue("b", "說話人", []),
      cue("c", "其他", ["B"], true),
    ];
    expect(filterCues(cues, [], "編集", "all").map((c) => c.id)).toEqual(["a"]);
    expect(filterCues(cues, [], "", "unknown").map((c) => c.id)).toEqual(["b"]);
    expect(
      filterCues(
        cues,
        [{ cueId: "a", status: "pending", review: false }],
        "",
        "todo",
      ).map((c) => c.id),
    ).toEqual(["a", "c"]);
  });
  it("formats whole seconds and maps zoom to readable ruler steps", () => {
    expect(formatSeconds(3661.9)).toBe("01:01:01");
    expect(zoomToPps(0)).toBeCloseTo(4);
    expect(zoomToPps(100)).toBeCloseTo(200);
    expect(majorStep(200)).toBe(1);
    expect(majorStep(30)).toBe(5);
    expect(majorStep(4)).toBe(30);
  });
  it("keeps the loudest peak in a window", () => {
    const peaks = [0, 10, 80, 5, 0];
    expect(peakBetween(peaks, 1, 1, 3)).toBe(80);
    expect(peakBetween(peaks, 1, 3.2, 3.4)).toBe(5);
    expect(peakBetween(peaks, 1, 9, 10)).toBe(0);
  });
});
