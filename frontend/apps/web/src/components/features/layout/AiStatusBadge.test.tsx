/**
 * AiStatusBadge — the header's AI-provider indicator.
 *
 * Spec 063: the badge must render the `on_device` kind with a TRANSLATED
 * label (the provider names OpenRouter/Local/Cloud pass through as-is), and
 * stay a link to /settings/ai in every state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

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

  it('renders the on_device kind with the translated label', () => {
    renderBadge({ kind: 'on_device', label: 'On-device', configured: true });
    const badge = screen.getByTestId('ai-status-badge');
    // en catalog: ai_badge.label = "AI: {{provider}}", on_device = "On-device"
    expect(badge.textContent).toContain('AI: On-device');
    expect(badge.getAttribute('href')).toBe('/settings/ai');
  });

  it('on_device counts as configured (ready styling, ready title)', () => {
    renderBadge({ kind: 'on_device', label: 'On-device', configured: true });
    const badge = screen.getByTestId('ai-status-badge');
    expect(badge.getAttribute('title')).toContain('On-device');
    expect(badge.className).toContain('border-accent-gold/30');
  });

  it('still renders provider labels verbatim for cloud kinds', () => {
    renderBadge({ kind: 'openrouter', label: 'OpenRouter', configured: true });
    expect(screen.getByTestId('ai-status-badge').textContent).toContain('AI: OpenRouter');
  });

  it('keeps the setup call-to-action when nothing is configured', () => {
    renderBadge({ kind: 'none', label: 'Not set', configured: false });
    expect(screen.getByTestId('ai-status-badge').textContent).toContain('Set up AI');
  });

  it('exposes an accessible name for the icon-only mobile rendering', () => {
    // On mobile the text span is hidden (hidden sm:inline) and only the dot
    // shows — the link still needs a name for screen readers.
    renderBadge({ kind: 'openrouter', label: 'OpenRouter', configured: true });
    expect(screen.getByTestId('ai-status-badge').getAttribute('aria-label')).toBe(
      'AI: OpenRouter',
    );
  });
});
