import { describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "../client";
import type { ProviderConfig } from "../config";
import { routeChatCompletion } from "../route";

const MESSAGES: readonly ChatMessage[] = [
  { role: "system", content: "persona" },
  { role: "user", content: "question + chart json" },
];

const HTTP_CFG: ProviderConfig = {
  engine: "openai-http",
  model: "llama3.1",
  privacyMode: "local_only",
  baseUrl: "http://localhost:11434/v1",
};

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const delta of gen) {
    out.push(delta);
  }
  return out;
}

/** A fetch stub that streams a single SSE delta with the given content. */
function sseFetch(content: string): typeof fetch {
  return vi.fn(async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: {"choices":[{"delta":{"content":"${content}"}}]}\n\n`),
        );
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  }) as unknown as typeof fetch;
}

describe("routeChatCompletion — openai-http path", () => {
  it("delegates to streamChatCompletion (issues the HTTP request via fetchImpl)", async () => {
    const fetchImpl = sseFetch("hi");

    const deltas = await collect(
      routeChatCompletion({
        config: HTTP_CFG,
        messages: MESSAGES,
        fetchImpl,
      }),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(deltas).toEqual(["hi"]);
  });

  it("forwards the abort signal to the underlying fetch", async () => {
    let seenSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (_url: unknown, init?: { signal?: AbortSignal }) => {
      seenSignal = init?.signal;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    }) as unknown as typeof fetch;
    const controller = new AbortController();

    await collect(
      routeChatCompletion({
        config: HTTP_CFG,
        messages: MESSAGES,
        signal: controller.signal,
        fetchImpl,
      }),
    );

    expect(seenSignal).toBe(controller.signal);
  });
});
