import { describe, it, expect } from 'vitest';
import en from './en/dashboard.json';
import es from './es/dashboard.json';
import pt from './pt/dashboard.json';

/** Flatten to dotted leaf keys, skipping `_meta` annotation blocks. */
const keys = (o: unknown, p = ''): string[] =>
  o && typeof o === 'object'
    ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        k === '_meta' ? [] : keys(v, p ? `${p}.${k}` : k),
      )
    : [p];

describe('dashboard i18n parity', () => {
  it('es matches en keys', () => expect(keys(es).sort()).toEqual(keys(en).sort()));
  it('pt matches en keys', () => expect(keys(pt).sort()).toEqual(keys(en).sort()));
});
