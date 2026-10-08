import { describe, expect, it } from "vitest";
import {
  formatChecked,
  matchSettings,
  resolveDark,
  themeChoice,
  toolLabel,
} from "./preferences";

describe("preferences", () => {
  it("resolves the theme against the system appearance", () => {
    expect(resolveDark("system", true)).toBe(true);
    expect(resolveDark("system", false)).toBe(false);
    expect(resolveDark("light", true)).toBe(false);
    expect(resolveDark("dark", false)).toBe(true);
    expect(themeChoice("dark")).toBe("dark");
    expect(themeChoice("neon")).toBe("system");
    expect(themeChoice(null)).toBe("system");
  });

  it("distinguishes a wrong tool location from a missing tool", () => {
    expect(toolLabel({ path: "/x", custom: false, ready: true })).toBe(
      "已就绪",
    );
    expect(toolLabel({ path: "/x", custom: true, ready: false })).toBe(
      "位置无效",
    );
    expect(toolLabel({ path: "", custom: false, ready: false })).toBe("未安装");
  });

  it("filters settings rows and their sections by keyword", () => {
    const all = matchSettings("  ");
    expect(all.any).toBe(true);
    expect(Object.values(all.rows).every(Boolean)).toBe(true);

    const key = matchSettings("密钥");
    expect(key.rows.provOpenai).toBe(true);
    expect(key.rows.provAdd).toBe(false);
    expect(key.sections).toEqual({
      general: false,
      tools: false,
      providers: true,
      updates: false,
    });

    const tool = matchSettings("YouTube");
    expect(tool.rows.ytdlp).toBe(true);
    expect(tool.rows.ffmpeg).toBe(false);
    expect(tool.sections.tools).toBe(true);

    expect(matchSettings("没有这个设置").any).toBe(false);
  });

  it("formats the last update check in local time", () => {
    expect(formatChecked("")).toBe("尚未检查");
    expect(formatChecked("not a date")).toBe("尚未检查");
    const local = new Date(2026, 9, 8, 9, 5);
    expect(formatChecked(local.toISOString())).toBe(
      "上次检查：2026-10-08 09:05",
    );
  });
});
