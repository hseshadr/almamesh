/**
 * ConversationalAccelerator — streaming multi-turn interview loop (slice 5).
 *
 * A warm, one-question-at-a-time AI chat that elicits DATED life events and
 * flushes them into the life-events store as reviewable draft rows. The
 * transcript is local to this component — only the extracted events persist.
 *
 * GATING — only actionable with a CLOUD AI endpoint configured. The gated state
 * renders a calm static note so users always have the manual-entry fallback.
 *
 * EGRESS — an explicit one-line warning is shown before every submission so the
 * user knows their message is sent to their configured AI endpoint.
 *
 * INJECTION — streamFn and gatherFn default to the real LLM imports but can be
 * replaced via props for deterministic testing without any network calls.
 *
 * ACCESSIBILITY — ARIA live region on the streaming draft; role="log" on the
 * completed transcript; labeled input; focus returned to input after each turn.
 */
import type { ReactElement } from 'react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLifeEventsStore } from '@almamesh/store';
import {
  streamRectificationInterview as defaultStreamFn,
  gatherEventsFromTurn as defaultGatherFn,
  type ChatTurn,
} from '@almamesh/llm';
import type { RectificationEventInput } from '@almamesh/shared-types';
import { isCloudConfigured, resolveConfig, toPromptLanguage } from './rectifyLlmConfig';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ConversationalAcceleratorProps {
  /** The profile whose life-events store will receive the extracted rows. */
  readonly profileId: string;
  /**
   * Streaming interview function — defaults to the real LLM implementation.
   * Override in tests to yield tokens synchronously without any network call.
   */
  readonly streamFn?: typeof defaultStreamFn;
  /**
   * Event-extraction function — defaults to the real LLM implementation.
   * Override in tests to return synthetic events without any network call.
   */
  readonly gatherFn?: typeof defaultGatherFn;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format a captured event as a human-readable chip label. */
function formatChip(ev: RectificationEventInput): string {
  const label = ev.category.replace(/_/g, ' ');
  const cap = label.charAt(0).toUpperCase() + label.slice(1);
  let date = ev.date;
  const precision = ev.precision ?? 'exact';
  if (precision === 'month') date = ev.date.slice(0, 7);
  else if (precision === 'year' || precision === 'approx') date = ev.date.slice(0, 4);
  return `${cap} · ${date} · ${precision}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ConversationalAccelerator({
  profileId,
  streamFn = defaultStreamFn,
  gatherFn = defaultGatherFn,
}: ConversationalAcceleratorProps): ReactElement {
  const { t, i18n } = useTranslation('rectify');
  const addEvent = useLifeEventsStore((s) => s.addEvent);
  const editEvent = useLifeEventsStore((s) => s.editEvent);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Lazy-initialise with the opening assistant turn so it reflects the current
  // language at mount time. Language changes during an active session are
  // intentionally not tracked — restarting the wizard resets correctly.
  const [messages, setMessages] = useState<readonly ChatTurn[]>(() => [
    { role: 'assistant', content: t('chat.opening') },
  ]);
  const [streamingDraft, setStreamingDraft] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [captured, setCaptured] = useState<readonly RectificationEventInput[]>([]);

  // ── Cloud gate ────────────────────────────────────────────────────────────
  if (!isCloudConfigured()) {
    return (
      <div
        data-testid="chat-gated"
        className="rounded-lg border border-border-subtle bg-surface-secondary p-4"
      >
        <p className="text-sm text-text-secondary">{t('chat.gated_note')}</p>
      </div>
    );
  }

  // ── Submit handler ────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || busy) return;

    setInput('');
    setBusy(true);

    const userTurn: ChatTurn = { role: 'user', content: trimmed };
    // Append user turn first so the history passed to the LLM is up to date.
    const updatedHistory = [...messages, userTurn];
    setMessages(updatedHistory);

    // Cancel any in-flight stream from a previous turn.
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const config = resolveConfig();
      const language = toPromptLanguage(i18n.language);

      // ── Stream assistant reply token-by-token ──────────────────────────
      let draft = '';
      setStreamingDraft('');
      for await (const token of streamFn({
        history: updatedHistory,
        config,
        language,
        signal: abortRef.current.signal,
      })) {
        draft += token;
        setStreamingDraft(draft);
      }

      // Commit the completed assistant message and clear the draft.
      setMessages((prev) => [...prev, { role: 'assistant', content: draft }]);
      setStreamingDraft('');

      // ── Extract and flush life events ──────────────────────────────────
      const extracted = await gatherFn(trimmed, config, language);
      if (extracted.length > 0) {
        // Snapshot the current event count so we can identify newly added rows.
        const beforeCount = useLifeEventsStore.getState().getEvents(profileId).length;

        // addEvent accepts LifeEventInput (description + date) — category and
        // precision are patched via editEvent because LifeEventInput has no
        // category field.
        for (const ev of extracted) {
          addEvent(profileId, { description: ev.category, date: ev.date });
        }

        const after = useLifeEventsStore.getState().getEvents(profileId);
        for (let i = 0; i < extracted.length; i++) {
          const evt = after[beforeCount + i];
          const ev = extracted[i];
          if (evt && ev) {
            editEvent(profileId, evt.id, {
              category: ev.category,
              ...(ev.precision ? { precision: ev.precision } : {}),
            });
          }
        }

        setCaptured((prev) => [...prev, ...extracted]);
      }
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">
      {/* Egress warning — mirrors the StoryAccelerator warning */}
      <p className="text-xs text-text-secondary">{t('accelerator.warning')}</p>

      {/* Completed transcript — role="log" implies aria-live="polite" */}
      <div
        role="log"
        aria-label={t('chat.transcript_label')}
        className="flex flex-col gap-2"
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            data-testid={i === 0 && msg.role === 'assistant' ? 'chat-opening' : undefined}
            className={
              msg.role === 'assistant'
                ? 'rounded-lg bg-surface-secondary px-3 py-2 text-sm text-text-primary'
                : 'self-end rounded-lg bg-accent-primary/10 px-3 py-2 text-sm text-text-secondary'
            }
          >
            {msg.content}
          </div>
        ))}

        {/* Streaming draft — live region so screen readers announce tokens */}
        {streamingDraft && (
          <div
            aria-live="polite"
            aria-atomic="false"
            className="rounded-lg bg-surface-secondary px-3 py-2 text-sm text-text-primary"
          >
            {streamingDraft}
          </div>
        )}
      </div>

      {/* Captured event chips */}
      {captured.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {captured.map((ev, i) => (
            <span
              key={i}
              data-testid="captured-chip"
              className="rounded-full bg-accent-primary/10 px-2 py-0.5 text-xs text-accent-primary"
            >
              {formatChip(ev)}
            </span>
          ))}
        </div>
      )}

      {/* Input row */}
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="flex gap-2"
      >
        <input
          ref={inputRef}
          id="chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          placeholder={t('chat.input_placeholder')}
          aria-label={t('chat.input_label')}
          className="flex-1 rounded-lg border border-border-subtle bg-surface-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent-primary disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('chat.send')}
        </button>
      </form>
    </div>
  );
}
