/// <reference types="@cloudflare/workers-types" />

/**
 * POST /api/feedback — anonymous product-feedback collector.
 *
 * This is the ONE deliberate, isolated, NON-PERSONAL server touchpoint in an
 * otherwise zero-egress, local-first app. It records an anonymous "is this
 * valuable?" signal plus an optional "what's missing?" free-text suggestion.
 *
 * It stores ONLY: created_at, the page slug, a sentiment ('up'|'down'|null),
 * the optional free-text message, and an optional coarse app_version. It NEVER
 * stores IP address, user-agent, cookies, or any identifier. Cloudflare
 * Turnstile is the primary abuse defense.
 *
 * Bindings (configured on the Cloudflare Pages project — see
 * docs/feedback-setup.md):
 *   - env.DB:               D1 database binding named `DB` (table `feedback`).
 *   - env.TURNSTILE_SECRET: Turnstile secret key (Production). When absent
 *                           (local dev) Turnstile verification is skipped.
 */

interface Env {
  DB?: D1Database;
  TURNSTILE_SECRET?: string;
}

const PAGE_MAX = 64;
const MESSAGE_MAX = 2000;
const APP_VERSION_MAX = 32;
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

type Sentiment = 'up' | 'down' | null;

interface ValidatedFeedback {
  page: string;
  sentiment: Sentiment;
  message: string | null;
  appVersion: string | null;
}

interface ValidationError {
  error: string;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Validate + normalize the request body. Returns either the clean record or a 400 reason. */
function validate(raw: unknown, headerVersion: string | null): ValidatedFeedback | ValidationError {
  if (typeof raw !== 'object' || raw === null) return { error: 'invalid_body' };
  const body = raw as Record<string, unknown>;

  // page — required, non-empty, capped.
  const page = typeof body.page === 'string' ? body.page.trim() : '';
  if (page.length === 0) return { error: 'invalid_page' };
  if (page.length > PAGE_MAX) return { error: 'page_too_long' };

  // sentiment — 'up' | 'down' | null (undefined treated as null).
  let sentiment: Sentiment;
  const s = body.sentiment;
  if (s === undefined || s === null) sentiment = null;
  else if (s === 'up' || s === 'down') sentiment = s;
  else return { error: 'invalid_sentiment' };

  // message — optional free text; trim, cap, reject if absurdly long.
  let message: string | null = null;
  const m = body.message;
  if (m !== undefined && m !== null) {
    if (typeof m !== 'string') return { error: 'invalid_message' };
    if (m.length > MESSAGE_MAX) return { error: 'message_too_long' };
    const trimmed = m.trim();
    message = trimmed.length === 0 ? null : trimmed;
  }

  // Nothing to record? (no sentiment AND no message) — reject.
  if (sentiment === null && message === null) return { error: 'empty' };

  // app_version — optional, from body or the X-App-Version header. Coarse only.
  const appVersion = pickAppVersion(body.appVersion, headerVersion);

  return { page, sentiment, message, appVersion };
}

function pickAppVersion(bodyVersion: unknown, headerVersion: string | null): string | null {
  const candidate =
    typeof bodyVersion === 'string' && bodyVersion.trim().length > 0 ? bodyVersion : (headerVersion ?? '');
  const trimmed = candidate.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, APP_VERSION_MAX);
}

/**
 * Verify the Turnstile token against Cloudflare's siteverify endpoint.
 * Deliberately does NOT send the visitor IP (remoteip) — privacy first.
 * A missing/empty token, a non-success verdict, or any network error => false.
 */
async function turnstilePasses(token: unknown, secret: string): Promise<boolean> {
  if (typeof token !== 'string' || token.trim().length === 0) return false;
  const form = new URLSearchParams();
  form.append('secret', secret);
  form.append('response', token);
  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, { method: 'POST', body: form });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // 1. Parse JSON body.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }

  // 2. Validate + normalize.
  const result = validate(raw, request.headers.get('x-app-version'));
  if ('error' in result) {
    return json(400, { ok: false, error: result.error });
  }

  // 3. Turnstile — primary abuse defense. Skipped only when no secret is
  //    configured (local dev); NEVER skipped when the secret is present.
  if (env.TURNSTILE_SECRET) {
    const token = (raw as Record<string, unknown>).turnstileToken;
    const ok = await turnstilePasses(token, env.TURNSTILE_SECRET);
    if (!ok) return json(403, { ok: false, error: 'turnstile' });
  }

  // 4. Persist to D1. A missing binding is a deploy-config error, not user error.
  if (!env.DB) {
    console.error('[feedback] D1 binding "DB" is not configured — see docs/feedback-setup.md');
    return json(500, { ok: false, error: 'storage_unavailable' });
  }

  try {
    await env.DB.prepare(
      'INSERT INTO feedback (created_at, page, sentiment, message, app_version) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(new Date().toISOString(), result.page, result.sentiment, result.message, result.appVersion)
      .run();
  } catch (err) {
    console.error('[feedback] D1 insert failed:', err);
    return json(500, { ok: false, error: 'storage_error' });
  }

  return json(200, { ok: true });
};
