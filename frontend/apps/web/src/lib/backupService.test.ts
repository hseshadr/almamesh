/**
 * Tests for the Backup & Restore orchestration service (Spec 061).
 *
 * This module composes the already-built store primitives (`collectBackup` /
 * `applyBackup` from `@almamesh/store`, `encodeEnvelope` / `decodeEnvelope` from
 * its crypto sibling) into the three operations the UI drives: build an export,
 * stage an import (parse + validate + decrypt), and commit it (write the stores).
 *
 * These are TRUE round-trips against the real primitives, not mocks: every tier
 * is an in-memory Map-backed `StorageTier` fake injected through the override
 * seam, and `now` + `appVersion` are injected for determinism. All fixtures are
 * synthetic — never real birth data.
 */
import { describe, expect, it, vi } from 'vitest';
import type { BackupEnvelopePlain } from '@almamesh/shared-types';

import {
  BackupCryptoError,
  BackupError,
  CHART_FLAG_KEY,
  CHAT_VECTORS_KEY,
  type StorageTier,
  useInterpretationStore,
} from '@almamesh/store';

import {
  buildBackupExport,
  commitBackupImport,
  stageBackupImport,
} from './backupService';

// --- in-memory tier fake -----------------------------------------------------

/** A Map-backed {@link StorageTier} whose contents tests can inspect directly. */
interface MemTier extends StorageTier {
  readonly map: Map<string, string>;
}

function memTier(seed: Record<string, string> = {}): MemTier {
  const map = new Map<string, string>(Object.entries(seed));
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

/** One persisted `{ state, version }` blob as it lives in a tier. */
function snapshot(state: unknown, version: number): string {
  return JSON.stringify({ state, version });
}

// --- synthetic fixtures ------------------------------------------------------

const PROFILES_STATE = {
  profiles: [{ id: 'p1', name: 'Synthetic Native' }],
  activeProfileId: 'p1',
};
const CHART_LIBRARY_STATE = { charts: { p1: { lagna: 'Aquarius' } } };
const LANGUAGE_STATE = { language: 'en' };

const FIXED_NOW = '2026-07-01T12:34:56.000Z';
const FIXED_VERSION = 'test-1.2.3';

/** Freshly-seeded source tiers plus a matching deps override for determinism. */
function seededSource() {
  const idb = memTier({
    'almamesh-profiles': snapshot(PROFILES_STATE, 1),
    'almamesh-chart-library': snapshot(CHART_LIBRARY_STATE, 0),
  });
  const local = memTier({
    'almamesh-language': snapshot(LANGUAGE_STATE, 0),
  });
  const tiers = { local, idb } as Record<'local' | 'idb', StorageTier>;
  return { tiers, override: { tiers, now: FIXED_NOW, appVersion: FIXED_VERSION } };
}

// --- buildBackupExport -------------------------------------------------------

describe('buildBackupExport', () => {
  it('names the file by the injected date and emits a valid plain envelope', async () => {
    const { override } = seededSource();

    const result = await buildBackupExport(undefined, override);

    expect(result.filename).toBe('almamesh-backup-2026-07-01.json');

    const parsed = JSON.parse(result.text);
    expect(parsed.format).toBe('almamesh-backup');
    expect(parsed.formatVersion).toBe(1);
    expect(parsed.encryption).toBe('none');
    expect(parsed.app).toEqual({ version: FIXED_VERSION });
    expect(parsed.exportedAt).toBe(FIXED_NOW);
    expect(parsed.stores['almamesh-profiles']).toEqual({ state: PROFILES_STATE, version: 1 });
    expect(parsed.stores['almamesh-language']).toEqual({ state: LANGUAGE_STATE, version: 0 });
  });

  it('exports a completed interpretation immediately after its durability promise resolves', async () => {
    const idb = memTier();
    const originalStorage = useInterpretationStore.persist.getOptions().storage;
    useInterpretationStore.persist.setOptions({
      storage: {
        getItem: () => null,
        setItem: (name, value) => {
          idb.map.set(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          idb.map.delete(name);
        },
      },
    });
    useInterpretationStore.setState({ byChart: {} });
    const run = useInterpretationStore.getState().startInterpretation('chart-now', 'profile-now');
    await useInterpretationStore.getState().setInterpretation(
      'chart-now',
      {
        summary: { layman: 'Saved now.', technical: 'Saved now.' },
        strengths: [],
        challenges: [],
        life_themes: [],
      },
      '2026-07-01T00:00:00.000Z',
      undefined,
      undefined,
      run,
    );
    try {
      const result = await buildBackupExport(undefined, {
        tiers: { local: memTier(), idb },
        now: FIXED_NOW,
        appVersion: FIXED_VERSION,
      });

      const parsed = JSON.parse(result.text) as BackupEnvelopePlain;
      expect(
        (parsed.stores['almamesh-interpretations']?.state as { byChart: Record<string, unknown> })
          .byChart['chart-now'],
      ).toBeDefined();
    } finally {
      useInterpretationStore.persist.setOptions({ storage: originalStorage });
    }
  });
});

// --- encrypted export -> stage import round-trip -----------------------------

describe('stageBackupImport (encrypted round-trip)', () => {
  it('decrypts an encrypted export back to the original stores', async () => {
    const { override } = seededSource();

    const exported = await buildBackupExport('correct horse', override);
    // The file itself must be ciphertext, not plaintext stores.
    const onDisk = JSON.parse(exported.text);
    expect(onDisk.encryption).toBe('aes-gcm');
    expect(onDisk.stores).toBeUndefined();

    const staged = await stageBackupImport(exported.text, 'correct horse');

    expect(staged.wasEncrypted).toBe(true);
    expect(staged.envelope.encryption).toBe('none');
    expect(staged.envelope.stores['almamesh-profiles']).toEqual({
      state: PROFILES_STATE,
      version: 1,
    });
    expect(staged.envelope.stores['almamesh-chart-library']).toEqual({
      state: CHART_LIBRARY_STATE,
      version: 0,
    });
  });

  it('rejects a wrong passphrase with BackupCryptoError bad_passphrase', async () => {
    const { override } = seededSource();
    const exported = await buildBackupExport('the right one', override);

    await expect(stageBackupImport(exported.text, 'the wrong one')).rejects.toMatchObject({
      name: 'BackupCryptoError',
      code: 'bad_passphrase',
    });
    await expect(stageBackupImport(exported.text, 'the wrong one')).rejects.toBeInstanceOf(
      BackupCryptoError,
    );
  });

  it('rejects an encrypted file opened with no passphrase (so the UI can prompt)', async () => {
    const { override } = seededSource();
    const exported = await buildBackupExport('a passphrase', override);

    await expect(stageBackupImport(exported.text)).rejects.toMatchObject({
      name: 'BackupCryptoError',
      code: 'bad_passphrase',
    });
  });
});

// --- shape validation --------------------------------------------------------

describe('stageBackupImport (validation)', () => {
  it('rejects non-JSON input with BackupError bad_format', async () => {
    await expect(stageBackupImport('this is not json {')).rejects.toMatchObject({
      name: 'BackupError',
      code: 'bad_format',
    });
  });

  it('rejects an object missing the format tag with BackupError bad_format', async () => {
    await expect(stageBackupImport('{}')).rejects.toMatchObject({
      name: 'BackupError',
      code: 'bad_format',
    });
    await expect(stageBackupImport('{}')).rejects.toBeInstanceOf(BackupError);
  });

  it('rejects a non-numeric formatVersion with BackupError bad_format', async () => {
    const text = JSON.stringify({ format: 'almamesh-backup', formatVersion: 'nope' });
    await expect(stageBackupImport(text)).rejects.toMatchObject({
      name: 'BackupError',
      code: 'bad_format',
    });
  });

  it('refuses a too-new formatVersion with BackupError too_new', async () => {
    const text = JSON.stringify({
      format: 'almamesh-backup',
      formatVersion: 2,
      app: { version: 'x' },
      exportedAt: FIXED_NOW,
      encryption: 'none',
      stores: {},
    });
    await expect(stageBackupImport(text)).rejects.toMatchObject({
      name: 'BackupError',
      code: 'too_new',
    });
  });

  // ITEM 5b — only formatVersion 1 is valid today; below-range is malformed.
  it('refuses a below-range formatVersion with BackupError bad_format', async () => {
    const text = JSON.stringify({
      format: 'almamesh-backup',
      formatVersion: 0,
      app: { version: 'x' },
      exportedAt: FIXED_NOW,
      encryption: 'none',
      stores: {},
    });
    await expect(stageBackupImport(text)).rejects.toMatchObject({
      name: 'BackupError',
      code: 'bad_format',
    });
  });
});

// --- full commit round-trip via injected tiers -------------------------------

describe('commitBackupImport (full round-trip)', () => {
  it('rolls back and finalizes a readable generation after a mid-write failure', async () => {
    const oldProfiles = snapshot({ profiles: { old: { id: 'old' } } }, 1);
    const oldCharts = snapshot({ charts: { old: { chart_id: 'old' } } }, 1);
    const idb = memTier({
      'almamesh-profiles': oldProfiles,
      'almamesh-chart-library': oldCharts,
    });
    const originalSet = idb.set;
    let failed = false;
    idb.set = async (key, value) => {
      if (key === 'almamesh-chart-library' && !failed) {
        failed = true;
        throw new Error('quota during second write');
      }
      await originalSet(key, value);
    };
    const beginBackupRestore = vi
      .fn<() => Promise<number>>()
      .mockResolvedValueOnce(8);
    const finalizeBackupRestore = vi.fn().mockResolvedValue(undefined);
    const abortBackupRestore = vi.fn().mockResolvedValue(undefined);
    const envelope: BackupEnvelopePlain = {
      format: 'almamesh-backup',
      formatVersion: 1,
      app: { version: 'test' },
      exportedAt: FIXED_NOW,
      encryption: 'none',
      stores: {
        'almamesh-profiles': { version: 1, state: { profiles: { replacement: {} } } },
        'almamesh-chart-library': { version: 1, state: { charts: { replacement: {} } } },
      },
    };

    await expect(
      commitBackupImport(envelope, {
        tiers: { idb, local: memTier() },
        beginBackupRestore,
        finalizeBackupRestore,
        abortBackupRestore,
      }),
    ).rejects.toThrow(/quota/);

    expect(beginBackupRestore).toHaveBeenCalledTimes(1);
    expect(finalizeBackupRestore).toHaveBeenCalledWith(8);
    expect(abortBackupRestore).not.toHaveBeenCalled();
    expect(JSON.parse(idb.map.get('almamesh-profiles')!)).toMatchObject({
      state: { profiles: { old: { id: 'old' } } },
      datasetEpoch: 8,
    });
  });

  it('restores stores, clears imported tombstones, then rebuilds every restored message', async () => {
    const idb = memTier();
    const local = memTier();
    const events: string[] = [];
    const originalSet = idb.set;
    idb.set = async (key, value) => {
      events.push(`write:${key}`);
      await originalSet(key, value);
    };
    const beginBackupRestore = vi.fn(async () => {
      events.push('begin-restore');
      return 2;
    });
    const finalizeBackupRestore = vi.fn(async () => {
      events.push('finalize-restore');
    });
    const rebuildChatMemory = vi.fn(async () => {
      events.push('rebuild-memory');
    });
    const completeMemoryRebuild = vi.fn(async () => {
      events.push('complete-memory');
    });
    const clearChatMemory = vi.fn(async () => {
      events.push('clear-memory');
    });
    const publishDatasetNotice = vi.fn((notice: { phase?: string }) => {
      events.push(`broadcast:${notice.phase}`);
    });
    const envelope: BackupEnvelopePlain = {
      format: 'almamesh-backup',
      formatVersion: 1,
      app: { version: 'test' },
      exportedAt: FIXED_NOW,
      encryption: 'none',
      stores: {
        'almamesh-profiles': {
          version: 1,
          state: { profiles: { p1: { id: 'p1' } }, activeProfileId: 'p1' },
        },
        'almamesh-chart-library': {
          version: 1,
          state: { charts: { c1: { chart_id: 'c1', profile_id: 'p1' } } },
        },
        'almamesh-chat-history': {
          version: 1,
          state: {
            threads: { t1: { id: 't1', profile_id: 'p1', chart_id: 'c1' } },
            messages: {
              t1: [
                { id: 'm1', thread_id: 't1', role: 'user', content: 'restored question' },
                {
                  id: 'failed',
                  thread_id: 't1',
                  role: 'assistant',
                  content: 'Connection failed. Please try again.',
                  error: true,
                },
                { id: 'blank', thread_id: 't1', role: 'assistant', content: '   ' },
              ],
            },
          },
        },
      },
    };

    await commitBackupImport(envelope, {
      tiers: { idb, local },
      beginBackupRestore,
      finalizeBackupRestore,
      clearChatMemory,
      publishDatasetNotice,
      rebuildChatMemory,
      completeMemoryRebuild,
    });

    expect(beginBackupRestore).toHaveBeenCalledWith({
      profileIds: ['p1'],
      chartIds: ['c1'],
      threadIds: ['t1'],
    });
    expect(rebuildChatMemory).toHaveBeenCalledWith([
      { id: 'm1', thread_id: 't1', profile_id: 'p1', content: 'restored question' },
    ]);
    expect(finalizeBackupRestore).toHaveBeenCalledWith(2);
    expect(JSON.parse(idb.map.get('almamesh-profiles')!)).toMatchObject({ datasetEpoch: 2 });
    expect(events[0]).toBe('begin-restore');
    expect(events.indexOf('broadcast:begin')).toBeGreaterThan(events.indexOf('begin-restore'));
    expect(events.indexOf('clear-memory')).toBeGreaterThan(events.indexOf('broadcast:begin'));
    expect(events.indexOf('finalize-restore')).toBeGreaterThan(events.indexOf('write:almamesh-profiles'));
    expect(events.indexOf('rebuild-memory')).toBeGreaterThan(events.indexOf('finalize-restore'));
    expect(events.indexOf('complete-memory')).toBeGreaterThan(events.indexOf('rebuild-memory'));
    expect(completeMemoryRebuild).toHaveBeenCalledWith(2);
    expect(events.at(-1)).toBe('broadcast:complete');
  });

  it('writes nothing when the cross-realm restore fence cannot be established', async () => {
    const idb = memTier();
    const rebuildChatMemory = vi.fn();
    const envelope: BackupEnvelopePlain = {
      format: 'almamesh-backup',
      formatVersion: 1,
      app: { version: 'test' },
      exportedAt: FIXED_NOW,
      encryption: 'none',
      stores: {
        'almamesh-profiles': {
          version: 1,
          state: { profiles: { p1: { id: 'p1' } }, activeProfileId: 'p1' },
        },
      },
    };

    await expect(
      commitBackupImport(envelope, {
        tiers: { idb, local: memTier() },
        beginBackupRestore: vi.fn().mockRejectedValue(new Error('restore fence blocked')),
        rebuildChatMemory,
      }),
    ).rejects.toThrow(/restore fence blocked/);
    expect(idb.map.size).toBe(0);
    expect(rebuildChatMemory).not.toHaveBeenCalled();
  });

  it('commits source data and marks search resumable when vector reindex fails', async () => {
    const publishDatasetNotice = vi.fn();
    const completeMemoryRebuild = vi.fn().mockResolvedValue(undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const envelope: BackupEnvelopePlain = {
      format: 'almamesh-backup',
      formatVersion: 1,
      app: { version: 'test' },
      exportedAt: FIXED_NOW,
      encryption: 'none',
      stores: {
        'almamesh-profiles': { version: 1, state: { profiles: { p1: { id: 'p1' } } } },
      },
    };

    await expect(
      commitBackupImport(envelope, {
        tiers: { idb: memTier(), local: memTier() },
        beginBackupRestore: vi.fn().mockResolvedValue(4),
        finalizeBackupRestore: vi.fn().mockResolvedValue(undefined),
        rebuildChatMemory: vi
          .fn()
          .mockRejectedValue(new Error('private-message-content must never reach logs')),
        completeMemoryRebuild,
        publishDatasetNotice,
      }),
    ).resolves.toBeUndefined();

    expect(completeMemoryRebuild).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[almamesh:warn:backup.memory_rebuild_deferred]');
    expect(publishDatasetNotice).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'dataset', phase: 'complete' }),
    );
  });

  it('finishes source restore within 30 seconds when semantic-memory rebuild hangs', async () => {
    vi.useFakeTimers();
    try {
      const publishDatasetNotice = vi.fn();
      const completeMemoryRebuild = vi.fn();
      const envelope: BackupEnvelopePlain = {
        format: 'almamesh-backup',
        formatVersion: 1,
        app: { version: 'test' },
        exportedAt: FIXED_NOW,
        encryption: 'none',
        stores: {
          'almamesh-profiles': {
            version: 1,
            state: { profiles: { p1: { id: 'p1' } }, activeProfileId: 'p1' },
          },
        },
      };
      let settled = false;

      void commitBackupImport(envelope, {
        tiers: { idb: memTier(), local: memTier() },
        beginBackupRestore: vi.fn().mockResolvedValue(3),
        finalizeBackupRestore: vi.fn().mockResolvedValue(undefined),
        rebuildChatMemory: () => new Promise<void>(() => undefined),
        completeMemoryRebuild,
        publishDatasetNotice,
      }).then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(30_000);

      expect(settled).toBe(true);
      expect(completeMemoryRebuild).not.toHaveBeenCalled();
      expect(publishDatasetNotice).toHaveBeenLastCalledWith(
        expect.objectContaining({ phase: 'complete' }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores every store into fresh tiers and runs the post-write housekeeping', async () => {
    const { override } = seededSource();
    const exported = await buildBackupExport(undefined, override);

    // Wipe: brand-new destination tiers, pre-seeded with stale RAG vectors that
    // the restore must delete (they rebuild from restored chat history).
    const destIdb = memTier({ [CHAT_VECTORS_KEY]: 'stale-vectors' });
    const destLocal = memTier();
    const destTiers = { local: destLocal, idb: destIdb } as Record<'local' | 'idb', StorageTier>;

    const staged = await stageBackupImport(exported.text);
    await commitBackupImport(staged.envelope, { tiers: destTiers });

    // Stores landed verbatim in their tiers.
    expect(JSON.parse(destIdb.map.get('almamesh-profiles')!)).toEqual({
      state: PROFILES_STATE,
      version: 1,
      datasetEpoch: 0,
    });
    expect(JSON.parse(destIdb.map.get('almamesh-chart-library')!)).toEqual({
      state: CHART_LIBRARY_STATE,
      version: 0,
      datasetEpoch: 0,
    });
    expect(destLocal.map.get('almamesh-language')).toBe(
      JSON.stringify({ state: LANGUAGE_STATE, version: 0 }),
    );

    // Housekeeping: chart route-guard flag set (charts were restored) + stale
    // vectors deleted.
    expect(destLocal.map.get(CHART_FLAG_KEY)).toBe('1');
    expect(destIdb.map.has(CHAT_VECTORS_KEY)).toBe(false);
  });
});
