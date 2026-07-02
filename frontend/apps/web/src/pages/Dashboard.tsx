import { useState, useEffect, useRef } from "react";
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
  IdentityStrip,
  LifeAtlas,
} from "../components/features/dashboard";
import { getUserFriendlyError } from "../lib/errors";
import { type SSEMetaData } from "../lib/streaming";
import { useContentModeStore } from "../stores/contentMode";
import type { ViewMode } from "../lib/types";
import { useStreamingInterpretation, withRawPredictive } from "../hooks/useStreamingInterpretation";
import { useElapsedSeconds, formatElapsed } from "../hooks/useElapsedSeconds";
import { canExportPdf, isPlaceholderContent } from "./exportGate";
import { personaText, resolveReportAudience } from "../lib/reportSelectors";
import { rectificationDelta } from "../lib/rectification";

// A model-not-found failure from an OpenAI-compatible endpoint — e.g. OpenRouter
// returns HTTP 404 "No endpoints found for <model>" when the configured model id
// is retired/typo'd. We surface this as an actionable "switch model" prompt
// instead of a raw error body, since "Retry" with the same dead model just loops.
function isModelUnavailableError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("no endpoints found") ||
    m.includes("model_not_found") ||
    (m.includes("404") && m.includes("model"))
  );
}

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
  const { t } = useTranslation(["dashboard", "life", "predictive"]);

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
    isStreaming: isStreamingInterpretation,
    status: interpretationStatus,
    error: streamingError,
    reset: resetStreaming,
  } = useStreamingInterpretation(chartId);

  // Whether an AI model is configured (local or cloud) — gates auto-generation
  // and decides between the progress panel and the "connect a model" CTA.
  const aiConfigured = describeLlmStatus().configured;

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
    const effectiveViewMode = questionViewMode || viewMode;
    const chatMode = effectiveViewMode === 'astrologer' ? 'expert' : 'layman';
    const config = resolveProviderConfig(readChatLlmEnv());
    // Reuse the already-generated natal reading (when complete) so a fast/small
    // chat model can lean on the frontier reading instead of re-deriving from raw
    // facts. Absent/incomplete → chat behaves exactly as before (facts only).
    const interpEntry = chartId ? useInterpretationStore.getState().getEntry(chartId) : undefined;
    const interp = interpEntry?.status === 'complete' ? interpEntry.interpretation : undefined;
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
      throw new Error(getUserFriendlyError('QA_001', err instanceof Error ? err.message : undefined, t('dashboard:chat.not_configured_notice')));
    }
    return {
      answer,
      timing_guidance: null as string | null,
      remedies: null as string[] | null,
    };
  };

  const handleGenerateSeparatedInterpretation = async () => {
    if (!chartId) return;
    resetStreaming();

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
  };

  // Recover from a dead/typo'd cloud model: re-point settings at the recommended
  // OpenRouter model (keeping the user's saved key), then re-run generation.
  const handleSwitchToRecommendedModel = () => {
    const current = readLlmSettings();
    writeLlmSettings(openRouterPreset(current.apiKey ?? '', RECOMMENDED_CLOUD_MODEL));
    autoGenerationTriggeredRef.current = false;
    versionCheckRef.current = 'idle';
    handleGenerateSeparatedInterpretation();
  };

  // Track if auto-generation has been triggered to prevent double-triggers
  const autoGenerationTriggeredRef = useRef(false);
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
    if (!chartId || isLoading || !aiConfigured || isStreamingInterpretation) {
      return;
    }

    // Skip if already triggered auto-generation or currently checking versions.
    if (autoGenerationTriggeredRef.current || versionCheckRef.current === 'checking') {
      return;
    }

    // If we already have a valid (complete) interpretation, no need to do anything.
    if (interpretationStatus === 'complete' && hasValidInterpretation) {
      versionCheckRef.current = 'done';
      return;
    }

    // Local-first: there is no backend version store to consult — narration is
    // generated on demand via the configured OpenAI-compatible endpoint.
    // Auto-trigger a single generation.
    versionCheckRef.current = 'done';
    autoGenerationTriggeredRef.current = true;
    handleGenerateSeparatedInterpretation();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally controlled via refs
  }, [chartId, aiConfigured, hasValidInterpretation, interpretationStatus, isLoading, isStreamingInterpretation]);

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
          actions={
            <>
              <ContentModeToggle />
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
              <div className="mt-2 text-sm text-status-error" data-testid="interpretation-error">
                {isModelUnavailableError(streamingError) ? (
                  <p>{t('dashboard:generation.model_unavailable')}</p>
                ) : (
                  <p>{streamingError}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {isModelUnavailableError(streamingError) && Boolean(readLlmSettings().apiKey) && (
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
                    <span className={s.complete ? 'text-status-success' : 'text-text-tertiary'}>
                      {s.complete ? '✓' : '…'}
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
            <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2 className="font-display text-xl text-text-primary">
                {t('life:reading.heading')}
              </h2>
            </header>
            <MarkdownContent content={summaryText} />
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
          </section>
        )}

        {/* 4 — Life Atlas: the seven-domain centerpiece (engine forecasts,
               lazy compute behind one explicit affordance). */}
        <LifeAtlas />

        {/* 5 — The observatory: 3D force field, kundli and planetary table,
               rendered for both modes (depth lives inside, not in the layout). */}
        <ChartVisualization siderealChart={siderealChart} size={300} />

        {/* 6 — Continue: the two deliberate exits (full timing panel, paper report). */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card title={t('predictive:page.title')}>
            <div className="flex h-full flex-col gap-4">
              <p className="text-sm leading-relaxed text-text-secondary">
                {t('life:continue.timing_body')}
              </p>
              <Link
                to="/predictive"
                className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-accent-gold transition-colors hover:text-accent-gold-bright"
                data-testid="predictive-link"
              >
                {t('life:continue.open')}
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </Card>
          <Card title={t('life:continue.report_title')}>
            <div className="flex h-full flex-col gap-4">
              <p className="text-sm leading-relaxed text-text-secondary">
                {t('life:continue.report_body')}
              </p>
              <div className="mt-auto space-y-2">
                <button
                  onClick={() => navigate(`/report?mode=${viewMode === 'astrologer' ? 'astrologer' : 'you'}`)}
                  disabled={!canExport}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-gold transition-colors hover:text-accent-gold-bright disabled:cursor-not-allowed disabled:text-text-tertiary"
                  data-testid="print-chart-button"
                  title={canExport ? t('dashboard:actions.export_pdf_title') : t('dashboard:actions.export_pdf_disabled_title')}
                >
                  {t('dashboard:actions.export_pdf')}
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                {!canExport && (
                  <p className="text-xs text-text-tertiary">{t('life:continue.report_locked')}</p>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Quiet, anonymous signal: is this valuable? (no identity, no tracking;
               device-local dismiss guard so a returning visitor isn't nagged twice.) */}
        <FeedbackWidget page="dashboard" />

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
