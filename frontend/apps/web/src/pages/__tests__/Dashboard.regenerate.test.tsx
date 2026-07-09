/**
 * Dashboard — "Regenerate reading" + LLM-config-change auto-regeneration.
 *
 * A completed reading carries a provenance fingerprint of the config that
 * produced it. The reading-section header offers a Regenerate button (disabled
 * while generating / when no AI is configured), and the auto-generate effect
 * regenerates ONCE when the stored provenance no longer matches the currently
 * resolved config — but only when AI is configured. A stale reading is NEVER
 * destroyed: it stays on screen through (and after, if) a failed regeneration.
 *
 * All chart/interpretation data below is SYNTHETIC.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useChartLibraryStore,
  useInterpretationStore,
  useContentModeStore,
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
// does not need an AlmaMeshRuntimeProvider (unrelated to regeneration).
vi.mock('../../providers/chartEngineContext', () => ({
  useChartEngine: () => ({ meta: null }),
  useOptionalChartEngine: () => null,
  ChartEngineContext: { Provider: ({ children }: { children: unknown }) => children },
}));

// The chart visualization / Life Atlas need a full engine-shaped sidereal
// chart (kundli geometry, predictive compute) — unrelated to regeneration.
// Stub them so the minimal raw chart fixture below can stay minimal.
vi.mock('../../components/features/dashboard', () => ({
  ChartVisualization: () => null,
  IdentityStrip: () => null,
  LifeAtlas: () => null,
  DashboardInterpretation: () => null,
}));

import {
  configProvenance,
  LlmRequestError,
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

/** A generator that never finishes — pins the hook in the generating state. */
function pendingStream(): () => AsyncGenerator<InterpretationEvent> {
  return async function* () {
    await new Promise<never>(() => {});
    yield* [] as InterpretationEvent[];
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

/** A generator that fails outright before yielding any event. */
function failingStream(error: Error): () => AsyncGenerator<InterpretationEvent> {
  return async function* () {
    for (const e of [] as InterpretationEvent[]) yield e;
    throw error;
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

/** A producer identity that matches NO current config (a replaced model). */
const STALE_PROVENANCE: ReadingProvenance = {
  engine: 'openai-http',
  model: 'legacy-org/retired-model',
  baseUrl: 'https://example.invalid/v1',
};

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

/** Let any pending auto-generate effect settle, then assert on stream calls. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

describe('Dashboard — regenerate reading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(readLocalPrimaryChart).mockResolvedValue(primaryChartResponse());
    useChartLibraryStore.setState({ charts: { 'chart-1': storedChart() }, hydrated: true });
    useContentModeStore.setState({ contentMode: 'layman' });
  });

  it('shows an enabled "Regenerate reading" button in the reading header when AI is configured', async () => {
    configureCloudAi();
    seedCompleteReading(currentProvenance());
    renderDashboard();

    const button = await screen.findByTestId<HTMLButtonElement>('regenerate-reading');
    expect(button.disabled).toBe(false);
    // Scoped label: the READING regenerates — the chart is deterministic and
    // never needs to.
    expect(button.textContent ?? '').toContain('Regenerate reading');
  });

  it('disables the Regenerate button when no AI is configured (reading still shown)', async () => {
    // No settings written: tier is none. The stale reading must keep rendering.
    seedCompleteReading(STALE_PROVENANCE);
    renderDashboard();

    const reading = await screen.findByTestId('reading-section');
    expect(reading.textContent ?? '').toContain(LAYMAN_SUMMARY);
    expect(screen.getByTestId<HTMLButtonElement>('regenerate-reading').disabled).toBe(true);
    await settle();
    expect(mockedStream).not.toHaveBeenCalled();
  });

  it('captions the reading with the model that generated it and the date', async () => {
    configureCloudAi();
    seedCompleteReading(currentProvenance());
    renderDashboard();

    const caption = await screen.findByTestId('reading-provenance');
    expect(caption.textContent ?? '').toContain(currentProvenance().model);
    expect(caption.textContent ?? '').toContain('2026');
  });

  it('falls back to a date-only caption for a legacy reading with no provenance', async () => {
    // No AI configured (nothing regenerates) + a legacy pre-provenance entry:
    // the caption degrades gracefully to the date, never a blank "by".
    seedCompleteReading(undefined);
    renderDashboard();

    const caption = await screen.findByTestId('reading-provenance');
    expect(caption.textContent ?? '').toContain('2026');
    expect(caption.textContent ?? '').not.toContain('by ');
  });

  it('clicking Regenerate starts a new generation, keeps the old reading visible, and disables the button', async () => {
    configureCloudAi();
    seedCompleteReading(currentProvenance());
    mockedStream.mockImplementation(pendingStream());
    renderDashboard();

    const button = await screen.findByTestId('regenerate-reading');
    fireEvent.click(button);

    await waitFor(() => expect(mockedStream).toHaveBeenCalledTimes(1));
    // Keep-old-until-success: the prior reading stays on screen while the new
    // run is in flight, and the button cannot double-fire.
    const reading = screen.getByTestId('reading-section');
    expect(reading.textContent ?? '').toContain(LAYMAN_SUMMARY);
    await waitFor(() =>
      expect(screen.getByTestId<HTMLButtonElement>('regenerate-reading').disabled).toBe(true),
    );
  });

  it('does NOT auto-regenerate when the stored provenance matches the current config', async () => {
    configureCloudAi();
    seedCompleteReading(currentProvenance());
    renderDashboard();

    await screen.findByTestId('reading-section');
    await settle();
    expect(mockedStream).not.toHaveBeenCalled();
  });

  it('auto-regenerates ONCE when the stored provenance no longer matches the config', async () => {
    configureCloudAi();
    seedCompleteReading(STALE_PROVENANCE);
    mockedStream.mockImplementation(completingStream(INTERPRETATION));
    renderDashboard();

    await waitFor(() => expect(mockedStream).toHaveBeenCalledTimes(1));
    await settle();
    expect(mockedStream).toHaveBeenCalledTimes(1);
  });

  it('treats a legacy reading with NO provenance as a mismatch (regenerates once)', async () => {
    configureCloudAi();
    seedCompleteReading(undefined);
    mockedStream.mockImplementation(completingStream(INTERPRETATION));
    renderDashboard();

    await waitFor(() => expect(mockedStream).toHaveBeenCalledTimes(1));
  });

  it('a FAILED auto-regeneration does not retrigger and keeps the old reading on screen', async () => {
    configureCloudAi();
    seedCompleteReading(STALE_PROVENANCE);
    mockedStream.mockImplementation(failingStream(new Error('HTTP 500 from endpoint')));
    renderDashboard();

    await waitFor(() => expect(mockedStream).toHaveBeenCalledTimes(1));
    await settle();
    // Loop guard: exactly one attempt per mismatch — a failure must not spin.
    expect(mockedStream).toHaveBeenCalledTimes(1);
    // The stale reading survives the failed run.
    const reading = screen.getByTestId('reading-section');
    expect(reading.textContent ?? '').toContain(LAYMAN_SUMMARY);
  });

  it('a FAILED manual regeneration surfaces an inline, dismissible error strip in the reading section', async () => {
    configureCloudAi();
    // Provenance matches: nothing auto-regenerates — only the manual click runs.
    seedCompleteReading(currentProvenance());
    mockedStream.mockImplementation(failingStream(new Error('HTTP 500 from endpoint')));
    renderDashboard();

    fireEvent.click(await screen.findByTestId('regenerate-reading'));
    await waitFor(() => expect(mockedStream).toHaveBeenCalledTimes(1));

    // The failure is VISIBLE inside the reading section — not swallowed by
    // keep-old-until-success — while the old reading stays on screen.
    const strip = await screen.findByTestId('reading-regen-error');
    expect(within(screen.getByTestId('reading-section')).getByTestId('reading-regen-error')).toBe(strip);
    expect(screen.getByTestId('reading-section').textContent ?? '').toContain(LAYMAN_SUMMARY);

    // Actionable: Retry + the AI-settings door.
    expect(within(strip).getByTestId('reading-regen-retry')).toBeTruthy();
    const settingsLink = within(strip).getByTestId('reading-regen-ai-settings');
    expect(settingsLink.getAttribute('href')).toBe('/settings/ai');

    // Dismissible: the strip goes away, the reading stays.
    fireEvent.click(within(strip).getByTestId('reading-regen-dismiss'));
    expect(screen.queryByTestId('reading-regen-error')).toBeNull();
    expect(screen.getByTestId('reading-section').textContent ?? '').toContain(LAYMAN_SUMMARY);
  });

  it('REGRESSION: a failure embedding the endpoint URL renders friendly copy on the strip, never the URL', async () => {
    configureCloudAi();
    seedCompleteReading(currentProvenance());
    // The all-sections-failed aggregate is a plain Error whose message can
    // carry the configured endpoint (a build-time VITE_LLM_API_BASE value).
    mockedStream.mockImplementation(
      failingStream(
        new Error(
          'Interpretation failed: all 5 sections failed. ' +
            'LLM request to https://openrouter.example/api/v1/chat/completions failed (HTTP 401)',
        ),
      ),
    );
    renderDashboard();

    fireEvent.click(await screen.findByTestId('regenerate-reading'));
    const strip = await screen.findByTestId('reading-regen-error');
    const text = strip.textContent ?? '';
    expect(text).not.toContain('https://');
    expect(text).not.toContain('openrouter.example');
    // Friendly + actionable: points at retry / AI settings.
    expect(text).toMatch(/settings/i);
  });

  it('a dead/retired-model failure surfaces the switch-model prompt on the regen strip', async () => {
    configureCloudAi();
    seedCompleteReading(currentProvenance());
    mockedStream.mockImplementation(
      failingStream(
        new LlmRequestError('HTTP 404: No endpoints found for test-org/retired-model', {
          status: 404,
        }),
      ),
    );
    renderDashboard();

    fireEvent.click(await screen.findByTestId('regenerate-reading'));
    const strip = await screen.findByTestId('reading-regen-error');
    // The existing switch-model recovery: copy + the one-click preset button.
    expect(strip.textContent ?? '').toContain('Switch to the recommended model');
    expect(within(strip).getByTestId('reading-regen-switch-recommended')).toBeTruthy();
    // Neither the raw body nor the internal sentinel ever renders.
    expect(strip.textContent ?? '').not.toContain('No endpoints found');
    expect(strip.textContent ?? '').not.toContain('reading_model_unavailable');
  });

  it('Retry on the error strip starts a fresh generation (and clears the strip while running)', async () => {
    configureCloudAi();
    seedCompleteReading(currentProvenance());
    mockedStream.mockImplementation(failingStream(new Error('HTTP 500 from endpoint')));
    renderDashboard();

    fireEvent.click(await screen.findByTestId('regenerate-reading'));
    const strip = await screen.findByTestId('reading-regen-error');
    // Let the (pre-existing) single follow-up auto-attempt settle so the call
    // count below is stable before Retry is exercised.
    await settle();
    const callsBefore = mockedStream.mock.calls.length;

    mockedStream.mockImplementation(pendingStream());
    fireEvent.click(within(strip).getByTestId('reading-regen-retry'));

    await waitFor(() => expect(mockedStream.mock.calls.length).toBe(callsBefore + 1));
    // While the retry is in flight the error strip yields (status: generating).
    await waitFor(() => expect(screen.queryByTestId('reading-regen-error')).toBeNull());
  });

  it('with NO AI configured the disabled Regenerate also carries the connect-AI caption', async () => {
    // No settings written: tier is none — same rule, different guidance copy.
    seedCompleteReading(STALE_PROVENANCE);
    renderDashboard();

    await screen.findByTestId('reading-section');
    expect(screen.getByTestId<HTMLButtonElement>('regenerate-reading').disabled).toBe(true);
    const note = screen.getByTestId('regenerate-unavailable');
    expect(note.textContent ?? '').toContain('Connect an AI model');
    expect(note.querySelector('a')?.getAttribute('href')).toBe('/settings/ai');
  });
});
