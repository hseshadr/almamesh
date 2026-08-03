/**
 * The report PDF must ACTUALLY render to bytes — not merely build a valid
 * element tree. The other report-pdf tests assert `ReportDocument({ data })`
 * (React element construction) and `buildReportPdfData` shape; NONE of them ran
 * @react-pdf's layout + serialization, so a font/layout regression that only
 * surfaces at `pdf().toBlob()` time (the exact path the Download button takes)
 * would ship green. This suite closes that gap: it drives `renderToBuffer` over
 * the full matrix — natal, +interpretation, +comprehensive, +rectification, and
 * pathological supporting-event text — and asserts real PDF bytes come out.
 *
 * Fonts: the browser fetches the report faces over HTTP; the Node harness points
 * `registerReportFonts` at the same files on disk (its `fontBase` hook exists for
 * exactly this) so layout resolves every registered weight/style locally.
 *
 * All data is SYNTHETIC (a Bengaluru "Reference Native") — never real birth data.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { renderToBuffer } from '@react-pdf/renderer';
import { registerReportFonts } from '../theme';
import type { SiderealChart } from '@almamesh/browser/types';
import type { ProcessedBirthData, VedicInterpretation, RectificationRecord } from '@almamesh/shared-types';
import '../../../i18n/config';
import i18next from 'i18next';
import { buildReportPdfData } from '../buildReportPdfData';
import { buildRectificationPdf } from '../buildRectificationPdf';
import { ReportDocument } from '../ReportDocument';
import type { ReportPdfLabels } from '../types';
import { DOMAINS_CTX, STRENGTH_CTX, TRANSIT_CTX, VARGA_CTX_FULL } from '../../../test/predictiveFixtures';

const t = i18next.getFixedT(null, 'report');
const COMPREHENSIVE = {
  translators: { tr: i18next.getFixedT(null, 'report'), tp: i18next.getFixedT(null, 'predictive') },
  transitCtx: TRANSIT_CTX,
  vargaCtxFull: VARGA_CTX_FULL,
  strengthCtx: STRENGTH_CTX,
  domainsCtx: DOMAINS_CTX,
};

const CHART: SiderealChart = {
  ayanamsa_value: 23.86,
  lagna: { longitude: 5.4, sign: 'Aries', sign_degrees: 5.4, sign_lord: 'mars', nakshatra: 'Ashwini', nakshatra_pada: 2, nakshatra_lord: 'ketu' },
  planets: { sun: { name: 'sun', longitude: 100.5, latitude: 0, distance: 1, speed: 1, is_retrograde: false, sign: 'Cancer', sign_degrees: 10.5, sign_lord: 'moon', nakshatra: 'Pushya', nakshatra_pada: 1, nakshatra_lord: 'saturn', house: 4, dignity: 'neutral', is_combust: false, combustion_separation_deg: null, houses_ruled: [2], is_yogakaraka: false } },
  houses: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), { house: i + 1, longitude: i * 30, sign: 'Aries', sign_lord: 'mars' }])) as SiderealChart['houses'],
  dashas: { maha_dasha_sequence: [{ lord: 'venus', start_date: '1985-01-01', end_date: '2005-01-01', duration_years: 20 }], current_maha: { lord: 'venus', start_date: '1985-01-01', end_date: '2005-01-01', duration_years: 20 }, current_antar: null, current_pratyantar: null },
  yogas: [],
  navamsa: { name: 'D9', lagna_sign: 'Leo', lagna_sign_lord: 'sun', planets: { sun: { name: 'sun', sign: 'Aries', sign_lord: 'mars' } } },
};
const BIRTH = { birth_datetime_utc: '1990-03-30T06:30:00Z', birth_datetime_local: '1990-03-30T12:00:00', birth_location_details: { city: 'Bengaluru', state: 'Karnataka', country: 'India', latitude: 12.97, longitude: 77.59, timezone: 'Asia/Kolkata' } } as ProcessedBirthData;
const INTERPRETATION: VedicInterpretation = { summary: { layman: 'A balanced chart.', technical: 'A balanced chart.' }, strengths: [{ title: 'Determination', layman: 'You push through.' }], challenges: [], life_themes: [] };
const CHROME_LABELS = { preparedFor: 'Prepared for', birthDetailsTitle: 'Birth Details', birthDetailsEyebrow: 'Section I', birthDetailsIntro: 'intro', technicalNote: 'note', footerNote: 'AlmaMesh', planetsEyebrow: 'Section II', planetsTitle: 'Planets', planetsIntro: 'intro', colPlanet: 'Graha', colSign: 'Sign', colDegree: 'Degree', colNakshatra: 'Nakshatra', colHouse: 'Hse', colDignity: 'Dignity', lagnaRowName: 'Ascendant', housesEyebrow: 'Section III', housesTitle: 'Houses', housesIntro: 'intro', colHouseNumber: 'House', colHouseSign: 'Sign', colHouseLord: 'Sign Lord', colOccupants: 'Occupants', housesNote: 'Whole-sign houses.', chartsEyebrow: 'Section IV', chartsTitle: 'Kundli', chartsIntro: 'intro', dashaEyebrow: 'Section V', dashaTitle: 'Dasha', dashaIntro: 'intro', dashaCurrentLabel: 'Current', dashaSequenceLabel: 'Sequence', yogasEyebrow: 'Section VI', yogasTitle: 'Yogas', yogasIntro: 'intro', narrativeEyebrow: 'Section VII', narrativeTitle: 'Interpretation', narrativeIntro: 'intro' } as ReportPdfLabels;

const V2_RECORD: RectificationRecord = {
  profileId: 'p1', confirmedAt: '2026-05-01T12:00:00.000Z', mode: 'cusp', band: 'leans', margin: 0.73,
  originalTime: '07:30', originalSign: 'aquarius', rectifiedTime: '07:45', rectifiedSign: 'pisces',
  supportingEventIds: ['evt-1'],
  resultSnapshot: { mode: 'cusp', band: 'near_tie', margin: 0.12, discriminatingEventCount: 1, recordedTimeSign: 'aquarius', honestyNoteKey: 'rectify.honesty.near_tie', candidates: [{ ascendantSign: 'pisces', representativeTimeLocal: '07:45', lagnaLongitudeDeg: 333.8, lagnaCuspDistanceDeg: 3.8, isNearCusp: false, fitScore: 3.4, navamsaLagnaSign: 'leo', positiveTotal: 3.55, penaltyTotal: 0.15, priorBonus: 0.35, misses: ['miss_silent_career_change_h10'], supportingEvents: [{ eventIndex: 0, category: 'marriage', date: '2015-06-20', signals: ['pd_lord_rules_h7#dignified_fit'], contribution: 1.85 }] }, { ascendantSign: 'aquarius', representativeTimeLocal: '07:30', lagnaLongitudeDeg: 328.8, lagnaCuspDistanceDeg: 1.2, isNearCusp: true, fitScore: 3.28, navamsaLagnaSign: null, positiveTotal: 3.28, penaltyTotal: 0, priorBonus: 0, misses: [], supportingEvents: [] }] },
};

// The user's scenario: a supporting event whose summary is a wall of narrative.
const BLOB = 'I got married in June 2015 in Bengaluru.\n\nThen we relocated to Pune in 2019 for my job at a startup, my first child was born in 2021, and I changed careers to become a teacher in 2023 after finishing a certification, and there were several other smaller moves and family events during that whole decade that felt significant at the time.';

function baseInput(rectification?: ReturnType<typeof buildRectificationPdf>) {
  return {
    personName: 'Asha Rao', audienceLabel: 'For You', subtitle: 'subtitle', kicker: 'kicker',
    generatedAt: '1990-03-30T06:30:00Z',
    birth: BIRTH, lagna: CHART.lagna, chart: { ayanamsa_value: CHART.ayanamsa_value }, sidereal: CHART,
    interpretation: INTERPRETATION, audience: 'you' as const,
    chartCaptions: { rasi: 'Rasi', navamsa: 'Navamsa' },
    detailLabels: { dateOfBirth: 'Date of Birth', timeOfBirth: 'Time of Birth', placeOfBirth: 'Place of Birth', ascendant: 'Ascendant' },
    chromeLabels: CHROME_LABELS,
    rectification,
  };
}
const rectWith = (summary: string) =>
  buildRectificationPdf({ record: V2_RECORD, events: [{ date: '2015-06-20', category: 'marriage', summary }], t });

describe('report PDF renders to real bytes', () => {
  beforeAll(() => registerReportFonts(path.resolve('public/fonts')));

  it('natal + interpretation', async () => {
    const buf = await renderToBuffer(<ReportDocument data={buildReportPdfData(baseInput())} />);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('+ rectification with a giant narrative-blob supporting event', async () => {
    const buf = await renderToBuffer(<ReportDocument data={buildReportPdfData(baseInput(rectWith(BLOB)))} />);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('FULL — + comprehensive (transits / vargas / strength / domains) + rectification', async () => {
    const data = buildReportPdfData({ ...baseInput(rectWith(BLOB)), comprehensive: COMPREHENSIVE });
    const buf = await renderToBuffer(<ReportDocument data={data} />);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('a supporting-event summary with a long unbreakable URL token', async () => {
    const url = 'We moved — details at https://example.com/very/long/path/that/keeps/going/and/going/and/will/not/wrap/because/there/are/no/spaces/1234567890';
    const buf = await renderToBuffer(<ReportDocument data={buildReportPdfData(baseInput(rectWith(url)))} />);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('a supporting-event summary that is a single 300-char unbroken word', async () => {
    const buf = await renderToBuffer(<ReportDocument data={buildReportPdfData(baseInput(rectWith('x'.repeat(300))))} />);
    expect(buf.length).toBeGreaterThan(1000);
  });
});
