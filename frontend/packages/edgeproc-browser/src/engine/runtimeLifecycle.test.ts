import { describe, expect, it } from "vitest";

import { EngineRuntime, type EnginePort, type RuntimeConfig } from "./runtime";
import type { Embedder } from "./embedder";
import type { SyncResult } from "./types";

const CONFIG: RuntimeConfig = {
	bundleBaseUrl: "/bundle",
	pubkeyUrl: "/public.key",
	expectedBundleId: "test",
	expectedChannel: "stable",
};

const RESULT: SyncResult = {
	version: "v1",
	manifestHash: "h",
	chunksFetched: 0,
	chunksReused: 0,
	bytesFetched: 0,
};

class FakeEngine implements EnginePort {
	public terminated = false;
	public syncError: Error | null = null;
	public syncStarted!: () => void;
	public async sync(): Promise<SyncResult> {
		if (this.syncError !== null) throw this.syncError;
		return new Promise<SyncResult>((resolve) => {
			this.syncStarted = () => resolve(RESULT);
		});
	}
	public async readFile(path: string): Promise<Uint8Array> {
		if (path === "ranking_config.json" || path === "cooccurrence.json") {
			throw new Error(`file ${path} not in manifest`);
		}
		return new Uint8Array([1, 2, 3]);
	}
	public terminate(): void { this.terminated = true; }
}

class FakeEmbedder implements Embedder {
	public disposed = false;
	public async embed(): Promise<Float32Array> {
		throw new Error("model failed");
	}
	public dispose(): void { this.disposed = true; }
}

describe("EngineRuntime worker lifecycle", () => {
	it("terminates a sync worker when bootstrap fails", async () => {
		const worker = new FakeEngine();
		worker.syncError = new Error("sync failed");
		const runtime = new EngineRuntime({
			spawnEngine: () => worker,
			makeEmbedder: () => new FakeEmbedder(),
		});
		await expect(runtime.bootstrap(CONFIG)).rejects.toThrow("sync failed");
		expect(worker.terminated).toBe(true);
	});

	it("terminates in-flight workers and rejects a superseded build on dispose", async () => {
		const worker = new FakeEngine();
		const runtime = new EngineRuntime({
			spawnEngine: () => worker,
			makeEmbedder: () => new FakeEmbedder(),
		});
		const pending = runtime.bootstrap(CONFIG);
		await Promise.resolve();
		runtime.dispose();
		expect(worker.terminated).toBe(true);
		worker.syncStarted();
		await expect(pending).rejects.toThrow(/superseded/);
		expect(runtime.engine()).toBeNull();
	});

	it("disposes an embedder when model warmup fails", async () => {
		const embedder = new FakeEmbedder();
		const runtime = new EngineRuntime({
			spawnEngine: () => {
				const ready = new FakeEngine();
				ready.sync = async () => RESULT;
				return ready;
			},
			makeEmbedder: () => embedder,
		});

		await expect(runtime.bootstrap(CONFIG)).rejects.toThrow("model failed");
		expect(embedder.disposed).toBe(true);
	});
});
