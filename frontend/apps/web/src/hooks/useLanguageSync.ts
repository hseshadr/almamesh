/**
 * useLanguageSync — keep i18next and `<html lang>` in step with the persisted
 * language store, exactly like `useChatScopeSync` mirrors the active-profile
 * scope.
 *
 * The language store (`@almamesh/store` `useLanguageStore`) is the single source
 * of truth for the UI + AI language. i18next's own `lng` (set in `i18n/config`)
 * is only the boot default; this hook overrides it on mount with the persisted
 * choice and re-applies it whenever the user switches language. It also sets
 * `document.documentElement.lang` so the page's `<html lang>` reflects the
 * active language for accessibility and correct browser behaviour.
 *
 * The i18n instance is injectable (defaulting to the app's real instance) so the
 * sync behaviour can be unit-tested without booting i18next.
 */

import { useEffect } from 'react';
import { useLanguageStore, type Language } from '@almamesh/store';
import defaultI18n from '../i18n/config';

/** The minimal i18next surface this hook drives (kept narrow for testability). */
export interface LanguageSyncTarget {
  changeLanguage: (language: Language) => unknown;
}

export function useLanguageSync(i18n: LanguageSyncTarget = defaultI18n): void {
  const language = useLanguageStore((s) => s.language);

  useEffect(() => {
    void i18n.changeLanguage(language);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [i18n, language]);
}

export default useLanguageSync;
