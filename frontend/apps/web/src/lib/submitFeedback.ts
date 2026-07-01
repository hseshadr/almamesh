/**
 * submitFeedback — the tiny POST client for the anonymous product-feedback
 * widget. It carries NO identity: the body is exactly the function contract
 * `{ page, sentiment, message?, turnstileToken }` and nothing else (no cookies,
 * no user id, no tracking). The matching Cloudflare Pages Function lives in
 * `functions/api/feedback` and verifies the Turnstile token server-side.
 *
 * The function is total: it never throws. Network failures and every non-2xx
 * status are mapped to a typed `FeedbackResult` so the UI can branch on a small,
 * exhaustive set of reasons instead of parsing error bodies.
 */

/** Thumbs sentiment — `null` means the user only left a written note. */
export type FeedbackSentiment = 'up' | 'down' | null;

/** The exact JSON contract the `/api/feedback` function expects. */
export interface FeedbackPayload {
  /** Stable identifier for the surface the feedback was given on (e.g. 'dashboard'). */
  page: string;
  sentiment: FeedbackSentiment;
  /** Optional free-text note. Omit (or send null) when empty. */
  message?: string | null;
  /** Cloudflare Turnstile token, or 'dev' when no site key is configured. */
  turnstileToken: string;
}

/** Why a submission failed — a closed set the UI can switch on. */
export type FeedbackFailureReason = 'bad_request' | 'forbidden' | 'rate_limited' | 'error';

export type FeedbackResult =
  | { ok: true }
  | { ok: false; status: number; reason: FeedbackFailureReason };

const FEEDBACK_ENDPOINT = '/api/feedback';

/**
 * The app version, injected at build time by Vite `define` (see vite.config.ts)
 * from `package.json`. Outside a production build — unit tests, `vite dev` — the
 * global is absent, so we fall back to `'dev'` (mirrors the `'dev'` turnstile
 * token). Read per-call so tests can stub it. The server records this verbatim
 * as `app_version`, letting feedback be correlated to the release it came from.
 */
declare const __APP_VERSION__: string | undefined;

function appVersion(): string {
  return typeof __APP_VERSION__ === 'string' && __APP_VERSION__.length > 0 ? __APP_VERSION__ : 'dev';
}

function reasonForStatus(status: number): FeedbackFailureReason {
  if (status === 400) return 'bad_request';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate_limited';
  return 'error';
}

export async function submitFeedback(payload: FeedbackPayload): Promise<FeedbackResult> {
  try {
    const response = await fetch(FEEDBACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Version': appVersion() },
      body: JSON.stringify(payload),
    });
    if (response.ok) return { ok: true };
    return { ok: false, status: response.status, reason: reasonForStatus(response.status) };
  } catch {
    // Offline / DNS / CORS — never surface a raw throw to the caller.
    return { ok: false, status: 0, reason: 'error' };
  }
}
