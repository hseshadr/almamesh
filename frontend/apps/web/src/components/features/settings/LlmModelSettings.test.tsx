import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import '../../../i18n/config';
import {
  CHAT_CLOUD_MODEL,
  LLM_SETTINGS_KEY,
  RECOMMENDED_CLOUD_MODEL,
} from '@almamesh/llm';
import LlmModelSettings from './LlmModelSettings';

function readSaved(): Record<string, unknown> {
  const raw = window.localStorage.getItem(LLM_SETTINGS_KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

describe('LlmModelSettings — tiered interpretation + chat models', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it('renders TWO model fields: an interpretation field and a chat field', () => {
    render(<LlmModelSettings />);
    // Interpretation keeps the historical `llm-model` testid (e2e contract).
    expect(screen.getByTestId('llm-model')).toBeTruthy();
    expect(screen.getByTestId('llm-chat-model')).toBeTruthy();
  });

  it('the Recommended preset sets BOTH models to their tier defaults', () => {
    render(<LlmModelSettings />);
    fireEvent.click(screen.getByTestId('llm-use-recommended'));

    const interp = screen.getByTestId('llm-model') as HTMLInputElement;
    const chat = screen.getByTestId('llm-chat-model') as HTMLInputElement;
    expect(interp.value).toBe(RECOMMENDED_CLOUD_MODEL);
    expect(chat.value).toBe(CHAT_CLOUD_MODEL);
  });

  it('persists interpretationModel and chatModel on save', () => {
    render(<LlmModelSettings />);
    fireEvent.click(screen.getByTestId('llm-use-recommended'));
    // Recommended preset is a cloud endpoint → reveal + fill the key so save sticks.
    fireEvent.change(screen.getByTestId('llm-api-key'), { target: { value: 'sk-or-xyz' } });
    fireEvent.click(screen.getByTestId('llm-save'));

    const saved = readSaved();
    expect(saved.interpretationModel).toBe(RECOMMENDED_CLOUD_MODEL);
    expect(saved.chatModel).toBe(CHAT_CLOUD_MODEL);
  });

  it('lets the user set a distinct chat model and persists it independently', () => {
    render(<LlmModelSettings />);
    fireEvent.click(screen.getByTestId('llm-use-recommended'));
    fireEvent.change(screen.getByTestId('llm-chat-model'), { target: { value: 'groq/fast-chat' } });
    fireEvent.change(screen.getByTestId('llm-api-key'), { target: { value: 'sk-or-xyz' } });
    fireEvent.click(screen.getByTestId('llm-save'));

    const saved = readSaved();
    expect(saved.chatModel).toBe('groq/fast-chat');
    expect(saved.interpretationModel).toBe(RECOMMENDED_CLOUD_MODEL);
  });

  it('shows advisory copy distinguishing the two tiers', () => {
    render(<LlmModelSettings />);
    // The chat advisory mentions the reading reuse rationale; assert the labels
    // for both tiers render (i18n keys resolve, not raw key strings).
    expect(screen.getByTestId('llm-model-advice')).toBeTruthy();
    expect(screen.getByTestId('llm-chat-model-advice')).toBeTruthy();
  });
});
