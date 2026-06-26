import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';

import { useLanguageSync, type LanguageSyncTarget } from '../useLanguageSync';
import { useLanguageStore, type Language } from '@almamesh/store';

function makeI18nMock(): { i18n: LanguageSyncTarget; changeLanguage: Mock } {
  const changeLanguage: Mock = vi.fn();
  return { i18n: { changeLanguage }, changeLanguage };
}

describe('useLanguageSync', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
    document.documentElement.lang = '';
  });

  afterEach(() => {
    useLanguageStore.setState({ language: 'en' });
    document.documentElement.lang = '';
  });

  it('applies the persisted language to i18n and <html lang> on mount', () => {
    useLanguageStore.setState({ language: 'es' });
    const { i18n, changeLanguage } = makeI18nMock();

    renderHook(() => useLanguageSync(i18n));

    expect(changeLanguage).toHaveBeenCalledWith('es');
    expect(document.documentElement.lang).toBe('es');
  });

  it('re-applies the language to i18n and <html lang> when the store changes', () => {
    const { i18n, changeLanguage } = makeI18nMock();

    renderHook(() => useLanguageSync(i18n));
    expect(changeLanguage).toHaveBeenLastCalledWith('en');
    expect(document.documentElement.lang).toBe('en');

    act(() => {
      useLanguageStore.setState({ language: 'pt' as Language });
    });

    expect(changeLanguage).toHaveBeenLastCalledWith('pt');
    expect(document.documentElement.lang).toBe('pt');
  });
});
