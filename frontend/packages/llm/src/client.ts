// OpenAI-compatible streaming chat client for in-browser narration.
//
// Talks to ANY OpenAI-compatible `/chat/completions` endpoint (local Ollama,
// llama.cpp, LM Studio, or — opt-in — OpenRouter) via `fetch` + SSE, yielding
// token deltas as they arrive. The privacy contract from `config.ts` is enforced
// BEFORE the request is built: a `local_only` config that does not resolve to a
// loopback/private endpoint throws `PrivacyViolationError` and nothing leaves
// the device.

import { ensurePrivacy, OPENROUTER_API_BASE, type ProviderConfig } from "./config";

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
  const response = await doFetch(joinUrl(requireBaseUrl(options.config)), {
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

/** Options for a save-time connectivity probe. */
export interface TestConnectionOptions {
  readonly config: ProviderConfig;
  readonly signal?: AbortSignal;
  /** Optional fetch override for testing; defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Probe a provider with a single 1-token, non-streaming chat completion — the
 * cheapest request that validates endpoint reachability + auth + model id in one
 * shot, on the EXACT path the real reading uses. Resolves on 2xx; otherwise
 * throws the SAME typed errors the reading would hit, so the settings UI can give
 * an honest, specific verdict the moment the user saves:
 *   - `PrivacyViolationError` — the fail-closed gate (local_only vs a cloud host).
 *   - `LlmRequestError` (carrying `.status`) — a non-2xx response (401/403 bad
 *     key, 402 out of credits, 404/400 bad model, …).
 *   - a `fetch` `TypeError` — the endpoint was unreachable (DNS, refused, offline).
 *
 * Chosen over `GET /models`: OpenRouter serves that unauthenticated and never
 * validates the model, so a bad key or typo'd slug would falsely pass.
 */
export async function testProviderConnection(options: TestConnectionOptions): Promise<void> {
  // Fail-closed BEFORE any network call — same contract as the streaming path.
  ensurePrivacy(options.config);

  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(joinUrl(requireBaseUrl(options.config)), {
    method: "POST",
    headers: buildHeaders(options.config),
    body: JSON.stringify({
      model: options.config.model,
      messages: [{ role: "user", content: "ping" }],
      stream: false,
      max_tokens: 1,
    }),
    signal: options.signal,
  });
  if (!response.ok) {
    throw await requestErrorFor(response);
  }
}

/** The account balance OpenRouter reports (USD credits, not a token count). */
export interface OpenRouterCredits {
  /** Total credits ever granted/purchased on the account, in USD. */
  readonly totalCredits: number;
  /** Total credits spent to date, in USD. */
  readonly totalUsage: number;
  /** `totalCredits − totalUsage` — the spendable balance, in USD. */
  readonly remaining: number;
}

interface OpenRouterCreditsResponse {
  readonly data?: {
    readonly total_credits?: number;
    readonly total_usage?: number;
  };
}

/** Options for reading the OpenRouter account balance. */
export interface FetchCreditsOptions {
  readonly config: ProviderConfig;
  readonly signal?: AbortSignal;
  /** Optional fetch override for testing; defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Read the OpenRouter account balance via `GET {baseUrl}/credits` (authenticated
 * with the same Bearer key the reading uses). Returns USD credits — OpenRouter
 * does NOT expose a token count — as `{ totalCredits, totalUsage, remaining }`.
 *
 * OpenRouter-ONLY by contract, enforced fail-closed HERE (not just by the caller):
 * the endpoint MUST be OpenRouter's — a key is never sent to a local/loopback or
 * a bring-your-own host, mirroring the `ensurePrivacy` gate in
 * `testProviderConnection`. On a non-2xx (401 bad key, 402 no credits) it throws
 * the same typed `LlmRequestError` the reading path uses, so the UI can classify
 * the failure with `classifyConnectionError`.
 */
export async function fetchOpenRouterCredits(
  options: FetchCreditsOptions,
): Promise<OpenRouterCredits> {
  const baseUrl = requireBaseUrl(options.config);
  // Fail-closed: this is an OpenRouter-account read; refuse to send the key
  // anywhere else even if a caller forgot to gate. Defense-in-depth for the
  // "no key to loopback/BYO" invariant.
  if (!baseUrl.startsWith(OPENROUTER_API_BASE)) {
    throw new LlmRequestError(
      `Credits are only available for OpenRouter (endpoint was ${baseUrl})`,
    );
  }
  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(creditsUrl(baseUrl), {
    method: "GET",
    headers: buildHeaders(options.config),
    signal: options.signal,
  });
  if (!response.ok) {
    throw await requestErrorFor(response);
  }
  let payload: OpenRouterCreditsResponse;
  try {
    payload = (await response.json()) as OpenRouterCreditsResponse;
  } catch {
    // A 2xx with a non-JSON body still breaks the contract — surface it as the
    // typed error the docstring promises, not a raw SyntaxError.
    throw new LlmRequestError("OpenRouter credits response was not valid JSON");
  }
  const totalCredits = payload.data?.total_credits;
  const totalUsage = payload.data?.total_usage;
  if (typeof totalCredits !== "number" || typeof totalUsage !== "number") {
    throw new LlmRequestError("OpenRouter credits response was malformed");
  }
  return { totalCredits, totalUsage, remaining: totalCredits - totalUsage };
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

/** OpenRouter's account-balance endpoint, off the same `{baseUrl}` (…/api/v1). */
function creditsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/credits`;
}

/**
 * The HTTP transport needs an endpoint. A config always carries a `baseUrl`, but
 * an empty string is guarded here so a misconfiguration is a clean, diagnosable
 * error rather than a URL crash.
 */
function requireBaseUrl(config: ProviderConfig): string {
  if (!config.baseUrl) {
    throw new LlmRequestError("No OpenAI-compatible base URL configured");
  }
  return config.baseUrl;
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
  const response = await doFetch(joinUrl(requireBaseUrl(options.config)), {
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
