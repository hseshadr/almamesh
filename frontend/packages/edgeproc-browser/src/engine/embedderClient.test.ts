import { describe, expect, it } from "vitest";

import { createWorkerEmbedder, type WorkerLike } from "./embedderClient";
import type { EmbedRequest, EmbedResponse } from "./embedderWorker";

class FakeWorker implements WorkerLike {
	public terminated = false;
	#error: ((event: { message?: string }) => void) | undefined;
	#messageError: (() => void) | undefined;
	public addEventListener(
		type: "message" | "error" | "messageerror",
		listener:
			| ((event: MessageEvent<EmbedResponse>) => void)
			| ((event: { message?: string }) => void)
			| (() => void),
	): void {
		if (type === "error") this.#error = listener as ((event: { message?: string }) => void);
		if (type === "messageerror") this.#messageError = listener as (() => void);
	}
	public postMessage(_message: EmbedRequest, _transfer: ReadonlyArray<Transferable>): void {}
	public terminate(): void { this.terminated = true; }
	public crash(message = "worker crashed"): void { this.#error?.({ message }); }
	public deserializeFailure(): void { this.#messageError?.(); }
}

describe("WorkerEmbedder lifecycle", () => {
	it("rejects pending calls when the worker crashes", async () => {
		const worker = new FakeWorker();
		const embedder = createWorkerEmbedder(worker, { requestTimeoutMs: 30_000 });
		const pending = embedder.embed("hello");
		worker.crash("model load failed");
		await expect(pending).rejects.toThrow("model load failed");
		expect(worker.terminated).toBe(true);
	});

	it("rejects pending calls on message deserialization failure", async () => {
		const worker = new FakeWorker();
		const embedder = createWorkerEmbedder(worker);
		const pending = embedder.embed("hello");
		worker.deserializeFailure();
		await expect(pending).rejects.toThrow("messageerror");
	});

	it("bounds a silent request and terminates the worker", async () => {
		const worker = new FakeWorker();
		const embedder = createWorkerEmbedder(worker, { requestTimeoutMs: 5 });
		const pending = embedder.embed("hello");
		await expect(pending).rejects.toThrow(/timed out/);
		expect(worker.terminated).toBe(true);
	});

	it("dispose rejects pending calls instead of leaving them hanging", async () => {
		const worker = new FakeWorker();
		const embedder = createWorkerEmbedder(worker);
		const pending = embedder.embed("hello");
		embedder.dispose?.();
		await expect(pending).rejects.toThrow("terminated");
	});
});
