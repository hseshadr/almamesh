import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const clearAlmaBundleCache = vi.fn<() => Promise<void>>();
vi.mock('@almamesh/browser', () => ({
  clearAlmaBundleCache: () => clearAlmaBundleCache(),
}));

import { clearEngineBundleCache, resetAppData } from '../resetAppData';

beforeEach(() => {
  clearAlmaBundleCache.mockReset();
  clearAlmaBundleCache.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A mocked OPFS root: `navigator.storage.getDirectory()` → entries + removeEntry. */
function stubOpfs(names: string[], order: string[] = []) {
  const removeEntry = vi.fn((name: string) => {
    order.push(`opfs:${name}`);
    return Promise.resolve();
  });
  const root = {
    keys: async function* keys() {
      yield* names;
    },
    removeEntry,
  };
  const getDirectory = vi.fn().mockResolvedValue(root);
  return { getDirectory, removeEntry };
}

describe('resetAppData', () => {
  it('clears every stale-state source (SW + caches + localStorage + IndexedDB)', async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) },
    });
    const cacheDelete = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['a', 'b']),
      delete: cacheDelete,
    });
    const lsClear = vi.fn();
    vi.stubGlobal('localStorage', {
      clear: lsClear,
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      key: () => null,
      length: 0,
    });
    const idbDeleteDatabase = vi.fn().mockReturnValue({});
    vi.stubGlobal('indexedDB', {
      databases: vi.fn().mockResolvedValue([{ name: 'almamesh-x' }]),
      deleteDatabase: idbDeleteDatabase,
    });

    await resetAppData();

    expect(unregister).toHaveBeenCalled();
    expect(cacheDelete).toHaveBeenCalledTimes(2);
    expect(lsClear).toHaveBeenCalled();
    expect(idbDeleteDatabase).toHaveBeenCalledWith('almamesh-x');
  });

  it('resolves even when one cleanup path throws (best-effort, isolated)', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistrations: vi.fn().mockRejectedValue(new Error('SW boom')) },
    });
    vi.stubGlobal('caches', {
      keys: vi.fn().mockRejectedValue(new Error('caches boom')),
      delete: vi.fn(),
    });
    vi.stubGlobal('localStorage', {
      clear: vi.fn(() => {
        throw new Error('ls boom');
      }),
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      key: () => null,
      length: 0,
    });
    vi.stubGlobal('indexedDB', undefined);

    // Must not reject despite every path failing.
    await expect(resetAppData()).resolves.toBeUndefined();
  });

  it('clears the signed-bundle cache + rollback floor via the library and sweeps OPFS BEFORE deleting IndexedDB', async () => {
    const order: string[] = [];
    clearAlmaBundleCache.mockImplementation(() => {
      order.push('library-clear');
      return Promise.resolve();
    });
    const opfs = stubOpfs(['chunk', 'manifest', 'active.a', 'active.b', 'memory.sqlite3'], order);
    vi.stubGlobal('navigator', { storage: { getDirectory: opfs.getDirectory } });
    vi.stubGlobal('caches', undefined);
    vi.stubGlobal('indexedDB', {
      databases: vi.fn().mockResolvedValue([{ name: 'edgeproc-browser-cache' }]),
      deleteDatabase: vi.fn((name: string) => order.push(`idb:${name}`)),
    });

    await resetAppData();

    expect(clearAlmaBundleCache).toHaveBeenCalledTimes(1);
    for (const name of ['chunk', 'manifest', 'active.a', 'active.b', 'memory.sqlite3']) {
      expect(opfs.removeEntry).toHaveBeenCalledWith(name, { recursive: true });
    }
    expect(order[0]).toBe('library-clear');
    expect(order.at(-1)).toBe('idb:edgeproc-browser-cache');
  });

  it('still sweeps OPFS and finishes the reset when the library clear fails', async () => {
    clearAlmaBundleCache.mockRejectedValue(new Error('worker failed to load'));
    const opfs = stubOpfs(['active']);
    vi.stubGlobal('navigator', { storage: { getDirectory: opfs.getDirectory } });
    vi.stubGlobal('caches', undefined);
    const deleteDatabase = vi.fn();
    vi.stubGlobal('indexedDB', {
      databases: vi.fn().mockResolvedValue([{ name: 'edgeproc-browser-cache' }]),
      deleteDatabase,
    });

    await expect(resetAppData()).resolves.toBeUndefined();

    expect(opfs.removeEntry).toHaveBeenCalledWith('active', { recursive: true });
    expect(deleteDatabase).toHaveBeenCalledWith('edgeproc-browser-cache');
  });

  it('bounds a hung library clear so Reset & reload can never hang', async () => {
    vi.useFakeTimers();
    clearAlmaBundleCache.mockReturnValue(new Promise<void>(() => {}));
    const opfs = stubOpfs(['active']);
    vi.stubGlobal('navigator', { storage: { getDirectory: opfs.getDirectory } });
    vi.stubGlobal('caches', undefined);
    vi.stubGlobal('indexedDB', undefined);

    const pending = resetAppData();
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(pending).resolves.toBeUndefined();
    expect(opfs.removeEntry).toHaveBeenCalledWith('active', { recursive: true });
  });

  it('removes each OPFS entry independently (one locked file never stops the sweep)', async () => {
    const opfs = stubOpfs(['locked.sqlite3', 'active']);
    opfs.removeEntry.mockImplementationOnce(() => Promise.reject(new Error('NoModificationAllowedError')));
    vi.stubGlobal('navigator', { storage: { getDirectory: opfs.getDirectory } });
    vi.stubGlobal('caches', undefined);
    vi.stubGlobal('indexedDB', undefined);

    await expect(resetAppData()).resolves.toBeUndefined();

    expect(opfs.removeEntry).toHaveBeenCalledWith('active', { recursive: true });
  });
});

describe('clearEngineBundleCache', () => {
  it('clears ONLY the signed-bundle cache via the library — no OPFS sweep, no user data touched', async () => {
    const opfs = stubOpfs(['memory.sqlite3']);
    const lsClear = vi.fn();
    const deleteDatabase = vi.fn();
    vi.stubGlobal('navigator', { storage: { getDirectory: opfs.getDirectory } });
    vi.stubGlobal('localStorage', { clear: lsClear });
    vi.stubGlobal('indexedDB', { databases: vi.fn().mockResolvedValue([]), deleteDatabase });

    await clearEngineBundleCache();

    expect(clearAlmaBundleCache).toHaveBeenCalledTimes(1);
    expect(opfs.getDirectory).not.toHaveBeenCalled();
    expect(lsClear).not.toHaveBeenCalled();
    expect(deleteDatabase).not.toHaveBeenCalled();
  });

  it('never rejects (best-effort) so the caller always reaches its reload', async () => {
    clearAlmaBundleCache.mockRejectedValue(new Error('lock'));
    await expect(clearEngineBundleCache()).resolves.toBeUndefined();
  });
});
