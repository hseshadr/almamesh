/**
 * useStreamingInterpretation Hook — local-first, in-browser STRUCTURED narration.
 *
 * Drives the structured 5-section Vedic interpretation generator from
 * @almamesh/llm (`streamStructuredInterpretation`) and writes its progress +
 * result into the persisted `useInterpretationStore`, keyed by `chartId`. The
 * dashboard + astrologer cards read the finished `VedicInterpretation` straight
 * from that store; this hook is the bridge that fills it.
 *
 * No backend. The only runtime egress is this optional, PII-redacted LLM call,
 * and it is fail-closed: in `local_only` mode a non-local endpoint refuses to
 * send anything (PrivacyViolationError). When no model is reachable / configured
 * we surface a friendly notice instead of crashing.
 *
 * The five JSON section calls fan out in parallel inside the generator; here we
 * translate its event stream into store mutations (startInterpretation /
 * markSectionComplete / setInterpretation / setError) and expose the derived
 * view-state the UI needs (status, per-section progress, error, isStreaming).
 */

import { useCallback, useRef } from 'react';
import {
  applyInterpretationSettings,
  LlmRequestError,
  PrivacyViolationError,
  resolveProviderConfig,
  streamStructuredInterpretation,
  type InterpretationSectionKey,
  type LlmEnv,
} from '@almamesh/llm';
import {
  useChartLibraryStore,
  useInterpretationStore,
  useLanguageStore,
  usePredictiveStore,
  useProfilesStore,
  type InterpretationStatus,
} from '@almamesh/store';
import type { SiderealChart } from '@almamesh/browser/types';
import type { VedicInterpretation } from '@almamesh/shared-types';
import type { SepViewMode } from '@almamesh/shared-types';

/** The five structured sections, in the order the generator announces them. */
export const INTERPRETATION_SECTIONS: readonly InterpretationSectionKey[] = [
  'core',
  'yoga',
  'guidance1',
  'guidance2',
  'remedial',
];

/** One section's completion flag, for a progress checklist in the UI. */
export interface SectionProgress {
  readonly key: InterpretationSectionKey;
  readonly complete: boolean;
}

export interface StreamInterpretationOptions {
  view_mode?: SepViewMode;
}

export interface UseStreamingInterpretationResult {
  /** Begin (or restart) generation for a chart; resolves when done/aborted. */
  streamInterpretation: (chartId: string, options?: StreamInterpretationOptions) => Promise<void>;
  /** The finished structured reading for the active chart, if complete. */
  interpretation: VedicInterpretation | undefined;
  /** Lifecycle of the active chart's interpretation. */
  status: InterpretationStatus;
  /** Per-section completion flags (the 5 keys), for a progress checklist. */
  sections: readonly SectionProgress[];
  /** Failure message; present once `status === 'error'`. */
  error: string | null;
  /** True while a generation is in flight. */
  isStreaming: boolean;
  /** Drop the active chart's interpretation entry. */
  reset: () => void;
  /** Abort the in-flight generation. */
  cancel: () => void;
}

// Friendly, non-technical guidance shown when on-device narration cannot run.
const NOT_CONFIGURED_NOTICE =
  'Configure a local or OpenRouter model to generate interpretations. ' +
  'By default AlmaMesh expects a local model at http://localhost:11434/v1 (Ollama). ' +
  'Set VITE_LLM_API_BASE / VITE_LLM_MODEL (and, for cloud, VITE_LLM_API_KEY + VITE_LLM_PRIVACY_MODE=cloud_premium).';

/**
 * Resolve the LLM env for the INTERPRETATION path: build-time Vite env, with any
 * browser-local Settings overrides (localStorage) taking precedence, and the
 * EXPLICIT interpretation model resolved via applyInterpretationSettings (the
 * frontier default, distinct from the chat tier). Centralized so the privacy
 * default (local_only) is explicit and the override layer is the single source
 * of truth.
 */
function readLlmEnv(): LlmEnv {
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  return applyInterpretationSettings({
    VITE_LLM_API_BASE: env.VITE_LLM_API_BASE,
    VITE_LLM_API_KEY: env.VITE_LLM_API_KEY,
    VITE_LLM_MODEL: env.VITE_LLM_MODEL,
    VITE_LLM_PRIVACY_MODE: env.VITE_LLM_PRIVACY_MODE,
    VITE_LLM_ENGINE: env.VITE_LLM_ENGINE,
  });
}

/**
 * Compose the persisted RAW engine predictive contexts onto the natal chart
 * (Spec 062, LLM delta 1) so interpretation + chat prompts carry the engine's
 * transit/strength/varga/domain blocks — activating the sanitizer + facts
 * pipeline that already exists in `@almamesh/llm`.
 *
 * Strictly additive and FAIL-OPEN: contexts that are absent (pre-v2 persisted
 * blob), not `ready`, or belong to a different profile leave the chart
 * untouched — narration degrades gracefully to natal-only, NEVER an error.
 * Privacy is unchanged: the composed chart still flows through
 * `sanitizeChartForLlm`, which reduces every predictive date to month
 * precision before any prompt is built.
 *
 * `chartId` mirrors `usePredictiveLayer`'s profile-key fallback
 * (`activeProfileId ?? chart_id ?? 'primary'`) so a stale profile's contexts
 * can never be composed onto another profile's chart.
 */
export function withRawPredictive(chart: SiderealChart, chartId: string | null): SiderealChart {
  const { status, rawContexts, profileKey } = usePredictiveStore.getState();
  if (status !== 'ready' || !rawContexts) {
    return chart;
  }
  const expectedKey = useProfilesStore.getState().activeProfileId ?? chartId ?? 'primary';
  if (profileKey !== expectedKey) {
    return chart;
  }
  return { ...chart, ...rawContexts };
}

/** Map a thrown error to a friendly, user-facing message. */
function describeError(err: unknown): string {
  if (err instanceof PrivacyViolationError) {
    return err.message;
  }
  if (err instanceof LlmRequestError || err instanceof TypeError) {
    // TypeError is what `fetch` throws when the endpoint is unreachable.
    return NOT_CONFIGURED_NOTICE;
  }
  return err instanceof Error ? err.message : 'Failed to generate interpretation';
}

export function useStreamingInterpretation(chartId?: string | null): UseStreamingInterpretationResult {
  // Subscribe to the store so the component re-renders as events land.
  const entry = useInterpretationStore((s) => (chartId ? s.byChart[chartId] : undefined));
  const startInterpretation = useInterpretationStore((s) => s.startInterpretation);
  const markSectionComplete = useInterpretationStore((s) => s.markSectionComplete);
  const setInterpretation = useInterpretationStore((s) => s.setInterpretation);
  const setError = useInterpretationStore((s) => s.setError);
  const resetEntry = useInterpretationStore((s) => s.reset);

  // The persisted UI language threads into the prompt so the reading is narrated
  // in the user's chosen language; the engine math is untouched. Read as a hook
  // (this IS a React hook) so the latest choice is used on the next generation.
  const language = useLanguageStore((s) => s.language);

  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (chartId) {
      resetEntry(chartId);
    }
  }, [chartId, resetEntry]);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const streamInterpretation = useCallback(
    async (id: string, options: StreamInterpretationOptions = {}) => {
      const stored = useChartLibraryStore.getState().getChart(id);
      const chart = stored?.sidereal_chart;
      if (!chart) {
        // No raw engine output to interpret (e.g. a pre-structured persisted chart).
        startInterpretation(id);
        setError(id, 'This chart needs to be regenerated before it can be interpreted on-device.');
        return;
      }

      const config = resolveProviderConfig(readLlmEnv());

      const controller = new AbortController();
      abortControllerRef.current = controller;

      startInterpretation(id);
      try {
        for await (const event of streamStructuredInterpretation({
          // Compose the persisted raw predictive contexts (when ready for this
          // profile) so the six section prompts carry the delimited engine
          // predictive block; absent contexts → natal-only, exactly as before.
          chart: withRawPredictive(chart, id),
          config,
          mode: options.view_mode === 'expert' ? 'expert' : 'layman',
          language,
          signal: controller.signal,
        })) {
          if (controller.signal.aborted) return;
          if (event.type === 'section_complete') {
            markSectionComplete(id, event.section);
          } else if (event.type === 'complete') {
            setInterpretation(id, event.interpretation, new Date().toISOString());
          }
          // `section_start` is informational; per-section `error` events degrade
          // that section to empty and the run still completes — no fatal stop.
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(id, describeError(err));
      }
    },
    [language, markSectionComplete, setError, setInterpretation, startInterpretation]
  );

  const status: InterpretationStatus = entry?.status ?? 'idle';
  const completed = entry?.sections ?? {};
  const sections: readonly SectionProgress[] = INTERPRETATION_SECTIONS.map((key) => ({
    key,
    complete: Boolean(completed[key]),
  }));

  return {
    streamInterpretation,
    interpretation: entry?.interpretation,
    status,
    sections,
    error: entry?.error ?? null,
    isStreaming: status === 'generating',
    reset,
    cancel,
  };
}

export default useStreamingInterpretation;
