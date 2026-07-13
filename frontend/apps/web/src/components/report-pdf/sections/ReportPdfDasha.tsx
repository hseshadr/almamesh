/**
 * ReportPdfDasha — the Vimshottari daśā timeline: a brass-marked "current period"
 * card (Maha · Antar · Pratyantar), the nine maha-daśā rows with dated spans, and
 * the antar-daśā drill-down of EVERY mahā (the definitive reference tables; the
 * running antar stays brass-marked inside its mahā). All dates/spans arrive
 * pre-formatted (epoch-safe) on `ReportPdfData` — no recomputation here.
 */

import type { ReactElement } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { styles } from '../theme';
import type {
  ReportPdfAntarTable,
  ReportPdfData,
  ReportPdfDashaPeriod,
} from '../types';
import { ReportPdfHeading } from './ReportPdfHeading';

interface ReportPdfDashaProps {
  readonly data: ReportPdfData;
}

interface ReportPdfDashaTablesProps {
  readonly tables: readonly ReportPdfAntarTable[];
}

const TABLE_UNITS_PER_PAGE = 2;

function tableUnits(table: ReportPdfAntarTable): number {
  return table.pratyantarTable ? 2 : 1;
}

export function planDashaTablePages(
  tables: readonly ReportPdfAntarTable[],
): readonly (readonly ReportPdfAntarTable[])[] {
  const pages: ReportPdfAntarTable[][] = [];
  let page: ReportPdfAntarTable[] = [];
  let units = 0;

  for (const table of tables) {
    const nextUnits = tableUnits(table);
    if (page.length > 0 && units + nextUnits > TABLE_UNITS_PER_PAGE) {
      pages.push(page);
      page = [];
      units = 0;
    }
    page.push(table);
    units += nextUnits;
  }
  if (page.length > 0) pages.push(page);
  return pages;
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

function PeriodTable({
  heading,
  periods,
}: {
  heading: string;
  periods: readonly ReportPdfDashaPeriod[];
}): ReactElement {
  const [first, ...remaining] = periods;
  return (
    <View>
      <View wrap={false}>
        <Text style={styles.subLabel}>{heading}</Text>
        {first ? <PeriodRow period={first} /> : null}
      </View>
      {remaining.map((period) => (
        <PeriodRow key={`${heading}-${period.lord}-${period.start}`} period={period} />
      ))}
    </View>
  );
}

export function ReportPdfDashaOverview({ data }: ReportPdfDashaProps): ReactElement {
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
    </View>
  );
}

export function ReportPdfDashaTables({ tables }: ReportPdfDashaTablesProps): ReactElement {
  return (
    <View wrap={false}>
      {tables.map((table) => (
        <View key={table.heading} wrap={false}>
          <PeriodTable heading={table.heading} periods={table.periods} />
          {table.pratyantarTable ? (
            <PeriodTable
              heading={table.pratyantarTable.heading}
              periods={table.pratyantarTable.periods}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}
