import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  healStrandedServiceWorker,
  reloadForUpdate,
  installChunkErrorRecovery,
} from '../swSelfHeal';

const HEAL_KEY = 'almamesh:sw-precache-heal';

const IMMUTABLE = ['almamesh-pyodide-immutable', 'almamesh-bundle-immutable'];
const RUNTIME = ['almamesh-signals', 'almamesh-pubkey'];
const PRECACHE = 'workbox-precache-v2-https://almamesh.com/';

/** Build a mocked browser env; precacheEntries are the URLs inside the precache. */
function stubEnv(opts: {
  controller?: unknown;
  cacheNames: string[];
  precacheEntries?: string[];
  healFlagSet?: boolean;
  cachesThrows?: boolean;
}) {
  const unregister = vi.fn().mockResolvedValue(true);
  vi.stubGlobal('navigator', {
    serviceWorker: {
      controller: 'controller' in opts ? opts.controller : {},
      getRegistrations: vi.fn().mockResolvedValue([{ unregister }]),
    },
  });
  const cacheDelete = vi.fn().mockResolvedValue(true);
  vi.stubGlobal('caches', {
    keys: opts.cachesThrows
      ? vi.fn().mockRejectedValue(new Error('caches boom'))
      : vi.fn().mockResolvedValue(opts.cacheNames),
    delete: cacheDelete,
    open: vi.fn().mockResolvedValue({
      keys: vi.fn().mockResolvedValue((opts.precacheEntries ?? []).map((url) => ({ url }))),
    }),
  });
  const reload = vi.fn();
  vi.stubGlobal('location', { reload, origin: 'https://almamesh.com' });
  const store = new Map<string, string>();
  if (opts.healFlagSet) store.set(HEAL_KEY, '1');
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
  });
  return { unregister, cacheDelete, reload };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('healStrandedServiceWorker', () => {
  it('un-wedges an active SW with NO precache cache (unregister + reload)', async () => {
    const { unregister, reload } = stubEnv({ cacheNames: [...IMMUTABLE, ...RUNTIME] });
    await healStrandedServiceWorker();
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does NOTHING when the precache is present and holds the app shell', async () => {
    const { unregister, reload } = stubEnv({
      cacheNames: [...IMMUTABLE, ...RUNTIME, PRECACHE],
      precacheEntries: [
        'https://almamesh.com/?__WB_REVISION__=abc',
        'https://almamesh.com/assets/index-x.js?__WB_REVISION__=def',
      ],
    });
    await healStrandedServiceWorker();
    expect(unregister).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('does NOTHING when no service worker controls the page', async () => {
    const { unregister, reload } = stubEnv({ controller: null, cacheNames: [...IMMUTABLE] });
    await healStrandedServiceWorker();
    expect(unregister).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads at most once per session (loop guard)', async () => {
    const { reload } = stubEnv({ cacheNames: [...IMMUTABLE, ...RUNTIME], healFlagSet: true });
    await healStrandedServiceWorker();
    expect(reload).not.toHaveBeenCalled();
  });

  it('never throws (best-effort) even if caches access fails', async () => {
    stubEnv({ cacheNames: [], cachesThrows: true });
    await expect(healStrandedServiceWorker()).resolves.toBeUndefined();
  });
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('installChunkErrorRecovery', () => {
  it('reloads (once, guarded) when a vite:preloadError carries a chunk error', async () => {
    const { reload } = stubEnv({ cacheNames: [...IMMUTABLE, ...RUNTIME, PRECACHE] });
    const target = new EventTarget();
    installChunkErrorRecovery(target as unknown as Window);

    const evt = new Event('vite:preloadError', { cancelable: true });
    (evt as unknown as { payload: unknown }).payload = new Error(
      'Failed to fetch dynamically imported module: /assets/HeroForceField-x.js',
    );
    target.dispatchEvent(evt);
    await flush();

    expect(evt.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('recovers a chunk error surfaced via unhandledrejection', async () => {
    const { reload } = stubEnv({ cacheNames: [...IMMUTABLE, PRECACHE] });
    const target = new EventTarget();
    installChunkErrorRecovery(target as unknown as Window);

    const evt = new Event('unhandledrejection') as unknown as { reason: unknown };
    (evt as { reason: unknown }).reason = new Error(
      'error loading dynamically imported module',
    );
    target.dispatchEvent(evt as unknown as Event);
    await flush();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ignores a non-chunk error', async () => {
    const { reload } = stubEnv({ cacheNames: [...IMMUTABLE] });
    const target = new EventTarget();
    installChunkErrorRecovery(target as unknown as Window);

    const evt = new Event('unhandledrejection') as unknown as { reason: unknown };
    (evt as { reason: unknown }).reason = new Error('some unrelated rejection');
    target.dispatchEvent(evt as unknown as Event);
    await flush();

    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads at most once per session across repeated chunk errors', async () => {
    const { reload } = stubEnv({ cacheNames: [...IMMUTABLE, PRECACHE] });
    const target = new EventTarget();
    installChunkErrorRecovery(target as unknown as Window);

    for (let i = 0; i < 3; i++) {
      const evt = new Event('vite:preloadError', { cancelable: true });
      (evt as unknown as { payload: unknown }).payload = new Error(
        'Failed to fetch dynamically imported module',
      );
      target.dispatchEvent(evt);
      await flush();
    }
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('reloadForUpdate', () => {
  it('drops the stale shell caches but PRESERVES the immutable engine caches, then reloads', async () => {
    const { unregister, cacheDelete, reload } = stubEnv({
      cacheNames: [...IMMUTABLE, ...RUNTIME, PRECACHE],
    });
    await reloadForUpdate();
    expect(unregister).toHaveBeenCalledTimes(1);
    const deleted = cacheDelete.mock.calls.map((c) => c[0]);
    expect(deleted).toEqual(expect.arrayContaining([...RUNTIME, PRECACHE]));
    expect(deleted).not.toContain('almamesh-pyodide-immutable');
    expect(deleted).not.toContain('almamesh-bundle-immutable');
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
