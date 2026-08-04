/**
 * Dashboard — "enrich-when-ready" one-shot predictive upgrade (Spec 065).
 *
 * The natal reading paints fast (as today), with no dependency on the
 * predictive layer. Once `usePredictiveStore` reaches `ready`, a SEPARATE,
 * fire-once effect regenerates the reading exactly once so it composes the
 * full predictive superset — but ONLY when the current reading is not
 * already predictive-aware. It must never loop and never downgrade a
 * predictive-aware reading.
 *
 * All chart/interpretation data below is SYNTHETIC.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  predictiveRequestKey,
  useChartLibraryStore,
  useInterpretationStore,
  useContentModeStore,
  usePredictiveStore,
  useProfilesStore,
  type StoredChart,
} from '@almamesh/store';
import type { PredictiveContexts } from '@almamesh/browser/types';
import type {
  BirthChartGenerationResponse,
  ProcessedBirthData,
  VedicInterpretation,
} from '@almamesh/shared-types';

import '../../i18n/config';

// Mock ONLY the structured generator — everything else in @almamesh/llm
// (settings, provenance fingerprint, status) stays real so the dashboard's
// config resolution matches production.
vi.mock('@almamesh/llm', async () => {
  const actual = await vi.importActual<typeof import('@almamesh/llm')>('@almamesh/llm');
  return {
    ...actual,
    streamStructuredInterpretation: vi.fn(),
  };
});

// The dashboard reads its primary chart through this helper (via react-query).
vi.mock('../../lib/localChartRead', () => ({
  readLocalPrimaryChart: vi.fn(),
}));

// The provenance footer reads the engine runtime context; stub it so the test
// does not need an AlmaMeshRuntimeProvider (unrelated to the enrich effect).
vi.mock('../../providers/chartEngineContext', () => ({
  useChartEngine: () => ({ meta: null }),
  useOptionalChartEngine: () => null,
  ChartEngineContext: { Provider: ({ children }: { children: unknown }) => children },
}));

// The chart visualization / Life Atlas need a full engine-shaped sidereal
// chart (kundli geometry, predictive compute) — unrelated to this effect.
vi.mock('../../components/features/dashboard', () => ({
  ChartVisualization: () => null,
  IdentityStrip: () => null,
  LifeAtlas: () => null,
  DashboardInterpretation: () => null,
  ReadingGrounding: () => null,
}));

import {
  configProvenance,
  openRouterPreset,
  streamStructuredInterpretation,
  writeLlmSettings,
  type InterpretationEvent,
  type ReadingProvenance,
} from '@almamesh/llm';
import { readLocalPrimaryChart } from '../../lib/localChartRead';
import { resolveInterpretationConfig } from '../../hooks/useStreamingInterpretation';
import { buildEnsurePredictiveInput, predictiveReferenceInstant } from '../../lib/predictive';
import DashboardPage from '../Dashboard';

const mockedStream = vi.mocked(streamStructuredInterpretation);

const LAYMAN_SUMMARY = 'You bring quiet persistence to whatever you commit to.';

// A VALID reading: at least one insight field must carry real content for the
// dashboard's hasValidInterpretation gate (summary alone is not enough).
const INTERPRETATION: VedicInterpretation = {
  summary: { layman: LAYMAN_SUMMARY, technical: 'Saturn anchors a disciplined identity.' },
  strengths: [],
  challenges: [],
  life_themes: [],
  career_guidance: {
    layman: 'Steady, methodical building of a public craft over many years.',
    technical: 'A dignified tenth lord favors gradual institutional growth.',
  },
};

function storedChart(): StoredChart {
  return {
    chart_id: 'chart-1',
    person_name: 'Asha Rao',
    is_primary: true,
    birth_data: {
      birth_datetime_utc: '1990-03-30T06:30:00Z',
      birth_datetime_local: '1990-03-30T12:00:00',
      birth_location_details: {
        city: 'Bengaluru',
        latitude: 12.97,
        longitude: 77.59,
        timezone: 'Asia/Kolkata',
      },
    },
    // Raw engine output — required for the hook to reach the generator at all.
    sidereal_chart: {
      ayanamsa_value: 23.86,
      lagna: {},
      planets: {},
      houses: {},
      yogas: [],
    },
    astronomical_calculations: {
      sidereal_ctx: {
        julian_day: 0,
        ayanamsa_value: 23.86,
        ayanamsa_type: 'lahiri',
        house_system: 'whole_sign',
        sidereal_time: 0,
        lagna: {},
        planets: {},
      },
      calculation_timestamp: '1990-03-30T06:30:00Z',
      software_version: 'test',
    },
  } as unknown as StoredChart;
}

function primaryChartResponse(): BirthChartGenerationResponse {
  const chart = storedChart();
  const { person_name, is_primary, chart_id, ...chartData } = chart as unknown as Record<string, unknown>;
  void is_primary;
  return {
    success: true,
    message: 'Chart loaded from device.',
    person_name: person_name as string,
    chart_id: chart_id as string,
    chart_data: chartData as never,
    chart_data_stored: true,
    generated_at: '1990-03-30T06:30:00Z',
  };
}

/** A generator that completes immediately with the given interpretation. */
function completingStream(
  interpretation: VedicInterpretation,
): () => AsyncGenerator<InterpretationEvent> {
  return async function* () {
    yield { type: 'complete', interpretation } as InterpretationEvent;
  };
}

/** A generator that dies mid-run, like a provider outage would: no reading. */
function failingStream(): () => AsyncGenerator<InterpretationEvent> {
  return async function* (): AsyncGenerator<InterpretationEvent> {
    yield { type: 'section_start', section: 'core' } as InterpretationEvent;
    throw new Error('synthetic provider outage');
  };
}

/**
 * The deterministic predictive identity this chart expects RIGHT NOW — the same
 * value `useStreamingInterpretation` derives before it will compose predictive
 * facts into a reading.
 */
function expectedPredictiveKeyForChart(): string {
  const input = buildEnsurePredictiveInput(
    'chart-1',
    storedChart().birth_data as ProcessedBirthData,
    predictiveReferenceInstant(),
  );
  if (input === null) {
    throw new Error('fixture chart is missing the birth fields the predictive key needs');
  }
  return predictiveRequestKey(input);
}

const RAW_CONTEXTS = {} as unknown as PredictiveContexts;

/**
 * Predictive facts that are genuinely usable for THIS chart: `ready`, with raw
 * contexts, this chart's profile, and today's expected request key. Only in this
 * state can a regeneration actually produce a predictive-aware reading.
 */
function predictiveReadyForThisChart(): void {
  usePredictiveStore.setState({
    status: 'ready',
    profileKey: 'chart-1',
    requestKey: expectedPredictiveKeyForChart(),
    rawContexts: RAW_CONTEXTS,
  });
}

/**
 * Predictive `ready` for this chart's request key but carrying NO raw contexts —
 * exactly what a pre-v2 persisted predictive blob rehydrates to (see
 * `coercePersistedPredictive`). The status says ready; there is nothing for a
 * reading to actually compose.
 */
function predictiveReadyWithoutFacts(): void {
  usePredictiveStore.setState({
    status: 'ready',
    profileKey: 'chart-1',
    requestKey: expectedPredictiveKeyForChart(),
    rawContexts: undefined,
  });
}

/** Predictive `ready` with facts, but they belong to a DIFFERENT profile. */
function predictiveReadyForAnotherProfile(): void {
  usePredictiveStore.setState({
    status: 'ready',
    profileKey: 'some-other-profile',
    requestKey: expectedPredictiveKeyForChart(),
    rawContexts: RAW_CONTEXTS,
  });
}

/** Configure a synthetic cloud tier (configured, NOT on-device). */
function configureCloudAi(): void {
  writeLlmSettings(openRouterPreset('sk-or-v1-0000-synthetic-test-key', 'test-org/test-model'));
}

/** The identity of the config the interpretation path would use right now. */
function currentProvenance(): ReadingProvenance {
  return configProvenance(resolveInterpretationConfig());
}

function seedCompleteReading(provenance?: ReadingProvenance): void {
  useInterpretationStore.setState({ byChart: {} });
  useInterpretationStore
    .getState()
    // Seed a display-safe, natal-only INPUT provenance (predictiveRequestKey: null)
    // so main's identity-keyed display gate keeps the seeded reading on screen.
    // The enrich-when-ready decision is independent — it keys off the reading
    // provenance's `predictiveAware` flag (varied per test above).
    .setInterpretation('chart-1', INTERPRETATION, '2026-06-20T00:00:00Z', provenance, {
      predictiveRequestKey: null,
    });
}

function renderDashboard(): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Let any pending effect settle, then assert on stream calls. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

describe('Dashboard — enrich-when-ready (Spec 065)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(readLocalPrimaryChart).mockResolvedValue(primaryChartResponse());
    useChartLibraryStore.setState({ charts: { 'chart-1': storedChart() }, hydrated: true });
    useContentModeStore.setState({ contentMode: 'layman' });
    useProfilesStore.setState({ activeProfileId: null });
    usePredictiveStore.getState().reset();
  });

  it('regenerates the reading EXACTLY ONCE when predictive becomes ready and the reading is not yet predictive-aware', async () => {
    configureCloudAi();
    // Matches the current config so the PRE-EXISTING config-mismatch auto-regen
    // never fires — only the enrich-when-ready effect is under test here.
    seedCompleteReading({ ...currentProvenance(), predictiveAware: false });
    renderDashboard();

    await screen.findByTestId('reading-section');
    await settle();
    expect(mockedStream).not.toHaveBeenCalled();

    mockedStream.mockImplementation(completingStream(INTERPRETATION));
    // CONTRACT REVERSED (see the two convergence tests at the bottom of this
    // file). This step used to set `{ status: 'ready', profileKey: 'chart-1' }`
    // — no request key, no raw contexts — and assert that the dashboard spent a
    // generation on it. It must not: with nothing to compose, the regenerated
    // reading comes back non-predictive-aware, the gate reopens, and the next
    // visit buys another one. The test now hands over a predictive state that
    // is genuinely usable for this chart, where the upgrade really does converge
    // and this "exactly once" assertion has teeth.
    act(() => {
      predictiveReadyForThisChart();
    });

    await waitFor(() => expect(mockedStream).toHaveBeenCalledTimes(1));
    // One-shot: settling further must not spin a second call.
    await settle();
    expect(mockedStream).toHaveBeenCalledTimes(1);
  });

  it('does NOT regenerate when predictive becomes ready but the reading is ALREADY predictive-aware', async () => {
    configureCloudAi();
    seedCompleteReading({ ...currentProvenance(), predictiveAware: true });
    renderDashboard();

    await screen.findByTestId('reading-section');
    await settle();
    expect(mockedStream).not.toHaveBeenCalled();

    act(() => {
      usePredictiveStore.setState({ status: 'ready', profileKey: 'chart-1' });
    });
    await settle();
    expect(mockedStream).not.toHaveBeenCalled();
  });

  it('does NOT regenerate while predictive is not yet ready', async () => {
    configureCloudAi();
    seedCompleteReading({ ...currentProvenance(), predictiveAware: false });
    renderDashboard();

    await screen.findByTestId('reading-section');
    act(() => {
      usePredictiveStore.setState({ status: 'loading', profileKey: 'chart-1' });
    });
    await settle();
    expect(mockedStream).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // The upgrade must CONVERGE. Every automatic generation costs six parallel
  // LLM section calls plus an evidence-annotation call, so an upgrade that can
  // never satisfy its own gate spends that bill again on every single visit.
  // -------------------------------------------------------------------------

  it('does NOT buy the same failed upgrade again when the user navigates away and comes back', async () => {
    configureCloudAi();
    seedCompleteReading({ ...currentProvenance(), predictiveAware: false });
    predictiveReadyForThisChart();
    // The provider is down, so the upgrade never lands and the reading stays
    // non-predictive-aware — the state that used to re-arm on every mount.
    mockedStream.mockImplementation(failingStream());

    const firstVisit = renderDashboard();
    await screen.findByTestId('reading-section');
    await settle();
    expect(mockedStream).toHaveBeenCalledTimes(1);

    firstVisit.unmount();

    renderDashboard();
    await settle();
    await settle();
    expect(mockedStream).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['predictive is ready but carries no facts', predictiveReadyWithoutFacts],
    ['predictive facts belong to another profile', predictiveReadyForAnotherProfile],
  ])('does NOT spend a generation when %s', async (_label, makePredictiveReady) => {
    configureCloudAi();
    seedCompleteReading({ ...currentProvenance(), predictiveAware: false });
    renderDashboard();

    await screen.findByTestId('reading-section');
    await settle();
    expect(mockedStream).not.toHaveBeenCalled();

    mockedStream.mockImplementation(completingStream(INTERPRETATION));
    act(() => {
      makePredictiveReady();
    });
    await settle();
    await settle();
    // A run launched from here could not come back predictive-aware, so the
    // gate that asked for it would stay open and ask again on every visit.
    expect(mockedStream).not.toHaveBeenCalled();
  });
});
