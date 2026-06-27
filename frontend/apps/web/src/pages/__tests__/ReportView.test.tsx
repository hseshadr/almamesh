import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  useChartLibraryStore,
  useInterpretationStore,
  usePredictiveStore,
  type StoredChart,
} from '@almamesh/store';
import type { SiderealChart } from '@almamesh/browser/types';
import type { VedicInterpretation } from '@almamesh/shared-types';
import {
  DOMAINS_CTX,
  STRENGTH_CTX,
  TRANSIT_CTX,
  VARGA_CTX_FULL,
} from '../../test/predictiveFixtures';

// Initialize i18next with the bundled catalogs so `t()` yields English (the
// authoritative locale) in these assertions; importing the config is a
// synchronous, side-effecting init (inline resources, no async backend).
import '../../i18n/config';
import ReportView from '../ReportView';

// --- A complete-enough engine chart fixture (Title-Case signs, as emitted) ---
const CHART: SiderealChart = {
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
  planets: {
    sun: {
      name: 'sun',
      longitude: 100.5,
      latitude: 0,
      distance: 1,
      speed: 1,
      is_retrograde: false,
      sign: 'Cancer',
      sign_degrees: 10.5,
      sign_lord: 'moon',
      nakshatra: 'Pushya',
      nakshatra_pada: 1,
      nakshatra_lord: 'saturn',
      house: 4,
      dignity: 'neutral',
      is_combust: false,
      combustion_separation_deg: null,
      houses_ruled: [2],
      is_yogakaraka: false,
    },
    mars: {
      name: 'mars',
      longitude: 280.5,
      latitude: 0,
      distance: 1,
      speed: 0.5,
      is_retrograde: true,
      sign: 'Scorpio',
      sign_degrees: 12.6833,
      sign_lord: 'mars',
      nakshatra: 'Anuradha',
      nakshatra_pada: 3,
      nakshatra_lord: 'saturn',
      house: 8,
      dignity: 'own_sign',
      is_combust: true,
      combustion_separation_deg: 4.2,
      houses_ruled: [1, 8],
      is_yogakaraka: false,
    },
  },
  houses: Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => {
      const sign = [
        'Aries',
        'Taurus',
        'Gemini',
        'Cancer',
        'Leo',
        'Virgo',
        'Libra',
        'Scorpio',
        'Sagittarius',
        'Capricorn',
        'Aquarius',
        'Pisces',
      ][i];
      return [String(i + 1), { house: i + 1, longitude: i * 30, sign, sign_lord: 'mars' }];
    }),
  ) as SiderealChart['houses'],
  dashas: {
    maha_dasha_sequence: [
      { lord: 'venus', start_date: '1985-01-01', end_date: '2005-01-01', duration_years: 20 },
      { lord: 'sun', start_date: '2005-01-01', end_date: '2011-01-01', duration_years: 6 },
      { lord: 'moon', start_date: '2011-01-01', end_date: '2021-01-01', duration_years: 10 },
    ],
    current_maha: { lord: 'moon', start_date: '2011-01-01', end_date: '2021-01-01', duration_years: 10 },
    current_antar: { lord: 'jupiter', start_date: '2018-01-01', end_date: '2019-06-01', duration_years: 1.4 },
    current_pratyantar: null,
  },
  yogas: [
    {
      name: 'Gaja-Kesari Yoga',
      display_name: 'Gaja-Kesari Yoga (Jupiter in a kendra from the Moon)',
      category: 'auspicious',
      description: 'Moon and Jupiter in mutual kendra — wisdom and prosperity.',
      effects: 'Renown and respect.',
      grade: 'moderate',
      strength_factors: [
        {
          factor_type: 'dignity',
          planet: 'jupiter',
          value: 'exalted',
          basis: 'Sign dignity per the BPHS exaltation/own-sign doctrine',
        },
      ],
      planets_involved: ['moon', 'jupiter'],
      houses_involved: [1, 4],
      planetary_signature: 'jupiter_moon_h1_h4',
      formation_rules: [
        {
          rule: 'chandra.gaja_kesari',
          description: 'Jupiter in a kendra from the Moon',
          source: 'BPHS, Chandra-yoga adhyaya',
          planets: ['moon', 'jupiter'],
          houses: [1, 4],
        },
      ],
    },
    {
      name: 'Vipareeta Raja Yoga',
      display_name: 'Vipareeta Raja Yoga (Harsha: the 6th lord in the 8th)',
      category: 'raja',
      description: 'The 6th lord placed in a dusthana.',
      effects: 'Gains through adversity.',
      grade: 'weak',
      strength_factors: [
        {
          factor_type: 'house_class',
          planet: 'mars',
          value: 'dusthana (house 8)',
          basis: 'Whole-sign house class from the lagna (kendra/trikona/upachaya/dusthana)',
        },
      ],
      planets_involved: ['mars'],
      houses_involved: [6, 8],
      planetary_signature: 'mars_h6_h8',
      formation_rules: [
        {
          rule: 'vipareeta.harsha',
          description: 'The 6th lord Mars placed in the 8th (dusthana)',
          source: 'Phaladeepika, Vipareeta Raja-yoga adhyaya',
          planets: ['mars'],
          houses: [6, 8],
        },
      ],
    },
  ],
  navamsa: {
    name: 'D9',
    lagna_sign: 'Leo',
    lagna_sign_lord: 'sun',
    planets: {
      sun: { name: 'sun', sign: 'Aries', sign_lord: 'mars' },
      mars: { name: 'mars', sign: 'Capricorn', sign_lord: 'saturn' },
    },
  },
};

const FULL_INTERPRETATION: VedicInterpretation = {
  summary: {
    layman: 'A balanced chart with strong drive.',
    technical: 'A balanced chart: exalted Mars in the 8th drives transformation.',
  },
  strengths: [
    { title: 'Determination', layman: 'You push through hard things.', technical: 'Exalted Mars in the 8th lends grit.' },
  ],
  challenges: [
    { title: 'Impatience', layman: 'You can rush decisions.', technical: 'Retrograde Mars suggests revisited aggression.' },
  ],
  life_themes: [
    { title: 'Transformation', layman: 'Reinvention is your lifelong arc.', technical: '8th-house emphasis signals deep change.' },
  ],
  integrated_yoga_narrative: {
    layman: 'Your yogas point to recognition.',
    technical: 'Gaja-Kesari fortifies the lagna axis.',
  },
  health_guidance: { layman: 'Mind your energy.', technical: 'Watch Mars-ruled inflammation.' },
  career_guidance: { layman: 'You lead well.', technical: 'Tenth-lord placement favors authority.' },
  relationship_guidance: null,
  remedial_measures: { layman: 'Practice patience daily.', technical: 'Mars mantra on Tuesdays.' },
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
        state: 'Karnataka',
        country: 'India',
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
    sidereal_chart: CHART,
  } as StoredChart;
}

function seed(interpretationComplete = true): void {
  useChartLibraryStore.setState({ charts: { 'chart-1': storedChart() }, hydrated: true });
  useInterpretationStore.setState({ byChart: {} });
  if (interpretationComplete) {
    useInterpretationStore.getState().setInterpretation('chart-1', FULL_INTERPRETATION, '2026-06-05T00:00:00Z');
  }
}

function renderReport(mode: string): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[`/report?mode=${mode}`]}>
      <ReportView />
    </MemoryRouter>,
  );
}

describe('ReportView', () => {
  beforeEach(() => {
    useChartLibraryStore.setState({ charts: {}, hydrated: true });
    useInterpretationStore.setState({ byChart: {} });
    usePredictiveStore.getState().reset();
  });

  it('renders all major sections when a chart + complete interpretation exist', () => {
    seed();
    renderReport('astrologer');

    expect(screen.getByTestId('report-cover')).toBeTruthy();
    expect(screen.getByTestId('report-charts')).toBeTruthy();
    expect(screen.getByTestId('report-planet-table')).toBeTruthy();
    expect(screen.getByTestId('report-yogas')).toBeTruthy();
    expect(screen.getByTestId('report-dasha')).toBeTruthy();
    expect(screen.getByTestId('report-interpretation')).toBeTruthy();
    expect(screen.getByTestId('report-footer')).toBeTruthy();
  });

  it('renders every formed yoga with its grade word and classical citation — no percentages', () => {
    seed();
    renderReport('astrologer');
    const yogas = screen.getByTestId('report-yogas');
    // Both engine-emitted yogas render: only FORMED yogas exist in the contract.
    expect(
      within(yogas).getByText('Gaja-Kesari Yoga (Jupiter in a kendra from the Moon)'),
    ).toBeTruthy();
    expect(
      within(yogas).getByText('Vipareeta Raja Yoga (Harsha: the 6th lord in the 8th)'),
    ).toBeTruthy();
    // The grade is a typographic word from the engine's closed vocabulary —
    // the old fake percentage badge is gone.
    expect(within(yogas).getByText('moderate')).toBeTruthy();
    expect(within(yogas).getByText('weak')).toBeTruthy();
    expect(yogas.textContent ?? '').not.toMatch(/%/);
    // One-line basis + classical citation from the engine's formation trace.
    expect(
      within(yogas).getByText(/The 6th lord Mars placed in the 8th \(dusthana\)/),
    ).toBeTruthy();
    expect(within(yogas).getByText(/BPHS, Chandra-yoga adhyaya/)).toBeTruthy();
    expect(within(yogas).getByText(/Phaladeepika, Vipareeta Raja-yoga adhyaya/)).toBeTruthy();
  });

  it('renders a real generated date — never 1969 or Invalid', () => {
    seed();
    renderReport('you');
    const generated = screen.getByTestId('report-generated-date').textContent ?? '';
    expect(generated).not.toMatch(/1969/);
    expect(generated).not.toMatch(/invalid/i);
    expect(generated).toContain(String(new Date().getFullYear()));
  });

  it('renders a place string with no trailing/empty commas', () => {
    seed();
    renderReport('you');
    const place = screen.getByTestId('report-birth-place').textContent ?? '';
    expect(place).toBe('Bengaluru, Karnataka, India');
    expect(place).not.toMatch(/,\s*,/);
    expect(place.trim()).not.toMatch(/,\s*$/);
  });

  it('shows the layman voice in "you" mode', () => {
    seed();
    renderReport('you');
    const interp = screen.getByTestId('report-interpretation');
    expect(within(interp).getByText('You push through hard things.')).toBeTruthy();
    expect(within(interp).queryByText('Exalted Mars in the 8th lends grit.')).toBeNull();
  });

  it('shows the technical voice in "astrologer" mode', () => {
    seed();
    renderReport('astrologer');
    const interp = screen.getByTestId('report-interpretation');
    expect(within(interp).getByText('Exalted Mars in the 8th lends grit.')).toBeTruthy();
    expect(within(interp).queryByText('You push through hard things.')).toBeNull();
  });

  it('marks the audience badge per the mode', () => {
    seed();
    renderReport('astrologer');
    expect(screen.getByTestId('report-audience-badge').textContent).toBe('For Astrologer');
  });

  it('carries the no-print class on the toolbar and its buttons', () => {
    seed();
    renderReport('you');
    expect(screen.getByTestId('report-toolbar').className).toContain('no-print');
    expect(screen.getByTestId('report-download-pdf').className).toContain('no-print');
    expect(screen.getByTestId('report-back').className).toContain('no-print');
  });

  it('exposes "Download PDF" as the only PDF action — the legacy print button is gone', () => {
    seed();
    renderReport('you');
    expect(screen.getByTestId('report-download-pdf')).toBeTruthy();
    expect(screen.queryByTestId('report-save-pdf')).toBeNull();
  });

  it('omits sections whose guidance is null for the audience', () => {
    seed();
    renderReport('you');
    // relationship_guidance is null in the fixture → no relationship block.
    expect(screen.queryByTestId('report-guidance-relationship')).toBeNull();
    // career + health + remedial are present.
    expect(screen.getByTestId('report-guidance-career')).toBeTruthy();
    expect(screen.getByTestId('report-guidance-health')).toBeTruthy();
    expect(screen.getByTestId('report-guidance-remedial')).toBeTruthy();
  });

  it('renders the natal report (no dead-end) when the interpretation is not complete', () => {
    seed(false);
    renderReport('you');
    // The deterministic natal halves render even without an interpretation...
    expect(screen.getByTestId('report-document')).toBeTruthy();
    expect(screen.getByTestId('report-cover')).toBeTruthy();
    expect(screen.getByTestId('report-charts')).toBeTruthy();
    expect(screen.getByTestId('report-planet-table')).toBeTruthy();
    expect(screen.getByTestId('report-dasha')).toBeTruthy();
    expect(screen.getByTestId('report-yogas')).toBeTruthy();
    // ...but the written Interpretation section is omitted.
    expect(screen.queryByTestId('report-interpretation')).toBeNull();
    // An on-screen hint nudges the user to generate the full reading.
    expect(screen.getByTestId('report-narrative-hint')).toBeTruthy();
    // The PDF download stays enabled (no dead-end).
    expect(screen.getByTestId('report-download-pdf')).toBeTruthy();
  });

  it('shows the graceful empty state when there is no chart', () => {
    renderReport('you');
    expect(screen.queryByTestId('report-document')).toBeNull();
    expect(screen.getByText(/No chart found/i)).toBeTruthy();
  });

  it('renders interpretation markdown as formatted HTML — no literal * or # leaks', () => {
    const MARKDOWN: VedicInterpretation = {
      ...FULL_INTERPRETATION,
      summary: {
        layman: 'A **balanced** chart with clear focus on:\n\n- discipline\n- growth',
        technical: 'A **balanced** chart with clear focus on:\n\n- discipline\n- growth',
      },
      strengths: [
        {
          title: 'Determination',
          layman: 'You show **deep** grit.\n\n## Inner drive\n\nIt carries you forward.',
          technical: 'Exalted Mars in the 8th lends grit.',
        },
      ],
    };
    useChartLibraryStore.setState({ charts: { 'chart-1': storedChart() }, hydrated: true });
    useInterpretationStore.setState({ byChart: {} });
    useInterpretationStore.getState().setInterpretation('chart-1', MARKDOWN, '2026-06-05T00:00:00Z');
    renderReport('you');

    const summary = screen.getByTestId('report-summary');
    // Bold markdown becomes a real <strong>, not literal asterisks.
    expect(within(summary).getByText('balanced').tagName).toBe('STRONG');
    expect(summary.textContent ?? '').not.toMatch(/\*/);
    // Bullet list becomes a real <ul><li>.
    expect(summary.querySelectorAll('ul li').length).toBe(2);

    const strengths = screen.getByTestId('report-strengths');
    expect(within(strengths).getByText('deep').tagName).toBe('STRONG');
    // Heading markdown becomes a real heading element, not literal hashes.
    expect(within(strengths).getByText('Inner drive').tagName).toMatch(/^H[1-6]$/);
    expect(strengths.textContent ?? '').not.toMatch(/[#*]/);
  });
});

describe('ReportView predictive sections', () => {
  beforeEach(() => {
    useChartLibraryStore.setState({ charts: {}, hydrated: true });
    useInterpretationStore.setState({ byChart: {} });
    usePredictiveStore.getState().reset();
  });

  it('offers an on-screen (no-print) compute affordance when contexts are absent', () => {
    seed();
    renderReport('astrologer');
    const pending = screen.getByTestId('report-predictive-pending');
    expect(pending.className).toContain('no-print');
    // No predictive sections in the printable document yet.
    expect(screen.queryByTestId('report-transits')).toBeNull();
    expect(screen.queryByTestId('report-vargas')).toBeNull();
    expect(screen.queryByTestId('report-strength')).toBeNull();
    expect(screen.queryByTestId('report-domains')).toBeNull();
  });

  it('renders Transits, Vargas, Strength and Domains sections once computed', () => {
    seed();
    usePredictiveStore.setState({
      status: 'ready',
      transitCtx: TRANSIT_CTX,
      vargaCtxFull: VARGA_CTX_FULL,
      strengthCtx: STRENGTH_CTX,
      domainsCtx: DOMAINS_CTX,
      profileKey: 'chart-1',
    });
    renderReport('astrologer');

    // Affordance gone; printable sections present.
    expect(screen.queryByTestId('report-predictive-pending')).toBeNull();
    expect(screen.getByTestId('report-transits')).toBeTruthy();
    expect(screen.getByTestId('report-vargas')).toBeTruthy();
    expect(screen.getByTestId('report-strength')).toBeTruthy();
    expect(screen.getByTestId('report-domains')).toBeTruthy();

    // Engine values verbatim: the canonical SAV total and a timeline event.
    expect(within(screen.getByTestId('report-strength')).getByText(/Total 337/)).toBeTruthy();
    expect(
      within(screen.getByTestId('report-transit-timeline')).getByText('Jupiter enters Cancer'),
    ).toBeTruthy();
    // All seven domain blocks.
    expect(screen.getByTestId('report-domain-career')).toBeTruthy();
    expect(screen.getByTestId('report-domain-family')).toBeTruthy();
  });

  it('cites the dasha-year convention when the engine declares one', () => {
    const chart = storedChart();
    const withConvention: StoredChart = {
      ...chart,
      sidereal_chart: {
        ...CHART,
        dashas: { ...CHART.dashas, convention: 'gregorian_365_2425' },
      },
    } as StoredChart;
    useChartLibraryStore.setState({ charts: { 'chart-1': withConvention }, hydrated: true });
    useInterpretationStore.getState().setInterpretation('chart-1', FULL_INTERPRETATION, '2026-06-05T00:00:00Z');
    renderReport('astrologer');

    const convention = screen.getByTestId('report-dasha-convention');
    expect(convention.textContent).toContain('Gregorian year (365.2425 days)');
  });

  it('shows a generic near-cusp note on the cover for a boundary lagna', () => {
    const chart = storedChart();
    const nearCusp: StoredChart = {
      ...chart,
      sidereal_chart: {
        ...CHART,
        lagna: { ...CHART.lagna, sign: 'Aquarius', longitude: 328.84, sign_degrees: 28.84 },
      },
    } as StoredChart;
    useChartLibraryStore.setState({ charts: { 'chart-1': nearCusp }, hydrated: true });
    useInterpretationStore.getState().setInterpretation('chart-1', FULL_INTERPRETATION, '2026-06-05T00:00:00Z');
    renderReport('you');

    const note = screen.getByTestId('report-cusp-note');
    // Letterpress-strength honesty: the measured distance, the ALTERNATIVE
    // rising sign named, the house-dependency stated, rectification recommended.
    expect(note.textContent).toContain('Pisces');
    expect(note.textContent).toContain('1.2');
    expect(note.textContent).toMatch(/would make the rising sign Pisces/);
    expect(note.textContent).toMatch(/every house placement in this report/i);
    expect(note.textContent).toMatch(/refining the birth time/i);
  });

  it('prints NO cusp note when the lagna sits comfortably mid-sign', () => {
    const chart = storedChart();
    const midSign: StoredChart = {
      ...chart,
      sidereal_chart: {
        ...CHART,
        lagna: { ...CHART.lagna, sign: 'Aquarius', longitude: 315.0, sign_degrees: 15.0 },
      },
    } as StoredChart;
    useChartLibraryStore.setState({ charts: { 'chart-1': midSign }, hydrated: true });
    useInterpretationStore.getState().setInterpretation('chart-1', FULL_INTERPRETATION, '2026-06-05T00:00:00Z');
    renderReport('you');

    expect(screen.queryByTestId('report-cusp-note')).toBeNull();
  });

  it('renders the cusp caveat as a PROMINENT, titled callout that leads with the ascendant value', () => {
    const chart = storedChart();
    const nearCusp: StoredChart = {
      ...chart,
      sidereal_chart: {
        ...CHART,
        lagna: { ...CHART.lagna, sign: 'Aquarius', longitude: 328.84, sign_degrees: 28.84 },
      },
    } as StoredChart;
    useChartLibraryStore.setState({ charts: { 'chart-1': nearCusp }, hydrated: true });
    useInterpretationStore.getState().setInterpretation('chart-1', FULL_INTERPRETATION, '2026-06-05T00:00:00Z');
    renderReport('you');

    const callout = screen.getByTestId('report-cusp-note');
    // Promoted from the old muted inline footnote → a bordered, titled callout.
    expect(callout.className).toContain('cusp-callout');
    expect(screen.getByTestId('report-cusp-callout-title')).toBeTruthy();
    // Leads with the ascendant value itself, beside the warning.
    expect(callout.textContent).toContain('Aquarius');
    // Still engine-grounded honesty: the alternative sign + rectification advice.
    expect(callout.textContent).toContain('Pisces');
    expect(callout.textContent).toMatch(/refining the birth time/i);
  });
});

describe('ReportView cover — birth-time honesty', () => {
  beforeEach(() => {
    useChartLibraryStore.setState({ charts: {}, hydrated: true });
    useInterpretationStore.setState({ byChart: {} });
    usePredictiveStore.getState().reset();
  });

  it('badges the birth time "As recorded" with no rectified detail when none is in effect', () => {
    seed();
    renderReport('you');

    const badge = screen.getByTestId('report-time-badge');
    expect(badge.getAttribute('data-variant')).toBe('recorded');
    expect(badge.textContent).toMatch(/as recorded/i);
    // No entered→rectified line when the recorded time was used verbatim.
    expect(screen.queryByTestId('report-time-rectified-detail')).toBeNull();
  });

  it('shows BOTH the entered and rectified times + a "+N min" badge when rectified', () => {
    const chart = storedChart();
    // Entered 11:45 → chart computed for the effective 12:00 local (+15 min).
    const rectified: StoredChart = {
      ...chart,
      birth_data: { ...chart.birth_data, birth_time_original: '11:45' },
    } as StoredChart;
    useChartLibraryStore.setState({ charts: { 'chart-1': rectified }, hydrated: true });
    useInterpretationStore.getState().setInterpretation('chart-1', FULL_INTERPRETATION, '2026-06-05T00:00:00Z');
    renderReport('you');

    const badge = screen.getByTestId('report-time-badge');
    expect(badge.getAttribute('data-variant')).toBe('rectified');
    expect(badge.textContent).toMatch(/\+\s?15\s?min/);

    // Honest: BOTH wall clocks appear — the entered time AND the rectified one used.
    const detail = screen.getByTestId('report-time-rectified-detail');
    expect(detail.textContent).toContain('11:45');
    expect(detail.textContent).toContain('12:00');
  });
});
