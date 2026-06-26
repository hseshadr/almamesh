/**
 * ReportPdfPlanets — the planetary-positions table (all 9 grahas + the Lagna).
 *
 * An immaculate engraved table: a brass-chip planet glyph, the sign, a mono
 * tabular-figure degree readout (with an ASCII "(R)" retrograde mark), the
 * nakshatra + pada, the whole-sign house, and the dignity. Combust planets dim.
 * All values arrive pre-formatted on `ReportPdfPlanetRow` — no recomputation.
 */

import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { styles } from '../theme';
import type { ReportPdfData, ReportPdfPlanetRow } from '../types';
import { ReportPdfHeading } from './ReportPdfHeading';

// Small local style atoms (typed Style) so style arrays never carry `null` —
// react-pdf's style typing rejects `null` in a composed array position.
const local = StyleSheet.create({
  empty: {},
  degreeCellLayout: { flexDirection: 'row', alignItems: 'baseline' },
});
const empty = local.empty;
const degreeCellLayout = local.degreeCellLayout;

interface ReportPdfPlanetsProps {
  readonly data: ReportPdfData;
}

function HeaderRow({ data }: { data: ReportPdfData }): ReactElement {
  const { labels } = data;
  return (
    <View style={styles.tableHead}>
      <Text style={[styles.tableHeadCell, styles.colPlanet]}>{labels.colPlanet}</Text>
      <Text style={[styles.tableHeadCell, styles.colSign]}>{labels.colSign}</Text>
      <Text style={[styles.tableHeadCell, styles.colDegree]}>{labels.colDegree}</Text>
      <Text style={[styles.tableHeadCell, styles.colNakshatra]}>{labels.colNakshatra}</Text>
      <Text style={[styles.tableHeadCell, styles.colHouse]}>{labels.colHouse}</Text>
      <Text style={[styles.tableHeadCell, styles.colDignity]}>{labels.colDignity}</Text>
    </View>
  );
}

function PlanetRow({
  row,
  alt,
  last,
}: {
  row: ReportPdfPlanetRow;
  alt: boolean;
  last: boolean;
}): ReactElement {
  const isLagna = row.glyph === '';
  const base = last ? styles.tableRowLast : styles.tableRow;
  const rowStyle = [
    base,
    ...(alt && !isLagna ? [styles.tableRowAlt] : []),
    ...(isLagna ? [styles.tableRowLagna] : []),
  ];
  const dim = row.isCombust ? styles.rowDim : empty;

  return (
    <View style={rowStyle} wrap={false}>
      <View style={[styles.colPlanet, dim]}>
        {row.glyph ? (
          <View style={[styles.glyphChip, { backgroundColor: row.color }]}>
            <Text style={styles.glyphChipText}>{row.glyph}</Text>
          </View>
        ) : null}
        <Text style={styles.cellName}>{row.name}</Text>
      </View>
      <Text style={[styles.cellSign, styles.colSign, dim]}>{row.sign}</Text>
      <View style={[styles.colDegree, degreeCellLayout, dim]}>
        <Text style={styles.cellMono}>{row.degree}</Text>
        {row.isRetrograde ? <Text style={styles.cellRetro}> (R)</Text> : null}
      </View>
      <Text style={[styles.cellNak, styles.colNakshatra, dim]}>{row.nakshatra}</Text>
      <Text style={[styles.cellMonoCenter, styles.colHouse, dim]}>{row.house}</Text>
      <Text style={[styles.cellDignity, styles.colDignity, dim]}>{row.dignity}</Text>
    </View>
  );
}

export function ReportPdfPlanets({ data }: ReportPdfPlanetsProps): ReactElement {
  const { planets, labels } = data;
  return (
    <View>
      <ReportPdfHeading
        eyebrow={labels.planetsEyebrow}
        title={labels.planetsTitle}
        intro={labels.planetsIntro}
      />
      <View style={styles.table}>
        <HeaderRow data={data} />
        {planets.map((row, index) => (
          <PlanetRow
            key={row.name}
            row={row}
            alt={index % 2 === 1}
            last={index === planets.length - 1}
          />
        ))}
      </View>
    </View>
  );
}
