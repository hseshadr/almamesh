/**
 * ReportPdfStrength — Section X: Planetary Strength. The SAV per-sign bindu
 * grid (canonical 337 total in the heading), the Bhinnāṣṭakavarga sign × graha
 * bindu matrix closed by an emphasised totals row, and the Ṣaḍbala table with
 * all six classical components (virūpas) beside the rūpa totals + verdict —
 * all pre-formatted on `ReportPdfStrength`. Pure presentation.
 */

import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { palette, styles, type as typeScale, FONT_MONO } from '../theme';
import type { ReportPdfData } from '../types';
import { ReportPdfHeading } from './ReportPdfHeading';
import { ReportPdfTable } from './ReportPdfTable';

const local = StyleSheet.create({
  savGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
    borderWidth: 0.5,
    borderColor: palette.rule,
    borderRadius: 4,
    overflow: 'hidden',
  },
  savCell: {
    width: '16.666%',
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderRightWidth: 0.5,
    borderRightColor: palette.rule,
    borderBottomWidth: 0.5,
    borderBottomColor: palette.rule,
    backgroundColor: palette.card,
  },
  savSign: {
    fontFamily: FONT_MONO,
    fontSize: typeScale.micro,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: palette.muted,
    marginBottom: 2,
  },
  savValue: {
    fontFamily: FONT_MONO,
    fontSize: typeScale.small,
    color: palette.ink,
  },
});

interface ReportPdfStrengthProps {
  readonly data: ReportPdfData;
}

export function ReportPdfStrength({ data }: ReportPdfStrengthProps): ReactElement | null {
  const strength = data.strength;
  if (!strength) {
    return null;
  }
  return (
    <View>
      <ReportPdfHeading
        eyebrow={strength.chrome.eyebrow}
        title={strength.chrome.title}
        intro={strength.chrome.intro}
      />

      <Text style={styles.subLabel}>{strength.savHeading}</Text>
      <View style={local.savGrid} wrap={false}>
        {strength.savCells.map((cell) => (
          <View key={cell.label} style={local.savCell}>
            <Text style={local.savSign}>{cell.label}</Text>
            <Text style={local.savValue}>{cell.value}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.subLabel}>{strength.bavHeading}</Text>
      <ReportPdfTable table={strength.bav} />

      <Text style={styles.subLabel}>{strength.shadbalaHeading}</Text>
      <ReportPdfTable table={strength.shadbala} />
      <Text style={styles.detailNote}>{strength.componentsNote}</Text>
      {strength.approxNote ? <Text style={styles.detailNote}>{strength.approxNote}</Text> : null}
      <Text style={styles.detailNote}>{strength.sunriseNote}</Text>
    </View>
  );
}
