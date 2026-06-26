/**
 * The on-device vector store for chat-memory RAG: persists embedding vectors in
 * IndexedDB (via `idb-keyval`) and ranks them by cosine similarity at query
 * time. Local-first and zero-egress — nothing leaves the browser.
 *
 * Storage shape: every record lives under a single IndexedDB key as a JSON-safe
 * payload (Float32Array serialized to `number[]`). On first access the store
 * lazily rehydrates that payload into an in-memory cache keyed by record id, so
 * subsequent `search`/`allForProfile` calls are synchronous over memory. Writes
 * update the cache and flush the whole payload back (mirrors the chat store's
 * single-key `idb-keyval` pattern). Outside a browser (SSR/tests without a
 * polyfill) IndexedDB is absent and the store degrades to in-memory only.
 */

import { get as idbGet, set as idbSet } from "idb-keyval";

import { cosineSimilarity } from "./cosine";

/** One indexed chat chunk: its embedding plus the metadata needed to retrieve it. */
export interface VectorRecord {
  readonly id: string;
  readonly profile_id: string;
  readonly thread_id: string;
  readonly message_id: string;
  readonly text: string;
  readonly vector: Float32Array;
}

/** A record paired with its cosine similarity to a query vector. */
export interface ScoredRecord {
  readonly record: VectorRecord;
  readonly score: number;
}

/** The persistent, cosine-ranked vector store the RAG pipeline writes to and reads from. */
export interface VectorStore {
  /** Insert or replace records by id, then flush to IndexedDB. */
  upsert(records: readonly VectorRecord[]): Promise<void>;
  /** Every record belonging to `profileId` (load order, unranked). */
  allForProfile(profileId: string): Promise<readonly VectorRecord[]>;
  /** Top-`k` records for `profileId` ranked by descending cosine similarity. */
  search(
    queryVec: Float32Array,
    profileId: string,
    k: number,
  ): Promise<readonly ScoredRecord[]>;
}

/** The single IndexedDB key holding the whole vector index. */
const STORE_KEY = "almamesh-chat-vectors";

/** JSON-safe on-disk shape: `vector` as `number[]` so `idb-keyval` can clone it. */
interface PersistedRecord {
  readonly id: string;
  readonly profile_id: string;
  readonly thread_id: string;
  readonly message_id: string;
  readonly text: string;
  readonly vector: readonly number[];
}

/** Only persist when a real IndexedDB is present; tests/SSR fall back to memory. */
function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

/** Rehydrate a persisted record's `number[]` vector into a `Float32Array`. */
function fromPersisted(p: PersistedRecord): VectorRecord {
  return {
    id: p.id,
    profile_id: p.profile_id,
    thread_id: p.thread_id,
    message_id: p.message_id,
    text: p.text,
    vector: new Float32Array(p.vector),
  };
}

/** Serialize a record's `Float32Array` vector down to a JSON-safe `number[]`. */
function toPersisted(r: VectorRecord): PersistedRecord {
  return {
    id: r.id,
    profile_id: r.profile_id,
    thread_id: r.thread_id,
    message_id: r.message_id,
    text: r.text,
    vector: Array.from(r.vector),
  };
}

/**
 * Create a vector store backed by a single `idb-keyval` key. Each call yields an
 * independent instance with its own lazy cache, so tests can spin up a fresh
 * store that re-reads whatever a prior instance flushed to IndexedDB.
 */
export function createVectorStore(): VectorStore {
  const cache = new Map<string, VectorRecord>();
  let loaded = false;

  async function ensureLoaded(): Promise<void> {
    if (loaded) {
      return;
    }
    if (hasIndexedDb()) {
      const stored = await idbGet<PersistedRecord[]>(STORE_KEY);
      if (stored !== undefined) {
        for (const p of stored) {
          cache.set(p.id, fromPersisted(p));
        }
      }
    }
    loaded = true;
  }

  async function flush(): Promise<void> {
    if (!hasIndexedDb()) {
      return;
    }
    const payload = Array.from(cache.values()).map(toPersisted);
    await idbSet(STORE_KEY, payload);
  }

  return {
    async upsert(records: readonly VectorRecord[]): Promise<void> {
      await ensureLoaded();
      for (const record of records) {
        cache.set(record.id, record);
      }
      await flush();
    },

    async allForProfile(profileId: string): Promise<readonly VectorRecord[]> {
      await ensureLoaded();
      return Array.from(cache.values()).filter(
        (r) => r.profile_id === profileId,
      );
    },

    async search(
      queryVec: Float32Array,
      profileId: string,
      k: number,
    ): Promise<readonly ScoredRecord[]> {
      await ensureLoaded();
      const scored: ScoredRecord[] = [];
      for (const record of cache.values()) {
        if (record.profile_id !== profileId) {
          continue;
        }
        scored.push({ record, score: cosineSimilarity(queryVec, record.vector) });
      }
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, Math.max(0, k));
    },
  };
}
