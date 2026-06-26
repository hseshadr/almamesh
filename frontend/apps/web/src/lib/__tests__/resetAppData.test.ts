import { describe, it, expect, vi, afterEach } from 'vitest';

import { resetAppData } from '../resetAppData';

afterEach(() => {
  vi.unstubAllGlobals();
});

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
});
