import { beforeEach, describe, expect, it } from 'vitest';
import { detectLanguage, migrateLanguagePersistedState, useLanguageStore } from './language';

describe('detectLanguage', () => {
  it('maps Spanish variants to es', () => {
    expect(detectLanguage('es')).toBe('es');
    expect(detectLanguage('es-AR')).toBe('es');
    expect(detectLanguage('ES-ES')).toBe('es');
  });

  it('maps Portuguese variants to pt', () => {
    expect(detectLanguage('pt')).toBe('pt');
    expect(detectLanguage('pt-BR')).toBe('pt');
  });

  it('falls back to en for anything else (incl. missing)', () => {
    expect(detectLanguage('en-US')).toBe('en');
    expect(detectLanguage('fr')).toBe('en');
    expect(detectLanguage(undefined)).toBe('en');
    expect(detectLanguage(null)).toBe('en');
  });
});

describe('migrateLanguagePersistedState (defensive hydration)', () => {
  it('passes a valid previous-shape blob through unchanged', () => {
    expect(migrateLanguagePersistedState({ language: 'es' }, 0)).toEqual({ language: 'es' });
    expect(migrateLanguagePersistedState({ language: 'pt' }, 1)).toEqual({ language: 'pt' });
  });

  it('falls back to a safe default for an unknown language value', () => {
    expect(migrateLanguagePersistedState({ language: 'fr' }, 0)).toEqual({ language: 'en' });
    expect(migrateLanguagePersistedState({ language: 'klingon' }, 0)).toEqual({ language: 'en' });
  });

  it('does NOT throw on a malformed / corrupt blob, returns a clean default', () => {
    expect(() => migrateLanguagePersistedState(null, 0)).not.toThrow();
    expect(migrateLanguagePersistedState(null, 0)).toEqual({ language: 'en' });
    expect(migrateLanguagePersistedState(undefined, 0)).toEqual({ language: 'en' });
    expect(migrateLanguagePersistedState('not-an-object', 0)).toEqual({ language: 'en' });
    expect(migrateLanguagePersistedState(42, 0)).toEqual({ language: 'en' });
    expect(migrateLanguagePersistedState({}, 0)).toEqual({ language: 'en' });
    expect(migrateLanguagePersistedState({ language: 123 }, 0)).toEqual({ language: 'en' });
    expect(migrateLanguagePersistedState([], 0)).toEqual({ language: 'en' });
  });
});

describe('useLanguageStore', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('setLanguage updates the active language', () => {
    useLanguageStore.getState().setLanguage('es');
    expect(useLanguageStore.getState().language).toBe('es');
    useLanguageStore.getState().setLanguage('pt');
    expect(useLanguageStore.getState().language).toBe('pt');
  });
});
