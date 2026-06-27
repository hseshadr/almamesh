/**
 * StoryAccelerator — optional "paste your story" AI accelerator (slice 4).
 *
 * Collapsible panel that lets the user paste free-form prose and have the LLM
 * extract life events as reviewable draft rows in the structured-entry wizard.
 *
 * GATING — only actionable when the user has opted into a CLOUD AI endpoint
 * (describeLlmStatus().kind === 'openrouter' | 'cloud' AND configured).
 * Local-only and unconfigured states render a static "configure cloud AI" note.
 *
 * EGRESS — an explicit warning is shown before every submission so the user
 * knows their text — including names/places — is sent to their configured AI endpoint.
 *
 * OUTPUT — extracted events are PRE-FILLED as reviewable draft rows in the
 * store (date + category set). The user reviews and may edit them; no auto-fit
 * or navigation happens.
 */
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLifeEventsStore } from '@almamesh/store';
import {
  describeLlmStatus,
  readLlmSettings,
  applyLlmSettings,
  resolveProviderConfig,
  structureLifeEvents,
  type LlmEnv,
  type PromptLanguage,
} from '@almamesh/llm';

export interface StoryAcceleratorProps {
  /** The profile whose life-events store will receive the extracted rows. */
  readonly profileId: string;
}

/** Returns true when the user has opted into a cloud AI endpoint. */
function isCloudConfigured(): boolean {
  const status = describeLlmStatus(readLlmSettings());
  return (status.kind === 'openrouter' || status.kind === 'cloud') && status.configured;
}

/** Map i18next language to a supported PromptLanguage ('en' fallback). */
function toPromptLanguage(i18nLang: string): PromptLanguage {
  if (i18nLang.startsWith('es')) return 'es';
  if (i18nLang.startsWith('pt')) return 'pt';
  return 'en';
}

export function StoryAccelerator({ profileId }: StoryAcceleratorProps): ReactElement {
  const { t, i18n } = useTranslation('rectify');
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const [showError, setShowError] = useState(false);

  const addEvent = useLifeEventsStore((s) => s.addEvent);
  const editEvent = useLifeEventsStore((s) => s.editEvent);

  const cloudEnabled = isCloudConfigured();

  // ── Gated state: no cloud endpoint configured ──────────────────────────
  if (!cloudEnabled) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-secondary p-4">
        <p className="text-sm text-text-secondary">{t('accelerator.gated_note')}</p>
      </div>
    );
  }

  // ── Submit handler ─────────────────────────────────────────────────────
  const handleSubmit = async (): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setShowEmpty(false);
    setShowError(false);

    try {
      const settings = readLlmSettings();
      const env = applyLlmSettings(import.meta.env as LlmEnv, settings);
      const config = resolveProviderConfig(env);
      const language = toPromptLanguage(i18n.language);

      const result = await structureLifeEvents(trimmed, config, language);

      if (result.status === 'error') {
        setShowError(true);
        return;
      }

      const { events } = result;
      if (events.length === 0) {
        setShowEmpty(true);
        return;
      }

      // Append each extracted event as a reviewable draft (date + category set).
      // We snapshot the count before adding so we can find the new events by index.
      const store = useLifeEventsStore.getState();
      const beforeCount = store.getEvents(profileId).length;

      for (const event of events) {
        // description is required by LifeEventInput; category is a readable fallback.
        addEvent(profileId, { description: event.category, date: event.date });
      }

      // Patch category onto each newly added event (LifeEventInput has no category field).
      const after = useLifeEventsStore.getState().getEvents(profileId);
      for (let i = 0; i < events.length; i++) {
        const evt = after[beforeCount + i];
        const cat = events[i]?.category;
        if (evt && cat) {
          editEvent(profileId, evt.id, { category: cat });
        }
      }

      // Reset panel state after a successful extraction.
      setText('');
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Actionable panel ───────────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-border-subtle">
      {/* Toggle button */}
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-text-primary hover:bg-surface-secondary focus:outline-none focus:ring-1 focus:ring-accent-primary"
      >
        <span>{t('accelerator.title')}</span>
        <span aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Collapsible body */}
      {isOpen && (
        <div className="flex flex-col gap-3 border-t border-border-subtle px-4 pb-4 pt-3">
          {/* Egress warning — always visible before submission */}
          <p className="rounded bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            {t('accelerator.warning')}
          </p>

          {/* Story textarea */}
          <textarea
            rows={4}
            value={text}
            disabled={isLoading}
            placeholder={t('accelerator.textarea_placeholder')}
            aria-label={t('accelerator.textarea_placeholder')}
            onChange={(e) => {
              setText(e.target.value);
              setShowEmpty(false);
              setShowError(false);
            }}
            className="w-full rounded border border-border-subtle bg-surface-primary p-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent-primary disabled:opacity-60"
          />

          {/* Status feedback */}
          {isLoading && (
            <p className="text-xs text-text-tertiary">{t('accelerator.loading')}</p>
          )}
          {showError && !isLoading && (
            <p className="text-xs text-red-600">{t('accelerator.error')}</p>
          )}
          {showEmpty && !isLoading && (
            <p className="text-xs text-text-secondary">{t('accelerator.empty_result')}</p>
          )}

          {/* Submit */}
          <button
            type="button"
            disabled={isLoading || !text.trim()}
            onClick={() => void handleSubmit()}
            className="w-fit rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('accelerator.submit')}
          </button>
        </div>
      )}
    </div>
  );
}
