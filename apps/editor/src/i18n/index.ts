import { useEditorStore } from '../editor/store';
import { translate } from './translate';

export { translate, readStoredLocale, DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from './translate';
export type { Locale } from './translate';

/**
 * Lightweight i18n hook. `t` re-renders with the store's `locale` and supports
 * `{name}` interpolation. No third-party dependency.
 */
export function useI18n() {
  const locale = useEditorStore((state) => state.locale);
  const setLocale = useEditorStore((state) => state.setLocale);

  return {
    locale,
    setLocale,
    t: (key: string, params?: Record<string, string | number>) => translate(locale, key, params),
  };
}
