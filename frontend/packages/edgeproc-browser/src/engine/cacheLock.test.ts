import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";

import { runWithCacheLock, type CacheLockManager } from "./cacheLock";
import {
	catalogMetaChunkHash,
	catalogMetaChunkSize,
	chunkBytes,
} from "./fixtures";
import { IndexedDbCacheStore } from "./indexedDbStore";
import type { VersionPointer } from "./types";

class SerialLockManager implements CacheLockManager {
	#tail: Promise<unknown> = Promise.resolve();

	public request<T>(_name: string, operation: () => Promise<T>): Promise<T> {
		const result = this.#tail.then(operation);
		this.#tail = result.catch(() => undefined);
		return result;
	}
}

const pointer = (manifestHash: string, sequence: number): VersionPointer => ({
	manifest_hash: manifestHash,
	version: `v${sequence}`,
	bundle_id: "almamesh-engine",
	channel: "stable",
	sequence,
	signature: "signed",
});

describe("browser cache lock", () => {
	it("runs directly when Web Locks are unavailable", async () => {
		await expect(
			runWithCacheLock(undefined, () => Promise.resolve("direct")),
		).resolves.toBe("direct");
	});

	it("lets an old reader finish before another tab promotes and prunes", async () => {
		const database = `cache-lock-${crypto.randomUUID()}`;
		const reader = await IndexedDbCacheStore.open(database);
		const updater = await IndexedDbCacheStore.open(database);
		const locks = new SerialLockManager();
		const hash = catalogMetaChunkHash();
		const size = catalogMetaChunkSize();
		await reader.putChunkCompressed(hash, chunkBytes(hash), size);
		const oldManifest = new TextEncoder().encode(
			JSON.stringify({ files: [{ chunks: [{ hash }] }] }),
		);
		const oldHash = await reader.putManifest(oldManifest);
		await reader.promote(pointer(oldHash, 1));

		let releaseReader = (): void => undefined;
		const readerPaused = new Promise<void>((resolve) => {
			releaseReader = resolve;
		});
		let sawManifest = (): void => undefined;
		const manifestRead = new Promise<void>((resolve) => {
			sawManifest = resolve;
		});
		const read = runWithCacheLock(locks, async () => {
			await reader.getManifest(oldHash);
			sawManifest();
			await readerPaused;
			return reader.getChunk(hash, size);
		});
		await manifestRead;

		let updateFinished = false;
		const update = runWithCacheLock(locks, async () => {
			const newHash = await updater.putManifest(
				new TextEncoder().encode(JSON.stringify({ files: [] })),
			);
			await updater.promote(pointer(newHash, 2));
			await updater.pruneInactive();
			updateFinished = true;
		});
		await Promise.resolve();
		expect(updateFinished).toBe(false);

		releaseReader();
		await expect(read).resolves.toHaveLength(size);
		await update;
		expect((await updater.readActive())?.sequence).toBe(2);
		await expect(reader.getManifest(oldHash)).rejects.toThrow("missing");
	});
});
