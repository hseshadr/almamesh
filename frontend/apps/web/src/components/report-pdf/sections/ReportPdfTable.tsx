/**
 * ReportPdfTable — the shared engraved-table primitive for the comprehensive
 * sections: a repeated header row (react-pdf `fixed`, so the header re-renders
 * at the top of every page a long table breaks across), zebra rows that never
 * split mid-row (`wrap={false}`), optional per-column flex weights, and an
 * `emphasis` row treatment (brass ink) for totals / running rows.
 *
 * Pure presentation over a pre-formatted `ReportPdfTable` — no data logic.
 */

import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { palette, styles, type as typeScale, FONT_BODY } from '../theme';
import type { ReportPdfTable as ReportPdfTableData } from '../types';

const local = StyleSheet.create({
  cell: {
    fontSize: typeScale.caption,
    color: palette.ink,
    paddingRight: 6,
  },
  cellEmphasis: {
    fontSize: typeScale.caption,
    fontFamily: FONT_BODY,
    fontWeight: 600,
    color: palette.brassDeep,
    paddingRight: 6,
  },
  headCell: {
    paddingRight: 6,
  },
  rowEmphasis: {
    backgroundColor: '#FDFBF5',
    borderTopWidth: 1,
    borderTopColor: palette.ruleStrong,
  },
});

interface ReportPdfTableProps {
  readonly table: ReportPdfTableData;
  /** Repeat the header when the table breaks across pages (default true). */
  readonly repeatHeader?: boolean;
}

/** Flex weight for column `index` (equal columns unless widths are given). */
function flexOf(table: ReportPdfTableData, index: number): number {
  return table.widths?.[index] ?? 1;
}

/** A pre-formatted table in the report's engraved style. */
export function ReportPdfTable({ table, repeatHeader = true }: ReportPdfTableProps): ReactElement {
  const lastIndex = table.rows.length - 1;
  return (
    <View style={styles.table}>
      <View style={styles.tableHead} fixed={repeatHeader}>
        {table.headers.map((header, index) => (
          <Text
            key={`${header}-${index}`}
            style={[styles.tableHeadCell, local.headCell, { flex: flexOf(table, index) }]}
          >
            {header}
          </Text>
        ))}
      </View>
      {table.rows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          wrap={false}
          style={[
            rowIndex === lastIndex ? styles.tableRowLast : styles.tableRow,
            ...(rowIndex % 2 === 1 && !row.emphasis ? [styles.tableRowAlt] : []),
            ...(row.emphasis ? [local.rowEmphasis] : []),
          ]}
        >
          {row.cells.map((cell, cellIndex) => (
            <Text
              key={cellIndex}
              style={[row.emphasis ? local.cellEmphasis : local.cell, { flex: flexOf(table, cellIndex) }]}
            >
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}
