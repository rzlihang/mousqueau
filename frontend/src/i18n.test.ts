import { describe, expect, it } from "vitest";
import {
  type Messages,
  errorText,
  initialLocale,
  matchLocale,
  messagesFor,
} from "./i18n";

// Describes a dictionary by its keys, the kind of each value, and the length
// of each list, so both languages can be compared entry for entry.
function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape);
  if (typeof value === "function") return `function/${value.length}`;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, shape(v)]),
    );
  return typeof value;
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return [String(value(1, 1))];
  if (value && typeof value === "object")
    return Object.values(value).flatMap(strings);
  return [];
}

describe("i18n", () => {
  const zh = messagesFor("zh-CN");
  const en = messagesFor("en-US");

  it("translates every entry", () => {
    expect(shape(en)).toEqual(shape(zh));
    for (const text of strings(en))
      expect(text, "Chinese left in English").not.toMatch(/[　-鿿＀-￯]/);
    for (const text of [...strings(zh), ...strings(en)])
      expect(text.trim()).not.toBe("");
  });

  it("matches Go's choice of language", () => {
    expect(matchLocale("zh-Hans-CN")).toBe("zh-CN");
    expect(matchLocale("zh_TW")).toBe("zh-CN");
    expect(matchLocale("en-GB")).toBe("en-US");
    expect(matchLocale("ja")).toBeNull();
    expect(matchLocale(undefined)).toBeNull();
    expect(initialLocale("zh-CN", ["en-US"])).toBe("zh-CN");
    expect(initialLocale(null, ["ja-JP", "zh-CN"])).toBe("zh-CN");
    expect(initialLocale("klingon", ["fr"])).toBe("en-US");
  });

  it("pluralizes English counts", () => {
    const t: Messages = en;
    expect(t.common.cues(1)).toBe("1 cue");
    expect(t.common.cues(3)).toBe("3 cues");
    expect(zh.common.cues(3)).toBe("3 句");
  });

  it("shows only the message of a failed call", () => {
    class RuntimeError extends Error {
      name = "RuntimeError";
    }
    expect(errorText(new RuntimeError("请先导入 SRT 字幕"))).toBe(
      "请先导入 SRT 字幕",
    );
    expect(errorText("plain")).toBe("plain");
  });
});
