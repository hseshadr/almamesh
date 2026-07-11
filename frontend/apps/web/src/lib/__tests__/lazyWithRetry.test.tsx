import { describe, it, expect, vi, afterEach } from 'vitest';

import { loadWithRetry } from '../lazyWithRetry';

const FakeModule = { default: () => null };

function stubBrowser(flags: Record<string, string> = {}) {
  const reload = vi.fn();
  vi.stubGlobal('location', { reload });
  const store = new Map<string, string>(Object.entries(flags));
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
  });
  return { reload };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const chunkError = () => new Error('Failed to fetch dynamically imported module: /assets/X-abc.js');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadWithRetry', () => {
  it('resolves the module on first success (no retry)', async () => {
    stubBrowser();
    const factory = vi.fn().mockResolvedValue(FakeModule);
    await expect(loadWithRetry(factory, 'Dashboard')).resolves.toBe(FakeModule);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('retries once after a transient failure, then resolves (no reload)', async () => {
    const { reload } = stubBrowser();
    const factory = vi.fn().mockRejectedValueOnce(chunkError()).mockResolvedValue(FakeModule);
    await expect(loadWithRetry(factory, 'Dashboard')).resolves.toBe(FakeModule);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads once (held, unsettled) when a chunk error survives the retry', async () => {
    const { reload } = stubBrowser();
    const factory = vi.fn().mockRejectedValue(chunkError());
    let settled = false;
    void loadWithRetry(factory, 'Dashboard').then(
      () => (settled = true),
      () => (settled = true),
    );
    await flush();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false); // Suspense holds through the reload
  });

  it('does NOT reload a second time for the same chunk (loop guard) — it rethrows', async () => {
    const { reload } = stubBrowser({ 'almamesh:chunk-reload:Dashboard': '1' });
    const err = chunkError();
    const factory = vi.fn().mockRejectedValue(err);
    await expect(loadWithRetry(factory, 'Dashboard')).rejects.toBe(err);
    expect(reload).not.toHaveBeenCalled();
  });

  it('rethrows a non-chunk error without reloading', async () => {
    const { reload } = stubBrowser();
    const err = new Error('boom in module top-level');
    const factory = vi.fn().mockRejectedValue(err);
    await expect(loadWithRetry(factory, 'Dashboard')).rejects.toBe(err);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(reload).not.toHaveBeenCalled();
  });
});
