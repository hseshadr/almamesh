// Main-thread client that drives the embedder Worker. Presents the same Embedder
// interface as the in-process embedder so the search engine is agnostic to where
// the model runs; the Worker keeps model load + inference off the UI thread.

import type { Embedder } from "./embedder";
import type { EmbedRequest, EmbedResponse } from "./embedderWorker";

/** A minimal Worker surface — what this client needs, so it is easy to fake. */
export interface WorkerLike {
	postMessage(
		message: EmbedRequest,
		transfer: ReadonlyArray<Transferable>,
	): void;
	addEventListener(
		type: "message" | "error" | "messageerror",
		listener:
			| ((event: MessageEvent<EmbedResponse>) => void)
			| ((event: { message?: string }) => void)
			| (() => void),
	): void;
	terminate(): void;
}

export interface WorkerEmbedderOptions {
	readonly requestTimeoutMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

/** Spawns the embedder Worker as an ES module. */
export function spawnEmbedderWorker(): Worker {
	return new Worker(new URL("./embedderWorker.ts", import.meta.url), {
		type: "module",
	});
}

class WorkerEmbedder implements Embedder {
	readonly #worker: WorkerLike;
	readonly #pending = new Map<
		number,
		{
			resolve: (v: Float32Array) => void;
			reject: (e: Error) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();
	readonly #timeoutMs: number;
	#nextId = 0;
	#closed: Error | null = null;

	public constructor(worker: WorkerLike, options: WorkerEmbedderOptions = {}) {
		this.#worker = worker;
		this.#timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
		this.#worker.addEventListener("message", (event: MessageEvent<EmbedResponse>) => {
			this.#settle(event.data);
		});
		this.#worker.addEventListener("error", (event: { message?: string }) => {
			this.#close(new Error(`embedder worker failed: ${event.message ?? "unknown error"}`));
		});
		this.#worker.addEventListener("messageerror", () => {
			this.#close(new Error("embedder worker failed: messageerror"));
		});
	}

	#settle(response: EmbedResponse): void {
		const entry = this.#pending.get(response.id);
		if (entry === undefined) {
			return;
		}
		this.#pending.delete(response.id);
		clearTimeout(entry.timer);
		if (response.ok) {
			entry.resolve(response.vector);
		} else {
			entry.reject(new Error(response.error));
		}
	}

	public embed(text: string): Promise<Float32Array> {
		if (this.#closed !== null) {
			return Promise.reject(this.#closed);
		}
		const id = this.#nextId;
		this.#nextId += 1;
		return new Promise<Float32Array>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.#close(
					new Error(`embed request ${id} timed out after ${this.#timeoutMs}ms`),
				);
			}, this.#timeoutMs);
			this.#pending.set(id, { resolve, reject, timer });
			try {
				this.#worker.postMessage({ id, text }, []);
			} catch (error) {
				this.#pending.delete(id);
				clearTimeout(timer);
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}

	public dispose(): void {
		this.#close(new Error("embedder worker terminated"));
	}

	#close(error: Error): void {
		if (this.#closed !== null) {
			return;
		}
		this.#closed = error;
		for (const entry of this.#pending.values()) {
			clearTimeout(entry.timer);
			entry.reject(error);
		}
		this.#pending.clear();
		this.#worker.terminate();
	}
}

/** Wrap a Worker (or Worker-like) as an Embedder. */
export function createWorkerEmbedder(
	worker: WorkerLike,
	options?: WorkerEmbedderOptions,
): Embedder {
	return new WorkerEmbedder(worker, options);
}
