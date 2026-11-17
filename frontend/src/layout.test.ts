import { describe, expect, it } from "vitest";
import {
  clamp,
  layoutMode,
  loadLayout,
  timelineSize,
  togglePane,
  viewerSize,
} from "./layout";

describe("editor layout", () => {
  it("picks the arrangement from the window's shape", () => {
    expect(layoutMode(1440, 900)).toBe("wide");
    expect(layoutMode(1000, 720)).toBe("wide");
    // Tiled halves and thirds of a 1920×1080 screen.
    expect(layoutMode(950, 1040)).toBe("column");
    expect(layoutMode(630, 1040)).toBe("column");
    // A rotated monitor.
    expect(layoutMode(1080, 1920)).toBe("column");
    expect(layoutMode(1440, 2560)).toBe("wide");
    // A quarter tile.
    expect(layoutMode(950, 520)).toBe("compact");
    expect(layoutMode(480, 420)).toBe("compact");
  });
  it("keeps sizes apart by arrangement", () => {
    expect(timelineSize("wide")).toBe("timeline");
    expect(timelineSize("column")).toBe("columnTimeline");
    expect(viewerSize("compact")).toBe("compactViewer");
  });
  it("hides and shows panes", () => {
    const hidden = togglePane({ left: 300 }, "viewer");
    expect(hidden).toEqual({ left: 300, hidden: ["viewer"] });
    expect(togglePane(togglePane(hidden, "timeline"), "viewer").hidden).toEqual([
      "timeline",
    ]);
  });
  it("reads stored sizes, dropping what it does not know", () => {
    expect(loadLayout(null)).toEqual({ hidden: [] });
    expect(loadLayout('{"left":300}')).toEqual({ left: 300, hidden: [] });
    expect(loadLayout('{"hidden":["timeline","cues",3]}').hidden).toEqual([
      "timeline",
    ]);
    expect(loadLayout('{"hidden":"viewer"}').hidden).toEqual([]);
    expect(loadLayout("not json")).toEqual({});
    expect(loadLayout("null")).toEqual({});
  });
  it("clamps a dragged size", () => {
    expect(clamp(50.4, 100, 400)).toBe(100);
    expect(clamp(900, 100, 400)).toBe(400);
    expect(clamp(250.6, 100, 400)).toBe(251);
  });
});
