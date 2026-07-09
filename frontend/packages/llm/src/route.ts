// The single provider-dispatch seam. `routeChatCompletion` (streaming) and
// `routeCompletionJson` (one-shot JSON) delegate to the OpenAI-compatible HTTP
// client (which runs its own `ensurePrivacy` fail-closed gate before any network
// call). Sanitization happens before these functions in `index.ts`; this layer
// only routes already-built messages.

import { chatCompletionJson, streamChatCompletion, type ChatMessage } from "./client";
import type { ProviderConfig } from "./config";

export interface RouteChatOptions {
  readonly config: ProviderConfig;
  readonly messages: readonly ChatMessage[];
  readonly signal?: AbortSignal;
  /** Defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Route a chat completion to the OpenAI-compatible HTTP client, which runs its
 * own `ensurePrivacy` fail-closed gate before any network call.
 */
export async function* routeChatCompletion(
  options: RouteChatOptions,
): AsyncGenerator<string> {
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
  /** Defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Route a one-shot JSON-object completion to the OpenAI-compatible HTTP client
 * and return the raw message content string.
 */
export async function routeCompletionJson(
  options: RouteCompletionJsonOptions,
): Promise<string> {
  return chatCompletionJson({
    config: options.config,
    messages: options.messages,
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
}
