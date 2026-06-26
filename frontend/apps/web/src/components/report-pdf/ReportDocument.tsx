/**
 * ReportDocument — the @react-pdf/renderer `<Document>` skeleton for the
 * AlmaMesh Vedic birth-chart report.
 *
 * FOUNDATION SLICE: a cover page + a birth-details page, both A4. This sets the
 * design language (the "letterpress observatory" theme in ./theme) for every
 * section that follows. The document is PURE presentation over a pre-reshaped
 * `ReportPdfData` — no engine, no store, no astrology (calculation integrity).
 *
 * Fonts are registered at module load from self-hosted .ttf (zero egress). The
 * Node render harness can re-register with a local `fontBase` before rendering.
 */

import type { ReactElement } from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { styles } from './theme';
import type { ReportPdfData } from './types';
import { ReportPdfCover } from './sections/ReportPdfCover';
import { ReportPdfBirthDetails } from './sections/ReportPdfBirthDetails';
import { ReportPdfPlanets } from './sections/ReportPdfPlanets';
import { ReportPdfCharts } from './sections/ReportPdfCharts';
import { ReportPdfDasha } from './sections/ReportPdfDasha';
import { ReportPdfYogas } from './sections/ReportPdfYogas';
import { ReportPdfNarrative } from './sections/ReportPdfNarrative';

// Fonts are registered by the CALLER before rendering (the browser via
// `registerReportFonts()`; the Node harness via local .ttf paths). Keeping
// registration out of module load lets each environment point the same families
// at the right sources without double-registering.

interface ReportDocumentProps {
  readonly data: ReportPdfData;
}

/** The running footer pinned to the bottom of every content page. */
function PageFooter({ note }: { note: string }): ReactElement {
  return (
    <>
      <View fixed style={styles.pageFooterRule} />
      <View fixed style={styles.pageFooter}>
        <Text>{note}</Text>
        <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
    </>
  );
}

/** The full report document (cover + birth details for now). */
export function ReportDocument({ data }: ReportDocumentProps): ReactElement {
  return (
    <Document
      title={`AlmaMesh — ${data.personName}`}
      author="AlmaMesh"
      subject="Vedic birth-chart report"
      creator="AlmaMesh"
      producer="AlmaMesh"
    >
      <Page size="A4" style={styles.page}>
        <ReportPdfCover data={data} />
      </Page>

      <Page size="A4" style={styles.page}>
        <ReportPdfBirthDetails data={data} />
        <PageFooter note={data.labels.footerNote} />
      </Page>

      <Page size="A4" style={styles.page}>
        <ReportPdfPlanets data={data} />
        <PageFooter note={data.labels.footerNote} />
      </Page>

      <Page size="A4" style={styles.page}>
        <ReportPdfCharts data={data} />
        <PageFooter note={data.labels.footerNote} />
      </Page>

      <Page size="A4" style={styles.page}>
        <ReportPdfDasha data={data} />
        <PageFooter note={data.labels.footerNote} />
      </Page>

      <Page size="A4" style={styles.page}>
        <ReportPdfYogas data={data} />
        <PageFooter note={data.labels.footerNote} />
      </Page>

      {/* The Interpretation page is rendered ONLY when the LLM narrative exists.
          Without it the report gracefully degrades to its deterministic natal
          halves (cover · birth details · planets · kundli · dasha · yogas). */}
      {data.narrative && data.narrative.length > 0 ? (
        <Page size="A4" style={styles.page}>
          <ReportPdfNarrative data={data} />
          <PageFooter note={data.labels.footerNote} />
        </Page>
      ) : null}
    </Document>
  );
}
