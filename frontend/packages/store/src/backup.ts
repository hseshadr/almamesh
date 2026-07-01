/**
 * Backup & Restore — core storage collect/apply (Spec 061).
 *
 * AlmaMesh is local-first with no server. A "backup" is one portable file the
 * user carries between browsers. This module is the PURE core of that transfer:
 * it reads the persisted user-data stores VERBATIM into a typed envelope
 * ({@link collectBackup}) and writes an envelope back ({@link applyBackup}),
 * staged all-or-nothing. It never re-implements Zustand migration — each store's
 * own `persist` + `migrate` runs on the next app load from the `{state, version}`
 * blob restored here.
 *
 * Every tier is reached through the injectable {@link StorageTier} facade, so the
 * pure functions are unit-testable with in-memory fakes. The only browser-bound
 * seam is {@link createBrowserTiers}. The caller supplies the timestamp + app
 * version (no `Date.now()` here) so exports stay deterministic in tests.
 */

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type { BackupEnvelopePlain, BackupStoreSnapshot, BackupStores } from '@almamesh/shared-types';

/** The two persistence tiers a backup spans: `localStorage` and idb-keyval. */
export type BackupTier = 'local' | 'idb';

/**
 * A tiny async key/value facade over one storage tier — the seam that lets the
 * pure collect/apply logic run against in-memory fakes in tests and real browser
 * storage in production.
 */
export interface StorageTier {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

/**
 * The single source of truth for what a backup contains. Adding a future
 * persisted store is a one-line change here. Order is preserved (export order).
 */
export const BACKUP_STORES: ReadonlyArray<{ key: string; tier: BackupTier }> = [
  { key: 'almamesh-profiles', tier: 'idb' },
  { key: 'almamesh-chart-library', tier: 'idb' },
  { key: 'almamesh-life-events', tier: 'idb' },
  { key: 'almamesh-rectification-records', tier: 'idb' },
  { key: 'almamesh-chat-history', tier: 'idb' },
  { key: 'almamesh-interpretations', tier: 'local' },
  { key: 'almamesh-language', tier: 'local' },
];

/** localStorage route-guard flag — re-set on import iff charts were restored. */
export const CHART_FLAG_KEY = 'almamesh-chart';

/** idb-keyval RAG-embeddings key — deleted on import so vectors rebuild from chat. */
export const CHAT_VECTORS_KEY = 'almamesh-chat-vectors';

/** A typed, code-tagged failure so the UI can message the exact refusal reason. */
export class BackupError extends Error {
  constructor(
    public code: 'bad_format' | 'too_new' | 'corrupt',
    message: string,
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

/**
 * The injected dependencies of the pure collect/apply functions: the tier
 * facades plus the export-edge stamps (app build version + ISO timestamp).
 */
export interface BackupDeps {
  tiers: Record<BackupTier, StorageTier>;
  appVersion: string;
  now: string;
}

/** Parse one persisted `{ state, version }` blob, rejecting anything malformed. */
function parseSnapshot(key: string, raw: string): BackupStoreSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BackupError('corrupt', `Store "${key}" holds unparseable JSON.`);
  }
  const version = (parsed as { version?: unknown } | null)?.version;
  if (typeof parsed !== 'object' || parsed === null || typeof version !== 'number') {
    throw new BackupError('corrupt', `Store "${key}" is missing a numeric persist version.`);
  }
  return { version, state: (parsed as { state: unknown }).state };
}

/**
 * Read every present store from its tier into a plaintext envelope. A store that
 * is absent (a fresh, never-hydrated store) is simply skipped; a present store
 * whose bytes are malformed throws {@link BackupError} `corrupt`.
 */
export async function collectBackup(deps: BackupDeps): Promise<BackupEnvelopePlain> {
  const stores: BackupStores = {};
  for (const entry of BACKUP_STORES) {
    const raw = await deps.tiers[entry.tier].get(entry.key);
    if (raw === null) continue;
    stores[entry.key] = parseSnapshot(entry.key, raw);
  }
  return {
    format: 'almamesh-backup',
    formatVersion: 1,
    app: { version: deps.appVersion },
    exportedAt: deps.now,
    encryption: 'none',
    stores,
  };
}

/** One store staged for writing: the destination + the exact bytes to write. */
interface StagedWrite {
  key: string;
  tier: BackupTier;
  serialized: string;
}

/**
 * Restore an envelope (Replace). Validates the envelope shape, then stages every
 * known store fully in memory BEFORE touching storage.
 *
 * The all-or-nothing guarantee is real for VALIDATION and STAGING: an invalid,
 * too-new, or corrupt-to-serialize file is rejected up front, so a bad file never
 * begins a write. The WRITES themselves are NOT transactional — `localStorage`
 * and idb-keyval cannot be rolled back together, so a mid-write storage failure
 * (e.g. an IDB quota error on the third store) can leave a partial replace. That
 * failure is surfaced to the caller (rejected), never swallowed.
 *
 * This is a TRUE "Replace all": a known store the envelope OMITS is DELETED, so
 * no stale local data survives an import of a sparse backup. Unknown store keys
 * are ignored (forward-compatible). After the writes it sets the chart route-guard
 * flag iff charts came back (else clears it) and deletes the stale RAG vectors so
 * they rebuild from restored chat history. Zustand `persist` + each store's
 * `migrate` run on the next app load.
 */
export async function applyBackup(envelope: BackupEnvelopePlain, deps: BackupDeps): Promise<void> {
  if (envelope.format !== 'almamesh-backup') {
    throw new BackupError('bad_format', 'This file is not an AlmaMesh backup.');
  }
  if (envelope.formatVersion > 1) {
    throw new BackupError(
      'too_new',
      'This backup was made by a newer version of AlmaMesh. Update the app first.',
    );
  }
  if (envelope.formatVersion < 1) {
    throw new BackupError('bad_format', 'This backup has an invalid format version.');
  }

  const tierByKey = new Map<string, BackupTier>(BACKUP_STORES.map((e) => [e.key, e.tier]));

  // STAGE — serialize every known store up front; any throw aborts before writes.
  const staged: StagedWrite[] = [];
  let chartLibraryPresent = false;
  for (const [key, snapshot] of Object.entries(envelope.stores)) {
    const tier = tierByKey.get(key);
    if (tier === undefined) continue; // unknown/future key — ignore, don't fail
    staged.push({
      key,
      tier,
      serialized: JSON.stringify({ state: snapshot.state, version: snapshot.version }),
    });
    if (key === 'almamesh-chart-library') chartLibraryPresent = true;
  }

  // WRITE — reached only once every present store staged cleanly. Not atomic
  // against a mid-write storage failure (see docstring); such a failure rejects.
  for (const item of staged) {
    await deps.tiers[item.tier].set(item.key, item.serialized);
  }

  // REPLACE — a known store the backup omitted must not keep stale local data.
  const presentKeys = new Set(Object.keys(envelope.stores));
  for (const entry of BACKUP_STORES) {
    if (!presentKeys.has(entry.key)) await deps.tiers[entry.tier].del(entry.key);
  }

  // Post-write housekeeping: the route-guard flag tracks charts-present.
  if (chartLibraryPresent) await deps.tiers.local.set(CHART_FLAG_KEY, '1');
  else await deps.tiers.local.del(CHART_FLAG_KEY);
  await deps.tiers.idb.del(CHAT_VECTORS_KEY);
}

/**
 * Real browser tiers: `local` over `window.localStorage`, `idb` over idb-keyval
 * (the single `keyval-store` DB every persisted idb store already shares). Thin
 * on purpose — all logic lives in the pure functions above. Window access is lazy
 * (inside the methods) so importing this module never touches `window`.
 */
export function createBrowserTiers(): Record<BackupTier, StorageTier> {
  return {
    local: {
      get: (key) => Promise.resolve(window.localStorage.getItem(key)),
      set: (key, value) => {
        window.localStorage.setItem(key, value);
        return Promise.resolve();
      },
      del: (key) => {
        window.localStorage.removeItem(key);
        return Promise.resolve();
      },
    },
    idb: {
      get: async (key) => (await idbGet<string>(key)) ?? null,
      set: (key, value) => idbSet(key, value),
      del: (key) => idbDel(key),
    },
  };
}
