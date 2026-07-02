/**
 * report-pdf — the @react-pdf/renderer birth-chart report document.
 *
 * Public surface: the `ReportDocument` component, the pure `buildReportPdfData`
 * reshaper, and the data contract types. Everything here is presentation over
 * pre-formatted engine output — no astrology is computed.
 */

export { ReportDocument } from './ReportDocument';
export { buildReportPdfData } from './buildReportPdfData';
export type { BirthDetailLabels, BuildReportPdfDataInput } from './buildReportPdfData';
export { buildRectificationPdf } from './buildRectificationPdf';
export type { BuildRectificationPdfInput, RectificationPdfEvent } from './buildRectificationPdf';
export type { ReportPdfTranslators } from './buildComprehensiveSections';
export type {
  ReportPdfData,
  ReportPdfDetail,
  ReportPdfLabels,
  ReportPdfRectification,
  ReportPdfTechnical,
} from './types';
export { registerReportFonts } from './theme';
