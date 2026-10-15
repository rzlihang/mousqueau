import { describe, expect, it } from "vitest";
import { messagesFor } from "./i18n";
import {
  fontStack,
  formatChecked,
  languageChoice,
  languageOptions,
  initialSystemDark,
  matchSettings,
  providerCaution,
  resolveDark,
  themeChoice,
  toolLabel,
} from "./preferences";

const zh = messagesFor("zh-CN");
const en = messagesFor("en-US");

describe("preferences", () => {
  it("uses the native system appearance before the webview media query catches up", () => {
    expect(initialSystemDark("?systemTheme=dark", false)).toBe(true);
    expect(initialSystemDark("?systemTheme=light", true)).toBe(false);
    expect(initialSystemDark("", true)).toBe(true);
    expect(initialSystemDark("?systemTheme=invalid", false)).toBe(false);
  });
  it("resolves the theme against the system appearance", () => {
    expect(resolveDark("system", true)).toBe(true);
    expect(resolveDark("system", false)).toBe(false);
    expect(resolveDark("light", true)).toBe(false);
    expect(resolveDark("dark", false)).toBe(true);
    expect(themeChoice("dark")).toBe("dark");
    expect(themeChoice("neon")).toBe("system");
    expect(themeChoice(null)).toBe("system");
    expect(languageChoice("en-US")).toBe("en-US");
    expect(languageChoice("zh-TW")).toBe("zh-TW");
    expect(languageChoice("zh-HK")).toBe("zh-HK");
    expect(languageChoice("ja-JP")).toBe("ja-JP");
    expect(languageChoice("ja")).toBe("system");
    expect(languageChoice("zh-MO")).toBe("system");
    expect(languageOptions(en).map((o) => o.value)).toEqual([
      "system",
      "zh-CN",
      "zh-TW",
      "zh-HK",
      "ja-JP",
      "en-US",
    ]);
    expect(languageOptions(en).map((o) => o.label)).toEqual([
      "System",
      "简体中文",
      "台湾正体",
      "香港繁体",
      "日本語",
      "English (US)",
    ]);
  });

  it("builds the subtitle font stack", () => {
    const ui = "var(--ui-font)";
    expect(fontStack("")).toBe(ui);
    expect(fontStack("  ")).toBe(ui);
    expect(fontStack("PingFang TC")).toBe(`"PingFang TC", ${ui}`);
    expect(fontStack("serif")).toBe(`serif, ${ui}`);
  });

  it("distinguishes a wrong tool location from a missing tool", () => {
    expect(toolLabel({ path: "/x", custom: false, ready: true }, zh)).toBe(
      "已就绪",
    );
    expect(toolLabel({ path: "/x", custom: true, ready: false }, zh)).toBe(
      "位置无效",
    );
    expect(toolLabel({ path: "", custom: false, ready: false }, zh)).toBe(
      "未安装",
    );
    expect(toolLabel({ path: "/x", custom: true, ready: false }, en)).toBe(
      "Invalid location",
    );
  });

  it("warns about providers under Chinese law and custom endpoints only", () => {
    expect(
      providerCaution({ caution: false, region: "international" }, zh),
    ).toBeUndefined();
    expect(providerCaution({ caution: true, region: "china" }, zh)).toBe(
      zh.settings.cautionChina,
    );
    expect(providerCaution({ caution: true, region: "custom" }, en)).toBe(
      en.settings.cautionCustom,
    );
    expect(matchSettings("腾讯").rows.provAdd).toBe(true);
  });

  it("filters settings rows and their sections by keyword", () => {
    const all = matchSettings("  ");
    expect(all.any).toBe(true);
    expect(Object.values(all.rows).every(Boolean)).toBe(true);

    const key = matchSettings("密钥");
    expect(key.rows.provList).toBe(true);
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

    // Either language finds the same rows.
    expect(matchSettings("Keychain").rows).toEqual(key.rows);
    expect(matchSettings("语言").rows.language).toBe(true);
    expect(matchSettings("language").sections.general).toBe(true);
    expect(matchSettings("字體").rows.font).toBe(true);
    expect(matchSettings("字体").rows.font).toBe(true);
    expect(matchSettings("金鑰").rows.provList).toBe(true);
    expect(matchSettings("キーチェーン").rows).toEqual(key.rows);
    expect(matchSettings("言語").rows.language).toBe(true);
    expect(matchSettings("日本語").rows.language).toBe(true);
    expect(matchSettings("フォント").rows.font).toBe(true);
    expect(matchSettings("アップデート").sections).toEqual({
      general: false,
      tools: false,
      providers: false,
      updates: true,
    });

    expect(matchSettings("没有这个设置").any).toBe(false);
  });

  it("formats the last update check in local time", () => {
    expect(formatChecked("", zh)).toBe("尚未检查");
    expect(formatChecked("not a date", en)).toBe("Never checked");
    const local = new Date(2026, 9, 8, 9, 5);
    expect(formatChecked(local.toISOString(), zh)).toBe(
      "上次检查：2026-10-08 09:05",
    );
    expect(formatChecked(local.toISOString(), en)).toBe(
      "Last checked: 2026-10-08 09:05",
    );
  });
});
