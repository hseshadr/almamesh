// The single provider-dispatch seam: `routeChatCompletion` yields the
// `AsyncGenerator<string>` of token deltas the OpenAI-compatible HTTP transport
// produces, so callers (and the prompt/sanitize pipeline upstream) never branch
// on engine. Sanitization happens before this function in `index.ts`; this layer
// only routes already-built messages.

import { streamChatCompletion, type ChatMessage } from "./client";
import type { ProviderConfig } from "./config";

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
 * - `openai-http`: delegates verbatim to `streamChatCompletion` (which runs its
 *   own `ensurePrivacy` fail-closed gate before any network call).
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
