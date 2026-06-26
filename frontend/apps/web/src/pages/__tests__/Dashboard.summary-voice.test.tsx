/**
 * Dashboard — dual-voice summary toggle (core regression guard).
 *
 * The "For You" / "For Astrologer" toggle (ContentModeToggle, backed by the
 * content-mode store) must switch the headline reading's VOICE instantly, at
 * render time, with NO LLM call. "For You" shows the jargon-free `layman`
 * voice; "For Astrologer" shows the `technical` voice that names placements.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
import DashboardPage from '../Dashboard';

// The dashboard reads its primary chart through this helper (via react-query).
// Stub it to resolve synchronously with our seeded chart so the test does not
// depend on IndexedDB hydration timing.
vi.mock('../../lib/localChartRead', () => ({
  readLocalPrimaryChart: vi.fn(),
}));
import { readLocalPrimaryChart } from '../../lib/localChartRead';

// The provenance footer reads the engine runtime context; without a booted
// engine it has no meta and renders nothing. Stub the context so the test does
// not need an AlmaMeshRuntimeProvider (unrelated to the summary voice).
vi.mock('../../providers/chartEngineContext', () => ({
  useChartEngine: () => ({ meta: null }),
  useOptionalChartEngine: () => null,
  ChartEngineContext: { Provider: ({ children }: { children: unknown }) => children },
}));

const LAYMAN_SUMMARY = 'You bring quiet persistence to whatever you commit to.';
const TECHNICAL_SUMMARY = 'Saturn in the 10th house anchors a disciplined identity.';

const INTERPRETATION: VedicInterpretation = {
  summary: { layman: LAYMAN_SUMMARY, technical: TECHNICAL_SUMMARY },
  strengths: [],
  challenges: [],
  life_themes: [],
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

describe('Dashboard — dual-voice summary toggle', () => {
  beforeEach(() => {
    vi.mocked(readLocalPrimaryChart).mockResolvedValue(primaryChartResponse());
    useChartLibraryStore.setState({ charts: { 'chart-1': storedChart() }, hydrated: true });
    useInterpretationStore.setState({ byChart: {} });
    useInterpretationStore
      .getState()
      .setInterpretation('chart-1', INTERPRETATION, '2026-06-20T00:00:00Z');
    useContentModeStore.setState({ contentMode: 'layman' });
  });

  it('renders the LAYMAN summary by default and the TECHNICAL summary after toggling', async () => {
    renderDashboard();

    // Default ("For You") shows the jargon-free layman voice; never the technical.
    const reading = await screen.findByTestId('reading-section');
    expect(reading.textContent ?? '').toContain(LAYMAN_SUMMARY);
    expect(reading.textContent ?? '').not.toContain(TECHNICAL_SUMMARY);

    // Toggle to "For Astrologer" — the summary re-renders in the technical voice
    // instantly (render-time, no regeneration).
    fireEvent.click(screen.getByTestId('astrologer-tab'));

    const readingAfter = await screen.findByTestId('reading-section');
    expect(readingAfter.textContent ?? '').toContain(TECHNICAL_SUMMARY);
    expect(readingAfter.textContent ?? '').not.toContain(LAYMAN_SUMMARY);
  });
});
