/**
 * isAiUsable — the rectification-interview AI gate (Spec 063 D2).
 *
 * Matrix: the interview is actionable on OpenRouter / custom-cloud / on-device
 * configs; it stays GATED on none and on BYO local endpoints (no xgrammar
 * enforcement there — exactly the pre-063 behavior for `local`).
 *
 * These tests drive the REAL settings pipeline (localStorage blob →
 * readLlmSettings → describeLlmStatus) — no mocks — so the matrix proves the
 * production wiring, not a stub.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LLM_SETTINGS_KEY, OPENROUTER_API_BASE } from '@almamesh/llm';

import { isAiUsable } from './rectifyLlmConfig';

function seedSettings(blob: Record<string, unknown>): void {
  window.localStorage.setItem(LLM_SETTINGS_KEY, JSON.stringify(blob));
}

describe('isAiUsable — cloud-or-on-device gate matrix', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it('none (no settings saved) → gated', () => {
    expect(isAiUsable()).toBe(false);
  });

  it('BYO local endpoint (Ollama) → still gated, exactly as before 063', () => {
    seedSettings({ apiBase: 'http://localhost:11434/v1', model: 'llama3' });
    expect(isAiUsable()).toBe(false);
  });

  it('OpenRouter, fully configured → usable', () => {
    seedSettings({ apiBase: OPENROUTER_API_BASE, apiKey: 'sk-or-test', model: 'some/model' });
    expect(isAiUsable()).toBe(true);
  });

  it('OpenRouter without a key (not configured) → gated', () => {
    seedSettings({ apiBase: OPENROUTER_API_BASE, model: 'some/model' });
    expect(isAiUsable()).toBe(false);
  });

  it('custom cloud endpoint, fully configured → usable', () => {
    seedSettings({ apiBase: 'https://api.example.com/v1', apiKey: 'sk-test', model: 'gpt-x' });
    expect(isAiUsable()).toBe(true);
  });

  it('on-device tier (engine webllm) → usable, no endpoint or key needed', () => {
    seedSettings({ engine: 'webllm' });
    expect(isAiUsable()).toBe(true);
  });

  it('on-device wins over leftover local fields from a prior tier', () => {
    seedSettings({ engine: 'webllm', apiBase: 'http://localhost:11434/v1', model: 'llama3' });
    expect(isAiUsable()).toBe(true);
  });
});
