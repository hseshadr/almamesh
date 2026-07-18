import { describe, expect, it } from "vitest";

import { EngineClient } from "./client";
import type { EngineRequest, EngineResponse } from "./protocol";

class FakeWorker {
	public terminated = false;
	#error: ((event: { message?: string }) => void) | undefined;
	#messageError: (() => void) | undefined;

	public addEventListener(
		type: "message" | "error" | "messageerror",
		listener:
			| ((event: MessageEvent<EngineResponse>) => void)
			| ((event: { message?: string }) => void)
			| (() => void),
	): void {
		if (type === "message") return;
		else if (type === "error") this.#error = listener as ((event: { message?: string }) => void);
		else this.#messageError = listener as (() => void);
	}

	public postMessage(_request: EngineRequest): void {}
	public terminate(): void { this.terminated = true; }
	public crash(message = "worker crashed"): void { this.#error?.({ message }); }
	public deserializeFailure(): void { this.#messageError?.(); }
}

describe("EngineClient worker lifecycle", () => {
	it("rejects all pending calls when the worker crashes", async () => {
		const worker = new FakeWorker();
		const client = new EngineClient(worker);
		const first = client.readFile("a");
		const second = client.sync("/bundle", "/key", "id", "stable");
		worker.crash("fatal boot");
		await expect(first).rejects.toThrow("fatal boot");
		await expect(second).rejects.toThrow("fatal boot");
		expect(worker.terminated).toBe(true);
	});

	it("rejects pending calls on message deserialization failure", async () => {
		const worker = new FakeWorker();
		const client = new EngineClient(worker);
		const pending = client.readFile("a");
		worker.deserializeFailure();
		await expect(pending).rejects.toThrow("messageerror");
	});

	it("bounds a silent request and terminates the worker", async () => {
		const worker = new FakeWorker();
		const client = new EngineClient(worker, { requestTimeoutMs: 5 });
		const pending = client.readFile("a");
		await expect(pending).rejects.toThrow(/timed out/);
		expect(worker.terminated).toBe(true);
	});

	it("terminate rejects pending calls instead of leaving them hanging", async () => {
		const worker = new FakeWorker();
		const client = new EngineClient(worker);
		const pending = client.sync("/bundle", "/key", "id", "stable");
		client.terminate();
		await expect(pending).rejects.toThrow("terminated");
	});
});
