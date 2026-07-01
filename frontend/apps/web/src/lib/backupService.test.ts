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
import { describe, expect, it } from 'vitest';

import {
  BackupCryptoError,
  BackupError,
  CHART_FLAG_KEY,
  CHAT_VECTORS_KEY,
  type StorageTier,
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
    expect(destIdb.map.get('almamesh-profiles')).toBe(JSON.stringify({ state: PROFILES_STATE, version: 1 }));
    expect(destIdb.map.get('almamesh-chart-library')).toBe(
      JSON.stringify({ state: CHART_LIBRARY_STATE, version: 0 }),
    );
    expect(destLocal.map.get('almamesh-language')).toBe(
      JSON.stringify({ state: LANGUAGE_STATE, version: 0 }),
    );

    // Housekeeping: chart route-guard flag set (charts were restored) + stale
    // vectors deleted.
    expect(destLocal.map.get(CHART_FLAG_KEY)).toBe('1');
    expect(destIdb.map.has(CHAT_VECTORS_KEY)).toBe(false);
  });
});
