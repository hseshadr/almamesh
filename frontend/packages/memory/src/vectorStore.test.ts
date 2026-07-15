import { clear as clearIdb, set as setIdb } from "idb-keyval";
import { beforeEach, describe, expect, it } from "vitest";

import { createVectorStore, type VectorRecord } from "./vectorStore";

/** Build a record with a given id/profile and a raw (un-normalized) vector. */
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

describe("createVectorStore", () => {
  // Each test starts from an empty IndexedDB so cases never leak into each other.
  beforeEach(async () => {
    await clearIdb();
  });

  it("upsert then search ranks records by cosine similarity to the query", async () => {
    const store = createVectorStore();
    await store.upsert([
      record("near", "p1", [1, 0.1]),
      record("far", "p1", [0.1, 1]),
      record("mid", "p1", [0.7, 0.7]),
    ]);

    const results = await store.search(new Float32Array([1, 0]), "p1", 3);

    expect(results.map((r) => r.record.id)).toEqual(["near", "mid", "far"]);
    // Scores are monotonically non-increasing.
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[1].score).toBeGreaterThan(results[2].score);
  });

  it("honors the k limit, returning only the top matches", async () => {
    const store = createVectorStore();
    await store.upsert([
      record("a", "p1", [1, 0]),
      record("b", "p1", [0.9, 0.2]),
      record("c", "p1", [0.2, 0.9]),
    ]);

    const results = await store.search(new Float32Array([1, 0]), "p1", 2);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.record.id)).toEqual(["a", "b"]);
  });

  it("upsert replaces a record with the same id rather than duplicating it", async () => {
    const store = createVectorStore();
    await store.upsert([record("x", "p1", [1, 0], "first")]);
    await store.upsert([record("x", "p1", [1, 0], "second")]);

    const all = await store.allForProfile("p1");
    expect(all).toHaveLength(1);
    expect(all[0].text).toBe("second");
  });

  it("scopes search and allForProfile to the requested profile", async () => {
    const store = createVectorStore();
    await store.upsert([
      record("a", "p1", [1, 0]),
      record("b", "p2", [1, 0]),
    ]);

    const p1Hits = await store.search(new Float32Array([1, 0]), "p1", 10);
    expect(p1Hits.map((r) => r.record.id)).toEqual(["a"]);

    const p2All = await store.allForProfile("p2");
    expect(p2All.map((r) => r.id)).toEqual(["b"]);
  });

  it("persists across instances: a fresh store reloads vectors from IndexedDB", async () => {
    const writer = createVectorStore();
    await writer.upsert([
      record("near", "p1", [1, 0.1]),
      record("far", "p1", [0.1, 1]),
    ]);

    // A brand-new instance has an empty cache and must rehydrate from storage.
    const reader = createVectorStore();
    const results = await reader.search(new Float32Array([1, 0]), "p1", 2);

    expect(results.map((r) => r.record.id)).toEqual(["near", "far"]);
    // The rehydrated vector is a real Float32Array, not a plain number[].
    expect(results[0].record.vector).toBeInstanceOf(Float32Array);
  });

  it("deletes only one profile from the loaded cache and persisted store", async () => {
    const store = createVectorStore();
    await store.upsert([
      record("p1-a", "p1", [1, 0]),
      record("p1-b", "p1", [0, 1]),
      record("p2-a", "p2", [1, 1]),
    ]);

    await store.deleteForProfile("p1");

    expect(await store.allForProfile("p1")).toEqual([]);
    expect((await store.allForProfile("p2")).map((item) => item.id)).toEqual([
      "p2-a",
    ]);
    const reloaded = createVectorStore();
    expect(await reloaded.allForProfile("p1")).toEqual([]);
    expect((await reloaded.allForProfile("p2")).map((item) => item.id)).toEqual([
      "p2-a",
    ]);
  });

  it("deletes only one thread from the loaded cache and persisted store", async () => {
    const store = createVectorStore();
    await store.upsert([
      record("t1-a", "p1", [1, 0], "t1-a", "t1"),
      record("t1-b", "p2", [0, 1], "t1-b", "t1"),
      record("t2-a", "p1", [1, 1], "t2-a", "t2"),
    ]);

    await store.deleteForThread("t1");

    expect(
      (await store.allForProfile("p1")).map((item) => item.id),
    ).toEqual(["t2-a"]);
    expect(await store.allForProfile("p2")).toEqual([]);
    const reloaded = createVectorStore();
    expect(
      (await reloaded.allForProfile("p1")).map((item) => item.id),
    ).toEqual(["t2-a"]);
    expect(await reloaded.allForProfile("p2")).toEqual([]);
  });

  it("clears every vector from the loaded cache and persisted store", async () => {
    const store = createVectorStore();
    await store.upsert([
      record("p1-a", "p1", [1, 0]),
      record("p2-a", "p2", [0, 1]),
    ]);

    await store.clear();

    expect(await store.allForProfile("p1")).toEqual([]);
    expect(await store.allForProfile("p2")).toEqual([]);
    const reloaded = createVectorStore();
    expect(await reloaded.allForProfile("p1")).toEqual([]);
    expect(await reloaded.allForProfile("p2")).toEqual([]);
  });

  it("refuses a stale generation inside the same IDB transaction as vector persistence", async () => {
    let generation = 0;
    const guard = {
      key: "almamesh-deletion-tombstones",
      accepts: (ledger: unknown, expected: string | number) => {
        const state = ledger as {
          activeEpoch?: number;
          restoreEpoch?: number;
          restoreInProgress?: boolean;
        } | null;
        return (
          state?.restoreInProgress !== true &&
          (state?.activeEpoch ?? 0) === Number(expected) &&
          (state?.restoreEpoch ?? 0) === Number(expected)
        );
      },
    };
    const store = createVectorStore({ generation: () => generation, ledgerGuard: guard });
    await store.upsert([record("old", "p1", [1, 0])], 0);
    await setIdb(guard.key, {
      activeEpoch: 0,
      restoreEpoch: 1,
      restoreInProgress: true,
    });

    generation = 1;
    await store.upsert([record("stale", "p1", [0, 1])], 0);

    const reloaded = createVectorStore();
    expect((await reloaded.allForProfile("p1")).map((item) => item.id)).toEqual(["old"]);
  });
});
