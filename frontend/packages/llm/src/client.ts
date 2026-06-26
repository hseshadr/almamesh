// OpenAI-compatible streaming chat client for in-browser narration.
//
// Talks to ANY OpenAI-compatible `/chat/completions` endpoint (local Ollama,
// llama.cpp, LM Studio, or — opt-in — OpenRouter) via `fetch` + SSE, yielding
// token deltas as they arrive. The privacy contract from `config.ts` is enforced
// BEFORE the request is built: a `local_only` config that does not resolve to a
// loopback/private endpoint throws `PrivacyViolationError` and nothing leaves
// the device.

import { ensurePrivacy, type ProviderConfig } from "./config";

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface StreamChatOptions {
  readonly config: ProviderConfig;
  readonly messages: readonly ChatMessage[];
  /** Abort the in-flight stream (wired to the UI cancel button). */
  readonly signal?: AbortSignal;
  /** Optional fetch override for testing; defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

/** Raised when the endpoint is unreachable or returns a non-2xx status. */
export class LlmRequestError extends Error {
  /** HTTP status of the failed response, when one was received. */
  public readonly status?: number;
  /** Truncated response body, surfaced so failures are diagnosable. */
  public readonly body?: string;

  constructor(message: string, opts?: { status?: number; body?: string }) {
    super(message);
    this.name = "LlmRequestError";
    this.status = opts?.status;
    this.body = opts?.body;
  }
}

/** Cap surfaced response bodies so a huge error page can't flood logs/UI. */
const MAX_ERROR_BODY_CHARS = 500;

/**
 * Read and truncate a failed response's body so the message is diagnosable
 * (e.g. OpenRouter's "No endpoints found for x/y"). Tolerant of a body-read
 * failure: returns `undefined` rather than masking the original HTTP error.
 */
async function readErrorBody(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    return text.slice(0, MAX_ERROR_BODY_CHARS);
  } catch {
    return undefined;
  }
}

/** Build a diagnosable LlmRequestError for a non-2xx response. */
async function requestErrorFor(response: Response): Promise<LlmRequestError> {
  const body = await readErrorBody(response);
  const suffix = body ? `: ${body}` : "";
  return new LlmRequestError(
    `LLM endpoint returned ${response.status} ${response.statusText}${suffix}`,
    { status: response.status, body },
  );
}

interface OpenAiDelta {
  readonly choices?: ReadonlyArray<{ readonly delta?: { readonly content?: string } }>;
}

interface OpenAiMessage {
  readonly choices?: ReadonlyArray<{ readonly message?: { readonly content?: string } }>;
}

function buildRequestBody(options: StreamChatOptions): string {
  return JSON.stringify({
    model: options.config.model,
    messages: options.messages,
    stream: true,
  });
}

/** Options for a single non-streaming JSON-object chat completion. */
export interface ChatCompletionJsonOptions {
  readonly config: ProviderConfig;
  readonly messages: readonly ChatMessage[];
  readonly signal?: AbortSignal;
  /** Optional fetch override for testing; defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

/** Strip a ```json … ``` (or plain ```) fence some models wrap JSON in. */
function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

/**
 * Run ONE non-streaming OpenAI-compatible chat completion that requests a JSON
 * object (`response_format: { type: "json_object" }`) and return the raw message
 * content string. Enforces the same fail-closed privacy gate as the streaming
 * path. Tolerant of ```json fences in the returned content (stripped here).
 */
export async function chatCompletionJson(
  options: ChatCompletionJsonOptions,
): Promise<string> {
  ensurePrivacy(options.config);

  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(joinUrl(options.config.baseUrl), {
    method: "POST",
    headers: buildHeaders(options.config),
    body: JSON.stringify({
      model: options.config.model,
      messages: options.messages,
      stream: false,
      response_format: { type: "json_object" },
    }),
    signal: options.signal,
  });
  if (!response.ok) {
    throw await requestErrorFor(response);
  }
  const payload = (await response.json()) as OpenAiMessage;
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new LlmRequestError("LLM endpoint returned an empty completion");
  }
  return stripJsonFence(content);
}

function buildHeaders(config: ProviderConfig): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }
  return headers;
}

function joinUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

/** Extract the token delta from one parsed SSE `data:` payload, if any. */
function deltaContent(payload: OpenAiDelta): string | null {
  return payload.choices?.[0]?.delta?.content ?? null;
}

/** Parse the `data:` lines in one SSE chunk, yielding token deltas. */
function* parseSseChunk(chunk: string): Generator<string> {
  for (const line of chunk.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) {
      continue;
    }
    const data = trimmed.slice("data:".length).trim();
    if (data === "" || data === "[DONE]") {
      continue;
    }
    const token = deltaContent(JSON.parse(data) as OpenAiDelta);
    if (token) {
      yield token;
    }
  }
}

async function openStream(options: StreamChatOptions): Promise<Response> {
  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(joinUrl(options.config.baseUrl), {
    method: "POST",
    headers: buildHeaders(options.config),
    body: buildRequestBody(options),
    signal: options.signal,
  });
  if (!response.ok || !response.body) {
    throw await requestErrorFor(response);
  }
  return response;
}

/**
 * Stream an OpenAI-compatible chat completion as an async iterable of token
 * deltas. Enforces the privacy contract first (fail-closed for `local_only`),
 * then streams `/chat/completions` with `stream: true`.
 */
export async function* streamChatCompletion(
  options: StreamChatOptions,
): AsyncGenerator<string> {
  // Privacy gate runs BEFORE any network call: nothing leaves the device unless
  // the endpoint satisfies the configured PrivacyMode.
  ensurePrivacy(options.config);

  const response = await openStream(options);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    // SSE events are separated by a blank line; process complete events only.
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      yield* parseSseChunk(event);
    }
  }
  // Flush any trailing buffered event (endpoints that omit the final blank line).
  if (buffer.trim() !== "") {
    yield* parseSseChunk(buffer);
  }
}
