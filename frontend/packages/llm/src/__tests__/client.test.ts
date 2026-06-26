import { describe, expect, it, vi } from "vitest";

import {
  LlmRequestError,
  streamChatCompletion,
  type ChatMessage,
} from "../client";
import { PrivacyViolationError, type ProviderConfig } from "../config";

const LOCAL_CFG: ProviderConfig = {
  engine: "openai-http",
  model: "llama3.1",
  privacyMode: "local_only",
  baseUrl: "http://localhost:11434/v1",
};

const CLOUD_CFG: ProviderConfig = {
  engine: "openai-http",
  model: "gpt-4o-mini",
  privacyMode: "local_only", // local_only but cloud endpoint -> must refuse
  baseUrl: "https://openrouter.ai/api/v1",
  apiKey: "sk-secret",
};

const MESSAGES: ChatMessage[] = [
  { role: "system", content: "You are a Vedic astrologer." },
  { role: "user", content: "Interpret this chart." },
];

// Build a Response whose body streams the given SSE text in arbitrary slices.
function sseResponse(chunks: string[], init: ResponseInit = { status: 200 }): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, init);
}

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const token of gen) out.push(token);
  return out;
}

describe("streamChatCompletion — privacy gate", () => {
  it("refuses BEFORE any fetch when local_only targets a cloud endpoint", async () => {
    const fetchImpl = vi.fn();
    const gen = streamChatCompletion({
      config: CLOUD_CFG,
      messages: MESSAGES,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(collect(gen)).rejects.toBeInstanceOf(PrivacyViolationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("streamChatCompletion — SSE parsing", () => {
  it("yields token deltas from a well-formed OpenAI SSE stream", async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    const tokens = await collect(
      streamChatCompletion({
        config: LOCAL_CFG,
        messages: MESSAGES,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    );
    expect(tokens.join("")).toBe("Hello world");
  });

  it("reassembles SSE events split across read boundaries", async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse([
        'data: {"choices":[{"delta":{"con',
        'tent":"split"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"!"}}]}\n\n',
      ]),
    );
    const tokens = await collect(
      streamChatCompletion({
        config: LOCAL_CFG,
        messages: MESSAGES,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    );
    expect(tokens.join("")).toBe("split!");
  });

  it("throws LlmRequestError on a non-2xx response", async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse(["nope"], { status: 500, statusText: "Server Error" }),
    );
    const gen = streamChatCompletion({
      config: LOCAL_CFG,
      messages: MESSAGES,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(collect(gen)).rejects.toBeInstanceOf(LlmRequestError);
  });

  it("sends stream:true, the model, and an identifier-free body", async () => {
    let capturedBody = "";
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n']);
    });
    await collect(
      streamChatCompletion({
        config: LOCAL_CFG,
        messages: MESSAGES,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    );
    const body = JSON.parse(capturedBody);
    expect(body.stream).toBe(true);
    expect(body.model).toBe("llama3.1");
    // Egress assertion: the request body carries no chart identifiers/timestamps.
    expect(capturedBody).not.toMatch(/chart_id|generated_at|calculation_timestamp/);
    expect(capturedBody).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });
});
