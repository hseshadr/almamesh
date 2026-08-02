/**
 * reportSections — the ONE declared list of report sections.
 *
 * WHY THIS EXISTS. The exported PDF was built once, early, when the report was
 * small, and then treated as a serialization detail rather than a product
 * surface. The screen kept growing; nobody re-opened the PDF; the gap widened
 * silently — because nothing anywhere asserted that the export had kept pace.
 * Filling in the missing sections fixes today and guarantees a repeat.
 *
 * So: every section of the report is declared HERE, once, and
 * `__tests__/reportSectionParity.test.tsx` holds both renderers to this list.
 * Adding a section to the on-screen report without deciding about the export
 * fails that test BY NAME. The only way to opt out is to say so out loud, in
 * this file, with a reason (`excluded`).
 *
 * WHAT THIS GUARD DOES AND DOES NOT PROVE. It proves a section is PRESENT in
 * the exported document. It does NOT prove it is present at the same fidelity —
 * a section that renders its heading but silently drops half its rows still
 * passes. That weaker bar is deliberate and sufficient here, because the export
 * and the screen now read the SAME stored, pre-formatted values (see
 * `hooks/useReportPdfExport.ts`); there is no second computation left for them
 * to disagree about. Per-section content depth is covered separately by the
 * acceptance suite in `components/report-pdf/__tests__/maximalReportPdf.test.tsx`.
 */

import type { ReportPdfData } from '../components/report-pdf/types';

/** How a declared section reaches the exported PDF. */
export type ReportSectionExport =
  | {
      readonly kind: 'included';
      /**
       * The text the PDF is expected to carry for this section, read off the
       * SAME data object the document renders (a label or a section chrome
       * title). Returning undefined means "this slice was absent from the data"
       * — the parity test reports that as a failure for an `included` section.
       */
      readonly pdfText: (data: ReportPdfData) => string | undefined;
    }
  | {
      readonly kind: 'excluded';
      /** Why this on-screen section deliberately does not reach the PDF. */
      readonly reason: string;
    };

export interface ReportSectionSpec {
  /** Stable identifier used in failure messages. */
  readonly key: string;
  /**
   * The `data-testid` the on-screen report (`/report`) renders for this
   * section, as a direct child of `[data-testid="report-document"]`.
   */
  readonly screenTestId: string;
  readonly export: ReportSectionExport;
}

/**
 * Every section of the report, in the order the document presents them.
 *
 * Note the cover↔birth-details asymmetry: on screen one `ReportCover` carries
 * both the identity block and the birth-details list; the PDF splits them into
 * the cover page plus Section I. Both PDF halves are asserted below, mapped to
 * the single screen section that produces them.
 */
export const REPORT_SECTIONS: readonly ReportSectionSpec[] = [
  {
    key: 'cover',
    screenTestId: 'report-cover',
    // The cover's identity block: the name the report is prepared for. Asserted
    // on the value rather than the "Prepared for" label because the cover sets
    // that label in wide letter-spacing, which poppler reads back with the
    // tracking baked in as spaces.
    export: { kind: 'included', pdfText: (d) => d.personName },
  },
  {
    key: 'birth-details',
    screenTestId: 'report-cover',
    export: { kind: 'included', pdfText: (d) => d.labels.birthDetailsTitle },
  },
  {
    key: 'planets',
    screenTestId: 'report-planet-table',
    export: { kind: 'included', pdfText: (d) => d.labels.planetsTitle },
  },
  {
    key: 'houses',
    screenTestId: 'report-houses',
    export: { kind: 'included', pdfText: (d) => d.labels.housesTitle },
  },
  {
    key: 'charts',
    screenTestId: 'report-charts',
    export: { kind: 'included', pdfText: (d) => d.labels.chartsTitle },
  },
  {
    key: 'dasha',
    screenTestId: 'report-dasha',
    export: { kind: 'included', pdfText: (d) => d.labels.dashaTitle },
  },
  {
    key: 'yogas',
    screenTestId: 'report-yogas',
    export: { kind: 'included', pdfText: (d) => d.labels.yogasTitle },
  },
  {
    key: 'interpretation',
    screenTestId: 'report-interpretation',
    export: { kind: 'included', pdfText: (d) => d.labels.narrativeTitle },
  },
  {
    key: 'transits',
    screenTestId: 'report-transits',
    export: { kind: 'included', pdfText: (d) => d.transits?.chrome.title },
  },
  {
    key: 'vargas',
    screenTestId: 'report-vargas',
    export: { kind: 'included', pdfText: (d) => d.vargas?.chrome.title },
  },
  {
    key: 'strength',
    screenTestId: 'report-strength',
    export: { kind: 'included', pdfText: (d) => d.strength?.chrome.title },
  },
  {
    key: 'domains',
    screenTestId: 'report-domains',
    export: { kind: 'included', pdfText: (d) => d.domains?.chrome.title },
  },
  {
    key: 'rectification',
    screenTestId: 'report-rectification',
    export: { kind: 'included', pdfText: (d) => d.rectification?.chrome.title },
  },
  {
    key: 'assumptions',
    screenTestId: 'report-assumptions',
    export: { kind: 'included', pdfText: (d) => d.assumptions?.chrome.title },
  },
  {
    key: 'footer',
    screenTestId: 'report-footer',
    export: {
      kind: 'excluded',
      reason:
        'The on-screen provenance footer is chrome, not content: the PDF prints ' +
        'its own fixed page footer (note + "n / total") on every page instead.',
    },
  },
];

/** The screen `data-testid`s the report document is expected to render. */
export const REPORT_SECTION_SCREEN_TEST_IDS: readonly string[] = [
  ...new Set(REPORT_SECTIONS.map((section) => section.screenTestId)),
];

/** Sections that must be findable in the exported PDF. */
export function includedSections(): readonly ReportSectionSpec[] {
  return REPORT_SECTIONS.filter((section) => section.export.kind === 'included');
}
