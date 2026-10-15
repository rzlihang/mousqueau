import {
  LANGUAGE_NAMES,
  LOCALES,
  type LanguageChoice,
  type Messages,
  isLocale,
} from "./i18n";

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
    ...LOCALES.map((value) => ({ label: LANGUAGE_NAMES[value], value })),
  ];
}

export function languageChoice(
  value: string | null | undefined,
): LanguageChoice {
  return isLocale(value) ? value : "system";
}

// Font families that ship with macOS or are common for Chinese subtitles;
// any other installed family can be typed in.
export const FONT_PRESETS = [
  "PingFang TC",
  "PingFang SC",
  "PingFang HK",
  "Songti TC",
  "Songti SC",
  "Heiti TC",
  "Heiti SC",
  "Kaiti TC",
  "Kaiti SC",
  "Noto Sans TC",
  "Noto Serif TC",
];
const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
]);
const INTERFACE_FONTS = 'system-ui, -apple-system, "Noto Sans TC", sans-serif';

// The CSS font-family for subtitle text: the chosen family, then the
// interface fonts for anything it lacks. Go rejects names with quotes or
// other characters that would need escaping here.
export function fontStack(family: string): string {
  const name = family.trim();
  if (!name) return INTERFACE_FONTS;
  const first = GENERIC_FAMILIES.has(name.toLowerCase()) ? name : `"${name}"`;
  return `${first}, ${INTERFACE_FONTS}`;
}

export function themeChoice(value: string | null | undefined): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveDark(theme: ThemeChoice, systemDark: boolean): boolean {
  return theme === "dark" || (theme === "system" && systemDark);
}

export function initialSystemDark(search: string, mediaDark: boolean): boolean {
  const native = new URLSearchParams(search).get("systemTheme");
  return native === "dark" || (native !== "light" && mediaDark);
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

// Every settings row carries the words it can be found by, in every
// language, so a search works whichever language is shown.
const KEYWORDS = {
  theme:
    "主题 外观 深色 浅色 跟随系统 主題 外觀 淺色 跟隨系統 theme appearance dark light system",
  language:
    "语言 中文 简体 繁体 英文 英语 語言 簡體 繁體 英語 台灣 香港 台湾正体 香港繁体 language chinese traditional english system",
  font: "字幕 字体 字體 字型 预览 預覽 subtitle font typeface",
  startup:
    "启动 上次 项目 打开 啟動 專案 開啟 launch startup last project open",
  setup: "初始设置 欢迎 重新运行 初始設定 歡迎 重新執行 setup welcome initial",
  ffmpeg:
    "ffmpeg 外部工具 位置 路径 媒体 音频 路徑 媒體 音訊 external tools location path media audio",
  ytdlp:
    "yt-dlp ytdlp youtube 外部工具 位置 路径 下载 路徑 下載 external tools location path download",
  provDefault:
    "供应商 分析 转录 说话人 默认 轉錄 說話者 預設 provider openai analysis transcription speaker default",
  provList:
    "供应商 密钥 钥匙串 凭据 密钥环 上传 模型 地址 金鑰 鑰匙圈 憑證 認證管理員 金鑰圈 上傳 網址 provider api key keychain keyring credential openai_api_key upload model endpoint url openai deepgram assemblyai elevenlabs alibaba dashscope 阿里云 百炼 阿里雲 百煉 tencent 腾讯 騰訊 custom 自定义 自訂",
  provAdd:
    "供应商 添加 加入 provider add openai deepgram assemblyai elevenlabs alibaba dashscope 阿里云 百炼 阿里雲 百煉 tencent 腾讯 騰訊 custom 自定义 自訂",
  updates:
    "更新 检查更新 版本 自动 测试版 檢查更新 自動 測試版 beta update check version automatic github",
};
export type SettingRow = keyof typeof KEYWORDS;

const ROWS: Record<SectionId, SettingRow[]> = {
  general: ["theme", "language", "font", "startup", "setup"],
  tools: ["ffmpeg", "ytdlp"],
  providers: ["provDefault", "provList", "provAdd"],
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

// The warning shown before audio goes to a provider under mainland Chinese
// law or to a custom endpoint; undefined for the others.
export function providerCaution(
  provider: { caution: boolean; region: string },
  t: Messages,
): string | undefined {
  if (!provider.caution) return undefined;
  return provider.region === "china"
    ? t.settings.cautionChina
    : t.settings.cautionCustom;
}
