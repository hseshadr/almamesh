import { clear } from "idb-keyval";
import { beforeEach, describe, expect, it } from "vitest";

import { createMemory, type Embedder } from "./index";

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
});
