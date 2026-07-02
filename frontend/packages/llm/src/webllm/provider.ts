// The on-device `ChatStreamProvider` + JSON completion — WebGPU inference via
// the lazy engine singleton. Messages in, token deltas out: the SAME contract
// the OpenAI-compatible HTTP client satisfies, so `route.ts` dispatches on
// `config.engine` and no caller ever branches.
//
// Two hard rules on every request:
//   1. `enable_thinking: false` — Qwen3 emits <think> blocks otherwise.
//   2. Nothing leaves the device: no fetch, no XHR (egress-tested).
//
// JSON completions ride xgrammar: `response_format: {type: "json_object",
// schema}` makes malformed JSON unrepresentable, which is what lets a 1.7B
// model serve the typed life-event extractor safely.

import { LlmRequestError, type ChatMessage } from "../client";
import type { ProviderConfig } from "../config";
import type { ChatStreamProvider } from "../provider";
import {
  getOnDeviceEngine,
  type OnDeviceChatCompletion,
  type OnDeviceChatDelta,
  type OnDeviceChatRequest,
} from "./engine";

function abortError(): Error {
  const err = new Error("On-device completion aborted");
  err.name = "AbortError";
  return err;
}

function toPlainMessages(
  messages: readonly ChatMessage[],
): Array<{ role: string; content: string }> {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

/** The Qwen3 `<think>`-block neutralizer — pinned on EVERY request. */
const NO_THINKING = { enable_thinking: false } as const;

/**
 * The on-device chat backend: streams token deltas from the WebLLM engine.
 * Honors the abort signal (interrupts generation mid-stream) and never touches
 * the network.
 */
export const webLlmChatProvider: ChatStreamProvider = {
  kind: "webllm",
  async *stream(args: {
    readonly config: ProviderConfig;
    readonly messages: readonly ChatMessage[];
    readonly signal?: AbortSignal;
  }): AsyncGenerator<string> {
    if (args.signal?.aborted) {
      throw abortError();
    }
    const engine = await getOnDeviceEngine(args.config.model);
    if (args.signal?.aborted) {
      throw abortError();
    }
    const request: OnDeviceChatRequest = {
      messages: toPlainMessages(args.messages),
      stream: true,
      extra_body: NO_THINKING,
    };
    const completion = (await engine.chat.completions.create(
      request,
    )) as AsyncIterable<OnDeviceChatDelta>;
    for await (const chunk of completion) {
      if (args.signal?.aborted) {
        engine.interruptGenerate();
        throw abortError();
      }
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    }
  },
};

/**
 * ONE non-streaming on-device chat completion that returns a JSON object.
 * When `schema` is given it is enforced by xgrammar (grammar-constrained
 * decoding), so the model cannot emit JSON outside the schema. Returns the raw
 * message content string — the same contract as the HTTP `chatCompletionJson`.
 */
export async function webLlmCompletionJson(
  config: ProviderConfig,
  messages: readonly ChatMessage[],
  schema?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) {
    throw abortError();
  }
  const engine = await getOnDeviceEngine(config.model);
  if (signal?.aborted) {
    throw abortError();
  }
  const request: OnDeviceChatRequest = {
    messages: toPlainMessages(messages),
    stream: false,
    response_format: {
      type: "json_object",
      ...(schema ? { schema: JSON.stringify(schema) } : {}),
    },
    extra_body: NO_THINKING,
  };
  const response = (await engine.chat.completions.create(request)) as OnDeviceChatCompletion;
  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new LlmRequestError("On-device model returned an empty completion");
  }
  return content;
}
