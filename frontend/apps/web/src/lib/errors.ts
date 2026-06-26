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
