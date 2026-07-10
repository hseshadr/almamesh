/**
 * AiStatusBadge — the header's AI-provider indicator.
 *
 * The badge renders the provider name (OpenRouter/Local/Cloud) as-is, and
 * stays a link to /settings/ai in every state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LLM_SETTINGS_CHANGED_EVENT } from '../../../lib/llmSettingsEvents';

vi.mock('@almamesh/llm', async () => {
  const actual = await vi.importActual<typeof import('@almamesh/llm')>('@almamesh/llm');
  return { ...actual, describeLlmStatus: vi.fn() };
});

import '../../../i18n/config';
import { describeLlmStatus, type LlmStatus } from '@almamesh/llm';
import { AiStatusBadge } from './AiStatusBadge';

const mockedStatus = vi.mocked(describeLlmStatus);

function renderBadge(status: LlmStatus) {
  mockedStatus.mockReturnValue(status);
  return render(
    <MemoryRouter>
      <AiStatusBadge />
    </MemoryRouter>,
  );
}

describe('AiStatusBadge', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.clearAllMocks());

  it('still renders provider labels verbatim for cloud kinds', () => {
    renderBadge({ kind: 'openrouter', label: 'OpenRouter', configured: true });
    expect(screen.getByTestId('ai-status-badge').textContent).toContain('AI: OpenRouter');
  });

  it('keeps the setup call-to-action when nothing is configured', () => {
    renderBadge({ kind: 'none', label: 'Not set', configured: false });
    expect(screen.getByTestId('ai-status-badge').textContent).toContain('Set up AI');
  });

  it('refreshes in the SAME tab when AI settings change (no focus/storage needed)', () => {
    renderBadge({ kind: 'none', label: 'Not set', configured: false });
    expect(screen.getByTestId('ai-status-badge').textContent).toContain('Set up AI');

    // Simulate a save elsewhere in the same tab: status now configured + event.
    mockedStatus.mockReturnValue({ kind: 'openrouter', label: 'OpenRouter', configured: true });
    act(() => {
      window.dispatchEvent(new Event(LLM_SETTINGS_CHANGED_EVENT));
    });
    expect(screen.getByTestId('ai-status-badge').textContent).toContain('AI: OpenRouter');
  });

  it('exposes an accessible name for the icon-only mobile rendering', () => {
    // On mobile the text span is hidden (hidden sm:inline) and only the dot
    // shows — the link still needs a name for screen readers.
    renderBadge({ kind: 'openrouter', label: 'OpenRouter', configured: true });
    expect(screen.getByTestId('ai-status-badge').getAttribute('aria-label')).toBe(
      'AI: OpenRouter',
    );
  });

  it('renders an ACTIVE (configured) provider in the green success token, not warning gold', () => {
    // Lucas's report: an active AI connection reading as gold/amber "looks like
    // it's in question". A live, working AI should read as green (success).
    renderBadge({ kind: 'openrouter', label: 'OpenRouter', configured: true });
    const className = screen.getByTestId('ai-status-badge').className;
    expect(className).toContain('status-success');
    expect(className).not.toContain('accent-gold');
  });

  it('keeps the not-yet-configured state amber (a gentle "needs setup" cue)', () => {
    renderBadge({ kind: 'none', label: 'Not set', configured: false });
    expect(screen.getByTestId('ai-status-badge').className).toContain('amber');
  });
});
