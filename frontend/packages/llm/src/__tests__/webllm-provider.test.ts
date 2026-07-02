// TDD: the on-device ChatStreamProvider + JSON completion. Pins the request
// contract every call must satisfy: `enable_thinking: false` on EVERY request
// (the Qwen3 <think>-block hazard), xgrammar schema pass-through on JSON
// completions, abort propagation (interruptGenerate + AbortError), and the
// zero-network invariant.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@mlc-ai/web-llm", async () => {
  const { makeFakeWebLlm } = await import("./helpers/fake-webllm");
  return makeFakeWebLlm();
});

import type { ChatMessage } from "../client";
import { LlmRequestError } from "../client";
import type { ProviderConfig } from "../config";
import { resetOnDeviceEngine } from "../webllm/engine";
import { webLlmChatProvider, webLlmCompletionJson } from "../webllm/provider";
import type { FakeWebLlm } from "./helpers/fake-webllm";

const fake = (await import("@mlc-ai/web-llm")) as unknown as FakeWebLlm;

const ONDEVICE_CFG: ProviderConfig = {
  engine: "webllm",
  model: "Qwen3-1.7B-q4f16_1-MLC",
  privacyMode: "local_only",
};

const MESSAGES: readonly ChatMessage[] = [
  { role: "system", content: "persona" },
  { role: "user", content: "question" },
];

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

describe("webLlmChatProvider — messages in, token deltas out", () => {
  it("has the webllm engine kind", () => {
    expect(webLlmChatProvider.kind).toBe("webllm");
  });

  it("streams token deltas from the on-device engine", async () => {
    fake.__state.streamChunks = ["Namas", "te"];
    const deltas = await collect(
      webLlmChatProvider.stream({ config: ONDEVICE_CFG, messages: MESSAGES }),
    );
    expect(deltas).toEqual(["Namas", "te"]);
  });

  it("sends enable_thinking: false on the streaming request (Qwen3 hazard)", async () => {
    await collect(webLlmChatProvider.stream({ config: ONDEVICE_CFG, messages: MESSAGES }));
    expect(fake.__state.requests).toHaveLength(1);
    const req = fake.__state.requests[0];
    expect(req.stream).toBe(true);
    expect(req.extra_body).toEqual({ enable_thinking: false });
    expect(req.messages).toEqual([
      { role: "system", content: "persona" },
      { role: "user", content: "question" },
    ]);
  });

  it("throws an AbortError without any engine call when pre-aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      collect(
        webLlmChatProvider.stream({
          config: ONDEVICE_CFG,
          messages: MESSAGES,
          signal: controller.signal,
        }),
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fake.__state.requests).toHaveLength(0);
  });

  it("aborting mid-stream interrupts generation and throws AbortError", async () => {
    fake.__state.streamChunks = ["one", "two", "three"];
    const controller = new AbortController();
    const received: string[] = [];
    await expect(
      (async () => {
        for await (const delta of webLlmChatProvider.stream({
          config: ONDEVICE_CFG,
          messages: MESSAGES,
          signal: controller.signal,
        })) {
          received.push(delta);
          controller.abort();
        }
      })(),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(received).toEqual(["one"]);
    expect(fake.__interrupt).toHaveBeenCalledTimes(1);
  });

  it("makes ZERO fetch calls (on-device inference never touches the network)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await collect(webLlmChatProvider.stream({ config: ONDEVICE_CFG, messages: MESSAGES }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("webLlmCompletionJson — xgrammar-enforced JSON completion", () => {
  it("returns the completion content", async () => {
    fake.__state.jsonContent = '{"events":[]}';
    await expect(webLlmCompletionJson(ONDEVICE_CFG, MESSAGES)).resolves.toBe(
      '{"events":[]}',
    );
  });

  it("requests response_format json_object and enable_thinking: false", async () => {
    await webLlmCompletionJson(ONDEVICE_CFG, MESSAGES);
    const req = fake.__state.requests[0];
    expect(req.stream).toBe(false);
    expect(req.response_format).toEqual({ type: "json_object" });
    expect(req.extra_body).toEqual({ enable_thinking: false });
  });

  it("passes the JSON schema through to xgrammar (stringified)", async () => {
    const schema = {
      type: "object",
      properties: { events: { type: "array" } },
      required: ["events"],
    };
    await webLlmCompletionJson(ONDEVICE_CFG, MESSAGES, schema);
    const req = fake.__state.requests[0];
    expect(req.response_format).toEqual({
      type: "json_object",
      schema: JSON.stringify(schema),
    });
  });

  it("throws LlmRequestError on an empty completion", async () => {
    fake.__state.jsonContent = "   ";
    await expect(webLlmCompletionJson(ONDEVICE_CFG, MESSAGES)).rejects.toBeInstanceOf(
      LlmRequestError,
    );
  });

  it("honors a pre-aborted signal without touching the engine", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      webLlmCompletionJson(ONDEVICE_CFG, MESSAGES, undefined, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fake.__state.requests).toHaveLength(0);
  });

  it("makes ZERO fetch calls", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await webLlmCompletionJson(ONDEVICE_CFG, MESSAGES);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
