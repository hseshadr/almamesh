/**
 * ReportPdfPlanets — the planetary-positions table (all 9 grahas + the Lagna).
 *
 * An immaculate engraved table: a brass-chip planet glyph, the sign, a mono
 * tabular-figure degree readout (with an ASCII "(R)" retrograde mark), the
 * nakshatra + pada, the whole-sign house, the dignity, and the STATE (retro /
 * combust, with the measured separation). All values arrive pre-formatted on
 * `ReportPdfPlanetRow` — no recomputation.
 *
 * The State column is load-bearing. Combustion used to be encoded here as
 * `opacity: 0.55` and nothing else, so a combust Venus printed "EXALTED" and the
 * exported table said nothing about the engine's own `is_combust` — a fact
 * carried only by opacity survives neither text extraction, nor a screen reader,
 * nor greyscale printing. The dimming stays as a REDUNDANT cue.
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
      <Text style={[styles.tableHeadCell, styles.colState]}>{labels.colState}</Text>
    </View>
  );
}

/**
 * The State cell: combustion first, so the row's OWN baseline carries it (a
 * wrapped second line extracts as a separate line with no planet name on it),
 * then the retrograde word. Empty for a calm graha.
 */
function StateCell({
  row,
  labels,
}: {
  row: ReportPdfPlanetRow;
  labels: ReportPdfData['labels'];
}): ReactElement {
  return (
    <View style={[styles.colState, row.isCombust ? styles.rowDim : empty]}>
      {row.combustion ? <Text style={styles.cellState}>{row.combustion}</Text> : null}
      {row.isRetrograde ? <Text style={styles.cellState}>{labels.stateRetrograde}</Text> : null}
    </View>
  );
}

function PlanetRow({
  row,
  labels,
  alt,
  last,
}: {
  row: ReportPdfPlanetRow;
  labels: ReportPdfData['labels'];
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
      <StateCell row={row} labels={labels} />
    </View>
  );
}

export function ReportPdfPlanets({ data }: ReportPdfPlanetsProps): ReactElement {
  const { planets, labels, combustionNotes } = data;
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
            labels={labels}
            alt={index % 2 === 1}
            last={index === planets.length - 1}
          />
        ))}
      </View>
      {/* The checkable arithmetic behind each "Combust": the measured separation
          from the Sun AND the classical orb it was tested against. One line per
          graha, full width, so a figure never wraps away from its planet. */}
      {(combustionNotes ?? []).map((note) => (
        <Text key={note} style={styles.combustionNote}>
          {note}
        </Text>
      ))}
    </View>
  );
}
