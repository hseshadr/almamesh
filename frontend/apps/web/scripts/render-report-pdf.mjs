/**
 * render-report-pdf.mjs — eye-inspection harness for the @react-pdf report.
 *
 * Renders the FULL document (cover · birth details · planetary positions · D1+D9
 * kundli · Vimshottari dasha · yogas · interpretation) to a real PDF using a
 * realistic fixture, WITHOUT a browser. @react-pdf runs natively under Node, so
 * this writes `.report-out/sample-report.pdf` for visual review at every stage.
 *
 *   bun run report:pdf:sample
 *
 * The fixture is built from a REAL engine chart for the reference native,
 * 08 Aug 1988, RECTIFIED to 06:14 IST, Bengaluru (`.report-out/reference_chart.json`,
 * produced by `uv run almamesh-chart "1988-08-08T06:14:00+05:30" 12.9716 77.5946`).
 * The chart is reshaped by the SAME `buildReportSections` helpers the React app
 * uses, so the kundli geometry, planet table, dasha, and yogas are authentic — not
 * hand-mocked. The cover / birth-details / interpretation strings are authored
 * literals (the narrative would otherwise come from the optional LLM).
 *
 * Fonts are registered from the on-disk `public/fonts/*.ttf` (the same files the
 * browser serves from `/fonts/*`) — zero network egress, byte-identical glyphs.
 *
 * NOTE: this MUST run under Node (not Bun): fontkit cannot subset the instanced
 * variable .ttf faces under Bun's loader (blank glyphs). `bun run report:pdf:sample`
 * shells out to `node --import tsx` for exactly this reason.
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { Font, renderToFile } from '@react-pdf/renderer';
import { ReportDocument } from '../src/components/report-pdf/ReportDocument.tsx';
import {
  buildCharts,
  buildD1Geometry,
  buildDasha,
  buildNarrative,
  buildPlanetRows,
  buildYogas,
} from '../src/components/report-pdf/buildReportSections.ts';
import { glyphSafe } from '../src/components/report-pdf/glyphSafe.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, '..');
const FONT_DIR = resolve(APP_ROOT, 'public/fonts');
const OUT_DIR = resolve(APP_ROOT, '.report-out');
const CHART_FILE = resolve(OUT_DIR, 'reference_chart.json');

// `REPORT_FIXTURE=natal-only` renders the graceful natal-only degradation: the
// deterministic halves (cover · birth details · planets · kundli · dasha · yogas)
// with NO interpretation, so the Interpretation section is cleanly omitted. Any
// other value renders the full report (the default).
const FIXTURE = process.env.REPORT_FIXTURE ?? 'full';
const NATAL_ONLY = FIXTURE === 'natal-only';
const OUT_FILE = resolve(OUT_DIR, NATAL_ONLY ? 'sample-report-natal-only.pdf' : 'sample-report.pdf');

/**
 * Re-register the report fonts from absolute LOCAL file paths. The document's
 * module-load registration used URL paths (/fonts/…) which Node cannot fetch;
 * re-registering the same families points them at on-disk .ttf for the Node render.
 */
function registerLocalFonts() {
  Font.registerHyphenationCallback((word) => [word]);
  Font.register({
    family: 'Fraunces Report',
    fonts: [
      { src: resolve(FONT_DIR, 'Fraunces-Regular.ttf'), fontWeight: 400 },
      { src: resolve(FONT_DIR, 'Fraunces-SemiBold.ttf'), fontWeight: 600 },
      { src: resolve(FONT_DIR, 'Fraunces-Italic.ttf'), fontWeight: 400, fontStyle: 'italic' },
    ],
  });
  Font.register({
    family: 'Hanken Grotesk Report',
    fonts: [
      { src: resolve(FONT_DIR, 'HankenGrotesk-Report-Regular.ttf'), fontWeight: 400 },
      { src: resolve(FONT_DIR, 'HankenGrotesk-Report-Medium.ttf'), fontWeight: 500 },
      { src: resolve(FONT_DIR, 'HankenGrotesk-Report-SemiBold.ttf'), fontWeight: 600 },
    ],
  });
  Font.register({
    family: 'Spline Sans Mono Report',
    fonts: [
      { src: resolve(FONT_DIR, 'SplineSansMono-Regular.ttf'), fontWeight: 400 },
      { src: resolve(FONT_DIR, 'SplineSansMono-SemiBold.ttf'), fontWeight: 600 },
    ],
  });
}

/**
 * An authored sample interpretation in the `VedicInterpretation` shape — the
 * narrative the optional LLM produces in the app. This is ILLUSTRATIVE sample
 * copy used only to exercise the report layout end-to-end; it does not describe
 * the reference native's actual placements (the real narrative comes from the
 * optional LLM against the engine-computed chart).
 */
const SAMPLE_INTERPRETATION = {
  summary:
    'An ascendant lit by an exalted Venus rising in the first house gives a life shaped ' +
    'by aesthetic sensitivity, devotion, and an unusual capacity to find meaning in the unseen. ' +
    'Jupiter, your chart lord, sits debilitated yet rescued (Neecha Bhanga) — a signature of ' +
    'hard-won wisdom: the very places you feel diminished become, with time, your deepest ' +
    'authority. With every graha caught between the lunar nodes (Kala Sarpa), life tends to move ' +
    'in concentrated chapters rather than scattered ease.',
  strengths: [
    {
      title: 'Exalted Venus in the First',
      layman:
        'Venus, the planet of beauty and relationship, is at its strongest in your rising sign. ' +
        'People feel an immediate warmth and grace in your presence, and you have a natural eye ' +
        'for harmony — in art, in spaces, and in how you treat others.',
    },
    {
      title: 'Mars Exalted in the Eleventh',
      layman:
        'Your drive is channelled into gains, networks, and long-term goals. Exalted Mars here ' +
        'makes you persistent about the things you want and generous with the community that ' +
        'forms around your ambitions.',
    },
  ],
  challenges: [
    {
      title: 'Venus Combust',
      layman:
        'Although Venus is exalted, it sits very close to the Sun and is "combust" — its light ' +
        'partly absorbed. Outwardly graceful, you may privately discount your own worth in love ' +
        'and creativity. Naming that pattern is most of the work of undoing it.',
    },
    {
      title: 'Kala Sarpa Pattern',
      layman:
        'With all planets held within the Rahu–Ketu axis, life can feel as if it runs in ' +
        'tunnels — intense focus on one arena while others wait. Deliberately widening your ' +
        'attention keeps the pattern an asset rather than a constraint.',
    },
  ],
  life_themes: [
    {
      title: 'Wisdom Through Reversal',
      layman:
        'The debilitated-but-rescued Jupiter is the spine of your story: early underestimation ' +
        'in learning, faith, or guidance matures into exactly the wisdom others later seek from you.',
    },
  ],
  career_guidance: {
    layman:
      'Rahu in the tenth house pulls your career toward the unconventional, the foreign, or the ' +
      'technological — fields without a worn path. You do your best work where you can invent the ' +
      'role rather than inherit it. The Saturn major period now running rewards patient, ' +
      'structural building over quick wins.',
  },
  relationship_guidance: {
    layman:
      'An exalted Venus rising makes partnership central to your sense of self. The combustion ' +
      'asks you to let yourself be truly seen rather than only admired — intimacy, not just ' +
      'attraction. Relationships that honour your inner life, not only your charm, are the ones ' +
      'that last.',
  },
  spiritual_guidance: {
    layman:
      'A water-sign ascendant with Jupiter and Ketu strong inclines you toward the contemplative. ' +
      'Devotion, water, music, and quiet practice restore you more than analysis does. Your ' +
      'twelfth-house Mercury makes the inner world unusually articulate when you give it space.',
  },
};

/** The localized chrome labels (authored here; the app passes i18n strings). */
const LABELS = {
  preparedFor: 'Prepared for',
  birthDetailsTitle: 'Birth Details',
  birthDetailsEyebrow: 'Section I',
  birthDetailsIntro:
    'The exact moment and place of birth from which every placement in this report is derived.',
  technicalNote:
    'Computed with the Lahiri ayanamsa and the whole-sign house system. All values are emitted ' +
    'by the AlmaMesh engine on your device.',
  footerNote: 'AlmaMesh · Vedic Birth-Chart Report',

  planetsEyebrow: 'Section II',
  planetsTitle: 'Planetary Positions',
  planetsIntro:
    'The sidereal longitude of each graha at the moment of birth — its sign, exact degree, ' +
    'nakshatra, house, and dignity. Combust planets are shown dimmed; (R) marks retrograde motion.',
  colPlanet: 'Graha',
  colSign: 'Sign',
  colDegree: 'Degree',
  colNakshatra: 'Nakshatra · Pada',
  colHouse: 'Hse',
  colDignity: 'Dignity',
  lagnaRowName: 'Ascendant',

  chartsEyebrow: 'Section III',
  chartsTitle: 'The Kundli',
  chartsIntro:
    'The birth chart (D1 Rāśi) and the navamsa (D9), the divisional chart of marriage, dharma, ' +
    'and inner strength — both in the classical North-Indian diamond, houses fixed, signs rotating.',

  dashaEyebrow: 'Section IV',
  dashaTitle: 'Vimshottari Daśā',
  dashaIntro:
    'The 120-year planetary period system keyed to the Moon’s nakshatra at birth. Each maha-daśā ' +
    'colours a long chapter of life; the current period is marked in brass.',
  dashaCurrentLabel: 'Currently Running — Maha · Antar · Pratyantar',
  dashaSequenceLabel: 'Maha-Daśā Sequence',
  dashaAntarLabel: 'Antar-Daśā within the Current Maha',

  yogasEyebrow: 'Section V',
  yogasTitle: 'Yogas & Combinations',
  yogasIntro:
    'The named planetary combinations the engine identifies in this chart, with their classical ' +
    'grade. A yoga is a tendency, never a verdict.',

  narrativeEyebrow: 'Section VI',
  narrativeTitle: 'Interpretation',
  narrativeIntro:
    'A reading woven from the placements above — strengths, challenges, life themes, and ' +
    'guidance across the major life domains.',
};

/** Glyph-safe every string in a flat label/value record (mirrors the app). */
function safeRecord(record) {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, glyphSafe(v)]));
}

async function main() {
  registerLocalFonts();
  const chart = JSON.parse(await readFile(CHART_FILE, 'utf8'));
  const d1Geometry = buildD1Geometry(chart);

  const data = {
    personName: glyphSafe('Reference Native'),
    audienceLabel: glyphSafe('For You'),
    subtitle: glyphSafe('A sidereal birth-chart reading, computed on your device.'),
    kicker: glyphSafe('Vedic Astrology Report'),
    generatedOn: glyphSafe('Generated on June 20, 2026'),
    birthDetails: [
      { label: 'Date of Birth', value: glyphSafe('August 8, 1988') },
      { label: 'Time of Birth', value: glyphSafe('06:14 (Asia/Kolkata) — rectified'), mono: true },
      { label: 'Place of Birth', value: glyphSafe('Bengaluru, Karnataka, India') },
      { label: 'Ascendant (Lagna)', value: glyphSafe("Cancer 22°54'"), mono: true },
    ],
    ascendantNote: glyphSafe(
      "~22.9° into Cancer. The recorded birth time has been rectified to 06:14 IST; a few minutes' " +
        'difference would shift the rising sign and every house placement with it. House-based ' +
        'interpretation depends on an accurate birth time — refine it in AlmaMesh before relying on ' +
        'house placements.',
    ),
    technical: [
      { label: 'Ayanamsa', value: glyphSafe('23.48° (Lahiri)') },
      { label: 'House System', value: glyphSafe('Whole Sign') },
    ],
    planets: buildPlanetRows(d1Geometry),
    charts: buildCharts(chart, d1Geometry, { rasi: 'Rāśi · D1', navamsa: 'Navāṁśa · D9' }),
    dasha: buildDasha(chart),
    yogas: buildYogas(chart),
    // Natal-only fixture omits the narrative entirely (undefined) — the document
    // then drops the Interpretation page; the full fixture builds it as usual.
    narrative: NATAL_ONLY ? undefined : buildNarrative(SAMPLE_INTERPRETATION, 'you'),
    labels: safeRecord(LABELS),
  };

  await mkdir(OUT_DIR, { recursive: true });
  await renderToFile(createElement(ReportDocument, { data }), OUT_FILE);
  console.log(`✅ Wrote ${OUT_FILE} (fixture=${FIXTURE})`);
  console.log(
    `   planets=${data.planets.length} yogas=${data.yogas.length} ` +
      `maha=${data.dasha.mahaSequence.length} antar=${data.dasha.currentAntars.length} ` +
      `narrative=${data.narrative ? data.narrative.length : 'omitted'} ` +
      `navamsa=${data.charts.navamsa ? 'yes' : 'no'}`,
  );
}

main().catch((error) => {
  console.error('❌ Failed to render sample report:', error);
  process.exit(1);
});
