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
  const tw = messagesFor("zh-TW");
  const en = messagesFor("en-US");

  it("translates every entry", () => {
    expect(shape(en)).toEqual(shape(zh));
    expect(shape(tw)).toEqual(shape(zh));
    for (const text of strings(en))
      expect(text, "Chinese left in English").not.toMatch(/[　-鿿＀-￯]/);
    for (const text of [...strings(zh), ...strings(tw), ...strings(en)])
      expect(text.trim()).not.toBe("");
  });

  it("keeps mainland and Taiwan usage apart", () => {
    // Taiwan wording that mainland Chinese replaces.
    const taiwanTerms =
      /本机|开启|载入|套用|辨识|资料|选取|指派|档案|专案|汇入|汇出|储存|设定|视讯|音讯|影片/;
    for (const text of strings(zh)) expect(text).not.toMatch(taiwanTerms);
    // Simplified characters that never appear in Traditional text.
    const simplified =
      /[设说话们这时间语录载请删选择关闭开导输应帮显认网络资讯处级态没为经将个与实无发现后边别么换项档锁钥软动态录颜标签图层]/;
    for (const text of strings(tw)) expect(text).not.toMatch(simplified);
  });

  it("matches Go's choice of language", () => {
    expect(matchLocale("zh-Hans-CN")).toBe("zh-CN");
    expect(matchLocale("zh_TW")).toBe("zh-TW");
    expect(matchLocale("zh-Hant-HK")).toBe("zh-TW");
    expect(matchLocale("zh-Hans-TW")).toBe("zh-CN");
    expect(matchLocale("zh-SG")).toBe("zh-CN");
    expect(matchLocale("zh-TW")).toBe("zh-TW");
    expect(matchLocale("en-GB")).toBe("en-US");
    expect(matchLocale("ja")).toBeNull();
    expect(matchLocale(undefined)).toBeNull();
    expect(initialLocale("zh-CN", ["en-US"])).toBe("zh-CN");
    expect(initialLocale("zh-TW", ["en-US"])).toBe("zh-TW");
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
