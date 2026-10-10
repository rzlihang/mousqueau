export type ThemeChoice = "system" | "light" | "dark";

export const THEME_OPTIONS: { label: string; value: ThemeChoice }[] = [
  { label: "跟随系统", value: "system" },
  { label: "浅色", value: "light" },
  { label: "深色", value: "dark" },
];

export function themeChoice(value: string | null | undefined): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveDark(theme: ThemeChoice, systemDark: boolean): boolean {
  return theme === "dark" || (theme === "system" && systemDark);
}

export type ToolLike = { path: string; custom: boolean; ready: boolean };

// A configured location that does not work is reported as such, instead of
// looking like the tool was never installed.
export function toolLabel(tool: ToolLike): string {
  return tool.ready ? "已就绪" : tool.custom ? "位置无效" : "未安装";
}

export const SECTIONS = [
  { id: "general", label: "通用" },
  { id: "tools", label: "外部工具" },
  { id: "providers", label: "供应商" },
  { id: "updates", label: "更新" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];

// Every settings row carries the words it can be found by.
const KEYWORDS = {
  theme: "主题 外观 深色 浅色 跟随系统 dark light theme",
  startup: "启动 上次 项目 打开",
  setup: "初始设置 欢迎 重新运行 setup welcome",
  ffmpeg: "ffmpeg 外部工具 位置 路径 媒体 音频",
  ytdlp: "yt-dlp ytdlp youtube 外部工具 位置 路径 下载",
  provDefault: "供应商 provider 分析 转录 说话人 默认 openai",
  provOpenai:
    "供应商 provider openai api 密钥 key 钥匙串 凭据 密钥环 keyring openai_api_key 上传",
  provAdd: "供应商 provider 添加",
  updates: "更新 检查更新 版本 自动 测试版 beta update version github",
};
export type SettingRow = keyof typeof KEYWORDS;

const ROWS: Record<SectionId, SettingRow[]> = {
  general: ["theme", "startup", "setup"],
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
  for (const { id } of SECTIONS) sections[id] = ROWS[id].some((r) => rows[r]);
  return { rows, sections, any: Object.values(sections).some(Boolean) };
}

export function formatChecked(iso: string): string {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "尚未检查";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `上次检查：${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
