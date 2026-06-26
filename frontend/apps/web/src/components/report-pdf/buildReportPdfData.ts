/**
 * buildReportPdfData — reshape engine + birth data into the PURE `ReportPdfData`
 * the @react-pdf document renders. Uses ONLY the existing `lib/reportData.ts`
 * formatters (timezone-safe, epoch-safe, locale-aware) — it recomputes NO
 * astrology. The caller supplies pre-localized labels (so i18n stays in React,
 * out of the PDF layer).
 */

import type { LagnaData, SiderealChart } from '@almamesh/browser/types';
import type { ProcessedBirthData, VedicInterpretation } from '@almamesh/shared-types';
import {
  buildPlaceString,
  formatBirthDateTime,
  formatDegree,
  formatReportDate,
  selectTechnicalFields,
  type ReportChartFields,
} from '../../lib/reportData';
import type { ReportAudience } from '../../lib/reportSelectors';
import { rectificationDelta, type RectificationDelta } from '../../lib/rectification';
import type { ReportPdfData, ReportPdfDetail, ReportPdfLabels, ReportPdfTechnical } from './types';
import { glyphSafe } from './glyphSafe';
import {
  buildCharts,
  buildD1Geometry,
  buildDasha,
  buildNarrative,
  buildPlanetRows,
  buildYogas,
} from './buildReportSections';

/** The per-field labels the birth-details list needs (already localized). */
export interface BirthDetailLabels {
  readonly dateOfBirth: string;
  readonly timeOfBirth: string;
  readonly placeOfBirth: string;
  readonly ascendant: string;
}

export interface BuildReportPdfDataInput {
  readonly personName: string;
  readonly audienceLabel: string;
  readonly subtitle: string;
  readonly kicker: string;
  readonly birth: ProcessedBirthData;
  readonly lagna: LagnaData;
  readonly chart: ReportChartFields;
  /** The full engine chart — drives the planet table, kundli, dasha, and yogas. */
  readonly sidereal: SiderealChart;
  /**
   * The structured LLM interpretation (narrative section). OPTIONAL: when it has
   * not been generated yet, the report degrades to its deterministic natal halves
   * and the Interpretation section is omitted entirely.
   */
  readonly interpretation?: VedicInterpretation;
  /** Resolved audience voice (layman / technical) for the narrative. */
  readonly audience: ReportAudience;
  /** Localized kundli plate captions ("Rāśi · D1" / "Navāṁśa · D9"). */
  readonly chartCaptions: { readonly rasi: string; readonly navamsa: string };
  /** Optional, already-localized near-cusp caveat. */
  readonly ascendantNote?: string;
  /**
   * Binds the localized `report:cover.rectified_note` template to a derived
   * rectification delta. The builder calls `rectificationDelta(birth)` and, when
   * a rectification is in effect, invokes this to produce the finished string —
   * so the "only when in effect" logic lives here while i18n stays in React.
   * Omit it (or return no delta) to render no rectification note.
   */
  readonly formatRectifiedNote?: (delta: RectificationDelta) => string;
  readonly detailLabels: BirthDetailLabels;
  readonly chromeLabels: ReportPdfLabels;
}

/**
 * The cover's rectification note, or undefined when no rectification is in
 * effect (or no formatter supplied). Pure: it reads the two clocks the engine
 * path already produced via `rectificationDelta` — it recomputes no astrology.
 */
function buildRectifiedNote(input: BuildReportPdfDataInput): string | undefined {
  if (!input.formatRectifiedNote) {
    return undefined;
  }
  const delta = rectificationDelta(input.birth);
  if (!delta) {
    return undefined;
  }
  return glyphSafe(input.formatRectifiedNote(delta));
}

function titleCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

/** Build the cream-paper data list from the birth + lagna data. */
function buildBirthDetails(input: BuildReportPdfDataInput): ReadonlyArray<ReportPdfDetail> {
  const when = formatBirthDateTime(input.birth);
  const place = buildPlaceString(input.birth);
  const time = when.tzLabel ? `${when.time} (${when.tzLabel})` : when.time;
  const ascendant = glyphSafe(
    `${titleCase(input.lagna.sign)} ${formatDegree(input.lagna.sign_degrees)}`,
  );
  const { detailLabels } = input;

  return [
    { label: detailLabels.dateOfBirth, value: glyphSafe(when.date || '—') },
    { label: detailLabels.timeOfBirth, value: glyphSafe(time || '—'), mono: true },
    { label: detailLabels.placeOfBirth, value: glyphSafe(place || '—') },
    { label: detailLabels.ascendant, value: ascendant, mono: true },
  ];
}

/** Glyph-safe every chrome label so the PDF layer renders verbatim strings. */
function safeLabels(labels: ReportPdfLabels): ReportPdfLabels {
  const safe = {} as Record<keyof ReportPdfLabels, string>;
  for (const key of Object.keys(labels) as (keyof ReportPdfLabels)[]) {
    safe[key] = glyphSafe(labels[key]);
  }
  return safe as ReportPdfLabels;
}

export function buildReportPdfData(input: BuildReportPdfDataInput): ReportPdfData {
  const technical: ReadonlyArray<ReportPdfTechnical> = selectTechnicalFields(input.chart).map(
    (field) => ({ label: field.label, value: glyphSafe(field.value) }),
  );
  const d1Geometry = buildD1Geometry(input.sidereal);

  return {
    personName: glyphSafe(input.personName),
    audienceLabel: glyphSafe(input.audienceLabel),
    subtitle: glyphSafe(input.subtitle),
    kicker: glyphSafe(input.kicker),
    generatedOn: glyphSafe(formatReportDate(new Date())),
    birthDetails: buildBirthDetails(input),
    ascendantNote: input.ascendantNote ? glyphSafe(input.ascendantNote) : undefined,
    rectifiedNote: buildRectifiedNote(input),
    technical,
    planets: buildPlanetRows(d1Geometry),
    charts: buildCharts(input.sidereal, d1Geometry, input.chartCaptions),
    dasha: buildDasha(input.sidereal),
    yogas: buildYogas(input.sidereal),
    narrative: input.interpretation
      ? buildNarrative(input.interpretation, input.audience)
      : undefined,
    labels: safeLabels(input.chromeLabels),
  };
}
