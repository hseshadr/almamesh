/**
 * The embedding boundary. `Embedder` is the only contract the RAG pipeline
 * depends on, so tests inject a deterministic stub and never load the real
 * model. In the browser, {@link createWorkerEmbedder} runs the model OFF the UI
 * thread in {@link ./embedder.worker} and entirely on-device (zero network).
 *
 * NOTE: the heavy `@huggingface/transformers` import lives ONLY in the worker
 * module; this file references the worker by URL, so importing it in Node/tests
 * does not pull in the model runtime.
 */

/** A pluggable text → embedding function. Vectors are L2-normalized Float32. */
export interface Embedder {
  /** Embed each input string; result order matches input order. */
  embed(texts: readonly string[]): Promise<Float32Array[]>;
}

/** Request sent to the embedder worker. */
export interface EmbedWorkerRequest {
  readonly id: number;
  readonly texts: readonly string[];
}

/** Response from the embedder worker. */
export interface EmbedWorkerResponse {
  readonly id: number;
  readonly ok: boolean;
  readonly vectors?: readonly number[][];
  readonly error?: string;
}

interface Pending {
  readonly resolve: (vectors: Float32Array[]) => void;
  readonly reject: (error: Error) => void;
}

/**
 * Spin up the model worker lazily (on first `embed`) and marshal embed
 * requests/responses across the worker boundary. Vectors cross as plain number
 * arrays and are rehydrated to `Float32Array` on the main thread.
 */
export function createWorkerEmbedder(): Embedder {
  let worker: Worker | undefined;
  let nextId = 0;
  const pending = new Map<number, Pending>();

  function ensureWorker(): Worker {
    if (worker === undefined) {
      worker = new Worker(new URL("./embedder.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.addEventListener(
        "message",
        (event: MessageEvent<EmbedWorkerResponse>) => {
          const { id, ok, vectors, error } = event.data;
          const slot = pending.get(id);
          if (slot === undefined) {
            return;
          }
          pending.delete(id);
          if (ok && vectors !== undefined) {
            slot.resolve(vectors.map((v) => new Float32Array(v)));
          } else {
            slot.reject(new Error(error ?? "embedder worker failed"));
          }
        },
      );
    }
    return worker;
  }

  return {
    embed(texts: readonly string[]): Promise<Float32Array[]> {
      if (texts.length === 0) {
        return Promise.resolve([]);
      }
      const active = ensureWorker();
      const id = nextId;
      nextId += 1;
      return new Promise<Float32Array[]>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const request: EmbedWorkerRequest = { id, texts };
        active.postMessage(request);
      });
    },
  };
}
