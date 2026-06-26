/**
 * Language store — the on-device, local-first persistence for the UI + AI
 * language preference. There is no backend and no account: the choice lives in
 * this browser's localStorage and survives a refresh / PWA reopen.
 *
 * Default language is DETECTED from `navigator.language` on first run (es* → es,
 * pt* → pt, everything else → en), then the user's explicit choice (persisted)
 * takes over. The web app wires `setLanguage` to `i18n.changeLanguage(lang)` and
 * `document.documentElement.lang`, and threads `language` into the LLM prompts so
 * readings/chat answer in the chosen language.
 *
 * Persistence is a browser-only enhancement — outside a browser (SSR/tests)
 * `localStorage` is absent and the store runs in-memory with the default.
 */

import { create, type StateCreator } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

/** The supported UI + AI languages (kept in lockstep with i18next `supportedLngs`). */
export type Language = 'en' | 'es' | 'pt';

/** localStorage key for the persisted language choice (mirrors the chat store's named key style). */
export const LANGUAGE_PERSIST_NAME = 'almamesh-language';

/** Bump when the persisted language shape changes; always pair with `migrate`. */
export const LANGUAGE_PERSIST_VERSION = 1;

/** The slice of the store that `partialize` actually persists. */
export interface PersistedLanguageState {
  readonly language: Language;
}

const SUPPORTED_LANGUAGES: readonly Language[] = ['en', 'es', 'pt'];

/**
 * Defensive hydration: tolerate ANY old/unknown/corrupt persisted blob and
 * always return a valid `{ language }`. A returning visitor whose stored value
 * is malformed (or an unsupported tag from a future build) must never crash the
 * app — we fall back to English. Mirrors `migrateProfilesPersistedState`.
 */
export function migrateLanguagePersistedState(
  persisted: unknown,
  _fromVersion: number,
): PersistedLanguageState {
  if (persisted === null || typeof persisted !== 'object') {
    return { language: 'en' };
  }
  const raw = (persisted as { language?: unknown }).language;
  const language =
    typeof raw === 'string' && SUPPORTED_LANGUAGES.includes(raw as Language)
      ? (raw as Language)
      : 'en';
  return { language };
}

/**
 * Map a raw BCP-47 tag (e.g. `es-AR`, `pt-BR`, `en-US`) to a supported language.
 * Anything outside Spanish/Portuguese falls back to English.
 */
export function detectLanguage(raw: string | undefined | null): Language {
  const tag = (raw ?? '').toLowerCase();
  if (tag.startsWith('es')) {
    return 'es';
  }
  if (tag.startsWith('pt')) {
    return 'pt';
  }
  return 'en';
}

/**
 * The boot-time default: the browser's preferred language, mapped to a supported
 * one. Used by the i18n init (`lng`) so the very first render is already in the
 * right language before the store hydrates.
 */
export function getInitialLanguage(): Language {
  const nav = (globalThis as { navigator?: { language?: string } }).navigator;
  return detectLanguage(nav?.language);
}

export interface LanguageStore {
  /** The active language: persisted, defaults to the detected browser language. */
  language: Language;
  /** Set the active language (persisted). */
  setLanguage: (language: Language) => void;
}

const languageStoreCreator: StateCreator<LanguageStore> = (set) => ({
  language: getInitialLanguage(),
  setLanguage: (language) => set({ language }),
});

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

/** localStorage-backed zustand storage; benign no-op outside browsers (SSR/tests). */
const localStorageBackend: StateStorage = {
  getItem: (name) => (hasLocalStorage() ? localStorage.getItem(name) : null),
  setItem: (name, value) => {
    if (hasLocalStorage()) {
      localStorage.setItem(name, value);
    }
  },
  removeItem: (name) => {
    if (hasLocalStorage()) {
      localStorage.removeItem(name);
    }
  },
};

/**
 * Persisted language store. Only the `language` field is written; the actions
 * are recreated on rehydrate. In a non-browser runtime the persist layer no-ops
 * and the store stays in-memory at the detected default.
 */
export const useLanguageStore = create<LanguageStore>()(
  persist<LanguageStore, [], [], PersistedLanguageState>(languageStoreCreator, {
    name: LANGUAGE_PERSIST_NAME,
    version: LANGUAGE_PERSIST_VERSION,
    migrate: migrateLanguagePersistedState,
    storage: createJSONStorage(() => localStorageBackend),
    partialize: (state) => ({ language: state.language }),
  }),
);
