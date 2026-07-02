/**
 * ConversationalAccelerator — streaming multi-turn interview loop.
 *
 * Tests assert:
 *  - gated state (AI not cloud-configured): manual-only note shown, no text input.
 *  - cloud opted-in: opening assistant message + text input rendered; submitting a
 *    user turn calls the (stubbed) stream fn, then the gather fn, and flushes
 *    returned events into the life-events store with the correct category + precision.
 *
 * The two LLM functions (streamFn / gatherFn) are injected via props so tests
 * control streaming and extraction deterministically without any network.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useLifeEventsStore, useLanguageStore } from '@almamesh/store';
import type { LlmStatus } from '@almamesh/llm';
import type { RectificationEventInput } from '@almamesh/shared-types';

// ── Mock @almamesh/llm for cloud-gate resolution (describeLlmStatus) ─────────
// streamRectificationInterview / gatherEventsFromTurn are injected via props;
// they don't need to be callable from the module in tests.
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
  streamRectificationInterview: vi.fn(),
  gatherEventsFromTurn: vi.fn(),
}));

// Import after mock declarations (vi.mock is hoisted at runtime)
import '../../../i18n/config';
import { ConversationalAccelerator } from './ConversationalAccelerator';
import type { ConversationalAcceleratorProps } from './ConversationalAccelerator';
import { describeLlmStatus } from '@almamesh/llm';

const PROFILE_ID = 'test-profile';

const CLOUD_STATUS: LlmStatus = { kind: 'openrouter', label: 'OpenRouter', configured: true };
const NONE_STATUS: LlmStatus = { kind: 'none', label: 'Not set', configured: false };

/** Build a stub streamFn that yields each token in sequence. */
function makeStubStream(
  tokens: string[],
): NonNullable<ConversationalAcceleratorProps['streamFn']> {
  return async function* (_params) {
    for (const token of tokens) {
      yield token;
    }
  };
}

/** Build a stub gatherFn that succeeds with the given events. */
function makeStubGather(
  events: RectificationEventInput[],
): NonNullable<ConversationalAcceleratorProps['gatherFn']> {
  return async (_userText, _config, _language) => ({ status: 'ok', events });
}

describe('ConversationalAccelerator', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useLanguageStore.setState({ language: 'en' });
    useLifeEventsStore.setState({ eventsByProfile: {} });
    // Default: no cloud endpoint configured
    vi.mocked(describeLlmStatus).mockReturnValue(NONE_STATUS);
  });

  // ── Gated state ─────────────────────────────────────────────────────────

  describe('gated state (AI not cloud-configured)', () => {
    it('renders a manual-only note with no text input', () => {
      vi.mocked(describeLlmStatus).mockReturnValue(NONE_STATUS);
      render(
        <ConversationalAccelerator
          profileId={PROFILE_ID}
          streamFn={makeStubStream([])}
          gatherFn={makeStubGather([])}
        />,
      );
      // No input when gated
      expect(screen.queryByRole('textbox')).toBeNull();
      // A visible gated note container
      expect(screen.getByTestId('chat-gated')).toBeTruthy();
    });

    it('shows the gated note for a local-only endpoint too', () => {
      vi.mocked(describeLlmStatus).mockReturnValue({
        kind: 'local',
        label: 'Local',
        configured: true,
      });
      render(
        <ConversationalAccelerator
          profileId={PROFILE_ID}
          streamFn={makeStubStream([])}
          gatherFn={makeStubGather([])}
        />,
      );
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(screen.getByTestId('chat-gated')).toBeTruthy();
    });
  });

  // ── Cloud opted-in ───────────────────────────────────────────────────────

  describe('cloud opted-in', () => {
    beforeEach(() => {
      vi.mocked(describeLlmStatus).mockReturnValue(CLOUD_STATUS);
    });

    it('renders an opening assistant message and a text input', () => {
      render(
        <ConversationalAccelerator
          profileId={PROFILE_ID}
          streamFn={makeStubStream([])}
          gatherFn={makeStubGather([])}
        />,
      );
      expect(screen.getByRole('textbox')).toBeTruthy();
      expect(screen.getByTestId('chat-opening')).toBeTruthy();
    });

    it('streams assistant reply and flushes the extracted event into the store', async () => {
      const extracted: RectificationEventInput[] = [
        { date: '2004-04-15', category: 'marriage', precision: 'month' },
      ];

      render(
        <ConversationalAccelerator
          profileId={PROFILE_ID}
          streamFn={makeStubStream(['Great, tell me more!'])}
          gatherFn={makeStubGather(extracted)}
        />,
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'I got married in April 2004' } });
      fireEvent.click(screen.getByRole('button', { name: /send/i }));

      // Wait for async flush to complete
      await waitFor(() => {
        expect(useLifeEventsStore.getState().getEvents(PROFILE_ID).length).toBe(1);
      });

      const events = useLifeEventsStore.getState().getEvents(PROFILE_ID);
      expect(events[0]?.category).toBe('marriage');
      expect(events[0]?.precision).toBe('month');
      expect(events[0]?.date).toBe('2004-04-15');
    });

    it('flushes multiple extracted events with correct category and precision', async () => {
      const extracted: RectificationEventInput[] = [
        { date: '2004-04-15', category: 'marriage', precision: 'month' },
        { date: '2010-01-01', category: 'career_change', precision: 'year' },
      ];

      render(
        <ConversationalAccelerator
          profileId={PROFILE_ID}
          streamFn={makeStubStream(['Wonderful, thank you!'])}
          gatherFn={makeStubGather(extracted)}
        />,
      );

      fireEvent.change(screen.getByRole('textbox'), {
        target: { value: 'Got married in April 2004, changed jobs around 2010' },
      });
      fireEvent.click(screen.getByRole('button', { name: /send/i }));

      await waitFor(() => {
        expect(useLifeEventsStore.getState().getEvents(PROFILE_ID).length).toBe(2);
      });

      const events = useLifeEventsStore.getState().getEvents(PROFILE_ID);
      expect(events[0]?.category).toBe('marriage');
      expect(events[0]?.precision).toBe('month');
      expect(events[1]?.category).toBe('career_change');
      expect(events[1]?.precision).toBe('year');
    });

    it("stores the user's own typed text as each flushed event's summary (fallback when extractor omits it)", async () => {
      const extracted: RectificationEventInput[] = [
        { date: '2004-04-15', category: 'marriage', precision: 'month' },
      ];
      render(
        <ConversationalAccelerator
          profileId={PROFILE_ID}
          streamFn={makeStubStream(['Got it!'])}
          gatherFn={makeStubGather(extracted)}
        />,
      );

      fireEvent.change(screen.getByRole('textbox'), {
        target: { value: 'I got married in April 2004 in Pune' },
      });
      fireEvent.click(screen.getByRole('button', { name: /send/i }));

      await waitFor(() => {
        expect(useLifeEventsStore.getState().getEvents(PROFILE_ID).length).toBe(1);
      });

      expect(useLifeEventsStore.getState().getEvents(PROFILE_ID)[0]?.summary).toBe(
        'I got married in April 2004 in Pune',
      );
    });

    it('prefers a summary returned by the extractor over the raw input text', async () => {
      const extracted: RectificationEventInput[] = [
        { date: '2004-04-15', category: 'marriage', precision: 'month', summary: 'Married Priya' },
      ];
      render(
        <ConversationalAccelerator
          profileId={PROFILE_ID}
          streamFn={makeStubStream(['Got it!'])}
          gatherFn={makeStubGather(extracted)}
        />,
      );

      fireEvent.change(screen.getByRole('textbox'), {
        target: { value: 'a long rambly message about my wedding day' },
      });
      fireEvent.click(screen.getByRole('button', { name: /send/i }));

      await waitFor(() => {
        expect(useLifeEventsStore.getState().getEvents(PROFILE_ID).length).toBe(1);
      });

      expect(useLifeEventsStore.getState().getEvents(PROFILE_ID)[0]?.summary).toBe('Married Priya');
    });

    it('preserves pre-existing store events and only appends new ones', async () => {
      useLifeEventsStore.setState({
        eventsByProfile: {
          [PROFILE_ID]: [
            {
              id: 'pre-existing',
              date: '2000-06-01',
              category: 'relocation',
              createdAt: '2000-06-01T00:00:00Z',
            },
          ],
        },
      });

      render(
        <ConversationalAccelerator
          profileId={PROFILE_ID}
          streamFn={makeStubStream(['Got it!'])}
          gatherFn={makeStubGather([{ date: '2004-04-15', category: 'marriage', precision: 'month' }])}
        />,
      );

      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'I got married in 2004' } });
      fireEvent.click(screen.getByRole('button', { name: /send/i }));

      await waitFor(() => {
        expect(useLifeEventsStore.getState().getEvents(PROFILE_ID).length).toBe(2);
      });

      const events = useLifeEventsStore.getState().getEvents(PROFILE_ID);
      expect(events[0]?.id).toBe('pre-existing');
      expect(events[1]?.category).toBe('marriage');
    });

    it('clears busy and streaming draft when the stream throws mid-flight', async () => {
      // streamFn that yields a partial token then throws — simulates a network error.
      const errorStream: NonNullable<ConversationalAcceleratorProps['streamFn']> =
        async function* (_params) {
          yield 'partial…';
          throw new Error('stream failure');
        };

      render(
        <ConversationalAccelerator
          profileId={PROFILE_ID}
          streamFn={errorStream}
          gatherFn={makeStubGather([])}
        />,
      );

      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test input' } });
      fireEvent.click(screen.getByRole('button', { name: /send/i }));

      // After the error path settles, busy must be cleared (input re-enabled).
      await waitFor(() => {
        const input = screen.getByRole('textbox') as HTMLInputElement;
        expect(input.disabled).toBe(false);
      });

      // Streaming draft must be gone — "partial…" should not be rendered anywhere.
      expect(screen.queryByText('partial…')).toBeNull();

      // An inline error status must be visible (M1 fix).
      const errorEl = screen.getByRole('status');
      expect(errorEl).toBeTruthy();
      expect(errorEl.textContent).toMatch(/couldn't reach the AI/i);

      // Component must still be alive (no crash).
      expect(screen.getByRole('textbox')).toBeTruthy();

      // No events flushed on a pure stream error.
      expect(useLifeEventsStore.getState().getEvents(PROFILE_ID).length).toBe(0);
    });

    it('clears the error message on the next submit attempt', async () => {
      // First submit triggers error; second submit succeeds — error must disappear.
      let useErrorStream = true;
      const switchableStream: NonNullable<ConversationalAcceleratorProps['streamFn']> =
        async function* (_params) {
          if (useErrorStream) {
            yield 'partial…';
            throw new Error('stream failure');
          } else {
            yield 'All good!';
          }
        };

      render(
        <ConversationalAccelerator
          profileId={PROFILE_ID}
          streamFn={switchableStream}
          gatherFn={makeStubGather([])}
        />,
      );

      // First submit — triggers error.
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'first message' } });
      fireEvent.click(screen.getByRole('button', { name: /send/i }));
      await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());

      // Second submit — error must be cleared at the start.
      useErrorStream = false;
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'second message' } });
      fireEvent.click(screen.getByRole('button', { name: /send/i }));

      await waitFor(() => {
        expect(screen.queryByRole('status')).toBeNull();
      });
    });

    it('surfaces the chat error affordance when gather FAILS (a dated milestone must never silently not count)', async () => {
      // gatherFn resolving { status: 'error' } is a REAL failure (network/parse),
      // distinct from a genuinely event-free turn — the user must see it.
      const failingGather: NonNullable<ConversationalAcceleratorProps['gatherFn']> = async () => ({
        status: 'error',
      });

      render(
        <ConversationalAccelerator
          profileId={PROFILE_ID}
          streamFn={makeStubStream(['Thanks — noted!'])}
          gatherFn={failingGather}
        />,
      );

      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'I married in June 2004' } });
      fireEvent.click(screen.getByRole('button', { name: /send/i }));

      // The inline chat error must appear, with the gather-specific copy.
      await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
      expect(screen.getByRole('status').textContent).toMatch(/may not have been counted/i);

      // No events flushed, and the input is usable again (no wedge).
      expect(useLifeEventsStore.getState().getEvents(PROFILE_ID).length).toBe(0);
      await waitFor(() =>
        expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(false),
      );
    });

    it('does not show an error for a genuinely event-free turn (ok + empty)', async () => {
      const emptyOkGather = vi.fn(makeStubGather([]));

      render(
        <ConversationalAccelerator
          profileId={PROFILE_ID}
          streamFn={makeStubStream(['Tell me more!'])}
          gatherFn={emptyOkGather}
        />,
      );

      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'not sure about dates' } });
      fireEvent.click(screen.getByRole('button', { name: /send/i }));

      await waitFor(() => expect(emptyOkGather).toHaveBeenCalledOnce());
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('does not add to the store when gather returns no events', async () => {
      // Use vi.fn() so we can wait for the gather call as the completion sentinel.
      // The gather call is registered synchronously (before the returned Promise
      // resolves), giving waitFor a reliable polling target that doesn't require
      // React to flush a re-render.
      const gatherStub = vi.fn(makeStubGather([]));

      render(
        <ConversationalAccelerator
          profileId={PROFILE_ID}
          streamFn={makeStubStream(['Tell me more!'])}
          gatherFn={gatherStub}
        />,
      );

      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'I am not sure about dates' } });
      fireEvent.click(screen.getByRole('button', { name: /send/i }));

      // Wait until the gather function has been called (signals streaming is done).
      await waitFor(() => expect(gatherStub).toHaveBeenCalledOnce());

      // Gather returned [] so no events should be in the store.
      expect(useLifeEventsStore.getState().getEvents(PROFILE_ID).length).toBe(0);
    });

    // ── Chart-chat parity: textarea, MessageBubble, processing indicators ────

    it('renders the interview input as a multi-line <textarea>, not a single-line input', () => {
      render(
        <ConversationalAccelerator
          profileId={PROFILE_ID}
          streamFn={makeStubStream([])}
          gatherFn={makeStubGather([])}
        />,
      );
      const box = screen.getByRole('textbox');
      expect(box.tagName).toBe('TEXTAREA');
    });

    it('renders the opening turn with the shared MessageBubble (assistant bubble testid)', () => {
      render(
        <ConversationalAccelerator
          profileId={PROFILE_ID}
          streamFn={makeStubStream([])}
          gatherFn={makeStubGather([])}
        />,
      );
      // MessageBubble stamps data-testid="chat-message-<role>" — proves reuse.
      expect(screen.getByTestId('chat-message-assistant')).toBeTruthy();
    });

    it('renders the submitted user turn as a MessageBubble', async () => {
      render(
        <ConversationalAccelerator
          profileId={PROFILE_ID}
          streamFn={makeStubStream(['ok'])}
          gatherFn={makeStubGather([])}
        />,
      );
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A memorable move' } });
      fireEvent.click(screen.getByRole('button', { name: /send/i }));
      await waitFor(() => expect(screen.getByTestId('chat-message-user')).toBeTruthy());
    });

    it('submits on Enter and does not submit on Shift+Enter', async () => {
      const gatherStub = vi.fn(makeStubGather([]));
      render(
        <ConversationalAccelerator
          profileId={PROFILE_ID}
          streamFn={makeStubStream(['ok'])}
          gatherFn={gatherStub}
        />,
      );
      const box = screen.getByRole('textbox');
      fireEvent.change(box, { target: { value: 'my event' } });
      // Shift+Enter inserts a newline — must NOT submit.
      fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
      expect(gatherStub).not.toHaveBeenCalled();
      // Plain Enter submits.
      fireEvent.keyDown(box, { key: 'Enter' });
      await waitFor(() => expect(gatherStub).toHaveBeenCalledOnce());
    });

    it('shows a thinking indicator while awaiting the model, then hides it once tokens stream', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const gatedStream: NonNullable<ConversationalAcceleratorProps['streamFn']> =
        async function* (_params) {
          await gate;
          yield 'first token';
        };
      render(
        <ConversationalAccelerator
          profileId={PROFILE_ID}
          streamFn={gatedStream}
          gatherFn={makeStubGather([])}
        />,
      );
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'my event' } });
      fireEvent.click(screen.getByRole('button', { name: /send/i }));
      // Awaiting the first token: thinking indicator visible, no draft yet.
      await waitFor(() => expect(screen.getByTestId('chat-thinking')).toBeTruthy());
      release();
      // Once tokens stream, the thinking indicator yields to the draft.
      await waitFor(() => expect(screen.queryByTestId('chat-thinking')).toBeNull());
    });

    it('shows a reading indicator during post-turn event extraction (not the thinking one)', async () => {
      type GatherResult = Awaited<ReturnType<NonNullable<ConversationalAcceleratorProps['gatherFn']>>>;
      let releaseGather!: (result: GatherResult) => void;
      const gatherGate = new Promise<GatherResult>((resolve) => {
        releaseGather = resolve;
      });
      const gatedGather: NonNullable<ConversationalAcceleratorProps['gatherFn']> = async () =>
        gatherGate;
      render(
        <ConversationalAccelerator
          profileId={PROFILE_ID}
          streamFn={makeStubStream(['done'])}
          gatherFn={gatedGather}
        />,
      );
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'my event' } });
      fireEvent.click(screen.getByRole('button', { name: /send/i }));
      // Extraction in-flight: reading indicator shown, thinking indicator not.
      await waitFor(() => expect(screen.getByTestId('chat-reading')).toBeTruthy());
      expect(screen.queryByTestId('chat-thinking')).toBeNull();
      releaseGather({ status: 'ok', events: [] });
      await waitFor(() => expect(screen.queryByTestId('chat-reading')).toBeNull());
    });
  });
});
