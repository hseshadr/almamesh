/**
 * ReportPdfYogas — the engine's yoga formations, each a self-contained card with
 * its name, a category·grade chip, the descriptive sentence, and a mono
 * planetary-signature footer. Cards `wrap={false}` so a single yoga never splits
 * across a page break (react-pdf paginates the flow — no CSS `break-inside` bug).
 */

import type { ReactElement } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { styles } from '../theme';
import type { ReportPdfData, ReportPdfYoga } from '../types';
import { ReportPdfHeading } from './ReportPdfHeading';

interface ReportPdfYogasProps {
  readonly data: ReportPdfData;
}

function YogaCard({ yoga }: { yoga: ReportPdfYoga }): ReactElement {
  return (
    <View style={styles.yogaCard} wrap={false}>
      <View style={styles.yogaHead}>
        <Text style={styles.yogaName}>{yoga.name}</Text>
        <Text style={styles.yogaChip}>{yoga.classification}</Text>
      </View>
      <Text style={styles.yogaDesc}>{yoga.description}</Text>
      {yoga.signature ? <Text style={styles.yogaSignature}>{yoga.signature}</Text> : null}
    </View>
  );
}

export function ReportPdfYogas({ data }: ReportPdfYogasProps): ReactElement {
  const { yogas, labels } = data;
  return (
    <View>
      <ReportPdfHeading
        eyebrow={labels.yogasEyebrow}
        title={labels.yogasTitle}
        intro={labels.yogasIntro}
      />
      {yogas.map((yoga, index) => (
        <YogaCard key={`${index}-${yoga.name}-${yoga.signature}`} yoga={yoga} />
      ))}
    </View>
  );
}
