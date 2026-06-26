/**
 * ReportPdfNarrative — the structured interpretation rendered as elegant editorial
 * prose. The first block (an empty title) is the summary, set as a brass-ruled
 * italic pull-quote; every subsequent block is a Fraunces sub-heading over its
 * ordered paragraphs. Paragraphs arrive as plain text on `ReportPdfNarrativeSection`
 * (markdown already stripped) — the PDF layer only typesets.
 */

import type { ReactElement } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { styles } from '../theme';
import type { ReportPdfData, ReportPdfNarrativeSection } from '../types';
import { ReportPdfHeading } from './ReportPdfHeading';

interface ReportPdfNarrativeProps {
  readonly data: ReportPdfData;
}

function SummaryBlock({ section }: { section: ReportPdfNarrativeSection }): ReactElement {
  return (
    <View style={styles.narrativeSummary}>
      {section.paragraphs.map((para, index) => (
        <Text key={index} style={styles.narrativeSummaryText}>
          {para}
        </Text>
      ))}
    </View>
  );
}

function NarrativeBlock({ section }: { section: ReportPdfNarrativeSection }): ReactElement {
  const [firstPara, ...restParas] = section.paragraphs;
  return (
    <View style={styles.narrativeBlock} wrap>
      {/* Widow control: glue the sub-heading to its FIRST paragraph in a
          non-wrapping group so a sub-heading never strands alone at the foot of
          a page. Remaining paragraphs flow (and may break) normally. */}
      <View wrap={false}>
        {section.title ? <Text style={styles.narrativeHeading}>{section.title}</Text> : null}
        {firstPara !== undefined ? (
          <Text style={styles.narrativePara}>{firstPara}</Text>
        ) : null}
      </View>
      {restParas.map((para, index) => (
        <Text key={index} style={styles.narrativePara}>
          {para}
        </Text>
      ))}
    </View>
  );
}

export function ReportPdfNarrative({ data }: ReportPdfNarrativeProps): ReactElement {
  const { narrative, labels } = data;
  const sections = narrative ?? [];
  return (
    <View>
      <ReportPdfHeading
        eyebrow={labels.narrativeEyebrow}
        title={labels.narrativeTitle}
        intro={labels.narrativeIntro}
      />
      {sections.map((section, index) =>
        section.title === '' ? (
          <SummaryBlock key={`summary-${index}`} section={section} />
        ) : (
          <NarrativeBlock key={`${section.title}-${index}`} section={section} />
        ),
      )}
    </View>
  );
}
