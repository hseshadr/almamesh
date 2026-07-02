import { describe, it, expect } from 'vitest';
import type { SiderealChart } from '@almamesh/browser/types';
import type { ProcessedBirthData, VedicInterpretation } from '@almamesh/shared-types';
import { buildReportPdfData, type BuildReportPdfDataInput } from '../buildReportPdfData';
import { ReportDocument } from '../ReportDocument';
import type { ReportPdfLabels } from '../types';

// A small-but-complete engine chart fixture (Title-Case signs, as emitted).
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
  },
  houses: Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [
      String(i + 1),
      { house: i + 1, longitude: i * 30, sign: 'Aries', sign_lord: 'mars' },
    ]),
  ) as SiderealChart['houses'],
  dashas: {
    maha_dasha_sequence: [
      { lord: 'venus', start_date: '1985-01-01', end_date: '2005-01-01', duration_years: 20 },
    ],
    current_maha: {
      lord: 'venus',
      start_date: '1985-01-01',
      end_date: '2005-01-01',
      duration_years: 20,
    },
    current_antar: null,
    current_pratyantar: null,
  },
  yogas: [],
  navamsa: {
    name: 'D9',
    lagna_sign: 'Leo',
    lagna_sign_lord: 'sun',
    planets: { sun: { name: 'sun', sign: 'Aries', sign_lord: 'mars' } },
  },
};

const BIRTH: ProcessedBirthData = {
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
} as ProcessedBirthData;

const INTERPRETATION: VedicInterpretation = {
  summary: { layman: 'A balanced chart with strong drive.', technical: 'A balanced chart with strong drive.' },
  strengths: [{ title: 'Determination', layman: 'You push through hard things.' }],
  challenges: [],
  life_themes: [],
};

const CHROME_LABELS: ReportPdfLabels = {
  preparedFor: 'Prepared for',
  birthDetailsTitle: 'Birth Details',
  birthDetailsEyebrow: 'Section I',
  birthDetailsIntro: 'intro',
  technicalNote: 'note',
  footerNote: 'AlmaMesh',
  planetsEyebrow: 'Section II',
  planetsTitle: 'Planets',
  planetsIntro: 'intro',
  colPlanet: 'Graha',
  colSign: 'Sign',
  colDegree: 'Degree',
  colNakshatra: 'Nakshatra',
  colHouse: 'Hse',
  colDignity: 'Dignity',
  lagnaRowName: 'Ascendant',
  housesEyebrow: 'Section III',
  housesTitle: 'Houses',
  housesIntro: 'intro',
  colHouseNumber: 'House',
  colHouseSign: 'Sign',
  colHouseLord: 'Sign Lord',
  colOccupants: 'Occupants',
  housesNote: 'Whole-sign houses.',
  chartsEyebrow: 'Section IV',
  chartsTitle: 'Kundli',
  chartsIntro: 'intro',
  dashaEyebrow: 'Section V',
  dashaTitle: 'Dasha',
  dashaIntro: 'intro',
  dashaCurrentLabel: 'Current',
  dashaSequenceLabel: 'Sequence',
  yogasEyebrow: 'Section VI',
  yogasTitle: 'Yogas',
  yogasIntro: 'intro',
  narrativeEyebrow: 'Section VI',
  narrativeTitle: 'Interpretation',
  narrativeIntro: 'intro',
};

function baseInput(): Omit<BuildReportPdfDataInput, 'interpretation'> {
  return {
    personName: 'Asha Rao',
    audienceLabel: 'For You',
    subtitle: 'subtitle',
    kicker: 'kicker',
    birth: BIRTH,
    lagna: CHART.lagna,
    chart: { ayanamsa_value: CHART.ayanamsa_value },
    sidereal: CHART,
    audience: 'you',
    chartCaptions: { rasi: 'Rasi', navamsa: 'Navamsa' },
    detailLabels: {
      dateOfBirth: 'Date of Birth',
      timeOfBirth: 'Time of Birth',
      placeOfBirth: 'Place of Birth',
      ascendant: 'Ascendant',
    },
    chromeLabels: CHROME_LABELS,
  };
}

describe('buildReportPdfData natal-only degradation', () => {
  it('omits the narrative section entirely when no interpretation is supplied', () => {
    const data = buildReportPdfData({ ...baseInput(), interpretation: undefined });
    expect(data.narrative).toBeUndefined();
    // The deterministic natal halves are still present.
    expect(data.planets.length).toBeGreaterThan(0);
    expect(data.charts.rasi).toBeTruthy();
    expect(data.dasha.mahaSequence.length).toBeGreaterThan(0);
    expect(data.birthDetails.length).toBeGreaterThan(0);
  });

  it('includes the narrative section when an interpretation is supplied', () => {
    const data = buildReportPdfData({ ...baseInput(), interpretation: INTERPRETATION });
    expect(data.narrative).toBeDefined();
    expect((data.narrative ?? []).length).toBeGreaterThan(0);
  });

  it('renders the document without throwing for a natal-only (no narrative) data set', () => {
    const data = buildReportPdfData({ ...baseInput(), interpretation: undefined });
    expect(() => ReportDocument({ data })).not.toThrow();
  });

  it('renders the document without throwing when a narrative is present', () => {
    const data = buildReportPdfData({ ...baseInput(), interpretation: INTERPRETATION });
    expect(() => ReportDocument({ data })).not.toThrow();
  });
});
