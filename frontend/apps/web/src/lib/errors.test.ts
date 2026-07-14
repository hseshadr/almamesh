import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n/config';
import {
  chatErrorMessage,
  classifyConnectionError,
  connectionErrorDetail,
  ERROR_CODES,
  getChatErrorMessage,
  getEngineWarmingMessage,
  getUserFriendlyError,
  isAuthError,
  isInsufficientCreditsMessage,
  isModelUnavailableMessage,
} from './errors';

/** Stand-in for the @almamesh/llm LlmRequestError (duck-typed .status/.name/.body). */
class FakeLlmRequestError extends Error {
  status?: number;
  body?: string;
  constructor(message: string, status?: number, body?: string) {
    super(message);
    this.name = 'LlmRequestError';
    this.status = status;
    this.body = body;
  }
}

// The error helpers are a plain (non-React) TS module that localizes via the
// shared app i18n instance. Every test that changes the language must restore
// 'en' afterwards so the English assertions elsewhere hold.
beforeEach(async () => {
  await i18n.changeLanguage('en');
});

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('getUserFriendlyError', () => {
  it('returns English with the error code in en', async () => {
    await i18n.changeLanguage('en');
    expect(getUserFriendlyError('CHART_GEN_001')).toBe(
      "Sorry, we're experiencing technical difficulties. Error code: CHART_GEN_001",
    );
  });

  it('returns Spanish with the error code in es', async () => {
    await i18n.changeLanguage('es');
    const msg = getUserFriendlyError('CHART_GEN_001');
    expect(msg).toContain('dificultades técnicas');
    expect(msg).toContain('CHART_GEN_001');
    expect(msg).not.toContain('technical difficulties');
  });
});

describe('getChatErrorMessage', () => {
  it('returns English in en', async () => {
    await i18n.changeLanguage('en');
    expect(getChatErrorMessage('QA_001')).toBe(
      "Sorry, I couldn't process your request. Please try again. (Error: QA_001)",
    );
  });

  it('returns Spanish in es', async () => {
    await i18n.changeLanguage('es');
    const msg = getChatErrorMessage('QA_001');
    expect(msg).toContain('no pudimos procesar');
    expect(msg).toContain('QA_001');
  });
});

describe('getEngineWarmingMessage', () => {
  it('returns English in en', async () => {
    await i18n.changeLanguage('en');
    expect(getEngineWarmingMessage()).toBe(
      'The astrology engine is still warming up — please try again in a moment.',
    );
  });

  it('returns Spanish in es', async () => {
    await i18n.changeLanguage('es');
    const msg = getEngineWarmingMessage();
    expect(msg).toContain('motor astrológico');
    expect(msg).not.toContain('astrology engine');
  });
});

describe('isModelUnavailableMessage', () => {
  it('matches a typo\'d OpenRouter model id (live 400 "is not a valid model ID")', () => {
    // Verified against the live OpenRouter API 2026-07-03: a mistyped slug now
    // returns HTTP 400 "...is not a valid model ID", not the old 404. This is
    // the MOST COMMON real user error and must get the precise model-unavailable
    // copy, not the generic request-failed fallback.
    expect(
      isModelUnavailableMessage(
        'LLM endpoint returned 400: not-a-real/model-xyz is not a valid model ID',
      ),
    ).toBe(true);
  });

  it('still matches the legacy 404 / no-endpoints / model_not_found shapes', () => {
    expect(isModelUnavailableMessage('No endpoints found for foo/bar')).toBe(true);
    expect(isModelUnavailableMessage('error: model_not_found')).toBe(true);
    expect(isModelUnavailableMessage('HTTP 404: model foo/bar does not exist')).toBe(true);
  });

  it('does NOT match unrelated failures (unreachable endpoint, rate limit)', () => {
    expect(isModelUnavailableMessage('Failed to fetch')).toBe(false);
    expect(isModelUnavailableMessage('HTTP 429: rate limit exceeded')).toBe(false);
    expect(isModelUnavailableMessage('HTTP 400: messages array is required')).toBe(false);
  });
});

describe('isInsufficientCreditsMessage', () => {
  it('matches the live OpenRouter 402 shape (repro 2026-07-03: valid key, usage ≥ credits)', () => {
    expect(
      isInsufficientCreditsMessage(
        'LLM endpoint returned 402 Payment Required: {"error":{"message":"Insufficient credits. Add more using https://openrouter.ai/settings/credits","code":402}}',
      ),
    ).toBe(true);
  });

  it('matches plain credit-balance phrasings', () => {
    expect(isInsufficientCreditsMessage('Insufficient credits')).toBe(true);
    expect(isInsufficientCreditsMessage('This request requires more credits')).toBe(true);
    expect(isInsufficientCreditsMessage('LLM endpoint returned 402')).toBe(true);
  });

  it('does NOT match unrelated failures', () => {
    expect(isInsufficientCreditsMessage('HTTP 429: rate limit exceeded')).toBe(false);
    expect(isInsufficientCreditsMessage('LLM endpoint returned 400: messages array is required')).toBe(false);
    expect(isInsufficientCreditsMessage('Failed to fetch')).toBe(false);
    expect(isInsufficientCreditsMessage('No endpoints found for foo/bar')).toBe(false);
  });
});

describe('isAuthError', () => {
  it('matches 401 and 403 only', () => {
    expect(isAuthError(401)).toBe(true);
    expect(isAuthError(403)).toBe(true);
    expect(isAuthError(402)).toBe(false);
    expect(isAuthError(404)).toBe(false);
    expect(isAuthError(undefined)).toBe(false);
  });
});

describe('classifyConnectionError', () => {
  it('classifies a 402 / insufficient-credits failure as credits (before auth)', () => {
    expect(
      classifyConnectionError(
        new FakeLlmRequestError('LLM endpoint returned 402 Payment Required: Insufficient credits', 402),
      ),
    ).toBe('credits');
  });

  it('classifies a 401/403 as auth', () => {
    expect(classifyConnectionError(new FakeLlmRequestError('returned 401 Unauthorized', 401))).toBe('auth');
    expect(classifyConnectionError(new FakeLlmRequestError('returned 403 Forbidden', 403))).toBe('auth');
  });

  it('classifies a 404 or a bad-model-id body as model', () => {
    expect(classifyConnectionError(new FakeLlmRequestError('returned 404: No endpoints found', 404))).toBe('model');
    expect(
      classifyConnectionError(new FakeLlmRequestError('returned 400: bad/slug is not a valid model ID', 400)),
    ).toBe('model');
  });

  it('classifies a PrivacyViolationError as privacy', () => {
    const err = new Error('refusing to send chart data to non-local endpoint');
    err.name = 'PrivacyViolationError';
    expect(classifyConnectionError(err)).toBe('privacy');
  });

  it('classifies a fetch TypeError (no status) as network by its message', () => {
    expect(classifyConnectionError(new TypeError('Failed to fetch'))).toBe('network');
    expect(classifyConnectionError(new TypeError('Load failed'))).toBe('network');
    expect(classifyConnectionError(new TypeError('NetworkError when attempting to fetch resource'))).toBe('network');
  });

  it('does NOT treat a bare non-network TypeError (a code bug) as network', () => {
    // A programming-error TypeError has no network-y message; it must fall
    // through to unknown (and stay visible in the logs) rather than masquerade
    // as "endpoint unreachable" — matching the interpretation path.
    expect(classifyConnectionError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(
      'unknown',
    );
  });

  it('classifies a 429 as rate_limited', () => {
    expect(classifyConnectionError(new FakeLlmRequestError('returned 429 Too Many Requests', 429))).toBe(
      'rate_limited',
    );
  });

  it('classifies any 5xx as server', () => {
    expect(classifyConnectionError(new FakeLlmRequestError('returned 500 Internal Server Error', 500))).toBe(
      'server',
    );
    expect(classifyConnectionError(new FakeLlmRequestError('returned 502 Bad Gateway', 502))).toBe('server');
    expect(classifyConnectionError(new FakeLlmRequestError('returned 503 Service Unavailable', 503))).toBe(
      'server',
    );
  });

  it('falls back to unknown for an unrecognized failure', () => {
    expect(classifyConnectionError(new FakeLlmRequestError("I'm a teapot", 418))).toBe('unknown');
  });
});

describe('chatErrorMessage', () => {
  // The chat + reading surfaces share ONE coded-message mapper (the same
  // classification the Settings "Save & test connection" path uses). A 402/401/
  // 429/5xx must each get its own specific, actionable copy — never the generic
  // "request failed — check your model and endpoint" dead-end that sent users
  // in circles for a billing/auth/outage problem.
  it('maps a 402 to the insufficient-credits copy, NEVER the generic request_failed', () => {
    const msg = chatErrorMessage(
      new FakeLlmRequestError('LLM endpoint returned 402 Payment Required: Insufficient credits', 402),
    );
    expect(msg).toBe(i18n.t('chat:errors.insufficient_credits'));
    expect(msg).not.toBe(i18n.t('chat:errors.request_failed'));
  });

  it('maps a 401/403 to the auth-failed copy', () => {
    expect(chatErrorMessage(new FakeLlmRequestError('returned 401 Unauthorized', 401))).toBe(
      i18n.t('chat:errors.auth_failed'),
    );
    expect(chatErrorMessage(new FakeLlmRequestError('returned 403 Forbidden', 403))).toBe(
      i18n.t('chat:errors.auth_failed'),
    );
  });

  it('maps a 404 / bad-model-id to the model-unavailable copy (regression guard)', () => {
    expect(chatErrorMessage(new FakeLlmRequestError('returned 404: No endpoints found', 404))).toBe(
      i18n.t('chat:errors.model_unavailable'),
    );
  });

  it('maps a 429 to the rate-limited copy', () => {
    expect(chatErrorMessage(new FakeLlmRequestError('returned 429 Too Many Requests', 429))).toBe(
      i18n.t('chat:errors.rate_limited'),
    );
  });

  it('maps any 5xx to the server-error copy', () => {
    expect(chatErrorMessage(new FakeLlmRequestError('returned 500 Internal Server Error', 500))).toBe(
      i18n.t('chat:errors.server_error'),
    );
    expect(chatErrorMessage(new FakeLlmRequestError('returned 503 Service Unavailable', 503))).toBe(
      i18n.t('chat:errors.server_error'),
    );
  });

  it('maps a fetch network TypeError to the unreachable-endpoint copy', () => {
    expect(chatErrorMessage(new TypeError('Failed to fetch'))).toBe(
      i18n.t('chat:errors.endpoint_unreachable'),
    );
  });

  it('surfaces a PrivacyViolationError message verbatim (fail-closed fence)', () => {
    const err = new Error('refusing to send chart data to non-local endpoint');
    err.name = 'PrivacyViolationError';
    expect(chatErrorMessage(err)).toBe('refusing to send chart data to non-local endpoint');
  });

  it('falls back to the generic request_failed copy for an unknown failure', () => {
    expect(chatErrorMessage(new FakeLlmRequestError("I'm a teapot", 418))).toBe(
      i18n.t('chat:errors.request_failed'),
    );
    expect(chatErrorMessage(new Error('mystery'))).toBe(i18n.t('chat:errors.request_failed'));
  });
});

describe('connectionErrorDetail', () => {
  it("extracts the provider's structured error.message from a JSON body", () => {
    const body =
      '{"error":{"message":"Invalid \'max_output_tokens\': Expected a value >= 16, but got 1 instead.","code":"integer_below_min_value"}}';
    const err = new FakeLlmRequestError('LLM endpoint returned 400 Bad Request', 400, body);
    expect(connectionErrorDetail(err)).toBe(
      "Invalid 'max_output_tokens': Expected a value >= 16, but got 1 instead.",
    );
  });

  it("unwraps OpenRouter's nested metadata.raw to the upstream provider reason", () => {
    // OpenRouter WRAPS the upstream error: the useful reason lives in
    // error.metadata.raw (a JSON string), while the top-level error.message is a
    // generic "Provider returned error". Real body captured live from
    // openrouter.ai 2026-07-10 (openai/gpt-5.6-sol, max_tokens:1). Surfacing the
    // generic wrapper would defeat connectionErrorDetail's whole purpose, so we
    // recurse into the nested raw and prefer the deepest message.
    const upstream = JSON.stringify({
      error: {
        message:
          "Invalid 'max_output_tokens': integer below minimum value. Expected a value >= 16, but got 1 instead.",
        type: 'invalid_request_error',
        param: 'max_output_tokens',
        code: 'integer_below_min_value',
      },
    });
    const body = JSON.stringify({
      error: { message: 'Provider returned error', code: 400, metadata: { raw: upstream } },
    });
    const err = new FakeLlmRequestError('LLM endpoint returned 400 Bad Request', 400, body);
    expect(connectionErrorDetail(err)).toBe(
      "Invalid 'max_output_tokens': integer below minimum value. Expected a value >= 16, but got 1 instead.",
    );
  });

  it('falls back to the raw body when it is not JSON', () => {
    const err = new FakeLlmRequestError('returned 429', 429, 'Too Many Requests — slow down');
    expect(connectionErrorDetail(err)).toBe('Too Many Requests — slow down');
  });

  it('falls back to the error message when there is no body (e.g. a fetch failure)', () => {
    expect(connectionErrorDetail(new TypeError('Load failed'))).toBe('Load failed');
  });

  it('collapses whitespace and caps the length', () => {
    const long = 'x'.repeat(400);
    const err = new FakeLlmRequestError('m', 500, `  ${long}  `);
    const detail = connectionErrorDetail(err)!;
    expect(detail.length).toBeLessThanOrEqual(200);
    expect(detail.startsWith('x')).toBe(true);
  });

  it('returns undefined when there is nothing useful to show', () => {
    expect(connectionErrorDetail(new FakeLlmRequestError('', undefined, ''))).toBeUndefined();
    expect(connectionErrorDetail(null)).toBeUndefined();
  });
});

describe('ERROR_CODES default messages', () => {
  it('localize the human-readable code description by language', async () => {
    await i18n.changeLanguage('en');
    expect(ERROR_CODES('CHART_GEN_001')).toBe('Chart generation failed');
    await i18n.changeLanguage('es');
    expect(ERROR_CODES('CHART_GEN_001')).toBe('Error al generar la carta');
  });
});
