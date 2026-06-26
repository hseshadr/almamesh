/**
 * buildReportSections — pure reshapers from the engine's `SiderealChart` (+ the
 * LLM `VedicInterpretation`) into the presentation-ready section slices of
 * `ReportPdfData`. Like `buildReportPdfData`, this RESHAPES and formats ONLY; it
 * recomputes no astrology (the engine is the single source of truth). The kundli
 * geometry rides along via the shared `buildChartGeometry` / `buildVargaGeometry`
 * adapters — the same geometry the on-screen SVGs consume.
 */

import type { SiderealChart } from '@almamesh/browser/types';
import type { VedicInterpretation } from '@almamesh/shared-types';
import {
  buildChartGeometry,
  buildVargaGeometry,
  type ChartGeometry,
  type ChartPlanet,
} from '@almamesh/store';
import { planetInk } from '../chart/chartTheme';
import { formatDegree } from '../../lib/reportData';
import { buildGuidanceSections, personaText, type ReportAudience } from '../../lib/reportSelectors';
import { glyphSafe } from './glyphSafe';
import type {
  ReportPdfCharts,
  ReportPdfDasha,
  ReportPdfDashaPeriod,
  ReportPdfNarrativeSection,
  ReportPdfPlanetRow,
  ReportPdfYoga,
} from './types';

/** Display order for the planetary table (luminaries, then taras, then nodes). */
const PLANET_ORDER: readonly string[] = [
  'sun',
  'moon',
  'mars',
  'mercury',
  'jupiter',
  'venus',
  'saturn',
  'rahu',
  'ketu',
];

const PLANET_NAMES: Readonly<Record<string, string>> = {
  sun: 'Sun',
  moon: 'Moon',
  mars: 'Mars',
  mercury: 'Mercury',
  jupiter: 'Jupiter',
  venus: 'Venus',
  saturn: 'Saturn',
  rahu: 'Rahu',
  ketu: 'Ketu',
};

function titleCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

/** Show a dignity only when it is meaningful (exalted / debilitated / own etc.). */
function dignityLabel(dignity: string): string {
  const normalized = dignity.trim().toLowerCase();
  if (!normalized || normalized === 'neutral') {
    return '';
  }
  return titleCase(normalized);
}

/** A graha's nakshatra + pada, e.g. "Uttara Bhadrapada · 4". */
function nakshatraLabel(nakshatra: string, pada: number): string {
  if (!nakshatra) {
    return '';
  }
  return pada > 0 ? `${nakshatra} · ${pada}` : nakshatra;
}

/** One planet → one table row (paper-legible ink, glyph-safe degree). */
function toPlanetRow(planet: ChartPlanet): ReportPdfPlanetRow {
  return {
    name: PLANET_NAMES[planet.name] ?? titleCase(planet.name),
    glyph: planet.label,
    sign: planet.sign,
    degree: glyphSafe(formatDegree(planet.signDegrees)),
    nakshatra: glyphSafe(nakshatraLabel(planet.nakshatra, planet.pada)),
    house: String(planet.house),
    dignity: dignityLabel(planet.dignity),
    isRetrograde: planet.isRetrograde,
    isCombust: planet.isCombust,
    color: planetInk(planet.color, 'paper'),
  };
}

/** The 9 grahas (engine order) + a leading Lagna row. */
export function buildPlanetRows(geometry: ChartGeometry): ReadonlyArray<ReportPdfPlanetRow> {
  const byName = new Map(geometry.planets.map((p) => [p.name, p]));
  const rows = PLANET_ORDER.filter((name) => byName.has(name)).map((name) =>
    toPlanetRow(byName.get(name) as ChartPlanet),
  );
  const lagnaRow: ReportPdfPlanetRow = {
    name: 'Ascendant',
    glyph: '',
    sign: geometry.lagna.sign,
    degree: glyphSafe(formatDegree(geometry.lagna.signDegrees)),
    nakshatra: '',
    house: '—',
    dignity: '',
    isRetrograde: false,
    isCombust: false,
    color: '#B8860B',
  };
  return [lagnaRow, ...rows];
}

/** Re-tint each geometry planet to its paper-legible ink (for the kundli cells). */
function paperTint(geometry: ChartGeometry): ChartGeometry {
  const tint = (p: ChartPlanet): ChartPlanet => ({ ...p, color: planetInk(p.color, 'paper') });
  return {
    ...geometry,
    planets: geometry.planets.map(tint),
    houses: geometry.houses.map((h) => ({ ...h, planets: h.planets.map(tint) })),
    signs: geometry.signs.map((s) => ({ ...s, planets: s.planets.map(tint) })),
  };
}

/** Build the D1 + D9 kundli geometry, paper-tinted, with localized captions. */
export function buildCharts(
  chart: SiderealChart,
  d1Geometry: ChartGeometry,
  captions: { readonly rasi: string; readonly navamsa: string },
): ReportPdfCharts {
  const nav = chart.navamsa;
  const navamsa = nav
    ? paperTint(
        buildVargaGeometry({
          name: nav.name,
          lagna_sign: nav.lagna_sign,
          lagna_sign_lord: nav.lagna_sign_lord,
          planets: nav.planets,
        }),
      )
    : null;
  return {
    rasi: paperTint(d1Geometry),
    rasiCaption: glyphSafe(captions.rasi),
    navamsa,
    navamsaCaption: glyphSafe(captions.navamsa),
  };
}

/** A short "Mon YYYY" label from an ISO date string (epoch-safe). */
function shortMonthYear(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) {
    return '';
  }
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date);
}

function spanLabel(years: number): string {
  if (!Number.isFinite(years) || years <= 0) {
    return '';
  }
  const rounded = years >= 1 ? Math.round(years) : Number(years.toFixed(1));
  return `${rounded} yr`;
}

/** Build the dasha timeline (maha sequence + current focus + running antars). */
export function buildDasha(chart: SiderealChart): ReportPdfDasha {
  const { dashas } = chart;
  const currentLord = dashas.current_maha?.lord ?? null;

  const mahaSequence: ReadonlyArray<ReportPdfDashaPeriod> = dashas.maha_dasha_sequence.map(
    (period) => ({
      lord: titleCase(period.lord),
      start: shortMonthYear(period.start_date),
      end: shortMonthYear(period.end_date),
      span: spanLabel(period.duration_years),
      isCurrent: period.lord === currentLord && period.start_date === dashas.current_maha?.start_date,
    }),
  );

  const focusParts = [dashas.current_maha, dashas.current_antar, dashas.current_pratyantar]
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => titleCase(p.lord));
  const currentFocus = glyphSafe(focusParts.join(' · '));

  const antarLord = dashas.current_antar?.lord ?? null;
  const currentMaha = dashas.maha_dasha_sequence.find((m) => m.lord === currentLord);
  const currentAntars: ReadonlyArray<ReportPdfDashaPeriod> = (currentMaha?.antar_sequence ?? []).map(
    (period) => ({
      lord: titleCase(period.lord),
      start: shortMonthYear(period.start_date),
      end: shortMonthYear(period.end_date),
      span: spanLabel(period.duration_years),
      isCurrent: period.lord === antarLord,
    }),
  );

  return { mahaSequence, currentFocus, currentAntars };
}

const GRADE_TITLE: Readonly<Record<string, string>> = {
  strong: 'Strong',
  moderate: 'Moderate',
  weak: 'Weak',
};

/** Build the yoga cards (engine yogas → name + category·grade + description). */
export function buildYogas(chart: SiderealChart): ReadonlyArray<ReportPdfYoga> {
  return chart.yogas.map((yoga) => {
    const category = titleCase(yoga.category.replace(/_/g, ' '));
    const grade = GRADE_TITLE[yoga.grade] ?? titleCase(yoga.grade);
    const planets = yoga.planets_involved.map(titleCase).join(' · ');
    // The clean `name` is the card title; `display_name` appends a parenthetical
    // formation that duplicates the description, so we drop it. The 4 distinct
    // "Dhana Yoga" rows stay distinguishable via their description line.
    return {
      name: glyphSafe(yoga.name),
      classification: glyphSafe(category ? `${category} · ${grade}` : grade),
      description: glyphSafe(yoga.description || yoga.effects),
      signature: glyphSafe(planets),
      grade: yoga.grade,
    };
  });
}

/** Split a prose blob into clean paragraphs (markdown bullets/emphasis stripped). */
function toParagraphs(text: string): ReadonlyArray<string> {
  return text
    .split(/\n{2,}|\r\n\r\n/)
    .map((para) =>
      glyphSafe(
        para
          .replace(/\r?\n/g, ' ')
          .replace(/^#+\s*/gm, '')
          .replace(/\*\*(.+?)\*\*/g, '$1')
          .replace(/\*(.+?)\*/g, '$1')
          .replace(/^[-*]\s+/gm, '')
          .trim(),
      ),
    )
    .filter((para) => para.length > 0);
}

/** A titled-persona list → one narrative section (its items joined as paragraphs). */
function titledSection(
  title: string,
  items: ReadonlyArray<{ readonly title?: string; readonly layman?: string; readonly technical?: string }>,
  audience: ReportAudience,
): ReportPdfNarrativeSection | null {
  const paragraphs = items
    .map((item) => {
      const text = personaText(item, audience);
      if (!text) {
        return '';
      }
      return item.title ? `${item.title}. ${text}` : text;
    })
    .filter((text) => text.length > 0)
    .flatMap((text) => toParagraphs(text));
  return paragraphs.length > 0 ? { title, paragraphs } : null;
}

/** Build the structured interpretation as ordered narrative blocks. */
export function buildNarrative(
  interpretation: VedicInterpretation,
  audience: ReportAudience,
): ReadonlyArray<ReportPdfNarrativeSection> {
  const sections: ReportPdfNarrativeSection[] = [];

  const summary = personaText(interpretation.summary, audience);
  if (summary) {
    sections.push({ title: '', paragraphs: toParagraphs(summary) });
  }

  const strengths = titledSection('Strengths', interpretation.strengths ?? [], audience);
  if (strengths) sections.push(strengths);
  const challenges = titledSection('Challenges', interpretation.challenges ?? [], audience);
  if (challenges) sections.push(challenges);
  const themes = titledSection('Life Themes', interpretation.life_themes ?? [], audience);
  if (themes) sections.push(themes);

  for (const guidance of buildGuidanceSections(interpretation, audience)) {
    sections.push({ title: guidance.title, paragraphs: toParagraphs(guidance.text) });
  }

  const road = titledSection('The Road Ahead', interpretation.upcoming_periods ?? [], audience);
  if (road) sections.push(road);

  return sections;
}

/** Build the D1 geometry once (shared by the planet table + the kundli plate). */
export function buildD1Geometry(chart: SiderealChart): ChartGeometry {
  return buildChartGeometry(chart);
}
