import { createContext, useContext } from "react";
import { enUS } from "./locales/en-US";
import { type Messages, zhCN } from "./locales/zh-CN";
import { zhHK } from "./locales/zh-HK";
import { zhTW } from "./locales/zh-TW";

export type { Messages };

// Go resolves the language (settings, then the system) and reports it with
// the settings; these dictionaries cover the text the frontend draws.
// zh-HK reuses the Taiwan dictionary except for keys in zhHKOverrides.
export const LOCALES = ["zh-CN", "zh-TW", "zh-HK", "en-US"] as const;
export type Locale = (typeof LOCALES)[number];
export type LanguageChoice = "system" | Locale;

const MESSAGES: Record<Locale, Messages> = {
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  "zh-HK": zhHK,
  "en-US": enUS,
};

// Menu labels for each locale. Taiwan and Hong Kong use these exact names.
export const LANGUAGE_NAMES: Record<Locale, string> = {
  "zh-CN": "简体中文",
  "zh-TW": "台湾正体",
  "zh-HK": "香港繁体",
  "en-US": "English (US)",
};

export function messagesFor(locale: Locale): Messages {
  return MESSAGES[locale];
}

export function isLocale(value: unknown): value is Locale {
  return (LOCALES as readonly unknown[]).includes(value);
}

// Mirrors Go's i18n.Match: Simplified script wins, then a Hong Kong region,
// then Traditional script or a Taiwan or Macau region.
export function matchLocale(tag: string | null | undefined): Locale | null {
  const t = (tag ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (t === "zh" || t.startsWith("zh-")) {
    const parts = t.split("-").slice(1);
    if (parts.includes("hans")) return "zh-CN";
    if (parts.includes("hk")) return "zh-HK";
    return parts.some((p) => p === "tw" || p === "hant" || p === "mo")
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
