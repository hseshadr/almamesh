// TDD: the provider-dispatch seam in the three-kind world. `routeChatCompletion`
// and the NEW `routeCompletionJson` branch on `config.engine`:
//   - "webllm"      → the on-device provider (mocked library, zero network)
//   - "openai-http" → the existing HTTP path, byte-identical (request body pinned)
// `structureLifeEvents` rides the JSON seam, so an on-device config serves the
// life-event extractor with no fetch at all.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@mlc-ai/web-llm", async () => {
  const { makeFakeWebLlm } = await import("./helpers/fake-webllm");
  return makeFakeWebLlm();
});

import type { ChatMessage } from "../client";
import type { ProviderConfig } from "../config";
import { routeChatCompletion, routeCompletionJson } from "../route";
import { structureLifeEvents } from "../structure-life-events";
import { resetOnDeviceEngine } from "../webllm/engine";
import type { FakeWebLlm } from "./helpers/fake-webllm";

const fake = (await import("@mlc-ai/web-llm")) as unknown as FakeWebLlm;

const MESSAGES: readonly ChatMessage[] = [
  { role: "system", content: "persona" },
  { role: "user", content: "question" },
];

const ONDEVICE_CFG: ProviderConfig = {
  engine: "webllm",
  model: "Qwen3-1.7B-q4f16_1-MLC",
  privacyMode: "local_only",
};

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

beforeEach(() => {
  fake.__reset();
  resetOnDeviceEngine();
  vi.unstubAllGlobals();
});

describe("routeChatCompletion — webllm branch", () => {
  it("routes an on-device config to the WebLLM provider with zero fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    fake.__state.streamChunks = ["on", "-device"];

    const deltas = await collect(
      routeChatCompletion({ config: ONDEVICE_CFG, messages: MESSAGES }),
    );

    expect(deltas).toEqual(["on", "-device"]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fake.__state.requests[0].extra_body).toEqual({ enable_thinking: false });
  });

  it("forwards the abort signal to the on-device provider", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      collect(
        routeChatCompletion({
          config: ONDEVICE_CFG,
          messages: MESSAGES,
          signal: controller.signal,
        }),
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("routeCompletionJson — the NEW JSON seam", () => {
  it("routes an on-device config to the engine (schema → xgrammar), zero fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    fake.__state.jsonContent = '{"a":1}';
    const schema = { type: "object" };

    const raw = await routeCompletionJson({
      config: ONDEVICE_CFG,
      messages: MESSAGES,
      schema,
    });

    expect(raw).toBe('{"a":1}');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fake.__state.requests[0].response_format).toEqual({
      type: "json_object",
      schema: JSON.stringify(schema),
    });
  });

  it("openai-http request body is BYTE-IDENTICAL to the legacy chatCompletionJson (schema ignored)", async () => {
    let body = "";
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      body = init?.body as string;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const raw = await routeCompletionJson({
      config: HTTP_CFG,
      messages: MESSAGES,
      fetchImpl,
      schema: { type: "object" }, // MUST NOT leak into the HTTP body
    });

    expect(raw).toBe('{"ok":true}');
    expect(body).toBe(
      JSON.stringify({
        model: HTTP_CFG.model,
        messages: MESSAGES,
        stream: false,
        response_format: { type: "json_object" },
      }),
    );
    expect(fake.__state.requests).toHaveLength(0);
  });
});

describe("structureLifeEvents — served on-device through the seam", () => {
  it("extracts typed events from an on-device config with ZERO network calls", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    fake.__state.jsonContent = JSON.stringify({
      events: [{ date: "2015-03-10", category: "marriage", precision: "exact" }],
    });

    const result = await structureLifeEvents("married in spring 2015", ONDEVICE_CFG);

    expect(result).toEqual({
      status: "ok",
      events: [{ date: "2015-03-10", category: "marriage", precision: "exact" }],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("hands xgrammar a schema so the on-device model cannot emit free-form JSON", async () => {
    fake.__state.jsonContent = '{"events":[]}';
    await structureLifeEvents("nothing dated", ONDEVICE_CFG);
    const req = fake.__state.requests[0];
    expect(req.response_format?.type).toBe("json_object");
    expect(req.response_format?.schema).toBeDefined();
    const schema = JSON.parse(req.response_format?.schema ?? "{}") as {
      properties?: { events?: unknown };
    };
    expect(schema.properties?.events).toBeDefined();
  });
});
