/**
 * downloadReportPdf — generate the @react-pdf birth-chart report as a Blob in the
 * browser and trigger a download. Keeps the heavy `@react-pdf/renderer` import OUT
 * of `ReportView`'s static graph (dynamic `import()`), registers the self-hosted
 * report fonts, reshapes engine output via the pure `buildReportPdfData`, and
 * saves `AlmaMesh — <Name> (<date>).pdf`. No astrology is computed here.
 */

import type { LagnaData, SiderealChart } from '@almamesh/browser/types';
import type { ProcessedBirthData, VedicInterpretation } from '@almamesh/shared-types';
import type { BirthDetailLabels, ReportPdfLabels } from '../components/report-pdf';
import type { ReportAudience } from './reportSelectors';
import type { ReportChartFields } from './reportData';

/** All localized chrome strings the document needs (passed from React/i18n). */
export interface ReportPdfChrome {
  readonly personName: string;
  readonly audienceLabel: string;
  readonly subtitle: string;
  readonly kicker: string;
  readonly ascendantNote?: string;
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
    detailLabels: input.chrome.detailLabels,
    chromeLabels: input.chrome.chromeLabels,
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
