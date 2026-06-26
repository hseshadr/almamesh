// The transport abstraction every chat backend implements: messages in, token
// deltas out. The OpenAI-compatible HTTP client satisfies this, so the router
// (`route.ts`) can dispatch on `engine` without the prompt/sanitize path knowing
// which one runs.

import type { ChatMessage } from "./client";
import type { ProviderConfig } from "./config";

/** Which chat backend a `ProviderConfig` selects. */
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
