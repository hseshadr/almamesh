// The single provider-dispatch seam. `routeChatCompletion` (streaming) and
// `routeCompletionJson` (one-shot JSON) branch on `config.engine`, so callers
// (and the prompt/sanitize pipeline upstream) never do. Sanitization happens
// before these functions in `index.ts`; this layer only routes already-built
// messages.
//
// Engines:
//   - "openai-http": delegates verbatim to the HTTP client (which runs its own
//     `ensurePrivacy` fail-closed gate before any network call). Byte-identical
//     to the pre-Spec-063 behavior — the JSON path ignores `schema`.
//   - "webllm": the on-device provider (Spec 063). Zero network; JSON
//     completions are xgrammar-enforced when a `schema` is given. NOTE: the
//     webllm module here is the thin provider shim — the heavy `@mlc-ai/web-llm`
//     library itself loads only via dynamic import at first real use.

import { chatCompletionJson, streamChatCompletion, type ChatMessage } from "./client";
import type { ProviderConfig } from "./config";
import { webLlmChatProvider, webLlmCompletionJson } from "./webllm/provider";

export interface RouteChatOptions {
  readonly config: ProviderConfig;
  readonly messages: readonly ChatMessage[];
  readonly signal?: AbortSignal;
  /** OpenAI-HTTP path only; defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Route a chat completion to the configured engine.
 *
 * - `webllm`: streams from the on-device WebGPU engine — nothing leaves the
 *   device.
 * - `openai-http`: delegates verbatim to `streamChatCompletion` (which runs its
 *   own `ensurePrivacy` fail-closed gate before any network call).
 */
export async function* routeChatCompletion(
  options: RouteChatOptions,
): AsyncGenerator<string> {
  if (options.config.engine === "webllm") {
    yield* webLlmChatProvider.stream({
      config: options.config,
      messages: options.messages,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    return;
  }
  yield* streamChatCompletion({
    config: options.config,
    messages: options.messages,
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
}

export interface RouteCompletionJsonOptions {
  readonly config: ProviderConfig;
  readonly messages: readonly ChatMessage[];
  readonly signal?: AbortSignal;
  /** OpenAI-HTTP path only; defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
  /**
   * JSON schema for engines with grammar-constrained decoding: the on-device
   * engine enforces it via xgrammar. The `openai-http` path IGNORES it — its
   * request body stays byte-identical to the legacy `chatCompletionJson`.
   */
  readonly schema?: Record<string, unknown>;
}

/**
 * Route a one-shot JSON-object completion to the configured engine and return
 * the raw message content string.
 */
export async function routeCompletionJson(
  options: RouteCompletionJsonOptions,
): Promise<string> {
  if (options.config.engine === "webllm") {
    return webLlmCompletionJson(
      options.config,
      options.messages,
      options.schema,
      options.signal,
    );
  }
  return chatCompletionJson({
    config: options.config,
    messages: options.messages,
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
}
