// The sync engine's Worker entry. It owns the durable cache (OPFS primary,
// IndexedDB fallback) and the engine; the main thread drives it over postMessage.
// One concern: route a request to the engine, reply with a typed envelope.

/// <reference lib="webworker" />

import { verifyEd25519 } from "./crypto";
import { runWithCacheLock } from "./cacheLock";
import { fetchBytes } from "./fetchBytes";
import {
	openPersistentCacheStore,
	requestPersistentStorage,
	type PersistentCacheStore,
} from "./persistentStore";
import type {
	EngineRequest,
	EngineResponse,
	ReadFileRequest,
	SyncRequest,
} from "./protocol";
import { materializeFile, syncIndex } from "./sync";
import type {
	IndexManifest,
	SyncResult,
	VersionPointer,
} from "./types";

const DECODER = new TextDecoder();

let storePromise: Promise<PersistentCacheStore> | null = null;

function store(forceIndexedDb = false): Promise<PersistentCacheStore> {
	if (storePromise === null) {
		storePromise = openPersistentCacheStore(undefined, forceIndexedDb);
	}
	return storePromise;
}

const withCacheLock = <T>(operation: () => Promise<T>): Promise<T> =>
	runWithCacheLock(navigator.locks, operation);

async function loadPubkey(pubkeyUrl: string): Promise<Uint8Array> {
	return fetchBytes(pubkeyUrl);
}

async function handleSync(req: SyncRequest): Promise<EngineResponse> {
	requestPersistentStorage(navigator.storage); // best-effort, never blocks
	const cacheStore = await store(req.forceIndexedDbCache === true);
	const pubkey = await loadPubkey(req.pubkeyUrl);
	const sync = async (prune: boolean): Promise<SyncResult> => {
		const result = await syncIndex({
			baseUrl: req.baseUrl,
			store: cacheStore,
			fetchBytes,
			verify: (message, signature) => verifyEd25519(pubkey, message, signature),
			expectedBundleId: req.expectedBundleId,
			expectedChannel: req.expectedChannel,
		});
		if (prune) await cacheStore.pruneInactive().catch(() => undefined);
		return result;
	};
	const result = await withCacheLock(() => sync(navigator.locks !== undefined));
	return {
		ok: true,
		id: req.id,
		kind: "sync",
		result,
		cacheBackend: cacheStore.cacheBackend,
	};
}

async function handleReadFileUnlocked(
	req: ReadFileRequest,
): Promise<EngineResponse> {
	const manifest = await loadActiveManifest();
	const bytes = await materializeFile(await store(), manifest, req.path);
	return { ok: true, id: req.id, kind: "readFile", bytes };
}

function handleReadFile(req: ReadFileRequest): Promise<EngineResponse> {
	return withCacheLock(() => handleReadFileUnlocked(req));
}

async function loadActiveManifest(): Promise<IndexManifest> {
	const cacheStore = await store();
	const active: VersionPointer | null = await cacheStore.readActive();
	if (active === null) {
		throw new Error("no active version — sync first");
	}
	const raw = await cacheStore.getManifest(active.manifest_hash);
	const manifest = JSON.parse(DECODER.decode(raw)) as IndexManifest;
	return manifest;
}

async function handle(req: EngineRequest): Promise<EngineResponse> {
	switch (req.kind) {
		case "sync":
			return handleSync(req);
		case "readFile":
			return handleReadFile(req);
	}
}

self.addEventListener("message", (event: MessageEvent<EngineRequest>) => {
	const req = event.data;
	handle(req)
		.then((response) => {
			self.postMessage(response);
		})
		.catch((error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			const response: EngineResponse = {
				ok: false,
				id: req.id,
				error: message,
			};
			self.postMessage(response);
		});
});
