/**
 * LlmModelSettings — the tier structure (Spec 063 D3).
 *
 * Asserts: the None + Cloud tiers render; None is the ACTIVE default; the cloud
 * tier carries the honest "redacted chart data leaves your device" one-liner;
 * and "Turn AI off" returns a configured cloud tier to the None default.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import '../../../i18n/config';
import { LLM_SETTINGS_KEY } from '@almamesh/llm';
import LlmModelSettings from './LlmModelSettings';

function readSaved(): Record<string, unknown> {
  const raw = window.localStorage.getItem(LLM_SETTINGS_KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function renderTiers() {
  return render(<LlmModelSettings />);
}

describe('LlmModelSettings — tiers', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it('renders the None + Cloud tiers', () => {
    renderTiers();
    expect(screen.getByTestId('tier-none')).toBeTruthy();
    expect(screen.getByTestId('tier-cloud')).toBeTruthy();
  });

  it('None is the active DEFAULT with nothing configured', () => {
    renderTiers();
    expect(screen.getByTestId('tier-none-active')).toBeTruthy();
    expect(screen.queryByTestId('tier-cloud-active')).toBeNull();
    expect(screen.queryByTestId('tier-none-select')).toBeNull();
    // Said plainly, as a feature.
    expect(screen.getByTestId('tier-none').textContent).toContain('pure calculation');
  });

  it('the cloud tier is labeled honestly: OpenRouter/BYO, redacted data leaves', () => {
    renderTiers();
    const honesty = screen.getByTestId('tier-cloud-honesty');
    expect(honesty.textContent).toMatch(/OpenRouter/);
    expect(honesty.textContent).toMatch(/leaves your device/);
  });

  it('"Turn AI off" returns a configured cloud tier to the None default', () => {
    window.localStorage.setItem(
      LLM_SETTINGS_KEY,
      JSON.stringify({
        apiBase: 'https://openrouter.ai/api/v1',
        apiKey: 'sk-or-xyz',
        model: 'test-org/test-model',
        privacyMode: 'cloud_premium',
      }),
    );
    renderTiers();
    // Cloud active → the None tier offers the off switch.
    expect(screen.getByTestId('tier-cloud-active')).toBeTruthy();
    fireEvent.click(screen.getByTestId('tier-none-select'));

    expect(screen.getByTestId('tier-none-active')).toBeTruthy();
    expect(screen.queryByTestId('tier-cloud-active')).toBeNull();
    const saved = readSaved();
    expect(saved.engine).toBe('');
    expect(saved.apiBase).toBe('');
  });
});
