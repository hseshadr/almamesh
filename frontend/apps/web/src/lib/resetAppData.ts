/**
 * The bulletproof escape hatch for a stranded client: wipe every source of
 * stale state that can strand a returning visitor or a fail-closed engine boot —
 * a stale service worker, a stale precache, persisted stores written by an older
 * schema, and the synced signed bundle: the @edgeproc/browser OPFS cache
 * (chunks, manifests, the durable active pointer) plus its IndexedDB rollback
 * floor. Everything else in the origin's OPFS (e.g. the chat-memory SQLite
 * file) is swept too, consistent with this reset deleting every IndexedDB
 * database and CacheStorage cache.
 *
 * SECURITY — why wiping the rollback floor here is sound: the durable active
 * pointer is an anti-rollback floor, so an origin that re-publishes at a lower
 * sequence (or a local dev re-sign) makes every boot fail closed with a
 * `RollbackError` until that floor is gone. An EXPLICIT user reset returns this
 * device to first-install trust: the next pointer is still verified against the
 * pinned ed25519 key, exactly as for a brand-new visitor — it just has no floor.
 * That is the same trust a new user has, and it takes a deliberate click. This
 * module must NEVER be invoked automatically in response to a `RollbackError`
 * (or any integrity failure): an auto-clear would let an attacker who can serve
 * an older signed bundle trigger the wipe and defeat rollback protection. The
 * automatic self-heal paths (`swSelfHeal.ts`, `lazyWithRetry`, chunk-error
 * recovery) deliberately do NOT touch OPFS and preserve the `*-immutable`
 * engine caches.
 *
 * Each cleanup path is isolated in its own try/catch so one failure (a blocked
 * unregister, a locked database) can never stop the others. This module is the
 * single source of truth for the reset — reused by both the global ErrorBoundary
 * and the onboarding error card so the two can never drift apart.
 *
 * Note: this only CLEARS state. Callers decide whether to reload afterwards
 * (`void resetAppData().finally(() => window.location.reload())`).
 */

import { clearAlmaBundleCache } from '@almamesh/browser';

/** Upper bound on the library clear, so "Reset & reload" can never hang. */
const BUNDLE_CLEAR_TIMEOUT_MS = 10_000;

export async function resetAppData(): Promise<void> {
  await unregisterServiceWorkers();
  await clearCacheStorage();
  clearLocalStorage();
  // Before IndexedDB: the library clear opens (then releases) the IndexedDB
  // rollback-floor database, which would otherwise block its deletion.
  await clearEngineBundleCache();
  await clearOpfs();
  await clearIndexedDb();
}

/**
 * Clear ONLY the synced signed-bundle cache (OPFS primary + IndexedDB rollback
 * floor) through @edgeproc/browser's own `EngineClient.clear()`, which runs
 * under the same Web Lock as sync, so it cannot race an in-flight boot. User
 * data (charts, profiles, chat) is untouched. Explicit user action only — see
 * the SECURITY note above. Bounded and best-effort: never rejects, so the
 * caller always reaches its reload.
 */
export async function clearEngineBundleCache(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      clearAlmaBundleCache(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, BUNDLE_CLEAR_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // Best-effort: a sync worker that cannot load (wedged session) falls through to
    // the OPFS sweep + IndexedDB deletion in resetAppData.
  } finally {
    clearTimeout(timer);
  }
}

interface OpfsRoot {
  keys(): AsyncIterable<string>;
  removeEntry(name: string, options: { recursive: boolean }): Promise<void>;
}

/**
 * Sweep every entry at the origin's OPFS root — the fallback that still clears
 * the bundle cache + durable active pointer when the library clear could not
 * run. Each removal is isolated: a file held open by a live worker must not stop
 * the rest.
 */
async function clearOpfs(): Promise<void> {
  try {
    const storage = navigator.storage as { getDirectory?: () => Promise<unknown> } | undefined;
    if (typeof storage?.getDirectory !== 'function') {
      return;
    }
    const root = (await storage.getDirectory()) as OpfsRoot;
    const names: string[] = [];
    for await (const name of root.keys()) {
      names.push(name);
    }
    await Promise.all(
      names.map((name) => root.removeEntry(name, { recursive: true }).catch(() => undefined)),
    );
  } catch {
    // Best-effort.
  }
}

async function unregisterServiceWorkers(): Promise<void> {
  try {
    const sw = navigator.serviceWorker;
    if (!sw?.getRegistrations) {
      return;
    }
    const registrations = await sw.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
  } catch {
    // Best-effort: a blocked unregister must not stop the rest of the reset.
  }
}

async function clearCacheStorage(): Promise<void> {
  try {
    if (typeof caches === 'undefined') {
      return;
    }
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    // Best-effort.
  }
}

function clearLocalStorage(): void {
  try {
    localStorage.clear();
  } catch {
    // Best-effort.
  }
}

async function clearIndexedDb(): Promise<void> {
  try {
    if (typeof indexedDB === 'undefined' || !indexedDB.databases) {
      return;
    }
    const dbs = await indexedDB.databases();
    for (const { name } of dbs) {
      if (name) {
        indexedDB.deleteDatabase(name);
      }
    }
  } catch {
    // Best-effort.
  }
}
