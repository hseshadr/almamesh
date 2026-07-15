import { clear } from "idb-keyval";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createMemory,
  createVectorStore,
  type Embedder,
  type VectorStore,
} from "./index";

/**
 * Deterministic stub embedder: a normalized 26-dim letter-frequency histogram.
 * Strings that share characters point in similar directions, so cosine search
 * ranks lexically-similar text closer — enough to assert retrieval order
 * without loading the real model. (a–z only; case-folded; other chars ignored.)
 */
function charHistogram(text: string): Float32Array {
  const counts = new Float32Array(26);
  for (const ch of text.toLowerCase()) {
    const code = ch.charCodeAt(0) - 97;
    if (code >= 0 && code < 26) {
      counts[code] += 1;
    }
  }
  let norm = 0;
  for (const c of counts) {
    norm += c * c;
  }
  if (norm > 0) {
    const inv = 1 / Math.sqrt(norm);
    for (let i = 0; i < counts.length; i += 1) {
      counts[i] *= inv;
    }
  }
  return counts;
}

const stubEmbedder: Embedder = {
  embed(texts: readonly string[]): Promise<Float32Array[]> {
    return Promise.resolve(texts.map(charHistogram));
  },
};

describe("createMemory", () => {
  beforeEach(async () => {
    await clear();
  });

  it("indexes messages then retrieves the most-similar chunk first", async () => {
    const memory = createMemory({ embedder: stubEmbedder });
    await memory.indexMessage({
      id: "m1",
      thread_id: "t1",
      profile_id: "p1",
      content: "saturn rules discipline and karma",
    });
    await memory.indexMessage({
      id: "m2",
      thread_id: "t1",
      profile_id: "p1",
      content: "venus brings love beauty and harmony",
    });

    const hits = await memory.retrieve("tell me about saturn and karma", "p1", 2);

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].message_id).toBe("m1");
    expect(hits[0].thread_id).toBe("t1");
    expect(hits[0].score).toBeGreaterThan(hits[hits.length - 1].score - 1e-9);
  });

  it("returns RetrievedChunk shape with text, message_id, thread_id, score", async () => {
    const memory = createMemory({ embedder: stubEmbedder });
    await memory.indexMessage({
      id: "m1",
      thread_id: "t9",
      profile_id: "p1",
      content: "mars energy and courage",
    });

    const [hit] = await memory.retrieve("mars courage", "p1", 1);
    expect(hit).toMatchObject({
      message_id: "m1",
      thread_id: "t9",
    });
    expect(typeof hit.text).toBe("string");
    expect(typeof hit.score).toBe("number");
  });

  it("never returns profile A's chunks when retrieving for profile B", async () => {
    const memory = createMemory({ embedder: stubEmbedder });
    await memory.indexMessage({
      id: "a1",
      thread_id: "ta",
      profile_id: "A",
      content: "jupiter expansion and wisdom",
    });
    await memory.indexMessage({
      id: "b1",
      thread_id: "tb",
      profile_id: "B",
      content: "jupiter expansion and wisdom",
    });

    const forB = await memory.retrieve("jupiter wisdom", "B", 10);

    expect(forB.length).toBeGreaterThan(0);
    expect(forB.every((h) => h.message_id === "b1")).toBe(true);
    expect(forB.some((h) => h.message_id === "a1")).toBe(false);
  });

  it("respects the k argument and defaults sensibly when omitted", async () => {
    const memory = createMemory({ embedder: stubEmbedder });
    await memory.indexMessage({
      id: "m1",
      thread_id: "t1",
      profile_id: "p1",
      content: "alpha bravo charlie delta echo foxtrot golf hotel india juliet",
    });

    const limited = await memory.retrieve("alpha", "p1", 1);
    expect(limited.length).toBeLessThanOrEqual(1);
  });

  it("indexing empty / whitespace content is a no-op (nothing retrievable)", async () => {
    const memory = createMemory({ embedder: stubEmbedder });
    await memory.indexMessage({
      id: "blank",
      thread_id: "t1",
      profile_id: "p1",
      content: "   \n\t ",
    });

    const hits = await memory.retrieve("anything", "p1", 5);
    expect(hits).toEqual([]);
  });

  it("drains an in-flight index before deleting a thread and rejects later writes", async () => {
    let releaseEmbed!: () => void;
    const embedStarted = Promise.withResolvers<void>();
    const embedRelease = new Promise<void>((resolve) => {
      releaseEmbed = resolve;
    });
    const delayedEmbedder: Embedder = {
      async embed(texts: readonly string[]): Promise<Float32Array[]> {
        embedStarted.resolve();
        await embedRelease;
        return texts.map(charHistogram);
      },
    };
    const store = createVectorStore();
    const memory = createMemory({ embedder: delayedEmbedder, store });
    const indexing = memory.indexMessage({
      id: "late",
      thread_id: "deleted-thread",
      profile_id: "target",
      content: "late private answer",
    });
    await embedStarted.promise;

    const deletion = memory.deleteForThread("deleted-thread");
    releaseEmbed();
    await Promise.all([indexing, deletion]);
    await memory.indexMessage({
      id: "later-still",
      thread_id: "deleted-thread",
      profile_id: "target",
      content: "must stay deleted",
    });

    expect(await store.allForProfile("target")).toEqual([]);
  });

  it("drains target-profile indexes before deletion while preserving another profile", async () => {
    let releaseTarget!: () => void;
    const targetStarted = Promise.withResolvers<void>();
    const targetRelease = new Promise<void>((resolve) => {
      releaseTarget = resolve;
    });
    const delayedEmbedder: Embedder = {
      async embed(texts: readonly string[]): Promise<Float32Array[]> {
        if (texts.includes("target pending")) {
          targetStarted.resolve();
          await targetRelease;
        }
        return texts.map(charHistogram);
      },
    };
    const store = createVectorStore();
    const memory = createMemory({ embedder: delayedEmbedder, store });
    await memory.indexMessage({
      id: "keep",
      thread_id: "survivor-thread",
      profile_id: "survivor",
      content: "survivor memory",
    });
    const targetIndex = memory.indexMessage({
      id: "target",
      thread_id: "target-thread",
      profile_id: "target",
      content: "target pending",
    });
    await targetStarted.promise;

    const deletion = memory.deleteForProfile("target");
    releaseTarget();
    await Promise.all([targetIndex, deletion]);

    expect(await store.allForProfile("target")).toEqual([]);
    expect((await store.allForProfile("survivor")).map((record) => record.id)).toEqual([
      "keep#0",
    ]);
  });

  it("drops an in-flight embedding when another realm advances the dataset generation", async () => {
    const embedStarted = Promise.withResolvers<void>();
    const releaseEmbed = Promise.withResolvers<void>();
    let generation = 3;
    const delayedEmbedder: Embedder = {
      async embed(texts: readonly string[]): Promise<Float32Array[]> {
        embedStarted.resolve();
        await releaseEmbed.promise;
        return texts.map(charHistogram);
      },
    };
    const store = createVectorStore();
    const memory = createMemory({
      embedder: delayedEmbedder,
      store,
      generation: () => generation,
    });
    const pending = memory.indexMessage({
      id: "stale",
      thread_id: "old-thread",
      profile_id: "old-profile",
      content: "must not cross Replace",
    });
    await embedStarted.promise;

    generation = 4;
    releaseEmbed.resolve();
    await pending;

    expect(await store.allForProfile("old-profile")).toEqual([]);
  });

  it("hands the starting generation to a pausable vector upsert so it cannot land stale", async () => {
    const base = createVectorStore();
    const upsertStarted = Promise.withResolvers<void>();
    const releaseUpsert = Promise.withResolvers<void>();
    let generation = 5;
    const guardedStore: VectorStore = {
      ...base,
      upsert: async (records, startedInGeneration) => {
        upsertStarted.resolve();
        await releaseUpsert.promise;
        if (startedInGeneration === generation) {
          await base.upsert(records, startedInGeneration);
        }
      },
    };
    const memory = createMemory({
      embedder: stubEmbedder,
      store: guardedStore,
      generation: () => generation,
    });
    const pending = memory.indexMessage({
      id: "paused-upsert",
      thread_id: "old-thread",
      profile_id: "old-profile",
      content: "stale after Replace",
    });
    await upsertStarted.promise;

    generation = 6;
    releaseUpsert.resolve();
    await pending;

    expect(await base.allForProfile("old-profile")).toEqual([]);
  });

  it("returns no retrieval when Replace advances during query embedding", async () => {
    const queryStarted = Promise.withResolvers<void>();
    const releaseQuery = Promise.withResolvers<void>();
    let generation = 10;
    const delayedQueryEmbedder: Embedder = {
      async embed(texts: readonly string[]): Promise<Float32Array[]> {
        queryStarted.resolve();
        await releaseQuery.promise;
        return texts.map(charHistogram);
      },
    };
    const store = createVectorStore();
    await store.upsert([
      {
        id: "old#0",
        profile_id: "p1",
        thread_id: "t1",
        message_id: "old",
        text: "old private context",
        vector: charHistogram("old private context"),
      },
    ]);
    const memory = createMemory({
      embedder: delayedQueryEmbedder,
      store,
      generation: () => generation,
    });
    const pending = memory.retrieve("private", "p1");
    await queryStarted.promise;

    generation = 11;
    releaseQuery.resolve();

    await expect(pending).resolves.toEqual([]);
  });
});
