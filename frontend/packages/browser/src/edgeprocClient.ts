import {
  EngineClient,
  type EngineSyncResult,
  type EngineWorkerLike,
} from "@edgeproc/browser";
import EdgeProcWorker from "./edgeproc.worker?worker";

const CACHE_NAMESPACE = "edgeproc-browser";
const LEGACY_INDEXED_DB_LAYOUT = Object.freeze({
  database: "edgeproc-browser-cache",
  store: "content-addressed-cache",
  separator: ":" as const,
});

type ExitGateGlobals = typeof globalThis & {
  __EDGEPROC_FORCE_INDEXEDDB_CACHE__?: boolean;
  __EDGEPROC_SELECTED_CACHE__?: string;
};

/** AlmaMesh's small domain adapter over the generic signed-bundle client. */
export interface AlmaSyncEngine {
  sync(
    baseUrl: string,
    pubkeyUrl: string,
    expectedBundleId: string,
    expectedChannel: string,
  ): Promise<EngineSyncResult>;
  readFile(path: string): Promise<Uint8Array>;
  /**
   * Clear the durable signed-bundle cache (OPFS chunks/manifests + the durable
   * active pointer + the IndexedDB rollback floor) via the library's own
   * `EngineClient.clear()`, under the same Web Lock as sync/read.
   */
  clearCache(): Promise<void>;
  terminate(): void;
}

export function createAlmaSyncEngine(worker: EngineWorkerLike): AlmaSyncEngine {
  const client = new EngineClient(worker);
  return {
    async sync(baseUrl, pubkeyUrl, expectedBundleId, expectedChannel) {
      const hooks = globalThis as ExitGateGlobals;
      const forceIndexedDb = hooks.__EDGEPROC_FORCE_INDEXEDDB_CACHE__ === true;
      const result = await client.sync(baseUrl, pubkeyUrl, {
        expectedBundleId,
        expectedChannel,
        cacheNamespace: CACHE_NAMESPACE,
        indexedDbLayout: LEGACY_INDEXED_DB_LAYOUT,
        ...(forceIndexedDb ? { storageBackend: "indexeddb" as const } : {}),
      });
      if (forceIndexedDb) hooks.__EDGEPROC_SELECTED_CACHE__ = result.cacheBackend;
      return result;
    },
    readFile: (path) => client.readFile(path),
    clearCache: () =>
      client.clear({
        cacheNamespace: CACHE_NAMESPACE,
        indexedDbLayout: LEGACY_INDEXED_DB_LAYOUT,
      }),
    terminate: () => client.dispose(),
  };
}

/** Consumer-owned Worker construction keeps Vite in control of the asset URL. */
export function spawnAlmaSyncEngine(): AlmaSyncEngine {
  return createAlmaSyncEngine(new EdgeProcWorker());
}

/**
 * Wipe the synced bundle cache with a dedicated, short-lived sync Worker.
 *
 * SECURITY: this discards the anti-rollback floor, returning this device to
 * first-install trust (the next pointer is verified against the pinned key
 * exactly as for a new user, with no floor). It is for an EXPLICIT user
 * "Reset" action only — never call it automatically in response to a
 * `RollbackError`, which would turn rollback protection into a no-op.
 */
export async function clearAlmaBundleCache(
  spawn: () => AlmaSyncEngine = spawnAlmaSyncEngine,
): Promise<void> {
  const engine = spawn();
  try {
    await engine.clearCache();
  } finally {
    engine.terminate();
  }
}
