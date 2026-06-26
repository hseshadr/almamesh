/**
 * ReportPdfDasha — the Vimshottari daśā timeline: a brass-marked "current period"
 * card (Maha · Antar · Pratyantar), the nine maha-daśā rows with dated spans, and
 * the running antar's sub-periods. All dates/spans arrive pre-formatted
 * (epoch-safe) on `ReportPdfDasha` — no recomputation in the PDF layer.
 */

import type { ReactElement } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { styles } from '../theme';
import type { ReportPdfData, ReportPdfDashaPeriod } from '../types';
import { ReportPdfHeading } from './ReportPdfHeading';

interface ReportPdfDashaProps {
  readonly data: ReportPdfData;
}

function PeriodRow({ period }: { period: ReportPdfDashaPeriod }): ReactElement {
  return (
    <View style={styles.dashaRow} wrap={false}>
      <View style={period.isCurrent ? styles.dashaTickCurrent : styles.dashaTick} />
      <Text style={period.isCurrent ? styles.dashaLordCurrent : styles.dashaLord}>
        {period.lord}
      </Text>
      <Text style={styles.dashaSpan}>
        {period.start} — {period.end}
      </Text>
      <Text style={styles.dashaYears}>{period.span}</Text>
    </View>
  );
}

export function ReportPdfDasha({ data }: ReportPdfDashaProps): ReactElement {
  const { dasha, labels } = data;
  return (
    <View>
      <ReportPdfHeading
        eyebrow={labels.dashaEyebrow}
        title={labels.dashaTitle}
        intro={labels.dashaIntro}
      />

      {dasha.currentFocus ? (
        <View style={styles.dashaCurrent} wrap={false}>
          <Text style={styles.dashaCurrentLabel}>{labels.dashaCurrentLabel}</Text>
          <Text style={styles.dashaCurrentValue}>{dasha.currentFocus}</Text>
        </View>
      ) : null}

      <Text style={styles.subLabel}>{labels.dashaSequenceLabel}</Text>
      <View>
        {dasha.mahaSequence.map((period) => (
          <PeriodRow key={`${period.lord}-${period.start}`} period={period} />
        ))}
      </View>

      {dasha.currentAntars.length > 0 ? (
        <>
          <Text style={styles.subLabel}>{labels.dashaAntarLabel}</Text>
          <View>
            {dasha.currentAntars.map((period) => (
              <PeriodRow key={`antar-${period.lord}-${period.start}`} period={period} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}
