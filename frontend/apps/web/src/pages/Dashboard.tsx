import { useCallback, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type {
  BirthChartGenerationResponse,
  AstronomicalCalculations,
  SiderealPlanet,
} from "@almamesh/shared-types";
import { readLocalPrimaryChart } from "../lib/localChartRead";
import {
  applyChatSettings,
  configFingerprint,
  describeLlmStatus,
  resolveProviderConfig,
  streamChartChat,
  serializeInterpretationForChat,
  readLlmSettings,
  writeLlmSettings,
  openRouterPreset,
  RECOMMENDED_CLOUD_MODEL,
  type ChatTurn,
  type LlmEnv,
} from "@almamesh/llm";
import {
  useChartLibraryStore,
  useInterpretationStore,
  useLanguageStore,
  usePredictiveStore,
  useProfilesStore,
  useRectificationRecordsStore,
} from "@almamesh/store";

import { Card, Spinner } from "../components/ui";
import { ContentModeToggle } from "../components/ui/ContentModeToggle";
import { MarkdownContent } from "../components/ui/MarkdownContent";
import { FloatingChatPanel } from "../components/features/chat/FloatingChatPanel";
import { FeedbackWidget } from "../components/features/feedback/FeedbackWidget";
import { ProvenanceFooter } from "../components/ProvenanceFooter";
import {
  ChartVisualization,
  DashboardInterpretation,
  IdentityStrip,
  LifeAtlas,
  ReadingGrounding,
} from "../components/features/dashboard";
import { getUserFriendlyError, isModelUnavailableMessage } from "../lib/errors";
import { isMappedChatStreamError } from "../hooks/useChatThread";
import { type SSEMetaData } from "../lib/streaming";
import { useContentModeStore } from "../stores/contentMode";
import type { ViewMode } from "../lib/types";
import {
  READING_MODEL_UNAVAILABLE,
  currentInterpretationForChart,
  isAutomaticNarrationInputSettled,
  resolveInterpretationConfig,
  useStreamingInterpretation,
  withRawPredictive,
} from "../hooks/useStreamingInterpretation";
import { useElapsedSeconds, formatElapsed } from "../hooks/useElapsedSeconds";
import { useLlmStatus } from "../hooks/useLlmStatus";
import { canExportPdf, isPlaceholderContent } from "./exportGate";
import { personaText, resolveReportAudience } from "../lib/reportSelectors";
import { rectificationDelta } from "../lib/rectification";

// Resolve the LLM env: build-time Vite env with any browser-local Settings
// overrides taking precedence — mirrors useStreamingInterpretation so the
// privacy default (local_only) is the single source of truth for chat too.
// Chat resolves the EXPLICIT chat model (settings.chatModel, default the fast
// CHAT_CLOUD_MODEL) via applyChatSettings — a visible, configurable per-tier
// choice that replaces the old silent applyChatModelPreference swap. The longer
// structured interpretation path uses applyInterpretationSettings (the frontier
// default), so the two tiers stay independent.
function readChatLlmEnv(): LlmEnv {
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  return applyChatSettings({
    VITE_LLM_API_BASE: env.VITE_LLM_API_BASE,
    VITE_LLM_API_KEY: env.VITE_LLM_API_KEY,
    VITE_LLM_MODEL: env.VITE_LLM_MODEL,
    VITE_LLM_PRIVACY_MODE: env.VITE_LLM_PRIVACY_MODE,
    VITE_LLM_ENGINE: env.VITE_LLM_ENGINE,
  });
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation(["dashboard", "life", "predictive"]);

  // Auth state is handled by RequiresChartRoute guard
  const [chartData, setChartData] = useState<BirthChartGenerationResponse | null>(null);
  const [personName, setPersonName] = useState<string>("");
  const [chartDetails, setChartDetails] = useState<AstronomicalCalculations | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Connect to the global content mode store
  // Maps 'layman' | 'technical' to ViewMode 'layman' | 'astrologer'
  const { contentMode } = useContentModeStore();
  const viewMode: ViewMode = contentMode === 'technical' ? 'astrologer' : 'layman';
  // Canonical audience for the dual-voice reading selectors (`personaText`).
  // Toggling `contentMode` re-derives this at render time, so the summary
  // switches voice instantly — no LLM call (the store subscription re-renders).
  const audience = resolveReportAudience(contentMode);
  const navigate = useNavigate();

  // Arriving via a "discuss in chat" link (e.g. from /life/:domain) opens the
  // chat panel immediately instead of leaving the user hunting for the bubble.
  const [searchParams] = useSearchParams();
  const chatInitiallyOpen = searchParams.get('chat') === 'open';

  // Track if we've checked for existing versions to avoid duplicate auto-generation
  const versionCheckRef = useRef<'idle' | 'checking' | 'done'>('idle');

  // Local-first read: the primary chart comes from the on-device chart library
  // (IndexedDB), not the backend. We wrap the persisted ChartData in the
  // BirthChartGenerationResponse shape the dashboard already consumes.
  const { data: queryData, error: queryError } = useQuery<BirthChartGenerationResponse>({
    queryKey: ['primary-chart'],
    queryFn: () => readLocalPrimaryChart(),
    retry: false,
  });

  useEffect(() => {
    if (queryData?.success) {
      setChartData(queryData);
      setPersonName(queryData.person_name);
      if (queryData.chart_data?.astronomical_calculations) {
        setChartDetails(queryData.chart_data.astronomical_calculations);
      }
      setIsLoading(false);
    } else if (queryError) {
      console.error('[Dashboard] Chart fetch failed:', queryError);
      setIsLoading(false);
    } else if (queryData) {
      // Resolved but success:false — a genuinely chart-less device (the
      // hydration race now resolves with the chart). Stop loading so the
      // chart-less UI / guard redirect shows instead of an infinite spinner.
      setIsLoading(false);
    }
  }, [queryData, queryError]);

  // NOTE: Fallback redirect removed - RequiresChartRoute guard handles this.
  // If chartData is null after loading, we show an error UI instead of redirecting,
  // as this is likely a temporary network issue (the guard already verified has_chart=true).

  const chartId = (chartData as unknown as { chart_id?: string | null })?.chart_id ?? null;

  // The active profile scopes the persisted chat thread + RAG memory (mirrors
  // how charts are scoped per profile). Read it via the store HOOK so the chat
  // re-binds when the person switches.
  const activeProfileId = useProfilesStore((s) => s.activeProfileId);

  // The richest feed for the chart visualization is the engine's raw
  // SiderealChart, persisted on-device in the chart library. Thread it to
  // ChartVisualization (which reshapes it once via buildChartGeometry).
  // Read it via the store HOOK (not getState()) so the component re-renders
  // once the library rehydrates from IndexedDB on a cold load.
  const siderealChart = useChartLibraryStore((s) =>
    chartId ? (s.charts[chartId]?.sidereal_chart ?? null) : null,
  );

  // Structured in-browser interpretation: drives @almamesh/llm's 5-section
  // generator and writes its progress + result into useInterpretationStore,
  // keyed by chartId. The reading below consumes the finished interpretation.
  const {
    streamInterpretation,
    interpretation,
    sections: interpretationSections,
    failedSections: failedInterpretationSections,
    isStreaming: isStreamingInterpretation,
    status: interpretationStatus,
    error: streamingError,
    cancel: cancelStreaming,
  } = useStreamingInterpretation(chartId);
  const predictiveRequestIdentity = usePredictiveStore((s) => s.requestKey);
  const predictiveStatus = usePredictiveStore((s) => s.status);

  // The full persisted entry for the active chart: carries the reading's
  // provenance (which model wrote it) and updatedAt for the quiet caption
  // under the reading. Subscribed (not getState) so a fresh generation
  // re-renders the caption the moment the new reading lands.
  const interpretationEntry = useInterpretationStore((s) =>
    chartId ? s.byChart[chartId] : undefined,
  );

  // Whether an AI endpoint is configured (local or cloud) — gates
  // auto-generation and decides between the progress panel and the CTA. LIVE
  // (useLlmStatus): turning AI off updates every gate on this page immediately,
  // no reload.
  const aiConfigured = useLlmStatus().configured;

  // Whether the reading can be (re)generated: any configured AI can produce the
  // structured reading. Gates the Regenerate button (with an explanatory
  // caption) so a click is never a silent no-op when no AI is configured.
  const canRegenerateReading = aiConfigured;

  // A failed regeneration with a kept reading surfaces an inline error strip
  // in the reading section (keep-old-until-success keeps the reading itself).
  // Dismissed locally; a new generation attempt re-arms it.
  const [regenErrorDismissed, setRegenErrorDismissed] = useState(false);

  // Dead/retired/typo'd model → the switch-model prompt. The hook stores the
  // stable sentinel for this case; the raw-message sniff keeps recognizing
  // entries persisted before the sentinel existed.
  const isModelUnavailableNotice =
    streamingError !== null &&
    (streamingError === READING_MODEL_UNAVAILABLE || isModelUnavailableMessage(streamingError));

  // Honest, live "time so far" for the generation panel (replaces a fixed,
  // usually-wrong "about 30 seconds" estimate).
  const interpElapsed = useElapsedSeconds(isStreamingInterpretation);

  // P5 local-first chat Q&A: the floating chat panel asks a grounded question
  // about the chart. We answer ENTIRELY in-browser via @almamesh/llm — the chart
  // is sanitized (identifier-free, dates relativized) before the prompt is built
  // and streamed to the configured (default local) OpenAI-compatible endpoint.
  // There is no backend; egress is the optional, PII-redacted LLM call only.
  const askLocalLlm = (
    question: string,
    questionViewMode: ViewMode | undefined,
    signal: AbortSignal,
    history: readonly ChatTurn[] = [],
    retrievedContext: readonly string[] = [],
  ) => {
    const chart = chartId ? useChartLibraryStore.getState().getChart(chartId)?.sidereal_chart : undefined;
    if (!chart) {
      throw new Error(t('errors:needs_regeneration'));
    }
    // SECURITY backstop: never send when AI is off. `resolveProviderConfig` is
    // fail-open (it falls back to the localhost Ollama default), and the chat UI
    // gate is the primary guard — but read the LIVE status here too so a send can
    // never reach an endpoint the user has disconnected. (Read at send time, not
    // a render snapshot.)
    if (!describeLlmStatus().configured) {
      throw new Error(t('dashboard:chat.not_configured_notice'));
    }
    const effectiveViewMode = questionViewMode || viewMode;
    const chatMode = effectiveViewMode === 'astrologer' ? 'expert' : 'layman';
    const config = resolveProviderConfig(readChatLlmEnv());
    // Reuse the already-generated natal reading (when complete) so a fast/small
    // chat model can lean on the frontier reading instead of re-deriving from raw
    // facts. Absent/incomplete → chat behaves exactly as before (facts only).
    const interp = currentInterpretationForChart(chartId);
    const interpretationText = interp
      ? serializeInterpretationForChat(interp, chatMode)
      : undefined;
    // Chat grounded in the CONFIRMED rectification record (Spec 062 delta 3):
    // only the PII-safe slice crosses — band + entered/working signs + fit
    // mode. Times, dates, and margins stay on-device by construction.
    const rectificationRecord = activeProfileId
      ? useRectificationRecordsStore.getState().getRecord(activeProfileId)
      : null;
    return streamChartChat({
      // Compose the persisted raw predictive contexts (when ready for this
      // profile) so chat answers can cite the engine's transit/strength/domain
      // facts (Spec 062 delta 1); absent contexts → natal-only, as before.
      chart: withRawPredictive(chart, chartId),
      question,
      config,
      mode: chatMode,
      history,
      // RAG: relevant past-conversation snippets retrieved on-device by the
      // chat hook (best-effort; empty when memory is unavailable).
      retrievedContext,
      interpretationText,
      ...(rectificationRecord
        ? {
            rectification: {
              band: rectificationRecord.band,
              originalSign: rectificationRecord.originalSign,
              rectifiedSign: rectificationRecord.rectifiedSign,
              mode: rectificationRecord.mode,
            },
          }
        : {}),
      // Answer chat in the user's chosen UI language (interpretation is threaded
      // the same way via useStreamingInterpretation); the engine is untouched.
      language: useLanguageStore.getState().language,
      signal,
    });
  };

  const handleAskQuestionStream = async (
    question: string,
    onToken: (token: string) => void,
    _onMeta: (meta: SSEMetaData) => void,
    questionViewMode?: ViewMode,
    history: readonly ChatTurn[] = [],
    retrievedContext: readonly string[] = [],
  ) => {
    const controller = new AbortController();
    let answer = '';
    try {
      for await (const delta of askLocalLlm(
        question,
        questionViewMode,
        controller.signal,
        history,
        retrievedContext,
      )) {
        answer += delta;
        onToken(delta);
      }
    } catch (err) {
      // Typed @almamesh/llm causes (on-device, privacy fence, request/endpoint
      // failures) must reach useChatThread intact so `describeChatStreamError`
      // can give the user an actionable message instead of the generic QA_001.
      if (isMappedChatStreamError(err)) throw err;
      throw new Error(getUserFriendlyError('QA_001', err instanceof Error ? err.message : undefined, t('dashboard:chat.not_configured_notice')));
    }
    return {
      answer,
      timing_guidance: null as string | null,
      remedies: null as string[] | null,
    };
  };

  const handleGenerateSeparatedInterpretation = useCallback(async () => {
    if (!chartId) return;
    // A fresh attempt re-arms the regeneration-failure strip (it was for the
    // PREVIOUS failure; a new one must be visible again).
    setRegenErrorDismissed(false);
    // Abort any in-flight run WITHOUT deleting the stored entry: the store
    // keeps a previously completed reading through a regeneration
    // (keep-old-until-success), so a failed run never leaves the user with
    // nothing. Only a successful new reading replaces the old one.
    cancelStreaming();

    const sepViewMode = viewMode === "astrologer" ? "expert" : "layman";

    // Local-first: narration runs entirely in-browser. The hook sanitizes the
    // on-device chart, fans out the 5 structured section calls, and writes the
    // merged VedicInterpretation into useInterpretationStore — there is no
    // backend version to fetch afterward.
    try {
      await streamInterpretation(chartId, { view_mode: sepViewMode });
    } catch (err) {
      console.error('[Dashboard] Error generating interpretation:', err);
    }
  }, [cancelStreaming, chartId, streamInterpretation, viewMode]);

  // Recover from a dead/typo'd cloud model: re-point settings at the recommended
  // OpenRouter model (keeping the user's saved key), then re-run generation.
  const handleSwitchToRecommendedModel = () => {
    const current = readLlmSettings();
    writeLlmSettings(openRouterPreset(current.apiKey ?? '', RECOMMENDED_CLOUD_MODEL));
    autoGenerationTriggeredRef.current = false;
    versionCheckRef.current = 'idle';
    handleGenerateSeparatedInterpretation();
  };

  // Manual "Regenerate" on a completed reading: reset the single-shot refs
  // (exactly like handleSwitchToRecommendedModel) so the auto-generate effect
  // cannot double-fire, then regenerate. The current reading stays on screen
  // until — and unless — the new one lands (keep-old-until-success).
  const handleRegenerateReading = () => {
    autoGenerationTriggeredRef.current = false;
    versionCheckRef.current = 'idle';
    handleGenerateSeparatedInterpretation();
  };

  // Track if auto-generation has been triggered to prevent double-triggers
  const autoGenerationTriggeredRef = useRef(false);
  const previousPredictiveRequestRef = useRef(predictiveRequestIdentity);
  useEffect(() => {
    if (previousPredictiveRequestRef.current === predictiveRequestIdentity) {
      return;
    }
    previousPredictiveRequestRef.current = predictiveRequestIdentity;
    // A different deterministic predictive input owns a fresh one-shot cycle.
    // An old stream may still finish, but its provenance will be hidden; once
    // that stream settles, this re-armed guard permits exactly one replacement.
    autoGenerationTriggeredRef.current = false;
    versionCheckRef.current = 'idle';
  }, [predictiveRequestIdentity]);
  const astronomicalData = chartDetails || chartData?.chart_data?.astronomical_calculations;

  // Check if interpretation has actual content (not just placeholders).
  // Requires at least ONE insight field (career, health, etc.) to have real content.
  // `isPlaceholderContent` is imported from ./exportGate (single source of truth
  // for the placeholder rules, also used by the Export PDF gate).
  const hasValidInterpretation = (() => {
    if (!interpretation) return false;
    // Check insight fields for valid content (summary alone is not enough)
    const careerContent = interpretation.career_guidance?.layman || interpretation.career_guidance?.technical;
    const healthContent = interpretation.health_guidance?.layman || interpretation.health_guidance?.technical;
    const relationshipContent = interpretation.relationship_guidance?.layman || interpretation.relationship_guidance?.technical;
    const spiritualContent = interpretation.spiritual_guidance?.layman || interpretation.spiritual_guidance?.technical;

    // At least one insight field must have real (non-placeholder) content
    const hasValidCareer = careerContent && !isPlaceholderContent(careerContent);
    const hasValidHealth = healthContent && !isPlaceholderContent(healthContent);
    const hasValidRelationship = relationshipContent && !isPlaceholderContent(relationshipContent);
    const hasValidSpiritual = spiritualContent && !isPlaceholderContent(spiritualContent);

    return Boolean(hasValidCareer || hasValidHealth || hasValidRelationship || hasValidSpiritual);
  })();

  // Export PDF is gated on a real, finished interpretation so the print report is
  // never empty or full of placeholders (see ./exportGate).
  const canExport = canExportPdf(interpretationStatus, hasValidInterpretation);

  // Auto-generate interpretation on mount when a chart is loaded, an AI model is
  // configured, and there is no existing complete interpretation for this chart.
  useEffect(() => {
    // Skip if conditions not met (no chart, still loading, no AI model, or a
    // generation is already in flight).
    if (
      !chartId ||
      isLoading ||
      !aiConfigured ||
      isStreamingInterpretation ||
      !isAutomaticNarrationInputSettled(chartId)
    ) {
      return;
    }

    // If we already have a valid (complete) interpretation, keep it — UNLESS
    // the LLM config that produced it has changed (provenance mismatch; a
    // legacy pre-provenance reading counts as mismatched). With AI off the
    // effect never reaches here, so the stale reading stays on screen
    // untouched rather than being destroyed.
    if (interpretationStatus === 'complete' && hasValidInterpretation) {
      const config = resolveInterpretationConfig();
      const storedProvenance = useInterpretationStore.getState().getEntry(chartId)?.provenance;
      const configChanged =
        !storedProvenance || configFingerprint(storedProvenance) !== configFingerprint(config);
      if (!configChanged) {
        // A successful, current reading completes the previous one-shot cycle.
        // Reset only here (never on error) so a later predictive day/input can
        // auto-regenerate once while a failed attempt still cannot spin.
        autoGenerationTriggeredRef.current = false;
        versionCheckRef.current = 'done';
        return;
      }
      // Config changed: fall through to the single-shot trigger below. The refs
      // cap this at ONE auto-regeneration attempt per mount — a failed attempt
      // cannot retrigger.
    }

    // Skip if this input/config already consumed its one automatic attempt.
    // This guard comes AFTER the successful-current branch above so completion
    // can close that cycle and admit one attempt for a later predictive day.
    if (autoGenerationTriggeredRef.current || versionCheckRef.current === 'checking') {
      return;
    }

    // Local-first: there is no backend version store to consult — narration is
    // generated on demand via the configured OpenAI-compatible endpoint.
    // Auto-trigger a single generation (first reading, or config-change regen).
    versionCheckRef.current = 'done';
    autoGenerationTriggeredRef.current = true;
    handleGenerateSeparatedInterpretation();
  }, [
    aiConfigured,
    chartId,
    handleGenerateSeparatedInterpretation,
    hasValidInterpretation,
    interpretationStatus,
    isLoading,
    isStreamingInterpretation,
    predictiveRequestIdentity,
    predictiveStatus,
  ]);

  // Extract sidereal context data for the identity strip + chart panels.
  const siderealCtx = astronomicalData?.sidereal_ctx;

  // Extract lagna data with defensive typing
  const rawLagna = siderealCtx?.lagna as Record<string, unknown> | null;
  const lagna = rawLagna ? {
    sign: rawLagna.sign as string | undefined,
    longitude: rawLagna.longitude as number | undefined,
    nakshatra: rawLagna.nakshatra as string | undefined,
    nakshatraPada: rawLagna.nakshatra_pada as number | undefined,
    // The engine's cusp-proximity block (authoritative when present): drives the
    // Birth-time sensitivity callout off the engine's own near-cusp verdict.
    cuspDistanceDeg: rawLagna.lagna_cusp_distance_deg as number | undefined,
    adjacentSign: rawLagna.lagna_adjacent_sign as string | null | undefined,
    isNearCusp: rawLagna.is_near_cusp as boolean | undefined,
  } : null;

  // The Moon's placement for the identity strip (engine keys planets by name;
  // match case-insensitively so the strip never depends on serializer casing).
  const moonPlanet: SiderealPlanet | null = siderealCtx
    ? Object.values(siderealCtx.planets).find((p) => p.name.toLowerCase() === 'moon') ?? null
    : null;
  const moon = moonPlanet
    ? {
        sign: moonPlanet.sign,
        nakshatra: moonPlanet.nakshatra,
        nakshatraPada: moonPlanet.nakshatra_pada,
      }
    : null;

  // Manual birth-time rectification (if any) in effect for this chart: a pure,
  // display-only comparison of the entered vs. effective clock the engine path
  // already produced. Null when no rectification was applied — then the strip
  // renders no rectification line.
  const birthData = chartData?.chart_data?.birth_data ?? null;
  const rectification = birthData ? rectificationDelta(birthData) : null;

  // "This period" — timely guidance attached to the reading (plain strings).
  const periodGuidance = interpretation?.current_period_guidance ?? null;
  const periodBody = periodGuidance?.period_summary || periodGuidance?.guidance || null;
  const hasPeriodGuidance = Boolean(
    periodGuidance?.current_period || periodBody || (periodGuidance?.key_themes?.length ?? 0) > 0,
  );
  // The headline reading in the selected voice (jargon-free for "you",
  // placement-naming for "astrologer"). Re-derived on every contentMode change.
  const summaryText = personaText(interpretation?.summary, audience);
  const summaryReady = Boolean(summaryText && !isPlaceholderContent(summaryText));

  // Quiet provenance caption under the reading: which model wrote it, when —
  // it makes the Regenerate button (and the auto-regeneration on a model
  // change) self-explanatory. Legacy pre-provenance readings degrade to the
  // date alone; with neither stored, the caption is omitted entirely.
  const readingDate = interpretationEntry?.updatedAt
    ? new Date(interpretationEntry.updatedAt).toLocaleDateString(i18n.language, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;
  const readingModel = interpretationEntry?.provenance?.model ?? null;
  const readingCaption = readingDate
    ? readingModel
      ? t('dashboard:reading.generated_by', { model: readingModel, date: readingDate })
      : t('dashboard:reading.generated_at', { date: readingDate })
    : null;

  // Show loading state while fetching chart data
  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-8">
        <div className="text-center">
          <Spinner size="lg" className="mx-auto mb-6" />
          <h2 className="text-xl font-bold text-text-primary mb-2">{t('dashboard:loading.title')}</h2>
          <p className="text-text-secondary">{t('dashboard:loading.subtitle')}</p>
        </div>
      </div>
    );
  }

  if (!chartData) {
    // Chart data failed to load - show error with retry option
    // Note: RequiresChartRoute guard already verified has_chart=true, so this is likely a network issue
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="mb-6">
            <svg className="h-16 w-16 mx-auto text-status-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">{t('dashboard:error.title')}</h2>
          <p className="text-text-secondary mb-6">
            {t('dashboard:error.body')}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-accent-gold text-background-primary font-semibold rounded-lg hover:bg-accent-gold/90 transition-colors"
          >
            {t('dashboard:actions.try_again')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-10">
        {/* 1 — Identity: who this chart is, and the facts an astrologer reads
               first. The AppLayout header above carries the ONE brand wordmark;
               this page adds no second header. */}
        <IdentityStrip
          name={personName}
          lagna={lagna}
          moon={moon}
          dasha={astronomicalData?.dasha_ctx}
          rectification={rectification}
          timeConfidence={birthData?.birth_time_confidence}
          actions={
            <>
              <ContentModeToggle />
              <button
                type="button"
                onClick={() => navigate(`/report?mode=${viewMode === 'astrologer' ? 'astrologer' : 'you'}`)}
                disabled={!canExport}
                data-testid="print-chart-button"
                title={canExport ? t('dashboard:actions.export_pdf_title') : t('dashboard:actions.export_pdf_disabled_title')}
                className="inline-flex items-center gap-1.5 rounded-md border border-ui-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:border-accent-gold/40 hover:text-text-primary disabled:cursor-not-allowed disabled:border-ui-border/60 disabled:text-text-tertiary disabled:hover:border-ui-border/60"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M4 6h16M4 6a2 2 0 00-2 2v8a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2" />
                </svg>
                {t('dashboard:actions.export_pdf')}
              </button>
              {/* Regenerate the reading with the currently configured AI. Lives
                  in the top actions row (reachable on mobile, unlike the old
                  header slot) and is gated on an existing `interpretation` — so
                  it stays present as a recovery affordance even when a completed
                  reading came back with an empty summary (the prose section
                  below unmounts, but this button does not). Disabled while a run
                  is in flight or when no AI is configured (never a silent
                  no-op). */}
              {interpretation && (
                <button
                  type="button"
                  onClick={handleRegenerateReading}
                  disabled={isStreamingInterpretation || !canRegenerateReading}
                  data-testid="regenerate-reading"
                  title={
                    !canRegenerateReading
                      ? t('dashboard:reading.regen_no_ai')
                      : t('dashboard:actions.regenerate')
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border border-ui-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:border-accent-gold/40 hover:text-text-primary disabled:cursor-not-allowed disabled:border-ui-border/60 disabled:text-text-tertiary disabled:hover:border-ui-border/60"
                >
                  {isStreamingInterpretation ? (
                    <Spinner size="sm" />
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  )}
                  {t('dashboard:actions.regenerate')}
                </button>
              )}
              <FeedbackWidget page="dashboard" />
              <Link
                to="/settings"
                className="text-text-muted transition-colors hover:text-text-primary"
                data-testid="settings-link"
                title={t('dashboard:actions.settings_title')}
                aria-label={t('dashboard:actions.settings')}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </Link>
            </>
          }
        />

        {/* 2 — Reading status. No AI model configured: a clear call-to-action
               instead of empty sections. */}
        {!aiConfigured && chartId && !hasValidInterpretation && (
          <Card title={t('dashboard:cta.title')} data-testid="interpretation-cta">
            <div className="space-y-4">
              <p className="max-w-prose text-sm leading-relaxed text-text-secondary">
                {t('dashboard:cta.body')}
              </p>
              <Link
                to="/settings/ai"
                className="inline-flex items-center gap-2 rounded-lg border border-accent-gold px-4 py-2 text-sm font-semibold text-accent-gold transition-colors hover:bg-accent-gold/10"
                data-testid="connect-ai-link"
              >
                {t('dashboard:actions.connect_ai')}
              </Link>
            </div>
          </Card>
        )}

        {/* Generating: the 5-section progress checklist (no markdown blob). */}
        {aiConfigured && chartId && !hasValidInterpretation &&
          (isStreamingInterpretation || interpretationStatus === 'error') && (
          <Card
            title={
              isStreamingInterpretation
                ? t('dashboard:generation.title_generating')
                : t('dashboard:generation.title_failed')
            }
            actions={isStreamingInterpretation ? <Spinner size="sm" /> : undefined}
            data-testid="interpretation-progress"
          >
            <p className="text-sm text-text-secondary" data-testid="interpretation-elapsed">
              {isStreamingInterpretation
                ? t('dashboard:generation.elapsed', { elapsed: formatElapsed(interpElapsed) })
                : null}
            </p>

            {streamingError && (
              <div
                className="mt-2 text-sm text-status-error"
                data-testid="interpretation-error"
              >
                {isModelUnavailableNotice ? (
                  <p>{t('dashboard:generation.model_unavailable')}</p>
                ) : (
                  <p>{streamingError}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {isModelUnavailableNotice &&
                    Boolean(readLlmSettings().apiKey) && (
                    <button
                      onClick={handleSwitchToRecommendedModel}
                      className="rounded-md bg-accent-gold px-3 py-1.5 font-medium text-background-primary transition-colors hover:bg-accent-gold-bright"
                      data-testid="switch-recommended-model"
                    >
                      {t('dashboard:actions.switch_recommended')}
                    </button>
                  )}
                  <button
                    onClick={handleGenerateSeparatedInterpretation}
                    className="underline hover:no-underline"
                  >
                    {t('dashboard:actions.retry')}
                  </button>
                  <Link to="/settings/ai" className="underline hover:no-underline">
                    {t('dashboard:actions.ai_settings')}
                  </Link>
                </div>
              </div>
            )}

            {isStreamingInterpretation && (
              <ul className="mt-4 max-w-sm space-y-1 text-sm text-text-secondary">
                {interpretationSections.map((s) => (
                  <li key={s.key} className="flex items-center justify-between">
                    <span>{t(`dashboard:sections.${s.key}`)}</span>
                    <span
                      className={
                        s.failed
                          ? 'text-status-error'
                          : s.complete
                            ? 'text-status-success'
                            : 'text-text-tertiary'
                      }
                    >
                      {s.failed ? '✗' : s.complete ? '✓' : '…'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {/* 3 — The reading: the AI summary as open editorial prose (no
               accordion), with the timely "this period" note and the door to
               the full interpretation. */}
        {summaryReady && interpretation && (
          <section className="space-y-5" data-testid="reading-section">
            <header>
              <h2 className="font-display text-xl text-text-primary">
                {t('life:reading.heading')}
              </h2>
            </header>
            {/* WHY Regenerate is unavailable: no AI configured — with the door
                to AI settings. */}
            {!canRegenerateReading && (
              <p
                className="text-xs leading-relaxed text-text-tertiary"
                data-testid="regenerate-unavailable"
              >
                {t('dashboard:reading.regen_no_ai')}{' '}
                <Link to="/settings/ai" className="underline hover:no-underline">
                  {t('dashboard:actions.ai_settings')}
                </Link>
              </p>
            )}
            {/* A FAILED regeneration must be VISIBLE: keep-old-until-success
                keeps the reading below, and this dismissible strip carries the
                why + the recovery actions (Retry / switch model / AI settings). */}
            {interpretationStatus === 'error' && streamingError && !regenErrorDismissed && (
              <div
                className="flex items-start justify-between gap-3 rounded-lg border border-status-error/40 bg-status-error/10 px-4 py-3 text-sm"
                role="alert"
                data-testid="reading-regen-error"
              >
                <div className="space-y-2">
                  <p className="text-status-error">
                    {isModelUnavailableNotice
                      ? t('dashboard:generation.model_unavailable')
                      : t('dashboard:generation.regen_failed', { error: streamingError })}
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    {isModelUnavailableNotice &&
                      Boolean(readLlmSettings().apiKey) && (
                      <button
                        onClick={handleSwitchToRecommendedModel}
                        className="rounded-md bg-accent-gold px-3 py-1.5 font-medium text-background-primary transition-colors hover:bg-accent-gold-bright"
                        data-testid="reading-regen-switch-recommended"
                      >
                        {t('dashboard:actions.switch_recommended')}
                      </button>
                    )}
                    <button
                      onClick={handleRegenerateReading}
                      className="underline hover:no-underline"
                      data-testid="reading-regen-retry"
                    >
                      {t('dashboard:actions.retry')}
                    </button>
                    <Link
                      to="/settings/ai"
                      className="underline hover:no-underline"
                      data-testid="reading-regen-ai-settings"
                    >
                      {t('dashboard:actions.ai_settings')}
                    </Link>
                  </div>
                </div>
                <button
                  onClick={() => setRegenErrorDismissed(true)}
                  className="shrink-0 text-text-tertiary transition-colors hover:text-text-primary"
                  aria-label={t('dashboard:actions.dismiss')}
                  data-testid="reading-regen-dismiss"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            {/* Honest partial-failure notice: per-section LLM failures degrade
                those sections to empty — say which ones and offer a regenerate
                instead of silently rendering blank sections. */}
            {failedInterpretationSections.length > 0 && (
              <div
                className="text-sm text-text-secondary"
                role="status"
                data-testid="interpretation-partial-failure"
              >
                <p>
                  {t('dashboard:generation.partial_failure', {
                    sections: failedInterpretationSections
                      .map((key) => t(`dashboard:sections.${key}`))
                      .join(', '),
                  })}
                </p>
                <button
                  onClick={handleGenerateSeparatedInterpretation}
                  className="mt-1 underline hover:no-underline"
                  data-testid="interpretation-partial-retry"
                >
                  {t('dashboard:actions.retry')}
                </button>
              </div>
            )}
            <MarkdownContent content={summaryText} />
            {/* The full reading: core narrative (always visible) + collapsible
                depth (yogas, life-area guidance, remedies, the road ahead).
                Voice-driven by `audience`; empty sections drop themselves. */}
            <DashboardInterpretation interpretation={interpretation} audience={audience} />
            {hasPeriodGuidance && periodGuidance && (
              <div className="space-y-1.5 border-l-2 border-accent-gold/40 pl-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-tertiary">
                  {t('life:reading.this_period')}
                </p>
                {periodGuidance.current_period && (
                  <p className="text-sm font-medium text-accent-gold">
                    {periodGuidance.current_period}
                  </p>
                )}
                {periodBody && (
                  <p className="max-w-prose text-sm leading-[1.75] text-text-secondary">
                    {periodBody}
                  </p>
                )}
                {(periodGuidance.key_themes?.length ?? 0) > 0 && (
                  <p className="text-xs text-text-tertiary">
                    {t('life:reading.themes')}: {periodGuidance.key_themes?.join(' · ')}
                  </p>
                )}
              </div>
            )}
            {/* Quiet provenance line: which model wrote this reading, when. */}
            {readingCaption && (
              <p
                className="text-[11px] uppercase tracking-[0.18em] text-text-tertiary"
                data-testid="reading-provenance"
              >
                {readingCaption}
              </p>
            )}
            {/* Trust, not hype: a quiet, closed-by-default explainer of WHY this
                reading is grounded (deterministic on-device astronomy,
                externally-validated positions, engine-grounded narration,
                privacy). Static i18n copy — no astrology, no LLM call. */}
            <ReadingGrounding />
          </section>
        )}

        {/* 4 — Life Atlas: the seven-domain centerpiece (engine forecasts,
               lazy compute behind one explicit affordance). */}
        <LifeAtlas />

        {/* 5 — The observatory: 3D force field, kundli and planetary table,
               rendered for both modes (depth lives inside, not in the layout). */}
        <ChartVisualization siderealChart={siderealChart} size={300} />

        {/* 6 — Continue: the deliberate exit to the full timing panel. (Export PDF
               + Feedback now live in the top identity-strip actions row.) */}
        <Card title={t('predictive:page.title')}>
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-text-secondary">
              {t('life:continue.timing_body')}
            </p>
            <Link
              to="/predictive"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-gold transition-colors hover:text-accent-gold-bright"
              data-testid="predictive-link"
            >
              {t('life:continue.open')}
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </Card>

        {/* Trust-through-transparency: how this chart was produced (on-device). */}
        <ProvenanceFooter />
      </div>

      {/* Grounded chart Q&A — available in both modes (one surface). */}
      <FloatingChatPanel
        personName={personName}
        profileId={activeProfileId}
        chartId={chartId}
        viewMode={viewMode}
        onAskQuestionStream={handleAskQuestionStream}
        initialOpen={chatInitiallyOpen}
      />
    </>
  );
}
