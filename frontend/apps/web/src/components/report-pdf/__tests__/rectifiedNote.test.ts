/**
 * buildReportPdfData — the cover's rectification note.
 *
 * When the chart was computed from a *rectified* birth time, the builder derives
 * the entered → rectified delta via the pure `rectificationDelta` helper and, ONLY
 * when one is in effect, binds the localized `report:cover.rectified_note` template
 * (supplied by the React layer as `formatRectifiedNote`). When no rectification is
 * in effect — or no formatter is supplied — `rectifiedNote` is omitted. i18n stays
 * in React; the builder stays pure.
 *
 * All data is SYNTHETIC (a "Reference Native", Bengaluru) — never real birth data.
 */

import { describe, it, expect } from 'vitest';
import type { SiderealChart } from '@almamesh/browser/types';
import type { ProcessedBirthData } from '@almamesh/shared-types';
import { buildReportPdfData, type BuildReportPdfDataInput } from '../buildReportPdfData';
import type { ReportPdfLabels } from '../types';
import type { RectificationDelta } from '../../../lib/rectification';

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

const LOCATION = {
  city: 'Bengaluru',
  state: 'Karnataka',
  country: 'India',
  latitude: 12.9716,
  longitude: 77.5946,
  timezone: 'Asia/Kolkata',
};

/** Birth WITH a rectification in effect: entered 12:00, effective (local) 12:20. */
const RECTIFIED_BIRTH: ProcessedBirthData = {
  birth_datetime_utc: '1990-01-15T06:50:00Z',
  birth_datetime_local: '1990-01-15T12:20:00',
  birth_location_details: LOCATION,
  birth_time_original: '12:00',
} as ProcessedBirthData;

/** Birth with NO rectification (entered time equals the effective clock). */
const PLAIN_BIRTH: ProcessedBirthData = {
  birth_datetime_utc: '1990-01-15T06:30:00Z',
  birth_datetime_local: '1990-01-15T12:00:00',
  birth_location_details: LOCATION,
} as ProcessedBirthData;

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
  chartsEyebrow: 'Section III',
  chartsTitle: 'Kundli',
  chartsIntro: 'intro',
  dashaEyebrow: 'Section IV',
  dashaTitle: 'Dasha',
  dashaIntro: 'intro',
  dashaCurrentLabel: 'Current',
  dashaSequenceLabel: 'Sequence',
  dashaAntarLabel: 'Antar',
  yogasEyebrow: 'Section V',
  yogasTitle: 'Yogas',
  yogasIntro: 'intro',
  narrativeEyebrow: 'Section VI',
  narrativeTitle: 'Interpretation',
  narrativeIntro: 'intro',
};

/** A deterministic stand-in for the React layer's localized template. */
function formatRectifiedNote(delta: RectificationDelta): string {
  const sign = delta.deltaMinutes > 0 ? '+' : '−';
  return `Rectified: entered ${delta.enteredLabel} → ${delta.rectifiedLabel} (${sign}${Math.abs(delta.deltaMinutes)} min)`;
}

function baseInput(birth: ProcessedBirthData): Omit<BuildReportPdfDataInput, 'interpretation'> {
  return {
    personName: 'Reference Native',
    audienceLabel: 'For You',
    subtitle: 'subtitle',
    kicker: 'kicker',
    birth,
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

describe('buildReportPdfData cover rectifiedNote', () => {
  it('builds the rectified note when a rectification is in effect', () => {
    const data = buildReportPdfData({
      ...baseInput(RECTIFIED_BIRTH),
      interpretation: undefined,
      formatRectifiedNote,
    });
    expect(data.rectifiedNote).toBeDefined();
    // The forward (+20 min) adjustment from 12:00 → 12:20, formatted by the
    // injected template; the builder derived the delta via rectificationDelta.
    expect(data.rectifiedNote).toContain('+20 min');
  });

  it('omits the note when no rectification is in effect', () => {
    const data = buildReportPdfData({
      ...baseInput(PLAIN_BIRTH),
      interpretation: undefined,
      formatRectifiedNote,
    });
    expect(data.rectifiedNote).toBeUndefined();
  });

  it('omits the note when no formatter is supplied (even with a rectified birth)', () => {
    const data = buildReportPdfData({
      ...baseInput(RECTIFIED_BIRTH),
      interpretation: undefined,
    });
    expect(data.rectifiedNote).toBeUndefined();
  });
});
