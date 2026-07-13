import type {
  DashaPeriod,
  MahaDashaPeriod,
  PlanetPosition,
  SiderealChart,
  YogaData,
} from '@almamesh/browser/types';
import type {
  DivisionalChartId,
  ProcessedBirthData,
  RectificationRecord,
  VargaChartFullData,
  VargaCtxFull,
  VedicInterpretation,
} from '@almamesh/shared-types';
import { createInstance } from 'i18next';
import enPredictive from '../../../locales/en/predictive.json';
import enRectify from '../../../locales/en/rectify.json';
import enReport from '../../../locales/en/report.json';
import {
  DOMAINS_CTX,
  STRENGTH_CTX,
  TRANSIT_CTX,
  VARGA_CTX_FULL,
} from '../../../test/predictiveFixtures';
import { buildRectificationPdf } from '../buildRectificationPdf';
import { buildReportPdfData } from '../buildReportPdfData';
import type { ReportPdfData, ReportPdfLabels } from '../types';

const testI18n = createInstance();
void testI18n.init({
  resources: {
    en: { predictive: enPredictive, rectify: enRectify, report: enReport },
  },
  lng: 'en',
  fallbackLng: 'en',
  ns: ['report', 'predictive', 'rectify'],
  defaultNS: 'report',
  returnNull: false,
  interpolation: { escapeValue: false },
});

export const ALL_VARGA_IDS = [
  'D1',
  'D2',
  'D3',
  'D4',
  'D7',
  'D9',
  'D10',
  'D12',
  'D16',
  'D20',
  'D24',
  'D27',
  'D30',
  'D40',
  'D45',
  'D60',
] as const satisfies readonly DivisionalChartId[];

export const FINAL_PRATYANTAR_SENTINELS = ['Venus', 'May 1989'] as const;
export const FINAL_MAHA_SENTINELS = ['Ketu', 'May 2108'] as const;
export const FINAL_PLANET_SENTINEL = 'Ketu';
export const FINAL_YOGA_SENTINEL = 'Dhana Yoga Final Sentinel';

export const LEGACY_LIFE_EVENT_BLOB =
  '## Life events used for rectification\n- 1978 - moved to Belo Horizonte\n- 1991 - moved to the USA\n- 1995 - completed higher studies, followed by several other dated events that belong in their own rows rather than being repeated as this full narrative.';

const PRATYANTAR_SEQUENCE = [
  { lord: 'sun', start_date: '1988-05-01', end_date: '1988-06-01', duration_years: 0.08 },
  { lord: 'moon', start_date: '1988-06-01', end_date: '1988-07-15', duration_years: 0.12 },
  { lord: 'mars', start_date: '1988-07-15', end_date: '1988-08-15', duration_years: 0.08 },
  { lord: 'rahu', start_date: '1988-08-15', end_date: '1988-10-01', duration_years: 0.13 },
  { lord: 'jupiter', start_date: '1988-10-01', end_date: '1989-01-01', duration_years: 0.25 },
  { lord: 'saturn', start_date: '1989-01-01', end_date: '1989-02-15', duration_years: 0.12 },
  { lord: 'mercury', start_date: '1989-02-15', end_date: '1989-03-15', duration_years: 0.08 },
  { lord: 'ketu', start_date: '1989-03-15', end_date: '1989-04-01', duration_years: 0.05 },
  { lord: 'venus', start_date: '1989-04-01', end_date: '1989-05-01', duration_years: 0.08 },
] as const;

const PERIOD_LORDS = [
  'sun',
  'moon',
  'mars',
  'rahu',
  'jupiter',
  'saturn',
  'mercury',
  'ketu',
  'venus',
] as const;

function monthIndex(date: string): number {
  const [year = '0', month = '1'] = date.split('-');
  return Number(year) * 12 + Number(month) - 1;
}

function monthDate(index: number): string {
  const year = Math.floor(index / 12);
  const month = String((index % 12) + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function splitPeriods(
  lords: readonly string[],
  startDate: string,
  endDate: string,
): readonly DashaPeriod[] {
  const start = monthIndex(startDate);
  const span = monthIndex(endDate) - start;
  return lords.map((lord, index) => {
    const periodStart = start + Math.floor((span * index) / lords.length);
    const periodEnd = start + Math.floor((span * (index + 1)) / lords.length);
    return {
      lord,
      start_date: monthDate(periodStart),
      end_date: monthDate(periodEnd),
      duration_years: (periodEnd - periodStart) / 12,
    };
  });
}

const MAHA_PERIODS = [
  ['venus', '1988-05-01', '2008-05-01', 20],
  ['sun', '2008-05-01', '2014-05-01', 6],
  ['moon', '2014-05-01', '2024-05-01', 10],
  ['mars', '2024-05-01', '2031-05-01', 7],
  ['rahu', '2031-05-01', '2049-05-01', 18],
  ['jupiter', '2049-05-01', '2065-05-01', 16],
  ['saturn', '2065-05-01', '2084-05-01', 19],
  ['mercury', '2084-05-01', '2101-05-01', 17],
  ['ketu', '2101-05-01', '2108-05-01', 7],
] as const;

const FIRST_ANTARS: readonly DashaPeriod[] = [
  { lord: 'sun', start_date: '1988-05-01', end_date: '1989-05-01', duration_years: 1 },
  ...splitPeriods(PERIOD_LORDS.slice(1), '1989-05-01', '2008-05-01'),
];

const MAHA_SEQUENCE: readonly MahaDashaPeriod[] = MAHA_PERIODS.map(
  ([lord, start_date, end_date, duration_years], index) => ({
    lord,
    start_date,
    end_date,
    duration_years,
    antar_sequence:
      index === 0 ? FIRST_ANTARS : splitPeriods(PERIOD_LORDS, start_date, end_date),
  }),
);

const PLANET_SPECS = [
  ['sun', 'Aries', 'mars', 'Ashwini', 'ketu', 1, 'exalted'],
  ['moon', 'Taurus', 'venus', 'Rohini', 'moon', 2, 'exalted'],
  ['mars', 'Gemini', 'mercury', 'Mrigashira', 'mars', 3, 'neutral'],
  ['mercury', 'Cancer', 'moon', 'Pushya', 'saturn', 4, 'neutral'],
  ['jupiter', 'Leo', 'sun', 'Magha', 'ketu', 5, 'neutral'],
  ['venus', 'Virgo', 'mercury', 'Hasta', 'moon', 6, 'debilitated'],
  ['saturn', 'Libra', 'venus', 'Swati', 'rahu', 7, 'exalted'],
  ['rahu', 'Scorpio', 'mars', 'Anuradha', 'saturn', 8, 'neutral'],
  ['ketu', 'Sagittarius', 'jupiter', 'Mula', 'ketu', 9, 'neutral'],
] as const;

function maximalPlanets(): SiderealChart['planets'] {
  return Object.fromEntries(
    PLANET_SPECS.map(([name, sign, signLord, nakshatra, nakshatraLord, house, dignity], index) => {
      const planet: PlanetPosition = {
        name,
        longitude: index * 30 + 10.5,
        latitude: 0,
        distance: 1,
        speed: index >= 6 ? -0.1 : 1,
        is_retrograde: index >= 6,
        sign,
        sign_degrees: 10.5,
        sign_lord: signLord,
        nakshatra,
        nakshatra_pada: (index % 4) + 1,
        nakshatra_lord: nakshatraLord,
        house,
        dignity,
        is_combust: name === 'mercury',
        combustion_separation_deg: name === 'sun' || name === 'rahu' || name === 'ketu' ? null : 12,
        houses_ruled: name === 'rahu' || name === 'ketu' ? [] : [house],
        is_yogakaraka: name === 'saturn',
      };
      return [name, planet];
    }),
  );
}

function maximalYogas(): readonly YogaData[] {
  return [
    {
      name: 'Gaja Kesari Yoga Primary Sentinel',
      display_name: 'Gaja Kesari Yoga Primary Sentinel',
      category: 'auspicious',
      description: 'Jupiter forms an angular relationship with the Moon.',
      effects: 'Learning and counsel.',
      grade: 'strong',
      strength_factors: [
        { factor_type: 'dignity', planet: 'jupiter', value: 'exalted', basis: 'Fixture', mark: 1 },
      ],
      net_marks: 1,
      max_favorable: 1,
      max_unfavorable: 0,
      strength_pct: 100,
      strength_tier: 'structural',
      planets_involved: ['jupiter', 'moon'],
      houses_involved: [2, 5],
      planetary_signature: 'jupiter_moon',
      formation_rules: [
        { rule: 'fixture.gaja', description: 'Angular relation', source: 'Fixture', planets: ['jupiter', 'moon'], houses: [2, 5] },
      ],
    },
    {
      name: 'Raja Yoga Middle Sentinel',
      display_name: 'Raja Yoga Middle Sentinel',
      category: 'raja',
      description: 'Two house lords form a documented relationship.',
      effects: 'Responsibility and leadership.',
      grade: 'moderate',
      strength_factors: [
        { factor_type: 'house_class', planet: 'saturn', value: 'angular', basis: 'Fixture', mark: 0 },
      ],
      net_marks: 0,
      max_favorable: 1,
      max_unfavorable: 1,
      strength_pct: 50,
      strength_tier: 'structural',
      planets_involved: ['saturn', 'venus'],
      houses_involved: [7],
      planetary_signature: 'saturn_venus',
      formation_rules: [
        { rule: 'fixture.raja', description: 'Lord relationship', source: 'Fixture', planets: ['saturn', 'venus'], houses: [7] },
      ],
    },
    {
      name: FINAL_YOGA_SENTINEL,
      display_name: FINAL_YOGA_SENTINEL,
      category: 'dhana',
      description: 'A final formation proves yoga-card pagination completeness.',
      effects: 'Resource stewardship.',
      grade: 'weak',
      strength_factors: [
        { factor_type: 'combustion', planet: 'mercury', value: 'combust', basis: 'Fixture', mark: -1 },
      ],
      net_marks: -1,
      max_favorable: 1,
      max_unfavorable: 1,
      strength_pct: 0,
      strength_tier: 'structural',
      planets_involved: ['mercury', 'sun'],
      houses_involved: [4],
      planetary_signature: 'mercury_sun',
      formation_rules: [
        { rule: 'fixture.dhana', description: 'Final formation', source: 'Fixture', planets: ['mercury', 'sun'], houses: [4] },
      ],
    },
  ];
}

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
  planets: maximalPlanets(),
  houses: Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [
      String(index + 1),
      {
        house: index + 1,
        longitude: index * 30,
        sign: ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'][index] ?? 'Aries',
        sign_lord: ['mars', 'venus', 'mercury', 'moon', 'sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'saturn', 'jupiter'][index] ?? 'mars',
      },
    ]),
  ) as SiderealChart['houses'],
  dashas: {
    maha_dasha_sequence: MAHA_SEQUENCE,
    current_maha: {
      lord: 'venus',
      start_date: '1988-05-01',
      end_date: '2008-05-01',
      duration_years: 20,
    },
    current_antar: {
      lord: 'sun',
      start_date: '1988-05-01',
      end_date: '1989-05-01',
      duration_years: 1,
    },
    current_pratyantar: {
      lord: 'jupiter',
      start_date: '1988-10-01',
      end_date: '1989-01-01',
      duration_years: 0.25,
    },
    pratyantar_sequence: PRATYANTAR_SEQUENCE,
  },
  yogas: maximalYogas(),
  navamsa: {
    name: 'D9',
    lagna_sign: 'Leo',
    lagna_sign_lord: 'sun',
    planets: Object.fromEntries(
      PLANET_SPECS.map(([name, sign, signLord]) => [name, { name, sign, sign_lord: signLord }]),
    ),
  },
};

const BIRTH = {
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
  summary: { layman: 'A balanced chart.', technical: 'A balanced chart.' },
  strengths: [{ title: 'Determination', layman: 'You push through.' }],
  challenges: [],
  life_themes: [],
};

const CHROME_LABELS = {
  preparedFor: 'Prepared for',
  birthDetailsTitle: 'Birth Details',
  birthDetailsEyebrow: 'Section I',
  birthDetailsIntro: 'Birth detail sentinel',
  technicalNote: 'Technical note sentinel',
  footerNote: 'AlmaMesh Footer Sentinel',
  planetsEyebrow: 'Section II',
  planetsTitle: 'Planets',
  planetsIntro: 'Planet table sentinel',
  colPlanet: 'Graha',
  colSign: 'Sign',
  colDegree: 'Degree',
  colNakshatra: 'Nakshatra',
  colHouse: 'Hse',
  colDignity: 'Dignity',
  lagnaRowName: 'Ascendant',
  housesEyebrow: 'Section III',
  housesTitle: 'Houses',
  housesIntro: 'House table sentinel',
  colHouseNumber: 'House',
  colHouseSign: 'Sign',
  colHouseLord: 'Sign Lord',
  colOccupants: 'Occupants',
  housesNote: 'Whole-sign houses.',
  chartsEyebrow: 'Section IV',
  chartsTitle: 'Kundli',
  chartsIntro: 'Chart sentinel',
  dashaEyebrow: 'Section V',
  dashaTitle: 'Dasha',
  dashaIntro:
    'The 120-year planetary period system keyed to the Moon\'s nakshatra at birth. Each maha-dasa colours a long chapter of life; the current period is marked in brass.',
  dashaCurrentLabel: 'Current',
  dashaSequenceLabel: 'Sequence',
  yogasEyebrow: 'Section VI',
  yogasTitle: 'Yogas',
  yogasIntro: 'Yoga sentinel',
  narrativeEyebrow: 'Section VII',
  narrativeTitle: 'Interpretation',
  narrativeIntro: 'Narrative sentinel',
} as ReportPdfLabels;

const V2_RECORD: RectificationRecord = {
  profileId: 'maximal-profile',
  confirmedAt: '2026-05-01T12:00:00.000Z',
  mode: 'cusp',
  band: 'leans',
  margin: 0.73,
  originalTime: '07:30',
  originalSign: 'aquarius',
  rectifiedTime: '07:45',
  rectifiedSign: 'pisces',
  supportingEventIds: Array.from({ length: 11 }, (_, index) => `event-${index + 1}`),
  resultSnapshot: {
    mode: 'cusp',
    band: 'near_tie',
    margin: 0.12,
    discriminatingEventCount: 1,
    recordedTimeSign: 'aquarius',
    honestyNoteKey: 'rectify.honesty.near_tie',
    candidates: [
      {
        ascendantSign: 'pisces',
        representativeTimeLocal: '07:45',
        lagnaLongitudeDeg: 333.8,
        lagnaCuspDistanceDeg: 3.8,
        isNearCusp: false,
        fitScore: 3.4,
        navamsaLagnaSign: 'leo',
        positiveTotal: 3.55,
        penaltyTotal: 0.15,
        priorBonus: 0.35,
        misses: ['miss_silent_career_change_h10'],
        supportingEvents: [
          {
            eventIndex: 0,
            category: 'marriage',
            date: '2015-06-20',
            signals: ['pd_lord_rules_h7#dignified_fit'],
            contribution: 1.85,
          },
        ],
      },
      {
        ascendantSign: 'aquarius',
        representativeTimeLocal: '07:30',
        lagnaLongitudeDeg: 328.8,
        lagnaCuspDistanceDeg: 1.2,
        isNearCusp: true,
        fitScore: 3.28,
        navamsaLagnaSign: null,
        positiveTotal: 3.28,
        penaltyTotal: 0,
        priorBonus: 0,
        misses: [],
        supportingEvents: [],
      },
    ],
  },
};

const EVENT_CATEGORIES = [
  'relocation',
  'relocation',
  'higher_studies',
  'litigation',
  'career_change',
  'relocation',
  'career_change',
  'business_start',
  'litigation',
  'marriage',
  'breakup',
] as const;

const LEGACY_EVENTS = EVENT_CATEGORIES.map((category, index) => ({
  date: `${1978 + index * 4}-01-01`,
  category,
  summary: LEGACY_LIFE_EVENT_BLOB,
}));

function maximalVargaContext(): VargaCtxFull {
  const template = VARGA_CTX_FULL.charts.D1;
  if (!template) {
    throw new Error('The predictive fixture must include D1');
  }
  const charts = Object.fromEntries(
    ALL_VARGA_IDS.map((id) => [
      id,
      { ...template, chart: id } satisfies VargaChartFullData,
    ]),
  ) as VargaCtxFull['charts'];
  return { ...VARGA_CTX_FULL, charts };
}

export function buildMaximalReportPdfData(): ReportPdfData {
  const tr = testI18n.getFixedT(null, 'report');
  const rectification = buildRectificationPdf({
    record: V2_RECORD,
    events: LEGACY_EVENTS,
    t: tr,
  });

  return buildReportPdfData({
    personName: 'Maximal Reference Native',
    audienceLabel: 'For You',
    subtitle: 'Maximal report acceptance fixture',
    kicker: 'AlmaMesh maximal artifact',
    birth: BIRTH,
    lagna: CHART.lagna,
    chart: { ayanamsa_value: CHART.ayanamsa_value },
    sidereal: CHART,
    interpretation: INTERPRETATION,
    audience: 'you',
    chartCaptions: {
      rasi: 'Rasi D1 Main Sentinel',
      navamsa: 'Navamsa D9 Main Sentinel',
    },
    formatAntarHeading: (lord) => `Antar-dasas of the ${lord} Maha-dasa`,
    formatPratyantarHeading: (lord) => `Pratyantar-dasas of the ${lord} Antar-dasa`,
    detailLabels: {
      dateOfBirth: 'Date of Birth',
      timeOfBirth: 'Time of Birth',
      placeOfBirth: 'Place of Birth',
      ascendant: 'Ascendant',
    },
    chromeLabels: CHROME_LABELS,
    rectification,
    comprehensive: {
      translators: { tr, tp: testI18n.getFixedT(null, 'predictive') },
      transitCtx: TRANSIT_CTX,
      vargaCtxFull: maximalVargaContext(),
      strengthCtx: STRENGTH_CTX,
      domainsCtx: DOMAINS_CTX,
    },
  });
}
