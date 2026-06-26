/**
 * App-side glue for `@almamesh/memory` — the in-browser, zero-egress semantic
 * memory (RAG) over chat history.
 *
 * Design:
 * - ONE lazily-booted memory singleton. The embedder Web Worker (and its ~25 MB
 *   self-hosted MiniLM model) is created only on the FIRST index/retrieve call,
 *   NOT at page load, so opening the dashboard stays cheap.
 * - Every entry point is BEST-EFFORT: if the embedder fails (model missing, OOM,
 *   no WebGPU/WASM), we log and degrade gracefully. Memory is an enhancement —
 *   it must NEVER block the chat from answering.
 *
 * The heavy `@huggingface/transformers` runtime lives only inside the embedder
 * worker, so importing this module does not pull the model into the main bundle.
 */

import {
  createMemory,
  createWorkerEmbedder,
  type ChatMemory,
  type IndexableMessage,
  type RetrievedChunk,
} from '@almamesh/memory';

/** The slice of `ChatMemory` the UI depends on — keeps tests honest + injectable. */
export type ChatMemoryFacade = Pick<ChatMemory, 'indexMessage' | 'retrieve'>;

/** Default top-k for the discoverable search box (a few more than RAG uses). */
const SEARCH_K = 8;

let singleton: ChatMemoryFacade | null = null;

/**
 * Resolve the process-wide memory singleton, booting the embedder worker on
 * first use. Replaceable in tests via {@link __setMemoryForTest}.
 */
function getMemory(): ChatMemoryFacade {
  if (singleton === null) {
    // Boot the shared @almamesh/memory worker embedder: it enables local,
    // same-origin model loading (`env.allowLocalModels = true`) and forces
    // single-threaded ORT for non-cross-origin-isolated hosts.
    singleton = createMemory({ embedder: createWorkerEmbedder() });
  }
  return singleton;
}

/** TEST SEAM: inject a fake facade so unit tests never boot the model worker. */
export function __setMemoryForTest(fake: ChatMemoryFacade): void {
  singleton = fake;
}

/** TEST SEAM: drop the singleton so the next call re-boots a fresh instance. */
export function __resetMemoryForTest(): void {
  singleton = null;
}

/**
 * Chunk → embed → persist one chat message for later semantic search + RAG.
 * Best-effort: blank content is skipped, and an embedder failure is logged and
 * swallowed so it can never block the conversation.
 */
export async function indexChatMessage(msg: IndexableMessage): Promise<void> {
  if (msg.content.trim().length === 0) {
    return;
  }
  try {
    await getMemory().indexMessage(msg);
  } catch (error) {
    console.warn('[chatMemory] indexMessage failed (continuing):', error);
  }
}

/**
 * Retrieve the top relevant past-conversation snippets for a RAG prompt.
 * Returns just the snippet texts (the shape `streamChartChat` expects). A blank
 * query or an embedder failure degrades to an empty array.
 */
export async function retrieveContext(
  query: string,
  profileId: string,
): Promise<readonly string[]> {
  if (query.trim().length === 0) {
    return [];
  }
  try {
    const chunks = await getMemory().retrieve(query, profileId);
    return chunks.map((c) => c.text);
  } catch (error) {
    console.warn('[chatMemory] retrieveContext failed (degrading to none):', error);
    return [];
  }
}

/**
 * Full semantic search for the discoverable search box: returns the complete
 * {@link RetrievedChunk} records (text + provenance + score) so the UI can link
 * a hit back to its message. Best-effort; degrades to `[]` on failure.
 */
export async function searchMemory(
  query: string,
  profileId: string,
  k: number = SEARCH_K,
): Promise<readonly RetrievedChunk[]> {
  if (query.trim().length === 0) {
    return [];
  }
  try {
    return await getMemory().retrieve(query, profileId, k);
  } catch (error) {
    console.warn('[chatMemory] searchMemory failed (degrading to none):', error);
    return [];
  }
}
