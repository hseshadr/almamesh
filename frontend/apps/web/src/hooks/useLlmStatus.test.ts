import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { openRouterPreset, writeLlmSettings } from '@almamesh/llm';
import { useLlmStatus } from './useLlmStatus';
import { notifyLlmSettingsChanged } from '../lib/llmSettingsEvents';

describe('useLlmStatus — live AI-provider status', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it('starts from the saved status', () => {
    const { result } = renderHook(() => useLlmStatus());
    expect(result.current.configured).toBe(false);
    expect(result.current.kind).toBe('none');
  });

  it('flips live when AI is connected, then turned off, in the SAME tab', () => {
    const { result } = renderHook(() => useLlmStatus());

    // Connect OpenRouter → the gate goes live-configured without a reload.
    act(() => {
      writeLlmSettings(openRouterPreset('sk-or-abc', 'org/model', 'org/chat'));
      notifyLlmSettingsChanged();
    });
    expect(result.current.kind).toBe('openrouter');
    expect(result.current.configured).toBe(true);

    // Turn AI off → the gate flips back to "none" immediately (this is what stops
    // a disconnected chat from continuing to send).
    act(() => {
      writeLlmSettings({
        engine: '',
        apiBase: '',
        apiKey: '',
        model: '',
        interpretationModel: '',
        chatModel: '',
        privacyMode: 'local_only',
      });
      notifyLlmSettingsChanged();
    });
    expect(result.current.kind).toBe('none');
    expect(result.current.configured).toBe(false);
  });
});
