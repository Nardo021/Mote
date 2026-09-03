import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import zh from "./locales/zh.json";

export const LOCALE_STORAGE_KEY = "mote_dashboard_locale";

export type AppLocale = "en" | "zh";

export function detectLocale(): AppLocale {
  if (typeof localStorage === "undefined") {
    return "en";
  }
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored === "zh" || stored === "en") {
    return stored;
  }
  const language = navigator.language.toLowerCase();
  return language.startsWith("zh") ? "zh" : "en";
}

export function localeTag(locale: string): string {
  return locale.startsWith("zh") ? "zh-CN" : "en";
}

export function syncDocumentLang(locale: string): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.lang = localeTag(locale);
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: detectLocale(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

syncDocumentLang(i18n.language);

i18n.on("languageChanged", (language) => {
  syncDocumentLang(language);
});

export async function changeAppLocale(locale: AppLocale): Promise<void> {
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  await i18n.changeLanguage(locale);
}

export default i18n;
