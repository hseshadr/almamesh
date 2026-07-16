import { afterEach, describe, expect, it, vi } from "vitest";
import {
	FETCH_TIMEOUT_MS,
	fetchBytes,
	NetworkError,
	ResponseTooLargeError,
} from "./fetchBytes";

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("fetchBytes release bounds", () => {
	it("times out even when the fetch promise ignores AbortSignal", async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			"fetch",
			vi.fn(() => new Promise<Response>(() => undefined)),
		);

		const pending = fetchBytes("https://origin.example/never");
		const assertion = expect(pending).rejects.toBeInstanceOf(NetworkError);
		await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
		await assertion;
	});

	it("keeps the deadline active after headers while the body stalls", async () => {
		vi.useFakeTimers();
		const stalled = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array([1]));
			},
			pull: () => new Promise<void>(() => undefined),
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.resolve(new Response(stalled, { status: 200 }))),
		);

		const pending = fetchBytes("https://origin.example/stalled-body");
		const assertion = expect(pending).rejects.toBeInstanceOf(NetworkError);
		await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
		await assertion;
	});

	it("streams a response through the caller's byte ceiling", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() =>
				Promise.resolve(
					new Response(new Uint8Array(9), {
						status: 200,
					}),
				),
			),
		);

		await expect(
			fetchBytes("https://origin.example/oversize", { maxBytes: 8 }),
		).rejects.toBeInstanceOf(ResponseTooLargeError);
	});

	it("rejects an oversized declared body before reading it", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() =>
				Promise.resolve(
					new Response(new Uint8Array([1]), {
						status: 200,
						headers: { "content-length": "9" },
					}),
				),
			),
		);

		await expect(
			fetchBytes("https://origin.example/declared-oversize", { maxBytes: 8 }),
		).rejects.toBeInstanceOf(ResponseTooLargeError);
	});

	it("fetches mutable latest with no-store while preserving the cap", async () => {
		const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
			Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { status: 200 })),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			fetchBytes("https://origin.example/latest", {
				cache: "no-store",
				maxBytes: 3,
			}),
		).resolves.toEqual(new Uint8Array([1, 2, 3]));
		expect(fetchMock.mock.calls[0]?.[1]?.cache).toBe("no-store");
	});
});
