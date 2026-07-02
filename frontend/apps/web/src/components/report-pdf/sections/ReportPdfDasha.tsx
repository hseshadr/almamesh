/**
 * ReportPdfDasha — the Vimshottari daśā timeline: a brass-marked "current period"
 * card (Maha · Antar · Pratyantar), the nine maha-daśā rows with dated spans, and
 * the antar-daśā drill-down of EVERY mahā (the definitive reference tables; the
 * running antar stays brass-marked inside its mahā). All dates/spans arrive
 * pre-formatted (epoch-safe) on `ReportPdfDasha` — no recomputation here.
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

      {/* Antar-daśās of every mahā, in mahā order (empty on older payloads). */}
      {dasha.antarTables.map((table) => (
        <View key={table.heading}>
          <Text style={styles.subLabel}>{table.heading}</Text>
          <View>
            {table.periods.map((period) => (
              <PeriodRow key={`${table.heading}-${period.lord}-${period.start}`} period={period} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
