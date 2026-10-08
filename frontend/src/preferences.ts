import { LANGUAGE_NAMES, type LanguageChoice, type Messages } from "./i18n";

export type ThemeChoice = "system" | "light" | "dark";

export function themeOptions(t: Messages): {
  label: string;
  value: ThemeChoice;
}[] {
  return [
    { label: t.theme.system, value: "system" },
    { label: t.theme.light, value: "light" },
    { label: t.theme.dark, value: "dark" },
  ];
}

export function languageOptions(t: Messages): {
  label: string;
  value: LanguageChoice;
}[] {
  return [
    { label: t.language.system, value: "system" },
    { label: LANGUAGE_NAMES["zh-CN"], value: "zh-CN" },
    { label: LANGUAGE_NAMES["en-US"], value: "en-US" },
  ];
}

export function languageChoice(
  value: string | null | undefined,
): LanguageChoice {
  return value === "zh-CN" || value === "en-US" ? value : "system";
}

export function themeChoice(value: string | null | undefined): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveDark(theme: ThemeChoice, systemDark: boolean): boolean {
  return theme === "dark" || (theme === "system" && systemDark);
}

export type ToolLike = { path: string; custom: boolean; ready: boolean };

// A configured location that does not work is reported as such, instead of
// looking like the tool was never installed.
export function toolLabel(tool: ToolLike, t: Messages): string {
  return tool.ready
    ? t.common.ready
    : tool.custom
      ? t.common.invalidLocation
      : t.common.notInstalled;
}

export const SECTIONS = ["general", "tools", "providers", "updates"] as const;
export type SectionId = (typeof SECTIONS)[number];

// Every settings row carries the words it can be found by, in both
// languages, so a search works whichever language is shown.
const KEYWORDS = {
  theme: "主题 外观 深色 浅色 跟随系统 theme appearance dark light system",
  language: "语言 中文 简体 英文 英语 跟随系统 language chinese english system",
  startup: "启动 上次 项目 打开 launch startup last project open",
  setup: "初始设置 欢迎 重新运行 setup welcome initial",
  ffmpeg:
    "ffmpeg 外部工具 位置 路径 媒体 音频 external tools location path media audio",
  ytdlp:
    "yt-dlp ytdlp youtube 外部工具 位置 路径 下载 external tools location path download",
  provDefault:
    "供应商 provider 分析 转录 说话人 默认 openai analysis transcription speaker default",
  provOpenai:
    "供应商 provider openai api 密钥 key 钥匙串 keychain openai_api_key 上传 upload",
  provAdd: "供应商 provider 添加 add",
  updates:
    "更新 检查更新 版本 自动 测试版 beta update check version automatic github",
};
export type SettingRow = keyof typeof KEYWORDS;

const ROWS: Record<SectionId, SettingRow[]> = {
  general: ["theme", "language", "startup", "setup"],
  tools: ["ffmpeg", "ytdlp"],
  providers: ["provDefault", "provOpenai", "provAdd"],
  updates: ["updates"],
};

export function matchSettings(query: string): {
  rows: Record<SettingRow, boolean>;
  sections: Record<SectionId, boolean>;
  any: boolean;
} {
  const needle = query.trim().toLowerCase();
  const rows = {} as Record<SettingRow, boolean>;
  for (const key of Object.keys(KEYWORDS) as SettingRow[])
    rows[key] = !needle || KEYWORDS[key].includes(needle);
  const sections = {} as Record<SectionId, boolean>;
  for (const id of SECTIONS) sections[id] = ROWS[id].some((r) => rows[r]);
  return { rows, sections, any: Object.values(sections).some(Boolean) };
}

export function formatChecked(iso: string, t: Messages): string {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return t.settings.neverChecked;
  const pad = (n: number) => String(n).padStart(2, "0");
  return t.settings.lastChecked(
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`,
  );
}
