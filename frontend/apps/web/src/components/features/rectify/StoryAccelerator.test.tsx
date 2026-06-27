/**
 * StoryAccelerator — optional LLM "paste your story" panel (slice 4).
 *
 * Tests assert:
 *  - gated state (AI not cloud-configured): gate note shown, no submit button visible,
 *    structureLifeEvents is never called.
 *  - cloud opted-in: egress warning is visible; submitting calls structureLifeEvents
 *    and appends reviewable draft rows (date + category set) to the store;
 *    no navigation / auto-fit occurs.
 *  - empty result ([]): "add manually" message shown, store unchanged.
 *  - loading state is shown while extraction is in flight.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useLifeEventsStore, useLanguageStore } from '@almamesh/store';
import type { LlmStatus } from '@almamesh/llm';
import type { RectificationEventInput } from '@almamesh/shared-types';

// ── vi.mock is hoisted; replace only the functions this component uses ──────
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
}));

// Import AFTER mock declarations (hoisting ensures mock runs first at runtime)
import '../../../i18n/config';
import { StoryAccelerator } from './StoryAccelerator';
import { describeLlmStatus, structureLifeEvents } from '@almamesh/llm';

const PROFILE_ID = 'test-profile';

const CLOUD_STATUS: LlmStatus = { kind: 'openrouter', label: 'OpenRouter', configured: true };
const CLOUD_CUSTOM_STATUS: LlmStatus = { kind: 'cloud', label: 'Cloud', configured: true };
const LOCAL_STATUS: LlmStatus = { kind: 'local', label: 'Local', configured: true };
const NONE_STATUS: LlmStatus = { kind: 'none', label: 'Not set', configured: false };

/** Open the collapsible panel and enter text — shared helper for cloud tests. */
function openAndEnterText(text: string): void {
  fireEvent.click(screen.getByText(/paste your story/i));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
}

describe('StoryAccelerator', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useLanguageStore.setState({ language: 'en' });
    useLifeEventsStore.setState({ eventsByProfile: {} });
    // Safe default: no AI configured
    vi.mocked(describeLlmStatus).mockReturnValue(NONE_STATUS);
    vi.mocked(structureLifeEvents).mockResolvedValue({ status: 'ok', events: [] });
  });

  // ── Gated state ──────────────────────────────────────────────────────────

  describe('gated state (AI is not a cloud endpoint)', () => {
    it('shows the configure-cloud gate note when AI is not set', () => {
      render(<StoryAccelerator profileId={PROFILE_ID} />);
      expect(screen.getByText(/configure an AI cloud endpoint/i)).toBeTruthy();
    });

    it('shows the configure-cloud gate note when AI is local-only', () => {
      vi.mocked(describeLlmStatus).mockReturnValue(LOCAL_STATUS);
      render(<StoryAccelerator profileId={PROFILE_ID} />);
      expect(screen.getByText(/configure an AI cloud endpoint/i)).toBeTruthy();
    });

    it('does NOT render a submit button in the gated state', () => {
      render(<StoryAccelerator profileId={PROFILE_ID} />);
      expect(screen.queryByRole('button', { name: /extract events/i })).toBeNull();
    });

    it('does NOT call structureLifeEvents in the gated state', () => {
      render(<StoryAccelerator profileId={PROFILE_ID} />);
      expect(vi.mocked(structureLifeEvents)).not.toHaveBeenCalled();
    });
  });

  // ── Cloud opted-in ───────────────────────────────────────────────────────

  describe('cloud opted-in (OpenRouter)', () => {
    beforeEach(() => {
      vi.mocked(describeLlmStatus).mockReturnValue(CLOUD_STATUS);
    });

    it('renders the collapsible title button', () => {
      render(<StoryAccelerator profileId={PROFILE_ID} />);
      expect(screen.getByText(/paste your story/i)).toBeTruthy();
    });

    it('opens the panel when the title button is clicked', () => {
      render(<StoryAccelerator profileId={PROFILE_ID} />);
      fireEvent.click(screen.getByText(/paste your story/i));
      expect(screen.getByRole('textbox')).toBeTruthy();
    });

    it('shows the egress warning when the panel is open', () => {
      render(<StoryAccelerator profileId={PROFILE_ID} />);
      openAndEnterText('');
      expect(screen.getByText(/sent to your configured AI endpoint/i)).toBeTruthy();
    });

    it('calls structureLifeEvents with the pasted text on submit', async () => {
      render(<StoryAccelerator profileId={PROFILE_ID} />);
      openAndEnterText('I got married in January 2020');
      fireEvent.click(screen.getByRole('button', { name: /extract events/i }));

      await waitFor(() => {
        expect(vi.mocked(structureLifeEvents)).toHaveBeenCalledTimes(1);
      });
      expect(vi.mocked(structureLifeEvents).mock.calls[0]?.[0]).toBe('I got married in January 2020');
    });

    it('appends extracted events as reviewable draft rows with date + category', async () => {
      const results: RectificationEventInput[] = [
        { date: '2020-01-15', category: 'marriage' },
        { date: '2018-03-10', category: 'career_change' },
      ];
      vi.mocked(structureLifeEvents).mockResolvedValue({ status: 'ok', events: results });

      render(<StoryAccelerator profileId={PROFILE_ID} />);
      openAndEnterText('Married in Jan 2020, career change in 2018');
      fireEvent.click(screen.getByRole('button', { name: /extract events/i }));

      await waitFor(() => {
        expect(useLifeEventsStore.getState().getEvents(PROFILE_ID).length).toBe(2);
      });

      const events = useLifeEventsStore.getState().getEvents(PROFILE_ID);
      expect(events[0]?.date).toBe('2020-01-15');
      expect(events[0]?.category).toBe('marriage');
      expect(events[1]?.date).toBe('2018-03-10');
      expect(events[1]?.category).toBe('career_change');
    });

    it('preserves pre-existing store events and only appends new ones', async () => {
      useLifeEventsStore.setState({
        eventsByProfile: {
          [PROFILE_ID]: [
            { id: 'existing', date: '2010-05-01', category: 'relocation', createdAt: '2010-05-01T00:00:00Z' },
          ],
        },
      });
      vi.mocked(structureLifeEvents).mockResolvedValue({ status: 'ok', events: [
        { date: '2020-01-15', category: 'marriage' },
      ] });

      render(<StoryAccelerator profileId={PROFILE_ID} />);
      openAndEnterText('I got married in 2020');
      fireEvent.click(screen.getByRole('button', { name: /extract events/i }));

      await waitFor(() => {
        expect(useLifeEventsStore.getState().getEvents(PROFILE_ID).length).toBe(2);
      });

      const events = useLifeEventsStore.getState().getEvents(PROFILE_ID);
      expect(events[0]?.id).toBe('existing');
      expect(events[1]?.category).toBe('marriage');
    });

    it('does NOT auto-fit or navigate: the component has no navigation side-effects', async () => {
      vi.mocked(structureLifeEvents).mockResolvedValue({ status: 'ok', events: [
        { date: '2020-01-15', category: 'marriage' },
      ] });

      // The component intentionally takes no onContinue / navigation prop —
      // verify that submitting never triggers window.location changes.
      const hrefBefore = window.location.href;

      render(<StoryAccelerator profileId={PROFILE_ID} />);
      openAndEnterText('I got married in 2020');
      fireEvent.click(screen.getByRole('button', { name: /extract events/i }));

      await waitFor(() => {
        expect(useLifeEventsStore.getState().getEvents(PROFILE_ID).length).toBe(1);
      });

      expect(window.location.href).toBe(hrefBefore);
    });

    it('shows the empty-result message when no events are extracted', async () => {
      vi.mocked(structureLifeEvents).mockResolvedValue({ status: 'ok', events: [] });

      render(<StoryAccelerator profileId={PROFILE_ID} />);
      openAndEnterText('some text with no extractable events');
      fireEvent.click(screen.getByRole('button', { name: /extract events/i }));

      await waitFor(() => {
        expect(screen.getByText(/add them manually/i)).toBeTruthy();
      });
    });

    it('does NOT add events to the store when result is empty', async () => {
      vi.mocked(structureLifeEvents).mockResolvedValue({ status: 'ok', events: [] });

      render(<StoryAccelerator profileId={PROFILE_ID} />);
      openAndEnterText('no events here');
      fireEvent.click(screen.getByRole('button', { name: /extract events/i }));

      await waitFor(() => {
        expect(screen.getByText(/add them manually/i)).toBeTruthy();
      });
      expect(useLifeEventsStore.getState().getEvents(PROFILE_ID).length).toBe(0);
    });

    it('shows a loading indicator while extraction is in flight', async () => {
      let resolveExtraction!: (v: { status: 'ok'; events: RectificationEventInput[] }) => void;
      vi.mocked(structureLifeEvents).mockImplementation(
        () => new Promise<{ status: 'ok'; events: RectificationEventInput[] }>((r) => { resolveExtraction = r; }),
      );

      render(<StoryAccelerator profileId={PROFILE_ID} />);
      openAndEnterText('some text');
      fireEvent.click(screen.getByRole('button', { name: /extract events/i }));

      await waitFor(() => expect(screen.getByText(/extracting events/i)).toBeTruthy());

      resolveExtraction({ status: 'ok', events: [] });
      await waitFor(() => expect(screen.queryByText(/extracting events/i)).toBeNull());
    });

    it('shows the error message when the LLM call fails', async () => {
      vi.mocked(structureLifeEvents).mockResolvedValue({ status: 'error' });

      render(<StoryAccelerator profileId={PROFILE_ID} />);
      openAndEnterText('some text');
      fireEvent.click(screen.getByRole('button', { name: /extract events/i }));

      await waitFor(() => {
        expect(screen.getByText(/went wrong|failed/i)).toBeTruthy();
      });
      // The empty-result message must NOT appear
      expect(screen.queryByText(/add them manually/i)).toBeNull();
      // Store must be unchanged
      expect(useLifeEventsStore.getState().getEvents(PROFILE_ID).length).toBe(0);
    });
  });

  // ── Cloud custom endpoint (kind: 'cloud') ─────────────────────────────────

  describe('cloud opted-in (custom cloud endpoint)', () => {
    it('is actionable for kind: cloud (non-OpenRouter cloud endpoint)', () => {
      vi.mocked(describeLlmStatus).mockReturnValue(CLOUD_CUSTOM_STATUS);
      render(<StoryAccelerator profileId={PROFILE_ID} />);
      expect(screen.getByText(/paste your story/i)).toBeTruthy();
      // Gate note must NOT appear
      expect(screen.queryByText(/configure an AI cloud endpoint/i)).toBeNull();
    });
  });
});
