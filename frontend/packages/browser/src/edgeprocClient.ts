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
    terminate: () => client.dispose(),
  };
}

/** Consumer-owned Worker construction keeps Vite in control of the asset URL. */
export function spawnAlmaSyncEngine(): AlmaSyncEngine {
  return createAlmaSyncEngine(new EdgeProcWorker());
}
