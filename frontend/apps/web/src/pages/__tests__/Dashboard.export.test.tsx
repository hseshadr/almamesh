/**
 * Dashboard — "Export PDF" is ONE click, rendered from stored data.
 *
 * THE CONTRACT THIS PINS (owner: "it should not prompt to export — all the data
 * is already in db. so just render pdf."):
 *
 *   1. The button EXPORTS. It does not navigate to `/report` and make the user
 *      hunt for a second button on a second screen.
 *   2. The only precondition is a STORED CHART. It is NOT gated on a finished AI
 *      interpretation — a user with no AI key must still be able to export the
 *      complete deterministic report.
 *   3. A render failure is a calm, on-screen, never-printed notice.
 *
 * The PDF pipeline itself (`downloadReportPdf`, which dynamically imports
 * @react-pdf/renderer) is mocked exactly as `ReportView.test.tsx` mocks it — the
 * real `useReportPdfExport` hook runs, so the enable/disable gate under test is
 * the production one, not a stub.
 *
 * All chart data below is SYNTHETIC.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useChartLibraryStore,
  useContentModeStore,
  useInterpretationStore,
  usePredictiveStore,
  useProfilesStore,
  type StoredChart,
} from '@almamesh/store';
import type { BirthChartGenerationResponse } from '@almamesh/shared-types';

import { buildObservations } from '../../lib/evidence';
import '../../i18n/config';

// The PDF pipeline (dynamically imports @react-pdf/renderer). Mocked so the
// click is observable and no real renderer boots in jsdom.
vi.mock('../../lib/downloadReportPdf', () => ({
  downloadReportPdf: vi.fn(async () => undefined),
}));

// The dashboard reads its primary chart through this helper (via react-query).
vi.mock('../../lib/localChartRead', () => ({
  readLocalPrimaryChart: vi.fn(),
}));

// The provenance footer / predictive layer read the engine runtime context;
// stub it so the test needs no AlmaMeshRuntimeProvider.
vi.mock('../../providers/chartEngineContext', () => ({
  useChartEngine: () => ({ meta: null }),
  useOptionalChartEngine: () => null,
  ChartEngineContext: { Provider: ({ children }: { children: ReactNode }) => children },
}));

// The heavy dashboard features are unrelated to the export gate. The
// IdentityStrip mock MUST render `actions` — that is where Export PDF lives.
vi.mock('../../components/features/dashboard', () => ({
  ChartVisualization: () => null,
  IdentityStrip: ({ actions }: { actions?: ReactNode }) => (
    <div data-testid="identity-strip">{actions}</div>
  ),
  LifeAtlas: () => null,
  DashboardInterpretation: () => null,
  ReadingGrounding: () => null,
}));

import { downloadReportPdf } from '../../lib/downloadReportPdf';
import { readLocalPrimaryChart } from '../../lib/localChartRead';
import DashboardPage from '../Dashboard';

function storedChart(): StoredChart {
  return {
    chart_id: 'chart-1',
    profile_id: 'profile-1',
    person_name: 'Asha Rao',
    is_primary: true,
    birth_data: {
      birth_datetime_utc: '1990-03-30T06:30:00Z',
      birth_datetime_local: '1990-03-30T12:00:00',
      birth_location_details: {
        city: 'Bengaluru',
        state: 'Karnataka',
        country: 'India',
        latitude: 12.97,
        longitude: 77.59,
        timezone: 'Asia/Kolkata',
      },
    },
    sidereal_chart: {
      ayanamsa_value: 23.86,
      lagna: {
        longitude: 5.4,
        sign: 'Aries',
        sign_degrees: 5.4,
        sign_lord: 'mars',
        nakshatra: 'Ashwini',
        nakshatra_pada: 2,
        nakshatra_lord: 'ketu',
      },
      planets: {},
      houses: {},
      dashas: {
        maha_dasha_sequence: [],
        current_maha: null,
        current_antar: null,
        current_pratyantar: null,
      },
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
  const chart = storedChart() as unknown as Record<string, unknown>;
  const { person_name, is_primary, chart_id, ...chartData } = chart;
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

/** Renders the live router location so a stray navigation is observable. */
function LocationProbe(): ReactElement {
  const location = useLocation();
  return <span data-testid="router-location">{`${location.pathname}${location.search}`}</span>;
}

function renderDashboard(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <LocationProbe />
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Dashboard — Export PDF (one click, stored data only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(readLocalPrimaryChart).mockResolvedValue(primaryChartResponse());
    useProfilesStore.setState({ activeProfileId: 'profile-1' });
    useChartLibraryStore.setState({ charts: { 'chart-1': storedChart() }, hydrated: true });
    // NO interpretation anywhere: this is the keyless user.
    useInterpretationStore.setState({ byChart: {} });
    useContentModeStore.setState({ contentMode: 'layman' });
    usePredictiveStore.getState().reset();
  });

  // THE RED TEST. Before the fix the button was `disabled={!canExportPdf(...)}`,
  // so with no interpretation it was disabled and its onClick navigated to
  // /report instead of exporting.
  it('exports in ONE click with NO interpretation at all', async () => {
    renderDashboard();

    const button = await screen.findByTestId<HTMLButtonElement>('print-chart-button');
    expect(button.disabled).toBe(false);

    fireEvent.click(button);

    await waitFor(() => expect(downloadReportPdf).toHaveBeenCalledTimes(1));
  });

  it('does NOT navigate away — the export happens in place', async () => {
    renderDashboard();

    const button = await screen.findByTestId<HTMLButtonElement>('print-chart-button');
    fireEvent.click(button);

    await waitFor(() => expect(downloadReportPdf).toHaveBeenCalled());
    expect(screen.getByTestId('router-location').textContent).toBe('/dashboard');
  });

  it('carries the exact reading the screen has (none here) into the export', async () => {
    renderDashboard();

    fireEvent.click(await screen.findByTestId('print-chart-button'));

    await waitFor(() => expect(downloadReportPdf).toHaveBeenCalled());
    const [input] = vi.mocked(downloadReportPdf).mock.calls[0];
    expect(input.interpretation).toBeUndefined();
    expect(input.birth).toBeTruthy();
  });

  /**
   * "Wired, not just built": the evidence section can be complete, tested and
   * rendered by the document and STILL never reach a user, if the one live
   * assembly forgets to pass it. This drives the real button and inspects the
   * payload — with NO reading generated, which is precisely the case where the
   * deterministic ledger has to carry the report on its own.
   */
  it('carries the deterministic evidence ledger into a keyless export', async () => {
    renderDashboard();

    fireEvent.click(await screen.findByTestId('print-chart-button'));

    await waitFor(() => expect(downloadReportPdf).toHaveBeenCalled());
    const [input] = vi.mocked(downloadReportPdf).mock.calls[0];
    expect(input.interpretation).toBeUndefined();
    expect(input.evidence?.rows.length ?? 0).toBeGreaterThan(0);
    // Every row keeps all five cells; only the interpretation is empty, and it
    // says so in words rather than going blank.
    for (const row of input.evidence?.rows ?? []) {
      expect(row.observation).not.toBe('');
      expect(row.evidence.length).toBeGreaterThan(0);
      expect(row.confidence).not.toBe('');
      expect(row.alternative).not.toBe('');
      expect(row.interpretation.toLowerCase()).toContain('no written interpretation');
    }
  });

  /**
   * The other half of "wired, not just built": with a reading stored, the model
   * prose must actually REACH the exported document — and a fabricated citation
   * must be rejected on that same live path, not merely inside the validator's
   * own unit test. This drives the real button with one honest annotation and
   * one that cites a yoga this chart does not contain.
   */
  it('carries VALIDATED model prose into the export and drops a fabricated citation', async () => {
    const sidereal = storedChart().sidereal_chart;
    if (!sidereal) throw new Error('The stored-chart fixture carries no sidereal chart');
    const observationId = buildObservations(sidereal).observations[0].id;
    useInterpretationStore.setState({
      byChart: {
        'chart-1': {
          status: 'complete',
          sections: {},
          // Annotations follow the SAME staleness gate as the reading: a chart
          // whose inputs have moved on must not show either.
          inputProvenance: { predictiveRequestKey: null },
          evidenceAnnotations: {
            readings: [
              { observation_id: observationId, interpretation: 'GROUNDED_SENTINEL' },
              { observation_id: 'yoga:Not In This Chart', interpretation: 'HALLUCINATED_SENTINEL' },
            ],
          },
        },
      },
    });
    renderDashboard();

    fireEvent.click(await screen.findByTestId('print-chart-button'));

    await waitFor(() => expect(downloadReportPdf).toHaveBeenCalled());
    const [input] = vi.mocked(downloadReportPdf).mock.calls[0];
    const rendered = JSON.stringify(input.evidence);

    expect(rendered).toContain('GROUNDED_SENTINEL');
    // The fabricated statement reaches no cell of the exported document.
    expect(rendered).not.toContain('HALLUCINATED_SENTINEL');
    // And the drop is disclosed to the reader rather than being silent.
    expect(rendered).toMatch(/Not In This Chart/);
  });

  it('never mentions an AI reading in the button tooltip', async () => {
    renderDashboard();

    const button = await screen.findByTestId<HTMLButtonElement>('print-chart-button');
    expect(button.getAttribute('title') ?? '').not.toMatch(/interpretation|reading/i);
  });

  it('disables the button ONLY when no chart is stored', async () => {
    // The react-query read still resolves (so the page renders), but the chart
    // library holds nothing for the active profile — there is nothing to export.
    useChartLibraryStore.setState({ charts: {}, hydrated: true });
    renderDashboard();

    const button = await screen.findByTestId<HTMLButtonElement>('print-chart-button');
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('title') ?? '').not.toMatch(/interpretation|reading/i);
  });

  it('surfaces a calm, no-print notice when the PDF render fails', async () => {
    vi.mocked(downloadReportPdf).mockRejectedValueOnce(new Error('toBlob failed'));
    renderDashboard();

    const button = await screen.findByTestId<HTMLButtonElement>('print-chart-button');
    expect(screen.queryByTestId('dashboard-pdf-error')).toBeNull();

    fireEvent.click(button);

    const notice = await screen.findByTestId('dashboard-pdf-error');
    expect(notice.getAttribute('role')).toBe('alert');
    expect(notice.className).toContain('no-print');
  });
});
