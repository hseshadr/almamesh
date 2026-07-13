/**
 * useStreamingInterpretation Hook — local-first, in-browser STRUCTURED narration.
 *
 * Drives the structured 5-section Vedic interpretation generator from
 * @almamesh/llm (`streamStructuredInterpretation`) and writes its progress +
 * result into the persisted `useInterpretationStore`, keyed by `chartId`. The
 * dashboard + astrologer cards read the finished `VedicInterpretation` straight
 * from that store; this hook is the bridge that fills it.
 *
 * No backend. This hook's only egress is the optional, PII-redacted LLM call,
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
  configProvenance,
  LlmRequestError,
  PrivacyViolationError,
  resolveProviderConfig,
  streamStructuredInterpretation,
  type InterpretationSectionKey,
  type LlmEnv,
  type ProviderConfig,
} from '@almamesh/llm';
import {
  useChartLibraryStore,
  useInterpretationStore,
  useLanguageStore,
  usePredictiveStore,
  predictiveRequestKey,
  type InterpretationInputProvenance,
  type InterpretationStatus,
} from '@almamesh/store';
import type { SiderealChart } from '@almamesh/browser/types';
import type { ProcessedBirthData, VedicInterpretation } from '@almamesh/shared-types';

import i18n from '../i18n/config';
import { isInsufficientCreditsMessage, isModelUnavailableMessage } from '../lib/errors';
import { buildEnsurePredictiveInput, predictiveReferenceInstant } from '../lib/predictive';

/** The five structured sections, in the order the generator announces them. */
export const INTERPRETATION_SECTIONS: readonly InterpretationSectionKey[] = [
  'core',
  'yoga',
  'guidance1',
  'guidance2',
  'remedial',
];

/** One section's completion/failure flags, for a progress checklist in the UI. */
export interface SectionProgress {
  readonly key: InterpretationSectionKey;
  readonly complete: boolean;
  /** True when the generator's per-section call failed (section degraded to empty). */
  readonly failed: boolean;
}

type StreamingInterpretationViewMode = 'layman' | 'expert';

export interface StreamInterpretationOptions {
  view_mode?: StreamingInterpretationViewMode;
}

export interface UseStreamingInterpretationResult {
  /** Begin (or restart) generation for a chart; resolves when done/aborted. */
  streamInterpretation: (chartId: string, options?: StreamInterpretationOptions) => Promise<void>;
  /** The finished structured reading for the active chart, if complete. */
  interpretation: VedicInterpretation | undefined;
  /** Lifecycle of the active chart's interpretation. */
  status: InterpretationStatus;
  /** Per-section completion/failure flags (the 5 keys), for a progress checklist. */
  sections: readonly SectionProgress[];
  /** The keys of sections whose generation failed (degraded to empty). */
  failedSections: readonly InterpretationSectionKey[];
  /** Failure message; present once `status === 'error'`. */
  error: string | null;
  /** True while a generation is in flight. */
  isStreaming: boolean;
  /** Drop the active chart's interpretation entry. */
  reset: () => void;
  /** Abort the in-flight generation. */
  cancel: () => void;
}

/**
 * Stable sentinel stored as the interpretation "error" when the configured
 * model is dead/retired/typo'd on the endpoint. The dashboard maps it to the
 * existing switch-model prompt (recommended-model button + AI settings door) —
 * the raw endpoint response body never reaches the screen.
 */
export const READING_MODEL_UNAVAILABLE = 'reading_model_unavailable';

/** Message fragments a failed `fetch` leaves behind (Chrome/Safari/Firefox). */
const NETWORK_FAILURE_PATTERN = /failed to fetch|load failed|networkerror|network error|unreachable/i;

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
 * The resolved provider config the INTERPRETATION path would stream with right
 * now. Exported so the dashboard can fingerprint it (`configFingerprint`) and
 * compare against a stored reading's provenance — the exact same resolution
 * the hook uses, so a match here guarantees the reading is config-current.
 */
export function resolveInterpretationConfig(): ProviderConfig {
  return resolveProviderConfig(readLlmEnv());
}

interface NarrationInput {
  readonly chart: SiderealChart;
  readonly provenance: InterpretationInputProvenance;
}

/** The requested chart owns its profile identity, independent of active-UI races. */
function predictiveProfileKey(chartId: string | null): string {
  const stored = chartId ? useChartLibraryStore.getState().getChart(chartId) : undefined;
  return stored?.profile_id ?? chartId ?? 'primary';
}

/** Build today's deterministic predictive identity for one stored chart. */
function expectedPredictiveKey(chartId: string | null): string | null {
  const stored = chartId ? useChartLibraryStore.getState().getChart(chartId) : undefined;
  const input = buildEnsurePredictiveInput(
    predictiveProfileKey(chartId),
    stored?.birth_data as ProcessedBirthData | undefined,
    predictiveReferenceInstant(),
  );
  return input ? predictiveRequestKey(input) : null;
}

/** Compose only exact-key predictive facts and record what the LLM received. */
function narrationInput(chart: SiderealChart, chartId: string | null): NarrationInput {
  const { status, rawContexts, profileKey, requestKey } = usePredictiveStore.getState();
  const expectedProfile = predictiveProfileKey(chartId);
  const expectedRequest = expectedPredictiveKey(chartId);
  const predictiveIsCurrent =
    status === 'ready' &&
    rawContexts !== undefined &&
    profileKey === expectedProfile &&
    requestKey !== undefined &&
    requestKey === expectedRequest;
  if (!predictiveIsCurrent) {
    return { chart, provenance: { predictiveRequestKey: null } };
  }
  return {
    chart: { ...chart, ...rawContexts },
    provenance: { predictiveRequestKey: requestKey },
  };
}

/**
 * True only when a persisted reading's deterministic inputs are still valid.
 * Legacy entries fail closed because they may contain unkeyed predictive prose.
 */
export function isInterpretationInputCurrent(
  provenance: InterpretationInputProvenance | undefined,
  chartId: string | null,
): boolean {
  if (!provenance) {
    return false;
  }
  return (
    provenance.predictiveRequestKey === null ||
    provenance.predictiveRequestKey === expectedPredictiveKey(chartId)
  );
}

/** Read a complete interpretation only when its deterministic inputs are current. */
export function currentInterpretationForChart(
  chartId: string | null,
): VedicInterpretation | undefined {
  if (!chartId) {
    return undefined;
  }
  const entry = useInterpretationStore.getState().getEntry(chartId);
  if (
    entry?.status !== 'complete' ||
    !isInterpretationInputCurrent(entry.inputProvenance, chartId)
  ) {
    return undefined;
  }
  return entry.interpretation;
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
  return narrationInput(chart, chartId).chart;
}

/**
 * Map a thrown error to a friendly, user-facing message — the same
 * classification the chat path applies (see `describeChatStreamError` /
 * `lib/errors`). Raw failure text is NEVER passed through for untyped errors:
 * the all-sections-failed aggregate can embed the configured endpoint URL
 * (a build-time VITE_LLM_API_BASE value), so every non-privacy path resolves
 * to translated guidance or a stable sentinel the dashboard maps to actions.
 */
function describeError(err: unknown): string {
  if (err instanceof PrivacyViolationError) {
    // The fail-closed privacy fence writes a specific, user-facing message
    // (which endpoint was refused and why): show it verbatim.
    return err.message;
  }
  // Every genuine failure past the by-design privacy sentinel above is logged raw
  // (matching lib/errors.ts's contract) so a masked bug is never silently
  // swallowed behind friendly copy. This is the developer breadcrumb; the
  // classification below only decides what the USER sees. Logging to the dev
  // console — never the returned string — keeps the endpoint-URL privacy fence
  // intact.
  console.error('[interpretation] reading stream failed:', err);
  const request = err instanceof LlmRequestError ? err : undefined;
  const text = err instanceof Error ? `${err.message} ${request?.body ?? ''}` : String(err);
  if (request?.status === 402 || isInsufficientCreditsMessage(text)) {
    // Valid key, exhausted provider balance (e.g. OpenRouter 402): retrying
    // can't fix billing — say what actually happened.
    return i18n.t('chat:errors.insufficient_credits');
  }
  if (request?.status === 404 || isModelUnavailableMessage(text)) {
    // Dead/retired/typo'd model → the dashboard's switch-model prompt.
    return READING_MODEL_UNAVAILABLE;
  }
  if (NETWORK_FAILURE_PATTERN.test(text)) {
    // A real fetch network failure — "Failed to fetch" (Chrome) / "Load failed"
    // (Safari) / "NetworkError" (Firefox), the message `fetch`'s own TypeError
    // carries, plus the aggregate that concatenates those fragments. A bare
    // non-network TypeError (a code bug) no longer masquerades as "endpoint
    // unreachable": it falls through to the generic message and is visible in
    // the raw error logged above.
    return i18n.t('chat:errors.endpoint_unreachable');
  }
  return i18n.t('chat:errors.request_failed');
}

export function useStreamingInterpretation(chartId?: string | null): UseStreamingInterpretationResult {
  // Subscribe to the store so the component re-renders as events land.
  const entry = useInterpretationStore((s) => (chartId ? s.byChart[chartId] : undefined));
  // Context identity changes must immediately re-evaluate persisted prose even
  // when the interpretation entry itself did not mutate.
  usePredictiveStore((s) => s.requestKey);
  const startInterpretation = useInterpretationStore((s) => s.startInterpretation);
  const markSectionComplete = useInterpretationStore((s) => s.markSectionComplete);
  const markSectionFailed = useInterpretationStore((s) => s.markSectionFailed);
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
        setError(id, 'This chart needs to be regenerated before it can be interpreted.');
        return;
      }

      const config = resolveInterpretationConfig();

      const controller = new AbortController();
      abortControllerRef.current = controller;
      const input = narrationInput(chart, id);

      startInterpretation(id);
      try {
        for await (const event of streamStructuredInterpretation({
          // Compose the persisted raw predictive contexts (when ready for this
          // profile) so the six section prompts carry the delimited engine
          // predictive block; absent contexts → natal-only, exactly as before.
          chart: input.chart,
          config,
          mode: options.view_mode === 'expert' ? 'expert' : 'layman',
          language,
          signal: controller.signal,
        })) {
          if (controller.signal.aborted) return;
          if (event.type === 'section_complete') {
            markSectionComplete(id, event.section);
          } else if (event.type === 'error' && event.section != null) {
            // A per-section failure degrades that section to empty while the
            // run still completes — record it so the UI can show the gap and
            // offer a regenerate instead of a silently blank section.
            // (`section` is optional on the event type; sectionless errors
            // have no slot to mark and surface via the fatal path instead.)
            markSectionFailed(id, event.section);
          } else if (event.type === 'complete') {
            // Stamp the reading with the identity of the config that produced
            // it (engine/model/endpoint — never a key), so the UI can caption
            // it and a later config change is detectable as a provenance
            // mismatch (auto-regeneration).
            setInterpretation(
              id,
              event.interpretation,
              new Date().toISOString(),
              configProvenance(config),
              input.provenance,
            );
          }
          // `section_start` is informational.
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(id, describeError(err));
      }
    },
    [language, markSectionComplete, markSectionFailed, setError, setInterpretation, startInterpretation]
  );

  const inputIsCurrent = isInterpretationInputCurrent(entry?.inputProvenance, chartId ?? null);
  const storedStatus: InterpretationStatus = entry?.status ?? 'idle';
  const status: InterpretationStatus =
    storedStatus === 'complete' && !inputIsCurrent ? 'idle' : storedStatus;
  const completed = entry?.sections ?? {};
  const failed = entry?.failedSections ?? {};
  const sections: readonly SectionProgress[] = INTERPRETATION_SECTIONS.map((key) => ({
    key,
    complete: Boolean(completed[key]),
    failed: Boolean(failed[key]),
  }));

  return {
    streamInterpretation,
    interpretation: inputIsCurrent ? entry?.interpretation : undefined,
    status,
    sections,
    failedSections: sections.filter((s) => s.failed).map((s) => s.key),
    error: entry?.error ?? null,
    isStreaming: status === 'generating',
    reset,
    cancel,
  };
}

export default useStreamingInterpretation;
