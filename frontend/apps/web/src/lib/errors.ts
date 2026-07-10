/**
 * Centralized error handling utility
 *
 * Security: Internal error details should NEVER be exposed to users.
 * Instead, show generic user-friendly messages with error codes that can
 * be used by support to diagnose issues.
 *
 * Actual error details are logged to console for developer debugging.
 *
 * i18n: this is a plain (non-React) module, so user-facing strings are resolved
 * through the shared app i18n instance (the `errors` namespace) rather than
 * `useTranslation`. The active language follows the persisted language store,
 * exactly like the React surfaces, so error text is localized offline too.
 */

import i18n from '../i18n/config';

/**
 * Error codes for internal reference / support correlation. The codes
 * themselves are stable identifiers (logged + shown to the user); their
 * human-readable descriptions are localized via `ERROR_CODES(code)`.
 */
export type ErrorCode =
  // Chart generation errors (CHART_xxx)
  | 'CHART_GEN_001'
  | 'CHART_UPDATE_001'
  // Rectification errors (RECT_xxx)
  | 'RECT_001'
  // Q&A errors (QA_xxx)
  | 'QA_001'
  // Generic errors
  | 'UNKNOWN_001'
  // Engine readiness (transient, retryable). The in-browser Pyodide engine
  // bootstraps asynchronously; chart generation attempted before it is warm is
  // a transient race, NOT a compute failure — surface a distinct, retryable
  // message rather than the generic CHART_GEN_001.
  | 'ENGINE_WARMING';

/**
 * Localized human-readable description for an error code (e.g. "Chart
 * generation failed"). Resolved in the active language from the `errors:codes`
 * catalog; falls back to English offline. Use for developer-facing labels and
 * logging context, not as the primary user message (use the helpers below).
 */
export function ERROR_CODES(code: ErrorCode): string {
  return i18n.t(`errors:codes.${code}`);
}

/**
 * Get a user-friendly error message with error code.
 * The actual error is logged to console but never shown to users.
 *
 * @param code - The error code for tracking
 * @param actualError - The actual error (logged to console, never shown to user)
 * @param context - Optional context for logging
 * @returns User-friendly error message with error code
 */
export function getUserFriendlyError(
  code: ErrorCode,
  actualError?: unknown,
  context?: string
): string {
  // Log the actual error for developers
  if (actualError) {
    console.error(`[${code}]${context ? ` ${context}:` : ''}`, actualError);
  }

  return i18n.t('errors:generic', { code });
}

/**
 * A model-not-found failure from an OpenAI-compatible endpoint — surfaced as an
 * actionable "switch model / check AI settings" prompt instead of a raw error
 * body, since retrying the same dead model just loops. Shared by the reading
 * card (Dashboard) and the chat error mapper. OpenRouter reports this two ways:
 * the legacy HTTP 404 "No endpoints found for <model>" (retired model), and —
 * verified live 2026-07-03 — HTTP 400 "<slug> is not a valid model ID" for a
 * typo'd slug, which is the more common user error.
 */
export function isModelUnavailableMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('no endpoints found') ||
    m.includes('model_not_found') ||
    m.includes('is not a valid model id') ||
    (m.includes('404') && m.includes('model'))
  );
}

/**
 * An exhausted-balance failure from a paid provider — HTTP 402 or an
 * "insufficient credits" body (live-verified against OpenRouter 2026-07-03:
 * a valid key on an account with usage ≥ credits gets 402 on every call).
 * Retrying or switching endpoints can never fix a billing problem, so this
 * must map to billing copy, not the generic "check your model" advice.
 */
export function isInsufficientCreditsMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('insufficient credits') ||
    m.includes('requires more credits') ||
    m.includes('payment required') ||
    /\breturned 402\b/.test(m)
  );
}

/**
 * An authentication failure from a cloud provider — HTTP 401/403. The key is
 * missing, malformed, or rejected; retrying is pointless until the key is fixed,
 * so this maps to "check your API key", never the generic model advice.
 */
export function isAuthError(status: number | undefined): boolean {
  return status === 401 || status === 403;
}

/** The distinct ways a save-time connectivity probe can fail. */
export type ConnectionErrorKind =
  | 'credits'
  | 'auth'
  | 'model'
  | 'privacy'
  | 'rate_limited'
  | 'server'
  | 'network'
  | 'unknown';

/**
 * Classify a caught connectivity-test error (from `testProviderConnection`) into
 * one actionable kind, so the settings UI can show a specific fix instead of a
 * raw error body. Duck-typed (reads `.status` / `.name` / `.message`) so it works
 * across the @almamesh/llm module boundary without `instanceof` coupling. Order
 * matters: billing (402) is checked before auth, and auth before model, because a
 * 402 body can also mention the model and a rejected key must not read as "bad
 * model". Rate limiting (429) and provider outages (5xx) are checked next — both
 * are transient and out of the user's control, so they must not fall into the
 * useless "check your settings" `unknown` bucket. A `fetch` failure has no HTTP
 * status → `network`.
 */
export function classifyConnectionError(err: unknown): ConnectionErrorKind {
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';
  const rawStatus = (err as { status?: unknown } | null)?.status;
  const status = typeof rawStatus === 'number' ? rawStatus : undefined;

  if (name === 'PrivacyViolationError') {
    return 'privacy';
  }
  if (status === 402 || isInsufficientCreditsMessage(message)) {
    return 'credits';
  }
  if (isAuthError(status)) {
    return 'auth';
  }
  if (status === 404 || isModelUnavailableMessage(message)) {
    return 'model';
  }
  if (status === 429) {
    return 'rate_limited';
  }
  if (status !== undefined && status >= 500) {
    return 'server';
  }
  // No HTTP status = the request never reached the endpoint (DNS, connection
  // refused, CORS, offline). Match on the message `fetch`'s TypeError carries —
  // "Failed to fetch" (Chrome) / "Load failed" (Safari) / "NetworkError"
  // (Firefox) — NOT the bare `TypeError` name, so a non-network code-bug
  // TypeError falls through to `unknown` (and stays visible in the logs) instead
  // of masquerading as unreachable. Mirrors the interpretation path's
  // NETWORK_FAILURE_PATTERN.
  if (status === undefined && /failed to fetch|load failed|networkerror|network error|unreachable/i.test(message)) {
    return 'network';
  }
  return 'unknown';
}

/** Cap the surfaced connection-error detail so a huge body can't flood the UI. */
const MAX_DETAIL_CHARS = 200;

/**
 * Extract a short, human-readable detail from a caught connectivity-test error —
 * the PROVIDER'S OWN reason (e.g. "Expected a value >= 16, but got 1 instead.")
 * — so an otherwise-unclassifiable failure (`unknown`: a 400/429/5xx or an
 * exotic fetch error) is never a blind dead-end. Prefers the structured
 * `error.message` from an OpenAI/OpenRouter JSON error body; falls back to the
 * raw body, then the error message. Returns `undefined` when there's nothing
 * useful. This is the endpoint's response to a connection TEST the user
 * triggered — surfacing it is honest and actionable, not an internal leak (a key
 * never appears in a provider error body).
 */
export function connectionErrorDetail(err: unknown): string | undefined {
  const body = (err as { body?: unknown } | null)?.body;
  const raw =
    typeof body === 'string' && body.trim()
      ? body
      : err instanceof Error
        ? err.message
        : '';
  if (!raw.trim()) {
    return undefined;
  }
  let text = raw;
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: unknown }; message?: unknown };
    const msg = parsed?.error?.message ?? parsed?.message;
    if (typeof msg === 'string' && msg.trim()) {
      text = msg;
    }
  } catch {
    // Not JSON — surface the raw text as-is.
  }
  const cleaned = text.replace(/\s+/g, ' ').trim().slice(0, MAX_DETAIL_CHARS);
  return cleaned || undefined;
}

/**
 * Get a user-friendly error message for chat/Q&A errors.
 * These are shown inline in the chat interface.
 */
export function getChatErrorMessage(code: ErrorCode, actualError?: unknown): string {
  console.error(`[${code}] Chat error:`, actualError);

  return i18n.t('errors:chat', { code });
}

/**
 * Get a user-friendly message for the transient "engine still warming up"
 * condition. Unlike the generic getUserFriendlyError, this is explicitly
 * retryable: the on-device Pyodide engine simply has not finished bootstrapping
 * yet, so the right action is to wait a moment and try again — not to report a
 * compute failure.
 */
export function getEngineWarmingMessage(actualError?: unknown): string {
  console.error(`[ENGINE_WARMING] Engine not ready:`, actualError);

  return i18n.t('errors:engine_warming');
}
