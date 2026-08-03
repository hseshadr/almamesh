/**
 * THE DETERMINISM GUARD. README.md tells readers the PDF export is
 * "deterministic (same input, same file every time)". Nothing tested that.
 * `renderToBytes.test.tsx` asserts only `buf.length > 1000`, which passes at any
 * content, and a measurement on 2026-08-03 found two exports of one chart
 * differing at 37 places / 179 bytes: random font subset tags, a wall-clock
 * `/CreationDate`, and the trailer `/ID` derived from it.
 *
 * This suite renders the SAME data twice and compares the bytes.
 *
 * ONE HARNESS CAVEAT, stated rather than hidden. Node's `@react-pdf/pdfkit`
 * build compresses each object with `zlib.createDeflate()`, whose callbacks land
 * off the libuv thread pool in whatever order they finish — so the OBJECT WRITE
 * ORDER inside the file varies between two Node renders even when every object
 * is byte-identical. The shipped browser build uses pako, which deflates on the
 * one JS thread and therefore emits in submission order. So:
 *
 *   - here (Node) we assert every object body, the font subset tags, the
 *     `/CreationDate` and the trailer `/ID` are identical — everything the
 *     product controls;
 *   - `e2e/report-pdf.e2e.spec.ts` exports the same chart TWICE from a real
 *     Chromium and asserts the two downloads have the same SHA-256. That is the
 *     whole-file byte comparison, run against the code a visitor actually runs.
 *
 * All data is SYNTHETIC (a Bengaluru "Reference Native") — never real birth data.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { renderToBuffer } from '@react-pdf/renderer';
import { registerReportFonts } from '../theme';
import type { SiderealChart } from '@almamesh/browser/types';
import type { ProcessedBirthData, VedicInterpretation } from '@almamesh/shared-types';
import '../../../i18n/config';
import i18next from 'i18next';
import { buildReportPdfData } from '../buildReportPdfData';
import { ReportDocument } from '../ReportDocument';
import type { ReportPdfLabels } from '../types';
import {
  canonicalizeFontSubsetTags,
  readFontSubsetTags,
} from '../../../lib/reportPdfDeterminism';
import { DOMAINS_CTX, STRENGTH_CTX, TRANSIT_CTX, VARGA_CTX_FULL } from '../../../test/predictiveFixtures';

/** The chart's own calculation instant — the report's stated generation time. */
const GENERATED_AT = '2026-05-01T09:15:00.000Z';

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

const COMPREHENSIVE = {
  translators: { tr: i18next.getFixedT(null, 'report'), tp: i18next.getFixedT(null, 'predictive') },
  transitCtx: TRANSIT_CTX,
  vargaCtxFull: VARGA_CTX_FULL,
  strengthCtx: STRENGTH_CTX,
  domainsCtx: DOMAINS_CTX,
};

function reportInput(comprehensive?: typeof COMPREHENSIVE) {
  return {
    personName: 'Asha Rao', audienceLabel: 'For You', subtitle: 'subtitle', kicker: 'kicker',
    generatedAt: GENERATED_AT,
    birth: BIRTH, lagna: CHART.lagna, chart: { ayanamsa_value: CHART.ayanamsa_value }, sidereal: CHART,
    interpretation: INTERPRETATION, audience: 'you' as const,
    chartCaptions: { rasi: 'Rasi', navamsa: 'Navamsa' },
    detailLabels: { dateOfBirth: 'Date of Birth', timeOfBirth: 'Time of Birth', placeOfBirth: 'Place of Birth', ascendant: 'Ascendant' },
    chromeLabels: CHROME_LABELS,
    comprehensive,
  };
}

/** Render the document exactly the way `downloadReportPdf` does. */
async function exportBytes(comprehensive?: typeof COMPREHENSIVE): Promise<Uint8Array> {
  const data = buildReportPdfData(reportInput(comprehensive));
  const raw = await renderToBuffer(<ReportDocument data={data} />);
  return canonicalizeFontSubsetTags(new Uint8Array(raw));
}

/** object number -> sha256 of that object's body. Order-independent by construction. */
function objectDigests(bytes: Uint8Array): Map<string, string> {
  const text = Buffer.from(bytes).toString('latin1');
  const digests = new Map<string, string>();
  for (const match of text.matchAll(/(\d+) 0 obj\n([\s\S]*?)\nendobj/g)) {
    digests.set(match[1], createHash('sha256').update(match[2], 'latin1').digest('hex'));
  }
  return digests;
}

function trailerId(bytes: Uint8Array): string {
  const found = Buffer.from(bytes).toString('latin1').match(/\/ID \[<([0-9a-f]+)> <([0-9a-f]+)>\]/);
  return found ? found[1] : '';
}

/**
 * pdfkit writes `/CreationDate` as an INDIRECT reference to a PDF date literal,
 * so read the literal itself rather than the dictionary entry.
 */
function creationDateLiteral(bytes: Uint8Array): string {
  const found = Buffer.from(bytes).toString('latin1').match(/\(D:(\d{14}[^)]*)\)/);
  return found ? `D:${found[1]}` : '';
}

describe('the exported report is byte-reproducible', () => {
  beforeAll(() => registerReportFonts(path.resolve('public/fonts')));

  it('two exports of the same chart embed the SAME font subset tags', async () => {
    const [first, second] = [await exportBytes(), await exportBytes()];
    const tags = readFontSubsetTags(first);
    expect(tags.length).toBeGreaterThan(0);
    expect(readFontSubsetTags(second)).toEqual(tags);
  }, 120_000);

  it('two exports of the same chart produce identical objects', async () => {
    const [first, second] = [await exportBytes(), await exportBytes()];
    expect(objectDigests(second)).toEqual(objectDigests(first));
  }, 120_000);

  it('two exports of the FULL report produce identical objects', async () => {
    const [first, second] = [await exportBytes(COMPREHENSIVE), await exportBytes(COMPREHENSIVE)];
    expect(objectDigests(second)).toEqual(objectDigests(first));
  }, 180_000);

  it('pins /CreationDate to the chart instant, not the wall clock', async () => {
    const bytes = await exportBytes();
    // 2026-05-01T09:15:00.000Z, in the PDF date syntax pdfkit writes.
    expect(creationDateLiteral(bytes)).toMatch(/^D:20260501091500/);
  }, 120_000);

  it('pins the trailer /ID, which pdfkit derives from the info dictionary', async () => {
    const [first, second] = [await exportBytes(), await exportBytes()];
    expect(trailerId(first)).toHaveLength(32);
    expect(trailerId(second)).toBe(trailerId(first));
  }, 120_000);
});
