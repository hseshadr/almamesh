import { Zstd } from "@hpcc-js/wasm-zstd";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./crypto";
import { NetworkError } from "./fetchBytes";
import { IntegrityError } from "./integrity";
import { MemoryCacheStore } from "./memoryStore";
import { materializeFile, RollbackError, syncIndex } from "./sync";
import type {
	FetchBytes,
	IndexManifest,
	Verify,
	VersionPointer,
} from "./types";

const ENCODER = new TextEncoder();
const passVerify: Verify = () => Promise.resolve();
const EMPTY_HASH =
	"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

interface SyntheticOrigin {
	readonly fetchBytes: FetchBytes;
	readonly pointer: VersionPointer;
	readonly requestCount: () => number;
}

async function originFor(
	manifest: IndexManifest,
	chunks: ReadonlyMap<string, Uint8Array> = new Map(),
	sequence = 1,
): Promise<SyntheticOrigin> {
	const manifestBytes = ENCODER.encode(JSON.stringify(manifest));
	const manifestHash = await sha256Hex(manifestBytes);
	const pointer: VersionPointer = {
		manifest_hash: manifestHash,
		version: manifest.version,
		bundle_id: manifest.bundle_id,
		channel: "stable",
		sequence,
		signature: "test-signature",
	};
	let requests = 0;
	const fetchBytes: FetchBytes = (url) => {
		requests += 1;
		if (url.endsWith("/latest")) {
			return Promise.resolve(ENCODER.encode(JSON.stringify(pointer)));
		}
		if (url.endsWith(`/manifest/${manifestHash}`)) {
			return Promise.resolve(manifestBytes);
		}
		const hash = url.split("/").at(-1);
		const compressed = hash === undefined ? undefined : chunks.get(hash);
		return compressed === undefined
			? Promise.reject(new Error(`unexpected ${url}`))
			: Promise.resolve(compressed);
	};
	return { fetchBytes, pointer, requestCount: () => requests };
}

function emptyManifest(overrides: Partial<IndexManifest> = {}): IndexManifest {
	return {
		schema_version: 2,
		bundle_id: "hardening-test",
		version: "v1",
		files: [],
		metadata: {},
		...overrides,
	};
}

function pointerFetch(
	origin: SyntheticOrigin,
	overrides: Partial<VersionPointer>,
): FetchBytes {
	return (url, options) => {
		if (url.endsWith("/latest")) {
			return Promise.resolve(
				ENCODER.encode(JSON.stringify({ ...origin.pointer, ...overrides })),
			);
		}
		return origin.fetchBytes(url, options);
	};
}

function emptyFile(path = "empty.bin") {
	return {
		path,
		file_type: null,
		size: 0,
		file_sha256: EMPTY_HASH,
		chunks: [],
	};
}

describe("signed monotonic pointer contract", () => {
	it.each([
		["null pointer", null],
		["invalid manifest hash", { manifest_hash: "not-a-hash" }],
		["empty version", { version: "" }],
		["empty signature", { signature: "" }],
		["negative sequence", { sequence: -1 }],
		["non-string identity", { bundle_id: 7 }],
	])("rejects %s before any immutable fetch", async (_, malformed) => {
		const origin = await originFor(emptyManifest());
		const value =
			malformed === null ? null : { ...origin.pointer, ...malformed };
		let requests = 0;
		const fetchBytes: FetchBytes = () => {
			requests += 1;
			return Promise.resolve(ENCODER.encode(JSON.stringify(value)));
		};

		await expect(
			syncIndex({
				baseUrl: "/o",
				store: new MemoryCacheStore(),
				fetchBytes,
				verify: passVerify,
			}),
		).rejects.toBeInstanceOf(IntegrityError);
		expect(requests).toBe(1);
	});

	it("applies identity pins to an offline cached pointer", async () => {
		const origin = await originFor(emptyManifest());
		const store = new MemoryCacheStore();
		await syncIndex({ ...origin, baseUrl: "/o", store, verify: passVerify });

		await expect(
			syncIndex({
				baseUrl: "/o",
				store,
				fetchBytes: () => Promise.reject(new NetworkError("offline")),
				verify: passVerify,
				expectedBundleId: "almamesh-constructs",
				expectedChannel: "stable",
			}),
		).rejects.toThrow(/expected bundle identity/iu);
	});

	it("keeps sequence migration compatible at the low-level API when identity pins are omitted", async () => {
		const origin = await originFor(emptyManifest());
		const {
			bundle_id: _bundleId,
			channel: _channel,
			...unbound
		} = origin.pointer;
		const store = new MemoryCacheStore();
		const fetchBytes: FetchBytes = (url, options) =>
			url.endsWith("/latest")
				? Promise.resolve(ENCODER.encode(JSON.stringify(unbound)))
				: origin.fetchBytes(url, options);

		await syncIndex({ baseUrl: "/o", store, fetchBytes, verify: passVerify });

		expect((await store.readActive())?.sequence).toBe(1);
	});

	it.each([
		["bundle identity", { expectedBundleId: "almamesh-constructs" }],
		["release channel", { expectedChannel: "preview" }],
	])("rejects the wrong expected %s before fetching its manifest", async (_, pin) => {
		const origin = await originFor(emptyManifest());
		const store = new MemoryCacheStore();

		await expect(
			syncIndex({
				...origin,
				...pin,
				baseUrl: "/o",
				store,
				verify: passVerify,
			}),
		).rejects.toThrow(/expected/iu);
		expect(origin.requestCount()).toBe(1);
		expect(await store.readActive()).toBeNull();
	});

	it("rejects a lower sequence before fetching its manifest", async () => {
		const origin = await originFor(emptyManifest(), new Map(), 5);
		const store = new MemoryCacheStore();
		await syncIndex({ ...origin, baseUrl: "/o", store, verify: passVerify });
		let requests = 0;
		const replay = pointerFetch(origin, { sequence: 4 });

		await expect(
			syncIndex({
				baseUrl: "/o",
				store,
				fetchBytes: (url, options) => {
					requests += 1;
					return replay(url, options);
				},
				verify: passVerify,
			}),
		).rejects.toBeInstanceOf(RollbackError);
		expect(requests).toBe(1);
		expect((await store.readActive())?.sequence).toBe(5);
	});

	it("rejects equal-sequence equivocation before fetching its manifest", async () => {
		const origin = await originFor(emptyManifest(), new Map(), 5);
		const store = new MemoryCacheStore();
		await syncIndex({ ...origin, baseUrl: "/o", store, verify: passVerify });
		let requests = 0;
		const fork = pointerFetch(origin, {
			manifest_hash: "f".repeat(64),
			version: "fork",
		});

		await expect(
			syncIndex({
				baseUrl: "/o",
				store,
				fetchBytes: (url, options) => {
					requests += 1;
					return fork(url, options);
				},
				verify: passVerify,
			}),
		).rejects.toBeInstanceOf(RollbackError);
		expect(requests).toBe(1);
	});

	it("requires a sequence on every incoming pointer", async () => {
		const origin = await originFor(emptyManifest());
		const store = new MemoryCacheStore();
		const sequenceLess: FetchBytes = (url, options) => {
			if (url.endsWith("/latest")) {
				const { sequence: _sequence, ...legacy } = origin.pointer;
				return Promise.resolve(ENCODER.encode(JSON.stringify(legacy)));
			}
			return origin.fetchBytes(url, options);
		};

		await expect(
			syncIndex({
				baseUrl: "/o",
				store,
				fetchBytes: sequenceLess,
				verify: passVerify,
			}),
		).rejects.toThrow(/sequence/iu);
		expect(await store.readActive()).toBeNull();
	});

	it("allows one migration from a cached legacy active pointer", async () => {
		const origin = await originFor(emptyManifest());
		const store = new MemoryCacheStore();
		const legacy = {
			manifest_hash: origin.pointer.manifest_hash,
			version: origin.pointer.version,
			signature: "legacy-signature",
		} as unknown as VersionPointer;
		await store.promote(legacy);

		await syncIndex({ ...origin, baseUrl: "/o", store, verify: passVerify });

		expect((await store.readActive())?.sequence).toBe(1);
	});
});

describe("manifest validation", () => {
	it.each([
		"",
		"/absolute",
		"../parent",
		"a\\b",
		"a/../b",
		"x".repeat(1025),
	])("rejects unsafe path %j", async (path) => {
		const origin = await originFor(emptyManifest({ files: [emptyFile(path)] }));

		await expect(
			syncIndex({
				...origin,
				baseUrl: "/o",
				store: new MemoryCacheStore(),
				verify: passVerify,
			}),
		).rejects.toThrow(/unsafe path/iu);
		expect(origin.requestCount()).toBe(2);
	});

	it.each([
		["invalid file hash", { file_sha256: "bad" }, /hash/iu],
		["negative file size", { size: -1 }, /non-negative/iu],
		["oversized file", { size: 256 * 1024 * 1024 + 1 }, /cap/iu],
		["non-array chunks", { chunks: null }, /chunks/iu],
		["chunk sum mismatch", { size: 1 }, /chunks total/iu],
	] as const)("rejects %s", async (_, override, message) => {
		const file = {
			...emptyFile(),
			...override,
		} as unknown as IndexManifest["files"][number];
		const origin = await originFor(emptyManifest({ files: [file] }));

		await expect(
			syncIndex({
				...origin,
				baseUrl: "/o",
				store: new MemoryCacheStore(),
				verify: passVerify,
			}),
		).rejects.toThrow(message);
	});

	it("rejects duplicate file paths", async () => {
		const origin = await originFor(
			emptyManifest({ files: [emptyFile(), emptyFile()] }),
		);

		await expect(
			syncIndex({
				...origin,
				baseUrl: "/o",
				store: new MemoryCacheStore(),
				verify: passVerify,
			}),
		).rejects.toThrow(/repeats path/iu);
	});

	it("rejects conflicting sizes for one content hash", async () => {
		const hash = "a".repeat(64);
		const files = [1, 2].map((size, index) => ({
			...emptyFile(`f-${index}`),
			size,
			chunks: [{ hash, size }],
		}));
		const origin = await originFor(emptyManifest({ files }));

		await expect(
			syncIndex({
				...origin,
				baseUrl: "/o",
				store: new MemoryCacheStore(),
				verify: passVerify,
			}),
		).rejects.toThrow(/conflicting sizes/iu);
	});

	it.each([
		[
			"chunk references",
			Array.from({ length: 8193 }, () => ({ hash: "a".repeat(64), size: 0 })),
		],
		[
			"distinct chunks",
			Array.from({ length: 4097 }, (_, index) => ({
				hash: index.toString(16).padStart(64, "0"),
				size: 0,
			})),
		],
	] as const)("rejects too many %s", async (_, chunks) => {
		const origin = await originFor(
			emptyManifest({ files: [{ ...emptyFile(), chunks }] }),
		);

		await expect(
			syncIndex({
				...origin,
				baseUrl: "/o",
				store: new MemoryCacheStore(),
				verify: passVerify,
			}),
		).rejects.toThrow(/cap/iu);
	});

	it("rejects excessive aggregate uncompressed file bytes", async () => {
		const chunk = { hash: "b".repeat(64), size: 8 * 1024 * 1024 };
		const files = Array.from({ length: 3 }, (_, index) => ({
			...emptyFile(`large-${index}`),
			size: 256 * 1024 * 1024,
			chunks: Array.from({ length: 32 }, () => chunk),
		}));
		const origin = await originFor(emptyManifest({ files }));

		await expect(
			syncIndex({
				...origin,
				baseUrl: "/o",
				store: new MemoryCacheStore(),
				verify: passVerify,
			}),
		).rejects.toThrow(/uncompressed cap/iu);
	});

	it.each([
		["version", { version: "other" }],
		["bundle identity", { bundle_id: "other" }],
	] as const)("rejects pointer/manifest %s disagreement", async (_, pointer) => {
		const origin = await originFor(emptyManifest());

		await expect(
			syncIndex({
				baseUrl: "/o",
				store: new MemoryCacheStore(),
				fetchBytes: pointerFetch(origin, pointer),
				verify: passVerify,
			}),
		).rejects.toThrow(/differ/iu);
	});

	it("rejects an injected transport response above the caller's cap", async () => {
		const origin = await originFor(emptyManifest());
		const oversized = `${JSON.stringify(origin.pointer)}${" ".repeat(16 * 1024)}`;

		await expect(
			syncIndex({
				baseUrl: "/o",
				store: new MemoryCacheStore(),
				fetchBytes: () => Promise.resolve(ENCODER.encode(oversized)),
				verify: passVerify,
			}),
		).rejects.toThrow(/response cap/iu);
	});

	it("rejects a manifest that misses its content address", async () => {
		const origin = await originFor(emptyManifest());
		const fetchBytes: FetchBytes = (url, options) =>
			url.includes("/manifest/")
				? Promise.resolve(ENCODER.encode("{}"))
				: origin.fetchBytes(url, options);

		await expect(
			syncIndex({
				baseUrl: "/o",
				store: new MemoryCacheStore(),
				fetchBytes,
				verify: passVerify,
			}),
		).rejects.toThrow(/content-address/iu);
	});
});

describe("bounded sync resources", () => {
	it("rejects an unknown manifest schema before fetching chunks", async () => {
		const origin = await originFor(emptyManifest({ schema_version: 3 }));
		const store = new MemoryCacheStore();

		await expect(
			syncIndex({ ...origin, baseUrl: "/o", store, verify: passVerify }),
		).rejects.toThrow(/schema/iu);
		expect(origin.requestCount()).toBe(2);
		expect(await store.readActive()).toBeNull();
	});

	it("uses parallel chunk workers without exceeding eight in flight", async () => {
		const zstd = await Zstd.load();
		const chunks = new Map<string, Uint8Array>();
		const refs = [];
		for (let index = 0; index < 20; index += 1) {
			const bytes = ENCODER.encode(`bounded chunk ${index}`);
			const hash = await sha256Hex(bytes);
			refs.push({ hash, size: bytes.byteLength });
			chunks.set(hash, zstd.compress(bytes));
		}
		const file = ENCODER.encode(
			refs.map((_, index) => `bounded chunk ${index}`).join(""),
		);
		const manifest = emptyManifest({
			files: [
				{
					path: "chunks.bin",
					file_type: null,
					size: refs.reduce((total, ref) => total + ref.size, 0),
					file_sha256: await sha256Hex(file),
					chunks: refs,
				},
			],
		});
		const origin = await originFor(manifest, chunks);
		let inFlight = 0;
		let maximum = 0;
		const delayed: FetchBytes = async (url, options) => {
			if (!url.includes("/chunk/")) return origin.fetchBytes(url, options);
			inFlight += 1;
			maximum = Math.max(maximum, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 5));
			try {
				return await origin.fetchBytes(url, options);
			} finally {
				inFlight -= 1;
			}
		};

		await syncIndex({
			baseUrl: "/o",
			store: new MemoryCacheStore(),
			fetchBytes: delayed,
			verify: passVerify,
		});

		expect(maximum).toBeGreaterThan(1);
		expect(maximum).toBeLessThanOrEqual(8);
	});

	it("rejects an excessive file count before fetching chunks", async () => {
		const files = Array.from({ length: 257 }, (_, index) => ({
			path: `f-${index}`,
			file_type: null,
			size: 0,
			file_sha256:
				"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			chunks: [],
		}));
		const origin = await originFor(emptyManifest({ files }));
		const store = new MemoryCacheStore();

		await expect(
			syncIndex({ ...origin, baseUrl: "/o", store, verify: passVerify }),
		).rejects.toThrow(/file/iu);
		expect(origin.requestCount()).toBe(2);
		expect(await store.readActive()).toBeNull();
	});

	it("rejects aggregate fetched bytes before storing or promoting", async () => {
		const bytes = ENCODER.encode("larger than the injected aggregate ceiling");
		const hash = await sha256Hex(bytes);
		const zstd = await Zstd.load();
		const manifest = emptyManifest({
			files: [
				{
					path: "one.bin",
					file_type: null,
					size: bytes.byteLength,
					file_sha256: hash,
					chunks: [{ hash, size: bytes.byteLength }],
				},
			],
		});
		const origin = await originFor(
			manifest,
			new Map([[hash, zstd.compress(bytes)]]),
		);
		const store = new MemoryCacheStore();

		await expect(
			syncIndex({
				...origin,
				baseUrl: "/o",
				store,
				verify: passVerify,
				limits: { maxTotalFetchBytes: 1 },
			}),
		).rejects.toThrow(/aggregate/iu);
		expect(await store.hasChunk(hash)).toBe(false);
		expect(await store.readActive()).toBeNull();
	});

	it("reserves the aggregate cap before concurrent chunk downloads", async () => {
		const zstd = await Zstd.load();
		const bytes = ENCODER.encode("bounded");
		const hash = await sha256Hex(bytes);
		const refs = Array.from({ length: 8 }, () => ({ hash, size: bytes.byteLength }));
		const fileBytes = new Uint8Array(bytes.length * refs.length);
		for (let index = 0; index < refs.length; index += 1) {
			fileBytes.set(bytes, index * bytes.length);
		}
		const manifest = emptyManifest({
			files: [
				{
					path: "bounded.bin",
					file_type: null,
					size: bytes.byteLength * refs.length,
					file_sha256: await sha256Hex(fileBytes),
					chunks: refs,
				},
			],
		});
		const origin = await originFor(
			manifest,
			new Map([[hash, zstd.compress(bytes)]]),
		);
		const reservations: number[] = [];
		const fetchBytes: FetchBytes = (url, options) => {
			if (url.includes("/chunk/")) reservations.push(options?.maxBytes ?? 0);
			return origin.fetchBytes(url, options);
		};

		await syncIndex({
			baseUrl: "/o",
			store: new MemoryCacheStore(),
			fetchBytes,
			verify: passVerify,
			limits: { maxTotalFetchBytes: 256 },
		});

		expect(reservations.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(256);
	});

	it("rejects a non-positive injected aggregate cap", async () => {
		const origin = await originFor(emptyManifest());

		await expect(
			syncIndex({
				...origin,
				baseUrl: "/o",
				store: new MemoryCacheStore(),
				verify: passVerify,
				limits: { maxTotalFetchBytes: 0 },
			}),
		).rejects.toThrow(/positive/iu);
	});

	it("bounds zstd output by the signed chunk size", async () => {
		const zstd = await Zstd.load();
		const bomb = new Uint8Array(9 * 1024 * 1024);
		const declared = new Uint8Array([0]);
		const hash = await sha256Hex(declared);
		const manifest = emptyManifest({
			files: [
				{
					path: "bomb.bin",
					file_type: null,
					size: 1,
					file_sha256: hash,
					chunks: [{ hash, size: 1 }],
				},
			],
		});
		const origin = await originFor(
			manifest,
			new Map([[hash, zstd.compress(bomb)]]),
		);
		const store = new MemoryCacheStore();

		await expect(
			syncIndex({ ...origin, baseUrl: "/o", store, verify: passVerify }),
		).rejects.toBeInstanceOf(IntegrityError);
		expect(await store.readActive()).toBeNull();
	});

	it("rejects a reassembled file whose signed whole-file hash differs", async () => {
		const bytes = ENCODER.encode("verified chunk, wrong file hash");
		const hash = await sha256Hex(bytes);
		const zstd = await Zstd.load();
		const manifest = emptyManifest({
			files: [
				{
					path: "wrong-file-hash.bin",
					file_type: null,
					size: bytes.byteLength,
					file_sha256: "f".repeat(64),
					chunks: [{ hash, size: bytes.byteLength }],
				},
			],
		});
		const origin = await originFor(
			manifest,
			new Map([[hash, zstd.compress(bytes)]]),
		);

		await expect(
			syncIndex({
				...origin,
				baseUrl: "/o",
				store: new MemoryCacheStore(),
				verify: passVerify,
			}),
		).rejects.toThrow(/reassembly/iu);
	});

	it("rejects materializing a path absent from the verified manifest", async () => {
		await expect(
			materializeFile(new MemoryCacheStore(), emptyManifest(), "missing.bin"),
		).rejects.toThrow(/not in manifest/iu);
	});
});
