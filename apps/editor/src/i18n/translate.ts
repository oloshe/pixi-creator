import { zhCN } from './zh-CN';
import { en } from './en';

export type Locale = 'zh-CN' | 'en';

export const DEFAULT_LOCALE: Locale = 'zh-CN';
export const LOCALE_STORAGE_KEY = 'pxe:locale';

const dictionaries: Record<Locale, Record<string, string>> = { 'zh-CN': zhCN, en };

/** Resolves a key for a locale; unknown keys fall back to the key itself. */
export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
): string {
  let text = dictionaries[locale]?.[key] ?? dictionaries['zh-CN']?.[key] ?? key;

  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }

  return text;
}

/** Read the persisted locale, guarding against localStorage failures. */
export function readStoredLocale(): Locale {
  try {
    const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return value === 'en' || value === 'zh-CN' ? value : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}
