import { describe, expect, it } from 'vitest';
import type { BackupEnvelopePlain, BackupStores } from '@almamesh/shared-types';
import {
  applyBackup,
  BACKUP_STORES,
  BackupError,
  CHART_FLAG_KEY,
  CHAT_VECTORS_KEY,
  collectBackup,
  type BackupDeps,
  type BackupTier,
  type StorageTier,
} from './backup';

/**
 * In-memory, Map-backed fake of a {@link StorageTier}. Exposes the underlying
 * Map so tests can seed raw persisted strings and assert exact bytes written.
 */
interface FakeTier extends StorageTier {
  map: Map<string, string>;
}

function makeTier(seed?: Record<string, string>): FakeTier {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    map,
    get: (key) => Promise.resolve(map.has(key) ? (map.get(key) as string) : null),
    set: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
    del: (key) => {
      map.delete(key);
      return Promise.resolve();
    },
  };
}

/** The exact bytes Zustand's persist middleware writes: `JSON.stringify({ state, version })`. */
function persisted(state: unknown, version: number): string {
  return JSON.stringify({ state, version });
}

function makeDeps(overrides?: {
  local?: FakeTier;
  idb?: FakeTier;
  appVersion?: string;
  now?: string;
}): BackupDeps & { tiers: Record<BackupTier, FakeTier> } {
  return {
    tiers: {
      local: overrides?.local ?? makeTier(),
      idb: overrides?.idb ?? makeTier(),
    },
    appVersion: overrides?.appVersion ?? 'test-1.2.3',
    now: overrides?.now ?? '2026-07-01T12:00:00.000Z',
  };
}

describe('BACKUP_STORES registry', () => {
  it('lists exactly the 7 export stores in order with correct tiers', () => {
    expect(BACKUP_STORES.map((e) => [e.key, e.tier])).toEqual([
      ['almamesh-profiles', 'idb'],
      ['almamesh-chart-library', 'idb'],
      ['almamesh-life-events', 'idb'],
      ['almamesh-rectification-records', 'idb'],
      ['almamesh-chat-history', 'idb'],
      ['almamesh-interpretations', 'local'],
      ['almamesh-language', 'local'],
    ]);
  });
});

describe('collectBackup', () => {
  it('includes only present stores, each with parsed state + version; skips missing', async () => {
    const idb = makeTier({
      'almamesh-profiles': persisted({ activeProfileId: 'p1' }, 1),
      'almamesh-life-events': persisted({ byProfile: { p1: [] } }, 4),
    });
    const local = makeTier({
      'almamesh-language': persisted({ language: 'es' }, 1),
    });
    const deps = makeDeps({ idb, local });

    const envelope = await collectBackup(deps);

    // Only the three seeded stores are present; the other four are skipped.
    expect(Object.keys(envelope.stores).sort()).toEqual([
      'almamesh-language',
      'almamesh-life-events',
      'almamesh-profiles',
    ]);
    expect(envelope.stores['almamesh-profiles']).toEqual({
      version: 1,
      state: { activeProfileId: 'p1' },
    });
    expect(envelope.stores['almamesh-life-events']).toEqual({
      version: 4,
      state: { byProfile: { p1: [] } },
    });
    expect(envelope.stores['almamesh-language']).toEqual({
      version: 1,
      state: { language: 'es' },
    });
  });

  it('stamps envelope metadata from deps', async () => {
    const deps = makeDeps({ appVersion: 'v9.9.9', now: '2026-01-02T03:04:05.000Z' });

    const envelope = await collectBackup(deps);

    expect(envelope.format).toBe('almamesh-backup');
    expect(envelope.formatVersion).toBe(1);
    expect(envelope.app).toEqual({ version: 'v9.9.9' });
    expect(envelope.exportedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(envelope.encryption).toBe('none');
  });

  it('produces a valid (empty-stores) envelope for a fresh browser', async () => {
    const envelope = await collectBackup(makeDeps());
    expect(envelope.stores).toEqual({});
  });

  it('throws corrupt on a present-but-unparseable store value', async () => {
    const idb = makeTier({ 'almamesh-profiles': 'not-json{' });
    await expect(collectBackup(makeDeps({ idb }))).rejects.toMatchObject({
      name: 'BackupError',
      code: 'corrupt',
    });
  });

  it('throws corrupt on a present store lacking a numeric version', async () => {
    const idb = makeTier({ 'almamesh-profiles': JSON.stringify({ state: { x: 1 } }) });
    await expect(collectBackup(makeDeps({ idb }))).rejects.toBeInstanceOf(BackupError);
  });
});

describe('applyBackup', () => {
  function seededEnvelope(): BackupEnvelopePlain {
    const stores: BackupStores = {
      'almamesh-profiles': { version: 1, state: { activeProfileId: 'p1' } },
      'almamesh-chart-library': { version: 1, state: { charts: { c1: {} } } },
      'almamesh-interpretations': { version: 2, state: { readings: {} } },
      'almamesh-language': { version: 1, state: { language: 'pt' } },
    };
    return {
      format: 'almamesh-backup',
      formatVersion: 1,
      app: { version: 'test-1.2.3' },
      exportedAt: '2026-07-01T12:00:00.000Z',
      encryption: 'none',
      stores,
    };
  }

  /** An envelope carrying all 7 known stores (fresh, non-stale replacement data). */
  function fullSevenStoreEnvelope(): BackupEnvelopePlain {
    return {
      format: 'almamesh-backup',
      formatVersion: 1,
      app: { version: 'test-1.2.3' },
      exportedAt: '2026-07-01T12:00:00.000Z',
      encryption: 'none',
      stores: {
        'almamesh-profiles': { version: 1, state: { activeProfileId: 'p2' } },
        'almamesh-chart-library': { version: 1, state: { charts: { c2: {} } } },
        'almamesh-life-events': { version: 4, state: { byProfile: {} } },
        'almamesh-rectification-records': { version: 1, state: { records: {} } },
        'almamesh-chat-history': { version: 1, state: { threads: {} } },
        'almamesh-interpretations': { version: 2, state: { readings: {} } },
        'almamesh-language': { version: 1, state: { language: 'es' } },
      },
    };
  }

  it('round-trips: collect -> clear -> apply reproduces each store byte-for-byte', async () => {
    const idbA = makeTier({
      'almamesh-profiles': persisted({ activeProfileId: 'p1' }, 1),
      'almamesh-chart-library': persisted({ charts: { c1: { id: 'c1' } } }, 1),
      'almamesh-chat-history': persisted({ threads: {} }, 1),
    });
    const localA = makeTier({
      'almamesh-interpretations': persisted({ readings: { c1: 'hi' } }, 2),
      'almamesh-language': persisted({ language: 'pt' }, 1),
    });
    const original = new Map([...idbA.map, ...localA.map]);

    const envelope = await collectBackup(makeDeps({ idb: idbA, local: localA }));

    // Fresh, empty destination tiers (a second browser).
    const idbB = makeTier();
    const localB = makeTier();
    await applyBackup(envelope, makeDeps({ idb: idbB, local: localB }));

    for (const entry of BACKUP_STORES) {
      const expected = original.get(entry.key);
      if (expected === undefined) continue;
      const tier = entry.tier === 'idb' ? idbB : localB;
      expect(tier.map.get(entry.key)).toBe(expected);
    }
  });

  it('sets the chart route-guard flag when chart-library is present and deletes RAG vectors', async () => {
    const idb = makeTier({ [CHAT_VECTORS_KEY]: 'stale-embeddings' });
    const local = makeTier();
    await applyBackup(seededEnvelope(), makeDeps({ idb, local }));

    expect(local.map.get(CHART_FLAG_KEY)).toBe('1');
    expect(idb.map.has(CHAT_VECTORS_KEY)).toBe(false);
  });

  it('ignores unknown store keys without failing', async () => {
    const env = seededEnvelope();
    env.stores['almamesh-mystery-future-store'] = { version: 1, state: { z: 1 } };
    const idb = makeTier();
    const local = makeTier();

    await applyBackup(env, makeDeps({ idb, local }));

    expect(idb.map.has('almamesh-mystery-future-store')).toBe(false);
    expect(local.map.has('almamesh-mystery-future-store')).toBe(false);
    // Known stores still landed.
    expect(idb.map.has('almamesh-profiles')).toBe(true);
  });

  it('refuses a wrong format (bad_format) and writes nothing', async () => {
    const env = { ...seededEnvelope(), format: 'something-else' } as unknown as BackupEnvelopePlain;
    const idb = makeTier();
    const local = makeTier();

    await expect(applyBackup(env, makeDeps({ idb, local }))).rejects.toMatchObject({
      name: 'BackupError',
      code: 'bad_format',
    });
    expect(idb.map.size).toBe(0);
    expect(local.map.size).toBe(0);
  });

  it('refuses a too-new formatVersion (too_new) and writes nothing', async () => {
    const env = { ...seededEnvelope(), formatVersion: 2 } as unknown as BackupEnvelopePlain;
    const idb = makeTier();
    const local = makeTier();

    await expect(applyBackup(env, makeDeps({ idb, local }))).rejects.toMatchObject({
      name: 'BackupError',
      code: 'too_new',
    });
    expect(idb.map.size).toBe(0);
    expect(local.map.size).toBe(0);
  });

  it('is all-or-nothing: a store that fails to stage aborts before any tier write', async () => {
    // A circular state cannot be JSON.stringify'd -> staging throws.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const env: BackupEnvelopePlain = {
      format: 'almamesh-backup',
      formatVersion: 1,
      app: { version: 'x' },
      exportedAt: '2026-07-01T12:00:00.000Z',
      encryption: 'none',
      stores: {
        // A good store first; it must NOT be written if a later one aborts.
        'almamesh-language': { version: 1, state: { language: 'pt' } },
        'almamesh-chart-library': { version: 1, state: circular },
      },
    };
    const idb = makeTier({ [CHAT_VECTORS_KEY]: 'still-here' });
    const local = makeTier();

    await expect(applyBackup(env, makeDeps({ idb, local }))).rejects.toBeInstanceOf(Error);

    // Nothing was written: no store keys, no chart flag, and RAG vectors survive.
    expect(local.map.size).toBe(0);
    expect(idb.map.get(CHAT_VECTORS_KEY)).toBe('still-here');
    expect(idb.map.size).toBe(1);
  });

  // ITEM 4 — Restore is a TRUE "Replace all": stores the backup OMITS must not
  // keep stale local data; the chart route-guard flag tracks charts-present.
  it('replace: deletes a known store the backup omits (clears stale local data)', async () => {
    // All 7 stores seeded with pre-existing (stale) data.
    const idb = makeTier({
      'almamesh-profiles': persisted({ activeProfileId: 'old' }, 1),
      'almamesh-chart-library': persisted({ charts: { old: {} } }, 1),
      'almamesh-life-events': persisted({ byProfile: {} }, 4),
      'almamesh-rectification-records': persisted({ records: {} }, 1),
      'almamesh-chat-history': persisted({ threads: { stale: {} } }, 1),
    });
    const local = makeTier({
      'almamesh-interpretations': persisted({ readings: {} }, 2),
      'almamesh-language': persisted({ language: 'en' }, 1),
    });

    const env = fullSevenStoreEnvelope();
    delete env.stores['almamesh-chat-history'];

    await applyBackup(env, makeDeps({ idb, local }));

    // The omitted store's stale data is gone (true Replace).
    expect(idb.map.has('almamesh-chat-history')).toBe(false);
    // A present store was restored from the backup.
    expect(idb.map.get('almamesh-profiles')).toBe(persisted({ activeProfileId: 'p2' }, 1));
  });

  it('replace: deletes the chart route-guard flag when chart-library is absent', async () => {
    const idb = makeTier({ 'almamesh-chart-library': persisted({ charts: { old: {} } }, 1) });
    const local = makeTier({ [CHART_FLAG_KEY]: '1' });

    const env = fullSevenStoreEnvelope();
    delete env.stores['almamesh-chart-library'];

    await applyBackup(env, makeDeps({ idb, local }));

    // No charts after the replace → the route-guard flag is cleared.
    expect(local.map.has(CHART_FLAG_KEY)).toBe(false);
    // The stale chart-library store itself is cleared too.
    expect(idb.map.has('almamesh-chart-library')).toBe(false);
  });

  // ITEM 3 — the writes are NOT atomic: a mid-write storage failure must surface
  // (be rejected), not be swallowed.
  it('surfaces a mid-write storage failure (writes are not transactional)', async () => {
    const map = new Map<string, string>();
    let calls = 0;
    const idb: FakeTier = {
      map,
      get: () => Promise.resolve(map.has('x') ? (map.get('x') as string) : null),
      set: (key, value) => {
        calls += 1;
        if (calls === 2) return Promise.reject(new Error('IDB quota exceeded'));
        map.set(key, value);
        return Promise.resolve();
      },
      del: (key) => {
        map.delete(key);
        return Promise.resolve();
      },
    };
    const local = makeTier();
    const env: BackupEnvelopePlain = {
      format: 'almamesh-backup',
      formatVersion: 1,
      app: { version: 'x' },
      exportedAt: '2026-07-01T12:00:00.000Z',
      encryption: 'none',
      stores: {
        // Both land in the idb tier, so the 2nd set() is the one that throws.
        'almamesh-profiles': { version: 1, state: { a: 1 } },
        'almamesh-chart-library': { version: 1, state: { b: 2 } },
      },
    };

    await expect(applyBackup(env, makeDeps({ idb, local }))).rejects.toThrow(
      'IDB quota exceeded',
    );
  });

  // ITEM 5b — only formatVersion 1 is valid today; a below-range version is
  // malformed (bad_format), not "too new".
  it('refuses a below-range formatVersion (bad_format) and writes nothing', async () => {
    const env = { ...seededEnvelope(), formatVersion: 0 } as unknown as BackupEnvelopePlain;
    const idb = makeTier();
    const local = makeTier();

    await expect(applyBackup(env, makeDeps({ idb, local }))).rejects.toMatchObject({
      name: 'BackupError',
      code: 'bad_format',
    });
    expect(idb.map.size).toBe(0);
    expect(local.map.size).toBe(0);
  });
});
