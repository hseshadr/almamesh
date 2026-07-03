// TDD: the on-device ChatStreamProvider + JSON completion. Pins the request
// contract every call must satisfy: `enable_thinking: false` ONLY for models
// flagged `suppressThinking` (Qwen3's <think>-block hazard — Llama must never
// get it), the defensive leading-empty-<think> strip, bounded max_tokens,
// typed context-overflow/model-record causes, xgrammar schema pass-through on
// JSON completions, abort propagation (interruptGenerate + AbortError), and
// the zero-network invariant.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@mlc-ai/web-llm", async () => {
  const { makeFakeWebLlm } = await import("./helpers/fake-webllm");
  return makeFakeWebLlm();
});

import type { ChatMessage } from "../client";
import { LlmRequestError } from "../client";
import type { ProviderConfig } from "../config";
import { resetOnDeviceEngine } from "../webllm/engine";
import {
  OnDeviceContextOverflowError,
  OnDeviceModelRecordError,
} from "../webllm/errors";
import { BLESSED_ONDEVICE_MODELS } from "../webllm/models";
import { webLlmChatProvider, webLlmCompletionJson } from "../webllm/provider";
import type { FakeWebLlm } from "./helpers/fake-webllm";

const fake = (await import("@mlc-ai/web-llm")) as unknown as FakeWebLlm;

const ONDEVICE_CFG: ProviderConfig = {
  engine: "webllm",
  model: "Qwen3-1.7B-q4f16_1-MLC",
  privacyMode: "local_only",
};

// The lighter blessed model: its tokenizer LACKS the think token, so WebLLM
// answers `enable_thinking: false` by splicing a literal empty `<think>` block
// into the prompt + stream — Llama must never receive the flag.
const LLAMA_CFG: ProviderConfig = {
  engine: "webllm",
  model: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
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

describe("model-gated thinking flag — Qwen needs it, Llama must NOT get it", () => {
  it("only the Qwen entry in the blessed list is flagged for thinking suppression", () => {
    const flagged = Object.fromEntries(
      BLESSED_ONDEVICE_MODELS.map((m) => [m.id, m.suppressThinking ?? false]),
    );
    expect(flagged["Qwen3-1.7B-q4f16_1-MLC"]).toBe(true);
    expect(flagged["Llama-3.2-1B-Instruct-q4f16_1-MLC"]).toBe(false);
  });

  it("sends NO enable_thinking extra_body to an unflagged model (streaming)", async () => {
    await collect(webLlmChatProvider.stream({ config: LLAMA_CFG, messages: MESSAGES }));
    expect(fake.__state.requests).toHaveLength(1);
    expect(fake.__state.requests[0].extra_body).toBeUndefined();
  });

  it("sends NO enable_thinking extra_body to an unflagged model (JSON)", async () => {
    await webLlmCompletionJson(LLAMA_CFG, MESSAGES);
    expect(fake.__state.requests[0].extra_body).toBeUndefined();
  });
});

describe("defensive leading empty <think> strip — chat and JSON paths", () => {
  it("strips a leading empty <think> block from the streamed answer", async () => {
    fake.__state.streamChunks = ["<think>", "\n\n</think>", "\n\nNam", "aste"];
    const deltas = await collect(
      webLlmChatProvider.stream({ config: LLAMA_CFG, messages: MESSAGES }),
    );
    expect(deltas.join("")).toBe("Namaste");
  });

  it("strips a leading empty <think> block from a JSON completion", async () => {
    fake.__state.jsonContent = '<think>\n\n</think>\n\n{"ok":true}';
    await expect(webLlmCompletionJson(ONDEVICE_CFG, MESSAGES)).resolves.toBe('{"ok":true}');
  });

  it("a completion that is ONLY the empty block is an empty completion (typed error)", async () => {
    fake.__state.jsonContent = "<think>\n\n</think>\n\n";
    await expect(webLlmCompletionJson(ONDEVICE_CFG, MESSAGES)).rejects.toBeInstanceOf(
      LlmRequestError,
    );
  });
});

describe("context-window discipline (4096) — bounded generation + typed overflow", () => {
  it("sets a bounded max_tokens on the streaming request (generation headroom)", async () => {
    await collect(webLlmChatProvider.stream({ config: ONDEVICE_CFG, messages: MESSAGES }));
    expect(fake.__state.requests[0].max_tokens).toBe(768);
  });

  it("the fake engine enforces the window: an oversized prompt fails LOUDLY", async () => {
    // ~4200 estimated tokens against the default 4096 fake window.
    const oversized: readonly ChatMessage[] = [
      { role: "user", content: "x".repeat(4200 * 4) },
    ];
    await expect(
      collect(webLlmChatProvider.stream({ config: ONDEVICE_CFG, messages: oversized })),
    ).rejects.toBeInstanceOf(OnDeviceContextOverflowError);
  });

  it("maps the engine's overflow to the typed OnDeviceContextOverflowError (JSON too)", async () => {
    fake.__state.contextWindowSize = 2; // MESSAGES estimate ~4 tokens → overflow
    await expect(webLlmCompletionJson(ONDEVICE_CFG, MESSAGES)).rejects.toBeInstanceOf(
      OnDeviceContextOverflowError,
    );
  });
});

describe("typed on-device causes — model record missing", () => {
  it("maps a missing model record to the typed OnDeviceModelRecordError", async () => {
    const err = new Error(
      "Cannot find model record in appConfig for bogus-model. Please check if the model ID is correct.",
    );
    err.name = "ModelNotFoundError";
    fake.__state.failCreate = err;
    await expect(
      collect(webLlmChatProvider.stream({ config: ONDEVICE_CFG, messages: MESSAGES })),
    ).rejects.toBeInstanceOf(OnDeviceModelRecordError);
  });

  it("leaves unknown engine failures untouched (generic fallback stays generic)", async () => {
    fake.__state.failCreate = new Error("GPU device lost");
    await expect(
      collect(webLlmChatProvider.stream({ config: ONDEVICE_CFG, messages: MESSAGES })),
    ).rejects.toThrow("GPU device lost");
  });
});
