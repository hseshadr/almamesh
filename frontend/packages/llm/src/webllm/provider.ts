// The on-device `ChatStreamProvider` + JSON completion — WebGPU inference via
// the lazy engine singleton. Messages in, token deltas out: the SAME contract
// the OpenAI-compatible HTTP client satisfies, so `route.ts` dispatches on
// `config.engine` and no caller ever branches.
//
// Hard rules on every request:
//   1. `enable_thinking: false` ONLY for models flagged `suppressThinking`
//      (Qwen3). Sending it to a model whose tokenizer lacks the think token
//      (Llama) makes WebLLM splice a literal empty `<think>` block into the
//      prompt + stream — the flag would CREATE the garbage it prevents. A
//      defensive strip removes any leading empty block that slips through.
//   2. Bounded `max_tokens` on chat streams — generation must fit the same
//      4096-token window as the prompt (WebLLM THROWS on overflow).
//   3. Nothing leaves the device: no fetch, no XHR (egress-tested).
//   4. Raw WebLLM failures map to typed on-device causes (context overflow,
//      missing model record) so the UI can offer a real recovery action.
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
  type OnDeviceEngineHandle,
} from "./engine";
import { toOnDeviceError } from "./errors";
import { BLESSED_ONDEVICE_MODELS } from "./models";
import { stripLeadingEmptyThink, stripLeadingEmptyThinkStream } from "./think-strip";

/**
 * Chat generation cap: the 4096-token window holds prompt AND generation, and
 * the on-device prompt budget targets ≤ ~3000 tokens — 768 of generation fits
 * with margin (see `prompt.ts` `ONDEVICE_CHAT_BUDGET`).
 */
const ONDEVICE_MAX_COMPLETION_TOKENS = 768;

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

/** The Qwen3 `<think>`-block neutralizer — ONLY for `suppressThinking` models. */
const NO_THINKING = { enable_thinking: false } as const;

/** The `extra_body` slice for `modelId` — empty unless the spec asks for it. */
function thinkingExtraBody(
  modelId: string,
): { extra_body: typeof NO_THINKING } | Record<string, never> {
  const spec = BLESSED_ONDEVICE_MODELS.find((m) => m.id === modelId);
  return spec?.suppressThinking ? { extra_body: NO_THINKING } : {};
}

/** Acquire the engine, mapping bring-up failures to typed on-device causes. */
async function acquireEngine(modelId: string): Promise<OnDeviceEngineHandle> {
  try {
    return await getOnDeviceEngine(modelId);
  } catch (error) {
    throw toOnDeviceError(error);
  }
}

/** Raw engine deltas with abort handling; failures map to typed causes. */
async function* rawOnDeviceDeltas(
  engine: OnDeviceEngineHandle,
  request: OnDeviceChatRequest,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  try {
    const completion = (await engine.chat.completions.create(
      request,
    )) as AsyncIterable<OnDeviceChatDelta>;
    for await (const chunk of completion) {
      if (signal?.aborted) {
        engine.interruptGenerate();
        throw abortError();
      }
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    }
  } catch (error) {
    // AbortError (name mismatch) passes through toOnDeviceError untouched.
    throw toOnDeviceError(error);
  }
}

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
    const engine = await acquireEngine(args.config.model);
    if (args.signal?.aborted) {
      throw abortError();
    }
    const request: OnDeviceChatRequest = {
      messages: toPlainMessages(args.messages),
      stream: true,
      max_tokens: ONDEVICE_MAX_COMPLETION_TOKENS,
      ...thinkingExtraBody(args.config.model),
    };
    yield* stripLeadingEmptyThinkStream(rawOnDeviceDeltas(engine, request, args.signal));
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
  const engine = await acquireEngine(config.model);
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
    ...thinkingExtraBody(config.model),
  };
  let response: OnDeviceChatCompletion;
  try {
    response = (await engine.chat.completions.create(request)) as OnDeviceChatCompletion;
  } catch (error) {
    throw toOnDeviceError(error);
  }
  const raw = response.choices?.[0]?.message?.content;
  const content = typeof raw === "string" ? stripLeadingEmptyThink(raw) : raw;
  if (typeof content !== "string" || content.trim() === "") {
    throw new LlmRequestError("On-device model returned an empty completion");
  }
  return content;
}
