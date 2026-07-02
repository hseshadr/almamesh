/**
 * ReportDocument — the @react-pdf/renderer `<Document>` skeleton for the
 * AlmaMesh Vedic birth-chart report.
 *
 * THE COMPREHENSIVE ARTIFACT: cover · birth details · planets · houses ·
 * kundli · daśā (with every mahā's antars) · yogas · narrative, then the
 * comprehensive sections mirrored from the web report — transits, all sixteen
 * varga plates (four per page), strength (SAV/BAV/Ṣaḍbala), the life-domain
 * forecasts, and Birth Time Authority. Optional sections are OMITTED entirely
 * when their data is absent (never a blank page). The document is PURE
 * presentation over a pre-reshaped `ReportPdfData` — no engine, no store, no
 * astrology (calculation integrity).
 *
 * Fonts are registered by the CALLER before rendering (the browser via
 * `registerReportFonts()`; the Node harness via local .ttf paths).
 */

import type { ReactElement } from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { styles } from './theme';
import type { ReportPdfData } from './types';
import { ReportPdfCover } from './sections/ReportPdfCover';
import { ReportPdfBirthDetails } from './sections/ReportPdfBirthDetails';
import { ReportPdfPlanets } from './sections/ReportPdfPlanets';
import { ReportPdfHouses } from './sections/ReportPdfHouses';
import { ReportPdfCharts } from './sections/ReportPdfCharts';
import { ReportPdfDasha } from './sections/ReportPdfDasha';
import { ReportPdfYogas } from './sections/ReportPdfYogas';
import { ReportPdfNarrative } from './sections/ReportPdfNarrative';
import { ReportPdfTransits } from './sections/ReportPdfTransits';
import {
  chunkVargaPlates,
  ReportPdfVargaPlates,
  ReportPdfVargaTallies,
} from './sections/ReportPdfVargas';
import { ReportPdfStrength } from './sections/ReportPdfStrength';
import { ReportPdfDomains } from './sections/ReportPdfDomains';
import { ReportPdfRectification } from './sections/ReportPdfRectification';

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

/** The full report document. */
export function ReportDocument({ data }: ReportDocumentProps): ReactElement {
  const footer = <PageFooter note={data.labels.footerNote} />;
  const vargas = data.vargas;
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
        {footer}
      </Page>

      <Page size="A4" style={styles.page}>
        <ReportPdfPlanets data={data} />
        {footer}
      </Page>

      <Page size="A4" style={styles.page}>
        <ReportPdfHouses data={data} />
        {footer}
      </Page>

      <Page size="A4" style={styles.page}>
        <ReportPdfCharts data={data} />
        {footer}
      </Page>

      <Page size="A4" style={styles.page}>
        <ReportPdfDasha data={data} />
        {footer}
      </Page>

      <Page size="A4" style={styles.page}>
        <ReportPdfYogas data={data} />
        {footer}
      </Page>

      {/* The Interpretation page is rendered ONLY when the LLM narrative exists.
          Without it the report gracefully degrades to its deterministic natal
          halves. */}
      {data.narrative && data.narrative.length > 0 ? (
        <Page size="A4" style={styles.page}>
          <ReportPdfNarrative data={data} />
          {footer}
        </Page>
      ) : null}

      {/* Comprehensive sections — mirrors of web report VII–XI; each present
          only when its on-device context was computed. */}
      {data.transits ? (
        <Page size="A4" style={styles.page}>
          <ReportPdfTransits data={data} />
          {footer}
        </Page>
      ) : null}

      {vargas
        ? chunkVargaPlates(vargas.plates).map((plates, pageIndex) => (
            <Page key={`vargas-${pageIndex}`} size="A4" style={styles.page}>
              <ReportPdfVargaPlates vargas={vargas} plates={plates} first={pageIndex === 0} />
              {footer}
            </Page>
          ))
        : null}
      {vargas ? (
        <Page size="A4" style={styles.page}>
          <ReportPdfVargaTallies vargas={vargas} />
          {footer}
        </Page>
      ) : null}

      {data.strength ? (
        <Page size="A4" style={styles.page}>
          <ReportPdfStrength data={data} />
          {footer}
        </Page>
      ) : null}

      {data.domains ? (
        <Page size="A4" style={styles.page}>
          <ReportPdfDomains data={data} />
          {footer}
        </Page>
      ) : null}

      {data.rectification ? (
        <Page size="A4" style={styles.page}>
          <ReportPdfRectification data={data} />
          {footer}
        </Page>
      ) : null}
    </Document>
  );
}
