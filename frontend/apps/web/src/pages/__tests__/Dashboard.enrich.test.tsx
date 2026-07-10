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
  useChartLibraryStore,
  useInterpretationStore,
  useContentModeStore,
  usePredictiveStore,
  useProfilesStore,
  type StoredChart,
} from '@almamesh/store';
import type { BirthChartGenerationResponse, VedicInterpretation } from '@almamesh/shared-types';

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
    .setInterpretation('chart-1', INTERPRETATION, '2026-06-20T00:00:00Z', provenance);
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
    act(() => {
      usePredictiveStore.setState({ status: 'ready', profileKey: 'chart-1' });
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
});
