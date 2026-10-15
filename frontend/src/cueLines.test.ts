import { describe, expect, it } from "vitest";
import {
  extract,
  joinText,
  joinUp,
  lineSpeakers,
  relines,
  renderLines,
  survivingSpeakers,
} from "./cueLines";

const crosstalk = "这是没钱 要钱了呗 要没钱 要钱了呗";

describe("extract", () => {
  it("moves a selected word of an ordinary cue to a new line", () => {
    const start = crosstalk.indexOf("要钱了呗");
    const got = extract(crosstalk, null, ["C"], start, start + 4, "A");
    expect(got).toEqual({
      lines: [
        { text: "这是没钱 要没钱 要钱了呗", speakerIds: ["C"] },
        { text: "要钱了呗", speakerIds: ["A"] },
      ],
    });
    if (!("lines" in got)) throw new Error("no lines");
    const text = renderLines(got.lines);
    expect(text).toBe("- 这是没钱 要没钱 要钱了呗\n- 要钱了呗");

    // A second pick works on the row it was made in, after its dash.
    const s = text.indexOf("要没钱");
    expect(extract(text, got.lines, [], s, s + 3, "B")).toEqual({
      lines: [
        { text: "这是没钱 要钱了呗", speakerIds: ["C"] },
        { text: "要钱了呗", speakerIds: ["A"] },
        { text: "要没钱", speakerIds: ["B"] },
      ],
    });
  });

  it("joins unspaced text without a space and unwraps rows", () => {
    const got = extract("我们走吧你先\n回去", null, [], 4, 6);
    expect(got).toEqual({
      lines: [
        { text: "我们走吧回去", speakerIds: [] },
        { text: "你先", speakerIds: [] },
      ],
    });
  });

  it("reassigns a whole row and drops it from its place", () => {
    const lines = [
      { text: "甲", speakerIds: ["A"] },
      { text: "乙", speakerIds: [] },
    ];
    const text = renderLines(lines);
    expect(extract(text, lines, [], 6, 7, "B")).toEqual({
      lines: [
        { text: "甲", speakerIds: ["A"] },
        { text: "乙", speakerIds: ["B"] },
      ],
    });
  });

  it("refuses empty and cross-row selections", () => {
    expect(extract("abc", null, [], 1, 1, "A")).toEqual({ error: "empty" });
    expect(extract("a   b", null, [], 1, 3, "A")).toEqual({ error: "empty" });
    const lines = [
      { text: "one", speakerIds: [] },
      { text: "two", speakerIds: [] },
    ];
    expect(extract(renderLines(lines), lines, [], 3, 9, "A")).toEqual({
      error: "acrossLines",
    });
    // Selecting only the dash leaves nothing to move.
    expect(extract(renderLines(lines), lines, [], 0, 2, "A")).toEqual({
      error: "empty",
    });
  });
});

describe("relines", () => {
  it("keeps speakers by row and drops back to one line", () => {
    const prev = [
      { text: "a", speakerIds: ["A"] },
      { text: "b", speakerIds: ["B"] },
    ];
    expect(relines("- a!\n-b\nnew", prev)).toEqual([
      { text: "a!", speakerIds: ["A"] },
      { text: "b", speakerIds: ["B"] },
      { text: "new", speakerIds: [] },
    ]);
    expect(relines("- only", prev)).toBeNull();
  });
});

describe("joining", () => {
  it("keeps spaces where the text uses them", () => {
    const lines = [
      { text: "这是没钱 要没钱", speakerIds: ["C"] },
      { text: "要钱了呗", speakerIds: ["A"] },
    ];
    expect(joinUp(lines, 1)).toEqual([
      { text: "这是没钱 要没钱 要钱了呗", speakerIds: ["C"] },
    ]);
    expect(
      joinUp(
        [
          { text: "對。", speakerIds: [] },
          { text: "好", speakerIds: [] },
        ],
        1,
      )[0].text,
    ).toBe("對。好");
    expect(joinText("Hello", "there")).toBe("Hello there");
  });

  it("lists speakers once", () => {
    expect(
      lineSpeakers([
        { text: "a", speakerIds: ["B", "A"] },
        { text: "b", speakerIds: ["A"] },
      ]),
    ).toEqual(["B", "A"]);
  });
});

describe("one line per speaker", () => {
  it("adds words to the line the speaker already has", () => {
    const lines = [
      { text: "这是没钱 要没钱", speakerIds: ["C"] },
      { text: "要钱了呗", speakerIds: ["A"] },
    ];
    const text = renderLines(lines);
    const s = text.indexOf("要没钱");
    expect(extract(text, lines, [], s, s + 3, "A")).toEqual({
      lines: [
        { text: "这是没钱", speakerIds: ["C"] },
        { text: "要钱了呗 要没钱", speakerIds: ["A"] },
      ],
    });
  });

  it("leaves words that already are the speaker's", () => {
    const lines = [
      { text: "甲乙", speakerIds: ["A"] },
      { text: "丙", speakerIds: [] },
    ];
    expect(extract(renderLines(lines), lines, [], 2, 3, "A")).toEqual({
      error: "sameSpeaker",
    });
    expect(extract("甲乙", null, ["A"], 0, 1, "A")).toEqual({
      error: "sameSpeaker",
    });
  });

  it("gives unassigned words a line of their own", () => {
    const lines = [
      { text: "甲", speakerIds: [] },
      { text: "乙丙", speakerIds: ["A"] },
    ];
    const got = extract(renderLines(lines), lines, [], 7, 8);
    expect(got).toEqual({
      lines: [
        { text: "甲", speakerIds: [] },
        { text: "乙", speakerIds: ["A"] },
        { text: "丙", speakerIds: [] },
      ],
    });
  });
});

describe("survivingSpeakers", () => {
  const lines = [
    { text: "这是没钱", speakerIds: ["C"] },
    { text: "要钱了呗", speakerIds: ["A"] },
  ];
  it("drops a deleted row's speaker", () => {
    expect(survivingSpeakers("- 这是没钱", lines)).toEqual(["C"]);
  });
  it("keeps both when rows were joined", () => {
    expect(survivingSpeakers("- 这是没钱- 要钱了呗", lines)).toEqual(["C", "A"]);
  });
  it("is unassigned when the text was rewritten", () => {
    expect(survivingSpeakers("全新的话", lines)).toEqual([]);
  });
});
