import { describe, expect, it } from "vitest";
import {
  codePointOffset,
  cueStatus,
  filterCues,
  formatSeconds,
  majorStep,
  minPps,
  peakBetween,
  ppsToZoom,
  rowWindow,
  splitTime,
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
  it("zooms out far enough to fit long media and back again", () => {
    expect(minPps(60, 800)).toBe(4);
    expect(minPps(3600, 720)).toBeCloseTo(0.2);
    const min = minPps(3600, 720);
    expect(zoomToPps(0, min)).toBeCloseTo(min);
    expect(ppsToZoom(zoomToPps(37, min), min)).toBeCloseTo(37);
    expect(ppsToZoom(1000)).toBe(100);
  });
  it("splits at the playhead inside a cue, otherwise by text", () => {
    expect(splitTime(1, 3, 2.25, 0.5)).toBe(2.25);
    expect(splitTime(1, 3, 3, 0.25)).toBe(1.5);
    expect(splitTime(1, 3, 0, 1 / 3)).toBe(1.667);
    expect(codePointOffset("a😀bc", 3)).toBe(2);
  });
  it("renders only the rows in view plus overscan", () => {
    expect(rowWindow(0, 320, 32, 1000, 2)).toEqual([0, 12]);
    expect(rowWindow(3200, 320, 32, 1000, 2)).toEqual([98, 112]);
    expect(rowWindow(31990, 320, 32, 1000, 2)).toEqual([997, 1000]);
    expect(rowWindow(0, 320, 32, 0)).toEqual([0, 0]);
  });
  it("keeps the loudest peak in a window", () => {
    const peaks = [0, 10, 80, 5, 0];
    expect(peakBetween(peaks, 1, 1, 3)).toBe(80);
    expect(peakBetween(peaks, 1, 3.2, 3.4)).toBe(5);
    expect(peakBetween(peaks, 1, 9, 10)).toBe(0);
  });
});
