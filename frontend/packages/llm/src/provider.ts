// The transport abstraction every chat backend implements: messages in, token
// deltas out. The OpenAI-compatible HTTP client satisfies this, so the router
// (`route.ts`) can dispatch without the prompt/sanitize path knowing the details.

import type { ChatMessage } from "./client";
import type { ProviderConfig } from "./config";

/**
 * Which chat backend a `ProviderConfig` selects:
 * - `openai-http`: any OpenAI-compatible HTTP endpoint (local Ollama, cloud).
 */
export type LlmEngine = "openai-http";

/** What every chat backend must satisfy: messages in, token deltas out. */
export interface ChatStreamProvider {
  readonly kind: LlmEngine;
  stream(args: {
    readonly config: ProviderConfig;
    readonly messages: readonly ChatMessage[];
    readonly signal?: AbortSignal;
  }): AsyncGenerator<string>;
}
