/**
 * Unit tests for the anonymous product-feedback Pages Function.
 *
 * The handler is the ONE deliberate, isolated server touchpoint in an
 * otherwise zero-egress, local-first app. These tests pin the contract the
 * frontend widget depends on:
 *   POST /api/feedback
 *   body { page, sentiment: 'up'|'down'|null, message?, turnstileToken }
 *   -> 200 {ok:true} | 400 {ok:false,error} | 403 {ok:false,error:'turnstile'} | 500
 *
 * NOTE: this test lives outside `src/` so it is not picked up by the app's
 * default `vitest run` (include: src/**). It is run via the dedicated config
 * documented in docs/feedback-setup.md (and exercised during development with
 * `vitest run --config <functions config>`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { onRequestPost } from '../feedback';

/** A fake D1 prepared-statement chain that records what was bound + run. */
function makeFakeDb() {
  const run = vi.fn().mockResolvedValue({ success: true, meta: {} });
  const bind = vi.fn(() => ({ run }));
  const prepare = vi.fn(() => ({ bind }));
  return { prepare, bind, run };
}

type FakeBody = {
  page?: unknown;
  sentiment?: unknown;
  message?: unknown;
  turnstileToken?: unknown;
  appVersion?: unknown;
};

/** Build a minimal Pages-Function context with a JSON POST request. */
function makeContext(body: FakeBody, env: Record<string, unknown>, headers: Record<string, string> = {}) {
  const request = new Request('https://almamesh.com/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  // The handler only reads `request` and `env`.
  return { request, env } as unknown as Parameters<typeof onRequestPost>[0];
}

const validBody: FakeBody = {
  page: '/dashboard',
  sentiment: 'up',
  message: 'love the chart',
  turnstileToken: 'tok-123',
};

describe('POST /api/feedback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('inserts a valid feedback row and returns 200 {ok:true} (dev fallback, no Turnstile secret)', async () => {
    const db = makeFakeDb();
    const ctx = makeContext(validBody, { DB: { prepare: db.prepare } });

    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(db.prepare).toHaveBeenCalledTimes(1);
    // INSERT bound args: created_at(ISO), page, sentiment, message, app_version
    const boundArgs = db.bind.mock.calls[0];
    expect(boundArgs[1]).toBe('/dashboard'); // page
    expect(boundArgs[2]).toBe('up'); // sentiment
    expect(boundArgs[3]).toBe('love the chart'); // message
    expect(typeof boundArgs[0]).toBe('string'); // created_at ISO
    expect(() => new Date(boundArgs[0] as string).toISOString()).not.toThrow();
    expect(db.run).toHaveBeenCalledTimes(1);
  });

  it('verifies Turnstile when the secret is present and inserts on success', async () => {
    const db = makeFakeDb();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const ctx = makeContext(validBody, { DB: { prepare: db.prepare }, TURNSTILE_SECRET: 'sekret' });

    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(db.run).toHaveBeenCalledTimes(1);
  });

  it('returns 403 {error:turnstile} when Turnstile verification fails', async () => {
    const db = makeFakeDb();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), { status: 200 }),
    );
    const ctx = makeContext(validBody, { DB: { prepare: db.prepare }, TURNSTILE_SECRET: 'sekret' });

    const res = await onRequestPost(ctx);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: 'turnstile' });
    expect(db.run).not.toHaveBeenCalled();
  });

  it('returns 403 when the Turnstile secret is present but the token is missing', async () => {
    const db = makeFakeDb();
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const ctx = makeContext(
      { page: '/dashboard', sentiment: 'up', message: null, turnstileToken: '' },
      { DB: { prepare: db.prepare }, TURNSTILE_SECRET: 'sekret' },
    );

    const res = await onRequestPost(ctx);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: 'turnstile' });
    expect(fetchMock).not.toHaveBeenCalled(); // no token => no point calling siteverify
    expect(db.run).not.toHaveBeenCalled();
  });

  it('returns 400 when the page field is missing/empty', async () => {
    const db = makeFakeDb();
    const ctx = makeContext({ ...validBody, page: '   ' }, { DB: { prepare: db.prepare } });

    const res = await onRequestPost(ctx);

    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(false);
    expect(db.run).not.toHaveBeenCalled();
  });

  it('returns 400 when the page field is absurdly long (> 64 chars)', async () => {
    const db = makeFakeDb();
    const ctx = makeContext({ ...validBody, page: 'x'.repeat(65) }, { DB: { prepare: db.prepare } });

    const res = await onRequestPost(ctx);

    expect(res.status).toBe(400);
    expect(db.run).not.toHaveBeenCalled();
  });

  it('returns 400 when the message is absurdly long (> 2000 chars)', async () => {
    const db = makeFakeDb();
    const ctx = makeContext(
      { page: '/x', sentiment: null, message: 'm'.repeat(2001), turnstileToken: 't' },
      { DB: { prepare: db.prepare } },
    );

    const res = await onRequestPost(ctx);

    expect(res.status).toBe(400);
    expect(db.run).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid sentiment value', async () => {
    const db = makeFakeDb();
    const ctx = makeContext({ ...validBody, sentiment: 'meh' }, { DB: { prepare: db.prepare } });

    const res = await onRequestPost(ctx);

    expect(res.status).toBe(400);
    expect(db.run).not.toHaveBeenCalled();
  });

  it('returns 400 when there is nothing to record (no sentiment and empty message)', async () => {
    const db = makeFakeDb();
    const ctx = makeContext(
      { page: '/dashboard', sentiment: null, message: '   ', turnstileToken: 't' },
      { DB: { prepare: db.prepare } },
    );

    const res = await onRequestPost(ctx);

    expect(res.status).toBe(400);
    expect(db.run).not.toHaveBeenCalled();
  });

  it('accepts a sentiment-only submission with no message', async () => {
    const db = makeFakeDb();
    const ctx = makeContext(
      { page: '/dashboard', sentiment: 'down', message: null, turnstileToken: 't' },
      { DB: { prepare: db.prepare } },
    );

    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    const boundArgs = db.bind.mock.calls[0];
    expect(boundArgs[2]).toBe('down'); // sentiment
    expect(boundArgs[3]).toBeNull(); // message stored as NULL
  });

  it('returns 400 on malformed JSON', async () => {
    const db = makeFakeDb();
    const request = new Request('https://almamesh.com/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    const ctx = { request, env: { DB: { prepare: db.prepare } } } as unknown as Parameters<typeof onRequestPost>[0];

    const res = await onRequestPost(ctx);

    expect(res.status).toBe(400);
    expect(db.run).not.toHaveBeenCalled();
  });

  it('returns 500 when the D1 binding is missing', async () => {
    const ctx = makeContext(validBody, {}); // no DB binding

    const res = await onRequestPost(ctx);

    expect(res.status).toBe(500);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(false);
  });

  it('records app_version from the X-App-Version header when not in the body', async () => {
    const db = makeFakeDb();
    const ctx = makeContext(
      { page: '/dashboard', sentiment: 'up', turnstileToken: 't' },
      { DB: { prepare: db.prepare } },
      { 'x-app-version': '0.3.0' },
    );

    const res = await onRequestPost(ctx);

    expect(res.status).toBe(200);
    const boundArgs = db.bind.mock.calls[0];
    expect(boundArgs[4]).toBe('0.3.0'); // app_version
  });

  it('does NOT store IP or user-agent (only the 5 declared columns are bound)', async () => {
    const db = makeFakeDb();
    const ctx = makeContext(validBody, { DB: { prepare: db.prepare } }, { 'cf-connecting-ip': '203.0.113.7', 'user-agent': 'secret-agent' });

    await onRequestPost(ctx);

    const boundArgs = db.bind.mock.calls[0];
    expect(boundArgs).toHaveLength(5); // created_at, page, sentiment, message, app_version — nothing else
    expect(JSON.stringify(boundArgs)).not.toContain('203.0.113.7');
    expect(JSON.stringify(boundArgs)).not.toContain('secret-agent');
  });
});
