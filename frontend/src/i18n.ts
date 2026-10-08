import { createContext, useContext } from "react";
import { enUS } from "./locales/en-US";
import { type Messages, zhCN } from "./locales/zh-CN";
import { zhTW } from "./locales/zh-TW";

export type { Messages };

// Go resolves the language (settings, then the system) and reports it with
// the settings; these dictionaries cover the text the frontend draws.
export const LOCALES = ["zh-CN", "zh-TW", "en-US"] as const;
export type Locale = (typeof LOCALES)[number];
export type LanguageChoice = "system" | Locale;

const MESSAGES: Record<Locale, Messages> = {
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  "en-US": enUS,
};

// Language names are shown in their own language.
export const LANGUAGE_NAMES: Record<Locale, string> = {
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文（台灣）",
  "en-US": "English (US)",
};

export function messagesFor(locale: Locale): Messages {
  return MESSAGES[locale];
}

export function isLocale(value: unknown): value is Locale {
  return (LOCALES as readonly unknown[]).includes(value);
}

// Mirrors Go's i18n.Match: Traditional script, or a Taiwan, Hong Kong or
// Macau region without a script, means Traditional Chinese.
export function matchLocale(tag: string | null | undefined): Locale | null {
  const t = (tag ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (t === "zh" || t.startsWith("zh-")) {
    const parts = t.split("-").slice(1);
    if (parts.includes("hant")) return "zh-TW";
    if (parts.includes("hans")) return "zh-CN";
    return parts.some((p) => p === "tw" || p === "hk" || p === "mo")
      ? "zh-TW"
      : "zh-CN";
  }
  if (t === "en" || t.startsWith("en-")) return "en-US";
  return null;
}

// Before Go answers: the last language used, then the browser's.
export function initialLocale(
  cached: string | null,
  languages: readonly string[],
): Locale {
  if (isLocale(cached)) return cached;
  for (const tag of languages) {
    const locale = matchLocale(tag);
    if (locale) return locale;
  }
  return "en-US";
}

const I18n = createContext<Messages>(enUS);
export const I18nProvider = I18n.Provider;
export function useT(): Messages {
  return useContext(I18n);
}

// Go errors arrive already translated; drop the "RuntimeError:" prefix.
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
