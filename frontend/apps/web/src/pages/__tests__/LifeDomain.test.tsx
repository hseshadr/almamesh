import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  useChartLibraryStore,
  useInterpretationStore,
  useLanguageStore,
  usePredictiveStore,
  type StoredChart,
} from '@almamesh/store';
import type { VedicInterpretation } from '@almamesh/shared-types';

import '../../i18n/config';
import LifeDomainPage from '../LifeDomain';
import { DOMAINS_CTX } from '../../test/predictiveFixtures';

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
  } as StoredChart;
}

const INTERPRETATION: VedicInterpretation = {
  summary: { layman: 'A summary.', technical: 'A summary.' },
  strengths: [],
  challenges: [],
  life_themes: [],
  career_guidance: {
    layman: 'Steady, structured careers suit you.',
    technical: 'The 10th lord favors institutions.',
  },
};

function renderAt(path: string): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/life/:domain" element={<LifeDomainPage />} />
        <Route path="/dashboard" element={<div data-testid="dashboard-stub" />} />
      </Routes>
    </MemoryRouter>,
  );
}

function seedReady(): void {
  usePredictiveStore.setState({
    status: 'ready',
    domainsCtx: DOMAINS_CTX,
    profileKey: 'chart-1',
  });
}

describe('LifeDomainPage', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
    useChartLibraryStore.setState({ charts: { 'chart-1': storedChart() }, hydrated: true });
    usePredictiveStore.getState().reset();
    useInterpretationStore.setState({ byChart: {} });
  });

  it('redirects an unknown domain slug back to the dashboard', () => {
    renderAt('/life/nonsense');
    expect(screen.getByTestId('dashboard-stub')).toBeTruthy();
    expect(screen.queryByTestId('life-domain-page')).toBeNull();
  });

  it('shows the honest engine-warming gate (no manual button) before the forecast computes', () => {
    // Rendered without the engine provider → auto-compute cannot fire yet.
    renderAt('/life/career');
    const gate = screen.getByTestId('life-domain-gate');
    // The forecast is FOUNDATIONAL — there is never a manual compute button.
    expect(screen.queryByTestId('life-domain-compute')).toBeNull();
    expect(gate.textContent).toContain('engine is still starting');
  });

  it('renders the engine forecast: strength, emphasis, windows and the working reveal', () => {
    seedReady();
    renderAt('/life/career');
    const page = screen.getByTestId('life-domain-page');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Career');
    expect(screen.getByTestId('band-strong')).toBeTruthy();
    // Rupas formatted to two decimals — never the engine's raw float.
    expect(page.textContent).toContain('6.13 rūpas');
    expect(page.textContent).not.toContain('6.128260954302394');
    expect(screen.getByTestId('domain-emphasis-career')).toBeTruthy();
    expect(screen.getByTestId('domain-windows-career')).toBeTruthy();
    // "Show the working" is a Disclosure: collapsed by default, reveals houses.
    const toggle = screen
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-expanded') === 'false');
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle!);
    expect(page.textContent).toContain('House 10');
  });

  it('shows the matching AI reading section when the interpretation has one', () => {
    seedReady();
    useInterpretationStore.setState({
      byChart: {
        'chart-1': { status: 'complete', interpretation: INTERPRETATION, sections: {} },
      },
    });
    renderAt('/life/career');
    const ai = screen.getByTestId('life-domain-ai');
    expect(ai.textContent).toContain('Steady, structured careers suit you.');
    expect(ai.textContent).toContain('AI narration');
  });

  it('says honestly when no AI section exists for the domain', () => {
    seedReady();
    renderAt('/life/career');
    expect(screen.getByTestId('life-domain-ai').textContent).toContain(
      'no section for this domain yet',
    );
  });

  it('labels family as engine-only (the reading has no family section)', () => {
    seedReady();
    useInterpretationStore.setState({
      byChart: {
        'chart-1': { status: 'complete', interpretation: INTERPRETATION, sections: {} },
      },
    });
    renderAt('/life/family');
    expect(screen.getByTestId('life-domain-ai').textContent).toContain('engine alone');
  });

  it('links back to the dashboard and into chat', () => {
    seedReady();
    renderAt('/life/career');
    expect(screen.getByTestId('life-domain-back').getAttribute('href')).toBe('/dashboard');
    expect(screen.getByTestId('life-domain-chat-link').getAttribute('href')).toBe(
      '/dashboard?chat=open',
    );
  });
});
