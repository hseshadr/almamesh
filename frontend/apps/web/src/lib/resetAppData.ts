/**
 * The bulletproof escape hatch for a stranded client: wipe every source of
 * stale state that can strand a returning visitor or a fail-closed engine boot —
 * a stale service worker, a stale precache, persisted stores written by an older
 * schema, and a corrupt synced bundle in IndexedDB/OPFS-backed caches.
 *
 * Each cleanup path is isolated in its own try/catch so one failure (a blocked
 * unregister, a locked database) can never stop the others. This module is the
 * single source of truth for the reset — reused by both the global ErrorBoundary
 * and the onboarding error card so the two can never drift apart.
 *
 * Note: this only CLEARS state. Callers decide whether to reload afterwards
 * (`void resetAppData().finally(() => window.location.reload())`).
 */

export async function resetAppData(): Promise<void> {
  await unregisterServiceWorkers();
  await clearCacheStorage();
  clearLocalStorage();
  await clearIndexedDb();
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
