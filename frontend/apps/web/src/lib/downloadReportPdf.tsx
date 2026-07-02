/**
 * downloadReportPdf — generate the @react-pdf birth-chart report as a Blob in the
 * browser and trigger a download. Keeps the heavy `@react-pdf/renderer` import OUT
 * of `ReportView`'s static graph (dynamic `import()`), registers the self-hosted
 * report fonts, reshapes engine output via the pure `buildReportPdfData`, and
 * saves `AlmaMesh — <Name> (<date>).pdf`. No astrology is computed here.
 */

import type { LagnaData, SiderealChart } from '@almamesh/browser/types';
import type {
  DomainsCtx,
  ProcessedBirthData,
  StrengthCtx,
  TransitCtx,
  VargaCtxFull,
  VedicInterpretation,
} from '@almamesh/shared-types';
import type {
  BirthDetailLabels,
  ReportPdfLabels,
  ReportPdfRectification,
  ReportPdfTranslators,
} from '../components/report-pdf';
import type { ReportAudience } from './reportSelectors';
import type { ReportChartFields } from './reportData';
import type { RectificationDelta } from './rectification';

/** All localized chrome strings the document needs (passed from React/i18n). */
export interface ReportPdfChrome {
  readonly personName: string;
  readonly audienceLabel: string;
  readonly subtitle: string;
  readonly kicker: string;
  readonly ascendantNote?: string;
  /**
   * Binds the localized `report:cover.rectified_note` template to a derived
   * rectification delta. The builder calls it only when a rectification is in
   * effect, so i18n stays in React while the cover stays honest.
   */
  readonly formatRectifiedNote?: (delta: RectificationDelta) => string;
  /** Binds `report:dasha.antar_heading` for the all-mahā antar tables. */
  readonly formatAntarHeading?: (lord: string) => string;
  /** Localized kundli plate captions ("Rāśi · D1" / "Navāṁśa · D9"). */
  readonly chartCaptions: { readonly rasi: string; readonly navamsa: string };
  readonly detailLabels: BirthDetailLabels;
  readonly chromeLabels: ReportPdfLabels;
}

export interface DownloadReportPdfInput {
  readonly birth: ProcessedBirthData;
  readonly lagna: LagnaData;
  readonly chart: ReportChartFields;
  /** The full engine chart — drives the planet table, kundli, dasha, and yogas. */
  readonly sidereal: SiderealChart;
  /**
   * The structured LLM interpretation (narrative section). OPTIONAL: when absent
   * the PDF degrades to its deterministic natal halves and omits the narrative.
   */
  readonly interpretation?: VedicInterpretation;
  /** Resolved audience voice (layman / technical) for the narrative. */
  readonly audience: ReportAudience;
  readonly chrome: ReportPdfChrome;
  /**
   * The computed predictive contexts + the i18next translators that localize
   * them. OPTIONAL: when absent (or a context is missing) the matching PDF
   * sections are omitted — the PDF mirrors exactly what the web report shows.
   */
  readonly comprehensive?: {
    readonly translators: ReportPdfTranslators;
    readonly transitCtx?: TransitCtx;
    readonly vargaCtxFull?: VargaCtxFull;
    readonly strengthCtx?: StrengthCtx;
    readonly domainsCtx?: DomainsCtx;
  };
  /** Pre-localized Birth Time Authority slice (when a rectification exists). */
  readonly rectification?: ReportPdfRectification;
  /** The download file name (without extension). */
  readonly fileBaseName: string;
}

/** Build the document, render to a Blob, and click a temporary download link. */
export async function downloadReportPdf(input: DownloadReportPdfInput): Promise<void> {
  const { pdf } = await import('@react-pdf/renderer');
  const { ReportDocument, buildReportPdfData, registerReportFonts } = await import(
    '../components/report-pdf'
  );

  registerReportFonts();

  const data = buildReportPdfData({
    personName: input.chrome.personName,
    audienceLabel: input.chrome.audienceLabel,
    subtitle: input.chrome.subtitle,
    kicker: input.chrome.kicker,
    birth: input.birth,
    lagna: input.lagna,
    chart: input.chart,
    sidereal: input.sidereal,
    interpretation: input.interpretation,
    audience: input.audience,
    chartCaptions: input.chrome.chartCaptions,
    ascendantNote: input.chrome.ascendantNote,
    formatRectifiedNote: input.chrome.formatRectifiedNote,
    formatAntarHeading: input.chrome.formatAntarHeading,
    detailLabels: input.chrome.detailLabels,
    chromeLabels: input.chrome.chromeLabels,
    comprehensive: input.comprehensive,
    rectification: input.rectification,
  });

  const blob = await pdf(<ReportDocument data={data} />).toBlob();
  triggerDownload(blob, `${input.fileBaseName}.pdf`);
}

/** Save a Blob to disk via a transient object-URL anchor. */
function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so the click's navigation has consumed the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
