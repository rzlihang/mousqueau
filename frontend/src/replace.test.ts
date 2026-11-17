import { describe, expect, it } from "vitest";
import { countMatches } from "./replace";

describe("countMatches", () => {
  const cues = [
    { text: "Editor and editor" },
    {
      text: "- the editor\n- 編集器",
      lines: [{ text: "the editor" }, { text: "編集器" }],
    },
    { text: "a.b (c)" },
  ];
  it("counts matches and the cues that have them", () => {
    expect(countMatches(cues, "editor", false)).toEqual({ matches: 3, cues: 2 });
    expect(countMatches(cues, "editor", true)).toEqual({ matches: 2, cues: 2 });
    expect(countMatches(cues, "編集", true)).toEqual({ matches: 1, cues: 1 });
    expect(countMatches(cues, "", true)).toEqual({ matches: 0, cues: 0 });
  });
  it("takes the text literally", () => {
    expect(countMatches(cues, ".", true)).toEqual({ matches: 1, cues: 1 });
    expect(countMatches(cues, "(c)", true)).toEqual({ matches: 1, cues: 1 });
  });
  it("searches a cue with several speakers by line, without its dashes", () => {
    expect(countMatches(cues, "- ", true)).toEqual({ matches: 0, cues: 0 });
  });
});
