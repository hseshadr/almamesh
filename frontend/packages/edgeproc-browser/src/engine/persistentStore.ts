// Prefer OPFS for efficient worker-side file access. WebKit can expose OPFS
// yet throw a transient UnknownError from getDirectory(); IndexedDB is the
// durable browser-standard fallback, not an ephemeral in-memory downgrade.

import { IndexedDbCacheStore } from "./indexedDbStore";
import {
	canPromotePointer,
	OpfsCacheStore,
	selectHighestPointer,
} from "./opfsStore";
import { IntegrityError } from "./integrity";
import type { CacheStore, VersionPointer } from "./types";

export interface PersistentStoreOpeners {
	readonly openOpfs: () => Promise<CacheStore>;
	readonly openIndexedDb: () => Promise<PersistentCacheStore>;
}

export interface PersistentCacheStore extends CacheStore {
	/** Actual durable storage selected by the worker, for typed diagnostics. */
	readonly cacheBackend: "indexeddb" | "opfs+indexeddb";
}

const defaultOpeners: PersistentStoreOpeners = {
	openOpfs: () => OpfsCacheStore.open(),
	openIndexedDb: () => IndexedDbCacheStore.open(),
};

export function requestPersistentStorage(
	storage: Pick<StorageManager, "persist"> | undefined,
): void {
	void storage?.persist?.().catch(() => false);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function coordinatedActive(
	primary: VersionPointer | null,
	floor: VersionPointer | null,
): VersionPointer | null {
	if (
		primary !== null &&
		floor !== null &&
		primary.sequence === floor.sequence &&
		!canPromotePointer(primary, floor)
	) {
		throw new IntegrityError("persistent cache rollback floors disagree");
	}
	return selectHighestPointer([primary, floor]);
}

class CoordinatedCacheStore implements PersistentCacheStore {
	public readonly cacheBackend = "opfs+indexeddb" as const;
	private readonly primary: CacheStore;
	private readonly floor: CacheStore;

	public constructor(
		primary: CacheStore,
		floor: CacheStore,
	) {
		this.primary = primary;
		this.floor = floor;
	}

	public hasChunk(hash: string): Promise<boolean> {
		return Promise.all([
			this.primary.hasChunk(hash),
			this.floor.hasChunk(hash),
		]).then(([primary, floor]) => primary && floor);
	}

	public async putChunkCompressed(
		hash: string,
		compressed: Uint8Array,
		expectedSize: number,
	): Promise<void> {
		await this.mirror((store) =>
			store.putChunkCompressed(hash, compressed, expectedSize),
		);
	}

	public async getChunk(hash: string, expectedSize: number): Promise<Uint8Array> {
		try {
			return await this.primary.getChunk(hash, expectedSize);
		} catch {
			return this.floor.getChunk(hash, expectedSize);
		}
	}

	public async putManifest(bytes: Uint8Array): Promise<string> {
		const [floorHash, primaryHash] = await this.mirror((store) =>
			store.putManifest(bytes),
		);
		if (floorHash !== primaryHash) {
			throw new IntegrityError("persistent cache manifest hashes disagree");
		}
		return primaryHash;
	}

	public async getManifest(hash: string): Promise<Uint8Array> {
		try {
			return await this.primary.getManifest(hash);
		} catch {
			return this.floor.getManifest(hash);
		}
	}

	public async readActive(): Promise<VersionPointer | null> {
		const [primary, floor] = await Promise.all([
			this.primary.readActive(),
			this.floor.readActive(),
		]);
		return coordinatedActive(primary, floor);
	}

	public async promote(pointer: VersionPointer): Promise<void> {
		await this.floor.promote(pointer);
		await this.primary.promote(pointer);
	}

	public async clearActiveIf(expected: VersionPointer): Promise<boolean> {
		const [floor, primary] = await Promise.all([
			this.floor.clearActiveIf(expected),
			this.primary.clearActiveIf(expected),
		]);
		return floor || primary;
	}

	public pruneInactive(): Promise<void> {
		return this.floor.pruneInactive();
	}

	private async mirror<T>(operation: (store: CacheStore) => Promise<T>): Promise<[T, T]> {
		const floor = await operation(this.floor);
		const primary = await operation(this.primary);
		return [floor, primary];
	}
}

export async function openPersistentCacheStore(
	openers: PersistentStoreOpeners = defaultOpeners,
	forceIndexedDb = false,
): Promise<PersistentCacheStore> {
	let indexedDb: PersistentCacheStore;
	try {
		indexedDb = await openers.openIndexedDb();
	} catch (indexedDbError) {
		throw new Error(
			`persistent rollback floor unavailable (IndexedDB: ${errorMessage(indexedDbError)})`,
			{ cause: indexedDbError },
		);
	}
	if (forceIndexedDb) return indexedDb;
	try {
		return new CoordinatedCacheStore(await openers.openOpfs(), indexedDb);
	} catch {
		return indexedDb;
	}
}
