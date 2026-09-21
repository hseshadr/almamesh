import { describe, expect, it, vi } from "vitest";

import {
  createVectorStore,
  SemanticMemoryStorageUnavailableError,
  type SqliteVectorIndexLike,
  type VectorRecord,
} from "./vectorStore";

function record(
  id: string,
  profileId: string,
  vector: readonly number[],
  text = id,
  threadId = `t-${profileId}`,
): VectorRecord {
  return {
    id,
    profile_id: profileId,
    thread_id: threadId,
    message_id: `m-${id}`,
    text,
    vector: new Float32Array(vector),
  };
}

function fakeIndex() {
  const inserted = new Map<
    string,
    { readonly id: string; readonly vector: Float32Array; readonly metadata: Readonly<Record<string, string | number | boolean | null>> }
  >();
  const index: SqliteVectorIndexLike = {
    name: "test",
    dimension: 2,
    capabilities: {
      metrics: ["cosine"],
      exact: true,
      persistent: true,
      metadataFiltering: true,
      scopedDelete: true,
    },
    insert: vi.fn(async (records) => {
      for (const item of records) inserted.set(item.id, item);
    }),
    read: vi.fn(async (id) => inserted.get(id)),
    search: vi.fn(async (_query, limit, filters) =>
      [...inserted.values()]
        .filter((item) =>
          Object.entries(filters ?? {}).every(
            ([key, value]) => item.metadata[key] === value,
          ),
        )
        .slice(0, limit)
        .map((item, index) => ({
          id: item.id,
          distance: index / 10,
          metadata: item.metadata,
        })),
    ),
    delete: vi.fn(async (ids, filters) => {
      let count = 0;
      for (const id of ids) {
        const item = inserted.get(id);
        if (
          item !== undefined &&
          Object.entries(filters ?? {}).every(
            ([key, value]) => item.metadata[key] === value,
          )
        ) {
          inserted.delete(id);
          count += 1;
        }
      }
      return count;
    }),
    deleteWhere: vi.fn(async (filters) => {
      let count = 0;
      for (const [id, item] of inserted) {
        if (Object.entries(filters).every(([key, value]) => item.metadata[key] === value)) {
          inserted.delete(id);
          count += 1;
        }
      }
      return count;
    }),
    clear: vi.fn(async () => {
      const count = inserted.size;
      inserted.clear();
      return count;
    }),
    stats: vi.fn(async () => ({
      name: "test",
      dimension: 2,
      vectorCount: inserted.size,
      vectorBytes: inserted.size * 2 * Float32Array.BYTES_PER_ELEMENT,
    })),
    runtimeInfo: vi.fn(async () => ({
      sqliteVersion: "3.53.4",
      vectorVersion: "1.1.2",
      vectorBackend: "scalar",
      bundledExtensions: ["vector_version"],
    })),
    dispose: vi.fn(async () => undefined),
  };
  return { index, inserted };
}

describe("createVectorStore", () => {
  it("fails closed before spawning SQLite when OPFS cannot open", async () => {
    const store = createVectorStore({
      dimension: 2,
      opfsProbe: async () => {
        throw new DOMException("transient failure", "UnknownError");
      },
    });

    await expect(store.ready()).rejects.toBeInstanceOf(
      SemanticMemoryStorageUnavailableError,
    );
    await expect(store.ready()).rejects.toThrow(
      "Semantic memory requires a working Origin Private File System",
    );
  });

  it("opens the shared SQLite Worker index with OPFS persistence", async () => {
    const { index } = fakeIndex();
    const indexFactory = vi.fn(async () => index);
    const store = createVectorStore({ dimension: 2, indexFactory });

    await store.ready();

    expect(indexFactory).toHaveBeenCalledWith({
      name: "almamesh-chat-memory-v1",
      dimension: 2,
      persistence: "opfs",
    });
    await expect(store.runtimeInfo()).resolves.toMatchObject({
      sqliteVersion: "3.53.4",
      vectorVersion: "1.1.2",
    });
  });

  it("inserts generation-prefixed physical ids and flat filter metadata", async () => {
    const { index, inserted } = fakeIndex();
    const store = createVectorStore({
      dimension: 2,
      generation: () => 7,
      indexFactory: async () => index,
    });

    await store.upsert([record("chunk#0", "profile", [1, 0], "private", "thread")]);

    expect(index.insert).toHaveBeenCalledOnce();
    const [physical] = [...inserted.values()];
    expect(physical.id).toBe('["7","chunk#0"]');
    expect(physical.metadata).toEqual({
      generation: "7",
      record_id: "chunk#0",
      profile_id: "profile",
      thread_id: "thread",
      message_id: "m-chunk#0",
      text: "private",
    });
  });

  it("delegates ranking to sqlite-vector and maps cosine distance to score", async () => {
    const { index } = fakeIndex();
    const store = createVectorStore({
      dimension: 2,
      generation: () => "4",
      indexFactory: async () => index,
    });
    await store.upsert([
      record("near", "p1", [1, 0], "near", "t1"),
      record("far", "p1", [0, 1], "far", "t1"),
    ]);

    const hits = await store.search(new Float32Array([1, 0]), "p1", 2);

    expect(index.search).toHaveBeenCalledWith(new Float32Array([1, 0]), 2, {
      profile_id: "p1",
      generation: "4",
    });
    expect(hits.map((hit) => [hit.record.id, hit.score])).toEqual([
      ["near", 1],
      ["far", 0.9],
    ]);
  });

  it("uses atomic filter-only SQLite deletes for profile and thread erasure", async () => {
    const { index } = fakeIndex();
    const store = createVectorStore({ dimension: 2, indexFactory: async () => index });

    await store.deleteForProfile("p1");
    await store.deleteForThread("t1");

    expect(index.deleteWhere).toHaveBeenNthCalledWith(1, { profile_id: "p1" });
    expect(index.deleteWhere).toHaveBeenNthCalledWith(2, { thread_id: "t1" });
  });

  it("delegates whole-index reset and resource disposal to SQLite", async () => {
    const { index } = fakeIndex();
    const store = createVectorStore({ dimension: 2, indexFactory: async () => index });

    await store.clear();
    await store.dispose();

    expect(index.clear).toHaveBeenCalledOnce();
    expect(index.dispose).toHaveBeenCalledOnce();
  });

  it("does not insert when the deletion ledger rejects the starting generation", async () => {
    const { index } = fakeIndex();
    const ledgerGuard = {
      acceptsWrite: vi.fn(async () => false),
      acceptsRead: vi.fn(async () => true),
    };
    const store = createVectorStore({
      dimension: 2,
      generation: () => 8,
      ledgerGuard,
      indexFactory: async () => index,
    });

    await store.upsert([record("stale", "p1", [1, 0])], 7);

    expect(index.insert).not.toHaveBeenCalled();
  });

  it("removes an inserted generation if the ledger changes during the write", async () => {
    const { index, inserted } = fakeIndex();
    const ledgerGuard = {
      acceptsWrite: vi.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false),
      acceptsRead: vi.fn(async () => true),
    };
    const store = createVectorStore({
      dimension: 2,
      ledgerGuard,
      indexFactory: async () => index,
    });

    await store.upsert([record("racy", "p1", [1, 0])], 3);

    expect(index.delete).toHaveBeenCalledWith(['["3","racy"]'], {
      generation: "3",
    });
    expect(inserted.size).toBe(0);
  });

  it("hides every result while the durable rebuild marker is pending", async () => {
    const { index } = fakeIndex();
    const ledgerGuard = {
      acceptsWrite: vi.fn(async () => true),
      acceptsRead: vi.fn(async () => false),
    };
    const store = createVectorStore({
      dimension: 2,
      ledgerGuard,
      indexFactory: async () => index,
    });
    await store.upsert([record("partial", "p1", [1, 0])], 9);

    await expect(store.search(new Float32Array([1, 0]), "p1", 1, 9)).resolves.toEqual([]);
    expect(index.search).not.toHaveBeenCalled();
  });

  it("fails closed when persisted hit metadata is malformed", async () => {
    const { index } = fakeIndex();
    vi.mocked(index.search).mockResolvedValueOnce([
      {
        id: '["0","bad"]',
        distance: 0,
        metadata: { profile_id: "p1", generation: "0" },
      },
    ]);
    const store = createVectorStore({ dimension: 2, indexFactory: async () => index });

    await expect(store.search(new Float32Array([1, 0]), "p1", 1)).rejects.toThrow(
      "invalid SQLite vector metadata",
    );
  });
});
