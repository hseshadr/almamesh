// Global-fetch recording for the extractor task.
//
// `structureLifeEvents` (the REAL production function, imported from src) does
// not expose a fetchImpl parameter — it talks to `globalThis.fetch`. To score
// raw JSON validity and latency without touching src/, the bench temporarily
// swaps the global fetch for a recording wrapper. The swap is serialized
// through a mutex so suite-mode concurrency (≤2 models) can never interleave
// two models' records.

import type { FetchLike } from "./openaiClient";

export interface RecordedExchange {
  readonly status: number | null;
  /** The completion content string (choices[0].message.content), when parseable. */
  readonly content: string | null;
  readonly ms: number;
  readonly error?: string;
}

/** Wrap a fetch so each call's status + completion content + latency is kept. */
export function recordingFetch(base: FetchLike, records: RecordedExchange[]): FetchLike {
  const wrapped = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const t0 = Date.now();
    try {
      const response = await base(input, init);
      let content: string | null = null;
      try {
        const clone = response.clone();
        const payload = (await clone.json()) as {
          choices?: ReadonlyArray<{ message?: { content?: string } }>;
        };
        content = payload.choices?.[0]?.message?.content ?? null;
      } catch {
        content = null;
      }
      records.push({ status: response.status, content, ms: Date.now() - t0 });
      return response;
    } catch (err) {
      records.push({ status: null, content: null, ms: Date.now() - t0, error: String(err) });
      throw err;
    }
  };
  return wrapped as FetchLike;
}

/** Tiny promise-chain mutex: serializes global-fetch swaps. */
export class Mutex {
  private chain: Promise<unknown> = Promise.resolve();

  lock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

export const globalFetchMutex = new Mutex();

/** Run `fn` with `globalThis.fetch` swapped to `impl`; always restores. */
export async function withGlobalFetch<T>(impl: FetchLike, fn: () => Promise<T>): Promise<T> {
  return globalFetchMutex.lock(async () => {
    const original = globalThis.fetch;
    globalThis.fetch = impl;
    try {
      return await fn();
    } finally {
      globalThis.fetch = original;
    }
  });
}
