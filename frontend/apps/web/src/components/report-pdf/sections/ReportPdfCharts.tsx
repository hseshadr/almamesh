/**
 * ReportPdfCharts — the kundli page: the D1 Rāśi and (when present) the D9
 * Navāṁśa, each in a framed paper plate, drawn as true vectors by
 * `ReportPdfKundli`. A planet legend (glyph → name, in engine accent ink) keys
 * the two-letter abbreviations used inside the cells.
 */

import type { ReactElement } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { styles } from '../theme';
import type { ReportPdfData } from '../types';
import { ReportPdfHeading } from './ReportPdfHeading';
import { ReportPdfKundli } from './ReportPdfKundli';

interface ReportPdfChartsProps {
  readonly data: ReportPdfData;
}

const PLATE_SIZE = 200;

/** The legend keys the in-cell two-letter abbreviations to planet names. */
function PlanetLegend({ data }: { data: ReportPdfData }): ReactElement {
  return (
    <View style={styles.chartLegend}>
      {data.planets
        .filter((row) => row.glyph !== '')
        .map((row) => (
          <View key={row.name} style={styles.legendItem}>
            <Text style={[styles.legendSwatchText, { color: row.color }]}>{row.glyph}</Text>
            <Text style={styles.legendName}>{row.name}</Text>
          </View>
        ))}
    </View>
  );
}

export function ReportPdfCharts({ data }: ReportPdfChartsProps): ReactElement {
  const { charts, labels } = data;
  return (
    <View>
      <ReportPdfHeading
        eyebrow={labels.chartsEyebrow}
        title={labels.chartsTitle}
        intro={labels.chartsIntro}
      />
      <View style={styles.chartsRow}>
        <View style={styles.chartPlate}>
          <Text style={styles.chartCaption}>{charts.rasiCaption}</Text>
          <View style={styles.chartFrame}>
            <ReportPdfKundli geometry={charts.rasi} size={PLATE_SIZE} />
          </View>
        </View>
        {charts.navamsa ? (
          <View style={styles.chartPlate}>
            <Text style={styles.chartCaption}>{charts.navamsaCaption}</Text>
            <View style={styles.chartFrame}>
              <ReportPdfKundli geometry={charts.navamsa} size={PLATE_SIZE} />
            </View>
          </View>
        ) : null}
      </View>
      <PlanetLegend data={data} />
    </View>
  );
}
