import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { submitFeedback, type FeedbackPayload } from '../submitFeedback';

const PAYLOAD: FeedbackPayload = {
  page: 'dashboard',
  sentiment: 'up',
  message: 'More divisional charts please',
  turnstileToken: 'tok-123',
};

function mockFetchResponse(status: number): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve({ ok: status === 200 }),
  }) as unknown as typeof fetch;
}

describe('submitFeedback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('POSTs the exact contract shape as JSON to /api/feedback', async () => {
    const fetchMock = mockFetchResponse(200);
    vi.stubGlobal('fetch', fetchMock);

    await submitFeedback(PAYLOAD);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/feedback');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      page: 'dashboard',
      sentiment: 'up',
      message: 'More divisional charts please',
      turnstileToken: 'tok-123',
    });
  });

  it('sends the X-App-Version header (falls back to "dev" outside a production build)', async () => {
    const fetchMock = mockFetchResponse(200);
    vi.stubGlobal('fetch', fetchMock);

    await submitFeedback(PAYLOAD);

    const [, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers['X-App-Version']).toBe('dev');
  });

  it('sends the build-injected app version as the X-App-Version header', async () => {
    vi.stubGlobal('__APP_VERSION__', '9.9.9');
    const fetchMock = mockFetchResponse(200);
    vi.stubGlobal('fetch', fetchMock);

    await submitFeedback(PAYLOAD);

    const [, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers['X-App-Version']).toBe('9.9.9');
  });

  it('maps a 200 response to a success result', async () => {
    vi.stubGlobal('fetch', mockFetchResponse(200));
    const result = await submitFeedback(PAYLOAD);
    expect(result).toEqual({ ok: true });
  });

  it('maps 400 to a typed bad_request failure', async () => {
    vi.stubGlobal('fetch', mockFetchResponse(400));
    const result = await submitFeedback(PAYLOAD);
    expect(result).toEqual({ ok: false, status: 400, reason: 'bad_request' });
  });

  it('maps 403 to a typed forbidden failure (failed Turnstile)', async () => {
    vi.stubGlobal('fetch', mockFetchResponse(403));
    const result = await submitFeedback(PAYLOAD);
    expect(result).toEqual({ ok: false, status: 403, reason: 'forbidden' });
  });

  it('maps 429 to a typed rate_limited failure', async () => {
    vi.stubGlobal('fetch', mockFetchResponse(429));
    const result = await submitFeedback(PAYLOAD);
    expect(result).toEqual({ ok: false, status: 429, reason: 'rate_limited' });
  });

  it('maps an unexpected status to a generic error failure', async () => {
    vi.stubGlobal('fetch', mockFetchResponse(500));
    const result = await submitFeedback(PAYLOAD);
    expect(result).toEqual({ ok: false, status: 500, reason: 'error' });
  });

  it('maps a network/offline throw to a generic error (never rejects)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch);
    const result = await submitFeedback(PAYLOAD);
    expect(result).toEqual({ ok: false, status: 0, reason: 'error' });
  });

  it('omits an undefined message from the request body', async () => {
    const fetchMock = mockFetchResponse(200);
    vi.stubGlobal('fetch', fetchMock);

    await submitFeedback({ page: 'dashboard', sentiment: null, turnstileToken: 'dev' });

    const [, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);
    expect('message' in body).toBe(false);
    expect(body).toEqual({ page: 'dashboard', sentiment: null, turnstileToken: 'dev' });
  });
});
