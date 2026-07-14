import { describe, it, expect } from 'vitest';
import en from './en/chat.json';
import es from './es/chat.json';
import pt from './pt/chat.json';

const keys = (o: unknown, p = ''): string[] =>
  o && typeof o === 'object'
    ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        k === '_meta' ? [] : keys(v, p ? `${p}.${k}` : k),
      )
    : [p];

describe('chat i18n parity', () => {
  it('es matches en keys', () => expect(keys(es).sort()).toEqual(keys(en).sort()));
  it('pt matches en keys', () => expect(keys(pt).sort()).toEqual(keys(en).sort()));

  // The coded-error keys the chat + reading surfaces render must exist in EVERY
  // language, or an offline non-English user hits a raw i18n key on a 401/429/5xx.
  it('carries every coded AI-error key in all three languages', () => {
    for (const catalog of [en, es, pt]) {
      for (const key of [
        'insufficient_credits',
        'auth_failed',
        'model_unavailable',
        'rate_limited',
        'server_error',
        'endpoint_unreachable',
        'request_failed',
      ]) {
        expect(catalog.errors, `missing chat:errors.${key}`).toHaveProperty(key);
      }
    }
  });
});
