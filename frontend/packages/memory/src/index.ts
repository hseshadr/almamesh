/**
 * `@almamesh/memory` — in-browser, zero-egress semantic memory (RAG) over chat
 * history. A chat message is chunked, embedded on-device (self-hosted model in a
 * Web Worker; see {@link createWorkerEmbedder}), stored as vectors in IndexedDB,
 * and retrieved by cosine similarity. No network, offline-first.
 *
 * The pipeline depends only on the {@link Embedder} contract, so unit tests
 * inject a deterministic stub and never load the model runtime. This module and
 * everything it imports at top level are runtime-light — the heavy
 * `@huggingface/transformers` dependency stays confined to `embedder.worker`.
 */

import { chunkText } from "./chunk";
import type { Embedder } from "./embedder";
import {
  createVectorStore,
  type VectorRecord,
  type VectorStore,
} from "./vectorStore";

export { chunkText, type ChunkOptions } from "./chunk";
export { cosineSimilarity } from "./cosine";
export {
  createWorkerEmbedder,
  type Embedder,
  type EmbedWorkerRequest,
  type EmbedWorkerResponse,
} from "./embedder";
export {
  createVectorStore,
  type ScoredRecord,
  type VectorRecord,
  type VectorStore,
} from "./vectorStore";

/** A chat message handed to the memory index for chunking + embedding. */
export interface IndexableMessage {
  readonly id: string;
  readonly thread_id: string;
  readonly profile_id: string;
  readonly content: string;
}

/** A passage retrieved by semantic search, with its provenance and relevance. */
export interface RetrievedChunk {
  readonly text: string;
  readonly message_id: string;
  readonly thread_id: string;
  readonly score: number;
}

/** The chat-memory facade the UI uses: index a message, retrieve by query. */
export interface ChatMemory {
  /** Chunk → embed → persist a message's vectors for later retrieval. */
  indexMessage(msg: IndexableMessage): Promise<void>;
  /** Embed `query`, then return the top-`k` most-similar chunks for a profile. */
  retrieve(
    query: string,
    profileId: string,
    k?: number,
  ): Promise<readonly RetrievedChunk[]>;
}

/** Injectable collaborators; `store` defaults to a fresh IndexedDB-backed store. */
export interface ChatMemoryDeps {
  readonly embedder: Embedder;
  readonly store?: VectorStore;
}

const DEFAULT_K = 5;

/** Stable per-chunk record id: a message's chunks are addressable + replaceable. */
function chunkId(messageId: string, index: number): string {
  return `${messageId}#${index}`;
}

/**
 * Wire the chunk → embed → store pipeline behind the {@link ChatMemory} facade.
 * Pass a stub {@link Embedder} (and optionally a {@link VectorStore}) in tests.
 */
export function createMemory(deps: ChatMemoryDeps): ChatMemory {
  const store = deps.store ?? createVectorStore();
  const { embedder } = deps;

  return {
    async indexMessage(msg: IndexableMessage): Promise<void> {
      const chunks = chunkText(msg.content);
      if (chunks.length === 0) {
        return;
      }
      const vectors = await embedder.embed(chunks);
      const records: VectorRecord[] = chunks.map((text, i) => ({
        id: chunkId(msg.id, i),
        profile_id: msg.profile_id,
        thread_id: msg.thread_id,
        message_id: msg.id,
        text,
        vector: vectors[i],
      }));
      await store.upsert(records);
    },

    async retrieve(
      query: string,
      profileId: string,
      k: number = DEFAULT_K,
    ): Promise<readonly RetrievedChunk[]> {
      const [queryVec] = await embedder.embed([query]);
      if (queryVec === undefined) {
        return [];
      }
      const hits = await store.search(queryVec, profileId, k);
      return hits.map((hit) => ({
        text: hit.record.text,
        message_id: hit.record.message_id,
        thread_id: hit.record.thread_id,
        score: hit.score,
      }));
    },
  };
}
