import { describe, it, expect, afterEach, vi } from 'vitest';

import { hasLocalChart, LOCAL_CHART_KEY } from './localChart';

function installTestStorage(): void {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  } satisfies Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'>);
}

describe('hasLocalChart', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    installTestStorage();
  });

  it('is true when the chart-library flag is set', () => {
    localStorage.setItem(LOCAL_CHART_KEY, '1');
    expect(hasLocalChart()).toBe(true);
  });

  it('is false when the flag is absent', () => {
    localStorage.removeItem(LOCAL_CHART_KEY);
    expect(hasLocalChart()).toBe(false);
  });

  it('is false (not a crash) when localStorage is missing entirely — Node prerender', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(hasLocalChart()).toBe(false);
  });

  it('is false (not a crash) when an SSR host exposes a partial storage shell', () => {
    vi.stubGlobal('localStorage', {});
    expect(hasLocalChart()).toBe(false);
  });

  it('is false (not a crash) when storage access throws — e.g. Chrome "block all cookies"', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('Access is denied for this document.', 'SecurityError');
      },
    });
    expect(hasLocalChart()).toBe(false);
  });
});
