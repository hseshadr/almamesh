/// <reference types="vite/client" />

// Thin main-thread client over the Worker engine. The main thread cannot touch
// OPFS sync access handles, so it only sends typed requests and awaits replies.
// One in-flight map keyed by request id correlates responses to promises.

import type { EngineRequest, EngineResponse } from "./protocol";
import type { SyncResult } from "./types";

// Vite folds this constant out of ordinary production bundles. The globals are
// an exit-gate seam, not a user-configurable runtime switch.
const EXIT_GATE_HOOKS =
	import.meta.env.DEV || import.meta.env.VITE_EXIT_GATE_HOOKS === "1";

interface Pending {
	readonly resolve: (response: EngineResponse) => void;
	readonly reject: (error: Error) => void;
	readonly timer: ReturnType<typeof setTimeout>;
}

/** The maximum time one Worker request may remain unresolved. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

interface WorkerLike {
	postMessage(message: EngineRequest): void;
	addEventListener(
		type: "message" | "error" | "messageerror",
		listener:
			| ((event: MessageEvent<EngineResponse>) => void)
			| ((event: { message?: string }) => void)
			| (() => void),
	): void;
	terminate(): void;
}

export interface EngineClientOptions {
	readonly requestTimeoutMs?: number;
}

export class EngineClient {
	readonly #worker: WorkerLike;
	readonly #pending = new Map<number, Pending>();
	readonly #timeoutMs: number;
	#nextId = 0;
	#closed: Error | null = null;

	public constructor(worker: WorkerLike, options: EngineClientOptions = {}) {
		this.#worker = worker;
		this.#timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
		this.#worker.addEventListener(
			"message",
			(event: MessageEvent<EngineResponse>) => {
				this.#onMessage(event.data);
			},
		);
		this.#worker.addEventListener("error", (event: { message?: string }) => {
			this.#close(new Error(`engine worker failed: ${event.message ?? "unknown error"}`));
		});
		this.#worker.addEventListener("messageerror", () => {
			this.#close(new Error("engine worker failed: messageerror"));
		});
	}

	/** Spawn the bundled engine Worker (module worker). */
	public static spawn(options?: EngineClientOptions): EngineClient {
		const worker = new Worker(new URL("./worker.ts", import.meta.url), {
			type: "module",
		});
		return new EngineClient(worker as unknown as WorkerLike, options);
	}

	/** Sync the signed bundle at `baseUrl`, pinning the raw pubkey at `pubkeyUrl`. */
	public async sync(
		baseUrl: string,
		pubkeyUrl: string,
		expectedBundleId: string,
		expectedChannel: string,
	): Promise<SyncResult> {
		const forceIndexedDbCache =
			EXIT_GATE_HOOKS &&
			(globalThis as typeof globalThis & {
				__EDGEPROC_FORCE_INDEXEDDB_CACHE__?: boolean;
			}).__EDGEPROC_FORCE_INDEXEDDB_CACHE__ === true;
		const response = await this.#send({
			kind: "sync",
			id: this.#allocId(),
			baseUrl,
			pubkeyUrl,
			expectedBundleId,
			expectedChannel,
			forceIndexedDbCache,
		});
		if (response.ok && response.kind === "sync") {
			if (EXIT_GATE_HOOKS && forceIndexedDbCache) {
				(globalThis as typeof globalThis & {
					__EDGEPROC_SELECTED_CACHE__?: string;
				}).__EDGEPROC_SELECTED_CACHE__ = response.cacheBackend;
			}
			return response.result;
		}
		throw new Error(this.#errorOf(response));
	}

	/** Materialize a synced file's bytes from the active manifest. */
	public async readFile(path: string): Promise<Uint8Array> {
		const response = await this.#send({
			kind: "readFile",
			id: this.#allocId(),
			path,
		});
		if (response.ok && response.kind === "readFile") {
			return response.bytes;
		}
		throw new Error(this.#errorOf(response));
	}

	public terminate(): void {
		this.#close(new Error("engine worker terminated"));
	}

	#allocId(): number {
		this.#nextId += 1;
		return this.#nextId;
	}

	#errorOf(response: EngineResponse): string {
		return response.ok ? "unexpected response kind" : response.error;
	}

	#send(request: EngineRequest): Promise<EngineResponse> {
		if (this.#closed !== null) {
			return Promise.reject(this.#closed);
		}
		return new Promise<EngineResponse>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.#close(
					new Error(
						`engine request ${request.id} (${request.kind}) timed out after ${this.#timeoutMs}ms`,
					),
				);
			}, this.#timeoutMs);
			this.#pending.set(request.id, { resolve, reject, timer });
			try {
				this.#worker.postMessage(request);
			} catch (error) {
				this.#pending.delete(request.id);
				clearTimeout(timer);
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}

	#onMessage(response: EngineResponse): void {
		const pending = this.#pending.get(response.id);
		if (pending === undefined) {
			return;
		}
		this.#pending.delete(response.id);
		clearTimeout(pending.timer);
		pending.resolve(response);
	}

	#close(error: Error): void {
		if (this.#closed !== null) {
			return;
		}
		this.#closed = error;
		for (const pending of this.#pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.#pending.clear();
		this.#worker.terminate();
	}
}
