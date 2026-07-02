/**
 * LlmModelSettings — the three-tier structure (Spec 063 D3).
 *
 * Asserts: the three clearly-labeled tiers render; None is the ACTIVE default;
 * the cloud tier carries the honest "redacted chart data leaves your device"
 * one-liner; saving the cloud form clears the engine selector (switching off a
 * previously-enabled on-device tier); "Turn AI off" returns to the default;
 * and an on-device MLC id never leaks into the cloud form's model fields.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import '../../../i18n/config';
import { DEFAULT_ONDEVICE_MODEL, LLM_SETTINGS_KEY } from '@almamesh/llm';
import LlmModelSettings from './LlmModelSettings';

function readSaved(): Record<string, unknown> {
  const raw = window.localStorage.getItem(LLM_SETTINGS_KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

// A deterministic, GPU-less probe so the on-device card settles instantly.
const unsupportedProbe = vi.fn(async () => ({ supported: false, reason: 'no_webgpu' }) as const);

function renderTiers() {
  return render(<LlmModelSettings probeFn={unsupportedProbe} />);
}

describe('LlmModelSettings — three tiers', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it('renders all three tiers: None / On-device / Cloud', async () => {
    renderTiers();
    expect(screen.getByTestId('tier-none')).toBeTruthy();
    expect(screen.getByTestId('tier-ondevice')).toBeTruthy();
    expect(screen.getByTestId('tier-cloud')).toBeTruthy();
    // The on-device card settles into its honest unsupported state (no GPU here).
    expect(await screen.findByTestId('ondevice-unsupported')).toBeTruthy();
  });

  it('None is the active DEFAULT with nothing configured', () => {
    renderTiers();
    expect(screen.getByTestId('tier-none-active')).toBeTruthy();
    expect(screen.queryByTestId('tier-cloud-active')).toBeNull();
    expect(screen.queryByTestId('tier-none-select')).toBeNull();
    // Said plainly, as a feature.
    expect(screen.getByTestId('tier-none').textContent).toContain('pure calculation');
  });

  it('the cloud tier is labeled honestly: stronger models, redacted data leaves', () => {
    renderTiers();
    const honesty = screen.getByTestId('tier-cloud-honesty');
    expect(honesty.textContent).toMatch(/[Ss]tronger models/);
    expect(honesty.textContent).toMatch(/leaves your device/);
  });

  it('saving the cloud form clears the engine selector (on-device → cloud switch)', () => {
    window.localStorage.setItem(
      LLM_SETTINGS_KEY,
      JSON.stringify({ engine: 'webllm', model: DEFAULT_ONDEVICE_MODEL }),
    );
    renderTiers();
    fireEvent.click(screen.getByTestId('llm-use-recommended'));
    fireEvent.change(screen.getByTestId('llm-api-key'), { target: { value: 'sk-or-xyz' } });
    fireEvent.click(screen.getByTestId('llm-save'));

    const saved = readSaved();
    expect(saved.engine).toBe('');
    // The cloud slug pair was written; the MLC id did not survive as a cloud model.
    expect(saved.model).not.toBe(DEFAULT_ONDEVICE_MODEL);
  });

  it('never surfaces an on-device MLC id inside the cloud model fields', () => {
    window.localStorage.setItem(
      LLM_SETTINGS_KEY,
      JSON.stringify({ engine: 'webllm', model: DEFAULT_ONDEVICE_MODEL }),
    );
    renderTiers();
    const interp = screen.getByTestId('llm-model') as HTMLInputElement;
    const chat = screen.getByTestId('llm-chat-model') as HTMLInputElement;
    expect(interp.value).not.toContain('MLC');
    expect(chat.value).not.toContain('MLC');
  });

  it('"Turn AI off" returns an on-device config to the None default', () => {
    window.localStorage.setItem(
      LLM_SETTINGS_KEY,
      JSON.stringify({ engine: 'webllm', model: DEFAULT_ONDEVICE_MODEL }),
    );
    renderTiers();
    // on-device active → the None tier offers the off switch
    expect(screen.getByTestId('tier-ondevice-active')).toBeTruthy();
    fireEvent.click(screen.getByTestId('tier-none-select'));

    expect(screen.getByTestId('tier-none-active')).toBeTruthy();
    expect(screen.queryByTestId('tier-ondevice-active')).toBeNull();
    const saved = readSaved();
    expect(saved.engine).toBe('');
    expect(saved.apiBase).toBe('');
  });
});
