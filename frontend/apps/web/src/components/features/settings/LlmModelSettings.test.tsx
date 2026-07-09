import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import '../../../i18n/config';
import {
  CHAT_CLOUD_MODEL,
  LLM_SETTINGS_KEY,
  RECOMMENDED_CLOUD_MODEL,
  type ProviderConfig,
} from '@almamesh/llm';
import LlmModelSettings from './LlmModelSettings';

function readSaved(): Record<string, unknown> {
  const raw = window.localStorage.getItem(LLM_SETTINGS_KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

const STUB_CONFIG: ProviderConfig = {
  engine: 'openai-http',
  model: RECOMMENDED_CLOUD_MODEL,
  privacyMode: 'cloud_premium',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: 'sk-or-xyz',
};
const resolveConfig = () => STUB_CONFIG;

/** A rejection shaped like the @almamesh/llm LlmRequestError (duck-typed). */
function requestError(message: string, status: number): Error {
  return Object.assign(new Error(message), { name: 'LlmRequestError', status });
}

describe('LlmModelSettings — OpenRouter-first, test-on-save', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it('renders the two choices: AI off, and a guided Connect-AI card with an Advanced panel', () => {
    render(<LlmModelSettings resolveConfig={resolveConfig} testConnection={vi.fn()} />);
    expect(screen.getByTestId('tier-none')).toBeTruthy();
    expect(screen.getByTestId('tier-cloud')).toBeTruthy();
    expect(screen.getByTestId('llm-openrouter-key')).toBeTruthy();
    expect(screen.getByTestId('llm-openrouter-link').getAttribute('href')).toBe(
      'https://openrouter.ai/keys',
    );
    // Advanced custom-endpoint fields exist (inside the <details>, still in DOM).
    expect(screen.getByTestId('llm-advanced-summary')).toBeTruthy();
    expect(screen.getByTestId('llm-api-base')).toBeTruthy();
    expect(screen.getByTestId('llm-model')).toBeTruthy();
    expect(screen.getByTestId('llm-chat-model')).toBeTruthy();
  });

  it('disables the guided Save until an OpenRouter key is entered', () => {
    render(<LlmModelSettings resolveConfig={resolveConfig} testConnection={vi.fn()} />);
    expect((screen.getByTestId('llm-save') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId('llm-openrouter-key'), { target: { value: 'sk-or-abc' } });
    expect((screen.getByTestId('llm-save') as HTMLButtonElement).disabled).toBe(false);
  });

  it('guided save persists the OpenRouter preset and, on a passing test, shows Connected', async () => {
    const testConnection = vi.fn().mockResolvedValue(undefined);
    render(<LlmModelSettings resolveConfig={resolveConfig} testConnection={testConnection} />);

    fireEvent.change(screen.getByTestId('llm-openrouter-key'), { target: { value: 'sk-or-abc' } });
    fireEvent.click(screen.getByTestId('llm-save'));

    await waitFor(() =>
      expect(screen.getByTestId('llm-connection-result').textContent).toContain('Connected'),
    );
    expect(testConnection).toHaveBeenCalledWith({ config: STUB_CONFIG });
    const saved = readSaved();
    expect(saved.apiBase).toBe('https://openrouter.ai/api/v1');
    expect(saved.apiKey).toBe('sk-or-abc');
    expect(saved.interpretationModel).toBe(RECOMMENDED_CLOUD_MODEL);
    expect(saved.chatModel).toBe(CHAT_CLOUD_MODEL);
    expect(saved.privacyMode).toBe('cloud_premium');
  });

  it('shows a SPECIFIC error (bad key) when the connectivity test fails — config still saved', async () => {
    const testConnection = vi.fn().mockRejectedValue(requestError('returned 401 Unauthorized', 401));
    render(<LlmModelSettings resolveConfig={resolveConfig} testConnection={testConnection} />);

    fireEvent.change(screen.getByTestId('llm-openrouter-key'), { target: { value: 'bad-key' } });
    fireEvent.click(screen.getByTestId('llm-save'));

    await waitFor(() => {
      const result = screen.getByTestId('llm-connection-result').textContent ?? '';
      expect(result).toContain('API key rejected');
    });
    // The config is still persisted so the user can fix & retry — not lost.
    expect(readSaved().apiKey).toBe('bad-key');
  });

  it('maps an out-of-credits failure to billing copy, not a model error', async () => {
    const testConnection = vi
      .fn()
      .mockRejectedValue(requestError('returned 402 Payment Required: Insufficient credits', 402));
    render(<LlmModelSettings resolveConfig={resolveConfig} testConnection={testConnection} />);

    fireEvent.change(screen.getByTestId('llm-openrouter-key'), { target: { value: 'sk-or-abc' } });
    fireEvent.click(screen.getByTestId('llm-save'));

    await waitFor(() =>
      expect(screen.getByTestId('llm-connection-result').textContent).toContain('out of credits'),
    );
  });

  it('advanced save persists a hand-typed endpoint + tiered models and tests them', async () => {
    const testConnection = vi.fn().mockResolvedValue(undefined);
    render(<LlmModelSettings resolveConfig={resolveConfig} testConnection={testConnection} />);

    fireEvent.change(screen.getByTestId('llm-api-base'), {
      target: { value: 'http://localhost:11434/v1' },
    });
    fireEvent.change(screen.getByTestId('llm-model'), { target: { value: 'llama3.1' } });
    fireEvent.change(screen.getByTestId('llm-chat-model'), { target: { value: 'llama3.1' } });
    fireEvent.click(screen.getByTestId('llm-save-advanced'));

    await waitFor(() => expect(testConnection).toHaveBeenCalledOnce());
    const saved = readSaved();
    expect(saved.apiBase).toBe('http://localhost:11434/v1');
    expect(saved.interpretationModel).toBe('llama3.1');
    expect(saved.chatModel).toBe('llama3.1');
  });
});
