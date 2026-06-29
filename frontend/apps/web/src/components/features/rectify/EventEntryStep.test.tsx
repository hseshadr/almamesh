/**
 * EventEntryStep — composition of ConversationalAccelerator + GatheredTray.
 *
 * Tests assert:
 *  - step title renders
 *  - ConversationalAccelerator is rendered (gated note when no cloud; opening when cloud)
 *  - GatheredTray is rendered and collapsed by default
 *  - "Enter events manually instead" toggle exists and expands the tray
 *  - no-cloud path: gated note visible AND manual toggle opens the tray (no dead-end)
 *  - CTA fires onContinue when ≥1 structured event exists (via the tray)
 *  - tray's own toggle can collapse again after manual expand
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useLifeEventsStore, useLanguageStore, type LifeEvent } from '@almamesh/store';
import type { LlmStatus } from '@almamesh/llm';

// vi.mock is hoisted — replace the LLM module so no cloud / network calls happen.
vi.mock('@almamesh/llm', () => ({
  describeLlmStatus: vi.fn(),
  readLlmSettings: vi.fn(() => ({})),
  applyLlmSettings: vi.fn((env: Record<string, string | undefined>) => env),
  resolveProviderConfig: vi.fn(() => ({
    engine: 'openai-http',
    model: 'test-model',
    privacyMode: 'cloud_premium',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: 'test-key',
  })),
  structureLifeEvents: vi.fn(),
  streamRectificationInterview: vi.fn(),
  gatherEventsFromTurn: vi.fn(),
}));

// Import AFTER mock declarations (hoisting ensures mock runs first at runtime)
import '../../../i18n/config';
import { EventEntryStep } from './EventEntryStep';
import { describeLlmStatus } from '@almamesh/llm';

const PROFILE_ID = 'test-profile';

const NONE_STATUS: LlmStatus = { kind: 'none', label: 'Not set', configured: false };
const CLOUD_STATUS: LlmStatus = { kind: 'openrouter', label: 'OpenRouter', configured: true };

const STRUCTURED_EVENT: LifeEvent = {
  id: 'e1',
  date: '2020-01-15',
  category: 'marriage',
  createdAt: '2020-01-01T00:00:00Z',
};

function seedEvents(events: readonly LifeEvent[]) {
  useLifeEventsStore.setState({ eventsByProfile: { [PROFILE_ID]: events } });
}

describe('EventEntryStep', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useLanguageStore.setState({ language: 'en' });
    useLifeEventsStore.setState({ eventsByProfile: {} });
    vi.mocked(describeLlmStatus).mockReturnValue(NONE_STATUS);
  });

  it('renders the step title', () => {
    render(<EventEntryStep profileId={PROFILE_ID} onContinue={() => {}} />);
    expect(screen.getByText('Your Life Events')).toBeTruthy();
  });

  it('renders the ConversationalAccelerator — gated note when no cloud configured', () => {
    render(<EventEntryStep profileId={PROFILE_ID} onContinue={() => {}} />);
    expect(screen.getByTestId('chat-gated')).toBeTruthy();
  });

  it('renders the ConversationalAccelerator — opening message when cloud configured', () => {
    vi.mocked(describeLlmStatus).mockReturnValue(CLOUD_STATUS);
    render(<EventEntryStep profileId={PROFILE_ID} onContinue={() => {}} />);
    expect(screen.getByTestId('chat-opening')).toBeTruthy();
  });

  it('renders the GatheredTray collapsed by default', () => {
    render(<EventEntryStep profileId={PROFILE_ID} onContinue={() => {}} />);
    const toggleBtn = screen.getByRole('button', { name: /gathered/i });
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders a manual-entry toggle affordance', () => {
    render(<EventEntryStep profileId={PROFILE_ID} onContinue={() => {}} />);
    expect(screen.getByRole('button', { name: /manually/i })).toBeTruthy();
  });

  it('clicking the manual toggle expands the tray', () => {
    render(<EventEntryStep profileId={PROFILE_ID} onContinue={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /manually/i }));
    const toggleBtn = screen.getByRole('button', { name: /gathered/i });
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
  });

  it('no-cloud path: gated note visible AND manual toggle opens the tray (no dead-end)', () => {
    render(<EventEntryStep profileId={PROFILE_ID} onContinue={() => {}} />);
    // Gated note is shown
    expect(screen.getByTestId('chat-gated')).toBeTruthy();
    // Manual toggle is reachable and opens the tray to editable rows
    fireEvent.click(screen.getByRole('button', { name: /manually/i }));
    expect(screen.getByRole('button', { name: /add event/i })).toBeTruthy();
  });

  it('CTA fires onContinue when ≥1 structured event exists (via tray)', () => {
    seedEvents([STRUCTURED_EVENT]);
    const onContinue = vi.fn();
    render(<EventEntryStep profileId={PROFILE_ID} onContinue={onContinue} />);
    // Open tray via its own toggle bar (shows "1 event gathered · review")
    fireEvent.click(screen.getByRole('button', { name: /gathered/i }));
    fireEvent.click(screen.getByRole('button', { name: /rising sign/i }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("tray's own toggle collapses the tray after manual expand", () => {
    render(<EventEntryStep profileId={PROFILE_ID} onContinue={() => {}} />);
    // Expand via manual toggle
    fireEvent.click(screen.getByRole('button', { name: /manually/i }));
    // Collapse via tray's own toggle bar
    fireEvent.click(screen.getByRole('button', { name: /gathered/i }));
    expect(
      screen.getByRole('button', { name: /gathered/i }).getAttribute('aria-expanded'),
    ).toBe('false');
  });
});
