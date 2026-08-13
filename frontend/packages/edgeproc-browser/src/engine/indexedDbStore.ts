// Durable CacheStore fallback for browsers where OPFS cannot open. One
// namespaced idb-keyval store keeps chunk/manifest writes and active-pointer
// promotion small, serialized, and independent of application data.

import {
	createStore,
	del,
	delMany,
	get,
	keys,
	promisifyRequest,
	set,
	update,
	type UseStore,
} from "idb-keyval";
import { parseStoredPointer } from "./activePointer";
import { sha256Hex } from "./crypto";
import { decompressAndVerify, IntegrityError } from "./integrity";
import { canPromotePointer } from "./opfsStore";
import type { CacheStore, VersionPointer } from "./types";

const DEFAULT_DATABASE = "edgeproc-browser-cache";
const STORE = "content-addressed-cache";
const ACTIVE = "active";
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_COMPRESSED_CHUNK_BYTES = 2 * 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/u;

const chunkKey = (hash: string): string => `chunk:${hash}`;
const manifestKey = (hash: string): string => `manifest:${hash}`;

function binaryValue(
	value: unknown,
	label: string,
	maximumBytes: number,
): Uint8Array {
	if (ArrayBuffer.isView(value) && value.byteLength <= maximumBytes) {
		return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
	}
	if (
		Object.prototype.toString.call(value) === "[object ArrayBuffer]" &&
		(value as ArrayBuffer).byteLength <= maximumBytes
	) {
		return new Uint8Array(value as ArrayBuffer).slice();
	}
	throw new IntegrityError(`${label} is missing, invalid, or over its read cap`);
}

export class IndexedDbCacheStore implements CacheStore {
	public readonly cacheBackend = "indexeddb" as const;
	readonly #store: UseStore;

	private constructor(store: UseStore) {
		this.#store = store;
	}

	public static async open(
		name = DEFAULT_DATABASE,
	): Promise<IndexedDbCacheStore> {
		const store = createStore(name, STORE);
		await get(ACTIVE, store); // open now so selection can report a real failure
		return new IndexedDbCacheStore(store);
	}

	public async hasChunk(chunkHash: string): Promise<boolean> {
		return this.#store("readonly", async (store) =>
			(await promisifyRequest(store.count(chunkKey(chunkHash)))) > 0,
		);
	}

	public async putChunkCompressed(
		chunkHash: string,
		compressed: Uint8Array,
		expectedSize: number,
	): Promise<void> {
		if (compressed.byteLength > MAX_COMPRESSED_CHUNK_BYTES) {
			throw new IntegrityError(
				"compressed chunk exceeds the IndexedDB read cap",
			);
		}
		await decompressAndVerify(chunkHash, compressed, expectedSize);
		await set(chunkKey(chunkHash), compressed.slice(), this.#store);
	}

	public async getChunk(
		chunkHash: string,
		expectedSize: number,
	): Promise<Uint8Array> {
		const key = chunkKey(chunkHash);
		try {
			const compressed = binaryValue(
				await get(key, this.#store),
				`chunk ${chunkHash}`,
				MAX_COMPRESSED_CHUNK_BYTES,
			);
			return await decompressAndVerify(chunkHash, compressed, expectedSize);
		} catch (error) {
			if (error instanceof IntegrityError) await del(key, this.#store);
			throw error;
		}
	}

	public async putManifest(manifestBytes: Uint8Array): Promise<string> {
		if (manifestBytes.byteLength > MAX_MANIFEST_BYTES) {
			throw new IntegrityError("manifest exceeds the IndexedDB read cap");
		}
		const hash = await sha256Hex(manifestBytes);
		await set(manifestKey(hash), manifestBytes.slice(), this.#store);
		return hash;
	}

	public async getManifest(manifestHash: string): Promise<Uint8Array> {
		const key = manifestKey(manifestHash);
		try {
			const raw = binaryValue(
				await get(key, this.#store),
				`manifest ${manifestHash}`,
				MAX_MANIFEST_BYTES,
			);
			if ((await sha256Hex(raw)) !== manifestHash) {
				throw new IntegrityError(
					`manifest ${manifestHash} failed content-address check`,
				);
			}
			return raw;
		} catch (error) {
			if (error instanceof IntegrityError) await del(key, this.#store);
			throw error;
		}
	}

	public async readActive(): Promise<VersionPointer | null> {
		return parseStoredPointer(await get(ACTIVE, this.#store));
	}

	public async promote(pointer: VersionPointer): Promise<void> {
		await update(
			ACTIVE,
			(value: unknown) => {
				if (!canPromotePointer(parseStoredPointer(value), pointer)) {
					throw new Error(
						`refusing to promote sequence ${pointer.sequence} over durable pointer`,
					);
				}
				return pointer;
			},
			this.#store,
		);
	}

	public clearActiveIf(expected: VersionPointer): Promise<boolean> {
		return this.#store("readwrite", async (store) => {
			const current = parseStoredPointer(
				await promisifyRequest(store.get(ACTIVE)),
			);
			if (!samePointer(current, expected)) return false;
			await promisifyRequest(store.delete(ACTIVE));
			return true;
		});
	}

	public pruneInactive(): Promise<void> {
		return this.pruneToActive();
	}

	private async pruneToActive(): Promise<void> {
		const pointer = parseStoredPointer(await get(ACTIVE, this.#store));
		if (pointer === null) return;
		let manifest: unknown;
		try {
			manifest = JSON.parse(
				new TextDecoder().decode(await this.getManifest(pointer.manifest_hash)),
			) as unknown;
		} catch {
			return;
		}
		const keep = activeKeys(pointer, manifest);
		if (keep === null) return;
		const stale = (await keys<IDBValidKey>(this.#store)).filter(
			(key) => typeof key === "string" && !keep.has(key),
		);
		if (stale.length > 0) await delMany(stale, this.#store);
	}
}

function activeKeys(
	pointer: VersionPointer,
	manifest: unknown,
): ReadonlySet<string> | null {
	if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
		return null;
	}
	const files = (manifest as { files?: unknown }).files;
	if (!Array.isArray(files)) return null;
	const keep = new Set([ACTIVE, manifestKey(pointer.manifest_hash)]);
	for (const file of files) {
		if (typeof file !== "object" || file === null || Array.isArray(file)) return null;
		const chunks = (file as { chunks?: unknown }).chunks;
		if (!Array.isArray(chunks)) return null;
		for (const chunk of chunks) {
			if (typeof chunk !== "object" || chunk === null || Array.isArray(chunk)) {
				return null;
			}
			const hash = (chunk as { hash?: unknown }).hash;
			if (typeof hash !== "string" || !SHA256.test(hash)) return null;
			keep.add(chunkKey(hash));
		}
	}
	return keep;
}

function samePointer(
	left: VersionPointer | null,
	right: VersionPointer,
): boolean {
	return left !== null && JSON.stringify(left) === JSON.stringify(right);
}
