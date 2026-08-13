import "fake-indexeddb/auto";
import { createStore, del, get, keys, set } from "idb-keyval";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sha256Hex } from "./crypto";
import {
	catalogMetaChunkHash,
	catalogMetaChunkSize,
	chunkBytes,
} from "./fixtures";
import { IndexedDbCacheStore } from "./indexedDbStore";
import {
	openPersistentCacheStore,
	requestPersistentStorage,
} from "./persistentStore";
import type { CacheStore, VersionPointer } from "./types";

let database: string;
let databaseSequence = 0;

const pointer = (manifestHash: string, sequence: number): VersionPointer => ({
	manifest_hash: manifestHash,
	version: `v${sequence}`,
	bundle_id: "almamesh-engine",
	channel: "stable",
	sequence,
	signature: "signed",
});

beforeEach(() => {
	vi.restoreAllMocks();
	databaseSequence += 1;
	database = `edgeproc-persistent-store-test-${databaseSequence}`;
});

describe("persistent browser cache selection", () => {
	it("does not fail boot when the StorageManager API is absent", () => {
		expect(() => requestPersistentStorage(undefined)).not.toThrow();
	});

	it("keeps persistence requests best-effort", async () => {
		const persist = vi.fn(() => Promise.reject(new Error("denied")));
		requestPersistentStorage({ persist });
		await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce());
	});

	it("uses the durable fallback with the default browser openers", async () => {
		await expect(openPersistentCacheStore()).resolves.toMatchObject({
			cacheBackend: "indexeddb",
		});
	});

	it("falls back from WebKit OPFS UnknownError to durable IndexedDB", async () => {
		const openOpfs = vi.fn<() => Promise<CacheStore>>().mockRejectedValue(
			new DOMException(
				"The operation failed for an unknown transient reason (e.g. out of memory).",
				"UnknownError",
			),
		);
		const openIndexedDb = vi.fn(() => IndexedDbCacheStore.open(database));

		const first = (await openPersistentCacheStore({
			openOpfs,
			openIndexedDb,
		})) as IndexedDbCacheStore;
		const hash = catalogMetaChunkHash();
		const size = catalogMetaChunkSize();
		await first.putChunkCompressed(hash, chunkBytes(hash), size);
		const manifestHash = await first.putManifest(
			new TextEncoder().encode('{"schema_version":2}'),
		);
		await first.promote(pointer(manifestHash, 7));
		const reopened = await IndexedDbCacheStore.open(database);
		expect(await reopened.getChunk(hash, size)).toHaveLength(size);
		expect(await reopened.readActive()).toEqual(pointer(manifestHash, 7));
		expect(openOpfs).toHaveBeenCalledOnce();
		expect(openIndexedDb).toHaveBeenCalledOnce();
	});

	it("does not replace a healthy OPFS store", async () => {
		const healthy = await IndexedDbCacheStore.open(`${database}-opfs`);
		const floor = await IndexedDbCacheStore.open(database);
		const openOpfs = vi.fn(() => Promise.resolve(healthy));
		const openIndexedDb = vi.fn(() => Promise.resolve(floor));

		const coordinated = await openPersistentCacheStore({
			openOpfs,
			openIndexedDb,
		});
		await coordinated.promote(pointer("a".repeat(64), 10));
		expect((await floor.readActive())?.sequence).toBe(10);
		expect(openIndexedDb).toHaveBeenCalledOnce();
	});

	it("reports the actual IndexedDB selection when the exit gate forces it", async () => {
		const floor = await IndexedDbCacheStore.open(database);
		const openOpfs = vi.fn(() =>
			IndexedDbCacheStore.open(`${database}-unused-opfs`),
		);
		const selected = await openPersistentCacheStore(
			{
				openOpfs,
				openIndexedDb: () => Promise.resolve(floor),
			},
			true,
		);

		expect(selected.cacheBackend).toBe("indexeddb");
		expect(openOpfs).not.toHaveBeenCalled();
	});

	it.each([new Error("blocked"), "blocked"])(
		"reports an unavailable rollback floor (%s)",
		async (failure) => {
			await expect(
				openPersistentCacheStore({
					openOpfs: () => Promise.reject(new Error("unused")),
					openIndexedDb: () => Promise.reject(failure),
				}),
			).rejects.toThrow("persistent rollback floor unavailable");
		},
	);

	it("rejects equal-sequence forks across persistent backends", async () => {
		const primary = await IndexedDbCacheStore.open(`${database}-opfs`);
		const floor = await IndexedDbCacheStore.open(database);
		await primary.promote(pointer("a".repeat(64), 10));
		await floor.promote(pointer("b".repeat(64), 10));
		const coordinated = await openPersistentCacheStore({
			openOpfs: () => Promise.resolve(primary),
			openIndexedDb: () => Promise.resolve(floor),
		});

		await expect(coordinated.readActive()).rejects.toThrow(
			"rollback floors disagree",
		);
	});

	it("coordinates existence, clearing, and pruning across both backends", async () => {
		const primary = await IndexedDbCacheStore.open(`${database}-opfs`);
		const floor = await IndexedDbCacheStore.open(database);
		const coordinated = await openPersistentCacheStore({
			openOpfs: () => Promise.resolve(primary),
			openIndexedDb: () => Promise.resolve(floor),
		});
		const hash = catalogMetaChunkHash();
		const size = catalogMetaChunkSize();
		await coordinated.putChunkCompressed(hash, chunkBytes(hash), size);
		expect(await coordinated.hasChunk(hash)).toBe(true);
		await del(
			`chunk:${hash}`,
			createStore(database, "content-addressed-cache"),
		);
		expect(await coordinated.hasChunk(hash)).toBe(false);

		const staleHash = await floor.putManifest(new TextEncoder().encode("stale"));
		const activeHash = await coordinated.putManifest(
			new TextEncoder().encode('{"files":[]}'),
		);
		const active = pointer(activeHash, 12);
		await coordinated.promote(active);
		await coordinated.pruneInactive();
		await expect(floor.getManifest(staleHash)).rejects.toThrow("missing");
		expect(await coordinated.clearActiveIf(active)).toBe(true);
		expect(await coordinated.clearActiveIf(active)).toBe(false);
	});

	it("fails closed if mirrored manifest hashes disagree", async () => {
		const primary = await IndexedDbCacheStore.open(`${database}-opfs`);
		const floor = await IndexedDbCacheStore.open(database);
		primary.putManifest = () => Promise.resolve("f".repeat(64));
		const coordinated = await openPersistentCacheStore({
			openOpfs: () => Promise.resolve(primary),
			openIndexedDb: () => Promise.resolve(floor),
		});

		await expect(
			coordinated.putManifest(new TextEncoder().encode("manifest")),
		).rejects.toThrow("manifest hashes disagree");
	});

	it("preserves the rollback floor when a later boot falls back from OPFS", async () => {
		const primary = await IndexedDbCacheStore.open(`${database}-opfs`);
		const fallback = await IndexedDbCacheStore.open(database);
		const first = await openPersistentCacheStore({
			openOpfs: () => Promise.resolve(primary),
			openIndexedDb: () => Promise.resolve(fallback),
		});
		const hash = catalogMetaChunkHash();
		const size = catalogMetaChunkSize();
		await first.putChunkCompressed(hash, chunkBytes(hash), size);
		const manifestHash = await first.putManifest(
			new TextEncoder().encode("transition manifest"),
		);
		await first.promote(pointer(manifestHash, 100));

		const second = await openPersistentCacheStore({
			openOpfs: () => Promise.reject(new DOMException("transient", "UnknownError")),
			openIndexedDb: () => IndexedDbCacheStore.open(database),
		});
		await expect(second.promote(pointer("b".repeat(64), 90))).rejects.toThrow(
			"refusing to promote sequence 90",
		);
		expect(Array.from(await second.getManifest(manifestHash))).toEqual(
			Array.from(new TextEncoder().encode("transition manifest")),
		);
		expect(await second.getChunk(hash, size)).toHaveLength(size);
	});

	it("serves the complete fallback dataset when OPFS later recovers empty", async () => {
		const fallback = await IndexedDbCacheStore.open(database);
		const hash = catalogMetaChunkHash();
		const size = catalogMetaChunkSize();
		await fallback.putChunkCompressed(hash, chunkBytes(hash), size);
		const manifest = new TextEncoder().encode("fallback manifest");
		const manifestHash = await fallback.putManifest(manifest);
		await fallback.promote(pointer(manifestHash, 101));

		const recovered = await openPersistentCacheStore({
			openOpfs: () => IndexedDbCacheStore.open(`${database}-fresh-opfs`),
			openIndexedDb: () => IndexedDbCacheStore.open(database),
		});
		expect(await recovered.readActive()).toEqual(pointer(manifestHash, 101));
		expect(Array.from(await recovered.getManifest(manifestHash))).toEqual(
			Array.from(manifest),
		);
		expect(await recovered.getChunk(hash, size)).toHaveLength(size);
	});
});

describe("IndexedDB promotion", () => {
	it("checks chunk existence without materializing its bytes", async () => {
		const cache = await IndexedDbCacheStore.open(database);
		const getSpy = vi.spyOn(IDBObjectStore.prototype, "get");
		const countSpy = vi.spyOn(IDBObjectStore.prototype, "count");
		const hash = catalogMetaChunkHash();
		expect(await cache.hasChunk(hash)).toBe(false);
		await cache.putChunkCompressed(
			hash,
			chunkBytes(hash),
			catalogMetaChunkSize(),
		);
		expect(await cache.hasChunk(hash)).toBe(true);
		expect(countSpy).toHaveBeenCalledTimes(2);
		expect(getSpy).not.toHaveBeenCalled();
	});

	it("enforces object caps before storing content", async () => {
		const cache = await IndexedDbCacheStore.open(database);
		await expect(
			cache.putChunkCompressed(
				"a".repeat(64),
				new Uint8Array(2 * 1024 * 1024 + 1),
				1,
			),
		).rejects.toThrow("compressed chunk exceeds");
		await expect(
			cache.putManifest(new Uint8Array(1024 * 1024 + 1)),
		).rejects.toThrow("manifest exceeds");
	});

	it("accepts ArrayBuffer values and evicts corrupt content", async () => {
		const cache = await IndexedDbCacheStore.open(database);
		const store = createStore(database, "content-addressed-cache");
		const hash = catalogMetaChunkHash();
		const compressed = chunkBytes(hash);
		await set(`chunk:${hash}`, compressed.slice().buffer, store);
		await expect(
			cache.getChunk(hash, catalogMetaChunkSize()),
		).resolves.toHaveLength(catalogMetaChunkSize());
		const manifestHash = await sha256Hex(new TextEncoder().encode("expected"));
		await set(
			`manifest:${manifestHash}`,
			new TextEncoder().encode("corrupt"),
			store,
		);
		await expect(cache.getManifest(manifestHash)).rejects.toThrow(
			"content-address check",
		);
		expect(await get(`manifest:${manifestHash}`, store)).toBeUndefined();
		await expect(cache.getChunk("f".repeat(64), 1)).rejects.toThrow("missing");
	});

	it("conditionally clears only the exact active pointer", async () => {
		const cache = await IndexedDbCacheStore.open(database);
		const active = pointer("a".repeat(64), 3);
		await cache.promote(active);
		expect(await cache.clearActiveIf(pointer("b".repeat(64), 3))).toBe(false);
		expect(await cache.clearActiveIf(active)).toBe(true);
		expect(await cache.readActive()).toBeNull();
	});

	it("treats pruning without an active release as a no-op", async () => {
		const cache = await IndexedDbCacheStore.open(database);
		await expect(cache.pruneInactive()).resolves.toBeUndefined();
	});

	it.each([
		null,
		[],
		{},
		{ files: "invalid" },
		{ files: [null] },
		{ files: [{ chunks: "invalid" }] },
		{ files: [{ chunks: [null] }] },
		{ files: [{ chunks: [{ hash: "invalid" }] }] },
	])("does not prune from a malformed active manifest %#", async (manifest) => {
		const cache = await IndexedDbCacheStore.open(database);
		const sentinel = new TextEncoder().encode("keep sentinel");
		const sentinelHash = await cache.putManifest(sentinel);
		const manifestHash = await cache.putManifest(
			new TextEncoder().encode(JSON.stringify(manifest)),
		);
		const active = pointer(manifestHash, 1);
		await cache.promote(active);
		await expect(cache.pruneInactive()).resolves.toBeUndefined();
		expect(Array.from(await cache.getManifest(sentinelHash))).toEqual(
			Array.from(sentinel),
		);
		expect(Array.from(await cache.getManifest(manifestHash))).toEqual(
			Array.from(new TextEncoder().encode(JSON.stringify(manifest))),
		);
		expect(await cache.readActive()).toEqual(active);
	});

	it("does not prune when the active manifest is not JSON", async () => {
		const cache = await IndexedDbCacheStore.open(database);
		const sentinel = new TextEncoder().encode("keep sentinel");
		const sentinelHash = await cache.putManifest(sentinel);
		const manifestHash = await cache.putManifest(new TextEncoder().encode("nope"));
		const active = pointer(manifestHash, 1);
		await cache.promote(active);
		await expect(cache.pruneInactive()).resolves.toBeUndefined();
		expect(Array.from(await cache.getManifest(sentinelHash))).toEqual(
			Array.from(sentinel),
		);
		expect(Array.from(await cache.getManifest(manifestHash))).toEqual(
			Array.from(new TextEncoder().encode("nope")),
		);
		expect(await cache.readActive()).toEqual(active);
	});
	it("prunes manifests unreachable from the promoted release", async () => {
		const cache = await IndexedDbCacheStore.open(database);
		const oldHash = await cache.putManifest(
			new TextEncoder().encode('{"files":[],"release":"old"}'),
		);
		const activeHash = await cache.putManifest(
			new TextEncoder().encode('{"files":[],"release":"active"}'),
		);
		await cache.promote(pointer(activeHash, 2));
		await cache.pruneInactive();
		const stored = await keys<string>(
			createStore(database, "content-addressed-cache"),
		);

		expect(stored).toContain(`manifest:${activeHash}`);
		expect(stored).not.toContain(`manifest:${oldHash}`);
	});

	it("heals a malformed active pointer instead of bricking every future sync", async () => {
		await set(
			"active",
			{ sequence: "not-a-number" },
			createStore(database, "content-addressed-cache"),
		);
		const cache = await IndexedDbCacheStore.open(database);
		expect(await cache.readActive()).toBeNull();
		await expect(cache.promote(pointer("a".repeat(64), 1))).resolves.toBeUndefined();
	});

	it("atomically rejects rollback after reopening", async () => {
		const first = await IndexedDbCacheStore.open(database);
		const manifest = new TextEncoder().encode("manifest");
		const manifestHash = await first.putManifest(manifest);
		await first.promote(pointer(manifestHash, 9));
		const reopened = await IndexedDbCacheStore.open(database);
		await expect(reopened.promote(pointer(manifestHash, 8))).rejects.toThrow(
			"refusing to promote sequence 8",
		);
		expect(await reopened.readActive()).toEqual(pointer(manifestHash, 9));
	});

	it("serializes racing promotions without lowering the durable floor", async () => {
		const first = await IndexedDbCacheStore.open(database);
		const second = await IndexedDbCacheStore.open(database);
		const manifestHash = await first.putManifest(
			new TextEncoder().encode("racing manifest"),
		);

		await Promise.allSettled([
			first.promote(pointer(manifestHash, 10)),
			second.promote(pointer(manifestHash, 11)),
		]);

		expect((await first.readActive())?.sequence).toBe(11);
	});
});
