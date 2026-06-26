/**
 * ReportPdfHeading — the shared section header (mono eyebrow + Fraunces title +
 * brass rule + optional intro). Every content section opens with it so the report
 * reads as one cohesive monograph.
 */

import type { ReactElement } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { styles } from '../theme';

interface ReportPdfHeadingProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly intro?: string;
}

export function ReportPdfHeading({ eyebrow, title, intro }: ReportPdfHeadingProps): ReactElement {
  return (
    // Widow control: keep the eyebrow + title + rule + intro together (they never
    // split), and reserve ~120pt of space AHEAD so a section header is never the
    // last thing on a page, orphaned from the body it introduces. If less than
    // that remains, the whole header moves to the next page with its content.
    <View style={styles.sectionHead} wrap={false} minPresenceAhead={120}>
      <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionRule} />
      {intro ? <Text style={styles.sectionIntro}>{intro}</Text> : null}
    </View>
  );
}
