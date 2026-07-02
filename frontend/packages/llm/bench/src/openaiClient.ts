// Minimal OpenAI-compatible non-streaming client for the bench harness.
//
// Deliberately separate from src/client.ts: the bench needs usage stats,
// latency, retry/backoff accounting, and Qwen3 thinking-mode handling that
// the product client rightly does not carry. The PROMPTS are still the real
// ones (imported from src); only the transport is bench-owned.

import type { ChatMessage } from "../../src/client";

export type FetchLike = typeof fetch;

export interface BenchClientOptions {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey?: string;
  readonly maxTokens: number;
  readonly temperature?: number;
  /** Retries on network errors / 429 / 5xx. 4xx (401/404/...) never retries. */
  readonly retries?: number;
  readonly backoffMs?: number;
  readonly fetchBase: FetchLike;
}

export interface BenchCompletion {
  readonly content: string;
  readonly completionTokens: number | null;
  readonly promptTokens: number | null;
  readonly ms: number;
  /** True when a <think>...</think> block was present and stripped. */
  readonly thinkStripped: boolean;
  readonly retriesUsed: number;
}

export class BenchRequestError extends Error {
  public readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = "BenchRequestError";
    this.status = status;
  }
}

/** Qwen3 soft switch: /no_think in the last user turn disables thinking mode. */
export function isQwen3Slug(model: string): boolean {
  return /qwen-?3/i.test(model);
}

export function appendNoThink(messages: readonly ChatMessage[]): ChatMessage[] {
  const out = [...messages];
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role === "user") {
      out[i] = { role: "user", content: `${out[i].content}\n/no_think` };
      break;
    }
  }
  return out;
}

/** Strip <think>...</think> blocks (and an unclosed trailing <think>). */
export function stripThink(content: string): { text: string; hadThink: boolean } {
  const hadThink = /<think>/i.test(content);
  const text = content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .trim();
  return { text, hadThink };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface OpenAiResponse {
  readonly choices?: ReadonlyArray<{ readonly message?: { readonly content?: string } }>;
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
  };
}

/**
 * One non-streaming chat completion with retry/backoff, latency and usage
 * accounting. Qwen3 models get `/no_think` appended and any think blocks
 * stripped before the content is returned.
 */
export async function benchChatCompletion(
  options: BenchClientOptions,
  messages: readonly ChatMessage[],
): Promise<BenchCompletion> {
  const retries = options.retries ?? 2;
  const backoffMs = options.backoffMs ?? 1500;
  const finalMessages = isQwen3Slug(options.model) ? appendNoThink(messages) : messages;
  const url = `${options.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.apiKey) {
    headers.Authorization = `Bearer ${options.apiKey}`;
  }
  const body = JSON.stringify({
    model: options.model,
    messages: finalMessages,
    stream: false,
    max_tokens: options.maxTokens,
    temperature: options.temperature ?? 0.2,
  });

  let lastError: BenchRequestError | null = null;
  const t0 = Date.now();
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await sleep(backoffMs * 2 ** (attempt - 1));
    }
    let response: Response;
    try {
      response = await options.fetchBase(url, { method: "POST", headers, body });
    } catch (err) {
      lastError = new BenchRequestError(`network error: ${String(err)}`, null);
      continue;
    }
    if (!response.ok) {
      const excerpt = (await response.text().catch(() => "")).slice(0, 200);
      const error = new BenchRequestError(
        `HTTP ${response.status}: ${excerpt}`,
        response.status,
      );
      if (response.status === 429 || response.status >= 500) {
        lastError = error;
        continue; // retryable
      }
      throw error; // 401/403/404 — retrying will not help
    }
    const payload = (await response.json()) as OpenAiResponse;
    const raw = payload.choices?.[0]?.message?.content;
    if (typeof raw !== "string" || raw.trim() === "") {
      lastError = new BenchRequestError("empty completion", response.status);
      continue;
    }
    const { text, hadThink } = stripThink(raw);
    return {
      content: text,
      completionTokens: payload.usage?.completion_tokens ?? null,
      promptTokens: payload.usage?.prompt_tokens ?? null,
      ms: Date.now() - t0,
      thinkStripped: hadThink,
      retriesUsed: attempt,
    };
  }
  throw lastError ?? new BenchRequestError("exhausted retries", null);
}

/** Rough token estimate for spend guarding when the endpoint omits usage. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
