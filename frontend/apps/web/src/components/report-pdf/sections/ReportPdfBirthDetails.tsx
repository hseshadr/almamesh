/**
 * ReportPdfBirthDetails — the birth-details page of the @react-pdf Vedic report.
 *
 * A section heading (mono eyebrow + Fraunces title + brass rule), a short intro,
 * a bordered data-list panel (date / time / place / ascendant, each value
 * pre-formatted in the birth timezone), an optional near-cusp honesty note, and a
 * two-up technical readout (ayanamsa, house system). Degree/coordinate values are
 * set in mono so they align in tabular columns.
 */

import type { ReactElement } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { styles } from '../theme';
import type { ReportPdfData, ReportPdfDetail, ReportPdfTechnical } from '../types';

interface ReportPdfBirthDetailsProps {
  readonly data: ReportPdfData;
}

/** One row of the birth data list; mono value for technical readouts. */
function DetailRow({ detail, last }: { detail: ReportPdfDetail; last: boolean }): ReactElement {
  return (
    <View style={last ? styles.detailRowLast : styles.detailRow}>
      <Text style={styles.detailLabel}>{detail.label}</Text>
      <Text style={detail.mono ? styles.detailValueMono : styles.detailValue}>{detail.value}</Text>
    </View>
  );
}

/** One technical readout cell (engine-emitted value). */
function TechCell({ field }: { field: ReportPdfTechnical }): ReactElement {
  return (
    <View style={styles.techCell}>
      <Text style={styles.techLabel}>{field.label}</Text>
      <Text style={styles.techValue}>{field.value}</Text>
    </View>
  );
}

export function ReportPdfBirthDetails({ data }: ReportPdfBirthDetailsProps): ReactElement {
  const { birthDetails, technical, labels } = data;

  return (
    <View>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionEyebrow}>{labels.birthDetailsEyebrow}</Text>
        <Text style={styles.sectionTitle}>{labels.birthDetailsTitle}</Text>
        <View style={styles.sectionRule} />
        <Text style={styles.sectionIntro}>{labels.birthDetailsIntro}</Text>
      </View>

      <View style={styles.detailPanel}>
        {birthDetails.map((detail, index) => (
          <DetailRow
            key={detail.label}
            detail={detail}
            last={index === birthDetails.length - 1 && !data.ascendantNote}
          />
        ))}
        {data.ascendantNote ? <Text style={styles.detailNote}>{data.ascendantNote}</Text> : null}
      </View>

      {technical.length > 0 ? (
        <>
          <View style={styles.techRow}>
            {technical.map((field) => (
              <TechCell key={field.label} field={field} />
            ))}
          </View>
          <Text style={[styles.detailNote, { marginTop: 18 }]}>{labels.technicalNote}</Text>
        </>
      ) : null}
    </View>
  );
}
